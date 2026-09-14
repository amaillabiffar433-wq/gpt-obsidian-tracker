# Contributing

## Development setup

This project requires Node.js 24 and runs on Windows.

```powershell
cd D:\Projects\GPT-Obsidian-Tracker
npm.cmd ci
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

## Change guidelines

- Keep collection local-first and do not add automatic prompts or page overlays.
- Do not commit API keys, browser profiles, SQLite databases, logs, generated `dist` files, backups, or real ChatGPT transcripts.
- Keep Obsidian writes scoped, recoverable, and covered by tests.
- Use focused conventional commit messages such as `feat(extension): ...` or `fix(writer): ...`.

## Pull requests

Describe the user-visible behavior, test commands and any remaining acceptance boundary. Synthetic browser tests do not replace real ChatGPT acceptance.
