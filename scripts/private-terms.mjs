export const privateTermsVariable = "SOLIX_PRIVATE_TERMS";

const termSeparator = /[,\n]/;

export function parseTerms(value) {
  return (value ?? "")
    .split(termSeparator)
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term.length > 0);
}

export function lineNumbersNamingATerm(text, terms) {
  const lowerCaseTerms = terms.map((term) => term.toLowerCase());
  return text
    .split("\n")
    .map((line, index) => ({ line: line.toLowerCase(), number: index + 1 }))
    .filter(({ line }) => lowerCaseTerms.some((term) => line.includes(term)))
    .map(({ number }) => number);
}
