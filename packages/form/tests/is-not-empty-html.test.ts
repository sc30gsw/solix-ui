import { expect, test } from "vite-plus/test";
import { isNotEmptyHTML } from "#/src/is-not-empty-html.ts";

const error = "test-error";

test("isNotEmptyHTML passes markup with text and fails markup with none once its tags are removed", () => {
  const validator = isNotEmptyHTML(error);

  expect(validator("<div>test-input</div>")).toBeNull();
  expect(validator("test-input")).toBeNull();
  for (const value of ["", " ", "<div></div>", "<div> </div>", "<div><b><i></b></i></div>"]) {
    expect(validator(value), value).toBe(error);
  }
});

test("isNotEmptyHTML fails a value that is not a string", () => {
  for (const value of [null, undefined, false, [], {}]) {
    expect(isNotEmptyHTML(error)(value)).toBe(error);
  }
  expect(isNotEmptyHTML()("")).toBe(true);
});
