import { relayed } from "./internal-relay";

export function createRelayed(): () => number {
  return relayed();
}
