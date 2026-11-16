import "./support/browser-harness";

const engineTimeout = 2_000;

export const engineWait = { timeout: engineTimeout };

export type Pending = ReturnType<typeof setTimeout>;

export const fakedTimers = ["setTimeout", "setInterval"];

export const sizes = [1, 2].length > 1;
