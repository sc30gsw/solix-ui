import { createSignal, flush } from "solid-js";
import { expect, test } from "vite-plus/test";
import { createQueue, type QueueReturn } from "../src/index";
import { mount, watch } from "./support/browser-harness";

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

test("commands before a flush build on each other, and one that leaves both lists as they were writes nothing", () => {
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
