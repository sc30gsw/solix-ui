import type { OptionsOf, Primitive, PropsOf, SlotName, TypesOf } from "@ui-sdk/core";
import { usePrimitive } from "@ui-sdk/solid/primitive";
import type { JSX } from "@solidjs/web";
import { merge, omit, untrack } from "solid-js";
import type { PartProps, PartsBehaviour } from "./parts";

export { tabs } from "@ui-sdk/core/tabs";

type Style = JSX.CSSProperties | string | undefined;

type Handled = Event & { readonly defaultPrevented: boolean };

type Handler =
  | ((event: Handled) => void)
  | readonly [(data: unknown, event: Handled) => void, unknown];

const handlerProp = /^on[A-Z]/;
const refProp = "ref";
const idProp = "id";
const classProp = "class";
const styleProp = "style";

function isHandlerProp(name: string): boolean {
  return handlerProp.test(name);
}

function isOursAlone(name: PropertyKey): boolean {
  return (
    typeof name === "string" &&
    (isHandlerProp(name) || name === refProp || name === classProp || name === styleProp)
  );
}

function call(handler: unknown, event: Handled): void {
  const given = handler as Handler | undefined;
  if (typeof given === "function") given(event);
  else if (Array.isArray(given)) given[0](given[1], event);
}

function declarations(style: Record<string, unknown>): string {
  return Object.entries(style)
    .map(([property, value]) => `${property}:${String(value)};`)
    .join("");
}

function behaviourStyleUnderOurs(behaviour: unknown, ours: Style): Style {
  if (typeof behaviour !== "object" || behaviour === null) return ours;
  if (typeof ours === "string") return `${declarations({ ...behaviour })}${ours}`;
  return { ...behaviour, ...ours };
}

export function bindSlot(
  ours: PartProps,
  own: PartProps,
  slot: (attributes: PartProps) => PartProps,
): PartProps {
  const attributes = merge(omit(own, isOursAlone), omit(ours, isOursAlone), {
    get [idProp]() {
      return ours[idProp] ?? own[idProp];
    },
  });
  const behaviour = slot(attributes);
  const inOrder = [ours, own, behaviour];
  const handlerNames = untrack(() =>
    [...new Set(inOrder.flatMap((props) => Object.keys(props)))].filter(isHandlerProp),
  );
  const handlers = handlerNames.map((name) => [
    name,
    (event: Handled) => {
      for (const props of inOrder) {
        if (!event.defaultPrevented) call(props[name], event);
      }
    },
  ]);
  return merge(behaviour, Object.fromEntries(handlers), {
    [refProp]: untrack(() => inOrder.flatMap((props) => props[refProp] ?? [])),
    get [idProp]() {
      return ours[idProp] ?? own[idProp] ?? behaviour[idProp];
    },
    get [classProp]() {
      return ours[classProp];
    },
    get [styleProp]() {
      return behaviourStyleUnderOurs(behaviour[styleProp], ours[styleProp] as Style);
    },
  });
}

type Bound<P extends Primitive> = {
  [Slot in SlotName<P>]:
    | Slot
    | readonly [slot: Slot, props: () => PropsOf<P, Slot>, own?: PartProps];
}[SlotName<P>];

export type Behaviour<P extends Primitive> = {
  readonly api: TypesOf<P>["api"];
  present: <Slot extends SlotName<P>>(slot: Slot, props?: () => PropsOf<P, Slot>) => boolean;
  parts: (slots: Readonly<Record<string, Bound<P>>>) => PartsBehaviour;
};

const nothingOfItsOwn: PartProps = {};

export function createBehaviour<P extends Primitive>(
  primitive: P,
  options: () => OptionsOf<P>,
): Behaviour<P> {
  const handle = usePrimitive(primitive, options);
  return {
    get api() {
      return handle.api;
    },
    present: (slot, props) => handle.present(slot, props),
    parts: (slots) =>
      Object.fromEntries(
        Object.entries(slots).map(([part, bound]) => {
          const [slot, props, own = nothingOfItsOwn] = typeof bound === "string" ? [bound] : bound;
          return [
            part,
            (ours: PartProps) =>
              bindSlot(ours, own, (attributes) => handle.slot(slot, props, attributes)),
          ];
        }),
      ),
  };
}
