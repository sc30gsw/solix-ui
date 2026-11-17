import { createComponent, renderToString } from "@solidjs/web";
import fc from "fast-check";
import { expect, test } from "vite-plus/test";
import { library } from "./built-library";
import { elementsOf, valuesOf } from "./markup";

const generatedRuns = 200;
const value = fc.stringMatching(/^[a-z]{1,6}$/);

test("on the server, a tab carries data-active exactly when its aria-selected is true, for generated tabs and a generated value, controlled or not", () => {
  fc.assert(
    fc.property(
      fc.uniqueArray(fc.record({ value, disabled: fc.boolean() }), {
        minLength: 1,
        maxLength: 5,
        selector: (tab) => tab.value,
      }),
      fc.option(fc.nat(), { nil: undefined }),
      fc.boolean(),
      (tabs, position, controlled) => {
        const selected = position === undefined ? null : tabs[position % tabs.length].value;
        const html = renderToString(() =>
          createComponent(library.Tabs, {
            ...(controlled ? { value: selected } : { defaultValue: selected }),
            get children() {
              return createComponent(library.Tabs.List, {
                get children() {
                  return tabs.map((tab) =>
                    createComponent(library.Tabs.Tab, { ...tab, children: tab.value }),
                  );
                },
              });
            },
          }),
        );
        const marked = elementsOf(html)
          .filter(({ tag }) => tag === "button")
          .map((button) => ({
            active: valuesOf(button, "data-active").length === 1,
            selected: valuesOf(button, "aria-selected")[0] === "true",
          }));

        expect(marked).toHaveLength(tabs.length);
        expect(marked.filter(({ selected: isSelected }) => isSelected)).toHaveLength(
          selected === null ? 0 : 1,
        );
        expect(marked.map(({ active }) => active)).toEqual(marked.map(({ selected: s }) => s));
      },
    ),
    { numRuns: generatedRuns },
  );
});
