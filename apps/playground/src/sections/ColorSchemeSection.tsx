import {
  Box,
  Button,
  createComputedColorScheme,
  createColorScheme,
  SolixProvider,
  TextInput,
} from "@solix/core";
import {
  colorSchemeSection,
  forcedSection,
  schemeButtons,
  schemeTexts,
} from "#/src/sections/color-scheme-setups.ts";

function ChosenScheme(props: { label: string }) {
  const { colorScheme } = createColorScheme();
  return (
    <p>
      {props.label}: <output aria-label={props.label}>{colorScheme()}</output>
    </p>
  );
}

function ForcedControls() {
  const { setColorScheme } = createColorScheme();
  return <Button onClick={() => setColorScheme("light")}>{schemeButtons.forcedLight}</Button>;
}

function ForcedScheme() {
  let section: HTMLElement | undefined;
  return (
    <section aria-label={forcedSection} ref={(node: HTMLElement) => (section = node)}>
      <SolixProvider forceColorScheme="dark" getRootElement={() => section}>
        <ChosenScheme label={schemeTexts.forcedChosen} />
        <ForcedControls />
        <TextInput aria-label={schemeTexts.forcedInput} />
      </SolixProvider>
    </section>
  );
}

export function ColorSchemeSection() {
  const { setColorScheme, toggleColorScheme, clearColorScheme } = createColorScheme();
  const computedScheme = createComputedColorScheme();
  return (
    <section aria-label={colorSchemeSection}>
      <Button onClick={() => setColorScheme("light")}>{schemeButtons.light}</Button>
      <Button onClick={() => setColorScheme("dark")}>{schemeButtons.dark}</Button>
      <Button onClick={() => setColorScheme("auto")}>{schemeButtons.auto}</Button>
      <Button onClick={toggleColorScheme}>{schemeButtons.toggle}</Button>
      <Button onClick={clearColorScheme}>{schemeButtons.clear}</Button>
      <ChosenScheme label={schemeTexts.chosen} />
      <p>
        {schemeTexts.computed}:{" "}
        <output aria-label={schemeTexts.computed}>{computedScheme()}</output>
      </p>
      <Box lightHidden>{schemeTexts.shownInDark}</Box>
      <Box darkHidden>{schemeTexts.shownInLight}</Box>
      <TextInput aria-label={schemeTexts.pageInput} />
      <ForcedScheme />
    </section>
  );
}
