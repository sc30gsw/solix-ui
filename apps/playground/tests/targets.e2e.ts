import type { Browser } from "@e2e-dev/web";
import { describe } from "@e2e-dev/web";
import { expect, type Screen } from "e2e";
import { located, test } from "#/tests/support/e2e-playground.ts";
import { readTarget, type Target, targetMark } from "#/tests/support/targets.ts";

const fixtureNames = {
  wrapped: "Name inside its label",
  pointed: "Name a label points at",
  captioned: "Name a caption gives",
};

function addLabelledFields(names: typeof fixtureNames): null {
  const fixture = document.createElement("form");
  const wrapping = document.createElement("label");
  wrapping.append(names.wrapped, document.createElement("input"));
  const pointing = document.createElement("label");
  pointing.htmlFor = "target-fixture-pointed";
  pointing.textContent = names.pointed;
  const pointed = document.createElement("input");
  pointed.id = "target-fixture-pointed";
  const caption = document.createElement("span");
  caption.id = "target-fixture-caption";
  caption.textContent = names.captioned;
  const captioned = document.createElement("textarea");
  captioned.setAttribute("aria-labelledby", caption.id);
  fixture.append(wrapping, pointing, pointed, caption, captioned);
  document.body.append(fixture);
  return null;
}

async function bothAddress(browser: Browser, screen: Screen, target: Target): Promise<void> {
  const mark = "text" in target ? target.text : `${target.role} ${target.name}`;
  await browser.evaluate(readTarget, { target, mark });
  await expect(located(screen, target)).toHaveAttribute(targetMark, mark);
}

describe("an element addressed by its role and accessible name", () => {
  test("finds a control named by its aria-label", async ({ hydrated, screen }) => {
    await bothAddress(hydrated, screen, { role: "textbox", name: "Email" });
  });

  test("finds a button named by its text", async ({ hydrated, screen }) => {
    await bothAddress(hydrated, screen, { role: "button", name: "Default" });
  });

  test("finds the disclosure's summary, which has no role, by its text", async ({
    hydrated,
    screen,
  }) => {
    await bothAddress(hydrated, screen, { text: "Toggle" });
  });

  test("finds a field named by the label around it, by a label that points at it, and by aria-labelledby", async ({
    hydrated,
    screen,
  }) => {
    await hydrated.evaluate(addLabelledFields, fixtureNames);

    await bothAddress(hydrated, screen, { role: "textbox", name: fixtureNames.wrapped });
    await bothAddress(hydrated, screen, { role: "textbox", name: fixtureNames.pointed });
    await bothAddress(hydrated, screen, { role: "textbox", name: fixtureNames.captioned });
  });
});
