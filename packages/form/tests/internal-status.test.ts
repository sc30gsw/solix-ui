import { expect, test } from "vite-plus/test";
import { filterErrors, getStatus } from "#/src/internal-status.ts";

const status = { e: false, b: true, "a.4.c": true, "c.d.e": false, "l.d.0.1.e": true };

test("getStatus reads the status of a path at the root", () => {
  expect(getStatus(status, "b")).toBe(true);
  expect(getStatus(status, "e")).toBe(false);
  expect(getStatus(status, "unknown")).toBe(false);
});

test("getStatus reads the status of a nested path", () => {
  expect(getStatus(status, "a.4.c")).toBe(true);
  expect(getStatus(status, "c.d.e")).toBe(false);
  expect(getStatus(status, "unknown.path")).toBe(false);
});

test("getStatus reports a path as set when a path under it is", () => {
  expect(getStatus(status, "a")).toBe(true);
  expect(getStatus(status, "a.4")).toBe(true);
  expect(getStatus(status, "a.5")).toBe(false);
  expect(getStatus(status, "l.d.0")).toBe(true);
  expect(getStatus(status, "l.d.0.2")).toBe(false);
  expect(getStatus(status, "d.0")).toBe(false);
});

test("getStatus with no path reports whether any path is set", () => {
  expect(getStatus(status)).toBe(true);
  expect(getStatus({ a: false, "b.c": false })).toBe(false);
  expect(getStatus({})).toBe(false);
});

test("filterErrors drops null, false and undefined and keeps every other error", () => {
  expect(filterErrors({ a: null, b: 0, c: "", d: false, f: undefined, g: [] })).toStrictEqual({
    b: 0,
    c: "",
    g: [],
  });
});
