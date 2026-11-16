import { createEffect, onCleanup, untrack } from "solid-js";
import { type BrowserCallback, createBrowserMemo } from "./internal-browser-value";

type Command<Args extends unknown[], R> = (...args: Args) => R;

export type StateCommandBody<Args extends unknown[], R> = (...args: Args) => R;

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
  run: StateCommandBody<Args, R>,
  idle: Command<Args, R>,
): Command<Args, R> {
  return whileOwned(() => true, run, idle);
}

export function createBrowserCommand<Args extends unknown[], R>(
  run: BrowserCallback<Args, R>,
  idle: Command<Args, R>,
): Command<Args, R> {
  const hydrated = createBrowserMemo(() => true, false);
  const effects = { ran: false };
  createEffect(
    () => undefined,
    () => {
      effects.ran = true;
    },
  );
  return whileOwned(() => effects.ran || untrack(hydrated), run, idle);
}
