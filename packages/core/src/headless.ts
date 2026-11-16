import {
  idPart,
  type OptionsOf,
  type Primitive,
  type PropsOf,
  type SlotName,
  type TypesOf,
} from "@ui-sdk/core";
import { usePrimitive } from "@ui-sdk/solid/primitive";
import type { JSX } from "@solidjs/web";
import { merge, omit, untrack } from "solid-js";
import { rootPart } from "./parts";
import { withConsumerStyle } from "./style-props";

export { tabs } from "@ui-sdk/core/tabs";

export type PartProps = Readonly<Record<string, unknown>>;

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

function isDeclarations(style: unknown): style is JSX.CSSProperties {
  return typeof style === "object" && style !== null;
}

export function partId(base: string | undefined, part: string, value: string): string | undefined {
  return base === undefined ? undefined : `${base}-${part}-${idPart(value)}`;
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
  const dispatchers = new Map<string, (event: Handled) => void>();
  const dispatcherOf = (name: string) => {
    const dispatch =
      dispatchers.get(name) ??
      ((event: Handled) => {
        for (const props of inOrder) {
          if (!event.defaultPrevented) call(props[name], event);
        }
      });
    dispatchers.set(name, dispatch);
    return dispatch;
  };
  let named = "";
  let dispatching: Record<string, (event: Handled) => void> = {};
  const handlers = () => {
    const names = inOrder.flatMap((props) => Object.keys(props)).filter(isHandlerProp);
    if (names.join() !== named) {
      named = names.join();
      dispatching = Object.fromEntries(names.map((name) => [name, dispatcherOf(name)]));
    }
    return dispatching;
  };
  return merge(behaviour, handlers, {
    [refProp]: untrack(() => inOrder.flatMap((props) => props[refProp] ?? [])),
    get [idProp]() {
      return ours[idProp] ?? own[idProp] ?? behaviour[idProp];
    },
    get [classProp]() {
      return ours[classProp];
    },
    get [styleProp]() {
      const theirs = behaviour[styleProp];
      return withConsumerStyle(isDeclarations(theirs) ? theirs : {}, ours[styleProp] as Style);
    },
  });
}

type SlotProps<P extends Primitive, Slot extends SlotName<P>> =
  object extends PropsOf<P, Slot>
    ? { props?: () => PropsOf<P, Slot> }
    : { props: () => PropsOf<P, Slot> };

type Bound<P extends Primitive> = {
  [Slot in SlotName<P>]: { slot: Slot; own?: PartProps } & SlotProps<P, Slot>;
}[SlotName<P>];

type StyledParts<Root, Name extends string, Styled> = {
  root: Root;
  part: (name: Name) => Styled;
};

type PassesChildrenThrough<Root> = "children" extends keyof Root
  ? [NonNullable<Root["children"]>] extends [never]
    ? false
    : true
  : false;

type RendersItsChildrenItself<Root> = PassesChildrenThrough<Root> extends true ? never : unknown;

export type Behaviour<P extends Primitive> = {
  readonly api: TypesOf<P>["api"];
  present: <Slot extends SlotName<P>>(slot: Slot, props?: () => PropsOf<P, Slot>) => boolean;
  bind: <Root, Name extends string, Styled, Slots>(
    parts: StyledParts<Root, Name, Styled> & RendersItsChildrenItself<Root>,
    slots: { [Part in keyof Slots]: Part extends typeof rootPart | Name ? Bound<P> : never },
  ) => StyledParts<Root, Name, Styled>;
};

const nothingOfItsOwn: PartProps = {};

export function createBehaviour<P extends Primitive>(
  primitive: P,
  options: () => OptionsOf<P>,
): Behaviour<P> {
  const handle = usePrimitive(primitive, options);
  const bind = (
    parts: StyledParts<PartProps, string, PartProps>,
    slots: Readonly<Record<string, Bound<P>>>,
  ): StyledParts<PartProps, string, PartProps> => {
    const bound = new Map(
      Object.entries(slots).map(([name, { slot, props, own = nothingOfItsOwn }]) => [
        name,
        bindSlot(name === rootPart ? parts.root : parts.part(name), own, (attributes) =>
          handle.slot(slot, props, attributes),
        ),
      ]),
    );
    return {
      root: bound.get(rootPart) ?? parts.root,
      part: (name) => bound.get(name) ?? parts.part(name),
    };
  };
  return {
    get api() {
      return handle.api;
    },
    present: (slot, props) => handle.present(slot, props),
    bind: bind as Behaviour<P>["bind"],
  };
}
