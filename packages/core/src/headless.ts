import {
  idPart,
  type OptionsOf,
  type Primitive,
  type PropsOf,
  type SlotName,
  type TypesOf,
} from "@ui-sdk/core";
import { usePrimitive } from "@ui-sdk/solid/primitive";
import { isServer, type JSX } from "@solidjs/web";
import { merge, omit, untrack, useContext } from "solid-js";
import { rootPart } from "./parts";
import { StyleNonceContext } from "./run-time-style";
import { withConsumerStyle } from "./style-props";

export { tabs } from "@ui-sdk/core/tabs";

export type AnyProps = Readonly<Record<string, unknown>>;

type ComponentProps = AnyProps & { readonly class?: never; readonly style?: never };

type Style = JSX.CSSProperties | string | undefined;

type Handled = Event & { readonly defaultPrevented: boolean };

type Handler =
  | ((event: Handled) => void)
  | readonly [(data: unknown, event: Handled) => void, unknown];

const handlerProp = /^on[A-Z]/;

function isHandlerProp(name: string): boolean {
  return handlerProp.test(name);
}

function isOursAlone(name: PropertyKey): boolean {
  return (
    typeof name === "string" &&
    (isHandlerProp(name) || name === "ref" || name === "class" || name === "style")
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
  styled: AnyProps,
  component: ComponentProps,
  slot: (attributes: AnyProps) => AnyProps,
): AnyProps {
  const attributes = merge(omit(component, isOursAlone), omit(styled, isOursAlone), {
    get id() {
      return styled.id ?? component.id;
    },
  });
  const behaviour = slot(attributes);
  const inOrder: AnyProps[] = [styled, component, behaviour];
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
    ref: untrack(() => inOrder.flatMap((props) => props.ref ?? [])),
    get id() {
      return styled.id ?? component.id ?? behaviour.id;
    },
    get class() {
      return styled.class;
    },
    get style() {
      const theirs = behaviour.style;
      return withConsumerStyle(isDeclarations(theirs) ? theirs : {}, styled.style as Style);
    },
  });
}

type SlotPropsGetter<P extends Primitive, Slot extends SlotName<P>> =
  object extends PropsOf<P, Slot>
    ? { props?: () => PropsOf<P, Slot> }
    : { props: () => PropsOf<P, Slot> };

type Bound<P extends Primitive> = {
  [Slot in SlotName<P>]: { slot: Slot; own?: ComponentProps } & SlotPropsGetter<P, Slot>;
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

type RendersItsChildrenItself<Root> =
  PassesChildrenThrough<Root> extends true
    ? {
        readonly "bind takes no root that passes children through: keep children off the root in createParts and render them yourself": never;
      }
    : unknown;

export type Behaviour<P extends Primitive> = {
  readonly api: TypesOf<P>["api"];
  present: <Slot extends SlotName<P>>(slot: Slot, props?: () => PropsOf<P, Slot>) => boolean;
  bind: <Root, Name extends string, Styled, Slots>(
    parts: StyledParts<Root, Name, Styled> & RendersItsChildrenItself<Root>,
    slots: { [Part in keyof Slots]: Part extends typeof rootPart | Name ? Bound<P> : never },
  ) => StyledParts<Root, Name, Styled>;
};

const nothingOfItsOwn: ComponentProps = {};

const pageNonceProperty = "csp-nonce";

function giveTheSdkThePageNonce(nonce: string | undefined): void {
  if (isServer || nonce === undefined || nonce === "") return;
  if (document.head.querySelector(`meta[property="${pageNonceProperty}"]`)) return;
  const meta = document.createElement("meta");
  meta.setAttribute("property", pageNonceProperty);
  meta.nonce = nonce;
  document.head.append(meta);
}

export function createBehaviour<P extends Primitive>(
  primitive: P,
  options: () => OptionsOf<P>,
): Behaviour<P> {
  giveTheSdkThePageNonce(untrack(useContext(StyleNonceContext)));
  const handle = usePrimitive(primitive, options);
  const bind = (
    parts: StyledParts<AnyProps, string, AnyProps>,
    slots: Readonly<Record<string, Bound<P>>>,
  ): StyledParts<AnyProps, string, AnyProps> => {
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
