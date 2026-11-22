---
name: verify-served-page
description: Checks what only a served page can show, on the playground's production build and the StyleX consumer's, in Chromium, Firefox and WebKit. The server's markup carries the library's classes and parts, a page with scripts off is styled and its disclosures, inputs and modal behave, a consumer's class, attribute, `classes`, `styles`, ref and token override reach the components, every `<style>` carries the page's nonce, the page hydrates and marks itself hydrated, and no page reports a console error, warning or page error, nor Solid's development build a diagnostic of our code. Use when a change touches the playground, the StyleX consumer, the library's build or stylesheet, how a component renders on the server or hydrates, `SolixProvider`'s nonce, or Solid, the Solid plugin or Playwright.
---

# Verify the served page

## The promise

The playground in `apps/playground` is a consumer with no StyleX build setup: it depends on `@stylexjs/stylex` alone and imports the library's built stylesheet. Its production build is served by `node dist/server/node.js`, which the global setup of the node project starts once per run and provides as `playgroundUrl`. Every playground test opens a page through `opened` in `apps/playground/tests/support/opening.ts`, and a check in `tests/rules` holds that no playground test or helper they share reaches Playwright's `goto` any other way.

On that served page:

- **Server rendering.** The server's markup carries each part's stable class, a closed `<dialog>`, and the consumer's own stylesheet before the library's layer in the bundle. Each primitive's probe arrives with the server's value, and the client claims it with the server's id.
- **Scripts off.** With JavaScript disabled, a disclosure opens on a click of its summary, the modal stays closed, a text input has the library's border, and the theme the provider writes still reaches the box under its selector.
- **Consumer overrides.** A consumer's plain class beats the library default it targets and nothing else, a rule for the class that `classes.root` names beats the library's style on that part, `styles` on a part beats both, a class and an attribute that change after the first render reach the root, a consumer's ref receives each component's root, and a token the consumer overrides on a subtree rethemes it. The StyleX consumer in `apps/stylex-consumer` shows the same for a class StyleX compiles, through `class` and `classes`, and for a token set in a StyleX block.
- **The nonce.** Each response sends its own nonce in its `style-src`, and every `<style>` in the markup and, after hydration, on the page carries it, so the policy refuses none.
- **Hydration.** `opened` waits until the app's effect has marked `<html>` with `data-hydrated`, within `hydrationTimeout`, and otherwise fails with `the page did not become ready` and what the page said. Opened until `stylesheetsLoaded`, it waits until every stylesheet the page links has loaded and can be read, within its timeout. It fails at once with `the page links no stylesheet`, `a stylesheet did not load` or `a stylesheet loaded but cannot be read`, and at its timeout with `not every stylesheet loaded`, each stylesheet's outcome and what the page said. A value a primitive reads gives the server's value while the page hydrates, and the browser's after.
- **The console.** After each test of the node project, `apps/playground/tests/support/console-check.ts` fails on any console error or warning and any page error that a page opened through `opened` reported, unless the test gave `opened` that exact message, or a pattern of it, as `reportsToTheConsole`. Solid's development build, served by `vp dev`, reports no diagnostic from our code; an upstream one is allowed only by an entry of `apps/playground/tests/upstream-diagnostic-exceptions.json` that still matches a report and has not expired.

## The harm when it breaks

A page that renders on the server without the library's classes flashes unstyled until its script runs, or stays unstyled for a user whose scripts are off. A consumer's override that loses to the library's style leaves the consumer with no way to restyle a part. A `<style>` without the page's nonce is dropped under a strict policy. A page that never hydrates looks right and ignores every click. A console error or a Solid diagnostic that no test reads ships unnoticed.

## Does your change touch it?

| Covered code | What the checks assume about it |
| --- | --- |
| `apps/playground/src` | The page: the middleware gives each request a nonce and its policy, `Document.tsx` writes the head, and `App.tsx` renders every section inside one `SolixProvider` and marks `<html>` with `hydratedMark` from an effect, so only a hydrated page carries it. |
| `apps/playground/package.json` and `apps/playground/vite.config.ts` | The app names no StyleX build plugin, and builds a Node server with the Solid plugin and the middleware. |
| `tests/support/global-setup.ts`, `tests/support/server-process.ts`, `tests/support/server-supervisor.ts` and `tests/support/served-app.ts` | The global setup starts the built server once and provides its address; `startServer` starts it on a port the system gives, under the supervisor, which stops it when the run ends, and reads the address it got; `inEveryEngine` runs a block once in each engine that `scripts/browser-engines.mjs` gives. |
| `apps/playground/tests/support` | `opened` is the one place that navigates and the one that listens to the console; `openPage` opens a page with scripts on or off and reads the expected values through `scripts/expected-values.ts`. |
| `vite.config.ts` | The node project runs `console-check.ts` as a setup file, so the console check follows every test of the project. |
| `scripts/expected-values.ts` | It reads each token's value from a sentinel that carries the page's nonce, so a page under the policy can be compared with the library's tokens. |
| `apps/playground/tests/consumer.test.ts`, `apps/playground/tests/button.test.ts`, `apps/playground/tests/text-input.test.ts`, `apps/playground/tests/disclosure.test.ts` and `apps/playground/tests/modal.test.ts` | Server rendering, scripts off and the consumer's overrides, each read by role, name or visible text. |
| `apps/playground/tests/style-nonce.test.ts` | The nonce of each response, in the markup and in every engine with scripts off and hydrated. |
| `apps/playground/tests/primitives-hydration.test.ts` | The probes the server sends and the client claims, and the values while the page hydrates and after. That opening until `stylesheetsLoaded` waits for a stylesheet that arrives late, and fails for each way a stylesheet does not arrive. |
| `apps/playground/tests/dev-diagnostics.test.ts` and `apps/playground/tests/upstream-diagnostic-exceptions.json` | The development server and the upstream exceptions, each with a reason and an expiry. |
| `apps/stylex-consumer` | A consumer that compiles its own StyleX, served by `vp preview`, and its test. |
| `tests/rules/playground-verification-conventions.test.ts` | It refuses a `goto` outside `opened`, resolved by declaration, and a name a setups module holds written into a playground test. |
| `tests/support/image-captures.ts` | The rule that `tests/rules/script-files.test.ts` runs over every script file. It refuses Playwright's own capture members, the capture options a Playwright call is handed however they were built, and the DevTools session's screenshot and screencast commands, each resolved by declaration. Vitest's browser screenshot API and a member read by a name the type checker cannot know are outside it. That no browser project saves a screenshot of a failed test is held in `tests/project-order.test.ts`. |

Last confirmed against commit `57f6382`. Run `git diff 57f6382 -- apps/playground/src apps/playground/package.json apps/playground/vite.config.ts tests/support/global-setup.ts tests/support/server-process.ts tests/support/server-supervisor.ts tests/support/served-app.ts apps/playground/tests/support vite.config.ts scripts/expected-values.ts apps/playground/tests/consumer.test.ts apps/playground/tests/button.test.ts apps/playground/tests/text-input.test.ts apps/playground/tests/disclosure.test.ts apps/playground/tests/modal.test.ts apps/playground/tests/style-nonce.test.ts apps/playground/tests/primitives-hydration.test.ts apps/playground/tests/dev-diagnostics.test.ts apps/playground/tests/upstream-diagnostic-exceptions.json apps/stylex-consumer tests/rules/playground-verification-conventions.test.ts tests/support/image-captures.ts`. If it shows changes to the covered code, read them against the table before you trust a pass. Move the commit forward only after you have confirmed that the table and the checks still describe the code at the new commit.

## Run it

```bash
vp test apps/playground/tests/consumer.test.ts apps/playground/tests/button.test.ts apps/playground/tests/text-input.test.ts apps/playground/tests/disclosure.test.ts apps/playground/tests/modal.test.ts apps/playground/tests/style-nonce.test.ts apps/playground/tests/primitives-hydration.test.ts apps/playground/tests/dev-diagnostics.test.ts apps/stylex-consumer/tests tests/rules/playground-verification-conventions.test.ts tests/rules/script-files.test.ts
```

Every test run builds the libraries and the apps first. With `CI` set, all three engines must be installed.

To look at the page yourself, run `vp run -r build`, then `node dist/server/node.js` in `apps/playground`, which listens on the port `PORT` gives. Stop it when you are done.

## The tool and why

What a served page shows depends on the server, the built stylesheet, the policy and each engine together, so the checks serve the real production build and read it with Playwright in each engine. They read values, never pixels: a computed colour, an attribute, the markup's bytes. How a component looks is shown to people by the Storybook build that CI uploads with each pull request.

## What a pass covers

- The playground's production build in each installed engine, with scripts on and off, and its development build for the diagnostics.
- The StyleX consumer's build, with its stylesheets in the bundle's order and with the library's loaded again after every other.

## What a pass does not cover

- How a component looks. No check compares pixels until Storybook's screenshot comparisons land.
- The console of the StyleX consumer's page, which its test opens without `opened`.
- A screen reader, touch, and a pointer other than a click.
- The colour scheme, the tabs, the modal's protocol and the layout components, which `verify-color-scheme`, `verify-behaviour-protocol`, `verify-modal-protocol` and `verify-library-stylesheet` cover on the same page.
- Firefox and WebKit where they are not installed.

## Reading a failure

- **`the page did not become ready`.** The client script did not hydrate the page within `hydrationTimeout`. The message ends with what the page said; a page error there is usually the cause.
- **The console check fails after a test.** It lists each message. Fix its cause, or, when the test means the page to report it, give `opened` the exact message as `reportsToTheConsole`.
- **A value differs with scripts off.** The server's markup or the built stylesheet lost a class or a rule that the page needs before its script runs.
- **A consumer's override loses.** The library's layer, a part's stable class or the merge of `class` and `classes` changed.
- **A diagnostic is reported.** Its code is in the message; the `reactivity-diagnostics` skill maps it to its repair.

## When the change is intended

- A new section of the playground: give it a test that opens the page through `opened` and reads it by role, name or visible text, and keep any names it shares with the tests in a setups module beside it.
- A page that must report to the console: pass the exact message to `opened` as `reportsToTheConsole`, and say why in the test's name.
- Mutation check after editing covered code: in `apps/playground/src/App.tsx` remove the effect that sets `hydratedMark`, and run the checks, which must fail with `the page did not become ready`. Then add `console.warn("probe")` to the body of `App` and run them again, which must fail on the console check. Restore the file and confirm it with `cmp`.
