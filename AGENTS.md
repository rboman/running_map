# AGENTS.md

## Project philosophy

This project is intentionally simple, static, and educational.

Do not modernize the architecture unless explicitly requested.

The project must remain:
- understandable;
- hackable;
- double-click runnable;
- dependency-light;
- easy to inspect manually.

The current architecture is a deliberate choice, not a temporary limitation.

---

## Hard constraints

Do NOT introduce:
- npm
- Vite
- React
- Vue
- Svelte
- TypeScript
- bundlers
- transpilers
- fetch() for local data
- ES modules
- server-side requirements
- local development server requirements

The site must continue to work by directly opening:

index.html

through:

file:///...

All paths must remain relative.

---

## Data loading philosophy

Data is intentionally loaded through classic script tags and global variables.

Examples:
- window.RUNS
- window.GENERATED_RUNS
- window.GENERATED_TRACKS
- window.RUNNING_MAP_CONFIG

Do not replace this with asynchronous loading unless explicitly requested.

---

## Python philosophy

Python scripts are standalone utilities.

Prefer:
- standard library
- readability
- deterministic outputs
- explicit CLI interfaces

Avoid unnecessary dependencies.

Current Python tooling:
- GPX parsing
- ADEPS folder import
- geometry simplification
- static JS generation

The Dropbox ADEPS folder is read-only input data.
Never modify or delete Dropbox source files automatically.

---

## Browser testing

The Browser plugin may be unavailable in some Codex sessions.

Do not pretend browser visual tests succeeded if browser execution tools are unavailable.

If browser execution is unavailable:
- perform static inspection;
- inspect modified files carefully;
- run syntax checks where possible;
- provide a manual browser test checklist.

Do not modify the project to work around missing browser tooling.

---

## UX philosophy

Map traces are:
- context when visible;
- focus when selected.

Selection is unique.

Sidebar filters:
- only filter navigation lists;
- do not implicitly hide map traces;
- do not implicitly clear selection.

Visibility and selection are separate concepts.

---

## Configuration philosophy

Configuration is static and script-based.

Use:
- config/site-config.js

Do not introduce:
- config.json loaded with fetch()
- runtime persistence
- backend configuration systems

Configuration must remain compatible with:
- file:///
- static hosting
- GitLab Pages

---

## Generated files

Files such as:
- generated-runs.js
- generated-tracks.js

are generated artifacts.

Do not edit them manually unless explicitly requested.

Prefer changing:
- source GPX files
- import scripts
- configuration
- templates

then regenerating outputs.

---

## Preferred workflow

When making changes:
1. inspect existing code;
2. propose a short plan;
3. identify risks;
4. implement incrementally;
5. keep diffs small and readable;
6. avoid unnecessary rewrites.

Prefer modifying existing code over introducing new abstractions.

---

## Performance philosophy

The project should remain lightweight.

Prefer:
- geometry simplification;
- static preprocessing;
- compact generated JS;

over:
- runtime complexity;
- dynamic loading systems;
- framework abstractions.

---

## Validation checklist

Before concluding work:
- no fetch() added;
- no modules added;
- no npm tooling added;
- index.html still works by double-click;
- no broken script ordering;
- no generated file corruption;
- no unnecessary architectural rewrite.

When possible:
- run syntax checks;
- inspect console-visible risks;
- provide manual testing steps.