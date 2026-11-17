import { useContext } from "solid-js";
import { StyleNonceContext } from "#/src/run-time-style.ts";
import { libraryStyleMark } from "#/src/style-prop-table.ts";

export type LibraryStyleProps = { of: string; css: string };

export function LibraryStyle(props: LibraryStyleProps) {
  const nonce = useContext(StyleNonceContext);
  return (
    <style nonce={nonce()} {...{ [libraryStyleMark]: props.of }}>
      {props.css}
    </style>
  );
}
