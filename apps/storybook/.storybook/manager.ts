const idleCallbackDelay = 1;
const requestIdleCallbackName = "requestIdleCallback";

function idleCallbackByTimeout(callback: IdleRequestCallback): number {
  return window.setTimeout(
    () => callback({ didTimeout: false, timeRemaining: () => 0 }),
    idleCallbackDelay,
  );
}

if (!Reflect.has(window, requestIdleCallbackName)) {
  Object.assign(window, {
    [requestIdleCallbackName]: idleCallbackByTimeout,
    cancelIdleCallback: (handle: number) => window.clearTimeout(handle),
  });
}
