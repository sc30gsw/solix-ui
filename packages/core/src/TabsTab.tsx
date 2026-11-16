import * as stylex from "@stylexjs/stylex";
import type { JSX } from "@solidjs/web";
import { children, Show } from "solid-js";
import { partId } from "./headless";
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
  const { root, part } = tabs.behaviour.bind(
    createParts("TabsTab", styles, props, "value", "leftSection", "rightSection", "children"),
    {
      root: {
        slot: "tab",
        props: () => ({
          value: props.value,
          disabled: props.disabled === true || props.disabled === "",
        }),
        own: {
          get id() {
            return partId(tabs.baseId(), "tab", props.value);
          },
          ref: (tab: HTMLButtonElement) => tabs.valueOfTab.set(tab, () => props.value),
          onClick: (event: MouseEvent & { currentTarget: HTMLButtonElement }) => {
            if (!tabs.allowTabDeactivation()) return;
            if (tabs.behaviour.api.getValue() !== props.value) return;
            event.preventDefault();
            event.currentTarget.focus({ preventScroll: true });
            tabs.behaviour.api.setValue(null);
          },
        },
      },
    },
  );
  const leftSection = children(() => props.leftSection);
  const label = children(() => props.children);
  const rightSection = children(() => props.rightSection);
  return (
    <button {...root}>
      <Show when={leftSection()}>
        <span {...part("leftSection")}>{leftSection()}</span>
      </Show>
      <Show when={label()}>
        <span {...part("label")}>{label()}</span>
      </Show>
      <Show when={rightSection()}>
        <span {...part("rightSection")}>{rightSection()}</span>
      </Show>
    </button>
  );
}
