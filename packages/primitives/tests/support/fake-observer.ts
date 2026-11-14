import { replaced } from "./replace";

type Deliver = (entries: unknown[], observer: unknown) => void;

export type FakeObserver = { deliver: (entries: unknown[]) => void; restore: () => void };

export function fakeObserver(name: string): FakeObserver {
  const made: { deliver: Deliver | undefined; observer: unknown } = {
    deliver: undefined,
    observer: undefined,
  };
  const Fake = class {
    constructor(callback: Deliver) {
      made.deliver = callback;
      made.observer = this;
    }

    observe(): void {
      return undefined;
    }

    disconnect(): void {
      made.deliver = undefined;
    }
  };
  return {
    deliver: (entries) => made.deliver?.(entries, made.observer),
    restore: replaced(window, name, Fake),
  };
}
