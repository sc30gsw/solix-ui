import { HydrationScript, type JSX } from "@solidjs/web";
import { ColorSchemeScript } from "@solix/core";
import { pageColorScheme } from "#/src/page-color-scheme.ts";
import { playgroundColorSchemeKey } from "#/src/sections/color-scheme-setups.ts";
import { styleNonce } from "#/src/style-nonce.ts";

export default function Document(props: { children?: JSX.Element }) {
  return (
    <html lang="en" data-color-scheme={pageColorScheme}>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <ColorSchemeScript
          defaultColorScheme={pageColorScheme}
          localStorageKey={playgroundColorSchemeKey}
          nonce={styleNonce()}
        />
        <HydrationScript />
      </head>
      <body>{props.children}</body>
    </html>
  );
}
