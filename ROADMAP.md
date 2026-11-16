# Roadmap

Solix UI is a component library for Solid 2.0, styled with StyleX. This page says what will come before v1.0 and what will come after it.

## v1.0

The work comes in this order. Each step has a status: not started, in progress or merged. Only the status merged is checked against the build. A part that a component carries as a static member goes with that component.

1. **Layout** (in progress): Box, Center, Container, Flex, Grid, Group, SimpleGrid, Space, Stack.
2. **UI SDK seam** (in progress): Tabs.
3. **`#/` subpath imports** (not started).
4. **Storybook** (not started).
5. **Buttons and basic display** (not started): Button, UnstyledButton, CloseButton, IconButton, CopyButton, FileButton, Toggle, Link, Text, Title, Highlight, List, Divider, Paper, VisuallyHidden, Loader, Badge, Avatar, Card, Image, BackgroundImage, Indicator, NumberFormatter, Code.
6. **Input basics** (not started): Input, InputBase, TextInput, Textarea, PasswordInput, NumberInput, PinInput, Fieldset, Checkbox, Radio, Switch, Chip, Slider, NativeSelect.
7. **Overlays** (not started): Modal, Drawer, Dialog, Overlay, LoadingOverlay, Popover, Tooltip, Menu, Transition, Collapse, Accordion, Spoiler, Portal, FocusTrap.
8. **Combobox and the inputs on it** (not started): Combobox, Select, Autocomplete, MultiSelect, Cascader, ComboboxPopover, Pill, PillsInput, TagsInput, FileInput.
9. **Navigation** (not started): Breadcrumbs, Burger, NavLink, Pagination, Stepper, TableOfContents, FloatingIndicator.
10. **Feedback and data** (not started): Alert, EmptyState, Progress, Skeleton, Table, ScrollArea, Scroller.
11. **AppShell and Splitter** (not started): AppShell, Splitter.

The UI SDK seam will be the behaviour layer every behaviour component builds on. Storybook will be the surface for visual checks and adds no component. Modal will move onto UI SDK's Dialog.

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
