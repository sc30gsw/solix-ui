import { Button, Modal, TextInput } from "@solix/core";
import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

const meta = {
  component: Modal,
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
} satisfies Meta<typeof Modal>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Closed: Story = {};

export const OpenedAndClosedByItsCloseButton: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Open settings" }));
    const dialog = await canvas.findByRole("dialog", { name: "Settings" });
    await expect(dialog).toBeVisible();
    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(dialog).not.toBeVisible());
  },
};
