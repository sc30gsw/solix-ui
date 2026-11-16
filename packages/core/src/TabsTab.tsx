import * as stylex from "@stylexjs/stylex";
import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";
import { createParts, type ElementProps } from "./parts";
import { useTabs } from "./tabs-context";
import { tokens } from "./tokens.stylex";

const styles = stylex.create({
  root: {
    alignItems: "center",
    backgroundColor: tokens["--solix-color-body"],
    borderBlockEndColor: tokens["--solix-color-primary"],
    borderBlockEndStyle: {
      default: "none",
      "[data-selected]": "solid",
    },
    borderBlockEndWidth: "0.125rem",
    borderBlockStartWidth: 0,
    borderInlineWidth: 0,
    color: {
      default: tokens["--solix-color-text"],
      "[data-selected]": tokens["--solix-color-primary"],
    },
    cursor: {
      default: "pointer",
      ":disabled": "not-allowed",
    },
    display: "inline-flex",
    fontSize: tokens["--solix-font-size-md"],
    gap: tokens["--solix-spacing-xs"],
    lineHeight: tokens["--solix-line-height-md"],
    opacity: {
      default: 1,
      ":disabled": 0.6,
    },
    outlineColor: tokens["--solix-color-primary"],
    outlineOffset: "0.125rem",
    outlineStyle: {
      default: "none",
      ":focus-visible": "solid",
    },
    outlineWidth: "0.125rem",
    paddingBlockEnd: {
      default: "0.5rem",
      "[data-selected]": "0.375rem",
    },
    paddingBlockStart: "0.5rem",
    paddingInline: tokens["--solix-spacing-md"],
    transitionDuration: "120ms",
    transitionProperty: {
      default: "color",
      "@media (prefers-reduced-motion: reduce)": "none",
    },
  },
  leftSection: {
    alignItems: "center",
    display: "inline-flex",
  },
  label: {
    whiteSpace: "nowrap",
  },
  rightSection: {
    alignItems: "center",
    display: "inline-flex",
  },
});

export type TabsTabProps = ElementProps<
  "button",
  typeof styles,
  { value: string; leftSection?: JSX.Element; rightSection?: JSX.Element }
>;

export function TabsTab(props: TabsTabProps) {
  const tabs = useTabs("Tabs.Tab");
  const { root, part } = createParts(
    "TabsTab",
    styles,
    props,
    tabs.behaviour.parts({
      root: [
        "tab",
        () => ({ value: props.value, disabled: props.disabled === true || props.disabled === "" }),
        {
          get id() {
            const base = tabs.baseId();
            return base === undefined ? undefined : `${base}-tab-${props.value}`;
          },
          onClick: (event: MouseEvent) => {
            if (!tabs.allowTabDeactivation()) return;
            if (tabs.behaviour.api.getValue() !== props.value) return;
            event.preventDefault();
            tabs.behaviour.api.setValue(null);
          },
        },
      ],
    }),
    "value",
    "leftSection",
    "rightSection",
    "children",
  );
  return (
    <button {...root}>
      <Show when={props.leftSection}>
        <span {...part("leftSection")}>{props.leftSection}</span>
      </Show>
      <Show when={props.children}>
        <span {...part("label")}>{props.children}</span>
      </Show>
      <Show when={props.rightSection}>
        <span {...part("rightSection")}>{props.rightSection}</span>
      </Show>
    </button>
  );
}
