import { BoxSection } from "#/src/sections/BoxSection.tsx";
import { ButtonSection } from "#/src/sections/ButtonSection.tsx";
import { ChangingPropsSection } from "#/src/sections/ChangingPropsSection.tsx";
import { DisclosureSection } from "#/src/sections/DisclosureSection.tsx";
import { ModalSection } from "#/src/sections/ModalSection.tsx";
import { PrimitivesSection } from "#/src/sections/PrimitivesSection.tsx";
import { StylesApiSection } from "#/src/sections/StylesApiSection.tsx";
import { TabsSection } from "#/src/sections/TabsSection.tsx";
import { TextInputSection } from "#/src/sections/TextInputSection.tsx";
import "#/src/app.css";
import "@solix/core/styles.css";

export default function App() {
  return (
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
      <PrimitivesSection />
    </main>
  );
}
