import { expect, test } from "vite-plus/test";
import { createCommand } from "../src/internal-command";
import { mount, unmount } from "./support/browser-harness";

test("a command runs once its owner's effects have run, its idle form before then and once the owner is disposed", () => {
  const seen: string[] = [];
  const command = mount(() => {
    const created = createCommand(
      (label: string) => seen.push(`ran ${label}`),
      (label: string) => seen.push(`idle ${label}`),
    );
    created("while created");
    return created;
  });

  command("once mounted");
  unmount();
  command("after dispose");
  expect(seen).toEqual(["idle while created", "ran once mounted", "idle after dispose"]);
});
