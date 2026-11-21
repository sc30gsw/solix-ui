declare module "virtual:story-controls" {
  import type { Meta } from "storybook-solidjs-vite";

  const generatedFor: unique symbol;

  export type GeneratedControls<C> = NonNullable<Meta<C>["argTypes"]> & {
    readonly [generatedFor]: C;
  };

  export function argTypesOf<C>(component: C): GeneratedControls<C>;
}
