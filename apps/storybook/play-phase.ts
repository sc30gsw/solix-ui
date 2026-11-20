export type PlayPhaseFollower = { readonly started: () => void; readonly ended: () => void };

const followers = new Set<PlayPhaseFollower>();

export function followThePlayPhase(follower: PlayPhaseFollower): void {
  followers.add(follower);
}

export function playStarted(): void {
  for (const { started } of followers) started();
}

export function playEnded(): void {
  for (const { ended } of followers) ended();
}
