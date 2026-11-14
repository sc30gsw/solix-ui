import { Box, Button, Disclosure } from "@solix/core";

export function StylesApiSection() {
  return (
    <Box component="section" aria-label="Styles API">
      <Button classes={{ root: "danger" }}>Class from classes.root</Button>
      <Disclosure
        label="Styled parts"
        classes={{ summary: "danger outlined" }}
        styles={{
          summary: {
            "background-color": "var(--playground-part-background)",
            color: "var(--playground-part-text)",
          },
        }}
      >
        Content of the styled parts
      </Disclosure>
      <Button unstyled>Unstyled</Button>
      <button>Plain button</button>
      <Button bg="error">Style prop on a Button</Button>
    </Box>
  );
}
