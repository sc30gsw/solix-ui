import { useContext } from "solid-js";
import { runTimeStyleAttribute, StyleNonceContext } from "./run-time-style";

export type LibraryStyleProps = { of: string; css: string };

export function LibraryStyle(props: LibraryStyleProps) {
  const nonce = useContext(StyleNonceContext);
  return (
    <style nonce={nonce()} {...{ [runTimeStyleAttribute]: props.of }}>
      {props.css}
    </style>
  );
}
