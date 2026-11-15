# Agent instructions

## Architecture: keep the project simple

This static, educational architecture is intentional. Keep it understandable,
hackable, dependency-light and runnable by opening `index.html` directly via
`file:///`. Do not modernize it unless the user explicitly asks.

- Do not introduce npm, Vite, React, Vue, Svelte, TypeScript, bundlers,
  transpilers, ES modules, server-side code or a required development server.
- Do not use `fetch()` for local data or replace classic script loading with
  asynchronous loading. Keep local asset paths relative.
- Data uses `window.RUNS`, `window.GENERATED_TRACKS`, `window.GENERATED_RUNS` and
  `window.RUNNING_MAP_CONFIG`. Preserve script ordering in `index.html`.
- Site configuration belongs in `config/site-config.js`. No fetched JSON,
  browser persistence or backend configuration system. Python's local cache
  and manifest are offline generation utilities, not browser configuration.
- Prefer geometry simplification and static preprocessing over runtime complexity.
  Preserve compatibility with direct file opening and static hosting.

## Sources, generated data and photos

- Dropbox is read-only source data. Never modify, rename or delete its files
  automatically. Do not change source GPX files or photos as a side effect of a fix.
- Do not hand-edit `data/generated-runs.js` or `tracks/generated-tracks.js`
  unless explicitly requested. Change the importer, configuration or authorized
  source data, then regenerate when the task requires it.
- Generated photos are identified by their JPEG content hash, never by their
  position in a list. Keep image identity independent of gallery ordering.
- GPS and captions belong to the corresponding source photo. A photo without
  GPS must not acquire a map marker from another photo.
- Cache reuse must verify the outputs. Preserve no-write `--dry-run` behavior
  and atomic replacement of generated files, cache and manifest.
- Keep `config/local.ini`, `.venv/`, `.cache/`, `.tools/`, `backups/` and generated
  photos out of Git. Do not commit credentials or machine-specific paths.

## Publication invariants

- In `file:///`, generated photo URLs stay local. On HTTP/HTTPS, use
  `PHOTO_BASE_URL`. Do not silently fall back to remote images for missing local files.
- Use `scripts/manage_photos.py` for generated photo publication. It prefers
  the project-local rclone installed by `scripts/install_rclone.py`.
- Copy and verify images before publishing the generated JavaScript that
  references them. Copy must not delete remote objects.
- Do not bypass manifest validation or the full downloaded-content verification.
  Publication requires a complete import with photos, not `--year` output.
- Cleanup is separate: verify the published site, inventory only obsolete
  objects under `photos/generated/`, back them up, verify the backup, then
  delete only the explicit inventory. Preserve recovery information.
- Do not run imports, installations, uploads or cleanup merely to validate
  documentation. Keep network and publication operations within the requested scope.

## User interface

Traces provide context when visible and focus when selected. Selection is unique.
Sidebar filters affect navigation lists only: they must not implicitly hide map
traces or clear the selection. Visibility and selection are separate states.

## Python and changes

Use standalone scripts with explicit CLI interfaces, deterministic output and
readable code. Prefer the standard library; Pillow is the photo dependency.
Do not add unnecessary dependencies or abstractions.

Inspect the existing code, state a short plan and concrete risks, then make small,
incremental changes. Prefer extending existing code over rewrites. For fixes to
photo identity or publication safety, add regression tests using temporary fixtures
and mocked remote calls; tests must not modify Dropbox or real R2 objects.

## Documentation

- `README.md`: short operational guide for setup, local updates and publication.
- `docs/maintenance.md`: R2 setup, troubleshooting, cleanup and recovery.
- `docs/developpement.md`: configuration, architecture, CLI details and development.
- `README_HUMANS.md`: human-owned notes. Read but **never modify**; report stale
  instructions to the user instead. The README is the maintained user procedure.

Keep commands aligned with the actual CLI and defaults. Avoid duplicating large
configuration blocks, hard-coded dataset counts, migration reports or development
history in the README. Preserve rationale only when it prevents future mistakes.

## Validation

- Check relevant syntax and run `python -m unittest discover -s tests -v` for
  Python behavior changes. Documentation-only edits need link and command checks,
  not data regeneration or remote operations.
- Verify no local-data `fetch()`, modules, npm tooling or server requirement was
  introduced, and that script order and generated data remain valid.
- For UI changes, test the map, filters, unique selection, photo markers and
  galleries, including photos without GPS, and inspect browser errors.
- Never claim visual tests passed if browser execution was unavailable or blocked.
  Use static inspection and syntax checks, explain the limitation, and provide
  a short manual checklist. Do not change the project to bypass browser restrictions.
