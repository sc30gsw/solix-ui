import * as stylex from "@stylexjs/stylex";
import { createEffect, createUniqueId, onSettled } from "solid-js";
import { dismissOnOutsidePress, supportsClosedBy } from "./light-dismiss";
import { createParts, type PartProps } from "./parts";
import { displayPropNames } from "./style-prop-table";
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
  props: ElementProps<
    "dialog",
    PartProps<typeof styles> & {
      label: string;
      opened: boolean;
      open?: never;
      display?: never;
      hiddenFrom?: never;
      visibleFrom?: never;
    }
  >,
) {
  const { root, part } = createParts(
    "Modal",
    styles,
    props,
    "label",
    "children",
    "opened",
    "open",
    "ref",
    ...displayPropNames,
  );
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
      {...root}
      ref={[props.ref, (node: HTMLDialogElement) => (dialog = node)]}
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
    </dialog>
  );
}
