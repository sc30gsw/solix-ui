import { describe, inject, test } from "vite-plus/test";
import { expectTheBoxCascade, viewportHeight, viewports } from "#/tests/support/box-cascade.ts";
import { inEveryEngine, openPage, scriptModes } from "#/tests/support/playground.ts";

const url = inject("playgroundUrl");

inEveryEngine((browser) => {
  describe.each(viewports)("a Box %s", (_, width, fromMd) => {
    test.each(scriptModes)(
      "with scripts %s, ranks component default < style prop < consumer class < consumer style, lets a longhand beat its shorthand, inherits nothing, and switches at md",
      async (__, javaScriptEnabled) => {
        const { page, expected, close } = await openPage(browser(), url, {
          javaScriptEnabled,
          viewport: { width, height: viewportHeight },
        });
        try {
          await expectTheBoxCascade({ page, expected, fromMd });
        } finally {
          await close();
        }
      },
    );
  });
});
