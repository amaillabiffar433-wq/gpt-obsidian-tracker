# Changelog

All notable changes to GPT Obsidian Tracker are documented here.

## 0.1.0 - 2026-09-14

### Features

- Added a local-first Chrome/Edge extension for observing ChatGPT learning sessions.
- Added a localhost Collector that records messages and activity evidence in SQLite.
- Added session detection, effective-time accounting, recoverable Obsidian synchronization, and daily statistics.
- Added an optional OpenAI-compatible summary engine, disabled by default.
- Added a read-only MCP server with eight local query tools.

### Verification

- Vitest: 81/81 passed.
- TypeScript strict checking, ESLint, build, MCP protocol smoke tests, and isolated browser E2E passed.

### Known limitations

- Real-person ChatGPT acceptance is still pending.
- Cloud summarization has not been enabled or verified with a real provider.
