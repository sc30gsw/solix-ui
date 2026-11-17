import { createContext } from "solid-js";

export type GetStyleNonce = () => string | undefined;

export const StyleNonceContext = createContext<GetStyleNonce>(() => undefined);

export const runTimeStyleAttribute = "data-solix-styles";
