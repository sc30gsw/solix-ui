import { chromium, firefox } from "playwright";

const engines = { chromium, firefox };
const [engineName = "firefox", url = "http://127.0.0.1:4400/", runs = "3"] = process.argv.slice(2);
const executablePath = process.env.DIAG_EXECUTABLE || undefined;
const browser = await engines[engineName].launch({ executablePath });

function instrument() {
  const log = [];
  window.__anchorLog = log;
  let last = 0;
  let step = "load";
  window.__anchorStep = (name) => {
    step = name;
    last = window.scrollY;
  };
  const shownPanels = () => {
    const roots = [
      document,
      ...[...document.querySelectorAll("*")].flatMap((element) =>
        element.shadowRoot ? [element.shadowRoot] : [],
      ),
    ];
    return roots.flatMap((root) =>
      [...root.querySelectorAll('[role="tabpanel"]')]
        .filter((panel) => !panel.hidden)
        .map((panel) => panel.id || panel.textContent.slice(0, 20)),
    );
  };
  const note = (via) => {
    const y = window.scrollY;
    if (y !== last) {
      log.push({
        step,
        via,
        delta: y - last,
        y,
        t: Math.round(performance.now()),
        shown: shownPanels(),
        stack:
          via === "frame" || via === "scroll"
            ? undefined
            : new Error().stack.split("\n").slice(2, 12).join(" | "),
      });
      last = y;
    }
  };
  const wrapMethod = (owner, name) => {
    const original = owner[name];
    owner[name] = function (...args) {
      const result = original.apply(this, args);
      note(name);
      return result;
    };
  };
  const wrapGetter = (owner, name) => {
    const descriptor = Object.getOwnPropertyDescriptor(owner, name);
    Object.defineProperty(owner, name, {
      ...descriptor,
      get() {
        const result = descriptor.get.call(this);
        note(name);
        return result;
      },
    });
  };
  wrapMethod(Element.prototype, "getBoundingClientRect");
  wrapMethod(Element.prototype, "getClientRects");
  wrapMethod(HTMLElement.prototype, "focus");
  wrapMethod(Element.prototype, "scrollIntoView");
  for (const name of [
    "scrollWidth",
    "scrollHeight",
    "clientWidth",
    "clientHeight",
    "scrollTop",
    "scrollLeft",
  ]) {
    wrapGetter(Element.prototype, name);
  }
  for (const name of ["offsetWidth", "offsetHeight", "offsetTop", "offsetLeft"]) {
    wrapGetter(HTMLElement.prototype, name);
  }
  const frame = () => {
    note("frame");
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  addEventListener("scroll", () => note("scroll"), { capture: true, passive: true });
}

const tabValues = [
  ["my tab"],
  ["a"],
  ["b", "c"],
  ["\n"],
  ["%20", "a b"],
  ["x"],
  ["100%"],
  ["y", "z", "w"],
  ["q"],
  ["r"],
  ["😀😀", "e\u0301"],
  ["s"],
];

for (let run = 0; run < Number(runs); run += 1) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(instrument);
  let step = "load";
  const warnings = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      warnings.push({ step, text: message.text() });
    }
  });
  await page.goto(url, { waitUntil: "networkidle" });
  const begin = async (name) => {
    step = name;
    await page.evaluate((label) => window.__anchorStep(label), name);
  };
  const tab = (list, name) =>
    page
      .getByRole("tablist", { name: list, exact: true })
      .getByRole("tab")
      .filter({ has: page.getByText(name, { exact: true }) });

  await begin("hover drafts");
  await tab("Controlled", "Drafts").hover();
  await page.getByRole("button", { name: "Count hovers over Drafts" }).click();
  await tab("Controlled", "Drafts").hover();
  await begin("click inbox");
  await tab("Controlled", "Inbox").click();
  await begin("arrow right controlled");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(100);
  await begin("list hovers");
  await page.getByRole("button", { name: "Count hovers over the list" }).click();
  await page.mouse.move(0, 0);
  await tab("Controlled", "Locked").hover();
  await begin("render shadow");
  await page.getByRole("button", { name: "Render tabs in a shadow root" }).click();
  await begin("click near");
  await tab("In a shadow root", "Near").click();
  await begin("arrow right shadow");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(100);
  await begin("arrow left shadow");
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(100);
  const values = page.getByRole("textbox", { name: "Tab values" });
  for (const [index, drawn] of tabValues.entries()) {
    await begin(`fill ${index} ${JSON.stringify(drawn)}`);
    await values.fill(JSON.stringify(drawn));
  }
  await page.waitForTimeout(300);
  await begin("end");
  const log = await page.evaluate(() => window.__anchorLog);
  const viewport = await page.evaluate(() => ({
    y: window.scrollY,
    height: window.innerHeight,
    top: document.elementFromPoint(10, 2)?.outerHTML.slice(0, 200),
  }));
  console.log(
    `=== ${engineName} run ${run}: ${log.length} scroll changes, ${warnings.length} warnings, viewport ${JSON.stringify(viewport)}`,
  );
  for (const entry of log) console.log(JSON.stringify(entry));
  for (const warning of warnings) console.log("WARNING", JSON.stringify(warning));
  await context.close();
}
await browser.close();
