import { expect } from "vite-plus/test";
import { fixture } from "#/spec/fixtures.ts";
import { defineReference, defineSpec, dom } from "#/spec/format.ts";

const reference = defineReference({
  props: ["colorSchemeManager", "defaultColorScheme"],
  parts: [],
  variables: [],
});

export const spec = defineSpec(reference, [
  {
    says: "the provider writes its scheme on its root element as data-solix-color-scheme",
    promise: { kind: "prop", prop: "defaultColorScheme", value: "dark" },
    check: dom(
      fixture("Box", {}, "Content", { provider: { defaultColorScheme: "dark" } }),
      ({ container }) => {
        const root = container.closest("[data-solix-color-scheme]");
        expect(root?.getAttribute("data-solix-color-scheme"), "data-solix-color-scheme").toBe(
          "dark",
        );
      },
    ),
    status: "pending",
    until: "SolixProvider 8",
    failsWith: "data-solix-color-scheme: expected undefined to be 'dark'",
    decision: "Q176",
  },
  {
    says: "localStorageColorSchemeManager takes the reference's shape: get(default) and unsubscribe",
    promise: { kind: "prop", prop: "colorSchemeManager" },
    check: dom(fixture("Box", {}, "Content"), ({ exports }) => {
      const create = exports.localStorageColorSchemeManager;
      expect(typeof create, "localStorageColorSchemeManager").toBe("function");
      const manager: unknown = Reflect.apply(Object(create), undefined, [{ key: "solix-spec" }]);
      expect(typeof Reflect.get(Object(manager), "unsubscribe"), "unsubscribe").toBe("function");
      const get: unknown = Reflect.get(Object(manager), "get");
      expect(Reflect.apply(Object(get), manager, ["dark"]), "get(default)").toBe("dark");
    }),
    status: "pending",
    until: "SolixProvider 8",
    failsWith: "unsubscribe: expected 'undefined' to be 'function'",
    decision: "Q176",
  },
]);
