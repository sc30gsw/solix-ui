import {
  Button,
  colorSchemeAttribute,
  createColorScheme,
  SolixProvider,
  type SolixProviderProps,
} from "@solix/core";
import { createSignal } from "solid-js";
import { argTypesOf } from "virtual:story-controls";
import { expect, userEvent, waitFor } from "storybook/test";
import type { ComponentMeta, ComponentStory } from "#/story-meta.ts";

function OnItsOwnElement(props: SolixProviderProps) {
  const [root, setRoot] = createSignal<HTMLElement>();
  return (
    <SolixProvider getRootElement={root} {...props}>
      <section aria-label="Toggled root" ref={setRoot}>
        {props.children}
      </section>
    </SolixProvider>
  );
}

function Toggle() {
  const { toggleColorScheme } = createColorScheme();
  return <Button onClick={toggleColorScheme}>Toggle</Button>;
}

const meta = {
  title: "Probe/Toggle",
  component: SolixProvider,
  argTypes: argTypesOf(SolixProvider),
} satisfies ComponentMeta<typeof SolixProvider>;

export default meta;

type Story = ComponentStory<typeof meta>;

export const TogglesWithoutCssVariables: Story = {
  render: () => (
    <OnItsOwnElement withCssVariables={false}>
      <Toggle />
    </OnItsOwnElement>
  ),
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Toggle" }));
    await waitFor(() =>
      expect(canvas.getByRole("region")).toHaveAttribute(colorSchemeAttribute, "dark"),
    );
  },
};
