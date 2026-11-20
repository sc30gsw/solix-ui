import { expect, test } from "vite-plus/test";
import { isJSONString } from "#/src/is-json-string.ts";

const error = "test-error";

test("isJSONString passes a string JSON.parse reads and fails any other string", () => {
  const validator = isJSONString(error);

  for (const value of [
    '{"key": ""}',
    '{"key": "value"}',
    '{"key": 1}',
    '{"key": true}',
    '[{"key": false}]',
  ]) {
    expect(validator(value), value).toBeNull();
  }
  for (const value of ["", " ", '{"key": "value"', '{"key": value}']) {
    expect(validator(value), value).toBe(error);
  }
});

test("isJSONString fails a value that is not a string", () => {
  for (const value of [null, undefined, false, [], {}])
    expect(isJSONString(error)(value)).toBe(error);
  expect(isJSONString()(1)).toBe(true);
});
