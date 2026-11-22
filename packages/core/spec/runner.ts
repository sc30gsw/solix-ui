import { createComponent, type JSX, render } from "@solidjs/web";
import axe from "axe-core";
import { createStore, flush, merge } from "solid-js";
import { afterEach, beforeEach, describe, test } from "vite-plus/test";
import { commands, page, userEvent } from "vite-plus/test/browser";
import type * as Library from "#/src/index.ts";
import { stableClass } from "#/src/stable-class.ts";
import { colorSchemeAttribute } from "#/src/color-schemes.ts";
import {
  type DomCheck,
  type Fixture,
  held,
  type Props,
  type Rendered,
  type Scheme,
  type Spec,
  type SpecEntry,
  type State,
  type StyleCheck,
} from "#/spec/format.ts";
import { sameColour, sameLength } from "#/spec/computed.ts";

type AnyComponent = (props: Record<string, unknown>) => JSX.Element;

const builtEntry = "index";
const builtStylesheet = new URL("../dist/styles.css", import.meta.url).href;
const library = (await import(`../dist/${builtEntry}.js`)) as typeof Library;
const builtExports: Readonly<Record<string, unknown>> = library;
const defaultScheme: Scheme = "light";
const defaultViewport = { width: 414, height: 896 } as const;
const viewportHeight = 800;
const targetMark = "data-spec-target";
const probeBaseline = "border-style: solid; outline-style: solid;";
const colourProperty = /(?:^|-)color$|^(?:background|border|outline)-color$|^fill$|^stroke$/;
const cleanups: (() => void | Promise<void>)[] = [];
const accessibilityTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function stylesheetLinked(): Promise<void> {
  const href = builtStylesheet;
  if (document.querySelector(`link[href="${href}"]`) !== null) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  const loaded = new Promise<void>((resolve, reject) => {
    link.addEventListener("load", () => resolve());
    link.addEventListener("error", () =>
      reject(new Error(`${href}: the built stylesheet did not load. Build the library first.`)),
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
  const given =
    fixture.children === undefined
      ? props
      : merge(props, {
          get children() {
            return childrenOf(fixture.children);
          },
        });
  return createComponent(component, given);
}

function wrapperFor(fixture: Fixture, host: HTMLElement): HTMLElement {
  if (fixture.within === undefined || !("fieldset" in fixture.within)) return host;
  const fieldset = document.createElement("fieldset");
  fieldset.disabled = true;
  host.append(fieldset);
  return fieldset;
}

function partName(component: string): string {
  return component.replaceAll(".", "");
}

function mounted(fixture: Fixture, scheme: Scheme): Rendered {
  const host = document.createElement("div");
  host.setAttribute(colorSchemeAttribute, scheme);
  document.body.append(host);
  cleanups.push(() => host.remove());
  const mount = wrapperFor(fixture, host);
  const [props, setProps] = createStore<Record<string, unknown>>({ ...fixture.props });
  const within = fixture.within;
  const dispose = render(() => {
    if (within === undefined || !("provider" in within)) return created(fixture, props);
    return createComponent(library.SolixProvider, {
      ...within.provider,
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
  const parts = (name: string, component = partName(fixture.component)) => [
    ...mount.querySelectorAll<HTMLElement>(`.${stableClass(component, name)}`),
  ];
  return {
    root,
    container: mount,
    exports: builtExports,
    part: (name, component) => {
      const [found] = parts(name, component);
      if (found === undefined) {
        throw new Error(`${component ?? fixture.component}: it renders no ${name} part.`);
      }
      return found;
    },
    parts,
    axe: () => violationsIn(mount),
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

async function violationsIn(element: Element): Promise<string[]> {
  const { violations } = await axe.run(element, {
    runOnly: { type: "tag", values: accessibilityTags },
  });
  return violations.map(({ id }) => id);
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

async function entered(state: State, target: HTMLElement): Promise<void> {
  if (state === "hover") {
    await userEvent.hover(target);
    cleanups.push(() => userEvent.unhover(target));
    return;
  }
  if (state === "pressed") {
    target.setAttribute(targetMark, "");
    await commands.pressOn(`[${targetMark}]`);
    cleanups.push(() => commands.releasePress());
    return;
  }
  if (state === "focus-visible") {
    blurred();
    await userEvent.tab();
    if (document.activeElement !== target) target.focus();
    if (document.activeElement !== target || !target.matches(":focus-visible")) {
      throw new Error("The keyboard did not move focus to the part, so its focus look is unread.");
    }
    return;
  }
  if (state === "reduced-motion") {
    await commands.emulateReducedMotion(true);
    cleanups.push(() => commands.emulateReducedMotion(false));
  }
}

function expectedOf(property: string, value: string, beside: HTMLElement): string {
  const probe = document.createElement("div");
  probe.style.cssText = probeBaseline;
  probe.style.setProperty(property, value);
  beside.after(probe);
  const resolved = getComputedStyle(probe).getPropertyValue(property);
  probe.remove();
  if (resolved === "" && value !== "") {
    throw new Error(`${property}: ${value} is not a value the browser takes for it.`);
  }
  return resolved;
}

function customPropertyMatches(actual: string, expected: string, beside: HTMLElement): boolean {
  if (actual === expected) return true;
  if (CSS.supports("color", actual) && CSS.supports("color", expected)) {
    return sameColour(expectedOf("color", actual, beside), expectedOf("color", expected, beside));
  }
  if (CSS.supports("width", actual) && CSS.supports("width", expected)) {
    return sameLength(expectedOf("width", actual, beside), expectedOf("width", expected, beside));
  }
  return false;
}

async function styleHolds(check: StyleCheck): Promise<void> {
  if (check.width !== undefined) {
    await page.viewport(check.width, viewportHeight);
    cleanups.push(() => page.viewport(defaultViewport.width, defaultViewport.height));
  }
  const rendered = mounted(check.fixture, check.scheme ?? defaultScheme);
  const target =
    check.part === undefined && check.of === undefined
      ? rendered.root
      : rendered.part(check.part ?? "root", check.of);
  if (check.state === undefined || check.state === "rest") {
    blurred();
    await userEvent.unhover(target);
  } else {
    await entered(check.state, target);
  }
  await transitionsSettled(target);
  const actual = getComputedStyle(target).getPropertyValue(check.property).trim();
  const where = `${check.of ?? check.fixture.component} ${check.part ?? "root"}, ${check.property}`;
  if (check.value === null) {
    if (actual !== "") throw new Error(`${where}: expected it unset, it is ${actual}.`);
    return;
  }
  if (check.property.startsWith("--")) {
    if (!customPropertyMatches(actual, check.value.trim(), target)) {
      throw new Error(`${where}: expected ${check.value}, it is ${actual || "unset"}.`);
    }
    return;
  }
  const expected = expectedOf(check.property, check.value, target);
  const same = colourProperty.test(check.property)
    ? sameColour(actual, expected)
    : actual === expected;
  if (!same) {
    throw new Error(`${where}: expected ${check.value}, computed ${expected}; it is ${actual}.`);
  }
}

async function domHolds(check: DomCheck): Promise<void> {
  await check.assert(mounted(check.fixture, defaultScheme));
}

function runEntry(entry: SpecEntry): Promise<void> {
  const { check } = entry;
  if (check.by === "story") {
    throw new Error(`${entry.says}: a story is checked by the stories, not in the browser runner.`);
  }
  return held(entry, () => (check.by === "dom" ? domHolds(check) : styleHolds(check)));
}

export function runSpecs(specs: readonly Spec[]): void {
  for (const spec of specs) {
    describe(spec.name, () => {
      beforeEach(stylesheetLinked);
      for (const entry of spec.entries.filter(({ check }) => check.by !== "story")) {
        test(entry.says, () => runEntry(entry));
      }
    });
  }
}
