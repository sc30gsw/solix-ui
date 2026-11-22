import { createContext } from "solid-js";

export type GetStyleNonce = () => string | undefined;

export function nonceOf(given: string | undefined): string | undefined {
  return given === undefined || given.trim() === "" ? undefined : given;
}

export const PageNonceContext = createContext<GetStyleNonce>(() => undefined);
