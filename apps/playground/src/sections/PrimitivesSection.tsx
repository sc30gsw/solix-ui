import { createClickOutside } from "@solix/primitives";
import { createSignal, createUniqueId } from "solid-js";

function HydrationProbe() {
  const id = createUniqueId();
  return (
    <output
      data-hydration-probe={id}
      ref={(element) => element.setAttribute("data-hydrated-as", id)}
    />
  );
}

export function PrimitivesSection() {
  const [presses, setPresses] = createSignal(0);
  const region = createClickOutside(() => setPresses((count) => count + 1));

  return (
    <section aria-labelledby="primitives-heading">
      <h2 id="primitives-heading">Primitives</h2>
      <div ref={region} class="region">
        A region that counts presses outside it
      </div>
      <p>Presses outside the region: {presses()}</p>
      <HydrationProbe />
    </section>
  );
}
