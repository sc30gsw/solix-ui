export function pageLoaded(): Promise<void> {
  return new Promise((resolve) => {
    if (document.readyState === "complete") resolve();
    else window.addEventListener("load", () => resolve(), { once: true });
  });
}

await pageLoaded();
