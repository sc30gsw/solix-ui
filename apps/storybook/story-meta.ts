import type { Meta, StoryObj } from "storybook-solidjs-vite";
import type { GeneratedControls } from "virtual:story-controls";

type ControlsKeptWhole = {
  parameters?: NonNullable<Meta["parameters"]> & { controls?: never };
};

export type ComponentMeta<C> = Omit<Meta<C>, "parameters"> &
  ControlsKeptWhole & { component: C; argTypes: GeneratedControls<C> };

export type ComponentStory<Of> = Omit<StoryObj<Of>, "argTypes" | "parameters"> & ControlsKeptWhole;
