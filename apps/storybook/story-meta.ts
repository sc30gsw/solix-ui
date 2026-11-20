import type { Meta, StoryObj } from "storybook-solidjs-vite";
import type { GeneratedControls } from "virtual:story-controls";

export type ComponentMeta<C> = Meta<C> & { component: C; argTypes: GeneratedControls<C> };

export type ComponentStory<Of> = Omit<StoryObj<Of>, "argTypes">;
