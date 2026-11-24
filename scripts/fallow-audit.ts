export function emptyChangesetProblems(audited: number, changed: readonly string[]): string[] {
  return audited === 0 && changed.length > 0
    ? [
        `fallow audited no changed file, but git diff names ${changed.length}: ${changed.join(", ")}. The audit would pass without reading the change. Check the base it was given.`,
      ]
    : [];
}
