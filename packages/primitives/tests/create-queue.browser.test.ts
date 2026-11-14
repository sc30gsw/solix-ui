import fc from "fast-check";
import { createSignal, flush, type Setter } from "solid-js";
import { expect, test } from "vite-plus/test";
import { createQueue, type QueueReturn } from "../src/index";
import { mount, unmount, watch } from "./support/browser-harness";
import { command, flushCommand, type Tick } from "./support/model";

function lists<T>(queue: QueueReturn<T>): [T[], T[]] {
  return [queue.state(), queue.queue()];
}

test("the initial values are split by the limit", () => {
  const queue = mount(() => createQueue({ initialValues: [1, 2, 3, 4], limit: 2 }));
  const empty = mount(() => createQueue<number>({ limit: 2 }));

  expect(lists(queue)).toEqual([
    [1, 2],
    [3, 4],
  ]);
  expect(lists(empty)).toEqual([[], []]);
});

test("add appends after every item and splits again", () => {
  const queue = mount(() => createQueue({ initialValues: [1], limit: 2 }));

  queue.add(2, 3, 4);
  flush();
  expect(lists(queue)).toEqual([
    [1, 2],
    [3, 4],
  ]);
});

test("update receives state then queue, and its result is split again", () => {
  const queue = mount(() => createQueue({ initialValues: [1, 2, 3, 4], limit: 2 }));
  const received: number[][] = [];

  queue.update((items) => {
    received.push(items);
    return items.filter((item) => item !== 1);
  });
  flush();
  expect(received).toEqual([[1, 2, 3, 4]]);
  expect(lists(queue)).toEqual([[2, 3], [4]]);
  queue.update((items) => [0, ...items]);
  flush();
  expect(lists(queue)).toEqual([
    [0, 2],
    [3, 4],
  ]);
});

test("cleanQueue empties the queue and leaves state as it is", () => {
  const queue = mount(() => createQueue({ initialValues: [1, 2, 3], limit: 1 }));

  queue.cleanQueue();
  flush();
  expect(lists(queue)).toEqual([[1], []]);
});

test("a new limit applies from the next command, not before", () => {
  const [limit, setLimit] = createSignal(1);
  const queue = mount(() => createQueue({ initialValues: [1, 2, 3], limit }));

  setLimit(3);
  flush();
  expect(lists(queue)).toEqual([[1], [2, 3]]);
  queue.add();
  flush();
  expect(lists(queue)).toEqual([[1, 2, 3], []]);
});

test("each request decides on the value staged by the requests before it in the same tick, and one that leaves both lists as they were writes nothing", () => {
  const { queue, seenState, seenQueue } = mount(() => {
    const queue = createQueue<number>({ initialValues: [1], limit: 2 });
    return { queue, seenState: watch(queue.state), seenQueue: watch(queue.queue) };
  });

  queue.add(2);
  queue.add(3);
  flush();
  queue.add();
  queue.update((items) => [...items]);
  flush();
  queue.add(4);
  flush();
  expect(seenState).toEqual([[1], [1, 2]]);
  expect(seenQueue).toEqual([[], [3], [3, 4]]);
});

type Lists = { state: number[]; queue: number[]; limit: number };
type Model = Tick<Lists> & { shownState: number[][]; shownQueue: number[][] };
type Real = {
  queue: QueueReturn<number>;
  setLimit: Setter<number>;
  seenState: number[][];
  seenQueue: number[][];
};

const item = fc.integer({ min: 0, max: 5 });
const limits = fc.integer({ min: 0, max: 4 });

function splitBy(model: Model, items: number[]): Lists {
  const limit = model.committed.limit;
  return { state: items.slice(0, limit), queue: items.slice(limit), limit: model.staged.limit };
}

function everyItem(lists: Lists): number[] {
  return [...lists.state, ...lists.queue];
}

function showIfChanged(shown: number[][], next: number[]): void {
  if (JSON.stringify(shown[shown.length - 1]) !== JSON.stringify(next)) shown.push(next);
}

const commands = [
  fc.array(item, { maxLength: 3 }).map((items) =>
    command<Model, Real>(`add(${items.join(", ")})`, (model, real) => {
      real.queue.add(...items);
      model.staged = splitBy(model, [...everyItem(model.staged), ...items]);
    }),
  ),
  item.map((removed) =>
    command<Model, Real>(`update(every item but ${removed})`, (model, real) => {
      real.queue.update((items) => items.filter((kept) => kept !== removed));
      model.staged = splitBy(
        model,
        everyItem(model.staged).filter((kept) => kept !== removed),
      );
    }),
  ),
  item.map((first) =>
    command<Model, Real>(`update(${first} first)`, (model, real) => {
      real.queue.update((items) => [first, ...items]);
      model.staged = splitBy(model, [first, ...everyItem(model.staged)]);
    }),
  ),
  fc.constant(
    command<Model, Real>("cleanQueue()", (model, real) => {
      real.queue.cleanQueue();
      model.staged = { ...model.staged, queue: [] };
    }),
  ),
  limits.map((limit) =>
    command<Model, Real>(`the consumer sets limit to ${limit}`, (model, real) => {
      real.setLimit(limit);
      model.staged = { ...model.staged, limit };
    }),
  ),
  fc.constant(
    flushCommand<Model, Real>((model, real) => {
      showIfChanged(model.shownState, model.committed.state);
      showIfChanged(model.shownQueue, model.committed.queue);
      expect(lists(real.queue), "state and queue after the flush").toEqual([
        model.committed.state,
        model.committed.queue,
      ]);
      expect(real.seenState, "every state the accessor showed").toEqual(model.shownState);
      expect(real.seenQueue, "every queue the accessor showed").toEqual(model.shownQueue);
    }),
  ),
];

test("for every generated sequence of commands, limit changes and flushes, it agrees with a model of the two lists and shows a list only when its items change", () => {
  fc.assert(
    fc.property(
      fc.array(item, { maxLength: 5 }),
      limits,
      fc.commands(commands, { maxCommands: 30, size: "medium" }),
      (initialValues, start, sequence) => {
        const [limit, setLimit] = createSignal(start);
        const { queue, seenState, seenQueue } = mount(() => {
          const queue = createQueue({ initialValues, limit });
          return { queue, seenState: watch(queue.state), seenQueue: watch(queue.queue) };
        });
        const first = {
          state: initialValues.slice(0, start),
          queue: initialValues.slice(start),
          limit: start,
        };
        const model: Model = {
          staged: first,
          committed: first,
          shownState: [first.state],
          shownQueue: [first.queue],
        };
        fc.modelRun(() => ({ model, real: { queue, setLimit, seenState, seenQueue } }), sequence);
        unmount();
      },
    ),
  );
});
