import { expect, test } from "vite-plus/test";
import { isEmail } from "#/src/is-email.ts";

const error = "email-error";

test("isEmail fails a value that is not an email address", () => {
  for (const value of ["", "test", "test@test", "test@test.", "test@test.c", 1, null]) {
    expect(isEmail(error)(value)).toBe(error);
  }
  expect(isEmail()("test")).toBe(true);
});

test("isEmail passes an email address", () => {
  for (const value of ["test@email.com", "another@test.cn", "another@test.party"]) {
    expect(isEmail(error)(value)).toBeNull();
  }
});
