import fc from "fast-check";
import { createSignal } from "solid-js";
import { expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { createFocusTrap } from "../src/index";
import { axeViolations } from "./support/accessibility";
import { attached, flush, mount, unmount } from "./support/browser-harness";

const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const settled = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );

function tab(backwards = false): Promise<void> {
  return userEvent.keyboard(backwards ? "{Shift>}{Tab}{/Shift}" : "{Tab}");
}

function html<E extends HTMLElement = HTMLElement>(markup: string): E {
  const holder = document.createElement("div");
  holder.innerHTML = markup.trim();
  return attached(holder.firstElementChild as E);
}

function focusedId(): string {
  const active = document.activeElement;
  return active === null || active === document.body ? "nothing" : active.id || active.tagName;
}

async function trapped(container: HTMLElement, active?: () => boolean): Promise<void> {
  const ref = mount(() => createFocusTrap(active));
  ref(container);
  flush();
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
    const ref = mount(() => createFocusTrap());
    ref(region);
    flush();
    expect(focusedId(), "focus moves on the next task, not at once").toBe(seen.at(-1) ?? "nothing");
    await nextTask();
    seen.push(focusedId());
    unmount();
  }
  expect(seen).toEqual(["marked", "stop", "only", "container"]);
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

test("Tab and Shift+Tab from the real keyboard wrap at both ends", async () => {
  const region = html(
    `<div><button id="a">A</button><input id="b" aria-label="B"><textarea id="c" aria-label="C"></textarea></div>`,
  );
  html(`<button id="outside">Outside</button>`);
  await trapped(region);

  expect(await walk(["tab", "tab", "tab", "shift", "shift", "shift"])).toEqual([
    "b",
    "c",
    "a",
    "c",
    "b",
    "a",
  ]);
});

test("the stops follow the browser's order: positive tabindex ascending, then document order, skipping disabled, inert, hidden and tabindex -1 elements", async () => {
  const region = html(`<div>
    <button id="zero-a">Zero A</button>
    <button id="two" tabindex="2">Two</button>
    <button id="disabled" disabled>Disabled</button>
    <div inert><button id="inert">Inert</button></div>
    <button id="hidden" hidden>Hidden</button>
    <div style="visibility: hidden"><button id="invisible">Invisible</button></div>
    <details><summary id="summary" tabindex="0">More</summary><button id="closed">Closed</button></details>
    <button id="minus" tabindex="-1">Minus</button>
    <button id="one" tabindex="1">One</button>
    <div id="zero-b" tabindex="0">Zero B</div>
  </div>`);
  await trapped(region);

  expect(focusedId()).toBe("one");
  expect(await walk(["tab", "tab", "tab", "tab", "tab", "shift"])).toEqual([
    "two",
    "zero-a",
    "summary",
    "zero-b",
    "one",
    "zero-b",
  ]);
});

test("a radio group is one stop: the checked radio, or with none checked the first going forwards and the last going backwards", async () => {
  const region = html(`<div>
    <button id="before">Before</button>
    <input type="radio" name="size" id="small" aria-label="Small">
    <input type="radio" name="size" id="large" aria-label="Large">
    <input type="radio" name="tone" id="light" aria-label="Light">
    <input type="radio" name="tone" id="dark" aria-label="Dark" checked>
    <button id="after">After</button>
  </div>`);
  await trapped(region);

  expect(await walk(["tab", "tab", "tab", "shift", "shift", "shift"])).toEqual([
    "small",
    "dark",
    "after",
    "dark",
    "large",
    "before",
  ]);
});

test("from the container Tab goes to the first stop and Shift+Tab to the last, and from an element that is not a stop it continues from its position", async () => {
  const region = html(`<div id="container" tabindex="-1">
    <button id="a">A</button><span id="note" tabindex="-1">Note</span><button id="b">B</button><button id="c">C</button>
  </div>`);
  await trapped(region);
  const seen: string[] = [];

  for (const [from, backwards] of [
    ["container", false],
    ["container", true],
    ["note", false],
    ["note", true],
  ] as const) {
    document.getElementById(from)?.focus();
    await tab(backwards);
    seen.push(focusedId());
  }
  expect(seen).toEqual(["a", "c", "b", "a"]);
});

test("with no stop, Tab keeps focus where it is and its default is prevented", async () => {
  const region = html(`<div id="container" tabindex="-1"><button disabled>Off</button></div>`);
  html(`<button id="outside">Outside</button>`);
  await trapped(region);
  const prevented: boolean[] = [];
  window.addEventListener("keydown", (event) => prevented.push(event.defaultPrevented));

  await tab();
  expect([focusedId(), prevented]).toEqual(["container", [true]]);
});

test("a Tab pressed while nothing has focus, such as after the focused element was removed, moves focus to the first stop, and Shift+Tab to the last", async () => {
  html(`<button id="page">Page</button>`);
  const region = html(
    `<div><button id="a">A</button><button id="b">B</button><button id="c">C</button></div>`,
  );
  await trapped(region);
  const seen: string[] = [];

  document.getElementById("a")?.remove();
  seen.push(focusedId());
  await tab();
  seen.push(focusedId());
  document.getElementById("b")?.remove();
  await tab(true);
  seen.push(focusedId());
  expect(seen).toEqual(["nothing", "b", "c"]);
});

test("an element with tab stops of its own keeps the browser's Tab, and focus that leaves the container comes back on the next task", async () => {
  const region = html(
    `<div><button id="first">First</button><input id="date" type="date" aria-label="Date"></div>`,
  );
  html(`<button id="outside">Outside</button>`);
  await trapped(region);
  const prevented: boolean[] = [];
  window.addEventListener("keydown", (event) => prevented.push(event.defaultPrevented));
  const date = document.getElementById("date") as HTMLInputElement;
  const seen: string[] = [];

  date.focus();
  for (let press = 0; press < 5; press += 1) {
    await tab();
    await nextTask();
    seen.push(region.contains(document.activeElement) ? "inside" : focusedId());
  }
  expect(prevented[0], "the first Tab from the date input is the browser's").toBe(false);
  expect(seen).toEqual(["inside", "inside", "inside", "inside", "inside"]);
});

test("a Tab whose default a handler inside already prevented is left alone", async () => {
  const region = html(`<div><button id="a">A</button><button id="b">B</button></div>`);
  await trapped(region);
  region.addEventListener("keydown", (event) => event.preventDefault(), { capture: true });

  await tab();
  expect(focusedId()).toBe("a");
});

test("of two nested traps the inner one handles Tab and the outer one leaves it", async () => {
  const outer = html(
    `<div><button id="outer-a">Outer A</button><div id="inner"><button id="inner-a">Inner A</button><button id="inner-b">Inner B</button></div><button id="outer-b">Outer B</button></div>`,
  );
  await trapped(outer);
  await trapped(document.getElementById("inner") as HTMLElement);

  expect(focusedId()).toBe("inner-a");
  expect(await walk(["tab", "tab", "shift", "shift"])).toEqual([
    "inner-b",
    "inner-a",
    "inner-b",
    "inner-a",
  ]);
});

test("active is live: off, it adds no listener and moves no focus; on, it moves focus in and holds it; off again, Tab leaves", async () => {
  const region = html(`<div><button id="a">A</button><button id="b">B</button></div>`);
  html(`<button id="outside">Outside</button>`);
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

test("a container inside a shadow root traps Tab there", async () => {
  const host = attached(document.createElement("div"));
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `<div><button id="a">A</button><button id="b">B</button></div>`;
  html(`<button id="outside">Outside</button>`);
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
  expect(await axeViolations(region)).toEqual([]);
});

type Kind = "button" | "input" | "textarea" | "div";
type Slot = { wrapper: HTMLElement; control: HTMLElement; kind: Kind };

function canHoldFocus({ wrapper, control, kind }: Slot): boolean {
  const disabled = kind !== "div" && control.hasAttribute("disabled");
  return !disabled && !wrapper.hidden && !wrapper.inert && control.isConnected;
}
type Change = "disabled" | "minus" | "hidden" | "inert";
type Step =
  | { type: "tab"; backwards: boolean }
  | { type: "add"; at: number; kind: Kind }
  | { type: "remove"; at: number }
  | { type: "toggle"; at: number; change: Change };

const kinds: readonly Kind[] = ["button", "input", "textarea", "div"];
const changes: readonly Change[] = ["disabled", "minus", "hidden", "inert"];

function slot(kind: Kind, name: string): Slot {
  const wrapper = document.createElement("div");
  const control = document.createElement(kind);
  if (kind === "div") control.tabIndex = 0;
  control.setAttribute("aria-label", name);
  if (kind === "button") control.textContent = name;
  wrapper.append(control);
  return { wrapper, control, kind };
}

function apply(step: Step, slots: Slot[], container: HTMLElement, name: string): void {
  if (step.type === "add") {
    const added = slot(step.kind, name);
    const at = slots.length === 0 ? 0 : step.at % (slots.length + 1);
    container.insertBefore(added.wrapper, slots[at]?.wrapper ?? null);
    slots.splice(at, 0, added);
    return;
  }
  if (step.type === "tab" || slots.length === 0) return;
  const at = step.at % slots.length;
  const target = slots[at];
  if (step.type === "remove") {
    target.wrapper.remove();
    slots.splice(at, 1);
    return;
  }
  if (step.change === "disabled") {
    target.control.toggleAttribute("disabled", !target.control.hasAttribute("disabled"));
  } else if (step.change === "minus") {
    target.control.tabIndex = target.control.tabIndex === -1 ? 0 : -1;
  } else if (step.change === "hidden") {
    target.wrapper.hidden = !target.wrapper.hidden;
  } else {
    target.wrapper.inert = !target.wrapper.inert;
  }
}

async function engineOrder(start: HTMLElement, mirror: Slot[]): Promise<number[]> {
  const order: number[] = [];
  start.focus();
  for (let press = 0; press <= mirror.length; press += 1) {
    await tab();
    const at = mirror.findIndex(({ control }) => control === document.activeElement);
    if (at === -1) break;
    order.push(at);
  }
  return order;
}

function expectedAfter(
  before: Element | null,
  backwards: boolean,
  order: readonly number[],
  slots: readonly Slot[],
  container: HTMLElement,
): Element {
  const at = slots.findIndex(({ control }) => control === before);
  if (order.length === 0)
    return at !== -1 && canHoldFocus(slots[at]) ? slots[at].control : container;
  const sequence = backwards ? [...order].reverse() : [...order];
  if (at === -1) return slots[sequence[0]].control;
  const position = order.indexOf(at);
  if (position !== -1) {
    const next = (position + (backwards ? order.length - 1 : 1)) % order.length;
    return slots[order[next]].control;
  }
  const following = sequence.find((index) => (backwards ? index < at : index > at));
  return slots[following ?? sequence[0]].control;
}

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
        const container = html(`<div id="trap" tabindex="-1" aria-label="Trap"></div>`);
        const mirrorStart = html(`<button>Mirror start</button>`);
        const mirror = html(`<div aria-label="Mirror"></div>`);
        html(`<button>Mirror end</button>`);
        const slots: Slot[] = [];
        const mirrored: Slot[] = [];
        for (const [index, kind] of initial.entries()) {
          apply({ type: "add", at: index, kind }, slots, container, `trap ${index}`);
          apply({ type: "add", at: index, kind }, mirrored, mirror, `mirror ${index}`);
        }
        let order = await engineOrder(mirrorStart, mirrored);
        mirrorStart.blur();
        await trapped(container);
        for (const [index, current] of steps.entries()) {
          if (current.type !== "tab") {
            const before = document.activeElement;
            apply(current, mirrored, mirror, `mirror ${index}`);
            order = await engineOrder(mirrorStart, mirrored);
            if (before instanceof HTMLElement && before !== document.body) before.focus();
            else (document.activeElement as HTMLElement | null)?.blur();
            apply(current, slots, container, `trap ${index}`);
            await settled();
            continue;
          }
          const before = document.activeElement;
          const expected = expectedAfter(before, current.backwards, order, slots, container);
          await tab(current.backwards);
          expect(container.contains(document.activeElement), "focus stays in the trap").toBe(true);
          expect(document.activeElement, "focus lands where the engine's order says").toBe(
            expected,
          );
        }
        unmount();
      },
    ),
    { numRuns: 25 },
  );
});
