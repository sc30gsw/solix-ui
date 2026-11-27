import { getHydrationWriter, isServer, takeHydrationValue } from "@solidjs/web";
import {
  createEffect,
  createMemo,
  createSignal,
  isHydratable,
  isHydrating,
  onCleanup,
} from "solid-js";
import { containerQueryLayer, layerOrder, libraryCascadeLayer } from "#/src/layers.ts";
import {
  type Breakpoint,
  breakpointWidths,
  containerVariableClass,
  isBreakpoint,
  pixelsPerRem,
  readerRule,
  registrationRule,
  variableProperty,
} from "#/src/style-prop-table.ts";

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
};

export type SharedQueryContainer = QueryContainer & {
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
  readonly notify: () => void;
  readonly leave: (member: Member) => void;
};

function isFollowed(members: readonly Member[], member: Member): boolean {
  const index = members.indexOf(member);
  return index !== -1 && index < members.length - 1;
}

function createMembership(): Membership {
  const members: Member[] = [];
  const [version, setVersion] = createSignal(0);
  let disposed = false;
  onCleanup(() => {
    disposed = true;
  });
  const notify = () => {
    if (!disposed) setVersion((count) => count + 1);
  };
  return {
    members,
    version,
    notify,
    leave(member) {
      const index = members.indexOf(member);
      if (index === -1) return;
      members.splice(index, 1);
      if (!isServer && index < members.length && member.keys.length > 0) queueMicrotask(notify);
    },
  };
}

function placedBefore(membership: Membership, own: Member): Set<string> {
  const index = membership.members.indexOf(own);
  if (index <= 0) return new Set();
  membership.version();
  return new Set(membership.members.slice(0, index).flatMap((member) => member.keys));
}

function streamedRender(scope: string): boolean {
  const hydrationKey = `${queryContainerPrefix}${scope}`;
  if (isServer) {
    const writer = getHydrationWriter();
    const streaming = writer?.async === true;
    if (streaming && isHydratable()) writer.write(hydrationKey, true);
    return streaming;
  }
  if (!isHydrating()) return false;
  const taken = takeHydrationValue(hydrationKey);
  return taken?.status === "resolved" && taken.value === true;
}

function queriesOf(
  scope: string,
  widths: () => readonly (readonly [key: string, width: string])[] | undefined,
): () => ContainerQueries | undefined {
  return createMemo(
    (): ContainerQueries | undefined => {
      const given = widths();
      if (given === undefined) return undefined;
      return {
        scope,
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
}

function placedOf(used: () => readonly Used[], member?: Member): () => readonly Used[] {
  return createMemo(
    () => {
      if (member !== undefined) member.keys = [];
      const placed = uniqueUsed(used());
      if (member !== undefined) member.keys = placed.map(keyOf);
      return placed;
    },
    { equals: sameUsed },
  );
}

function ownedContainer(queries: () => ContainerQueries | undefined): QueryContainer {
  let placed: () => readonly Used[] = () => [];
  return {
    queries,
    report(used) {
      placed = placedOf(used);
    },
    rules() {
      const current = queries();
      return current === undefined ? undefined : rulesFor(current, placed());
    },
  };
}

function memberContainer(
  queries: () => ContainerQueries | undefined,
  membership: Membership,
  streamed: boolean,
): QueryContainer {
  let joined: { member: Member; placed: () => readonly Used[] } | undefined;
  return {
    queries,
    report(used) {
      if (joined !== undefined) return;
      const member: Member = { keys: [] };
      const placed = placedOf(used, member);
      joined = { member, placed };
      membership.members.push(member);
      onCleanup(() => membership.leave(member));
      createEffect(placed, () => {
        if (isFollowed(membership.members, member)) membership.notify();
      });
    },
    rules() {
      const current = queries();
      if (current === undefined || joined === undefined) return undefined;
      const placed = joined.placed();
      const before = placedBefore(membership, joined.member);
      if (streamed && (isServer || isHydrating())) return rulesFor(current, placed);
      return rulesFor(
        current,
        placed.filter((pair) => !before.has(keyOf(pair))),
      );
    },
  };
}

function scopeOf(scope: string): string {
  return scope.replace(characterOutsideAClassName, "_");
}

export function createQueryContainer(
  scope: string,
  widths: () => readonly (readonly [key: string, width: string])[] | undefined,
): QueryContainer {
  return ownedContainer(queriesOf(scopeOf(scope), widths));
}

export function createSharedQueryContainer(
  scope: string,
  widths: () => readonly (readonly [key: string, width: string])[] | undefined,
): SharedQueryContainer {
  const normalizedScope = scopeOf(scope);
  const streamed = streamedRender(normalizedScope);
  const queries = queriesOf(normalizedScope, widths);
  const membership = createMembership();
  return {
    ...ownedContainer(queries),
    member: () => memberContainer(queries, membership, streamed),
  };
}
