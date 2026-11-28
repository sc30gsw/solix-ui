import { createEffect, createRoot, createSignal, flush } from "solid-js";
import { expect, test } from "vite-plus/test";
import { fixture } from "#/spec/fixtures.ts";
import { type Fixture, MissingError, SpecError } from "#/spec/format.ts";
import {
  checkLook,
  enter,
  expected,
  linkedStylesheet,
  mount,
  runCleanups,
  type Scope,
  specTest,
} from "#/spec/runner.ts";
import {
  expectingSolidDiagnostic,
  openSolidDiagnosticsGate,
} from "../../../tests/support/solid-diagnostics.ts";

type Cleanup = () => void | Promise<void>;

function scoped(): { readonly scope: Scope; readonly close: () => Promise<void> } {
  const cleanups: Cleanup[] = [];
  return {
    scope: { defer: (cleanup) => void cleanups.push(cleanup) },
    close: () => runCleanups("the scratch scope", cleanups, () => []),
  };
}

function bodyChildren(): number {
  return document.body.children.length;
}

test("the built stylesheet is linked once, before any test runs", () => {
  const links = [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].filter(
    ({ href }) => href.endsWith("/dist/styles.css"),
  );

  expect(links).toHaveLength(1);
  expect(links[0].sheet).not.toBeNull();
});

test("a stylesheet that does not load is a SpecError and leaves no link behind", async () => {
  const href = new URL("../dist/no-such-stylesheet.css", import.meta.url).href;

  await expect(linkedStylesheet(href)).rejects.toBeInstanceOf(SpecError);
  expect(document.querySelector(`link[href="${href}"]`)).toBeNull();
});

test("a fixture that names a missing export throws its MissingError before anything mounts", async () => {
  const { scope, close } = scoped();
  const before = bodyChildren();
  const tree = fixture("Box", {}, [fixture("Button.Groop", {}, "One")]);

  expect(() => mount(scope, tree, "light", "function")).toThrow(MissingError);
  expect(bodyChildren()).toBe(before);
  await close();
});

test("every cleanup of a test runs, last deferred first, even when one throws, and the test then fails", async () => {
  const ran: string[] = [];
  const thrown = new Error("the second cleanup throws");
  const cleanups: Cleanup[] = [
    () => void ran.push("first"),
    () => {
      ran.push("second");
      throw thrown;
    },
    () => void ran.push("third"),
  ];

  const closing = runCleanups("three cleanups", cleanups, () => []);

  await expect(closing).rejects.toBeInstanceOf(AggregateError);
  await expect(closing).rejects.toHaveProperty("errors", [thrown]);
  expect(ran).toEqual(["third", "second", "first"]);
});

function readUntracked(): void {
  const [count] = createSignal(0);
  const dispose = createRoot((dispose) => {
    createEffect(count, () => {
      count();
    });
    return dispose;
  });
  flush();
  dispose();
}

test("a Solid diagnostic raised while a test closes fails it by its code, beside a cleanup that threw", async () => {
  const gate = openSolidDiagnosticsGate({ exclusive: true });
  const thrown = new Error("a cleanup throws");

  const closing = runCleanups(
    "an untracked read",
    [
      readUntracked,
      () => {
        throw thrown;
      },
    ],
    gate.finishDescribed,
  );

  await expect(closing).rejects.toThrow("STRICT_READ_UNTRACKED");
  await expect(closing).rejects.toHaveProperty("errors.0", thrown);
});

specTest("the scope a spec entry runs in holds Solid's exclusive diagnostics gate", () => {
  expectingSolidDiagnostic("STRICT_READ_UNTRACKED", readUntracked);
});

test("an update that renders another root element is a SpecError, since the root the entry holds is then out of the document", async () => {
  const { scope, close } = scoped();
  const rendered = mount(scope, fixture("Button", {}, "Save"), "light", "function");

  expect(rendered.root.localName).toBe("button");
  expect(() => rendered.update({ component: "a" })).toThrow(SpecError);
  await close();
});

test("a function fixture's provider keeps the scheme props it is given", async () => {
  const { scope, close } = scoped();
  const given: Fixture = {
    ...fixture("Box", {}, "Content"),
    provider: { props: { forceColorScheme: "dark" } },
  };

  const { container, exports } = mount(scope, given, "light", "function");

  expect(container.getAttribute(String(exports.colorSchemeAttribute))).toBe("dark");
  await close();
});

test("a look entry's scheme reaches its provider as the forced scheme", async () => {
  const { scope, close } = scoped();
  const given = { ...fixture("Box", {}, "Content"), provider: { props: {} } };

  const { container, exports } = mount(scope, given, "dark", "look");

  expect(container.getAttribute(String(exports.colorSchemeAttribute))).toBe("dark");
  await close();
});

test("an expected value that reads a custom property, in any case, is a SpecError", () => {
  expect(() => expected("color", "VAR(--solix-color-blue-6)")).toThrow(SpecError);
  expect(() => expected("color", "var(--solix-color-blue-6)")).toThrow(SpecError);
});

test("an expected value the engine does not take for the property is a SpecError, even where a probe's baseline would answer", () => {
  expect(() => expected("outline-style", "wavy")).toThrow(SpecError);
  expect(() => expected("opacity", "half")).toThrow(SpecError);
});

test("an expected value that follows its context's font, colour or size is a SpecError", () => {
  expect(() => expected("font-size", "2em")).toThrow(SpecError);
  expect(() => expected("outline-color", "currentcolor")).toThrow(SpecError);
  expect(() => expected("height", "50%")).toThrow(SpecError);
  expect(expected("height", "2.5rem").computed).toBe("40px");
});

test("a pending look's expected value is read before its fixture mounts, so a wrong value fails whatever the entry waits on", async () => {
  const { scope, close } = scoped();
  const entry = {
    fixture: fixture("Button.Group", {}, "One"),
    property: "color",
    value: "VAR(--solix-color-blue-6)",
    status: { until: "Button 18", fails: { export: "Button.Group" } },
  } as const;

  await expect(checkLook(scope, entry)).rejects.toBeInstanceOf(SpecError);
  await close();
});

test("a part reads its stable class from the build", async () => {
  const { scope, close } = scoped();

  const { root, parts, classOf } = mount(scope, fixture("Button", {}, "Save"), "light", "look");

  expect(parts()).toEqual(["root"]);
  expect(root.classList.contains(classOf({ part: "root" }))).toBe(true);
  expect(parts("TabsTab")).toEqual([]);
  await close();
});

test("a hovered or pressed part is let go once the test ends, so the next mount is neither", async () => {
  for (const state of ["hover", "pressed"] as const) {
    const first = scoped();
    const { root } = mount(first.scope, fixture("Button", {}, "Save"), "light", "look");
    await enter(first.scope, state, root);
    await first.close();

    const second = scoped();
    const next = mount(second.scope, fixture("Button", {}, "Save"), "light", "look");
    await new Promise((settled) => setTimeout(settled, 300));

    expect(next.root.matches(":hover"), `after ${state}`).toBe(false);
    expect(next.root.matches(":active"), `after ${state}`).toBe(false);
    await second.close();
  }
});
