import { flush } from "solid-js";
import { expectNoAxeViolations } from "./support/accessibility";
import { createModelled } from "../src/create-modelled";

createModelled(document.body);
flush();
expectNoAxeViolations(document.body);
