import { createContext } from "solid-js";

export type GetStyleNonce = () => string | undefined;

export function nonceOf(given: string | null | undefined): string | undefined {
  return typeof given !== "string" || given.trim() === "" ? undefined : given;
}

export const PageNonceContext = createContext<GetStyleNonce>(() => undefined);
