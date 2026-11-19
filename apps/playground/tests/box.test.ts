import { describe, inject, test } from "vite-plus/test";
import { breakpointWidths } from "../../../packages/core/src/style-prop-table";
import { expectTheBoxCascade } from "#/tests/support/box-cascade.ts";
import { inEveryEngine, openPage, scriptModes } from "#/tests/support/playground.ts";

const url = inject("playgroundUrl");
const pixelsPerMediaQueryEm = 16;
const mdBreakpointInPixels = Number.parseFloat(breakpointWidths.md) * pixelsPerMediaQueryEm;
const viewportHeight = 800;
const boxViewports: [label: string, width: number, fromMd: boolean][] = [
  ["one pixel below the md breakpoint", mdBreakpointInPixels - 1, false],
  ["at the md breakpoint", mdBreakpointInPixels, true],
];

inEveryEngine((browser) => {
  describe.each(boxViewports)("a Box %s", (_, width, fromMd) => {
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
