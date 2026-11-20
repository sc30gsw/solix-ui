import { relative, resolve } from "node:path";
import { expect, test } from "vite-plus/test";
import { staticStorybookDirectory } from "#/apps/storybook/tests/support/test-servers.ts";
import {
  gateJobProblems,
  newestReleasesCheck,
  permissionsLeftOut,
  secretsNamedIn,
  type Step,
  type Workflow,
  workflowAt,
  writeScopes,
} from "#/tests/support/workflows.ts";
import { repositoryRoot, workflowFiles } from "#/tests/support/workspace.ts";

const ciWorkflow = ".github/workflows/ci.yml";
const verifyCommand = "vp run verify";
const uploadAction = "actions/upload-artifact";
const pullRequestEvent = "pull_request";
const runsDespiteAFailure = /\b(?:always|failure|cancelled)\s*\(/;
const secretsTheWorkflowsRead = ["SOLIX_PRIVATE_TERMS"];

function events(on: unknown): string[] {
  if (typeof on === "string") return [on];
  if (Array.isArray(on)) return on.map(String);
  return typeof on === "object" && on !== null ? Object.keys(on) : [];
}

function actionOf(step: Step): string | undefined {
  return step.uses?.split("@")[0];
}

test("on a pull request, once verify passes, the job that runs it uploads the Storybook static build that verify made, keeps it for a set number of days, and fails the step when there is none", () => {
  const { on, jobs = {} } = workflowAt(ciWorkflow);
  const verifying = Object.entries(jobs).filter(([, { steps = [] }]) =>
    steps.some((step) => step.run?.trim() === verifyCommand),
  );

  expect(events(on), `${ciWorkflow}: run the workflow on ${pullRequestEvent}`).toContain(
    pullRequestEvent,
  );
  expect(
    verifying.map(([name]) => name),
    `${ciWorkflow}: exactly one job runs ${verifyCommand}`,
  ).toHaveLength(1);
  const [name, { steps = [] }] = verifying[0];
  const verifyAt = steps.findIndex((step) => step.run?.trim() === verifyCommand);
  const uploads = steps.flatMap((step, index) =>
    actionOf(step) === uploadAction ? [{ step, index }] : [],
  );

  expect(
    uploads.map(({ index, step }) => ({
      afterVerify: index > verifyAt,
      path: resolve(repositoryRoot, String(step.with?.path)),
      ifNoFilesFound: step.with?.["if-no-files-found"],
      keptForDays: Number.isInteger(step.with?.["retention-days"])
        ? Number(step.with?.["retention-days"]) > 0
        : false,
      runsOnlyAfterSuccess: !runsDespiteAFailure.test(JSON.stringify(step.if ?? "")),
      continuesOnError: (step["continue-on-error"] ?? false) !== false,
    })),
    `${ciWorkflow}: the ${name} job uploads ${relative(repositoryRoot, staticStorybookDirectory)}, which verify builds, in one ${uploadAction} step after ${verifyCommand}, with if-no-files-found: error, a whole number of retention-days, an if that calls none of always(), failure() or cancelled(), so it runs only once verify passed, and no continue-on-error`,
  ).toEqual([
    {
      afterVerify: true,
      path: staticStorybookDirectory,
      ifNoFilesFound: "error",
      keptForDays: true,
      runsOnlyAfterSuccess: true,
      continuesOnError: false,
    },
  ]);
});

test("no job of any workflow can push to the repository or write to its pull requests or issues: each job's permissions, its own or its workflow's, are written out and grant nothing but read", () => {
  const violations = workflowFiles.flatMap((file) => {
    const { permissions, jobs = {} } = workflowAt(file);
    return Object.entries(jobs).flatMap(([name, job]) => {
      const given = job.permissions ?? permissions;
      if (given === undefined) {
        return [
          `${file}: the ${name} job takes the repository's default token permissions, which may write. Give the workflow or the job permissions that only read.`,
        ];
      }
      return writeScopes(given).map(
        (scope) =>
          `${file}: the ${name} job is given ${scope}. A check reads; it does not push, comment or label.`,
      );
    });
  });

  expect(workflowFiles.length).toBeGreaterThan(0);
  expect(violations).toEqual([]);
});

const everySecret = "inherit";

function secretsReadIn(workflow: Workflow): string[] {
  const inherited = Object.entries(workflow.jobs ?? {})
    .filter(([, job]) => job.secrets === everySecret)
    .map(([name]) => `the ${name} job hands every secret to the workflow it calls`);
  return [
    ...inherited,
    ...secretsNamedIn(workflow)
      .filter(({ name }) => name === undefined || !secretsTheWorkflowsRead.includes(name))
      .map(({ read }) => `it reads ${read}`),
  ];
}

test(`no workflow reads a secret but ${secretsTheWorkflowsRead.join(", ")}, by name, so no token that could write reaches a job`, () => {
  const violations = workflowFiles.flatMap((file) =>
    secretsReadIn(workflowAt(file)).map(
      (read) => `${file}: ${read}. Give a job no secret that could write.`,
    ),
  );

  expect(violations).toEqual([]);
});

const secretSpellings: [spelling: string, refused: boolean, workflow: Workflow][] = [
  [
    "the private-term list by name",
    false,
    { jobs: { a: { steps: [{ env: { TERMS: "${{ secrets.SOLIX_PRIVATE_TERMS }}" } }] } } },
  ],
  [
    "another secret by name",
    true,
    { jobs: { a: { steps: [{ env: { T: "${{ secrets.TOKEN }}" } }] } } },
  ],
  [
    "every secret at once",
    true,
    { jobs: { a: { steps: [{ env: { ALL: "${{ toJSON(secrets) }}" } }] } } },
  ],
  [
    "every secret handed to a called workflow",
    true,
    { jobs: { call: { uses: "./.github/workflows/called.yml", secrets: "inherit" } } },
  ],
  [
    "the private-term list handed to a called workflow by name",
    false,
    {
      jobs: {
        call: {
          uses: "./.github/workflows/called.yml",
          secrets: { SOLIX_PRIVATE_TERMS: "${{ secrets.SOLIX_PRIVATE_TERMS }}" },
        },
      },
    },
  ],
];

test.for(secretSpellings)("the secrets rule, on %s, refuses it: %s", ([, refused, workflow]) => {
  expect(secretsReadIn(workflow).length > 0).toBe(refused);
});

const pullRequestActivities = ["opened", "synchronize", "reopened"];
const keysOfAPullRequestTrigger = ["types"];

function pullRequestTriggerProblems(on: unknown): string[] {
  if (!events(on).includes(pullRequestEvent))
    return [`the workflow does not run on ${pullRequestEvent}.`];
  if (typeof on !== "object" || on === null || Array.isArray(on)) return [];
  const trigger: unknown = Reflect.get(on, pullRequestEvent);
  if (trigger === null || trigger === undefined) return [];
  if (typeof trigger !== "object")
    return [`${pullRequestEvent} is set to ${JSON.stringify(trigger)}.`];
  const narrowed = Object.keys(trigger)
    .filter((key) => !keysOfAPullRequestTrigger.includes(key))
    .map((key) => `${pullRequestEvent} sets ${key}, so some pull requests skip the check.`);
  const types: unknown = Reflect.get(trigger, "types");
  const missing =
    types === undefined
      ? []
      : pullRequestActivities
          .filter((activity) => !(Array.isArray(types) && types.includes(activity)))
          .map((activity) => `${pullRequestEvent} types leave out ${activity}.`);
  return [...narrowed, ...missing];
}

function jobsRunningTheNewestCheck(workflow: Workflow): string[] {
  if (!events(workflow.on).includes(pullRequestEvent)) return [];
  return Object.entries(workflow.jobs ?? {}).flatMap(([name, job]) =>
    (job.steps ?? []).some((step) => step.run?.trim() === newestReleasesCheck) ? [name] : [],
  );
}

function newestCheckProblems(workflow: Workflow): string[] {
  const [name] = jobsRunningTheNewestCheck(workflow);
  return name === undefined
    ? [`no job runs ${newestReleasesCheck}.`]
    : [
        ...pullRequestTriggerProblems(workflow.on),
        ...gateJobProblems(workflow, name, newestReleasesCheck),
      ];
}

test(`on every pull request, at its opening, at each push and at its reopening, one job runs ${newestReleasesCheck} in one step and fails the run when the check fails: the pull_request trigger sets only types, the workflow sets nothing that reaches its jobs but its permissions, the job sets only runs-on, timeout-minutes, steps and permissions, which only read, each step sets only uses, with, run and name, and nothing reads a secret`, () => {
  const found = workflowFiles.flatMap((file) =>
    jobsRunningTheNewestCheck(workflowAt(file)).map((name) => ({ file, name })),
  );

  expect(
    found.map(({ file, name }) => `${file}: ${name}`),
    `exactly one job of a workflow that runs on ${pullRequestEvent} runs ${newestReleasesCheck}`,
  ).toHaveLength(1);
  const [{ file }] = found;
  expect(newestCheckProblems(workflowAt(file)), file).toEqual([]);
});

const check = { run: newestReleasesCheck };
const readOnly = { contents: "read" };
const gate = { "runs-on": "ubuntu-latest", "timeout-minutes": 10 };

function aWorkflow(changes: {
  on?: unknown;
  workflow?: object;
  job?: object;
  step?: object;
}): Workflow {
  return {
    on: changes.on ?? { pull_request: null },
    permissions: readOnly,
    ...changes.workflow,
    jobs: { a: { ...gate, ...changes.job, steps: [{ ...check, ...changes.step }] } },
  };
}

const wrongRuns: [what: string, workflow: Workflow, problem: string][] = [
  [
    "pull_request types that leave out reopened",
    aWorkflow({ on: { pull_request: { types: ["opened", "synchronize"] } } }),
    "pull_request types leave out reopened.",
  ],
  [
    "pull_request paths",
    aWorkflow({ on: { pull_request: { paths: ["package.json"] } } }),
    "pull_request sets paths, so some pull requests skip the check.",
  ],
  [
    "pull_request branches",
    aWorkflow({ on: { pull_request: { branches: ["main"] } } }),
    "pull_request sets branches, so some pull requests skip the check.",
  ],
  [
    "the check run twice",
    { ...aWorkflow({}), jobs: { a: { ...gate, steps: [check, check] } } },
    `the a job runs ${newestReleasesCheck} in 2 steps, not in exactly one.`,
  ],
  [
    "a job that runs if always()",
    aWorkflow({ job: { if: "always()" } }),
    "the a job sets if; a gate job sets only runs-on, timeout-minutes, steps, permissions.",
  ],
  [
    "a job that needs another",
    aWorkflow({ job: { needs: "b" } }),
    "the a job sets needs; a gate job sets only runs-on, timeout-minutes, steps, permissions.",
  ],
  [
    "a job whose default shell runs nothing",
    aWorkflow({ job: { defaults: { run: { shell: "true {0}" } } } }),
    "the a job sets defaults; a gate job sets only runs-on, timeout-minutes, steps, permissions.",
  ],
  [
    "a job whose matrix excludes its one run",
    aWorkflow({
      job: { strategy: { matrix: { run: ["never"], exclude: [{ run: "never" }] } } },
    }),
    "the a job sets strategy; a gate job sets only runs-on, timeout-minutes, steps, permissions.",
  ],
  [
    "a job with no timeout",
    { ...aWorkflow({}), jobs: { a: { "runs-on": "ubuntu-latest", steps: [check] } } },
    "give the a job timeout-minutes, so a hung step ends.",
  ],
  [
    "a workflow whose default shell runs nothing",
    aWorkflow({ workflow: { defaults: { run: { shell: "true {0}" } } } }),
    "the workflow sets defaults, which reaches the a job.",
  ],
  [
    "a workflow env that reads the private-term list",
    aWorkflow({ workflow: { env: { T: "${{ secrets.SOLIX_PRIVATE_TERMS }}" } } }),
    "the workflow sets env, which reaches the a job.",
  ],
  [
    "a step that may fail",
    aWorkflow({ step: { "continue-on-error": true } }),
    "step 1 of the a job sets continue-on-error; a gate step sets only uses, with, run, name.",
  ],
  [
    "a step whose shell runs nothing",
    aWorkflow({ step: { shell: "true {0}" } }),
    "step 1 of the a job sets shell; a gate step sets only uses, with, run, name.",
  ],
  [
    "a step whose NODE_OPTIONS exits before the check",
    aWorkflow({ step: { env: { NODE_OPTIONS: "--import=data:text/javascript,process.exit(0)" } } }),
    "step 1 of the a job sets env; a gate step sets only uses, with, run, name.",
  ],
  [
    "no permissions written out",
    { on: { pull_request: null }, jobs: { a: { ...gate, steps: [check] } } },
    `the a job is given ${permissionsLeftOut}; a gate job only reads.`,
  ],
  [
    "a job that may write",
    aWorkflow({ job: { permissions: { contents: "write" } } }),
    "the a job is given contents: write; a gate job only reads.",
  ],
  [
    "the private-term list read in a step's with",
    aWorkflow({ step: { with: { T: "${{ secrets.SOLIX_PRIVATE_TERMS }}" } } }),
    "the a job reads secrets.SOLIX_PRIVATE_TERMS; a gate job reads no secret.",
  ],
];

test.for(wrongRuns)(
  "the pull-request newest-release rule, on %s, refuses it",
  ([, workflow, problem]) => {
    expect(newestCheckProblems(workflow)).toContain(problem);
  },
);
