import { createComponent, type JSX, render } from "@solidjs/web";
import axe from "axe-core";
import { createStore, flush, merge } from "solid-js";
import { afterEach, beforeEach, describe, test } from "vite-plus/test";
import { commands, page, userEvent } from "vite-plus/test/browser";
import type * as Library from "#/src/index.ts";
import type * as StableClass from "#/src/stable-class.ts";
import { sameColour } from "#/spec/computed.ts";
import {
  type Address,
  type Attribute,
  type Children,
  type ComponentPath,
  describeLook,
  type Fixture,
  type FunctionEntry,
  type FunctionSpec,
  givenProps,
  held,
  LookDiffers,
  type LookEntry,
  type LookFixture,
  lookProperties,
  type LookSpec,
  MissingError,
  type Props,
  type Rendered,
  type Scheme,
  SpecError,
  type State,
} from "#/spec/format.ts";
import { breakpoints } from "#/spec/look/reference.ts";

type AnyComponent = (props: Record<string, unknown>) => JSX.Element;
type Built = "index" | "stable-class";
type Named<D> = readonly (readonly [section: string, document: D])[];

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

function componentAt(path: ComponentPath): AnyComponent {
  const [name, ...members] = path.split(".");
  const found = members.reduce<unknown>(
    (holder, member) =>
      typeof holder === "function" || (typeof holder === "object" && holder !== null)
        ? Reflect.get(holder, member)
        : undefined,
    builtExports[name],
  );
  if (typeof found !== "function") {
    throw new MissingError(
      { export: path },
      `${path}: the built library exports no component by this name.`,
    );
  }
  return found as AnyComponent;
}

function childrenOf(children: Children | undefined): JSX.Element {
  if (children === undefined || typeof children === "string") return children;
  return children.map((child) => created(child, givenProps(child)));
}

function created(fixture: Fixture | LookFixture, props: Props): JSX.Element {
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

function mounted(fixture: Fixture | LookFixture, scheme: Scheme): Rendered {
  const host = document.createElement("div");
  host.setAttribute(library.colorSchemeAttribute, scheme);
  document.body.append(host);
  cleanups.push(() => host.remove());
  const { provider } = fixture;
  const [props, setProps] = createStore<Record<string, unknown>>({ ...givenProps(fixture) });
  const dispose = render(() => {
    if (provider === undefined) return created(fixture, props);
    return createComponent(library.SolixProvider, {
      ...givenProps(provider),
      forceColorScheme: scheme,
      getRootElement: () => host,
      get children() {
        return created(fixture, props);
      },
    });
  }, host);
  cleanups.push(dispose);
  flush();
  const root = [...host.querySelectorAll<HTMLElement>("*")].find(
    (element) => element.localName !== "style",
  );
  if (root === undefined) throw new Error(`${fixture.component}: it rendered no element.`);
  const all = (address: Address) => [
    ...host.querySelectorAll<HTMLElement>(`.${stableClassOf(address, fixture.component)}`),
  ];
  return {
    root,
    container: host,
    exports: builtExports,
    at: (address) => {
      const [found] = all(address);
      if (found === undefined) {
        throw new MissingError(
          address,
          `${address.of ?? fixture.component}: it renders no ${address.part} part.`,
        );
      }
      return found;
    },
    all,
    axe: async () => {
      const { violations } = await axe.run(host, {
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

function requireAttribute(root: HTMLElement, where: string, requires: Attribute | undefined): void {
  if (requires === undefined) return;
  const found = root.getAttribute(requires.attribute);
  if (found !== requires.value) {
    throw new MissingError(
      requires,
      `${where}: ${requires.attribute}="${requires.value}" is not on it, it has ${found}`,
    );
  }
}

async function lookHolds(entry: LookEntry): Promise<void> {
  const width = entry.media?.width;
  if (width !== undefined) {
    await page.viewport(breakpoints[width], startingViewport.height);
    cleanups.push(() => page.viewport(startingViewport.width, startingViewport.height));
  }
  if (entry.media?.reducedMotion === true) {
    await commands.emulateReducedMotion(true);
    cleanups.push(() => commands.emulateReducedMotion(false));
  }
  const rendered = mounted(entry.fixture, entry.scheme ?? defaultScheme);
  const target = entry.at === undefined ? rendered.root : rendered.at(entry.at);
  const where = `${entry.at?.of ?? entry.fixture.component} ${entry.at?.part ?? "root"}`;
  requireAttribute(rendered.root, where, entry.requires);
  await enter[entry.state ?? "rest"](target);
  await transitionsSettled(target);
  const actual = getComputedStyle(target).getPropertyValue(entry.property).trim();
  const expected = expectedOf(entry.property, entry.value, target);
  const same =
    lookProperties[entry.property] === "colour"
      ? sameColour(actual, expected)
      : actual === expected;
  if (!same) {
    throw new LookDiffers(
      `${where}, ${entry.property}: expected ${entry.value}, computed ${expected}; it is ${actual}.`,
    );
  }
}

async function functionHolds(entry: FunctionEntry): Promise<void> {
  await entry.assert(mounted(entry.fixture, defaultScheme));
}

export function runFunctionSpecs(specs: Named<FunctionSpec>): void {
  for (const [name, spec] of specs) {
    describe(name, () => {
      beforeEach(stylesheetLinked);
      for (const entry of spec.entries) {
        test(entry.says, () => held(entry.says, entry.status, () => functionHolds(entry)));
      }
    });
  }
}

export function runLookSpecs(specs: Named<LookSpec>): void {
  for (const [name, spec] of specs) {
    describe(name, () => {
      beforeEach(stylesheetLinked);
      for (const entry of spec) {
        const says = describeLook(entry);
        test(says, () => held(says, entry.status, () => lookHolds(entry)));
      }
    });
  }
}
