import { flush } from "solid-js";
import { expectNoAxeViolations } from "#/tests/fixtures/primitive-rules/forbidden/tests/support/accessibility.ts";
import { createModelled } from "#/tests/fixtures/primitive-rules/forbidden/src/create-modelled.ts";

createModelled(document.body);
flush();
expectNoAxeViolations(document.body);
