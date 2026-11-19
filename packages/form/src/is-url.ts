import { failureOf } from "#/src/internal-validate.ts";
import { type FormError, type UrlOptions } from "#/src/types.ts";

function isUrlOptions(value: unknown): value is UrlOptions {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function urlArguments(
  optionsOrError: UrlOptions | FormError | undefined,
  error: FormError | undefined,
): { options: UrlOptions; failure: FormError } {
  return isUrlOptions(optionsOrError)
    ? { options: optionsOrError, failure: failureOf(error) }
    : { options: {}, failure: failureOf(optionsOrError) };
}

function isAllowed(text: string, options: UrlOptions): boolean {
  const url = URL.parse(text);
  if (url === null) return false;
  return (
    (options.protocols ?? ["http", "https"]).includes(url.protocol.replace(":", "")) &&
    (options.allowLocalhost === true || url.hostname !== "localhost")
  );
}

/** Fails a value that is not a URL with one of `options.protocols`, `http` and `https` unless given, or a URL on `localhost` unless `options.allowLocalhost` is `true`, with `error`, or `true` when no error is given. A plain object as the first argument is the options, and anything else is the error. */
export function isUrl(options: UrlOptions, error?: FormError): (value: unknown) => FormError | null;
export function isUrl(error?: FormError): (value: unknown) => FormError | null;
export function isUrl(
  optionsOrError?: UrlOptions | FormError,
  error?: FormError,
): (value: unknown) => FormError | null {
  const { options, failure } = urlArguments(optionsOrError, error);
  return (value) => (typeof value === "string" && isAllowed(value, options) ? null : failure);
}
