import {
  type FormArrayElement,
  type FormRulesRecord,
  type LooseKeys,
  FORM_INDEX,
  formRootRule,
  hasLength,
  isEmail,
  isNotEmpty,
  isUrl,
  matchesField,
  schemaResolver,
} from "@solix/form";

type Values = {
  name: string;
  email: string;
  confirmEmail: string;
  site: string;
  jobs: { title: string; tags: string[] }[];
};

export const rules: FormRulesRecord<Values> = {
  name: hasLength({ min: 2 }, "Too short"),
  email: isEmail("Invalid email"),
  confirmEmail: matchesField<Values>("email", "Emails differ"),
  site: isUrl({ allowLocalhost: true }),
  jobs: {
    title: isNotEmpty("Enter a title"),
    [formRootRule]: (jobs) => (jobs.length === 0 ? "Add a job" : null),
  },
};

export const watched: LooseKeys<Values>[] = ["name", "jobs.0.title", `jobs.${FORM_INDEX}.title`];

export const newJob: FormArrayElement<Values, "jobs"> = { title: "", tags: [] };

export const fromSchema = schemaResolver(
  { "~standard": { validate: () => ({ issues: [{ message: "Required", path: ["name"] }] }) } },
  { sync: true },
);
