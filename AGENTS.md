# AGENTS.md

This project is intentionally simple.

For V1:
- Do not add npm.
- Do not add Vite, React, Vue, Svelte, TypeScript, or a bundler.
- Do not use `fetch()`.
- Do not use ES modules.
- Do not require a local server.
- Keep the site compatible with opening `index.html` directly from `file://`.

Data is loaded through classic `<script>` tags and global `window.*` variables.

Prefer simple, readable JavaScript over abstractions.