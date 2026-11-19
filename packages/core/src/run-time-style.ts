import { createContext } from "solid-js";

export type GetStyleNonce = () => string | undefined;

export const PageNonceContext = createContext<GetStyleNonce>(() => undefined);
