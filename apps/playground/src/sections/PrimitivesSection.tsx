import * as primitives from "@solix/primitives";
import { createSignal, createUniqueId } from "solid-js";

type Library = typeof primitives;
type ElementPrimitive = {
  [K in keyof Library]: Library[K] extends (...args: never[]) => (...element: infer A) => void
    ? A extends [Element]
      ? K
      : never
    : never;
}[keyof Library];
type Probe = { create: () => primitives.RefSetter<HTMLElement>; label: string };

function HydrationProbe(props: { after: string }) {
  const id = createUniqueId();
  return (
    <output
      data-hydration-probe={id}
      data-after={props.after}
      ref={(element) => element.setAttribute("data-hydrated-as", id)}
    />
  );
}

function ElementPrimitiveProbe(props: { name: string; probe: Probe }) {
  const ref = props.probe.create();
  return (
    <>
      <div ref={ref} class="region">
        {props.probe.label}
      </div>
      <HydrationProbe after={props.name} />
    </>
  );
}

export function PrimitivesSection() {
  const [presses, setPresses] = createSignal(0);
  const [clicks, setClicks] = createSignal(0);
  const probes: { [K in ElementPrimitive]: Probe } = {
    createClickOutside: {
      create: () => primitives.createClickOutside(() => setPresses((count) => count + 1)),
      label: "A region that counts presses outside it",
    },
    createEventListener: {
      create: () => primitives.createEventListener("click", () => setClicks((count) => count + 1)),
      label: "A region that counts clicks on it",
    },
    createFocusTrap: {
      create: () => primitives.createFocusTrap(false),
      label: "A region with a focus trap that stays off",
    },
  };

  return (
    <section aria-labelledby="primitives-heading">
      <h2 id="primitives-heading">Primitives</h2>
      {Object.entries(probes).map(([name, probe]) => (
        <ElementPrimitiveProbe name={name} probe={probe} />
      ))}
      <p>Presses outside the region: {presses()}</p>
      <p>Clicks on the region: {clicks()}</p>
    </section>
  );
}
