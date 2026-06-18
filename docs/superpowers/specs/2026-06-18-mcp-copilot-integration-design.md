# MCP for Copilot Integration — Design

**Date:** 2026-06-18
**Issue:** [#2 — feat: mcp for copilot integration](https://github.com/darrenjaworski/vscode-kanbeasy/issues/2)
**Status:** Approved design, pre-implementation
**Repos affected:** `vscode-kanbeasy` (this spec) and `kanbeasy` web app ([companion spec](../../../../kanbeasy/docs/superpowers/specs/2026-06-18-vscode-host-mode-integration.md))

## Summary

Add a Model Context Protocol (MCP) server to the Kanbeasy VS Code extension so GitHub
Copilot (and any MCP client in VS Code agent mode) can read and edit the kanban board —
its columns and cards — whether or not the board panel is open.

The defining constraint: today the extension is a dumb wrapper around an external web app
(`https://darrenjaworski.github.io/kanbeasy/`) loaded in a cross-origin iframe. All board
data lives in that origin's IndexedDB, unreachable from the extension host. This design
moves the **source of truth into the extension host** so an MCP server can serve it
directly, and refactors the web app into a _view_ over that store.

## Goals

- Copilot can retrieve board data and make edits (cards + columns) via MCP tools.
- Works whether the board panel is open, closed, or never opened this session.
- When the board _is_ open, MCP edits appear live in the UI.
- Destructive defaults are recoverable (delete = archive).
- Web app continues to work standalone on github.io (IndexedDB unchanged there).

## Non-goals (YAGNI)

- Multi-board or per-workspace boards. One global board only (door left open, not built).
- Exposing app settings/theme/feature-flags as MCP tools. Board + cards only.
- Nuclear operations via MCP: `resetBoard`, `clearArchive`, permanent card deletion stay human-only.
- MCP edits participating in the web app's undo/redo stack.

## Key decisions (and why)

| Decision           | Choice                                                 | Rationale                                                                                                                                                                                 |
| ------------------ | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source of truth    | **Extension host** (`globalState`)                     | Only way MCP works with the board closed; iframe IndexedDB is unreachable from the extension host.                                                                                        |
| MCP transport      | **In-process HTTP** server (`McpHttpServerDefinition`) | A stdio child process cannot read VS Code's `globalState` (it's a Memento, not a file). In-process handlers call the store and webview directly — one process, no IPC, no file-sync race. |
| Board scope        | **One global board** in `globalState`                  | Matches today's single-board behavior; simplest tool signatures (no `boardId`).                                                                                                           |
| Write scope        | Full CRUD on **cards and columns**                     | Capable without nuclear ops.                                                                                                                                                              |
| "Delete" semantics | **Archive** (recoverable)                              | An agent's mistaken delete must be undoable. `remove_column` archives its cards first.                                                                                                    |
| Card references    | By human-facing **`number`**                           | Copilot can act on "card 42" naturally; resolved to opaque `id` internally.                                                                                                               |

## Architecture

```
Copilot agent ──HTTP/MCP──▶ [ MCP server  (in-process, extension host) ]
                                      │ direct calls (same process)
                                      ▼
                            [ BoardStore  ⇄  globalState ]   ← SOURCE OF TRUTH
                                      │ postMessage (only while panel open)
                                      ▼
                  [ webview iframe: kanbeasy web app in "host mode" ]
```

The extension activates on `onStartupFinished`, so `BoardStore` and the MCP server are live
from VS Code startup — independent of the panel. The webview is a view layered on top.

### Components (this repo)

`src/extension.ts` is currently ~100 lines doing everything. This feature warrants splitting
into focused modules under `src/`:

1. **`board/BoardStore.ts`** — the source of truth.
   - Wraps `context.globalState`, key `kanbeasy.board`, value `BoardState` (`{ columns, archive }`).
   - Persists the card-number counter (`kanbeasy.nextCardNumber`), mirroring the web app's
     `STORAGE_KEYS.NEXT_CARD_NUMBER` reconciliation.
   - Owns all mutation logic, mirroring the web app's `useBoardMutations` semantics:
     `createdAt`/`updatedAt` stamping, `columnHistory` append on move, number auto-increment.
   - Emits `onDidChangeBoard` after every successful write.
   - Shares the `BoardState`/`Card`/`Column` types with the web app via a copied/synced
     `types.ts` (the two repos version together — see "Contract & versioning").

2. **`webview/bridge.ts`** — webview ⇄ store sync, active only while the panel exists.
   - On webview `ready` handshake → push full state (`{ board, nextCardNumber, kv }`) (hydrate).
   - On webview-originated mutation message → apply to `BoardStore`.
   - On `BoardStore.onDidChangeBoard` → push fresh full state to the webview (live update).
   - Guards against echo loops (tag the origin of each change).

3. **`mcp/server.ts`** — the in-process MCP server.
   - Uses the MCP TypeScript SDK with the Streamable-HTTP transport, bound to
     `127.0.0.1:<ephemeral port>` (port 0, read the assigned port back).
   - Tool handlers call `BoardStore` directly. Started on activation, disposed on deactivate.

4. **`mcp/provider.ts`** — registers the server with VS Code.
   - `contributes.mcpServerDefinitionProviders` in `package.json` (id `kanbeasy.mcp`, label
     "Kanbeasy Board").
   - `vscode.lm.registerMcpServerDefinitionProvider("kanbeasy.mcp", provider)` returning an
     `McpHttpServerDefinition` with the bound URI. Fires `onDidChangeMcpServerDefinitions`
     once the server is listening.

5. **`extension.ts`** — thin wiring: instantiate store, start MCP server, register provider,
   register the existing toggle/open commands and status bar, wire the bridge when the panel opens.

### The webview HTML change

`getWebviewContent()` must load the web app in **host mode** and relay messages. The iframe
`src` gains a host flag (e.g. `?host=vscode`), and the webview HTML adds a small relay script
that forwards `window.postMessage` between the iframe and the VS Code `acquireVsCodeApi()`
channel (the extension cannot talk to the cross-origin iframe directly; the webview's own
script can, via `iframe.contentWindow.postMessage`). The bridge protocol is defined in the
companion web-app spec.

## Data flow

**Board closed (panel never opened):**

```
Copilot → MCP tool → BoardStore.read/write(globalState) → persisted → result to Copilot
```

No webview involved. On next open, the web app hydrates from the extension and shows the change.

**Board open:**

```
Copilot → MCP tool → BoardStore.write → onDidChangeBoard → bridge pushes state → webview re-renders
User drags card → webview posts mutation → bridge → BoardStore.write (origin=webview, no echo)
```

## MCP tool surface

All tools annotated with MCP hints (`readOnlyHint`, `destructiveHint`, `idempotentHint`).
Cards referenced by `number` (resolved to `id`); columns by `id` or exact `title`.

### Reads (`readOnlyHint: true`)

- `get_board` — full board summary: columns with id/title/card counts, archive count.
- `list_columns` — columns with ids, titles, order, card counts.
- `list_cards` — args: optional `columnId`/`columnTitle`, `cardTypeId`. Returns card summaries.
- `get_card` — arg: `number`. Full card detail.
- `search_cards` — arg: `query`. Title/description match (mirrors the app's Fuse.js search intent).

### Card writes

- `add_card` — `{ column, title, description?, cardTypeId?, dueDate? }` → returns new card `number`.
- `update_card` — `{ number, title?, description?, cardTypeId?, dueDate? }`.
- `move_card` — `{ number, toColumn, position? }`. Appends `columnHistory`.
- `archive_card` — `{ number }`. **This is "delete."** Recoverable.
- `restore_card` — `{ number, toColumn? }`. Restores from archive.

### Column writes

- `add_column` — `{ title, position? }` → returns column id.
- `rename_column` — `{ column, title }`.
- `remove_column` — `{ column }`. **Archives the column's cards first, then removes the column** (recoverable). `destructiveHint: true`.

### Excluded (human-only)

`reset_board`, `clear_archive`, permanent card deletion. Not exposed as tools.

> Note: VS Code agent mode prompts the user to confirm each tool invocation by default, so
> there is a human gate on every write regardless of these defaults.

## Contract & versioning

The two repos share the `BoardState`/`Card`/`Column`/`ArchivedCard` types and the bridge
message protocol. They must version together.

- The bridge protocol carries a `protocolVersion`. On handshake, if the web app's protocol
  version is newer/older than the extension's, the extension falls back to a read-only banner
  rather than corrupting data (detail in companion spec).
- Source-of-truth for shared types lives in the web app (`src/board/types.ts`); the extension
  keeps a synced copy. A follow-up could extract a shared package, but YAGNI for now.

## Edge cases

- **Concurrent edits** (board open + Copilot writing): single source of truth + full-state
  push; last writer wins at board granularity. The full-state push (not a diff) keeps the
  webview consistent.
- **Two VS Code windows**: both share the one global board in `globalState`; both MCP servers
  write the same store. Live-push keeps open boards consistent. This is inherent to "one global
  board" and is accepted.
- **Undo/redo**: the web app's undo stack is local and will not contain MCP edits. Accepted.
- **Card numbering**: `add_card` uses the persisted counter so numbers stay consistent with the UI.
- **Web app standalone**: when not in host mode, the web app uses IndexedDB exactly as today.

## Testing

- **BoardStore** unit tests: every mutation, number increment, archive/restore, `remove_column`
  archives-then-removes, `columnHistory` correctness.
- **MCP tools**: integration tests invoking each tool against an in-memory `BoardStore`,
  asserting state transitions and reference resolution (number→id, title→column).
- **Bridge**: round-trip hydrate + mutation echo-loop guard.
- **Manual/E2E**: open board, drive an edit through Copilot agent mode, confirm live update;
  close board, edit via MCP, reopen, confirm persistence.

## Rollout

1. Land the web-app host-mode storage backend + bridge protocol (companion spec) behind the
   `?host=vscode` flag — no-op for github.io users.
2. Land the extension: `BoardStore`, bridge, MCP server/provider, module split.
3. Version-bump both together; the extension pins the web app build it expects.
4. Minor version bump (new feature) for the extension per semver.
