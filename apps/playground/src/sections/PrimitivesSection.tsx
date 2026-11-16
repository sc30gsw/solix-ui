import * as primitives from "@solix/primitives";
import { createEffect, createSignal, createUniqueId, untrack } from "solid-js";
import {
  type Primitive,
  serialized,
  serverCases,
} from "../../../../packages/primitives/tests/support/server-cases";

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
  const serverCase = serverCases[props.name];
  const returned = serverCase.create(Reflect.get(primitives, String(props.name)));
  const ref = serverCase.ref?.(returned as never);
  const read = serverCase.read ? () => serialized(serverCase.read?.(returned as never)) : undefined;
  const runBrowserCommands = serverCase.browserCommands;
  if (runBrowserCommands) {
    runBrowserCommands(returned as never);
    createEffect(
      () => undefined,
      () => runBrowserCommands(returned as never),
    );
  }
  return (
    <>
      {ref ? (
        <div ref={ref} class="region" tabindex="-1" data-case-region={props.name}>
          {props.name}
        </div>
      ) : null}
      {read ? <output data-case-value={props.name}>{read()}</output> : null}
      <HydrationProbe after={props.name} reading={read} />
    </>
  );
}

function HeadroomCallbacks() {
  const [calls, setCalls] = createSignal<string[]>([]);
  const called = (name: string) => () => setCalls((seen) => [...seen, name]);
  primitives.createHeadroom({
    fixedAt: 0,
    onPin: called("pin"),
    onFix: called("fix"),
    onRelease: called("release"),
  });
  return <p>Headroom callbacks: {calls().join(" ") || "none"}</p>;
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
      <HeadroomCallbacks />
      {(Object.keys(serverCases) as Primitive[]).map((name) => (
        <CaseProbe name={name} />
      ))}
    </section>
  );
}
