import { Button, createTheme, SolixProvider } from "@solix/core";
import { refOf } from "#/src/ref-of.ts";
import { brandPrimaryColor, brandSubtree } from "#/src/sections/theme-setups.ts";

const brandTheme = createTheme({ primaryColor: brandPrimaryColor });

export function ButtonSection() {
  return (
    <>
      <Button data-testid="default" ref={refOf("Button")}>
        Default
      </Button>
      <Button data-testid="light" variant="light">
        Light
      </Button>
      <Button data-testid="overridden" class="danger">
        Overridden
      </Button>
      <SolixProvider theme={brandTheme} cssVariablesSelector={`.${brandSubtree}`}>
        <div class={brandSubtree}>
          <Button data-testid="themed">Themed</Button>
        </div>
      </SolixProvider>
    </>
  );
}
