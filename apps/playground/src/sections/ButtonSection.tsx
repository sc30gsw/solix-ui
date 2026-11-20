import { Button, createTheme, SolixProvider } from "@solix/core";
import { refOf } from "#/src/ref-of.ts";
import {
  brandPrimaryColor,
  brandSubtree,
  nestedThemeNames,
  nestedThemes,
} from "#/src/sections/theme-setups.ts";

const brandTheme = createTheme({ primaryColor: brandPrimaryColor });
const outerTheme = createTheme({ primaryColor: nestedThemes.outer.primaryColor });
const innerTheme = createTheme({ primaryColor: nestedThemes.inner.primaryColor });

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
      <SolixProvider theme={outerTheme} cssVariablesSelector={`#${nestedThemes.outer.scope}`}>
        <div id={nestedThemes.outer.scope}>
          <div data-color-scheme="dark">
            <Button>{nestedThemeNames.outerIsland}</Button>
          </div>
          <SolixProvider theme={innerTheme} cssVariablesSelector={`.${nestedThemes.inner.scope}`}>
            <div class={nestedThemes.inner.scope} data-color-scheme="dark">
              <Button>{nestedThemeNames.innerScope}</Button>
              <div data-color-scheme="light">
                <Button>{nestedThemeNames.innerIsland}</Button>
              </div>
            </div>
          </SolixProvider>
        </div>
      </SolixProvider>
    </>
  );
}
