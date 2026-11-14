export function createAttachment<C>(config: () => C, attach: (current: C) => () => void): void {
  attach(config());
}
