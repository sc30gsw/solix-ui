const idleCallbackDelay = 1;
const idleCallbackMethod = "requestIdleCallback";

function idleCallbackByTimeout(callback: IdleRequestCallback): number {
  return window.setTimeout(
    () => callback({ didTimeout: false, timeRemaining: () => 0 }),
    idleCallbackDelay,
  );
}

if (!Reflect.has(window, idleCallbackMethod)) {
  Object.assign(window, {
    [idleCallbackMethod]: idleCallbackByTimeout,
    cancelIdleCallback: (handle: number) => window.clearTimeout(handle),
  });
}
