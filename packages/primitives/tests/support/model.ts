import type fc from "fast-check";
import { flush } from "solid-js";

export type Tick<S> = { staged: S; committed: S };

export function command<M extends object, R>(
  label: string,
  run: (model: M, real: R) => void,
): fc.Command<M, R> {
  return { check: () => true, run, toString: () => label };
}

export function flushCommand<M extends Tick<unknown>, R>(
  observe: (model: M, real: R) => void,
): fc.Command<M, R> {
  return command<M, R>("flush", (model, real) => {
    flush();
    model.committed = model.staged;
    observe(model, real);
  });
}
