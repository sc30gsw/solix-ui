import { createComponent, type JSX, render } from "@solidjs/web";
import axe from "axe-core";
import { createStore, flush, merge } from "solid-js";
import { describe, test } from "vite-plus/test";
import { commands, page, userEvent } from "vite-plus/test/browser";
import type * as Library from "#/src/index.ts";
import type * as StableClass from "#/src/stable-class.ts";
import { sameColour } from "#/spec/computed.ts";
import {
  type Address,
  type Attribute,
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
  type LookProperty,
  lookProperties,
  type LookSpec,
  MissingError,
  type Node,
  type Props,
  type Rendered,
  type Scheme,
  SpecError,
  type State,
} from "#/spec/format.ts";
import { breakpoints } from "#/spec/look/reference.ts";
import type { Named } from "#/spec/registry.ts";
import { wcag2AAndAATags } from "../../../tests/support/browser-gates.ts";
import {
  openSolidDiagnosticsGate,
  solidDevelopmentBuildLoaded,
} from "../../../tests/support/solid-diagnostics.ts";

type Cleanup = () => void | Promise<void>;

export type Scope = { readonly defer: (cleanup: Cleanup) => void };

type Component = (props: Props) => JSX.Element;

type Resolved = {
  readonly path: ComponentPath;
  readonly component: Component;
  readonly props: Props;
  readonly children?: string | readonly Resolved[];
};

type Kind = "function" | "look";

async function built<T>(module: "index" | "stable-class"): Promise<T> {
  return (await import(`../dist/${module}.js`)) as T;
}

const library = await built<typeof Library>("index");
const { stableClass } = await built<typeof StableClass>("stable-class");
const builtExports: Readonly<Record<string, unknown>> = library;
const startingViewport = { width: window.innerWidth, height: window.innerHeight };
const targetMark = "data-spec-target";
const tabStopsTried = 20;
const probeBaseline = "border-style: solid; outline-style: solid;";
const contexts = [
  "color: rgb(1, 2, 3); font: italic 37px serif; cursor: wait; visibility: visible; width: 640px; height: 480px;",
  "color: rgb(250, 251, 252); font: 11px monospace; cursor: crosshair; visibility: visible; width: 120px; height: 90px;",
] as const;

export async function linkedStylesheet(href: string): Promise<void> {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  const loaded = new Promise<void>((resolve, reject) => {
    link.addEventListener("load", () => resolve());
    link.addEventListener("error", () =>
      reject(new SpecError(`${href}: the built stylesheet did not load.`)),
    );
  });
  document.head.append(link);
  try {
    await loaded;
  } catch (error) {
    link.remove();
    throw error;
  }
}

await linkedStylesheet(new URL("../dist/styles.css", import.meta.url).href);

if (!solidDevelopmentBuildLoaded()) {
  throw new SpecError(
    "The component spec project loaded Solid's production build, which raises no development diagnostic.",
  );
}

export async function runCleanups(
  test: string,
  cleanups: readonly Cleanup[],
  raised: () => readonly string[],
): Promise<void> {
  const failures: unknown[] = [];
  for (const cleanup of cleanups.toReversed()) {
    try {
      await cleanup();
    } catch (error) {
      failures.push(error);
    }
  }
  flush();
  const diagnostics = raised();
  if (diagnostics.length > 0) failures.push(new Error(`Solid raised ${diagnostics.join("; ")}.`));
  if (failures.length > 0) {
    const messages = failures.map((failure) =>
      failure instanceof Error ? failure.message : String(failure),
    );
    throw new AggregateError(failures, `${test}: ${messages.join(" ")}`);
  }
}

export const specTest = test.extend<{ scope: Scope }>({
  scope: [
    async ({ task }, use) => {
      const gate = openSolidDiagnosticsGate({ exclusive: true });
      const cleanups: Cleanup[] = [];
      await use({ defer: (cleanup) => void cleanups.push(cleanup) });
      await runCleanups(task.name, cleanups, gate.finishDescribed);
    },
    { auto: true },
  ],
});

function exportAt(path: ComponentPath): Component {
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
  return found as Component;
}

function resolve(node: Node<ComponentPath> | Fixture | LookFixture): Resolved {
  const { children } = node;
  return {
    path: node.component,
    component: exportAt(node.component),
    props: givenProps(node),
    ...(children === undefined
      ? {}
      : { children: typeof children === "string" ? children : children.map(resolve) }),
  };
}

function created(resolved: Resolved, props: Props): JSX.Element {
  const { children } = resolved;
  if (children === undefined) return createComponent(resolved.component, props);
  return createComponent(
    resolved.component,
    merge(props, {
      get children() {
        return typeof children === "string"
          ? children
          : children.map((child) => created(child, child.props));
      },
    }),
  );
}

function componentOf(of: ComponentPath | undefined, root: ComponentPath): string {
  return (of ?? root).replaceAll(".", "");
}

export function mount(
  scope: Scope,
  fixture: Fixture | LookFixture,
  scheme: Scheme,
  kind: Kind,
): Rendered {
  const resolved = resolve(fixture);
  const host = document.createElement("div");
  host.setAttribute(library.colorSchemeAttribute, scheme);
  document.body.append(host);
  scope.defer(() => host.remove());
  const [props, setProps] = createStore<Record<string, unknown>>(
    { ...resolved.props },
    { shallow: true },
  );
  const { provider } = fixture;
  const dispose = render(() => {
    if (provider === undefined) return created(resolved, props);
    return createComponent(library.SolixProvider, {
      ...givenProps(provider),
      ...(kind === "look" ? { forceColorScheme: scheme } : {}),
      getRootElement: () => host,
      get children() {
        return created(resolved, props);
      },
    });
  }, host);
  scope.defer(dispose);
  flush();
  const root = [...host.querySelectorAll<HTMLElement>("*")].find(
    (element) => element.localName !== "style",
  );
  if (root === undefined) throw new Error(`${fixture.component}: it rendered no element.`);
  const classOf = ({ of, part }: Address) => stableClass(componentOf(of, fixture.component), part);
  const all = (address: Address) => [...host.querySelectorAll<HTMLElement>(`.${classOf(address)}`)];
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
    parts: (of) => {
      const prefix = stableClass(componentOf(of, fixture.component), "");
      return [
        ...new Set(
          [...host.querySelectorAll("*")].flatMap((element) =>
            [...element.classList].filter((name) => name.startsWith(prefix)),
          ),
        ),
      ]
        .map((name) => name.slice(prefix.length))
        .sort();
    },
    classOf,
    axe: async () => {
      const { violations } = await axe.run(host, {
        runOnly: { type: "tag", values: wcag2AAndAATags },
      });
      return violations.map(({ id }) => id);
    },
    update: (next) => {
      setProps((draft) => {
        Object.assign(draft, next);
      });
      flush();
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

export async function enter(scope: Scope, state: State, target: HTMLElement): Promise<void> {
  if (state === "rest") {
    blurred();
    await userEvent.unhover(target);
    return;
  }
  if (state === "focus-visible") {
    await tabbedTo(target);
    return;
  }
  scope.defer(() => userEvent.unhover(target));
  if (state === "hover") {
    await userEvent.hover(target);
    return;
  }
  target.setAttribute(targetMark, "");
  scope.defer(() => commands.releasePress());
  await commands.pressOn(`[${targetMark}]`);
}

async function under(scope: Scope, media: LookEntry["media"]): Promise<void> {
  if (media?.width !== undefined) {
    scope.defer(() => page.viewport(startingViewport.width, startingViewport.height));
    await page.viewport(breakpoints[media.width], startingViewport.height);
  }
  if (media?.reducedMotion === true) {
    scope.defer(() => commands.emulateReducedMotion(false));
    await commands.emulateReducedMotion(true);
  }
}

type Expected = {
  readonly property: LookProperty;
  readonly value: string;
  readonly computed: string;
};

function computedIn(context: string, property: LookProperty, value: string): string {
  const holder = document.createElement("div");
  holder.style.cssText = context;
  const probe = document.createElement("div");
  probe.style.cssText = probeBaseline;
  probe.style.setProperty(property, value);
  holder.append(probe);
  document.body.append(holder);
  const computed = getComputedStyle(probe).getPropertyValue(property);
  holder.remove();
  return computed;
}

export function expected(property: LookProperty, value: string): Expected {
  if (/var\(/i.test(value)) {
    throw new SpecError(`${property}: ${value} reads a custom property; give the literal value.`);
  }
  if (!CSS.supports(property, value)) {
    throw new SpecError(`${property}: the engine does not take ${value} for it.`);
  }
  const [one, other] = contexts.map((context) => computedIn(context, property, value));
  if (one !== other) {
    throw new SpecError(
      `${property}: ${value} computes ${one} in one context and ${other} in another, so it follows its context.`,
    );
  }
  return { property, value, computed: one };
}

function compare(target: Element, want: Expected): void {
  const actual = getComputedStyle(target).getPropertyValue(want.property).trim();
  const same =
    lookProperties[want.property] === "colour"
      ? sameColour(actual, want.computed)
      : actual === want.computed;
  if (!same) {
    throw new LookDiffers(
      `${want.property}: expected ${want.value}, computed ${want.computed}; it is ${actual}.`,
    );
  }
}

function requireAttribute(root: HTMLElement, requires: Attribute | undefined): void {
  if (requires === undefined) return;
  const found = root.getAttribute(requires.attribute);
  if (found !== requires.value) {
    throw new MissingError(
      requires,
      `${requires.attribute}="${requires.value}" is not on it, it has ${found}.`,
    );
  }
}

async function checkFunction(scope: Scope, entry: FunctionEntry): Promise<void> {
  await held(entry.says, entry.status, async () => {
    await entry.assert(mount(scope, entry.fixture, "light", "function"));
  });
}

export async function checkLook(scope: Scope, entry: LookEntry): Promise<void> {
  await under(scope, entry.media);
  const want = expected(entry.property, entry.value);
  await held(describeLook(entry), entry.status, async () => {
    const rendered = mount(scope, entry.fixture, entry.scheme ?? "light", "look");
    const target = entry.at === undefined ? rendered.root : rendered.at(entry.at);
    requireAttribute(rendered.root, entry.requires);
    await enter(scope, entry.state ?? "rest", target);
    await transitionsSettled(target);
    compare(target, want);
  });
}

export function runFunctionSpecs(specs: Named<FunctionSpec>): void {
  for (const [section, spec] of specs) {
    describe(section, () => {
      for (const entry of spec.entries) {
        specTest(entry.says, ({ scope }) => checkFunction(scope, entry));
      }
    });
  }
}

export function runLookSpecs(specs: Named<LookSpec>): void {
  for (const [section, spec] of specs) {
    describe(section, () => {
      for (const entry of spec) {
        specTest(describeLook(entry), ({ scope }) => checkLook(scope, entry));
      }
    });
  }
}
