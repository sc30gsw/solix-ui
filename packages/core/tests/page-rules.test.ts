import postcss from "postcss";
import { expect, test } from "vite-plus/test";
import { rulesThatStyleThePage } from "#/tests/page-rules.ts";

const flagged = [
  "body{--a:1}",
  "HTML{--a:1}",
  "html|body{--a:1}",
  ".a>body{margin:0}",
  ".a :where(html){--a:1}",
  ".a:is(.b, body){margin:0}",
  "*{box-sizing:border-box}",
  ":root{--a:1;background:red}",
  "::selection{color:red}",
  ":not(.a){margin:0}",
  ":has(.a){margin:0}",
  ":is(.a, *){margin:0}",
  '[data-color-scheme="dark"]{color-scheme:dark;background:black}',
  '[data-color-scheme="dark"]{color-scheme:dark;@media all{background-color:Canvas;color:CanvasText}}',
  ":root{--a:1;@media screen{background:red}}",
  ":root{--a:1;@supports (display:grid){background:red}}",
  ":root{--a:1;@layer a{background:red}}",
  "@media screen{:root{--a:1;@media (min-width:1px){background:red}}}",
  ":root{--a:1;&{background:red}}",
  ":root{--a:1;.a{margin:0}}",
  ".a{margin:0;&:hover{margin:1px}}",
  ".a{margin:0;@media screen{margin:1px}}",
];
const passed = [
  ":root{--a:1;color-scheme:light dark}",
  '[data-color-scheme="dark"]{color-scheme:dark;--a:1}',
  ".a{margin:0}",
  ".a>*{margin:0}",
  "body .a{margin:0}",
  ".a:not(body){margin:0}",
  ".a:has(>img){margin:0}",
  ".a:nth-child(odd):lang(en){margin:0}",
  '[class~="a"]{margin:0}',
  ':where([class^="a"], [class*=" a"])[hidden]{display:none}',
  "@media screen{@supports (display:grid){@layer a{.a{margin:0}:root{--a:1}}}}",
  "@keyframes a{from{margin:0}50%{margin:1px}}",
];

function problemsOf(css: string): string[] {
  return rulesThatStyleThePage(postcss.parse(css));
}

test.each(flagged)(
  "the page rule flags %s once: a subject that names an element type, alone or in a branch of :is() or :where(), a selector that requires no class beside more than custom properties and color-scheme, or a rule or at-rule nested in a style rule",
  (css) => {
    expect(problemsOf(css)).toHaveLength(1);
  },
);

test.each(passed)("the page rule passes %s", (css) => {
  expect(problemsOf(css)).toEqual([]);
});
