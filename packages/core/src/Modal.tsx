import * as stylex from "@stylexjs/stylex";
import { createEffect, createUniqueId, omit, onSettled } from "solid-js";
import { Box } from "./Box";
import { dismissOnOutsidePress, supportsClosedBy } from "./light-dismiss";
import { createParts, type PartProps, partPropKeys } from "./parts";
import type { ElementProps } from "./style-props";
import { tokens } from "./tokens.stylex";

const styles = stylex.create({
  root: {
    backgroundColor: tokens["--solix-color-body"],
    borderColor: tokens["--solix-color-border"],
    borderRadius: tokens["--solix-radius-md"],
    borderStyle: "solid",
    borderWidth: "1px",
    color: tokens["--solix-color-text"],
    maxWidth: "min(32rem, calc(100vw - 2rem))",
    overscrollBehavior: "contain",
    padding: 0,
    width: "100%",
    "::backdrop": {
      backgroundColor: tokens["--solix-color-backdrop"],
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
  props: Omit<
    ElementProps<"dialog", PartProps<typeof styles> & { label: string; opened: boolean }>,
    "open"
  >,
) {
  const rest = omit(props, "class", "style", "label", "children", "opened", ...partPropKeys);
  const part = createParts("Modal", styles, props);
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
    <Box
      aria-labelledby={headingId}
      closedby="any"
      {...rest}
      component="dialog"
      ref={(node: HTMLDialogElement) => (dialog = node)}
      {...part("root")}
    >
      <header {...part("header")}>
        <h2 id={headingId} {...part("heading")}>
          {props.label}
        </h2>
        <form method="dialog">
          <button type="submit" aria-label="Close" {...part("close")}>
            ×
          </button>
        </form>
      </header>
      <div {...part("content")}>{props.children}</div>
    </Box>
  );
}
