import { getHydrationWriter, isServer, takeHydrationValue } from "@solidjs/web";
import {
  createEffect,
  createMemo,
  createSignal,
  isHydratable,
  isHydrating,
  onCleanup,
  onSettled,
} from "solid-js";
import { containerQueryLayer, layerOrder, libraryCascadeLayer } from "#/src/layers.ts";
import {
  type Breakpoint,
  breakpointWidths,
  containerVariableClass,
  isBreakpoint,
  readerRule,
  registrationRule,
  variableProperty,
} from "#/src/style-prop-table.ts";

const pixelsPerRem = 16;
const containerWidthUnits = ["rem", "px", "em"] as const;
const fractionLeadingZeros = ["", "0", "00", "000"] as const;
const unsignedInteger = "(?:0|[1-9]\\d*)";
const fractionDigits = `0{0,${fractionLeadingZeros.length - 1}}${unsignedInteger}`;
const containerWidthPattern = new RegExp(
  `^(${unsignedInteger}(?:\\.${fractionDigits})?|\\.${fractionDigits})(${containerWidthUnits.join("|")})$`,
);
const characterOutsideAClassName = /[^\w-]/g;
const queryContainerPrefix = "solix:qc:";

type NonZeroDigit = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
type UnsignedInteger = `${bigint}` & (`${NonZeroDigit}${string}` | "0");
type FractionDigits = `${(typeof fractionLeadingZeros)[number]}${UnsignedInteger}`;
type ContainerWidthUnit = (typeof containerWidthUnits)[number];

/**
 * A container width that a value keyed for container queries applies from: a non-negative
 * decimal length with a unit and no space, such as `"40em"` or `"2.5rem"`.
 */
export type ContainerWidth =
  | `${UnsignedInteger}${ContainerWidthUnit}`
  | `${UnsignedInteger}.${FractionDigits}${ContainerWidthUnit}`
  | `.${FractionDigits}${ContainerWidthUnit}`;

export type ContainerQueries = {
  readonly scope: string;
  readonly widths: readonly (readonly [key: string, width: string])[];
};

export type Used = readonly [name: string, slot: number];

export type QueryContainer = {
  readonly queries: () => ContainerQueries | undefined;
  readonly report: (used: () => readonly Used[]) => void;
  readonly rules: () => string | undefined;
  readonly member: () => QueryContainer;
};

function widthOf(written: string): { amount: number; unit: ContainerWidthUnit } | undefined {
  const [, amount, given] = containerWidthPattern.exec(written) ?? [];
  const unit = containerWidthUnits.find((found) => found === given);
  return amount === undefined || unit === undefined ? undefined : { amount: Number(amount), unit };
}

export function isContainerWidth(written: string): written is ContainerWidth {
  return widthOf(written) !== undefined;
}

export function containerWidthOf(breakpoint: Breakpoint): string {
  const written = breakpointWidths[breakpoint];
  const parsed = widthOf(written);
  return parsed?.unit === "em" ? `${parsed.amount}rem` : written;
}

export function containerKeysOf(value: unknown): [key: string, width: string][] {
  if (value === undefined || value === null || typeof value !== "object") return [];
  return Object.keys(value).flatMap((key): [string, string][] => {
    if (isBreakpoint(key)) return [[key, containerWidthOf(key)]];
    return isContainerWidth(key) ? [[key, key]] : [];
  });
}

function pixelsOf(width: string): number {
  const { amount = 0, unit = "px" } = widthOf(width) ?? {};
  return amount * (unit === "px" ? 1 : pixelsPerRem);
}

function rulesFor(queries: ContainerQueries, used: readonly Used[]): string | undefined {
  if (used.length === 0) return undefined;
  const registrations = used.map(([name, slot]) =>
    registrationRule(containerVariableClass(name, queries.scope, slot)),
  );
  const readers = queries.widths.flatMap(([, width], slot) => {
    const atSlot = used.filter(([, at]) => at === slot);
    if (atSlot.length === 0) return [];
    const read = atSlot.map(([name]) =>
      readerRule(containerVariableClass(name, queries.scope, slot), variableProperty(name)),
    );
    return [`@container (min-width: ${width}){${read.join("")}}`];
  });
  return `${layerOrder}@layer ${libraryCascadeLayer}.${containerQueryLayer}{${[...registrations, ...readers].join("")}}`;
}

function keyOf([name, slot]: Used): string {
  return `${name} ${slot}`;
}

function sameUsed(before: readonly Used[], after: readonly Used[]): boolean {
  return (
    before.length === after.length &&
    before.every(([name, slot], index) => name === after[index]?.[0] && slot === after[index]?.[1])
  );
}

function sameQueries(
  before: ContainerQueries | undefined,
  after: ContainerQueries | undefined,
): boolean {
  if (before === after) return true;
  if (before === undefined || after === undefined) return false;
  return (
    before.scope === after.scope &&
    before.widths.length === after.widths.length &&
    before.widths.every(
      ([key, width], index) =>
        key === after.widths[index]?.[0] && width === after.widths[index]?.[1],
    )
  );
}

function uniqueUsed(used: readonly Used[]): Used[] {
  const seen = new Map(used.map((pair) => [keyOf(pair), pair]));
  return [...seen.values()].sort(([before, beforeSlot], [after, afterSlot]) =>
    beforeSlot === afterSlot ? before.localeCompare(after) : beforeSlot - afterSlot,
  );
}

type Member = { keys: readonly string[] };

type Membership = {
  readonly members: Member[];
  readonly version: () => number;
  readonly remove: (member: Member) => void;
  readonly notify: () => void;
};

function placedBefore(membership: Membership, own: Member): Set<string> {
  membership.version();
  const index = membership.members.indexOf(own);
  const before = index <= 0 ? [] : membership.members.slice(0, index);
  return new Set(before.flatMap((member) => member.keys));
}

function memberContainer(
  queries: () => ContainerQueries | undefined,
  membership: Membership,
  streamed: boolean,
): QueryContainer {
  let ownUsed: (() => readonly Used[]) | undefined;
  let own: Member | undefined;
  return {
    queries,
    report(used) {
      if (own !== undefined) return;
      const placed = createMemo(() => uniqueUsed(used()), { equals: sameUsed });
      const member: Member = { keys: [] };
      ownUsed = placed;
      own = member;
      membership.members.push(member);
      let settled = false;
      onCleanup(() => {
        membership.remove(member);
        if (!isServer && !settled) queueMicrotask(membership.notify);
      });
      createEffect(placed, (_, prev) => {
        if (prev !== undefined) membership.notify();
      });
      onSettled(() => {
        settled = true;
        return () => {
          membership.remove(member);
          membership.notify();
        };
      });
    },
    rules() {
      const current = queries();
      if (current === undefined || ownUsed === undefined || own === undefined) {
        if (own !== undefined) own.keys = [];
        return undefined;
      }
      const ownPairs = ownUsed();
      own.keys = ownPairs.map(keyOf);
      if (streamed && (isServer || isHydrating())) {
        return rulesFor(current, ownPairs);
      }
      const before = placedBefore(membership, own);
      const missing = ownPairs.filter((pair) => !before.has(keyOf(pair)));
      return rulesFor(current, missing);
    },
    member: () => memberContainer(queries, membership, streamed),
  };
}

export function createQueryContainer(
  scope: string,
  widths: () => readonly (readonly [key: string, width: string])[] | undefined,
): QueryContainer {
  const normalizedScope = scope.replace(characterOutsideAClassName, "_");
  const hydrationKey = `${queryContainerPrefix}${normalizedScope}`;
  const writer = getHydrationWriter();
  const streaming = writer?.async === true;
  if (streaming && isHydratable()) writer.write(hydrationKey, true);
  const taken = isHydrating() ? takeHydrationValue(hydrationKey) : undefined;
  const streamed = streaming || (taken?.status === "resolved" && taken.value === true);

  let disposed = false;
  onCleanup(() => {
    disposed = true;
  });

  const queries = createMemo(
    (): ContainerQueries | undefined => {
      const given = widths();
      if (given === undefined) return undefined;
      return {
        scope: normalizedScope,
        widths: given
          .flatMap(([key, width]): [string, string][] => {
            const parsed = widthOf(width);
            return parsed ? [[key, `${parsed.amount}${parsed.unit}`]] : [];
          })
          .toSorted(([, narrower], [, wider]) => pixelsOf(narrower) - pixelsOf(wider)),
      };
    },
    { equals: sameQueries },
  );

  const members: Member[] = [];
  const [version, setVersion] = createSignal(0);
  const membership: Membership = {
    members,
    version,
    remove(member) {
      const index = members.indexOf(member);
      if (index !== -1) members.splice(index, 1);
    },
    notify() {
      if (!disposed) setVersion((count) => count + 1);
    },
  };

  let reported: () => readonly Used[] = () => [];
  return {
    queries,
    report(used) {
      reported = used;
    },
    rules() {
      const current = queries();
      if (current === undefined) return undefined;
      return rulesFor(current, uniqueUsed(reported()));
    },
    member: () => memberContainer(queries, membership, streamed),
  };
}
