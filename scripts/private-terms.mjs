export const privateTermsVariable = "SOLIX_PRIVATE_TERMS";

const termSeparator = /[,\n]/;

/** Reads the private terms from the value of `SOLIX_PRIVATE_TERMS`: comma- or newline-separated, case-insensitive. */
export function parseTerms(value) {
  return (value ?? "")
    .split(termSeparator)
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term.length > 0);
}

/** Returns the 1-based numbers of the lines in `text` that contain any of `terms`. */
export function linesNamingATerm(text, terms) {
  return text
    .split("\n")
    .map((line, index) => ({ line: line.toLowerCase(), number: index + 1 }))
    .filter(({ line }) => terms.some((term) => line.includes(term)))
    .map(({ number }) => number);
}
