import fc from "fast-check";
import { onTestFinished } from "vite-plus/test";
import { flush } from "#/tests/support/browser-harness.ts";
import { nextTask } from "#/tests/support/dom.ts";
import { replaced } from "#/tests/support/replace.ts";

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

const shortenedByTheLateStylesheet = "shortened-by-the-late-stylesheet";

export function stylesheetArrivesAndShortens(page: HTMLElement): void {
  page.classList.add(shortenedByTheLateStylesheet);
  const stylesheet = document.createElement("style");
  stylesheet.textContent = `.${shortenedByTheLateStylesheet} { height: 0 !important; }`;
  document.head.append(stylesheet);
  onTestFinished(() => stylesheet.remove());
}
