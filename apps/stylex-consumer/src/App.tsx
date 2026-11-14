import * as stylex from "@stylexjs/stylex";
import { Button, Disclosure } from "@solix/core";
import "@solix/core/styles.css";

const styles = stylex.create({
  danger: {
    backgroundColor: "oklch(0.58 0.22 20)",
  },
  summary: {
    backgroundColor: "oklch(0.45 0.15 300)",
  },
  brand: {
    "--solix-color-primary": "oklch(0.54 0.12 155)",
  },
  primary: {
    backgroundColor: "var(--solix-color-primary)",
  },
});

export function App() {
  return (
    <main>
      <h1>Solix with StyleX</h1>
      <Button>Library default</Button>
      <Button class={stylex.attrs(styles.danger).class}>StyleX class</Button>
      <Disclosure label="Library summary">Content</Disclosure>
      <Disclosure label="StyleX summary" classes={{ summary: stylex.attrs(styles.summary).class }}>
        Content
      </Disclosure>
      <div {...stylex.attrs(styles.brand)}>
        <Button>StyleX theme</Button>
        <div data-testid="theme reference" {...stylex.attrs(styles.primary)} />
      </div>
      <div data-testid="class reference" {...stylex.attrs(styles.danger)} />
      <div data-testid="summary reference" {...stylex.attrs(styles.summary)} />
    </main>
  );
}
