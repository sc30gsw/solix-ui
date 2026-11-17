import { useContext } from "solid-js";
import { StyleNonceContext } from "./run-time-style";
import { libraryStyleMark } from "./style-prop-table";

export type LibraryStyleProps = { of: string; css: string };

export function LibraryStyle(props: LibraryStyleProps) {
  const nonce = useContext(StyleNonceContext);
  return (
    <style nonce={nonce()} {...{ [libraryStyleMark]: props.of }}>
      {props.css}
    </style>
  );
}
