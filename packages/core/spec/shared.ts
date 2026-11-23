import { expect } from "vite-plus/test";
import {
  type ComponentName,
  dom,
  type DomCheck,
  type Fixture,
  type GapItem,
  type Promised,
  type Reference,
  type SpecEntry,
} from "#/spec/format.ts";

export const sharedPromises = [
  "parts",
  "mod",
  "variant",
  "size",
  "vars",
  "attributes",
  "classes as a function",
  "styles as a function",
  "style as a list",
  "style as a function",
  "renderRoot",
  "static classes",
  "static varsResolver",
  "extend and withProps",
  "theme defaults",
  "theme classes",
] as const;

export type SharedPromise = (typeof sharedPromises)[number];

export type SharedSuite<R extends Reference> = {
  readonly component: ComponentName;
  readonly reference: R;
  readonly fixture: Fixture;
  readonly until: { readonly [Promise in SharedPromise]?: GapItem };
};

type Shared = {
  readonly says: string;
  readonly check: DomCheck;
  readonly failsWith: string;
};

const salmon = "rgb(250, 128, 114)";
const olive = "rgb(128, 128, 0)";

function stableClassesIn(container: HTMLElement, component: string): string[] {
  const prefix = `solix-${component}-`;
  return [
    ...new Set(
      [...container.querySelectorAll("*")].flatMap((element) =>
        [...element.classList].filter((name) => name.startsWith(prefix)),
      ),
    ),
  ]
    .map((name) => name.slice(prefix.length))
    .sort();
}

function sharedChecks<R extends Reference>({
  component,
  reference,
  fixture,
}: SharedSuite<R>): Record<SharedPromise, Shared | undefined> {
  const parts = [...reference.parts].sort();
  const firstVariable = reference.variables.at(0);
  const withProps = (props: Fixture["props"], within?: Fixture["within"]): Fixture => ({
    ...fixture,
    props: { ...fixture.props, ...props },
    ...(within === undefined ? {} : { within }),
  });
  const onEveryPart = (value: (part: string) => unknown) =>
    Object.fromEntries(reference.parts.map((part) => [part, value(part)]));
  return {
    parts: {
      says: `renders exactly the reference's parts, ${parts.join(", ")}, each with its stable class`,
      check: dom(fixture, ({ container }) => {
        const found = stableClassesIn(container, component);
        if (found.join() !== parts.join()) {
          throw new Error(
            `${component} renders the parts ${found.join(", ")}, not ${parts.join(", ")}`,
          );
        }
      }),
      failsWith: `${component} renders the parts`,
    },
    mod: {
      says: 'mod given ["test", { test2: true, test3: false }] writes data-test and data-test2 on the root, and no data-test3',
      check: dom(withProps({ mod: ["test", { test2: true, test3: false }] }), ({ root }) => {
        expect(root.hasAttribute("data-test"), "mod writes data-test").toBe(true);
        expect(root.hasAttribute("data-test2"), "mod writes data-test2").toBe(true);
        expect(root.hasAttribute("data-test3"), "mod leaves out data-test3").toBe(false);
      }),
      failsWith: "mod writes data-test: expected false to be true",
    },
    variant: {
      says: 'variant="__test-variant" writes data-variant="__test-variant" on the root',
      check: dom(withProps({ variant: "__test-variant" }), ({ root }) => {
        expect(root.getAttribute("data-variant"), "data-variant").toBe("__test-variant");
      }),
      failsWith: "data-variant: expected",
    },
    size: {
      says: 'size="__test-size" writes data-size="__test-size", and size="5rem" writes none',
      check: dom(withProps({ size: "__test-size" }), ({ root, update }) => {
        expect(root.getAttribute("data-size"), "data-size").toBe("__test-size");
        update({ size: "5rem" });
        expect(root.hasAttribute("data-size"), "data-size for a length").toBe(false);
      }),
      failsWith: "data-size: expected null to be '__test-size'",
    },
    vars:
      firstVariable === undefined
        ? undefined
        : {
            says: `vars given a function puts ${firstVariable} on the root, over the component's own`,
            check: dom(
              withProps({ vars: () => ({ root: { [firstVariable]: "3.25rem" } }) }),
              ({ root }) => {
                expect(getComputedStyle(root).getPropertyValue(firstVariable), "vars").toBe(
                  "3.25rem",
                );
              },
            ),
            failsWith: "vars: expected",
          },
    attributes: {
      says: `attributes puts data-test-id on each of ${reference.parts.join(", ")}`,
      check: dom(
        withProps({ attributes: onEveryPart((part) => ({ "data-test-id": part })) }),
        ({ container }) => {
          for (const part of reference.parts) {
            expect(
              container.querySelector(`[data-test-id="${part}"]`),
              `attributes.${part}`,
            ).not.toBeNull();
          }
        },
      ),
      failsWith: "attributes.root: expected null not to be null",
    },
    "classes as a function": {
      says: "classes given a function of the theme and the props puts its classes on each part",
      check: dom(
        withProps({
          "data-test": "__test",
          classes: (_theme: unknown, props: Record<string, unknown>) =>
            onEveryPart((part) => `test-${String(props["data-test"])}-${part}`),
        }),
        ({ container }) => {
          for (const part of reference.parts) {
            expect(
              container.querySelector(`.test-__test-${part}`),
              `classes.${part}`,
            ).not.toBeNull();
          }
        },
      ),
      failsWith: "classes.root: expected null not to be null",
    },
    "styles as a function": {
      says: "styles given a function of the theme and the props puts its declarations on the root",
      check: dom(
        withProps({
          "data-test": salmon,
          styles: (_theme: unknown, props: Record<string, unknown>) =>
            onEveryPart(() => ({ "outline-color": String(props["data-test"]) })),
        }),
        ({ root }) => {
          expect(getComputedStyle(root).outlineColor, "styles.root").toBe(salmon);
        },
      ),
      failsWith: "styles.root: expected",
    },
    "style as a list": {
      says: "style given a list of objects merges them in order on the root",
      check: dom(withProps({ style: [{ color: salmon }, { background: olive }] }), ({ root }) => {
        expect(getComputedStyle(root).backgroundColor, "style list").toBe(olive);
      }),
      failsWith: "style list: expected",
    },
    "style as a function": {
      says: "style given a function receives the theme, and its object reaches the root",
      check: dom(
        withProps({
          style: (theme: unknown) => ({ background: theme === undefined ? "" : olive }),
        }),
        ({ root }) => {
          expect(getComputedStyle(root).backgroundColor, "style function").toBe(olive);
        },
      ),
      failsWith: "style function: expected",
    },
    renderRoot: {
      says: "renderRoot renders the root it returns, with the root's classes",
      check: dom(
        withProps({
          renderRoot: () => Object.assign(document.createElement("a"), { href: "#test-link" }),
        }),
        ({ root }) => {
          expect(root.localName, "renderRoot").toBe("a");
        },
      ),
      failsWith: "renderRoot: expected",
    },
    "static classes": {
      says: `${component}.classes maps each part to its stable class`,
      check: dom(fixture, ({ exports }) => {
        expect(Reflect.get(Object(exports[component]), "classes"), "static classes").toEqual(
          onEveryPart((part) => `solix-${component}-${part}`),
        );
      }),
      failsWith: "static classes: expected undefined to deeply equal",
    },
    "static varsResolver":
      firstVariable === undefined
        ? undefined
        : {
            says: `${component}.varsResolver is a function`,
            check: dom(fixture, ({ exports }) => {
              expect(
                typeof Reflect.get(Object(exports[component]), "varsResolver"),
                "varsResolver",
              ).toBe("function");
            }),
            failsWith: "varsResolver: expected 'undefined' to be 'function'",
          },
    "extend and withProps": {
      says: `${component}.extend and ${component}.withProps are functions`,
      check: dom(fixture, ({ exports }) => {
        const holder = Object(exports[component]);
        expect(typeof Reflect.get(holder, "extend"), "extend").toBe("function");
        expect(typeof Reflect.get(holder, "withProps"), "withProps").toBe("function");
      }),
      failsWith: "extend: expected 'undefined' to be 'function'",
    },
    "theme defaults": {
      says: "a theme's components defaults fill a prop the caller leaves unset, and the caller's wins",
      check: dom(
        withProps(
          {},
          {
            provider: {
              theme: {
                components: { [component]: { defaultProps: { "data-from-theme": "theme" } } },
              },
            },
          },
        ),
        ({ root, update }) => {
          expect(root.getAttribute("data-from-theme"), "theme default").toBe("theme");
          update({ "data-from-theme": "caller" });
          expect(root.getAttribute("data-from-theme"), "caller's prop").toBe("caller");
        },
      ),
      failsWith: "theme default: expected null to be 'theme'",
    },
    "theme classes": {
      says: "a theme's components classes reach the root beside the caller's",
      check: dom(
        withProps(
          { classes: { root: "from-the-caller" } },
          {
            provider: {
              theme: { components: { [component]: { classNames: { root: "from-the-theme" } } } },
            },
          },
        ),
        ({ root }) => {
          expect(root.classList.contains("from-the-theme"), "theme class").toBe(true);
          expect(root.classList.contains("from-the-caller"), "caller's class").toBe(true);
        },
      ),
      failsWith: "theme class: expected false to be true",
    },
  };
}

export function sharedSuite<R extends Reference>(suite: SharedSuite<R>): SpecEntry<R>[] {
  const checks = sharedChecks(suite);
  return sharedPromises.flatMap((key): SpecEntry<R>[] => {
    const shared = checks[key];
    if (shared === undefined) return [];
    const promise: Promised<R> =
      key === "parts" ? { kind: "parts" } : { kind: "shared", promise: key };
    const until = suite.until[key];
    return [
      until === undefined
        ? { says: shared.says, promise, check: shared.check, status: "holds" }
        : {
            says: shared.says,
            promise,
            check: shared.check,
            status: "pending",
            until,
            failsWith: shared.failsWith,
          },
    ];
  });
}
