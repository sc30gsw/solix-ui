import { createEffect, createMemo, createSignal } from "solid-js";
import { type LiveConfig, sameValue } from "#/src/internal-equal.ts";
import type { RefSetter } from "#/src/types.ts";

export type Attach<Args extends unknown[]> = (...args: Args) => () => void;

export function createAttachment(attach: Attach<[]>): void;
export function createAttachment<C>(
  attach: Attach<[config: C]>,
  config: LiveConfig<C | undefined>,
): void;
export function createAttachment<C>(
  ...args: [attach: Attach<[]>] | [attach: Attach<[config: C]>, config: LiveConfig<C | undefined>]
): void {
  if (args.length === 1) {
    createEffect(
      () => undefined,
      () => args[0](),
    );
    return;
  }
  const current = createMemo<C | undefined>(args[1], { equals: sameValue });
  createEffect(current, (value) => (value === undefined ? undefined : args[0](value)));
}

export function createElementAttachmentWhen<E extends Element, C>(
  attach: Attach<[config: C]>,
  config: LiveConfig<C | undefined, [element: E | undefined]>,
): RefSetter<E> {
  const [element, setElement] = createSignal<E | undefined>(undefined);
  createAttachment(attach, () => config(element()));
  return (next) => {
    setElement(() => next);
  };
}

export function createElementAttachment<E extends Element>(
  attach: Attach<[element: E]>,
): RefSetter<E>;
export function createElementAttachment<E extends Element, C>(
  attach: Attach<[element: E, config: C]>,
  config: LiveConfig<C>,
): RefSetter<E>;
export function createElementAttachment<E extends Element, C>(
  ...args:
    | [attach: Attach<[element: E]>]
    | [attach: Attach<[element: E, config: C]>, config: LiveConfig<C>]
): RefSetter<E> {
  if (args.length === 1) {
    return createElementAttachmentWhen<E, E>(
      (element) => args[0](element),
      (element) => element,
    );
  }
  return createElementAttachmentWhen<E, { element: E; config: C }>(
    (current) => args[0](current.element, current.config),
    (element) => element && { element, config: args[1]() },
  );
}
