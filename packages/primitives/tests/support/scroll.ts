import fc from "fast-check";
import { onTestFinished } from "vite-plus/test";
import { flush } from "#/tests/support/browser-harness.ts";
import { nextTask, reported, stylesheetArrives } from "#/tests/support/dom.ts";
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

function scrollEventsSeen(): { count: () => number; stop: () => void } {
  const seen = { events: 0 };
  const count = () => {
    seen.events += 1;
  };
  window.addEventListener("scroll", count);
  return { count: () => seen.events, stop: () => window.removeEventListener("scroll", count) };
}

export async function scrolledDownATallPage(y: number): Promise<HTMLDivElement> {
  const spacer = tallPage();
  const seen = scrollEventsSeen();
  try {
    window.scrollTo({ top: y, behavior: "instant" });
    await reported(() => seen.count() > 0, `the scroll event of the window's scroll to ${y}`);
  } finally {
    seen.stop();
  }
  return spacer;
}

const shortenedByTheLateStylesheet = "shortened-by-the-late-stylesheet";

export async function theEngineScrollsAsAStylesheetShortens(spacer: HTMLElement): Promise<void> {
  const seen = scrollEventsSeen();
  try {
    spacer.classList.add(shortenedByTheLateStylesheet);
    stylesheetArrives(`.${shortenedByTheLateStylesheet} { height: 0 !important; }`);
    await reported(
      () => seen.count() > 0,
      "a scroll event for the window's position that the stylesheet's layout clamped",
    );
  } finally {
    seen.stop();
  }
}
