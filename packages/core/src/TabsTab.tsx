import * as stylex from "@stylexjs/stylex";
import type { JSX } from "@solidjs/web";
import { children, Show } from "solid-js";
import { partId } from "#/src/headless.ts";
import { createParts, type ElementProps } from "#/src/parts.ts";
import { rendersSomething } from "#/src/renders-something.ts";
import { useTabs } from "#/src/tabs-context.ts";
import { primaryColors } from "#/src/primary-colors.stylex.ts";
import { tokens } from "#/src/tokens.stylex.ts";

const styles = stylex.create({
  root: {
    alignItems: "center",
    backgroundColor: tokens["--solix-color-body"],
    borderBlockEndColor: primaryColors["--solix-primary-6"],
    borderBlockEndStyle: {
      default: "none",
      "[data-selected]": {
        default: "solid",
        '[data-orientation="vertical"]': "none",
      },
    },
    borderBlockEndWidth: "0.125rem",
    borderBlockStartWidth: 0,
    borderInlineEndColor: primaryColors["--solix-primary-6"],
    borderInlineEndStyle: {
      default: "none",
      "[data-selected]": {
        default: "none",
        '[data-orientation="vertical"]': "solid",
      },
    },
    borderInlineEndWidth: "0.125rem",
    borderInlineStartWidth: 0,
    color: {
      default: tokens["--solix-color-text"],
      "[data-selected]": primaryColors["--solix-primary-9"],
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
    outlineColor: primaryColors["--solix-primary-6"],
    outlineOffset: "0.125rem",
    outlineStyle: {
      default: "none",
      ":focus-visible": "solid",
    },
    outlineWidth: "0.125rem",
    paddingBlockEnd: {
      default: "0.5rem",
      "[data-selected]": {
        default: "0.375rem",
        '[data-orientation="vertical"]': "0.5rem",
      },
    },
    paddingBlockStart: "0.5rem",
    paddingInlineEnd: {
      default: tokens["--solix-spacing-md"],
      "[data-selected]": {
        default: tokens["--solix-spacing-md"],
        '[data-orientation="vertical"]': `calc(${tokens["--solix-spacing-md"]} - 0.125rem)`,
      },
    },
    paddingInlineStart: tokens["--solix-spacing-md"],
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
  let pressLandedInside = false;
  const { root, part } = tabs.behaviour.bind(
    createParts("TabsTab", styles, props, {
      keep: ["value", "leftSection", "rightSection", "children"],
    }),
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
          get "data-active"() {
            return tabs.selected() === props.value ? "" : undefined;
          },
          ref: tabs.steps.item(() => props.value),
          onPointerDown: (event: PointerEvent & { currentTarget: HTMLButtonElement }) => {
            pressLandedInside = event.target !== event.currentTarget;
          },
          onBlur: () => {
            pressLandedInside = false;
          },
          onKeyDown: (event: KeyboardEvent & { currentTarget: HTMLButtonElement }) => {
            if (!pressLandedInside || event.key !== "Tab" || !event.shiftKey) return;
            pressLandedInside = false;
            const tab = event.currentTarget;
            tab.blur();
            tab.focus({ preventScroll: true });
          },
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
      <Show when={rendersSomething(leftSection())}>
        <span {...part("leftSection")}>{leftSection()}</span>
      </Show>
      <Show when={rendersSomething(label())}>
        <span {...part("label")}>{label()}</span>
      </Show>
      <Show when={rendersSomething(rightSection())}>
        <span {...part("rightSection")}>{rightSection()}</span>
      </Show>
    </button>
  );
}
