export type StoryRun = {
  readonly canvas: Element | undefined;
  readonly mounted: boolean;
  readonly playReturned: boolean;
  readonly playOfEveryValue: boolean;
};

const started: StoryRun = {
  canvas: undefined,
  mounted: false,
  playReturned: false,
  playOfEveryValue: false,
};

let run = started;

export function storyStarted(): void {
  run = started;
}

export function playOfEveryValueStarted(): void {
  run = { ...run, playOfEveryValue: true };
}

export function storyMounted(canvas: Element): void {
  run = { ...run, canvas, mounted: true };
}

export function playReturned(): void {
  run = { ...run, playReturned: true };
}

export function lastStoryRun(): StoryRun {
  return run;
}
