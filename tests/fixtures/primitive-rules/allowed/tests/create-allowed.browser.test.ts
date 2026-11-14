import fc from "fast-check";
import { expectNoAxeViolations as violations } from "./support/accessibility";
import { flush } from "./support/browser-harness";

fc.modelRun(() => ({ model: {}, real: {} }), []);
flush();
await violations(document.body);
