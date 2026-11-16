# Behaviour verification map

This directory is the maintained source for verifying what a keyboard user can do with a component that takes its behaviour from UI SDK. Read this index before driving, then use the matching feature file as the recipe.

## Baseline preconditions

- Launch with `.agents/skills/verify-playground/scripts/launch.sh`, and require `.agents/skills/verify-playground/scripts/doctor.sh` to exit 0.
- Never drive an instance that this checkout did not launch.
- The page has no stored data, so every run starts from the same state after a page load.

## Driving conventions

- Run `.agents/skills/verify-behaviour/scripts/drive.mjs <component> [engine]`, once per installed engine.
- A tab list is found by role `tablist` and its exact name, a tab by the text of its label inside its list, through `tabList` and `tabNamed` in `apps/playground/tests/support/tabs.ts`.
- A row of the keyboard table starts by clicking its starting tab, or by focusing it when it is already selected, so a list where a click on the selected tab selects none starts where the row says.

## Proof and skip reporting

- A run's proof is its evidence directory: numbered screenshots, `recording.webm` and `observations.json`.
- Report a failed observation with its expected and observed values, as the script prints them.
- Do not report an engine as verified because a different engine passed.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing what the user can do. It then uses exactly four H2 sections in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with drive.mjs`, `Gotchas`.

## Features

- [Tabs](./tabs.md) covers arrow keys, Home, End, Enter and Space in horizontal, vertical and right-to-left lists, stepping over disabled tabs, where the Tab key puts focus, and what the SDK writes into the page.
