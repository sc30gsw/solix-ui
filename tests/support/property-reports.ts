import fc from "fast-check";
import { beforeEach } from "vite-plus/test";

const shareOfTheTestTimeout = 0.9;

let timeRunsOutAt = 0;

beforeEach(({ task }) => {
  timeRunsOutAt = performance.now() + task.timeout * shareOfTheTestTimeout;
});

fc.installGlobalPlugin((index, store) =>
  fc.interruptAfterTimeLimit(timeRunsOutAt - performance.now(), { failOnInterrupt: true })(
    index,
    store,
  ),
);
