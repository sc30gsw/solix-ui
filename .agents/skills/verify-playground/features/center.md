# Center

After the section named `Space` is a section named `Center`. It holds a `Center` with a fixed height and the surface background, with the line `Centered content` in its middle, and a paragraph with an inline `Center` in it, which its `component` prop makes a link named `Inline centered link`, an arrow and a label side by side.

## Sub-features

- `content-in-the-middle` puts `Centered content` as far from each edge of the `Center` as from the opposite one.
- `inline` makes the inline `Center` an `inline-flex` container that sits in its line of text.
- `polymorphic` renders the inline `Center` as the `<a>` its `component` prop names, with its `href`.

## How to get to it (user POV)

- Open the page and scroll to the section named `Center`, after the section named `Space`.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh` exits 0.

- **Look.** Run `.agents/skills/verify-playground/scripts/drive.mjs center`. The journey scrolls to the section. The observations `the Center is a flex container` (`flex`), `Centered content sits in the middle of the Center, as far from each edge as from the one opposite` (`true`), `the inline Center is an inline flex container` (`inline-flex`) and `the inline Center is the link its component prop names` (`#center`) pass.
- **Proof.** The evidence directory holds `01-center.png`, `recording.webm` and `observations.json`.

## Gotchas

- The `Center` around `Centered content` is found as the line's parent element, because it has no text or role of its own.
- Centred means each pair of opposite gaps differs by one pixel or less, so an engine's rounding of a half pixel does not count as off centre.
