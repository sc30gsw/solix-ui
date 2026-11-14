import { join } from "node:path";
import type * as Primitives from "../src/index";

export const dist = join(import.meta.dirname, "../dist");

export const library = (await import(join(dist, "index.js"))) as typeof Primitives;
