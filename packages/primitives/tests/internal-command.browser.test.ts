import { createEffect } from "solid-js";
import { expect, test } from "vite-plus/test";
import { createBrowserCommand, createStateCommand } from "../src/internal-command";
import { mount, unmount } from "./support/browser-harness";

function recorder(kind: string, seen: string[]) {
  return {
    run: (label: string) => seen.push(`${kind} ran ${label}`),
    idle: (label: string) => seen.push(`${kind} idle ${label}`),
  };
}

test("on a page the browser renders alone, a state command and a browser command run whenever their owner is live, before its effects run and from the first run of an effect created before them too, and are idle once it is disposed", () => {
  const seen: string[] = [];
  const commands = mount(() => {
    const state = recorder("state", seen);
    const browser = recorder("browser", seen);
    const later: { browser: (label: string) => void } = { browser: () => undefined };
    createEffect(
      () => undefined,
      () => {
        later.browser("from an effect created before it");
      },
    );
    const created = {
      state: createStateCommand(state.run, state.idle),
      browser: createBrowserCommand(browser.run, browser.idle),
    };
    later.browser = created.browser;
    created.state("while created");
    created.browser("while created");
    return created;
  });

  commands.state("once mounted");
  commands.browser("once mounted");
  unmount();
  commands.state("after dispose");
  commands.browser("after dispose");
  expect(seen).toEqual([
    "state ran while created",
    "browser ran while created",
    "browser ran from an effect created before it",
    "state ran once mounted",
    "browser ran once mounted",
    "state idle after dispose",
    "browser idle after dispose",
  ]);
});
