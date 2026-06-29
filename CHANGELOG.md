# Change Log

All notable changes to the "kanbeasy" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

### Fixed

- Paste, copy, cut, and right-click now work in the board's text fields (issue #20). The webview's `<iframe>` now sets `allow="clipboard-read; clipboard-write"`, delegating clipboard permissions to the cross-origin app frame so the web app's clipboard fallback (which works around VS Code dropping native clipboard shortcuts/context menu in nested iframes) can read and write the clipboard.

### Changed

- Upgraded ESLint 9 → 10 (v9.x reaches EOL 2026-08-06); bumped `@typescript-eslint` to 8.62.0 for ESLint 10 peer-dep support.
- Upgraded TypeScript 5 → 6; added explicit `types: ["node", "mocha"]` to `tsconfig.json` (required by TS6's stricter automatic type-inclusion rules).
- Upgraded `@types/node` 22.x → 26.x, `@types/vscode` → 1.125.0, `esbuild` → 0.28.1, `@vscode/test-cli` → 0.0.15, `@vscode/test-electron` → 3.0.0.

## [1.3.1] - 2026-06-22

### Fixed

- Prevent board data wipe when upgrading from v1.2.x to v1.3.0 (issue #3). v1.3.0 moved storage from the web app's IndexedDB to VS Code `globalState` with no migration path. On first open after upgrade the extension now sends `isFirstRun: true` in the `host:init` message; the web app detects this, reads any existing IndexedDB data, and sends it back so the extension can persist it in `globalState`.

## [1.3.0] - 2026-06-18

### Added

- MCP server for GitHub Copilot. The extension now runs an in-process MCP server so Copilot can read and edit your board (cards and columns) whether or not the board panel is open. The extension owns board state (persisted in `globalState`); deleting a card archives it so it can be recovered; an open board updates live in response to Copilot's edits.

### Changed

- Exclude internal `docs/` planning and spec files from the published `.vsix` package.

## [1.2.3] - 2026-05-05

### Changed

- Sync `package-lock.json` with the published version. No runtime changes.

## [1.2.2] - 2026-04-22

### Changed

- Exclude `CLAUDE.md` from the published `.vsix` package
- Remove unsupported Visual Studio Marketplace badges from README

## [1.2.1] - 2026-04-19

### Security

- Resolved 7 transitive dev-dependency advisories via `npm audit fix` (ajv, brace-expansion, flatted, glob, js-yaml, minimatch, picomatch chains). No runtime changes.

## [1.2.0] - 2026-02-26

### Changed

- Status bar item now displays "Kanbeasy" text label instead of layout icon
- Added commit and release checklists to CLAUDE.md

## [1.1.2] - 2026-02-26

### Changed

- Updated README with comprehensive installation instructions, feature descriptions, and documentation improvements

## [1.1.1] - 2026-02-26

### Changed

- New extension icon with purple kanban column design
- Updated activity bar sidebar icon to white monochrome kanban columns for better theme compatibility

## [1.1.0] - 2026-02-12

### Added

- Activity bar sidebar icon for quick access to Kanbeasy
- Custom layout-style SVG icon matching VS Code's design language
- Toggle functionality - open/close kanban board with single click
- Sidebar automatically closes when kanban board opens for better workspace
- Welcome view in sidebar with "Open Kanban Board" button
- CLAUDE.md with project guidance and development conventions

### Changed

- Kanban board now opens in main editor area instead of separate panel
- Status bar icon updated to layout codicon for visual consistency
- Improved toggle behavior - close board if already open

### Maintained

- Backwards compatibility with existing `openBoard` command
- All existing functionality preserved

## [1.0.2]

- update docs

## [1.0.1]

- update docs

## [1.0.0]

- wrapper for kanbeasy
- status bar icon
- command to open kanbeasy
