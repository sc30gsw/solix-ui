import { expect } from "vite-plus/test";
import { fixture } from "#/spec/fixtures.ts";
import { defineReference, defineSpec, dom } from "#/spec/format.ts";

const reference = defineReference({
  props: ["color", "radius", "theme.primaryShade", "theme.defaultRadius"],
  parts: [],
  variables: [],
});

function radiusOf(element: HTMLElement): string {
  return getComputedStyle(element).borderTopLeftRadius;
}

export const spec = defineSpec(reference, [
  {
    says: "orange is a palette of its own: a filled orange Button is not painted as a yellow one",
    promise: { kind: "prop", prop: "color", value: "orange" },
    check: dom(fixture("Button", { color: "orange" }, "Save"), ({ root, update }) => {
      const orange = getComputedStyle(root).backgroundColor;
      update({ color: "yellow" });
      expect(getComputedStyle(root).backgroundColor, "orange differs from yellow").not.toBe(orange);
    }),
    status: "pending",
    until: "foundations 10",
    failsWith: "orange differs from yellow: expected",
  },
  {
    says: "a radius given as a number of pixels draws as that many pixels in rem",
    promise: { kind: "prop", prop: "radius", value: 8 },
    check: dom(fixture("Button", { radius: 8 }, "Save"), ({ root, update }) => {
      const given = radiusOf(root);
      update({ radius: "0.5rem" });
      expect(radiusOf(root), "radius 8 against 0.5rem").toBe(given);
    }),
    status: "holds",
  },
  {
    says: 'a theme\'s primaryShade of 8 paints a filled Button as color="blue.8" does',
    promise: { kind: "prop", prop: "theme.primaryShade", value: 8 },
    check: dom(
      fixture("Button", {}, "Save", {
        provider: { theme: { primaryShade: { light: 8, dark: 8 } } },
      }),
      ({ root, update }) => {
        const themed = getComputedStyle(root).backgroundColor;
        update({ color: "blue.8" });
        expect(getComputedStyle(root).backgroundColor, "primaryShade picks the filled shade").toBe(
          themed,
        );
      },
    ),
    status: "pending",
    until: "foundations 13",
    failsWith: "primaryShade picks the filled shade: expected",
  },
  {
    says: "a theme's defaultRadius of xs is the radius of a Button given none",
    promise: { kind: "prop", prop: "theme.defaultRadius", value: "xs" },
    check: dom(
      fixture("Button", {}, "Save", { provider: { theme: { defaultRadius: "xs" } } }),
      ({ root, update }) => {
        const themed = radiusOf(root);
        update({ radius: "xs" });
        expect(radiusOf(root), "defaultRadius").toBe(themed);
      },
    ),
    status: "pending",
    until: "foundations 14",
    failsWith: "defaultRadius: expected",
  },
  {
    says: "the library exports Transition",
    promise: { kind: "behaviour" },
    check: dom(fixture("Box", {}, "Content"), ({ exports }) => {
      expect(typeof exports.Transition, "Transition").toBe("function");
    }),
    status: "pending",
    until: "step 4",
    failsWith: "Transition: expected 'undefined' to be 'function'",
  },
]);
