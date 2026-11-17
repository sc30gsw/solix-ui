import type { JSX } from "@solidjs/web";
import type { Component, ComponentProps, ValidComponent } from "solid-js";
import type {
  Args,
  ComponentAnnotations,
  ProjectAnnotations,
  StoryAnnotations,
  WebRenderer,
} from "storybook/internal/types";

export interface SolidRenderer extends WebRenderer {
  component: Component<Args>;
  storyResult: JSX.Element;
}

export type Meta<C extends ValidComponent> = ComponentAnnotations<SolidRenderer, ComponentProps<C>>;

export type StoryObj<M extends { component?: ValidComponent }> = StoryAnnotations<
  SolidRenderer,
  ComponentProps<NonNullable<M["component"]>>
>;

export type Preview = ProjectAnnotations<SolidRenderer>;
