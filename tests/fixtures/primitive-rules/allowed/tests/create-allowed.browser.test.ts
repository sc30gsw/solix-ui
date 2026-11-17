import fc from "fast-check";
import { expectNoAxeViolations as violations } from "#/tests/fixtures/primitive-rules/allowed/tests/support/accessibility.ts";
import { flush } from "#/tests/fixtures/primitive-rules/allowed/tests/support/browser-harness.ts";

fc.modelRun(() => ({ model: {}, real: {} }), []);
flush();
await violations(document.body);
