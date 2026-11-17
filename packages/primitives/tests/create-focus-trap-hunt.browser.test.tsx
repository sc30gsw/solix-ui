import fc from "fast-check";
import { createSignal } from "solid-js";
import { expect, test } from "vite-plus/test";
import { server } from "vite-plus/test/browser";
import { createFocusTrap } from "#/src/index.ts";
import { flush, mountOn, unmount } from "#/tests/support/browser-harness.ts";
import { html, nextTask, settled, tab } from "#/tests/support/dom.ts";
import {
  apply,
  changes,
  engineOrder,
  expectedAfter,
  kinds,
  type Slot,
  type Step,
} from "#/tests/support/tab-order.ts";

const huntedEngine = "firefox";
const huntTimeout = 900_000;
const huntRuns = 1_500;

async function trapped(container: HTMLElement): Promise<void> {
  mountOn(() => createFocusTrap(), container);
  await nextTask();
}

const step: fc.Arbitrary<Step> = fc.oneof(
  { weight: 3, arbitrary: fc.record({ type: fc.constant("tab"), backwards: fc.boolean() }) },
  fc.record({ type: fc.constant("add"), at: fc.nat(), kind: fc.constantFrom(...kinds) }),
  fc.record({ type: fc.constant("remove"), at: fc.nat() }),
  fc.record({ type: fc.constant("toggle"), at: fc.nat(), change: fc.constantFrom(...changes) }),
) as fc.Arbitrary<Step>;

test.runIf(server.browser === huntedEngine)(
  "hunt: the focus trap property, for many more generated sequences, in the engine where it once timed out",
  { timeout: huntTimeout },
  async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom(...kinds), { minLength: 0, maxLength: 4 }),
        fc.array(step, { minLength: 1, maxLength: 12 }),
        async (initial, steps) => {
          document.body.replaceChildren();
          html(`<button>Before</button>`);
          const container = html(`<div id="trap" tabindex="-1" aria-label="Trap"></div>`);
          const mirrorStart = html(`<button>Mirror start</button>`);
          const mirror = html(`<div aria-label="Mirror"></div>`);
          html(`<button>Mirror end</button>`);
          const suspender = html(`<div></div>`);
          html(`<button>After</button>`);
          const slots: Slot[] = [];
          const mirrored: Slot[] = [];
          for (const [index, kind] of initial.entries()) {
            apply({ type: "add", at: index, kind }, slots, container, `trap start ${index}`);
            apply({ type: "add", at: index, kind }, mirrored, mirror, `mirror start ${index}`);
          }
          let order = await engineOrder(mirrorStart, mirrored);
          mirrorStart.blur();
          await trapped(container);
          const [suspended, setSuspended] = createSignal(false);
          mountOn(() => createFocusTrap(suspended), suspender);
          try {
            for (const [index, current] of steps.entries()) {
              if (current.type !== "tab") {
                const before = document.activeElement;
                setSuspended(true);
                flush();
                apply(current, mirrored, mirror, `mirror step ${index}`);
                order = await engineOrder(mirrorStart, mirrored);
                if (before instanceof HTMLElement && before !== document.body) before.focus();
                else (document.activeElement as HTMLElement | null)?.blur();
                setSuspended(false);
                flush();
                apply(current, slots, container, `trap step ${index}`);
                await settled();
                continue;
              }
              const expected = expectedAfter(
                document.activeElement,
                current.backwards,
                order,
                slots,
                container,
              );
              await tab(current.backwards);
              expect(container.contains(document.activeElement), "focus stays in the trap").toBe(
                true,
              );
              if (expected !== undefined) {
                expect(document.activeElement, "focus lands where the engine's order says").toBe(
                  expected,
                );
              }
            }
          } finally {
            unmount();
          }
        },
      ),
      { numRuns: huntRuns },
    );
  },
);
