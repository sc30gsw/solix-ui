# Roadmap

Solix UI is a component library for Solid 2.0, styled with StyleX. This page says what will come before v1.0, what will come after it, and which choices wait on purpose.

## v1.0

The work comes in this order. Each step has a status: not started, in progress or merged. A step that adds components is merged when the build exports every one of them; a part that a component carries as a static member goes with that component. A step that adds no component says on the line under it which test shows it merged, and is merged exactly when that test exists and `vp run verify` runs it.

1. **Layout** (merged): Box, Center, Container, Flex, Grid, Group, SimpleGrid, Space, Stack.
2. **UI SDK seam** (merged): Tabs.
3. **`#/` subpath imports** (merged).
   - Merged when: `tests/subpath-imports.test.ts` exists and `vp run verify` runs it.
4. **Storybook** (merged).
   - Merged when: `apps/storybook/tests/story-coverage.test.ts` exists and `vp run verify` runs it.
5. **Buttons and basic display** (not started): Button, UnstyledButton, CloseButton, IconButton, CopyButton, FileButton, Toggle, Link, Text, Title, Highlight, List, Divider, Paper, VisuallyHidden, Loader, Badge, Avatar, Card, Image, BackgroundImage, Indicator, NumberFormatter, Code.
6. **Input basics** (not started): Input, InputBase, TextInput, Textarea, PasswordInput, NumberInput, PinInput, Fieldset, Checkbox, Radio, Switch, Chip, Slider, NativeSelect.
7. **Overlays** (not started): Modal, Drawer, Dialog, Overlay, LoadingOverlay, Popover, Tooltip, Menu, Transition, Collapse, Accordion, Spoiler, Portal, FocusTrap.
8. **Combobox and the inputs on it** (not started): Combobox, Select, Autocomplete, MultiSelect, Cascader, ComboboxPopover, Pill, PillsInput, TagsInput, FileInput.
9. **Navigation** (not started): Breadcrumbs, Burger, NavLink, Pagination, Stepper, TableOfContents, FloatingIndicator.
10. **Feedback and data** (not started): Alert, EmptyState, Progress, Skeleton, Table, ScrollArea, Scroller.
11. **AppShell and Splitter** (not started): AppShell, Splitter.

The UI SDK seam is the behaviour layer: `Tabs` builds on it, and every new behaviour component will. Storybook will be the surface for visual checks and adds no component. Modal will move onto UI SDK's Dialog.

### Leaving

- **Disclosure** will leave once Accordion and Collapse are in the built library.

### Packages

These packages will ship with v1.0:

- `@solix/form`, with `createForm`.
- `@solix/dates`, on Temporal and Intl.
- `@solix/modals`.
- `@solix/carousel`, on UI SDK's carousel.
- `@solix/dropzone`.

The remaining primitives of `@solix/primitives` will follow as components need them.

## After v1.0

These will follow v1.0:

- Notifications.
- Spotlight.
- Charts.
- A rich text editor.
- Code highlighting.
- A navigation progress bar.
- A scheduler.

## Revisits

A revisit is a choice deferred on purpose. Each one says why not now and gives a condition. The weekly `Newest releases` workflow evaluates every condition against the npm registry and fails, naming the revisit, once one is met.

### ReactiveScript

`@reactivescript/compiler` and `@reactivescript/runtime` make a Solid language whose compiler refuses reactive mistakes.

- Why not now: It is experimental: 0.x, first published 2026-11-09, with breaking changes promised until Solid 2.0 is final. Compiled `.rx` adds a runtime package that every consumer would install. It does not fit the library's Babel and StyleX build or its TypeScript 7 rules.
- When it is reconsidered: for the playground first, not the library source.
- Condition: a stable release old enough to install under the repository's `minimumReleaseAge` exists for `solid-js@^2.0.0` and `@reactivescript/compiler@>=1.0.0`.
