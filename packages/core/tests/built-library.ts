import { join } from "node:path";
import { createComponent, renderToString } from "@solidjs/web";
import type { Component } from "solid-js";
import type * as Library from "../src/index";
import type * as Parts from "../src/parts";

export type ConsumerProps = Record<string, unknown>;

const dist = join(import.meta.dirname, "../dist");

export const library = (await import(join(dist, "index.js"))) as typeof Library;

export const { partPropKeys, rootPart } = (await import(join(dist, "parts.js"))) as typeof Parts;

const builtByName: Record<string, unknown> = library;

export function renderBuilt(name: string, props: ConsumerProps): string {
  const built = builtByName[name];
  if (typeof built !== "function") {
    throw new Error(`packages/core/dist/index.js: export the component ${name}.`);
  }
  const Built = built as Component<ConsumerProps>;
  return renderToString(() => createComponent(Built, props));
}
