import * as stylex from "@stylexjs/stylex";
import { createEffect, createUniqueId, omit, onSettled } from "solid-js";
import type { ComponentProps } from "@solidjs/web";
import { dismissOnOutsidePress, supportsClosedBy } from "./light-dismiss";
import { tokens } from "./tokens.stylex";

const styles = stylex.create({
  root: {
    backgroundColor: tokens["--solix-color-body"],
    borderColor: tokens["--solix-color-border"],
    borderRadius: tokens["--solix-radius-md"],
    borderStyle: "solid",
    borderWidth: "1px",
    maxWidth: "min(32rem, calc(100vw - 2rem))",
    overscrollBehavior: "contain",
    padding: 0,
    width: "100%",
    "::backdrop": {
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      overflow: "hidden",
      overscrollBehavior: "contain",
    },
  },
  header: {
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
    paddingBlock: "0.5rem",
    paddingInline: "1rem",
  },
  heading: {
    fontSize: "1.125rem",
    margin: 0,
  },
  close: {
    backgroundColor: "transparent",
    borderWidth: 0,
    cursor: "pointer",
    fontSize: "1.25rem",
  },
  content: {
    padding: "1rem",
  },
});

export function Modal(
  props: Omit<ComponentProps<"dialog">, "open"> & { label: string; opened: boolean },
) {
  const rest = omit(props, "class", "label", "children", "opened");
  const headingId = createUniqueId();
  let dialog: HTMLDialogElement;

  createEffect(
    () => props.opened,
    (opened) => {
      if (opened && !dialog.open) dialog.showModal();
      if (!opened && dialog.open) dialog.close();
    },
  );

  onSettled(() => {
    if (!supportsClosedBy()) return dismissOnOutsidePress(dialog);
  });

  return (
    <dialog
      aria-labelledby={headingId}
      closedby="any"
      {...rest}
      ref={(node) => (dialog = node)}
      class={[stylex.attrs(styles.root).class, "solix-Modal-root", props.class]}
    >
      <header class={[stylex.attrs(styles.header).class, "solix-Modal-header"]}>
        <h2 id={headingId} class={[stylex.attrs(styles.heading).class, "solix-Modal-heading"]}>
          {props.label}
        </h2>
        <form method="dialog">
          <button
            type="submit"
            aria-label="Close"
            class={[stylex.attrs(styles.close).class, "solix-Modal-close"]}
          >
            ×
          </button>
        </form>
      </header>
      <div class={[stylex.attrs(styles.content).class, "solix-Modal-content"]}>
        {props.children}
      </div>
    </dialog>
  );
}
