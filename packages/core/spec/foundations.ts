import { expect } from "vite-plus/test";
import { fixture } from "#/spec/fixtures.ts";
import type { FunctionSpec, Reference } from "#/spec/format.ts";

const reference = {
  props: ["color", "radius", "theme.primaryShade", "theme.defaultRadius"],
  parts: [],
  variables: [],
  exports: ["Transition"],
} as const satisfies Reference;

function radiusOf(element: HTMLElement): string {
  return getComputedStyle(element).borderTopLeftRadius;
}

export const foundationsSpec: FunctionSpec<typeof reference> = {
  reference,
  entries: [
    {
      says: "orange is a palette of its own: a filled orange Button is not painted as a yellow one",
      about: "prop color",
      fixture: fixture("Button", { color: "orange" }, "Save"),
      assert: ({ root, update }) => {
        const orange = getComputedStyle(root).backgroundColor;
        update({ color: "yellow" });
        expect(getComputedStyle(root).backgroundColor, "orange differs from yellow").not.toBe(
          orange,
        );
      },
      status: { until: "foundations 10", fails: "orange differs from yellow: expected" },
    },
    {
      says: "a radius given as a number of pixels draws as that many pixels in rem",
      about: "prop radius",
      fixture: fixture("Button", { radius: 8 }, "Save"),
      assert: ({ root, update }) => {
        const given = radiusOf(root);
        update({ radius: undefined });
        expect(radiusOf(root), "radius 8 against the default radius").not.toBe(given);
        update({ radius: "0.5rem" });
        expect(radiusOf(root), "radius 8 against 0.5rem").toBe(given);
      },
      status: "holds",
    },
    {
      says: 'a theme\'s primaryShade of 8 paints a filled Button as color="blue.8" does',
      about: "prop theme.primaryShade",
      fixture: {
        ...fixture("Button", {}, "Save"),
        provider: { unbuilt: { theme: { primaryShade: { light: 8, dark: 8 } } } },
      },
      assert: ({ root, update }) => {
        const themed = getComputedStyle(root).backgroundColor;
        update({ color: "blue.8" });
        expect(getComputedStyle(root).backgroundColor, "primaryShade picks the filled shade").toBe(
          themed,
        );
      },
      status: { until: "foundations 13", fails: "primaryShade picks the filled shade: expected" },
    },
    {
      says: "a theme's defaultRadius of xs is the radius of a Button given none",
      about: "prop theme.defaultRadius",
      fixture: {
        ...fixture("Button", {}, "Save"),
        provider: { unbuilt: { theme: { defaultRadius: "xs" } } },
      },
      assert: ({ root, update }) => {
        const themed = radiusOf(root);
        update({ radius: "xs" });
        expect(radiusOf(root), "defaultRadius").toBe(themed);
      },
      status: { until: "foundations 14", fails: "defaultRadius: expected" },
    },
    {
      says: "the library exports Transition",
      about: "export Transition",
      fixture: fixture("Box", {}, "Content"),
      assert: ({ exports }) => {
        expect(typeof exports.Transition, "Transition").toBe("function");
      },
      status: { until: "step 4", fails: "Transition: expected 'undefined' to be 'function'" },
    },
  ],
};
