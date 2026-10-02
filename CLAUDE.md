# Year Map — working notes for a session opened here

An Obsidian community plugin (`year-map`): a linear calendar, the year on one page after Nick Milo's Linear Calendar
(CC BY 4.0, credited in the README and in the corner of every year map). Read `README.md` for what it does. A
machine's own notes (where its vault is, how it is installed there) go in `CLAUDE.local.md`, which git ignores.

## Layout

| File | What it is |
|---|---|
| `src/grid.ts` | The calendar arithmetic: 37 weekday-aligned columns, a row per month. Pure. |
| `src/layout.ts` | Events cut per month and placed in lanes. Pure. |
| `src/sources.ts` | What is read from notes: dates, tags, TaskNotes' settings and tasks, events (their kind, icon, repeat, open end and deadlines), daily notes. Pure. |
| `src/recur.ts` | Events that come back: every year, or every year of the Umm al-Qura calendar, through `Intl`. Pure apart from Intl. |
| `src/options.ts` | What a `year-map` code block may say. Pure. |
| `src/settings-model.ts` | The settings and their defaults. Pure. |
| `src/model.ts` | One year's model from the notes and settings, its signature, a range in words. Pure. |
| `src/render.ts` | Draws a model with Obsidian's DOM helpers; hands every gesture back through `Handlers`. |
| `src/integrations.ts` | TaskNotes, Journals, Daily notes and Periodic Notes, read at run time and never required. |
| `src/modal.ts` | The event window a drag across days or a day's menu opens: name, kind, icon, days, repeat, colour. |
| `src/settings.ts` | The declarative settings tab (Obsidian 1.13). |
| `src/main.ts` | The plugin, its view and its code block. |
| `styles.css` | The look; light theme on the template's beige paper, dark theme on the theme's surfaces. |
| `test/` | `node --test` with type stripping; `fakedom.ts` and `fakeobsidian.ts` stand in for Obsidian. |
| `docs/demo/` | A page drawn by the real model and renderer; `node docs/demo/build.mjs --shots` writes the screenshots. |

## Rules

- Tests first: a failing test, then the code. `npm test`, `npm run lint` (no findings) and `npm run build` must all
  pass before a commit.
- Other plugins are read through what they expose at run time (`app.plugins.plugins.<id>`), each call guarded:
  the year map must work with none of them installed.
- The renderer never touches a note; only `integrations.ts` writes, and only on the user's gesture: a task dropped on
  a day, a span planned, a missing daily note made.
- Test data is made up: no real person's name, birthday, trip or appointment, in tests, the demo or the screenshots.
- A release is the owner's to approve each time.

## Releasing

`npm version <x.y.z>` bumps `manifest.json` and `versions.json`; tag the commit with the bare version; the release
workflow drafts a release with `main.js`, `manifest.json` and `styles.css`, which is published by hand once its
assets are checked against a local build.
