import { createTheme, SolixProvider } from "@solix/core";
import { BoxSection } from "./sections/BoxSection";
import { ButtonSection } from "./sections/ButtonSection";
import { ChangingPropsSection } from "./sections/ChangingPropsSection";
import { DisclosureSection } from "./sections/DisclosureSection";
import { ModalSection } from "./sections/ModalSection";
import { PrimitivesSection } from "./sections/PrimitivesSection";
import { StylesApiSection } from "./sections/StylesApiSection";
import { TabsSection } from "./sections/TabsSection";
import { TextInputSection } from "./sections/TextInputSection";
import { themedByTheProvider, themedSpacing } from "./sections/theme-setups";
import { ThemeSection } from "./sections/ThemeSection";
import { styleNonce } from "./style-nonce";
import "./app.css";
import "@solix/core/styles.css";

const playgroundTheme = createTheme({ spacing: themedSpacing });

export default function App() {
  return (
    <SolixProvider
      theme={playgroundTheme}
      cssVariablesSelector={`[${themedByTheProvider}]`}
      getStyleNonce={styleNonce}
    >
      <main>
        <h1>Solix playground</h1>
        <ButtonSection />
        <ChangingPropsSection />
        <DisclosureSection />
        <TextInputSection />
        <ModalSection />
        <BoxSection />
        <StylesApiSection />
        <TabsSection />
        <ThemeSection />
        <PrimitivesSection />
      </main>
    </SolixProvider>
  );
}
