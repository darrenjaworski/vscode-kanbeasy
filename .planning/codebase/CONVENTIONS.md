# Coding Conventions

**Analysis Date:** 2026-06-29

## Naming Patterns

**Files:**

- Class files: PascalCase (e.g., `BoardStore.ts`, `TreeDataProvider`)
- Utility/function files: camelCase or domain-based (e.g., `bridge.ts`, `content.ts`)
- Test files: `{module}.test.ts` suffix (e.g., `BoardStore.test.ts`)

**Functions:**

- camelCase for all functions (e.g., `createDefaultBoard`, `reduceWebviewMessage`, `attachBridge`, `getWebviewContent`)
- Prefixes for intent clarity: `get*` for accessors, `add*` for mutations, `reduce*` for state transformers

**Variables:**

- camelCase for all local and module-level variables (e.g., `kanbanPanel`, `statusBarItem`, `activeBridge`, `applyingInbound`)
- `const` preferred over `let` for immutable values
- No var declarations

**Types:**

- PascalCase for all type names (e.g., `BridgeMessage`, `BoardState`, `Card`, `Column`, `InitPayload`, `CardFields`)
- `*Like` suffix for protocol/interface conformance types (e.g., `MementoLike` implements the VS Code Memento contract)
- `*Ref` suffix for parameter objects that identify resources (e.g., `ColumnRef` with `columnId` or `columnTitle`)

**Constants:**

- UPPER_SNAKE_CASE for module constants (e.g., `MESSAGE_SOURCE`, `PROTOCOL_VERSION`, `GLOBAL_BOARD_KEY`, `NEXT_CARD_NUMBER_KEY`)
- Located in `src/board/constants.ts` for shared protocol constants

## Code Style

**Formatting:**

- No `.prettierrc` configured; manual formatting via ESLint warnings
- Semicolons required at end of statements

**Linting:**

- Tool: ESLint 10.5.0
- Config: `eslint.config.mjs` (flat config format)
- Key rules enforced:
  - `@typescript-eslint/naming-convention`: warns on import naming violations (must be camelCase or PascalCase)
  - `curly`: warns on missing braces around control statements
  - `eqeqeq`: warns on loose equality (`==`, `!=`) — use strict (`===`, `!==`)
  - `no-throw-literal`: warns on throwing non-Error objects
  - `semi`: warns on missing semicolons

**TypeScript:**

- `target: ES2022` — modern JavaScript
- `module: Node16` — Node.js module resolution
- Strict mode enabled — all strict type-checking options
- `skipLibCheck: true` — skip checking 3rd-party `.d.ts` due to DOM/fetch globals in MCP SDK

## Import Organization

**Order:**

1. Standard library imports (`node:*` and `vscode` module)
2. Relative imports from parent/sibling modules (`../`, `./`)
3. Type imports using `type` keyword for type-only imports

**Path Aliases:**

- Not used; direct relative imports only

**Examples from codebase:**

```typescript
// src/extension.ts
import * as vscode from "vscode";
import { BoardStore } from "./board/BoardStore";
import { startMcpServer, type RunningMcpServer } from "./mcp/server";
import { registerMcpProvider } from "./mcp/provider";
import { attachBridge } from "./webview/bridge";
import { getWebviewContent } from "./webview/content";

// src/webview/bridge.ts
import type { BoardStore } from "../board/BoardStore";
import type { BoardState } from "../board/types";
import type * as vscode from "vscode";
import { MESSAGE_SOURCE, PROTOCOL_VERSION } from "../board/constants";
```

## Error Handling

**Patterns:**

- Try-catch blocks wrap fallible operations (HTTP handling, async initialization)
- Caught errors are logged with `console.warn()` including context prefix
- Error types are not re-thrown; instead, graceful degradation occurs
- No throwing of literals; always throw `Error` objects or subtypes

**Example from `src/extension.ts`:**

```typescript
try {
  mcp = await startMcpServer(store);
} catch (e) {
  mcp = undefined;
  console.warn("[kanbeasy] MCP server failed to start:", e);
}
```

**Validation:**

- Zod schemas used for runtime type validation of complex objects
- Type assertions used at SDK boundaries where structural typing differs from nominal types

## Logging

**Framework:** console (native Node.js/browser APIs)

**Patterns:**

- Prefix-based: `[kanbeasy]` prefix for extension messages
- Severity levels: `console.warn()` for errors/warnings
- Logged with context: error events include context (e.g., `"MCP server failed to start"`)

## Comments

**When to Comment:**

- Non-obvious behavior or complex algorithms
- Explain why, not what (e.g., "must check source to prevent relaying unrelated postMessages")
- Protocol dependencies (e.g., "web app depends on it for migration")
- Boundary conditions (e.g., why a type is cast at SDK interface)

**JSDoc/TSDoc:**

- Used for public exported functions
- Documents contract (params, return, errors)
- Explains trade-offs or non-obvious behavior

**Example from `src/webview/bridge.ts`:**

```typescript
/**
 * Apply an inbound webview message to the store. Returns a reply message to
 * post back to the webview, or undefined if there's nothing to send.
 */
export function reduceWebviewMessage(
  store: BoardStore,
  message: unknown,
): BridgeMessage | undefined;
```

## Function Design

**Size:** Most functions are small (< 30 lines), following single-responsibility principle

**Parameters:**

- Explicit type annotations
- Object parameters used for optional/multiple arguments (e.g., `{ columnId?: string; columnTitle?: string }`)
- Validated at entry point via Zod or type assertions

**Return Values:**

- Explicit return types
- Functions return `undefined` for void operations or side-effects
- Type-safe returns using discriminated unions (e.g., `BridgeMessage | undefined`)
- Functions returning promises explicitly marked `async`

**Async Pattern:**

```typescript
export async function activate(context: vscode.ExtensionContext) {
  // ...
  mcp = await startMcpServer(store);
}

export async function deactivate() {
  await mcp?.dispose();
}
```

## Module Design

**Exports:**

- Named exports preferred over default exports
- Type exports use `type` keyword for clarity: `export type RunningMcpServer = { ... }`
- Internal/private functions exported from modules only when needed across files

**Barrel Files:** Not used — direct imports preferred for clarity

**Class Patterns:**

- Private fields: `private readonly memento: MementoLike`
- Public methods documented
- Listener pattern used for observables: `onDidChangeBoard(listener: Listener): () => void`

**Example from `src/board/BoardStore.ts`:**

```typescript
export class BoardStore {
  private board: BoardState;
  private kv: Record<string, unknown>;
  private readonly isFirstRun: boolean;
  private readonly listeners = new Set<Listener>();

  constructor(private readonly memento: MementoLike) { ... }

  getBoard(): BoardState { ... }
  addCard(ref: ColumnRef, fields: CardFields): Card { ... }
}
```

---

_Convention analysis: 2026-06-29_
