import { render } from "@solidjs/web";
import fc from "fast-check";
import { type Accessor, createSignal, onCleanup } from "solid-js";
import { expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { createFocusTrap, getHotkeyHandler } from "#/src/index.ts";
import { expectNoAxeViolations } from "#/tests/support/accessibility.ts";
import { flush, mount, mountOn, record, unmount } from "#/tests/support/browser-harness.ts";
import {
  attached,
  button,
  focusedId,
  html,
  nextTask,
  settled,
  tab,
  engineWait,
} from "#/tests/support/dom.ts";
import {
  apply,
  changes,
  engineOrder,
  expectedAfter,
  kinds,
  type Slot,
  type Step,
} from "#/tests/support/tab-order.ts";

async function trapped(container: HTMLElement, active?: Accessor<boolean>): Promise<void> {
  mountOn(() => createFocusTrap(active), container);
  await nextTask();
}

async function walk(keys: readonly ("tab" | "shift")[]): Promise<string[]> {
  const seen: string[] = [];
  for (const key of keys) {
    await tab(key === "shift");
    seen.push(focusedId());
  }
  return seen;
}

test("when it turns on, focus moves on the next task to the element marked data-autofocus, else the first tab stop, else the first focusable element, else the container", async () => {
  const marked = html(
    `<div><button id="first">First</button><input id="marked" data-autofocus aria-label="Marked"></div>`,
  );
  const plain = html(`<div><span id="text">Text</span><button id="stop">Stop</button></div>`);
  const programmatic = html(`<div><span id="only" tabindex="-1">Only</span></div>`);
  const container = html(`<div id="container" tabindex="-1"><span>Nothing to focus</span></div>`);
  const seen: string[] = [];

  for (const region of [marked, plain, programmatic, container]) {
    mountOn(() => createFocusTrap(), region);
    expect(focusedId(), "focus moves on the next task, not at once").toBe(seen.at(-1) ?? "nothing");
    await nextTask();
    seen.push(focusedId());
    unmount();
  }
  expect(seen).toEqual(["marked", "stop", "only", "container"]);
});

test("the first focus passes over an element that does not take it, such as a link without href, and lands on an editable element", async () => {
  button("opener").focus();
  const anchored = html(
    `<div role="dialog" aria-label="Notes"><a id="top" name="top"></a><h2>Notes</h2><button id="a">A</button></div>`,
  );
  await trapped(anchored);
  const first = focusedId();
  unmount();
  const editor = html(
    `<div role="dialog" aria-label="Compose"><div id="editor" contenteditable aria-label="Message"></div><button id="send">Send</button></div>`,
  );
  await trapped(editor);

  expect([first, focusedId()]).toEqual(["a", "editor"]);
});

test("the first focus does not scroll an element already in view, and scrolls one outside the viewport into view", async () => {
  const visible = html(`<div><button id="visible">Visible</button></div>`);
  await trapped(visible);
  expect(window.scrollY).toBe(0);
  unmount();
  html(`<div style="height: 3000px"></div>`);
  const below = html(`<div><button id="below">Below</button></div>`);

  await trapped(below);
  const box = below.getBoundingClientRect();
  expect(focusedId()).toBe("below");
  expect(box.top).toBeGreaterThanOrEqual(0);
  expect(box.bottom).toBeLessThanOrEqual(window.innerHeight);
  window.scrollTo(0, 0);
});

test("Tab and Shift+Tab are the browser's own, never prevented, and wrap at both ends", async () => {
  button("before");
  const region = html(
    `<div><button id="a">A</button><input id="b" aria-label="B"><textarea id="c" aria-label="C"></textarea></div>`,
  );
  button("after");
  await trapped(region);
  const keys = record(window, "keydown");

  expect(await walk(["tab", "tab", "tab", "shift", "shift", "shift"])).toEqual([
    "b",
    "c",
    "a",
    "c",
    "b",
    "a",
  ]);
  expect(keys.filter(({ key }) => key === "Tab").map((event) => event.defaultPrevented)).toEqual([
    false,
    false,
    false,
    false,
    false,
    false,
  ]);
});

test("at the edges it passes over an element that does not take focus, such as a link without href, for the next one", async () => {
  button("before");
  const region = html(
    `<div><a id="leading">Leading</a><button id="a">A</button><button id="b">B</button><a id="trailing">Trailing</a></div>`,
  );
  button("after");
  await trapped(region);

  expect(focusedId()).toBe("a");
  expect(await walk(["tab", "tab", "shift", "shift"])).toEqual(["b", "a", "b", "a"]);
});

test("the stops inside a shadow root and an editable element are the browser's, and a wrap reaches them", async () => {
  button("before");
  const region = html(
    `<div><div id="host"></div><button id="a">A</button><div id="editor" contenteditable aria-label="Editor"></div></div>`,
  );
  button("after");
  const shadow = (region.querySelector("#host") as HTMLElement).attachShadow({ mode: "open" });
  shadow.innerHTML = `<button id="s1">S1</button><button id="s2">S2</button>`;
  await trapped(region);
  const seen: string[] = [];

  for (const backwards of [false, false, false, false, true, true]) {
    await tab(backwards);
    seen.push(shadow.activeElement?.id ?? focusedId());
  }
  expect(seen).toEqual(["s2", "a", "editor", "s1", "editor", "a"]);
});

test("focus that a click, a script or a frame moves outside comes back: to the first stop from after the container, to the last from before it", async () => {
  const before = button("before");
  const region = html(`<div><button id="a">A</button><button id="b">B</button></div>`);
  const after = button("after");
  const frame = attached(document.createElement("iframe"));
  frame.srcdoc = `<button id="inner">Inner</button>`;
  await new Promise((resolve) => frame.addEventListener("load", resolve, { once: true }));
  await trapped(region);
  const seen: string[] = [];

  await userEvent.click(after);
  seen.push(focusedId());
  document.getElementById("b")?.focus();
  before.focus();
  seen.push(focusedId());
  after.focus();
  seen.push(focusedId());
  expect(seen).toEqual(["a", "b", "a"]);
  frame.contentDocument?.getElementById("inner")?.focus();
  await expect.poll(focusedId, engineWait).toBe("a");
});

test("focus that enters the page with nothing focused before it, as when it comes back from the browser's own controls, lands on the first stop", async () => {
  const before = button("before");
  const region = html(`<div><button id="a">A</button><button id="b">B</button></div>`);
  await trapped(region);
  const seen: string[] = [];

  document.getElementById("b")?.focus();
  document.getElementById("b")?.blur();
  seen.push(focusedId());
  before.focus();
  seen.push(focusedId());
  document.getElementById("b")?.focus();
  before.focus();
  seen.push(focusedId());
  expect(seen).toEqual(["nothing", "a", "b"]);
});

test("a frame inside the trap keeps its own stops, and focus that Tab moves out of it comes back", async () => {
  button("before");
  const region = html(
    `<div><button id="a">A</button><iframe title="Frame" srcdoc="<button>One</button><button>Two</button>"></iframe></div>`,
  );
  button("after");
  const frame = region.querySelector("iframe");
  await new Promise((resolve) => frame?.addEventListener("load", resolve, { once: true }));
  await trapped(region);
  const inside: boolean[] = [];

  for (let press = 0; press < 5; press += 1) {
    await tab();
    inside.push(region.contains(document.activeElement));
  }
  expect(inside).toEqual([true, true, true, true, true]);
});

test("with no stop that takes focus, focus that leaves comes back to the container", async () => {
  button("before");
  const region = html(`<div id="container" tabindex="-1"><button disabled>Off</button></div>`);
  button("after");
  await trapped(region);

  expect(await walk(["tab", "shift"])).toEqual(["container", "container"]);
});

test("after the focused element is removed, Tab keeps focus in the trap", async () => {
  button("before");
  const region = html(
    `<div><button id="a">A</button><button id="b">B</button><button id="c">C</button></div>`,
  );
  button("after");
  await trapped(region);

  document.getElementById("a")?.remove();
  expect(focusedId()).toBe("nothing");
  for (const backwards of [false, false, true]) {
    await tab(backwards);
    expect(region.contains(document.activeElement), "focus stays in the trap").toBe(true);
  }
});

test("a widget inside that handles Tab with Solid's onKeyDown keeps it, and focus stays where the widget leaves it", async () => {
  const root = attached(document.createElement("div"));
  const inserted: string[] = [];
  mount(() => {
    const dispose = render(() => {
      const trap = createFocusTrap();
      return (
        <div ref={trap} role="dialog" aria-label="Snippet">
          <button id="first">First</button>
          <textarea
            id="code"
            aria-label="Code"
            onKeyDown={getHotkeyHandler([["Tab", () => inserted.push("tab")]])}
          />
          <button id="last">Last</button>
        </div>
      );
    }, root);
    onCleanup(dispose);
  });
  await nextTask();

  document.getElementById("code")?.focus();
  await tab();
  expect([focusedId(), inserted]).toEqual(["code", ["tab"]]);
});

test("of two nested traps the inner one guards, and once it is off the outer one guards again", async () => {
  button("before");
  const outer = html(
    `<div><button id="outer-a">Outer A</button><div id="inner"><button id="inner-a">Inner A</button><button id="inner-b">Inner B</button></div><button id="outer-b">Outer B</button></div>`,
  );
  button("after");
  const [innerActive, setInnerActive] = createSignal(true);
  await trapped(outer);
  await trapped(outer.querySelector("#inner") as HTMLElement, innerActive);
  const seen = [focusedId(), ...(await walk(["tab", "tab", "shift", "shift"]))];

  setInnerActive(false);
  flush();
  seen.push(...(await walk(["tab", "tab", "tab"])));
  expect(seen).toEqual([
    "inner-a",
    "inner-b",
    "inner-a",
    "inner-b",
    "inner-a",
    "inner-b",
    "outer-b",
    "outer-a",
  ]);
});

test("of two stacked traps side by side, only the one turned on last guards, with the other made inert or not, and after its focused element is removed", async () => {
  const seen: string[][] = [];
  for (const inertBelow of [false, true]) {
    document.body.replaceChildren();
    button("before");
    const below = html(
      `<div role="dialog" aria-label="Settings"><button id="below-a">Below A</button><button id="below-b">Below B</button></div>`,
    );
    const top = html(
      `<div role="dialog" aria-label="Confirm"><button id="top-a">Top A</button><button id="top-b">Top B</button></div>`,
    );
    button("after");
    await trapped(below);
    below.inert = inertBelow;
    await trapped(top);
    const walked = [focusedId(), ...(await walk(["tab", "tab", "shift", "shift"]))];
    document.getElementById("top-a")?.remove();
    seen.push([...walked, ...(await walk(["tab", "tab"]))]);
    unmount();
  }
  expect(seen).toEqual([
    ["top-a", "top-b", "top-a", "top-b", "top-a", "top-b", "top-b"],
    ["top-a", "top-b", "top-a", "top-b", "top-a", "top-b", "top-b"],
  ]);
});

test("active is live: off, it moves no focus; on, it moves focus in and holds it; off again, Tab leaves", async () => {
  const region = html(`<div><button id="a">A</button><button id="b">B</button></div>`);
  button("outside");
  const [active, setActive] = createSignal(false);
  await trapped(region, active);
  const seen: string[] = [focusedId()];

  setActive(true);
  flush();
  await nextTask();
  seen.push(focusedId(), ...(await walk(["tab", "tab"])));
  setActive(false);
  flush();
  seen.push(...(await walk(["tab", "tab"])));
  expect(seen).toEqual(["nothing", "a", "b", "a", "b", "outside"]);
});

test("a container inside a shadow root keeps focus there", async () => {
  const host = attached(document.createElement("div"));
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `<div><button id="a">A</button><button id="b">B</button></div>`;
  button("outside");
  await trapped(shadow.firstElementChild as HTMLElement);
  const seen: string[] = [];

  for (let press = 0; press < 3; press += 1) {
    await tab();
    seen.push(shadow.activeElement?.id ?? focusedId());
  }
  expect(seen).toEqual(["b", "a", "b"]);
});

test("a trapped dialog, with focus inside it, has no WCAG 2.2 A or AA violation", async () => {
  const region = html(`<div role="dialog" aria-modal="true" aria-labelledby="title">
    <h2 id="title">Filters</h2>
    <label for="query">Query</label><input id="query" type="search">
    <fieldset><legend>Size</legend>
      <label><input type="radio" name="size" checked> Small</label>
      <label><input type="radio" name="size"> Large</label>
    </fieldset>
    <button type="button">Apply</button>
  </div>`);
  await trapped(region);
  await tab();

  expect(region.contains(document.activeElement)).toBe(true);
  await expectNoAxeViolations(region);
});

const step: fc.Arbitrary<Step> = fc.oneof(
  { weight: 3, arbitrary: fc.record({ type: fc.constant("tab"), backwards: fc.boolean() }) },
  fc.record({ type: fc.constant("add"), at: fc.nat(), kind: fc.constantFrom(...kinds) }),
  fc.record({ type: fc.constant("remove"), at: fc.nat() }),
  fc.record({ type: fc.constant("toggle"), at: fc.nat(), change: fc.constantFrom(...changes) }),
) as fc.Arbitrary<Step>;

test("for generated Tab and Shift+Tab presses among stops that are added, removed, disabled, hidden and made inert, focus never leaves the trap and lands where the engine's own Tab order says", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(fc.constantFrom(...kinds), { minLength: 0, maxLength: 4 }),
      fc.array(step, { minLength: 1, maxLength: 12 }),
      async (initial, steps) => {
        document.body.replaceChildren();
        html(`<button>Before</button>`);
        const container = html(`<div id="trap" tabindex="-1" aria-label="Trap"></div>`);
        const mirrorStart = html(`<button>Mirror start</button>`);
        const mirror = html(`<div aria-label="Mirror"></div>`);
        html(`<button>Mirror end</button>`);
        const suspender = html(`<div></div>`);
        html(`<button>After</button>`);
        const slots: Slot[] = [];
        const mirrored: Slot[] = [];
        for (const [index, kind] of initial.entries()) {
          apply({ type: "add", at: index, kind }, slots, container, `trap start ${index}`);
          apply({ type: "add", at: index, kind }, mirrored, mirror, `mirror start ${index}`);
        }
        let order = await engineOrder(mirrorStart, mirrored);
        mirrorStart.blur();
        await trapped(container);
        const [suspended, setSuspended] = createSignal(false);
        mountOn(() => createFocusTrap(suspended), suspender);
        try {
          for (const [index, current] of steps.entries()) {
            if (current.type !== "tab") {
              const before = document.activeElement;
              setSuspended(true);
              flush();
              apply(current, mirrored, mirror, `mirror step ${index}`);
              order = await engineOrder(mirrorStart, mirrored);
              if (before instanceof HTMLElement && before !== document.body) before.focus();
              else (document.activeElement as HTMLElement | null)?.blur();
              setSuspended(false);
              flush();
              apply(current, slots, container, `trap step ${index}`);
              await settled();
              continue;
            }
            const expected = expectedAfter(
              document.activeElement,
              current.backwards,
              order,
              slots,
              container,
            );
            await tab(current.backwards);
            expect(container.contains(document.activeElement), "focus stays in the trap").toBe(
              true,
            );
            if (expected !== undefined) {
              expect(document.activeElement, "focus lands where the engine's order says").toBe(
                expected,
              );
            }
          }
        } finally {
          unmount();
        }
      },
    ),
    { numRuns: 25 },
  );
});
