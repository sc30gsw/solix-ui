import { BoxSection } from "./sections/BoxSection";
import { ButtonSection } from "./sections/ButtonSection";
import { ChangingPropsSection } from "./sections/ChangingPropsSection";
import { DisclosureSection } from "./sections/DisclosureSection";
import { ModalSection } from "./sections/ModalSection";
import { StylesApiSection } from "./sections/StylesApiSection";
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
    </main>
  );
}
