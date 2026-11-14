import { createSignal, flush } from "solid-js";
import { afterEach, expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser/context";
import { createInputState } from "../src/index";
import { mount, watch } from "./support/browser-harness";

function control<E extends HTMLElement>(
  element: E,
  listen: string,
  handler: (event: Event) => void,
): E {
  element.addEventListener(listen, handler);
  document.body.append(element);
  return element;
}

afterEach(() => {
  document.body.replaceChildren();
});

test("it stores a value, and an empty string, 0, false, null and undefined as they are", () => {
  const [value, onChange] = mount(() => createInputState<unknown>("start"));
  const stored: unknown[] = [];

  for (const next of ["text", "", 0, false, null, undefined]) {
    onChange(next);
    flush();
    stored.push(value());
  }
  expect(stored).toEqual(["text", "", 0, false, null, undefined]);
});

test("it stores what an updater returns for the current value", () => {
  const [value, onChange] = mount(() => createInputState(1));

  onChange((current) => current + 1);
  onChange((current) => current * 10);
  flush();
  expect(value()).toBe(20);
});

test("given the input event of a text field, it stores the field's value", async () => {
  const [value, onChange] = mount(() => createInputState(""));
  const field = control(document.createElement("input"), "input", onChange);

  await userEvent.type(field, "solid");
  flush();
  expect(value()).toBe("solid");
});

test("given the change event of a checkbox, it stores whether it is checked", async () => {
  const [value, onChange] = mount(() => createInputState(false));
  const checkbox = control(document.createElement("input"), "change", onChange);
  checkbox.type = "checkbox";

  await userEvent.click(checkbox);
  flush();
  expect(value()).toBe(true);
  await userEvent.click(checkbox);
  flush();
  expect(value()).toBe(false);
});

test("given the change event of a select, it stores the selected value", async () => {
  const [value, onChange] = mount(() => createInputState("a"));
  const select = control(document.createElement("select"), "change", onChange);
  select.append(new Option("A", "a"), new Option("B", "b"));

  await userEvent.selectOptions(select, "b");
  flush();
  expect(value()).toBe("b");
});

test("given an event after its dispatch, it reads the control from the target", () => {
  const [value, onChange] = mount(() => createInputState(""));
  const field = document.createElement("input");
  const event = new Event("input");

  field.value = "late";
  field.dispatchEvent(event);
  onChange(event);
  flush();
  expect(value()).toBe("late");
});

test("changes before a flush resolve to the last one, and the initial value is read once", () => {
  const [initial, setInitial] = createSignal("first");
  const { onChange, seen } = mount(() => {
    const [value, onChange] = createInputState(initial);
    return { onChange, seen: watch(value) };
  });

  setInitial("changed");
  onChange("b");
  onChange("first");
  flush();
  onChange("c");
  flush();
  expect(seen).toEqual(["first", "c"]);
});
