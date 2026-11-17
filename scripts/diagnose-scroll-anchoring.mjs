import fc from "fast-check";
import { chromium, firefox } from "playwright";

const engines = { chromium, firefox };
const [engineName = "firefox", url = "http://127.0.0.1:4400/", runs = "3"] = process.argv.slice(2);
const executablePath = process.env.DIAG_EXECUTABLE || undefined;
const browser = await engines[engineName].launch({ executablePath });

const tabValues = fc.uniqueArray(
  fc.oneof(
    fc.string({ minLength: 1 }),
    fc.string({ unit: "grapheme", minLength: 1 }),
    fc.constantFrom(" ", "%", "\t", "\n", "a b", "100%", "%20", "a%20b"),
  ),
  { minLength: 1, maxLength: 5 },
);

function measure() {
  const list = document.querySelector('[role="tablist"][aria-label="Generated"]');
  const input = document.querySelector('[aria-label="Tab values"]');
  const tabs = [...list.querySelectorAll('[role="tab"]')];
  const tops = new Set(tabs.map((tab) => Math.round(tab.getBoundingClientRect().top)));
  const listBox = list.getBoundingClientRect();
  const firstVisible = [...document.querySelectorAll("main *")].find((element) => {
    const box = element.getBoundingClientRect();
    return (
      box.bottom > 0 && box.top < innerHeight && box.height > 0 && element.children.length === 0
    );
  });
  return {
    y: Math.round(scrollY * 10) / 10,
    rows: tops.size,
    listTop: Math.round(listBox.top),
    listHeight: Math.round(listBox.height),
    listWidth: Math.round(listBox.width),
    inputTop: Math.round(input.getBoundingClientRect().top),
    firstVisible: firstVisible?.outerHTML.slice(0, 80),
  };
}

for (let run = 0; run < Number(runs); run += 1) {
  const context = await browser.newContext();
  const page = await context.newPage();
  let step = "load";
  const warnings = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      warnings.push({ step, text: message.text().slice(0, 140) });
      console.log("WARNING at", step);
    }
  });
  await page.goto(url, { waitUntil: "networkidle" });
  const tab = (list, name) =>
    page
      .getByRole("tablist", { name: list, exact: true })
      .getByRole("tab")
      .filter({ has: page.getByText(name, { exact: true }) });

  step = "earlier tests";
  await tab("Controlled", "Drafts").hover();
  await page.getByRole("button", { name: "Count hovers over Drafts" }).click();
  await tab("Controlled", "Drafts").hover();
  await tab("Controlled", "Inbox").click();
  await page.keyboard.press("ArrowRight");
  await page.getByRole("button", { name: "Count hovers over the list" }).click();
  await page.mouse.move(0, 0);
  await tab("Controlled", "Locked").hover();
  await page.getByRole("button", { name: "Render tabs in a shadow root" }).click();
  await tab("In a shadow root", "Near").click();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowLeft");
  console.log(
    `=== ${engineName} run ${run} before fills`,
    JSON.stringify(await page.evaluate(measure)),
  );
  const values = page.getByRole("textbox", { name: "Tab values" });
  let index = 0;
  await fc.assert(
    fc.asyncProperty(tabValues, async (drawn) => {
      step = `fill ${index}`;
      index += 1;
      await values.fill(JSON.stringify(drawn));
      const lengths = drawn.map((value) => [...value].length);
      for (;;) {
        const count = await page
          .getByRole("tablist", { name: "Generated", exact: true })
          .evaluate((list) => list.querySelectorAll('[role="tab"]').length);
        if (count === drawn.length) break;
      }
      console.log(step, JSON.stringify(lengths), JSON.stringify(await page.evaluate(measure)));
    }),
    { numRuns: 25, examples: [[["my tab"]]] },
  );
  console.log(
    `=== ${engineName} run ${run}: ${warnings.length} warnings`,
    JSON.stringify(warnings),
  );
  await context.close();
}
await browser.close();
