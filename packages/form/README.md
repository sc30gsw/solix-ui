# @solix/form

Form state and validation for Solid 2.0. This first part holds the logic that needs no reactivity: the validators, `schemaResolver`, `formRootRule` and `FORM_INDEX`. `createForm` comes next.

## Quickstart

From the repository root, with the Vite+ CLI (`vp`). Without a global `vp`, put `pnpm exec` in front of each command.

```bash
vp install
vp run -r build
```

```ts
import { formRootRule, hasLength, isEmail, isNotEmpty } from "@solix/form";

const rules = {
  name: hasLength({ min: 2 }, "Name must have at least 2 letters"),
  email: isEmail("Invalid email"),
  jobs: {
    title: isNotEmpty("Enter a title"),
    [formRootRule]: (jobs: unknown[]) => (jobs.length === 0 ? "Add a job" : null),
  },
};
```

A validator returns `null` for a valid value and its error otherwise, `true` when no error is given.

## The rules this package follows

It is a logic library: one kebab-case module per public function, named for it, a barrel in file order, no state at module level, no `instanceof`, no browser global, and no runtime dependency. Errors are caught in two places only: where a rule runs, so a rule that throws or rejects gives its error, and in `isJSONString`.

## Exports

`src/index.ts` exports every validator, `schemaResolver`, the constants and the types. Each one's doc comment says what it does.
