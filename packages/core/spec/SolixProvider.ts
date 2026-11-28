import { expect } from "vite-plus/test";
import { fixture } from "#/spec/fixtures.ts";
import type { FunctionSpec, Reference } from "#/spec/format.ts";

const reference = {
  props: ["colorSchemeManager", "defaultColorScheme"],
  parts: [],
  variables: [],
  exports: [],
} as const satisfies Reference;

export const solixProviderSpec: FunctionSpec<typeof reference> = {
  reference,
  entries: [
    {
      says: "the provider writes its scheme on its root element as data-solix-color-scheme",
      about: "prop defaultColorScheme",
      fixture: {
        ...fixture("Box", {}, "Content"),
        provider: { props: { defaultColorScheme: "dark" } },
      },
      assert: ({ container }) => {
        const root = container.closest("[data-solix-color-scheme]");
        expect(root?.getAttribute("data-solix-color-scheme"), "data-solix-color-scheme").toBe(
          "dark",
        );
      },
      status: {
        until: "SolixProvider 8",
        fails: "data-solix-color-scheme: expected undefined to be 'dark'",
      },
      decision: "Q176",
    },
    {
      says: "localStorageColorSchemeManager takes the reference's shape: get(default) and unsubscribe",
      about: "prop colorSchemeManager",
      fixture: fixture("Box", {}, "Content"),
      assert: ({ exports }) => {
        const create = exports.localStorageColorSchemeManager;
        expect(typeof create, "localStorageColorSchemeManager").toBe("function");
        const manager: unknown = Reflect.apply(Object(create), undefined, [{ key: "solix-spec" }]);
        expect(typeof Reflect.get(Object(manager), "unsubscribe"), "unsubscribe").toBe("function");
        const get: unknown = Reflect.get(Object(manager), "get");
        expect(Reflect.apply(Object(get), manager, ["dark"]), "get(default)").toBe("dark");
      },
      status: {
        until: "SolixProvider 8",
        fails: "unsubscribe: expected 'undefined' to be 'function'",
      },
      decision: "Q176",
    },
  ],
};
