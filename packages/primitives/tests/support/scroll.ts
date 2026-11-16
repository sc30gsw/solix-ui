import fc from "fast-check";
import { onTestFinished } from "vite-plus/test";
import { flush } from "./browser-harness";
import { nextTask } from "./dom";
import { replaced } from "./replace";

export type ScrollStub = {
  to: (y: number) => void;
  resize: () => void;
  restore: () => void;
};

export const scrollGrid = 25;

export function onScrollGrid(steps: number): fc.Arbitrary<number> {
  return fc.integer({ min: 0, max: steps }).map((step) => step * scrollGrid);
}

export function stubbedScroll(start: number): ScrollStub {
  const restores = [replaced(window, "scrollY", start)];
  const restore = () => {
    for (const undo of restores.splice(0).reverse()) undo();
  };
  onTestFinished(restore);
  return {
    to: (y) => {
      restores.push(replaced(window, "scrollY", y));
      window.dispatchEvent(new Event("scroll"));
    },
    resize: () => {
      window.dispatchEvent(new Event("resize"));
    },
    restore,
  };
}

export async function applied(): Promise<void> {
  await nextTask();
  flush();
}

export function tallPage(): HTMLDivElement {
  const spacer = document.createElement("div");
  spacer.style.width = "4000px";
  spacer.style.height = "6000px";
  document.body.append(spacer);
  return spacer;
}
