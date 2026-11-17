import { Tabs } from "@solix/core";
import "@solix/core/styles.css";

export default function App() {
  return (
    <main>
      <Tabs defaultValue="one">
        <Tabs.List aria-label="Consumer">
          <Tabs.Tab value="one">One</Tabs.Tab>
          <Tabs.Tab value="two">Two</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="one">One panel</Tabs.Panel>
        <Tabs.Panel value="two">Two panel</Tabs.Panel>
      </Tabs>
    </main>
  );
}
