import type { JSX } from "@solidjs/web";
import { LIBRARY_CLASS_PREFIX } from "../build-pipeline.mjs";
import type { Breakpoint, StylePropName, VisibilityPropName } from "../src/style-prop-table";
import type { ConsumerProps } from "./built-library";

export type ClassToken = { token: string; applied: boolean; writtenAs: string };
export type PartClassToken = ClassToken & { target: string };
export type Declaration = [property: string, value: string];
export type DrawnDeclaration = [property: string, value: string | null | undefined];
export type ConsumerStyle =
  | { declarations: DrawnDeclaration[]; writtenAs: "object" | "string" }
  | undefined;
export type DeclaredStyleProp = { written: unknown; keptKeys: string[] };
export type StylePropCase = {
  styleProps: [StylePropName, DeclaredStyleProp][];
  visibility: Partial<Record<VisibilityPropName, Breakpoint | null>>;
  classTokens: ClassToken[];
  consumerStyle: ConsumerStyle;
  stylesRoot: DrawnDeclaration[];
  unstyled: boolean;
};

export const classProp = "the class prop";
export const elsewhere = "/elsewhere";

export function stylePropClassName(suffix: string): string {
  return `${LIBRARY_CLASS_PREFIX}-${suffix}`;
}

export function classValueFrom(tokens: ClassToken[]): JSX.ClassValue {
  const written = (shape: string) => tokens.filter(({ writtenAs: as }) => as === shape);
  const asString = written("string")
    .filter(({ applied }) => applied)
    .map(({ token }) => token)
    .join(" ");
  const asArrayItems = written("array item").map(({ token, applied }) => applied && token);
  const asObject = Object.fromEntries(
    written("object key").map(({ token, applied }) => [token, applied]),
  );
  return [asString, asArrayItems, asObject];
}

export function classesPropsFrom(parts: string[], tokens: PartClassToken[]): ConsumerProps {
  const of = (target: string) => tokens.filter((token) => token.target === target);
  return {
    classes: Object.fromEntries(
      parts.filter((part) => of(part).length > 0).map((part) => [part, classValueFrom(of(part))]),
    ),
    class: classValueFrom(of(classProp)),
  };
}

export function presentDeclarations(declarations: DrawnDeclaration[]): Declaration[] {
  return declarations.flatMap(([property, value]): Declaration[] =>
    value === undefined || value === null ? [] : [[property, value]],
  );
}

export function declaredBy(style: ConsumerStyle): Declaration[] {
  return presentDeclarations(style?.declarations ?? []);
}

export function styleWritten(style: ConsumerStyle): ConsumerProps {
  if (style === undefined) return {};
  return {
    style:
      style.writtenAs === "string"
        ? declaredBy(style)
            .map(([property, value]) => `${property}: ${value}`)
            .join("; ")
        : Object.fromEntries(style.declarations),
  };
}

export function stylePropPropsOf(generated: StylePropCase): ConsumerProps {
  return {
    ...Object.fromEntries(generated.styleProps.map(([name, { written }]) => [name, written])),
    ...generated.visibility,
    class: classValueFrom(generated.classTokens),
    ...styleWritten(generated.consumerStyle),
    styles: { root: Object.fromEntries(generated.stylesRoot) },
    unstyled: generated.unstyled,
  };
}
