import * as solid from "solid-js";
import { createRenderEffect } from "solid-js";
import { isServer } from "@solidjs/web";
import { accessUntracked } from "../../../../../packages/primitives/src/internal-access";
import type { MaybeAccessor, ReadOnce } from "../../../../../packages/primitives/src/types";

let instances = 0;
const cache = new Map<string, number>();
const made = String(instances);
const table = { lookup: new Map<string, number>() } as const;
const pattern = /open/g;
const list = [1, 2];
const effectName = "createTrackedEffect";
class Registry {
  static entries: number[] = [];
}

export type ForbiddenOptions = {
  step: MaybeAccessor<number>;
  list: number[];
  value: ReadOnce<number>;
  initialCount: MaybeAccessor<number>;
};

export function createForbidden(
  options: ForbiddenOptions,
  element: HTMLElement,
  { label }: { label: string },
) {
  const step = options.step;
  const alias = options;
  const { list: items } = options;
  const copied = Object.assign({}, options);
  const spread = [...options.list];
  const merged = { ...options };
  const max = accessUntracked(options.step);
  const attribute = "class";
  const onServer = isServer;
  const inBrowser = () => typeof (window) !== "undefined" && typeof document === "object";
  element.className = "open";
  element.style.color = "red";
  element.classList.add("open");
  element.style.setProperty("color", "red");
  Object.assign(element.style, { color: "red" });
  element.setAttribute("style", "color: red");
  element.setAttribute(attribute, "open");
  document.adoptedStyleSheets = [];
  document.createElement("style");
  element.focus();
  createRenderEffect(() => undefined, () => undefined);
  solid["createRenderEffect"](() => undefined, () => undefined);
  solid[effectName](() => undefined);
  return () => [step, alias, items, copied, spread, merged, max, label, cache, made, onServer, inBrowser];
}
