<!-- refreshed: 2026-06-29 -->

# Architecture

**Analysis Date:** 2026-06-29

## System Overview

```text
┌──────────────────────────────────────────────────────────────────────┐
│                         VS Code Extension Host                        │
│                       `src/extension.ts`                              │
├──────────┬─────────────────┬──────────────────┬──────────────────────┤
│  Activity│   Status Bar    │    WebView       │   MCP Server         │
│  Bar     │   Item          │    Panel         │   Registry           │
│ TreeView │ `extension.ts`  │ `extension.ts`   │ `mcp/provider.ts`    │
└────┬─────┴────────┬────────┴────────┬─────────┴──────────────┬───────┘
     │              │                 │                        │
     ▼              ▼                 ▼                        ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      Application Layer                                │
│  Commands: kanbeasy.toggleBoard, kanbeasy.openBoard                  │
│  WebView Bridge: `webview/bridge.ts`                                 │
│  WebView Content: `webview/content.ts`                               │
│  MCP Server: `mcp/server.ts`, `mcp/tools.ts`                         │
└──────────────────┬───────────────────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    Data Layer: BoardStore                             │
│                  `src/board/BoardStore.ts`                            │
│  State: Columns, Cards, Archive                                      │
│  Mutations: addCard, moveCard, updateCard, archiveCard, etc.         │
│  Listeners: onDidChangeBoard                                         │
│  Persistence: VS Code globalState (memento)                          │
└──────────────────┬───────────────────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                  External Integration Points                          │
│  Webview Iframe: https://darrenjaworski.github.io/kanbeasy/          │
│  VS Code API: ExtensionContext, Webview, Commands                    │
│  MCP SDK: @modelcontextprotocol/sdk                                  │
└──────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component              | Responsibility                                                       | File                      |
| ---------------------- | -------------------------------------------------------------------- | ------------------------- |
| Extension Host         | Entry point, UI registration, lifecycle management, command handling | `src/extension.ts`        |
| Activity Bar Tree View | Empty tree view provider for sidebar UI                              | `src/extension.ts`        |
| Status Bar Item        | "Kanbeasy" button in status bar to toggle board                      | `src/extension.ts`        |
| BoardStore             | Central state management, mutations, persistence, change events      | `src/board/BoardStore.ts` |
| WebView Bridge         | Message relay between WebView iframe and VS Code API                 | `src/webview/bridge.ts`   |
| WebView Content        | HTML template with iframe relay script                               | `src/webview/content.ts`  |
| MCP Server             | HTTP server providing tools for Copilot integration                  | `src/mcp/server.ts`       |
| MCP Provider           | Registers MCP server with VS Code LM API                             | `src/mcp/provider.ts`     |
| MCP Tools              | Individual tool handlers (read/write board data)                     | `src/mcp/tools.ts`        |

## Pattern Overview

**Overall:** Layered architecture with event-driven state management and bridge-based cross-process communication

**Key Characteristics:**

- Separation of concerns: UI layer, application layer, data layer, integration layer
- Event-driven state mutations: BoardStore emits change events to WebView bridge
- Unidirectional message flow: WebView -> bridge -> store; store change -> bridge -> WebView
- No circular dependencies: Each layer depends only on layers below
- Graceful degradation: MCP server failure does not block board UI
- Type-safe with TypeScript strict mode enabled

## Layers

**Extension Host:**

- Purpose: VS Code integration entry point, UI registration, command routing
- Location: `src/extension.ts`
- Contains: activate/deactivate functions, UI setup, command handlers
- Depends on: vscode API, BoardStore, WebView bridge, MCP server
- Used by: VS Code runtime

**Board State Management:**

- Purpose: Centralized data store with mutation methods and change events
- Location: `src/board/` (BoardStore.ts, types.ts, constants.ts)
- Contains: BoardState types, card/column mutations, persistence layer
- Depends on: node:crypto (UUID generation), VS Code globalState memento
- Used by: Extension host, WebView bridge, MCP tools

**WebView Bridge:**

- Purpose: Cross-process message routing between iframe and VS Code API
- Location: `src/webview/` (bridge.ts, content.ts)
- Contains: Message handlers, state sync, HTML template
- Depends on: BoardStore, vscode Webview API
- Used by: Extension host

**MCP Integration:**

- Purpose: Copilot integration via Model Context Protocol
- Location: `src/mcp/` (server.ts, provider.ts, tools.ts)
- Contains: HTTP server, tool definitions, VS Code LM API registration
- Depends on: @modelcontextprotocol/sdk, node:http, BoardStore, zod
- Used by: VS Code Copilot (external), extension host

## Data Flow

### Primary Request Path: Board Toggle

1. User clicks "Kanbeasy" in status bar (`src/extension.ts:72`)
2. Trigger `kanbeasy.toggleBoard` command (`src/extension.ts:29-54`)
3. If no panel exists:
   - Create WebviewPanel (`src/extension.ts:36`)
   - Load HTML with iframe relay (`src/webview/content.ts:9`)
   - Attach bridge (`src/extension.ts:43`)
4. If panel exists: dispose and close

### Secondary Flow: WebView Message Processing

1. Iframe sends message to relay script (`src/webview/content.ts:23-31`)
2. Relay script posts to VS Code API via `acquireVsCodeApi()`
3. Bridge receives message handler fires (`src/webview/bridge.ts:74`)
4. `reduceWebviewMessage()` processes message type (`src/webview/bridge.ts:33-59`)
5. BoardStore method called (e.g., `saveBoard()` at `src/board/BoardStore.ts:82`)
6. Store emits change event (`src/board/BoardStore.ts:332-336`)
7. Bridge posts `host:boardChanged` back to iframe (`src/webview/bridge.ts:85-89`)

### Tertiary Flow: MCP Tool Invocation

1. Copilot calls MCP tool via HTTP POST (`src/mcp/server.ts:56-71`)
2. Build fresh MCP server per request (`src/mcp/server.ts:21-35`)
3. Register all tools from `src/mcp/tools.ts`
4. Tool handler receives BoardStore and arguments
5. Handler calls store method (e.g., `store.addCard()`)
6. Return formatted result back to Copilot

**State Management:**

- Single source of truth: BoardStore in extension process memory
- Persistence: VS Code globalState memento (survives extension deactivation)
- First-run detection: `isFirstRun` flag in BoardStore (`src/board/BoardStore.ts:51`)
- Change notifications: Listener pattern with disposable subscriptions

## Key Abstractions

**BoardStore:**

- Purpose: Encapsulates all state mutations and persistence logic
- Examples: `src/board/BoardStore.ts`
- Pattern: Observer pattern (listeners), memento pattern (persistence)

**BridgeMessage:**

- Purpose: Standardized message format for webview communication
- Examples: `src/webview/bridge.ts:6-19`
- Pattern: Message wrapper with source validation and type routing

**ColumnRef:**

- Purpose: Flexible column identifier (by ID or title)
- Examples: `src/board/BoardStore.ts:14`
- Pattern: Union type allowing multiple lookup strategies

**ToolDef:**

- Purpose: MCP tool definition with schema and handler
- Examples: `src/mcp/tools.ts:9-14`, tools array at `src/mcp/tools.ts:57-300`
- Pattern: Descriptor object with validation and execution

## Entry Points

**activate():**

- Location: `src/extension.ts:20-85`
- Triggers: VS Code extension activation (on startup or on-demand)
- Responsibilities:
  - Create BoardStore from globalState
  - Register tree view for activity bar
  - Register toggle and open commands
  - Create status bar item
  - Start MCP server (fire-and-forget with error handling)
  - Register MCP provider with VS Code

**deactivate():**

- Location: `src/extension.ts:87-92`
- Triggers: VS Code extension deactivation (shutdown or reload)
- Responsibilities:
  - Dispose active bridge
  - Dispose MCP server

## Architectural Constraints

- **Threading:** Single-threaded event loop. Extension runs in extension host process. MCP server handles requests sequentially per HTTP connection.
- **Global state:** Three module-level variables: `mcp`, `activeBridge`, `kanbanPanel` in `src/extension.ts`. BoardStore maintains internal board and kv state. All persist via memento.
- **Circular imports:** None detected. Board layer has no dependency on webview or mcp layers.
- **Graceful degradation:** MCP server failure logged and ignored (line 82 in `src/extension.ts`); board UI continues to work independently.
- **Cross-process messaging:** WebView iframe is cross-origin; communication via postMessage only, relayed through script in HTML document.

## Anti-Patterns

### Creating New Panel on Every Toggle

**What happens:** Would create multiple WebviewPanel instances instead of toggling
**Why it's wrong:** Multiple panels consume memory and confuse user state
**Do this instead:** Singleton pattern with `let kanbanPanel` and dispose check at `src/extension.ts:32-35`

### Bidirectional State Mutations

**What happens:** Both webview and extension trying to mutate board simultaneously
**Why it's wrong:** Race conditions, inconsistent state, difficult debugging
**Do this instead:** Unidirectional flow: webview sends messages -> bridge -> store -> emits change -> bridge -> webview (lines 74-89 in `src/webview/bridge.ts`)

## Error Handling

**Strategy:** Graceful degradation with console warnings. MCP server failures do not block UI.

**Patterns:**

- MCP server wrapped in try-catch at `src/extension.ts:78-83`
- Tool handlers wrap mutations in guard function at `src/mcp/tools.ts:46-51`
- Message validation checks source and type at `src/webview/bridge.ts:37-39`
- Column/card lookup throw descriptive errors at `src/board/BoardStore.ts:291-296`, `src/board/BoardStore.ts:309-313`

## Cross-Cutting Concerns

**Logging:**

- Console warnings for MCP server startup failures (line 82 in `src/extension.ts`)
- Tool result format supports `isError` flag for error reporting (line 22 in `src/mcp/tools.ts`)

**Validation:**

- Message source validation: `msg.source !== MESSAGE_SOURCE` (line 38 in `src/webview/bridge.ts`)
- Schema validation: All MCP tools use zod for input validation (line 54 in `src/mcp/tools.ts`)
- Column/card reference resolution: ColumnRef pattern allows flexible lookup (lines 283-296 in `src/board/BoardStore.ts`)

**Authentication:**

- VS Code extension context handles all authentication via ExtensionContext
- No explicit auth for internal components
- MCP server binds to 127.0.0.1 only (line 80 in `src/mcp/server.ts`)

---

_Architecture analysis: 2026-06-29_
