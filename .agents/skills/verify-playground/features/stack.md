# Stack

After the section named `Center` is a section named `Stack`. It holds a `Stack` of three library buttons, `First in the stack`, `Second in the stack` and `Third in the stack`, and a `Stack` with `gap="xl"` and `align="center"` around the lines `Top of the centred stack` and `Bottom of the centred stack`.

## Sub-features

- `column` lays the buttons out one below the other.
- `default-gap` spaces them by the spacing token `md` and stretches them across the column.
- `gap-and-align` spaces the centred stack by the spacing token `xl` and centres its lines.

## How to get to it (user POV)

- Open the page and scroll to the section named `Stack`, after the section named `Center`.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh` exits 0.

- **Look.** Run `.agents/skills/verify-playground/scripts/drive.mjs stack`. The journey scrolls to the section. The observations `the Stack lays its children out in a column` (`column`), `the Stack's gap is md by default` (the spacing token `md`), `the Stack stretches its children by default` (`stretch`), `Second in the stack sits below First in the stack` (`true`), `the centred Stack takes the gap it is given, xl` (the spacing token `xl`) and `the centred Stack centres its children` (`center`) pass.
- **Proof.** The evidence directory holds `01-stack.png`, `recording.webm` and `observations.json`.

## Gotchas

- Each `Stack` is found as the parent of one of its children, because it has no text or role of its own.
- The gap is read as `row-gap`, the longhand the `gap` shorthand sets in a column.
