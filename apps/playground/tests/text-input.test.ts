import { expect, inject, test } from "vite-plus/test";
import { computed, inEveryEngine, openPage } from "#/tests/support/playground.ts";

const url = inject("playgroundUrl");

inEveryEngine((browser) => {
  test("a text input has the library's border with scripts turned off", async () => {
    const { page, expected, close } = await openPage(browser(), url, { javaScriptEnabled: false });

    expect(await computed(page.getByRole("textbox", { name: "Email" }), "border-top-color")).toBe(
      expected("--solix-color-border"),
    );

    await close();
  });
});
