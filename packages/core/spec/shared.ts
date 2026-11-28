import { expect } from "vite-plus/test";
import type {
  ComponentName,
  Fixture,
  FunctionEntry,
  GapItem,
  Pinned,
  Props,
  Reference,
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
  readonly fixture: (props: Props) => Fixture;
  readonly until: { readonly [Promise in SharedPromise]?: GapItem };
};

type Shared = Pick<FunctionEntry, "says" | "fixture" | "assert"> & { readonly pin: Pinned };

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
  const plain = fixture({});
  const themed = (theme: Props): Fixture => ({ ...plain, provider: { unbuilt: { theme } } });
  const onEveryPart = (value: (part: string) => unknown) =>
    Object.fromEntries(reference.parts.map((part) => [part, value(part)]));
  return {
    parts: {
      says: `renders exactly the reference's parts, ${parts.join(", ")}, each with its stable class`,
      fixture: plain,
      assert: ({ container }) => {
        expect(stableClassesIn(container, component), "parts").toEqual(parts);
      },
      pin: "parts: expected",
    },
    mod: {
      says: 'mod given ["test", { test2: true, test3: false }] writes data-test and data-test2 on the root, and no data-test3',
      fixture: fixture({ mod: ["test", { test2: true, test3: false }] }),
      assert: ({ root }) => {
        expect(root.hasAttribute("data-test"), "mod writes data-test").toBe(true);
        expect(root.hasAttribute("data-test2"), "mod writes data-test2").toBe(true);
        expect(root.hasAttribute("data-test3"), "mod leaves out data-test3").toBe(false);
      },
      pin: "mod writes data-test: expected false to be true",
    },
    variant: {
      says: 'variant="__test-variant" writes data-variant="__test-variant" on the root',
      fixture: fixture({ variant: "__test-variant" }),
      assert: ({ root }) => {
        expect(root.getAttribute("data-variant"), "data-variant").toBe("__test-variant");
      },
      pin: "data-variant: expected",
    },
    size: {
      says: 'size="__test-size" writes data-size="__test-size", and size="5rem" writes none',
      fixture: fixture({ size: "__test-size" }),
      assert: ({ root, update }) => {
        expect(root.getAttribute("data-size"), "data-size").toBe("__test-size");
        update({ size: "5rem" });
        expect(root.hasAttribute("data-size"), "data-size for a length").toBe(false);
      },
      pin: "data-size: expected null to be '__test-size'",
    },
    vars:
      firstVariable === undefined
        ? undefined
        : {
            says: `vars given a function puts ${firstVariable} on the root, over the component's own`,
            fixture: fixture({ vars: () => ({ root: { [firstVariable]: "3.25rem" } }) }),
            assert: ({ root }) => {
              expect(getComputedStyle(root).getPropertyValue(firstVariable), "vars").toBe(
                "3.25rem",
              );
            },
            pin: "vars: expected",
          },
    attributes: {
      says: `attributes puts data-test-id on each of ${reference.parts.join(", ")}`,
      fixture: fixture({ attributes: onEveryPart((part) => ({ "data-test-id": part })) }),
      assert: ({ container }) => {
        for (const part of reference.parts) {
          expect(
            container.querySelector(`[data-test-id="${part}"]`),
            `attributes.${part}`,
          ).not.toBeNull();
        }
      },
      pin: "attributes.root: expected null not to be null",
    },
    "classes as a function": {
      says: "classes given a function of the theme and the props puts its classes on each part",
      fixture: fixture({
        "data-test": "__test",
        classes: (_theme: unknown, props: Record<string, unknown>) =>
          onEveryPart((part) => `test-${String(props["data-test"])}-${part}`),
      }),
      assert: ({ container }) => {
        for (const part of reference.parts) {
          expect(container.querySelector(`.test-__test-${part}`), `classes.${part}`).not.toBeNull();
        }
      },
      pin: "classes.root: expected null not to be null",
    },
    "styles as a function": {
      says: "styles given a function of the theme and the props puts its declarations on the root",
      fixture: fixture({
        "data-test": salmon,
        styles: (_theme: unknown, props: Record<string, unknown>) =>
          onEveryPart(() => ({ "outline-color": String(props["data-test"]) })),
      }),
      assert: ({ root }) => {
        expect(getComputedStyle(root).outlineColor, "styles.root").toBe(salmon);
      },
      pin: "styles.root: expected",
    },
    "style as a list": {
      says: "style given a list of objects merges them in order on the root",
      fixture: fixture({ style: [{ color: salmon }, { background: olive }] }),
      assert: ({ root }) => {
        expect(getComputedStyle(root).backgroundColor, "style list").toBe(olive);
      },
      pin: "style list: expected",
    },
    "style as a function": {
      says: "style given a function receives the theme, and its object reaches the root",
      fixture: fixture({
        style: (theme: unknown) => ({ background: theme === undefined ? "" : olive }),
      }),
      assert: ({ root }) => {
        expect(getComputedStyle(root).backgroundColor, "style function").toBe(olive);
      },
      pin: "style function: expected",
    },
    renderRoot: {
      says: "renderRoot renders the root it returns, with the root's classes",
      fixture: fixture({
        renderRoot: () => Object.assign(document.createElement("a"), { href: "#test-link" }),
      }),
      assert: ({ root }) => {
        expect(root.localName, "renderRoot").toBe("a");
      },
      pin: "renderRoot: expected",
    },
    "static classes": {
      says: `${component}.classes maps each part to its stable class`,
      fixture: plain,
      assert: ({ exports }) => {
        expect(Reflect.get(Object(exports[component]), "classes"), "static classes").toEqual(
          onEveryPart((part) => `solix-${component}-${part}`),
        );
      },
      pin: "static classes: expected undefined to deeply equal",
    },
    "static varsResolver":
      firstVariable === undefined
        ? undefined
        : {
            says: `${component}.varsResolver is a function`,
            fixture: plain,
            assert: ({ exports }) => {
              expect(
                typeof Reflect.get(Object(exports[component]), "varsResolver"),
                "varsResolver",
              ).toBe("function");
            },
            pin: "varsResolver: expected 'undefined' to be 'function'",
          },
    "extend and withProps": {
      says: `${component}.extend and ${component}.withProps are functions`,
      fixture: plain,
      assert: ({ exports }) => {
        const holder = Object(exports[component]);
        expect(typeof Reflect.get(holder, "extend"), "extend").toBe("function");
        expect(typeof Reflect.get(holder, "withProps"), "withProps").toBe("function");
      },
      pin: "extend: expected 'undefined' to be 'function'",
    },
    "theme defaults": {
      says: "a theme's components defaults fill a prop the caller leaves unset, and the caller's wins",
      fixture: themed({
        components: { [component]: { defaultProps: { "data-from-theme": "theme" } } },
      }),
      assert: ({ root, update }) => {
        expect(root.getAttribute("data-from-theme"), "theme default").toBe("theme");
        update({ "data-from-theme": "caller" });
        expect(root.getAttribute("data-from-theme"), "caller's prop").toBe("caller");
      },
      pin: "theme default: expected null to be 'theme'",
    },
    "theme classes": {
      says: "a theme's components classes reach the root beside the caller's",
      fixture: {
        ...fixture({ classes: { root: "from-the-caller" } }),
        provider: {
          unbuilt: {
            theme: { components: { [component]: { classNames: { root: "from-the-theme" } } } },
          },
        },
      },
      assert: ({ root }) => {
        expect(root.classList.contains("from-the-theme"), "theme class").toBe(true);
        expect(root.classList.contains("from-the-caller"), "caller's class").toBe(true);
      },
      pin: "theme class: expected false to be true",
    },
  };
}

export function sharedSuite<R extends Reference>(suite: SharedSuite<R>): FunctionEntry<R>[] {
  const checks = sharedChecks(suite);
  return sharedPromises.flatMap((key): FunctionEntry<R>[] => {
    const shared = checks[key];
    if (shared === undefined) return [];
    const until = suite.until[key];
    return [
      {
        says: shared.says,
        about: key === "parts" ? "every part" : "behaviour",
        fixture: shared.fixture,
        assert: shared.assert,
        status: until === undefined ? "holds" : { until, fails: shared.pin },
      },
    ];
  });
}
