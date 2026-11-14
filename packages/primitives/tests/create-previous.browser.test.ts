import { createSignal, flush } from "solid-js";
import { expect, test } from "vite-plus/test";
import { createPrevious } from "../src/index";
import { mount } from "./support/browser-harness";

test("it is undefined until the value changes, then the value before the latest change", () => {
  const [value, setValue] = createSignal(1);
  const previous = mount(() => createPrevious(value));
  const seen: (number | undefined)[] = [previous()];

  setValue(2);
  flush();
  seen.push(previous());
  setValue(4);
  flush();
  seen.push(previous());
  expect(seen).toEqual([undefined, 1, 2]);
});

test("a read that returns the value it already held is not a change", () => {
  const [left, setLeft] = createSignal(1);
  const [right, setRight] = createSignal(2);
  const previous = mount(() => createPrevious(() => left() + right()));

  setLeft(5);
  flush();
  setLeft(2);
  setRight(1);
  flush();
  expect(previous()).toBe(7);
  setLeft(0);
  setRight(3);
  flush();
  expect(previous()).toBe(7);
});

test("several writes before a flush are one change, from the value before them", () => {
  const [value, setValue] = createSignal("a");
  const previous = mount(() => createPrevious(value));

  setValue("b");
  setValue("c");
  flush();
  expect(previous()).toBe("a");
});
