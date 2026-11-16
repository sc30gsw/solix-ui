import "./support/browser-harness";

const engineTimeout = 2_000;

export const engineWait = { timeout: engineTimeout };

export type Pending = ReturnType<typeof setTimeout>;

export const fakedTimers = ["setTimeout", "setInterval"];

export const sizes = [1, 2].length > 1;

export const computedWait = { timeout: 2 * engineTimeout };

export function nextFrame(): Promise<number> {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

const spread = [window, "setTimeout"] as const;

export const spreadArguments: unknown = Reflect.get(...spread);
