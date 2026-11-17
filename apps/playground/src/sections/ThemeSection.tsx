import { Box } from "@solix/core";
import { themedByTheProvider, themeNames, themeSection } from "#/src/sections/theme-setups.ts";

export function ThemeSection() {
  return (
    <section aria-label={themeSection}>
      <Box p="md">{themeNames.untouched}</Box>
      <div {...{ [themedByTheProvider]: "" }}>
        <Box p="md">{themeNames.themed}</Box>
      </div>
    </section>
  );
}
