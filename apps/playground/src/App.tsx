import { BoxSection } from "#/src/sections/BoxSection.tsx";
import { ButtonSection } from "#/src/sections/ButtonSection.tsx";
import { CenterSection } from "#/src/sections/CenterSection.tsx";
import { ContainerSection } from "#/src/sections/ContainerSection.tsx";
import { ChangingPropsSection } from "#/src/sections/ChangingPropsSection.tsx";
import { DisclosureSection } from "#/src/sections/DisclosureSection.tsx";
import { FlexSection } from "#/src/sections/FlexSection.tsx";
import { GridSection } from "#/src/sections/GridSection.tsx";
import { GroupSection } from "#/src/sections/GroupSection.tsx";
import { ModalSection } from "#/src/sections/ModalSection.tsx";
import { PrimitivesSection } from "#/src/sections/PrimitivesSection.tsx";
import { SimpleGridSection } from "#/src/sections/SimpleGridSection.tsx";
import { SpaceSection } from "#/src/sections/SpaceSection.tsx";
import { StackSection } from "#/src/sections/StackSection.tsx";
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
      <SpaceSection />
      <CenterSection />
      <StackSection />
      <GroupSection />
      <FlexSection />
      <ContainerSection />
      <SimpleGridSection />
      <GridSection />
      <TabsSection />
      <PrimitivesSection />
    </main>
  );
}
