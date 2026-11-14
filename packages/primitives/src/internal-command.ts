import { onCleanup, untrack } from "solid-js";
import { createClientMemo } from "./internal-browser-value";

type Command<Args extends unknown[], R> = (...args: Args) => R;

function whileOwned<Args extends unknown[], R>(
  ready: () => boolean,
  run: Command<Args, R>,
  idle: Command<Args, R>,
): Command<Args, R> {
  const owner = { live: true };
  onCleanup(() => {
    owner.live = false;
  });
  return (...args) => (owner.live && ready() ? run(...args) : idle(...args));
}

export function createStateCommand<Args extends unknown[], R>(
  run: Command<Args, R>,
  idle: Command<Args, R>,
): Command<Args, R> {
  return whileOwned(() => true, run, idle);
}

export function createBrowserCommand<Args extends unknown[], R>(
  run: Command<Args, R>,
  idle: Command<Args, R>,
): Command<Args, R> {
  const inBrowser = createClientMemo(() => true, false);
  return whileOwned(() => untrack(inBrowser), run, idle);
}
