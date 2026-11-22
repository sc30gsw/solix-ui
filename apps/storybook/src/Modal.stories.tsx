import { Button, Modal, TextInput } from "@solix/core";
import { createSignal } from "solid-js";
import { argTypesOf } from "virtual:story-controls";
import { expect, userEvent, waitFor, within } from "storybook/test";
import type { ComponentMeta, ComponentStory } from "#/story-meta.ts";

const meta = {
  component: Modal,
  argTypes: argTypesOf(Modal),
  args: { label: "Settings", opened: false },
  render: (args) => {
    const [opened, setOpened] = createSignal(args.opened);
    return (
      <>
        <Button onClick={() => setOpened(true)}>Open settings</Button>
        <Modal {...args} opened={opened()} onClose={() => setOpened(false)}>
          <TextInput aria-label="Name" />
        </Modal>
      </>
    );
  },
} satisfies ComponentMeta<typeof Modal>;

export default meta;

type Story = ComponentStory<typeof meta>;

export const Closed: Story = {};

export const Opened: Story = {
  args: { opened: true },
};

export const OpenedAndClosedByItsCloseButton: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("dialog")).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Open settings" }));
    const dialog = await canvas.findByRole("dialog", { name: "Settings" });
    await expect(dialog).toBeVisible();
    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(dialog).not.toBeVisible());
  },
};
