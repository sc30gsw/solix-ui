import { createComponent, type JSX, render } from "@solidjs/web";
import axe from "axe-core";
import { createStore, flush, merge } from "solid-js";
import { afterEach, beforeEach, describe, test } from "vite-plus/test";
import { commands, page, userEvent } from "vite-plus/test/browser";
import type * as Library from "#/src/index.ts";
import type * as StableClass from "#/src/stable-class.ts";
import { sameColour, sameLength } from "#/spec/computed.ts";
import {
  type Address,
  type Comparison,
  type DomCheck,
  type Fixture,
  held,
  type LookSpec,
  type Props,
  type Rendered,
  type Scheme,
  type Spec,
  SpecError,
  type State,
  type StyleCheck,
} from "#/spec/format.ts";

type AnyComponent = (props: Record<string, unknown>) => JSX.Element;
type Built = "index" | "stable-class";

async function built<T>(module: Built): Promise<T> {
  return (await import(`../dist/${module}.js`)) as T;
}

const library = await built<typeof Library>("index");
const { stableClass } = await built<typeof StableClass>("stable-class");
const builtExports: Readonly<Record<string, unknown>> = library;
const builtStylesheet = new URL("../dist/styles.css", import.meta.url).href;
const startingViewport = { width: window.innerWidth, height: window.innerHeight };
const defaultScheme: Scheme = "light";
const targetMark = "data-spec-target";
const tabStopsTried = 20;
const probeBaseline = "border-style: solid; outline-style: solid;";
const otherContext =
  "color: rgb(1, 2, 3); font: italic 37px serif; cursor: wait; visibility: visible;";
const colourProperty = /(?:^|-)color$|^fill$|^stroke$/;
const accessibilityTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"];
const cleanups: (() => void | Promise<void>)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function stylesheetLinked(): Promise<void> {
  if (document.querySelector(`link[href="${builtStylesheet}"]`) !== null) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = builtStylesheet;
  const loaded = new Promise<void>((resolve, reject) => {
    link.addEventListener("load", () => resolve());
    link.addEventListener("error", () =>
      reject(new SpecError(`${builtStylesheet}: the built stylesheet did not load.`)),
    );
  });
  document.head.append(link);
  await loaded;
}

function componentAt(path: string): AnyComponent {
  const [name, ...members] = path.split(".");
  const found = members.reduce<unknown>(
    (holder, member) =>
      typeof holder === "function" || (typeof holder === "object" && holder !== null)
        ? Reflect.get(holder, member)
        : undefined,
    builtExports[name],
  );
  if (typeof found !== "function") {
    throw new Error(`${path}: the built library exports no component by this name.`);
  }
  return found as AnyComponent;
}

function childrenOf(children: Fixture["children"]): JSX.Element {
  if (children === undefined || typeof children === "string") return children;
  return children.map((child) => created(child, child.props ?? {}));
}

function created(fixture: Fixture, props: Props): JSX.Element {
  const component = componentAt(fixture.component);
  if (fixture.children === undefined) return createComponent(component, props);
  return createComponent(
    component,
    merge(props, {
      get children() {
        return childrenOf(fixture.children);
      },
    }),
  );
}

function stableClassOf({ of, part }: Address, fallback: string): string {
  return stableClass((of ?? fallback).replaceAll(".", ""), part);
}

function mounted(fixture: Fixture, scheme: Scheme): Rendered {
  const host = document.createElement("div");
  host.setAttribute(library.colorSchemeAttribute, scheme);
  document.body.append(host);
  cleanups.push(() => host.remove());
  const within = fixture.within;
  const mount =
    within !== undefined && "fieldset" in within
      ? host.appendChild(Object.assign(document.createElement("fieldset"), { disabled: true }))
      : host;
  const [props, setProps] = createStore<Record<string, unknown>>({ ...fixture.props });
  const dispose = render(() => {
    if (within === undefined || !("provider" in within)) return created(fixture, props);
    return createComponent(library.SolixProvider, {
      ...within.provider,
      forceColorScheme: scheme,
      getRootElement: () => host,
      get children() {
        return created(fixture, props);
      },
    });
  }, mount);
  cleanups.push(dispose);
  flush();
  const root = [...mount.querySelectorAll<HTMLElement>("*")].find(
    (element) => element.localName !== "style",
  );
  if (root === undefined) throw new Error(`${fixture.component}: it rendered no element.`);
  const all = (address: Address) => [
    ...mount.querySelectorAll<HTMLElement>(`.${stableClassOf(address, fixture.component)}`),
  ];
  return {
    root,
    container: mount,
    exports: builtExports,
    at: (address) => {
      const [found] = all(address);
      if (found === undefined) {
        throw new Error(`${address.of ?? fixture.component}: it renders no ${address.part} part.`);
      }
      return found;
    },
    all,
    axe: async () => {
      const { violations } = await axe.run(mount, {
        runOnly: { type: "tag", values: accessibilityTags },
      });
      return violations.map(({ id }) => id);
    },
    update: (next) => {
      setProps((draft) => {
        Object.assign(draft, next);
      });
      flush();
    },
    user: {
      click: (element) => userEvent.click(element),
      hover: (element) => userEvent.hover(element),
      tab: () => userEvent.tab(),
      keyboard: (text) => userEvent.keyboard(text),
    },
  };
}

async function transitionsSettled(element: Element): Promise<void> {
  const running = element
    .getAnimations({ subtree: true })
    .filter((animation) => animation instanceof CSSTransition);
  await Promise.all(running.map((animation) => animation.finished.catch(() => undefined)));
}

function blurred(): void {
  const active = document.activeElement;
  if (active instanceof HTMLElement) active.blur();
}

async function tabbedTo(target: HTMLElement): Promise<void> {
  blurred();
  for (let tried = 0; tried < tabStopsTried && document.activeElement !== target; tried += 1) {
    await userEvent.tab();
  }
  if (document.activeElement !== target || !target.matches(":focus-visible")) {
    throw new SpecError(
      `The keyboard did not reach the part within ${tabStopsTried} tab stops, so its focus look is unread.`,
    );
  }
}

const enter: Record<State, (target: HTMLElement) => Promise<void>> = {
  rest: async (target) => {
    blurred();
    await userEvent.unhover(target);
  },
  hover: async (target) => {
    await userEvent.hover(target);
    cleanups.push(() => userEvent.unhover(target));
  },
  pressed: async (target) => {
    target.setAttribute(targetMark, "");
    await commands.pressOn(`[${targetMark}]`);
    cleanups.push(() => commands.releasePress());
  },
  "focus-visible": tabbedTo,
};

function resolvedIn(context: HTMLElement, property: string, value: string): string {
  const probe = document.createElement("div");
  probe.style.cssText = probeBaseline;
  probe.style.setProperty(property, value);
  if (probe.style.getPropertyValue(property) === "") {
    throw new SpecError(`${property}: the engine does not take ${value} for it.`);
  }
  context.append(probe);
  const resolved = getComputedStyle(probe).getPropertyValue(property);
  probe.remove();
  return resolved;
}

function expectedOf(property: string, value: string, beside: HTMLElement): string {
  if (value.includes("var(")) {
    throw new SpecError(`${property}: ${value} reads a custom property; give the literal value.`);
  }
  const context = beside.parentElement ?? document.body;
  const other = document.createElement("div");
  other.style.cssText = otherContext;
  document.body.append(other);
  const [here, there] = [resolvedIn(context, property, value), resolvedIn(other, property, value)];
  other.remove();
  if (here !== there) {
    throw new SpecError(
      `${property}: ${value} computes ${here} beside the part and ${there} elsewhere, so it follows its context.`,
    );
  }
  return here;
}

function comparisonOf(check: StyleCheck): Comparison {
  if (check.as !== undefined) return check.as;
  return colourProperty.test(check.property) ? "colour" : "text";
}

function same(comparison: Comparison, actual: string, expected: string): boolean {
  if (comparison === "colour") return sameColour(actual, expected);
  if (comparison === "length") return sameLength(actual, expected);
  return actual === expected;
}

function customPropertyMatches(check: StyleCheck, actual: string, beside: HTMLElement): boolean {
  const expected = check.value ?? "";
  const comparison = comparisonOf(check);
  if (comparison === "text") return actual === expected;
  const through = comparison === "colour" ? "color" : "width";
  return same(
    comparison,
    expectedOf(through, actual, beside),
    expectedOf(through, expected, beside),
  );
}

async function styleHolds(check: StyleCheck): Promise<void> {
  if (check.media?.width !== undefined) {
    await page.viewport(check.media.width, startingViewport.height);
    cleanups.push(() => page.viewport(startingViewport.width, startingViewport.height));
  }
  if (check.media?.reducedMotion === true) {
    await commands.emulateReducedMotion(true);
    cleanups.push(() => commands.emulateReducedMotion(false));
  }
  const rendered = mounted(check.fixture, check.scheme ?? defaultScheme);
  const target = check.at === undefined ? rendered.root : rendered.at(check.at);
  const where = `${check.at?.of ?? check.fixture.component} ${check.at?.part ?? "root"}`;
  for (const [name, value] of Object.entries(check.given ?? {})) {
    const found = rendered.root.getAttribute(name);
    if (found !== value)
      throw new Error(`${where}: ${name}="${value}" is not on it, it has ${found}`);
  }
  const interactWith = check.interactWith === undefined ? target : rendered.at(check.interactWith);
  await enter[check.state ?? "rest"](interactWith);
  await transitionsSettled(target);
  const actual = getComputedStyle(target).getPropertyValue(check.property).trim();
  if (check.value === null) {
    if (actual !== "")
      throw new Error(`${where}, ${check.property}: expected it unset, it is ${actual}.`);
    return;
  }
  if (check.property.startsWith("--")) {
    if (!customPropertyMatches(check, actual, target)) {
      throw new Error(
        `${where}, ${check.property}: expected ${check.value}, it is ${actual || "unset"}.`,
      );
    }
    return;
  }
  const expected = expectedOf(check.property, check.value, target);
  if (!same(comparisonOf(check), actual, expected)) {
    throw new Error(
      `${where}, ${check.property}: expected ${check.value}, computed ${expected}; it is ${actual}.`,
    );
  }
}

async function domHolds(check: DomCheck): Promise<void> {
  await check.assert(mounted(check.fixture, defaultScheme));
}

export type Named = readonly (readonly [name: string, spec: Spec | LookSpec])[];

export function runSpecs(specs: Named): void {
  for (const [name, spec] of specs) {
    describe(name, () => {
      beforeEach(stylesheetLinked);
      for (const entry of spec.entries) {
        const { check } = entry;
        test(entry.says, () =>
          held(entry, () => (check.by === "dom" ? domHolds(check) : styleHolds(check))),
        );
      }
    });
  }
}
