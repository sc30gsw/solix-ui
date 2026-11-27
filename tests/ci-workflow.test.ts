import { relative, resolve } from "node:path";
import { expect, test } from "vite-plus/test";
import { staticStorybookDirectory } from "#/apps/storybook/tests/support/test-servers.ts";
import { newestReleasesCheck } from "#/tests/support/release-checks.ts";
import {
  actionOf,
  catalogVitePlus,
  gateJobProblems,
  permissionsLeftOut,
  secretsNamedIn,
  type Step,
  vitePlusVersionProblems,
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
  if (name === undefined) return [`no job runs ${newestReleasesCheck}.`];
  const others = Object.keys(workflow.jobs ?? {}).filter((other) => other !== name);
  return [
    ...pullRequestTriggerProblems(workflow.on),
    ...others.map(
      (other) =>
        `the workflow of the ${name} job also holds the ${other} job; give the ${name} job a workflow of its own.`,
    ),
    ...gateJobProblems(workflow, name, newestReleasesCheck),
  ];
}

function newestCheckProblemsIn(workflows: Record<string, Workflow>): string[] {
  const found = Object.entries(workflows).flatMap(([file, workflow]) =>
    jobsRunningTheNewestCheck(workflow).map((name) => ({ file, name })),
  );
  if (found.length === 0) {
    return [
      `no job of a workflow that runs on ${pullRequestEvent} runs ${newestReleasesCheck}; give one job a workflow of its own that runs it.`,
    ];
  }
  if (found.length > 1) {
    return [
      `${found.length} jobs of the workflows that run on ${pullRequestEvent} run ${newestReleasesCheck}, not one: ${found.map(({ file, name }) => `${file}: ${name}`).join(", ")}.`,
    ];
  }
  const [{ file }] = found;
  return newestCheckProblems(workflows[file]).map((problem) => `${file}: ${problem}`);
}

function theWorkflows(): Record<string, Workflow> {
  return Object.fromEntries(workflowFiles.map((file) => [file, workflowAt(file)]));
}

test(`on every pull request, at its opening, at each push and at its reopening, one job, in a workflow of its own, runs ${newestReleasesCheck} and fails the run when the check fails: the pull_request trigger sets only types, the workflow sets only name, on, permissions and jobs, the job sets only runs-on, timeout-minutes, steps and permissions, which only read, its steps are exactly the checkout, the setup and the check, setting nothing else but a name, and nothing reads a secret`, () => {
  expect(newestCheckProblemsIn(theWorkflows())).toEqual([]);
});

test(`${ciWorkflow}, which holds no gate job, may set concurrency with cancel-in-progress, env, defaults and run-name at the workflow level`, () => {
  const workflows = theWorkflows();
  const ci = {
    ...workflows[ciWorkflow],
    "run-name": "CI for ${{ github.ref_name }}",
    concurrency: { group: "ci-${{ github.ref }}", "cancel-in-progress": true },
    env: { FORCE_COLOR: "1" },
    defaults: { run: { shell: "bash" } },
  };

  expect(newestCheckProblemsIn({ ...workflows, [ciWorkflow]: ci })).toEqual([]);
});

const check = { run: newestReleasesCheck };
const checkout = { uses: "actions/checkout@v7", with: { "fetch-depth": 0 } };
const pinned = catalogVitePlus();
const setUpVp = {
  uses: "voidzero-dev/setup-vp@v1.22.0",
  with: { "node-version-file": "package.json", cache: true, version: pinned },
};
const readOnly = { contents: "read" };
const gate = { "runs-on": "ubuntu-latest", "timeout-minutes": 10 };

function aWorkflow(changes: {
  on?: unknown;
  workflow?: object;
  job?: object;
  step?: object;
  steps?: Step[];
}): Workflow {
  return {
    on: changes.on ?? { pull_request: null },
    permissions: readOnly,
    ...changes.workflow,
    jobs: {
      a: {
        ...gate,
        ...changes.job,
        steps: changes.steps ?? [checkout, setUpVp, { ...check, ...changes.step }],
      },
    },
  };
}

const setUpWith = JSON.stringify(setUpVp.with);
const gateSteps = `actions/checkout with {"fetch-depth":0} and, if it likes, {"persist-credentials":false}, voidzero-dev/setup-vp with ${setUpWith}, then run ${newestReleasesCheck}, each setting nothing else but a name`;

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
    aWorkflow({ steps: [checkout, setUpVp, check, check] }),
    `the a job has 4 steps, not 3; a gate job's steps are exactly ${gateSteps}.`,
  ],
  [
    "a step before the check that puts a node that exits 0 first on the PATH",
    aWorkflow({
      steps: [
        checkout,
        setUpVp,
        {
          run: 'mkdir -p "$RUNNER_TEMP/bin" && printf \'#!/bin/sh\\nexit 0\\n\' > "$RUNNER_TEMP/bin/node" && chmod +x "$RUNNER_TEMP/bin/node" && echo "$RUNNER_TEMP/bin" >> "$GITHUB_PATH"',
        },
        check,
      ],
    }),
    `the a job has 4 steps, not 3; a gate job's steps are exactly ${gateSteps}.`,
  ],
  [
    "a step before the check that rewrites the check's script",
    aWorkflow({
      steps: [
        checkout,
        setUpVp,
        { run: "sed -i '1i process.exit(0);' scripts/check-newest-releases.ts" },
        check,
      ],
    }),
    `the a job has 4 steps, not 3; a gate job's steps are exactly ${gateSteps}.`,
  ],
  [
    "a check step whose failure is ignored",
    aWorkflow({ step: { run: `${newestReleasesCheck} || true` } }),
    `no job runs ${newestReleasesCheck}.`,
  ],
  [
    "the check run before the setup",
    aWorkflow({ steps: [checkout, check, setUpVp] }),
    `step 2 of the a job sets run; a gate job's steps are exactly ${gateSteps}.`,
  ],
  [
    "a step before the check that sets NODE_OPTIONS for the steps after it",
    aWorkflow({
      steps: [
        checkout,
        setUpVp,
        {
          run: 'echo "NODE_OPTIONS=--import=data:text/javascript,process.exit(0)" >> "$GITHUB_ENV"',
        },
        check,
      ],
    }),
    `the a job has 4 steps, not 3; a gate job's steps are exactly ${gateSteps}.`,
  ],
  [
    "a checkout of the base branch instead of the pull request",
    aWorkflow({
      steps: [
        { ...checkout, with: { ...checkout.with, ref: "${{ github.base_ref }}" } },
        setUpVp,
        check,
      ],
    }),
    `step 1 of the a job has with {"fetch-depth":0,"ref":"\${{ github.base_ref }}"}, not {"fetch-depth":0}; a gate job's steps are exactly ${gateSteps}.`,
  ],
  [
    "a checkout that keeps its credentials",
    aWorkflow({
      steps: [
        { ...checkout, with: { ...checkout.with, "persist-credentials": true } },
        setUpVp,
        check,
      ],
    }),
    `step 1 of the a job has with {"fetch-depth":0,"persist-credentials":true}, not {"fetch-depth":0}; a gate job's steps are exactly ${gateSteps}.`,
  ],
  [
    "a setup step that leaves out version",
    aWorkflow({
      steps: [
        checkout,
        { ...setUpVp, with: { "node-version-file": "package.json", cache: true } },
        check,
      ],
    }),
    `step 2 of the a job sets up Vite+ with no version; give it version ${JSON.stringify(pinned)}, the vite-plus release the catalog pins.`,
  ],
  [
    "a setup step that installs another vite-plus release",
    aWorkflow({
      steps: [checkout, { ...setUpVp, with: { ...setUpVp.with, version: "0.0.1" } }, check],
    }),
    `step 2 of the a job sets up Vite+ with version "0.0.1"; give it version ${JSON.stringify(pinned)}, the vite-plus release the catalog pins.`,
  ],
  [
    "a setup step that sets another input",
    aWorkflow({
      steps: [checkout, { ...setUpVp, with: { ...setUpVp.with, "run-install": false } }, check],
    }),
    `step 2 of the a job has with ${JSON.stringify({ ...setUpVp.with, "run-install": false })}, not ${setUpWith}; a gate job's steps are exactly ${gateSteps}.`,
  ],
  [
    "the setup step left out",
    aWorkflow({ steps: [checkout, check] }),
    `the a job has 2 steps, not 3; a gate job's steps are exactly ${gateSteps}.`,
  ],
  [
    "a gate job beside another job in its workflow",
    {
      ...aWorkflow({}),
      jobs: { ...aWorkflow({}).jobs, b: { ...gate, steps: [{ run: "true" }] } },
    },
    "the workflow of the a job also holds the b job; give the a job a workflow of its own.",
  ],
  [
    "a run-name",
    aWorkflow({ workflow: { "run-name": "Check ${{ github.ref_name }}" } }),
    "the workflow of the a job sets run-name; a gate job's workflow sets only name, on, permissions, jobs.",
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
    {
      ...aWorkflow({}),
      jobs: { a: { "runs-on": "ubuntu-latest", steps: [checkout, setUpVp, check] } },
    },
    "give the a job timeout-minutes, so a hung step ends.",
  ],
  [
    "a workflow whose default shell runs nothing",
    aWorkflow({ workflow: { defaults: { run: { shell: "true {0}" } } } }),
    "the workflow of the a job sets defaults; a gate job's workflow sets only name, on, permissions, jobs.",
  ],
  [
    "a workflow env that reads the private-term list",
    aWorkflow({ workflow: { env: { T: "${{ secrets.SOLIX_PRIVATE_TERMS }}" } } }),
    "the workflow of the a job sets env; a gate job's workflow sets only name, on, permissions, jobs.",
  ],
  [
    "a step that may fail",
    aWorkflow({ step: { "continue-on-error": true } }),
    `step 3 of the a job sets continue-on-error; a gate job's steps are exactly ${gateSteps}.`,
  ],
  [
    "a step whose shell runs nothing",
    aWorkflow({ step: { shell: "true {0}" } }),
    `step 3 of the a job sets shell; a gate job's steps are exactly ${gateSteps}.`,
  ],
  [
    "a step whose NODE_OPTIONS exits before the check",
    aWorkflow({ step: { env: { NODE_OPTIONS: "--import=data:text/javascript,process.exit(0)" } } }),
    `step 3 of the a job sets env; a gate job's steps are exactly ${gateSteps}.`,
  ],
  [
    "no permissions written out",
    { on: { pull_request: null }, jobs: { a: { ...gate, steps: [checkout, setUpVp, check] } } },
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

const rightRuns: [what: string, workflow: Workflow][] = [
  [
    "a setup step that gives cache before node-version-file",
    aWorkflow({
      steps: [
        checkout,
        { ...setUpVp, with: { version: pinned, cache: true, "node-version-file": "package.json" } },
        check,
      ],
    }),
  ],
  [
    "a checkout that keeps no credentials",
    aWorkflow({
      steps: [
        { ...checkout, with: { ...checkout.with, "persist-credentials": false } },
        setUpVp,
        check,
      ],
    }),
  ],
  [
    "an action named in another case",
    aWorkflow({ steps: [{ ...checkout, uses: "Actions/Checkout@v7" }, setUpVp, check] }),
  ],
];

test("every step of every workflow that sets up Vite+ installs the vite-plus release the catalog pins, so a script that a job runs with plain Node asks the vp that the repository installs", () => {
  expect(
    workflowFiles.flatMap((file) =>
      vitePlusVersionProblems(workflowAt(file)).map((problem) => `${file}: ${problem}`),
    ),
  ).toEqual([]);
});

const unpinnedSetUps: [what: string, step: Step, problem: string][] = [
  [
    "no version",
    { uses: "voidzero-dev/setup-vp@v1.22.0", with: { cache: true } },
    `step 1 of the a job sets up Vite+ with no version; give it version ${JSON.stringify(pinned)}, the vite-plus release the catalog pins.`,
  ],
  [
    "another version",
    { uses: "Voidzero-Dev/Setup-Vp@v1.22.0", with: { version: "0.0.1" } },
    `step 1 of the a job sets up Vite+ with version "0.0.1"; give it version ${JSON.stringify(pinned)}, the vite-plus release the catalog pins.`,
  ],
];

test.for(unpinnedSetUps)(
  "the vite-plus version rule, on a setup step with %s, refuses it",
  ([, step, problem]) => {
    expect(vitePlusVersionProblems({ jobs: { a: { steps: [step] } } })).toEqual([problem]);
  },
);

test.for(rightRuns)("the pull-request newest-release rule, on %s, allows it", ([, workflow]) => {
  expect(newestCheckProblems(workflow)).toEqual([]);
});

test("the pull-request newest-release rule says so plainly when no job runs the check", () => {
  expect(newestCheckProblemsIn({ [ciWorkflow]: { on: { pull_request: null }, jobs: {} } })).toEqual(
    [
      `no job of a workflow that runs on ${pullRequestEvent} runs ${newestReleasesCheck}; give one job a workflow of its own that runs it.`,
    ],
  );
});

test.for(wrongRuns)(
  "the pull-request newest-release rule, on %s, refuses it",
  ([, workflow, problem]) => {
    expect(newestCheckProblems(workflow)).toContain(problem);
  },
);

test("a setup-vp step with both a wrong version and an extra input reports both problems", () => {
  const badWith = { ...setUpVp.with, version: "0.0.1", "run-install": false };
  const problems = newestCheckProblems(
    aWorkflow({ steps: [checkout, { ...setUpVp, with: badWith }, check] }),
  );
  expect(problems).toEqual([
    `step 2 of the a job has with ${JSON.stringify(badWith)}, not ${setUpWith}; a gate job's steps are exactly ${gateSteps}.`,
    `step 2 of the a job sets up Vite+ with version "0.0.1"; give it version ${JSON.stringify(pinned)}, the vite-plus release the catalog pins.`,
  ]);
});
