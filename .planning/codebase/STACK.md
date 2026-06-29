# Technology Stack

**Analysis Date:** 2026-06-29

## Languages

**Primary:**

- TypeScript 6.0.3 - Entire extension source code in `src/`

## Runtime

**Environment:**

- Node.js 16+ (VS Code Extension Host)

**Package Manager:**

- npm
- Lockfile: `package-lock.json` (present)

## Frameworks

**Core:**

- VS Code Extension API (`vscode` module) - Singleton module provided by VS Code Extension Host
  - Tree views, WebView panels, commands, status bar items
  - Imported in `src/extension.ts`

**MCP (Model Context Protocol):**

- `@modelcontextprotocol/sdk` 1.29.0 - Provides MCP server capabilities for AI agent integration
  - `McpServer` class for tool registration
  - `StreamableHTTPServerTransport` for HTTP-based tool exposure
  - See `src/mcp/server.ts`

**Validation:**

- `zod` 4.4.3 - Schema validation for tool inputs
  - Used in `src/mcp/tools.ts` for input schema definitions

**Testing:**

- `@vscode/test-electron` 3.0.0 - Electron-based VS Code test runner
  - Runs extension in full VS Code environment
  - Config: `vscode-test.json`
  - Run with `npm run test`

**Unit Testing:**

- `mocha` 11.7.6 - Test runner for isolated unit tests
  - Run with `npm run test:unit`
  - Compiles tests to `out/` before execution

**Build/Dev:**

- `esbuild` 0.28.1 - JavaScript bundler for extension compilation
  - Config: `esbuild.js`
  - Bundles `src/extension.ts` → `dist/extension.js` (CommonJS)
  - Dev builds include sourcemaps; production builds minified
  - Run with `npm run compile` or `npm run watch:esbuild`

**Linting:**

- `eslint` 10.5.0 - Code linting
- `@typescript-eslint/parser` 8.62.0 - TypeScript parser for ESLint
- `@typescript-eslint/eslint-plugin` 8.62.0 - TypeScript-specific lint rules
  - Config: `eslint.config.mjs` (ESLint v10 flat config)
  - Run with `npm run lint`

**Type Checking:**

- TypeScript Compiler (`tsc`) 6.0.3 (built into `typescript` package)
  - Run with `npm run check-types`

## Key Dependencies

**Critical:**

- `@modelcontextprotocol/sdk` 1.29.0 - Enables AI agents to access kanban board state and mutations via MCP tools (feature gate: tries to start, logs warning if it fails)
- `vscode` (external, not bundled) - VS Code Extension API for panel/command registration

**Infrastructure:**

- `zod` 4.4.3 - Validates MCP tool inputs before execution

**Development Utilities:**

- `npm-run-all` 4.1.5 - Runs npm scripts in parallel (`watch:esbuild` and `watch:tsc` simultaneously)
- `typescript` 6.0.3 - TypeScript compiler and language support
- `@types/node` 26.0.1 - Type definitions for Node.js built-in modules
- `@types/vscode` 1.125.0 - Type definitions for VS Code Extension API
- `@types/mocha` 10.0.10 - Type definitions for mocha test runner

## Configuration

**Environment:**

- No environment variables required for basic operation
- Extension reads/writes to VS Code's `globalState` memento for persistent board storage (see `src/board/BoardStore.ts`)

**Build:**

- `esbuild.js` - Bundler configuration
  - Entry: `src/extension.ts`
  - Output: `dist/extension.js` (CommonJS format for Node.js)
  - Marks `vscode` module as external (not bundled)
  - Platform: `node`

**TypeScript:**

- `tsconfig.json`:
  - Module system: Node16
  - Target: ES2022
  - Lib: ES2022
  - Strict mode: Enabled
  - Root directory: `src/`

**Linting:**

- `eslint.config.mjs` - ESLint v10 flat config format
  - TypeScript parser: `@typescript-eslint/parser`
  - Rules: Naming conventions, strict equality, require curly braces, require semicolons

## Platform Requirements

**Development:**

- Node.js 16+
- npm 7+
- VS Code 1.103.0+

**Production:**

- VS Code 1.103.0+ (displayed in `package.json` `engines.vscode`)
- No external runtime dependencies beyond VS Code Extension Host and bundled npm packages

**Publishing:**

- VS Code Marketplace (via `vsce` CLI, run with `npm run vsce-package`)

---

_Stack analysis: 2026-06-29_
