import fc from "fast-check";
import type { Locator, Page } from "playwright";
import { expect, inject, test } from "vite-plus/test";
import { inEveryEngine } from "#/tests/support/playground.ts";

const url = inject("playgroundUrl");
const generatedRuns = 15;
const longestSequence = 10;
const generatedSequencesTimeout = 70_000;

type Model = { open: boolean; name: string };
type Real = { page: Page; dialog: Locator; opener: Locator; readout: Locator };

function present<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`${what} is not on the page`);
  return value;
}

async function nextFrames(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

async function expectAgreement(model: Model, real: Real): Promise<void> {
  const observed = await real.page.evaluate(() => {
    const dialog = document.querySelector("dialog");
    const behind = document.querySelector<HTMLElement>("main > button");
    if (!dialog || !behind) throw new Error("the dialog or the first button is not on the page");
    const focused = document.activeElement as HTMLElement | null;
    behind.focus();
    const pageBehindTookFocus = document.activeElement === behind;
    focused?.focus();
    return {
      open: dialog.open,
      modal: dialog.matches(":modal"),
      focusBehindTheDialog:
        document.activeElement !== document.body && !dialog.contains(document.activeElement),
      pageBehindTookFocus,
      readout: [...document.querySelectorAll("p")]
        .map((paragraph) => paragraph.textContent ?? "")
        .find((text) => text.startsWith("The app records the modal as")),
      name: dialog.querySelector("input")?.value,
    };
  });

  expect(observed.open, "the dialog's open property").toBe(model.open);
  expect(observed.modal, "the dialog is modal exactly when it is open").toBe(model.open);
  expect(observed.readout, "what the app recorded from onClose").toBe(
    `The app records the modal as ${model.open ? "opened" : "closed"}.`,
  );
  expect(observed.pageBehindTookFocus, "the page behind can take focus").toBe(!model.open);
  expect(observed.name, "the Name field keeps what was typed").toBe(model.name);
  if (model.open) {
    expect(observed.focusBehindTheDialog, "focus is on the page behind the open dialog").toBe(
      false,
    );
  }
}

abstract class Step implements fc.AsyncCommand<Model, Real> {
  abstract check(model: Model): boolean;
  abstract act(model: Model, real: Real): Promise<void>;
  abstract toString(): string;
  async run(model: Model, real: Real): Promise<void> {
    await this.act(model, real);
    await nextFrames(real.page);
    await expectAgreement(model, real);
  }
}

class PressOpenModal extends Step {
  check = (model: Model) => !model.open;
  async act(model: Model, real: Real) {
    await real.opener.click();
    model.open = true;
  }
  toString = () => "press the Open modal button";
}

class PressEscape extends Step {
  check = () => true;
  async act(model: Model, real: Real) {
    await real.page.keyboard.press("Escape");
    model.open = false;
  }
  toString = () => "press Escape";
}

class PressOutside extends Step {
  check = (model: Model) => model.open;
  async act(model: Model, real: Real) {
    await real.page.mouse.click(2, 2);
    model.open = false;
  }
  toString = () => "press outside the dialog";
}

class PressInside extends Step {
  check = (model: Model) => model.open;
  async act(_model: Model, real: Real) {
    await real.dialog.getByText("Modal content").click();
  }
  toString = () => "press inside the dialog";
}

class PressClose extends Step {
  check = (model: Model) => model.open;
  async act(model: Model, real: Real) {
    await real.dialog.getByRole("button", { name: "Close" }).click();
    model.open = false;
  }
  toString = () => "press the Close button";
}

class PressTab extends Step {
  readonly shift: boolean;
  constructor(shift: boolean) {
    super();
    this.shift = shift;
  }
  check = (model: Model) => model.open;
  async act(_model: Model, real: Real) {
    await real.page.keyboard.press(this.shift ? "Shift+Tab" : "Tab");
  }
  toString = () => (this.shift ? "press Shift+Tab" : "press Tab");
}

class TypeAName extends Step {
  readonly text: string;
  constructor(text: string) {
    super();
    this.text = text;
  }
  check = (model: Model) => model.open;
  async act(model: Model, real: Real) {
    await real.dialog.getByRole("textbox", { name: "Name" }).fill(this.text);
    model.name = this.text;
  }
  toString = () => `type "${this.text}" in the Name field`;
}

const steps = [
  fc.constant(new PressOpenModal()),
  fc.constant(new PressEscape()),
  fc.constant(new PressOutside()),
  fc.constant(new PressInside()),
  fc.constant(new PressClose()),
  fc.boolean().map((shift) => new PressTab(shift)),
  fc.stringMatching(/^[a-z]{0,6}$/).map((text) => new TypeAName(text)),
];

const everyActionInEachRun: Step[][] = [
  [new PressOpenModal(), new PressOutside()],
  [new PressOpenModal(), new PressEscape()],
  [
    new PressOpenModal(),
    new PressInside(),
    new PressTab(false),
    new PressTab(true),
    new TypeAName("ab"),
    new PressClose(),
    new PressOpenModal(),
  ],
];

inEveryEngine((browser) => {
  test(
    "for fixed sequences that take every action, and for every generated sequence of user actions, the modal agrees with a model of open and closed",
    { timeout: generatedSequencesTimeout },
    async () => {
      const page = await browser().newPage();

      await fc.assert(
        fc.asyncProperty(fc.commands(steps, { maxCommands: longestSequence }), async (sequence) => {
          await page.goto(url, { waitUntil: "networkidle" });
          const real: Real = {
            page,
            dialog: page.locator("dialog"),
            opener: page.getByRole("button", { name: "Open modal" }),
            readout: page.getByText(/^The app records the modal as/),
          };
          const model: Model = { open: false, name: "" };

          await expectAgreement(model, real);
          await fc.asyncModelRun(() => ({ model, real }), sequence);
        }),
        {
          numRuns: everyActionInEachRun.length + generatedRuns,
          examples: everyActionInEachRun.map((sequence): [Step[]] => [sequence]),
        },
      );

      await page.close();
    },
  );

  test("the fallback alone closes on a press outside, and not on a press inside or a drag that ends outside", async () => {
    const context = await browser().newContext();
    await context.addInitScript(() => {
      Reflect.deleteProperty(HTMLDialogElement.prototype, "closedBy");
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    const dialog = page.locator("dialog");
    await dialog.evaluate((node) => node.removeAttribute("closedby"));
    const opener = page.getByRole("button", { name: "Open modal" });

    await opener.click();
    await dialog.getByText("Modal content").click();
    expect(await dialog.evaluate((node: HTMLDialogElement) => node.open)).toBe(true);

    const box = present(await dialog.boundingBox(), "the dialog");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(2, 2);
    await page.mouse.up();
    expect(await dialog.evaluate((node: HTMLDialogElement) => node.open)).toBe(true);

    await page.mouse.click(2, 2);
    await expect.poll(() => dialog.evaluate((node: HTMLDialogElement) => node.open)).toBe(false);

    await context.close();
  });
});
