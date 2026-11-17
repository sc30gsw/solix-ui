import { Button } from "@solix/core";
import { refOf } from "#/src/ref-of.ts";

export function ButtonSection() {
  return (
    <>
      <Button data-testid="default" ref={refOf("Button")}>
        Default
      </Button>
      <Button data-testid="overridden" class="danger">
        Overridden
      </Button>
      <div class="brand-green">
        <Button data-testid="themed">Themed</Button>
      </div>
    </>
  );
}
