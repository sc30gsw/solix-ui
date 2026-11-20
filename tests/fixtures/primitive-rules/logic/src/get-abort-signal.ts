/** Holds a public function that reads a global Node declares as well as the browser. */
export function getAbortSignal(): AbortSignal {
  return new AbortController().signal;
}
