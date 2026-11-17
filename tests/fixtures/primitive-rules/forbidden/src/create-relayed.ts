import { relayed } from "#/tests/fixtures/primitive-rules/forbidden/src/internal-relay.ts";

export function createRelayed(): () => number {
  return relayed();
}
