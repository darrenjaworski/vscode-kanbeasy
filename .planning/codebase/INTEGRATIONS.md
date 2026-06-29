# External Integrations

**Analysis Date:** 2026-06-29

## APIs & External Services

**Embedded Web Application:**

- Kanbeasy Web App - Kanban board UI displayed in VS Code WebView
  - URL: `https://darrenjaworski.github.io/kanbeasy/?host=vscode`
  - Loaded in `<iframe>` by `src/webview/content.ts`
  - Query parameter `host=vscode` signals to web app that it's running embedded in VS Code
  - Communication: PostMessage bridge between VS Code extension and iframe (see `src/webview/bridge.ts`)

## Data Storage

**Persistent State:**

- VS Code Global Memento Storage (built-in to VS Code)
  - Implementation: `src/board/BoardStore.ts`
  - Stores board state (columns, cards, archive) and key-value pairs
  - Keys: `kanbeasy.board` and `kanbeasy.kv`
  - Scope: Global (per VS Code user, survives extension reload)
  - No external database required; persists locally in VS Code workspace storage

**In-Memory State:**

- No caching service; all data flows through `BoardStore` in memory
- Listeners notify consumers when board changes (observer pattern in `BoardStore.onDidChangeBoard()`)

## Authentication & Identity

**Auth Provider:**

- None - Extension runs as VS Code process with no user authentication
- VS Code handles all user identity and security

## Monitoring & Observability

**Error Tracking:**

- Console logging only
- MCP server startup failures log warnings to console (see `src/extension.ts` line 82)

**Logs:**

- `console.warn()` for MCP server startup failures
- `console.log()` for esbuild watch mode feedback

## CI/CD & Deployment

**Hosting:**

- VS Code Marketplace (primary distribution)
- GitHub releases (direct .vsix downloads)

**CI Pipeline:**

- GitHub Actions (configured in `.github/workflows/`, not examined in detail)
- Pre-publish check: `npm run vsce-package` (see `package.json` `vscode:prepublish` script)

**Build Process:**

- Type check + lint + esbuild compile via `npm run compile`
- Production minification via `npm run package`
- .vsix packaging via `npm run vsce-package`

## Environment Configuration

**Required env vars:**

- None - Extension works out of the box

**Optional configuration:**

- VS Code built-in settings (e.g., theme, sidebar visibility)
- No extension-specific configuration currently exposed

**Secrets location:**

- No secrets used; no `.env` files needed

## Webhooks & Callbacks

**Incoming:**

- VS Code Command Palette commands: `kanbeasy.toggleBoard`, `kanbeasy.openBoard`
- Activity bar / sidebar click events (custom tree view)
- Status bar click events

**Outgoing:**

- PostMessage events to/from embedded Kanbeasy web app iframe
- PostMessage data structure: `{ source: 'kanbeasy', ... }` (see `src/webview/bridge.ts`)

## MCP Integration

**MCP Server:**

- Runs as in-process HTTP server on localhost (see `src/mcp/server.ts`)
- Stateless request-per-server model using `StreamableHTTPServerTransport`
- Binds to ephemeral port on `127.0.0.1`
- Registered with VS Code via `mcpServerDefinitionProviders` (in `package.json`)

**MCP Tools:**

- Defined in `src/mcp/tools.ts` with Zod schemas
- Tools provide read/write access to board state, cards, and columns
- Example tools: `addCard`, `moveCard`, `updateCard`, `archiveCard`, `getBoard`, etc.
- Input validation: All tool inputs validated against Zod schemas before execution

**MCP Availability:**

- Failure is non-fatal; board UI operates independently
- MCP server startup failures caught and logged (see `src/extension.ts` activate function)

---

_Integration audit: 2026-06-29_
