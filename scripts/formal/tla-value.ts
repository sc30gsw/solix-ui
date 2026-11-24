export type TlaValue = number | string | boolean | null | undefined | TlaValue[] | TlaRecord;
export type TlaRecord = { [field: string]: TlaValue };
export type Vars = Record<string, TlaValue>;

export class ValueReader {
  readonly text: string;
  at = 0;

  constructor(text: string) {
    this.text = text;
  }

  fail(what: string): never {
    throw new Error(
      `cannot read the TLA+ value ${JSON.stringify(this.text)}: ${what} at ${this.at}.`,
    );
  }

  space(): void {
    while (this.at < this.text.length && /\s/.test(this.text[this.at])) this.at += 1;
  }

  takes(token: string): boolean {
    this.space();
    if (!this.text.startsWith(token, this.at)) return false;
    this.at += token.length;
    return true;
  }

  expect(token: string): void {
    if (!this.takes(token)) this.fail(`${token} expected`);
  }

  listUntil(end: string): TlaValue[] {
    const values: TlaValue[] = [];
    if (this.takes(end)) return values;
    do values.push(this.value());
    while (this.takes(","));
    this.expect(end);
    return values;
  }

  record(): TlaRecord {
    const fields: TlaRecord = {};
    do {
      this.space();
      const name = /^\w+/.exec(this.text.slice(this.at))?.[0];
      if (name === undefined) this.fail("a field name expected");
      this.at += name.length;
      this.expect("|->");
      fields[name] = this.value();
    } while (this.takes(","));
    this.expect("]");
    return fields;
  }

  string(): string {
    let read = "";
    while (this.at < this.text.length && this.text[this.at] !== '"') {
      if (this.text[this.at] === "\\") {
        const escaped = this.text[this.at + 1];
        read += escaped === "n" ? "\n" : escaped === "t" ? "\t" : escaped;
        this.at += 2;
      } else {
        read += this.text[this.at];
        this.at += 1;
      }
    }
    this.expect('"');
    return read;
  }

  value(): TlaValue {
    if (this.takes("<<")) return this.listUntil(">>");
    if (this.takes("{")) return this.listUntil("}");
    if (this.takes("[")) return this.record();
    if (this.takes('"')) return this.string();
    this.space();
    const word = /^-?\d+|^\w+/.exec(this.text.slice(this.at))?.[0];
    if (word === undefined) this.fail("a value expected");
    this.at += word.length;
    if (/^-?\d+$/.test(word)) return Number(word);
    if (word === "TRUE") return true;
    if (word === "FALSE") return false;
    if (word === "Null") return null;
    if (word === "Undefined") return undefined;
    return word;
  }

  whole(): TlaValue {
    const value = this.value();
    this.space();
    if (this.at < this.text.length) this.fail("the end expected");
    return value;
  }
}

export function parseValue(text: string): TlaValue {
  return new ValueReader(text).whole();
}

export function tlaText(value: TlaValue): string {
  if (value === null) return "Null";
  if (value === undefined) return "Undefined";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `{${value.map(tlaText).join(", ")}}`;
  return `[${Object.keys(value)
    .sort()
    .map((name) => `${name} |-> ${tlaText(value[name])}`)
    .join(", ")}]`;
}

export function textOf(value: TlaValue): string {
  return typeof value === "string" ? value : tlaText(value);
}

export function keyOf(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(keyOf).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value)
      .filter(([, field]) => field !== undefined)
      .sort(([one], [other]) => (one < other ? -1 : one > other ? 1 : 0))
      .map(([name, field]) => `${JSON.stringify(name)}:${keyOf(field)}`)
      .join(",")}}`;
  }
  return value === undefined ? "undefined" : JSON.stringify(value);
}

function wrong(value: TlaValue, what: string, where: string): never {
  throw new Error(`${where}: the model holds ${tlaText(value)}, not ${what}.`);
}

export function numberIn(value: TlaValue, where: string): number {
  return typeof value === "number" ? value : wrong(value, "a number", where);
}

export function booleanIn(value: TlaValue, where: string): boolean {
  return typeof value === "boolean" ? value : wrong(value, "a boolean", where);
}

export function stringIn(value: TlaValue, where: string): string {
  return typeof value === "string" ? value : wrong(value, "a string", where);
}

export function indexOrNoneIn(value: TlaValue, where: string): number | null {
  return value === null || typeof value === "number"
    ? value
    : wrong(value, "an index or none", where);
}

export function numbersIn(value: TlaValue, where: string): number[] {
  return Array.isArray(value)
    ? value.map((each) => numberIn(each, where))
    : wrong(value, "a set of numbers", where);
}

export function fieldIn(value: TlaValue, field: string, where: string): TlaValue {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value[field]
    : wrong(value, `a record with ${field}`, where);
}

export function varsMatch(vars: Vars, expected: Readonly<Record<string, TlaValue>>): boolean {
  return Object.entries(expected).every(([name, value]) => tlaText(vars[name]) === tlaText(value));
}
