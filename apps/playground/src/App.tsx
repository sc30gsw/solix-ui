import { BoxSection } from "./sections/BoxSection";
import { ButtonSection } from "./sections/ButtonSection";
import { CenterSection } from "./sections/CenterSection";
import { ChangingPropsSection } from "./sections/ChangingPropsSection";
import { DisclosureSection } from "./sections/DisclosureSection";
import { FlexSection } from "./sections/FlexSection";
import { GroupSection } from "./sections/GroupSection";
import { ModalSection } from "./sections/ModalSection";
import { PrimitivesSection } from "./sections/PrimitivesSection";
import { SpaceSection } from "./sections/SpaceSection";
import { StackSection } from "./sections/StackSection";
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
      <SpaceSection />
      <CenterSection />
      <StackSection />
      <GroupSection />
      <FlexSection />
      <PrimitivesSection />
    </main>
  );
}
