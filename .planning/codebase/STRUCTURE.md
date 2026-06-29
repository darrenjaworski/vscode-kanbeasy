# Codebase Structure

**Analysis Date:** 2026-06-29

## Directory Layout

```
vscode-kanbeasy/
├── src/                           # TypeScript source code
│   ├── extension.ts               # Main entry point: activate/deactivate
│   ├── board/                     # State management layer
│   │   ├── BoardStore.ts          # Central state store with mutations
│   │   ├── types.ts               # Type definitions (Card, Column, BoardState)
│   │   └── constants.ts           # Shared constants (keys, protocol version)
│   ├── webview/                   # WebView bridge and HTML
│   │   ├── bridge.ts              # Message routing and state sync
│   │   └── content.ts             # HTML template with iframe relay
│   ├── mcp/                       # MCP server and tools
│   │   ├── server.ts              # HTTP server implementation
│   │   ├── provider.ts            # VS Code MCP registration
│   │   └── tools.ts               # Tool definitions and handlers
│   └── test/                      # Test suites
│       ├── unit/                  # Unit tests
│       │   ├── BoardStore.test.ts
│       │   ├── bridge.test.ts
│       │   ├── content.test.ts
│       │   ├── contract.test.ts
│       │   └── tools.test.ts
│       └── integration/           # Integration tests
│           ├── extension.test.ts
│           └── mcp.test.ts
├── dist/                          # Compiled output (esbuild)
│   └── extension.js               # Bundled extension (CommonJS)
├── out/                           # TypeScript output (tsc)
│   ├── extension.js
│   ├── board/
│   ├── webview/
│   ├── mcp/
│   └── test/
├── resources/                     # Extension resources
│   └── kanbeasy-icon.svg          # Activity bar icon
├── .vscode/                       # VS Code workspace config
│   └── launch.json                # Debug configuration
├── package.json                   # NPM scripts, dependencies, extension manifest
├── tsconfig.json                  # TypeScript compiler options
├── eslint.config.mjs              # ESLint rules
├── esbuild.js                     # Build configuration
├── CLAUDE.md                      # Project instructions for Claude
├── CHANGELOG.md                   # Release notes and version history
├── README.md                      # Project readme
└── LICENSE                        # MIT license
```

## Directory Purposes

**src/:**

- Purpose: All TypeScript source code organized by feature/concern
- Contains: Extension host, state management, UI bridge, MCP server, tests
- Key files: `extension.ts` is the single entry point

**src/board/:**

- Purpose: Centralized state management for the kanban board
- Contains: BoardStore class, type definitions, shared constants
- Key files: `BoardStore.ts` (mutation methods and listeners), `types.ts` (TypeScript types)

**src/webview/:**

- Purpose: WebView panel integration and cross-process message routing
- Contains: Bridge implementation, HTML template
- Key files: `bridge.ts` (message handlers), `content.ts` (HTML with iframe relay)

**src/mcp/:**

- Purpose: Model Context Protocol integration for Copilot
- Contains: HTTP server, VS Code registration, tool definitions
- Key files: `server.ts` (HTTP handler), `tools.ts` (12 tool definitions)

**src/test/:**

- Purpose: Test suites organized by type
- Contains: Unit tests (individual components) and integration tests (extension + MCP)
- Key files: `unit/BoardStore.test.ts`, `integration/extension.test.ts`

**dist/:**

- Purpose: Production build output (esbuild bundled)
- Contains: `extension.js` - single minified file loaded by VS Code
- Generated: `npm run package` or `npm run vsce-package`
- Committed: No (in .gitignore)

**out/:**

- Purpose: TypeScript compilation output (tsc)
- Contains: JavaScript and source maps before bundling
- Generated: `tsc` during build
- Committed: No (in .gitignore)

**resources/:**

- Purpose: Static assets for the extension
- Contains: `kanbeasy-icon.svg` referenced in package.json for activity bar

**.vscode/:**

- Purpose: VS Code workspace configuration
- Contains: Debug launch configuration for testing the extension

## Key File Locations

**Entry Points:**

- `src/extension.ts`: Main extension file with activate/deactivate exports
- `dist/extension.js`: Bundled output referenced as "main" in package.json

**Configuration:**

- `package.json`: Extension metadata, scripts, dependencies, VS Code contribution points
- `tsconfig.json`: TypeScript compiler options (target ES2022, strict mode, node types)
- `eslint.config.mjs`: Linting rules (TypeScript-specific, curly braces, ===, semicolons)
- `esbuild.js`: Build configuration (bundles src/extension.ts → dist/extension.js)

**Core Logic:**

- `src/board/BoardStore.ts`: State mutations and persistence (338 lines, 11 methods)
- `src/extension.ts`: Extension lifecycle and UI registration (92 lines)
- `src/mcp/server.ts`: HTTP MCP server (91 lines)
- `src/mcp/tools.ts`: 12 tool definitions for Copilot (301 lines)

**WebView Communication:**

- `src/webview/bridge.ts`: Message routing between iframe and VS Code (98 lines)
- `src/webview/content.ts`: HTML template with relay script (37 lines)

**Testing:**

- `src/test/unit/`: Unit tests for BoardStore, bridge, content, contract, tools
- `src/test/integration/`: Extension activation test, MCP server test
- `npm run test`: Runs all tests via vscode-test

## Naming Conventions

**Files:**

- Extension source: `*.ts`
- Test files: `*.test.ts` (co-located with source, `src/test/` subdirs)
- Build output: `*.js` (in `dist/` and `out/`)
- Config: `*.json` (package.json, tsconfig.json) or `*.mjs` (ESLint)

**Directories:**

- Feature layers: kebab-case (`src/board/`, `src/webview/`, `src/mcp/`)
- Test organization: `src/test/unit/`, `src/test/integration/`
- Build outputs: `dist/`, `out/`

**Functions & Classes:**

- Classes: PascalCase (`BoardStore`, `KanbeasyTreeDataProvider`)
- Functions: camelCase (`activate`, `reduceWebviewMessage`, `attachBridge`)
- Constants: UPPER_SNAKE_CASE (`MESSAGE_SOURCE`, `GLOBAL_BOARD_KEY`)
- Type names: PascalCase (`BoardState`, `Card`, `Column`)

**Variables:**

- camelCase for all variables (`kanbanPanel`, `store`, `mcp`)
- Prefix `_` for discarded destructured fields (`{ archivedAt: _a, ... }` at `src/board/BoardStore.ts:221`)

## Where to Add New Code

**New Feature:**

- Primary code: `src/board/BoardStore.ts` (add mutation method) or new feature module
- Tests: `src/test/unit/` for component tests, `src/test/integration/` for end-to-end
- Types: Define in `src/board/types.ts` or feature module if domain-specific

**New MCP Tool:**

- Implementation: Add `ToolDef` to `src/mcp/tools.ts:57-300`
- Input validation: Use zod schema in `inputSchema` field
- Handler: Follow pattern at `src/mcp/tools.ts:163-183` (guard, call store method, format result)
- Tests: Add test case to `src/test/unit/tools.test.ts`

**New WebView Feature:**

- HTML/iframe communication: Update `src/webview/content.ts`
- Message handling: Add case to switch statement in `src/webview/bridge.ts:41-59`
- BoardStore integration: Add method to `src/board/BoardStore.ts`

**UI Enhancement:**

- Command registration: `src/extension.ts:29-64`
- Status bar item: `src/extension.ts:66-74`
- Activity bar tree view: Modify `KanbeasyTreeDataProvider` at `src/extension.ts:8-15`

**Utility/Helper:**

- Shared board utilities: `src/board/BoardStore.ts` (private methods at lines 281-336)
- MCP tool utilities: `src/mcp/tools.ts` (columnRef, summarizeCard, guard functions)
- Bridge utilities: `src/webview/bridge.ts` (wrap, boardChangedMessage functions)

## Special Directories

**node_modules/:**

- Purpose: NPM dependencies (300+ packages)
- Generated: `npm install`
- Committed: No (in .gitignore)
- Note: Exclude from searches with `--exclude-dir=node_modules` or specific path globs

**.planning/codebase/:**

- Purpose: Generated codebase analysis documents (this file)
- Generated: `/gsd-map-codebase` skill
- Committed: Yes (in git)
- Contents: ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, TESTING.md, CONCERNS.md

**.vscode-test/:**

- Purpose: Downloaded VS Code versions for testing
- Generated: vscode-test automation (part of test suite)
- Committed: No (in .gitignore)

**.claude/:**

- Purpose: Claude Code project settings and context
- Contains: skills/, settings.json, project-level configuration
- Committed: Yes (in git)

**docs/ and .superpowers/:**

- Purpose: Documentation and superpowers (planning system)
- Committed: Yes (in git)

---

_Structure analysis: 2026-06-29_
