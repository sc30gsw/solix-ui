import { BoxSection } from "./sections/BoxSection";
import { ButtonSection } from "./sections/ButtonSection";
import { ChangingPropsSection } from "./sections/ChangingPropsSection";
import { DisclosureSection } from "./sections/DisclosureSection";
import { ModalSection } from "./sections/ModalSection";
import { PrimitivesSection } from "./sections/PrimitivesSection";
import { StylesApiSection } from "./sections/StylesApiSection";
import { TabsSection } from "./sections/TabsSection";
import { TextInputSection } from "./sections/TextInputSection";
import "./app.css";
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
