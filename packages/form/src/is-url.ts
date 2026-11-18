import { failureOf } from "#/src/internal-validate.ts";
import { type FormError, type UrlOptions } from "#/src/types.ts";

function isUrlOptions(value: unknown): value is UrlOptions {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    ("protocols" in value || "allowLocalhost" in value)
  );
}

function isAllowed(text: string, options: UrlOptions): boolean {
  const url = URL.parse(text);
  if (url === null) return false;
  return (
    (options.protocols ?? ["http", "https"]).includes(url.protocol.replace(":", "")) &&
    (options.allowLocalhost === true || url.hostname !== "localhost")
  );
}

/** Fails a value that is not a URL with one of `options.protocols`, `http` and `https` unless given, or a URL on `localhost` unless `options.allowLocalhost` is `true`, with `error`, or `true` when no error is given. The options may be left out, so that `error` is the first argument. */
export function isUrl(error?: FormError): (value: unknown) => FormError | null;
export function isUrl(options: UrlOptions, error?: FormError): (value: unknown) => FormError | null;
export function isUrl(
  optionsOrError?: UrlOptions | FormError,
  error?: FormError,
): (value: unknown) => FormError | null {
  return (value) => {
    const options = isUrlOptions(optionsOrError) ? optionsOrError : {};
    const failure = failureOf(isUrlOptions(optionsOrError) ? error : optionsOrError);
    return typeof value === "string" && isAllowed(value, options) ? null : failure;
  };
}
