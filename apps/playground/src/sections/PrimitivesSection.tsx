import * as primitives from "@solix/primitives";
import { createEffect, createSignal, createUniqueId, untrack } from "solid-js";
import {
  type Primitive,
  serialized,
  serverCases,
  startCase,
} from "../../../../packages/primitives/fixtures/server-cases";

function HydrationProbe(props: { after: string; reading?: () => string }) {
  const id = createUniqueId();
  return (
    <output
      data-hydration-probe={id}
      data-after={props.after}
      ref={(element) => {
        element.setAttribute("data-hydrated-as", id);
        if (props.reading)
          element.setAttribute("data-read-while-hydrating", untrack(props.reading));
      }}
    />
  );
}

function CaseProbe(props: { name: Primitive }) {
  const [calls, setCalls] = createSignal<string[]>([]);
  const callbacks = { taken: false };
  const started = startCase(props.name, primitives, (name) => {
    callbacks.taken = true;
    return () => setCalls((seen) => [...seen, name]);
  });
  const value = started.value;
  const read = value ? () => serialized(value.read()) : undefined;
  const runBrowserCommands = started.browserCommands;
  if (runBrowserCommands) {
    runBrowserCommands();
    createEffect(
      () => undefined,
      () => runBrowserCommands(),
    );
  }
  return (
    <>
      {started.ref ? (
        <div ref={started.ref} class="region" tabindex="-1" data-case-region={props.name}>
          {props.name}
        </div>
      ) : null}
      {read ? <output data-case-value={props.name}>{read()}</output> : null}
      {callbacks.taken ? (
        <output data-case-calls={props.name}>{calls().join(" ") || "none"}</output>
      ) : null}
      <HydrationProbe after={props.name} reading={read} />
    </>
  );
}

export function PrimitivesSection() {
  const [presses, setPresses] = createSignal(0);
  const [clicks, setClicks] = createSignal(0);
  const outside = primitives.createClickOutside(() => setPresses((count) => count + 1));
  const clicked = primitives.createEventListener("click", () => setClicks((count) => count + 1));

  return (
    <section aria-labelledby="primitives-heading">
      <h2 id="primitives-heading">Primitives</h2>
      <div ref={outside} class="region">
        A region that counts presses outside it
      </div>
      <div ref={clicked} class="region">
        A region that counts clicks on it
      </div>
      <p>Presses outside the region: {presses()}</p>
      <p>Clicks on the region: {clicks()}</p>
      {(Object.keys(serverCases) as Primitive[]).map((name) => (
        <CaseProbe name={name} />
      ))}
    </section>
  );
}
