import { expect, test } from "vite-plus/test";
import { isUrl } from "#/src/is-url.ts";

const error = "is-url-error";

test("isUrl passes an http or https URL", () => {
  for (const value of [
    "https://example.com",
    "http://example.com",
    "https://example.com/path?query=1",
    "https://sub.domain.example.com",
    "https://example.com:8080",
    "https://example.com/path#hash",
  ]) {
    expect(isUrl(error)(value), value).toBeNull();
  }
});

test("isUrl fails text that is not a URL and a value that is not a string", () => {
  for (const value of [
    "",
    "not-a-url",
    "example.com",
    "://missing-protocol.com",
    123,
    null,
    undefined,
    [],
    {},
  ]) {
    expect(isUrl(error)(value)).toBe(error);
  }
});

test("isUrl fails localhost unless allowed", () => {
  for (const value of ["http://localhost", "http://localhost:3000"]) {
    expect(isUrl(error)(value)).toBe(error);
    expect(isUrl({ allowLocalhost: true }, error)(value)).toBeNull();
  }
});

test("isUrl passes only the protocols it is given, http and https by default", () => {
  expect(isUrl(error)("ftp://example.com")).toBe(error);
  expect(isUrl(error)("mailto:user@example.com")).toBe(error);
  const ftp = isUrl({ protocols: ["ftp", "https"] }, error);
  expect(ftp("ftp://example.com")).toBeNull();
  expect(ftp("https://example.com")).toBeNull();
  expect(ftp("http://example.com")).toBe(error);
});

test("isUrl fails with true when no error is given, with options or without", () => {
  expect(isUrl()("not-a-url")).toBe(true);
  expect(isUrl()("https://example.com")).toBeNull();
  expect(isUrl({ allowLocalhost: true })("http://localhost")).toBeNull();
  expect(isUrl({ allowLocalhost: true })("not-a-url")).toBe(true);
});
