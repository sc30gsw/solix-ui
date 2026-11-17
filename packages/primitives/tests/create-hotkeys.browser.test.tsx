import { type JSX, render } from "@solidjs/web";
import { createSignal, onCleanup } from "solid-js";
import { expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { createHotkeys, getHotkeyHandler, type HotkeyItem } from "#/src/index.ts";
import { flush, mount, unmount } from "#/tests/support/browser-harness.ts";
import { attached } from "#/tests/support/dom.ts";

function recorder() {
  const calls: string[] = [];
  const item = (hotkey: string): HotkeyItem => [hotkey, () => calls.push(hotkey)];
  return { calls, item };
}

function focused<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  parent: ParentNode = document.body,
): HTMLElementTagNameMap[K] {
  const element = attached(document.createElement(tag), parent);
  element.tabIndex = 0;
  element.focus();
  return element;
}

function rendered(root: "document" | "element", app: () => JSX.Element): void {
  mount(() => {
    const dispose =
      root === "document"
        ? render(() => {
            const tree = app();
            if (tree instanceof Node) document.body.append(tree);
            return tree;
          }, document)
        : render(app, attached(document.createElement("div")));
    onCleanup(dispose);
  });
}

test("keys typed in an input, a textarea, a select or an editable element are ignored by default", async () => {
  const { calls, item } = recorder();
  mount(() => createHotkeys([item("a")]));

  for (const tag of ["input", "textarea", "select"] as const) {
    focused(tag);
    await userEvent.keyboard("a");
  }
  const editable = focused("div");
  editable.contentEditable = "true";
  editable.focus();
  await userEvent.keyboard("a");
  focused("div");
  await userEvent.keyboard("a");
  expect(calls).toEqual(["a"]);
});

test("tagsToIgnore and triggerOnContentEditable are live and read on every key", async () => {
  const { calls, item } = recorder();
  const [tags, setTags] = createSignal<readonly string[]>(["textarea"]);
  const [editable, setEditable] = createSignal(false);
  mount(() => createHotkeys([item("a")], tags, editable));

  focused("input");
  await userEvent.keyboard("a");
  focused("textarea");
  await userEvent.keyboard("a");
  setTags([]);
  flush();
  await userEvent.keyboard("a");
  const element = focused("div");
  element.contentEditable = "true";
  element.focus();
  await userEvent.keyboard("a");
  setEditable(true);
  flush();
  await userEvent.keyboard("a");
  expect(calls).toEqual(["a", "a", "a"]);
});

test("an input inside an open shadow root is ignored too", async () => {
  const { calls, item } = recorder();
  mount(() => createHotkeys([item("a")]));
  const host = attached(document.createElement("div"));
  focused("input", host.attachShadow({ mode: "open" }));

  await userEvent.keyboard("a");
  expect(calls).toEqual([]);
});

test.each(["document", "element"] as const)(
  "it runs after Solid's delegated onKeyDown handlers, rendered into the %s, so a widget that handles a key keeps it",
  async (root) => {
    const calls: string[] = [];
    rendered(root, () => {
      createHotkeys([["Escape", () => calls.push("page")]]);
      return (
        <div
          id="widget"
          tabindex="0"
          onKeyDown={getHotkeyHandler([["Escape", () => calls.push("widget")]])}
        >
          Widget
        </div>
      );
    });
    document.getElementById("widget")?.focus();

    await userEvent.keyboard("{Escape}");
    document.getElementById("widget")?.blur();
    await userEvent.keyboard("{Escape}");
    expect(calls).toEqual(["widget", "page"]);
  },
);

test("of two nested elements with Solid's onKeyDown, the inner one handles a key first and the outer one leaves it", async () => {
  const calls: string[] = [];
  rendered("element", () => (
    <div
      tabindex="0"
      id="outer"
      onKeyDown={getHotkeyHandler([["Escape", () => calls.push("outer")]])}
    >
      <input
        id="inner"
        aria-label="Inner"
        onKeyDown={getHotkeyHandler([["Escape", () => calls.push("inner")]])}
      />
    </div>
  ));

  document.getElementById("inner")?.focus();
  await userEvent.keyboard("{Escape}");
  document.getElementById("outer")?.focus();
  await userEvent.keyboard("{Escape}");
  expect(calls).toEqual(["inner", "outer"]);
});

test("the list is read on every key, so an accessor stays live, and the listener goes when the owner is disposed", async () => {
  const { calls, item } = recorder();
  const [items, setItems] = createSignal<readonly HotkeyItem[]>([item("a")]);
  mount(() => createHotkeys(items));
  focused("div");

  await userEvent.keyboard("a");
  setItems([item("b")]);
  flush();
  await userEvent.keyboard("a");
  await userEvent.keyboard("b");
  unmount();
  await userEvent.keyboard("b");
  expect(calls).toEqual(["a", "b"]);
});
