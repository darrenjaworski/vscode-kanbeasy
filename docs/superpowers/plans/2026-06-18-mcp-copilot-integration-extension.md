# MCP Copilot Integration (Extension Side) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-process MCP server to the Kanbeasy VS Code extension so GitHub Copilot can read and edit the kanban board (cards + columns) whether or not the board panel is open, with the extension's `globalState` as the single source of truth.

**Architecture:** `BoardStore` (backed by `globalState`) owns all board state and mutation logic, SDK- and vscode-free. `mcp/tools.ts` defines thin tool handlers over `BoardStore`. `mcp/server.ts` (the ONLY file importing the MCP SDK) runs an in-process HTTP MCP server and registers those tools. A webview bridge syncs the open board via `postMessage`, and the web app (already shipped with "host mode") hydrates from / writes back to the extension.

**Tech Stack:** TypeScript (Node16/CJS), esbuild bundling, `@modelcontextprotocol/sdk` (ESM, bundled), `zod`, VS Code `lm.registerMcpServerDefinitionProvider` + `McpHttpServerDefinition`, Mocha tests (+ `@vscode/test-cli` for integration).

**Spec:** `docs/superpowers/specs/2026-06-18-mcp-copilot-integration-design.md`
**Companion (web app, already merged):** `~/projects/kanbeasy` — host mode; the contract this plan must match is below.

## Contract the web app already expects (do NOT change unilaterally)

Messages are `{ source: "kanbeasy", protocolVersion: 1, type, payload }`. Direction relative to the **web app**:

| Type                | Direction | Payload                                                |
| ------------------- | --------- | ------------------------------------------------------ |
| `host:ready`        | app → ext | `{}`                                                   |
| `host:init`         | ext → app | `{ board, kv }` (kv carries `kanbeasy:nextCardNumber`) |
| `host:saveBoard`    | app → ext | `{ state }`                                            |
| `host:kvSet`        | app → ext | `{ key, value }`                                       |
| `host:kvRemove`     | app → ext | `{ key }`                                              |
| `host:boardChanged` | ext → app | `{ state, nextCardNumber }`                            |

The web app detects host mode via the iframe URL `?host=vscode` and only ever talks to `window.parent`. The extension's webview HTML must relay between `acquireVsCodeApi()` and the iframe.

Shared types (`BoardState`, `Card`, `Column`, `ArchivedCard`, `ColumnHistoryEntry`) come from the web app's `src/board/types.ts` and must be copied verbatim.

---

## Testing approach (read before starting)

- **Pure modules** (`board/*`, `mcp/tools.ts`, `webview/bridge.ts` reducer): Mocha suites in `src/test/unit/`, no `vscode`/SDK imports. Run fast via `npm run test:unit`.
- **Integration** (extension activation, provider registration, live MCP endpoint): `@vscode/test-cli` Electron harness, suites in `src/test/integration/`. Run via `npm test`. These do NOT import the SDK — they use `vscode` + `fetch`.
- `mcp/server.ts` imports the ESM-only SDK; it is verified by `npm run compile` (esbuild bundles the SDK into `dist/`) plus the integration smoke test — never imported by a unit test.

---

## File Structure

- **Create** `src/board/types.ts` — copied board types from the web app.
- **Create** `src/board/constants.ts` — `MESSAGE_SOURCE`, `PROTOCOL_VERSION`, `NEXT_CARD_NUMBER_KEY`, globalState keys.
- **Create** `src/board/BoardStore.ts` — source of truth; CRUD + counter + archive + change event; depends only on a `MementoLike` interface.
- **Create** `src/mcp/tools.ts` — `ToolDef[]`: thin handlers over `BoardStore` (SDK-free).
- **Create** `src/mcp/server.ts` — in-process HTTP MCP server (imports the SDK).
- **Create** `src/mcp/provider.ts` — `McpServerDefinitionProvider` returning the `McpHttpServerDefinition`.
- **Create** `src/webview/bridge.ts` — pure message reducer + `attachBridge(webview, store)` wiring.
- **Create** `src/webview/content.ts` — `getWebviewContent()` (host-mode iframe + relay script).
- **Modify** `src/extension.ts` — wire store, server, provider, bridge; activation/deactivation.
- **Modify** `package.json` — deps (`@modelcontextprotocol/sdk`, `zod`), `contributes.mcpServerDefinitionProviders`, test scripts.
- **Modify** `.vscode-test.mjs` — point the Electron glob at `out/test/integration/**`.
- **Move** `src/test/extension.test.ts` → `src/test/integration/extension.test.ts`.
- **Modify** `CHANGELOG.md`, `README.md`.

### Key type signatures (referenced across tasks)

```ts
// board/BoardStore.ts
export interface MementoLike {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void> | void;
}
export type ColumnRef = { columnId?: string; columnTitle?: string };
export interface InitPayload {
  board: BoardState;
  kv: Record<string, unknown>;
}

// mcp/tools.ts
export interface ToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
}
export interface ToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: import("zod").ZodRawShape;
  handler: (store: BoardStore, args: Record<string, unknown>) => ToolResult;
}
```

---

## Task 1: Dependencies, shared contract, test lanes

**Files:**

- Modify: `package.json`
- Modify: `.vscode-test.mjs`
- Create: `src/board/types.ts`, `src/board/constants.ts`
- Move: `src/test/extension.test.ts` → `src/test/integration/extension.test.ts`
- Test: `src/test/unit/contract.test.ts`

- [ ] **Step 1: Install runtime dependencies**

Run:

```bash
npm install @modelcontextprotocol/sdk zod
npm install --save-dev mocha
```

Expected: `@modelcontextprotocol/sdk` and `zod` in `dependencies`; `mocha` in `devDependencies`. (esbuild bundles `dependencies` into `dist/`; `vscode` stays external.)

- [ ] **Step 2: Copy the board types from the web app verbatim**

Copy `~/projects/kanbeasy/src/board/types.ts` lines for `ColumnHistoryEntry`, `Card`, `ArchivedCard`, `Column`, `BoardState` into a new `src/board/types.ts`. Include ONLY those type exports (omit the web app's `BoardContextValue`, `CardClipboard`, `CardUpdates` — not needed here). The file must contain exactly:

```ts
export type ColumnHistoryEntry = Readonly<{
  columnId: string;
  enteredAt: number;
}>;

export type Card = Readonly<{
  id: string;
  number: number;
  title: string;
  description: string;
  cardTypeId: string | null;
  cardTypeLabel?: string;
  cardTypeColor?: string;
  dueDate: string | null;
  createdAt: number;
  updatedAt: number;
  columnHistory: ColumnHistoryEntry[];
}>;

export type ArchivedCard = Card &
  Readonly<{
    archivedAt: number;
    archivedFromColumnId: string;
  }>;

export type Column = Readonly<{
  id: string;
  title: string;
  cards: Card[];
  createdAt: number;
  updatedAt: number;
}>;

export type BoardState = Readonly<{
  columns: Column[];
  archive: ArchivedCard[];
}>;
```

- [ ] **Step 3: Create `src/board/constants.ts`**

```ts
/** Bridge protocol — must match the kanbeasy web app's hostBridge.ts. */
export const MESSAGE_SOURCE = "kanbeasy";
export const PROTOCOL_VERSION = 1;

/** KV key the web app reads/writes for the card-number counter. */
export const NEXT_CARD_NUMBER_KEY = "kanbeasy:nextCardNumber";

/** globalState keys owned by the extension. */
export const GLOBAL_BOARD_KEY = "kanbeasy.board";
export const GLOBAL_KV_KEY = "kanbeasy.kv";
```

- [ ] **Step 4: Add test scripts and move the sample test**

Move `src/test/extension.test.ts` to `src/test/integration/extension.test.ts` (create the folder). Update its relative imports if any (it has none beyond `vscode`/`assert`, so no change needed).

In `package.json` `scripts`, add/adjust:

```json
"test:unit": "tsc -p . --outDir out && mocha \"out/test/unit/**/*.test.js\"",
"pretest": "npm run compile-tests && npm run compile && npm run lint",
"test": "vscode-test"
```

(Keep the other existing scripts.)

In `.vscode-test.mjs`, change the glob so the Electron harness runs only integration tests:

```js
import { defineConfig } from "@vscode/test-cli";

export default defineConfig({
  files: "out/test/integration/**/*.test.js",
});
```

- [ ] **Step 5: Write the failing contract test**

Create `src/test/unit/contract.test.ts`:

```ts
import * as assert from "assert";
import {
  MESSAGE_SOURCE,
  PROTOCOL_VERSION,
  NEXT_CARD_NUMBER_KEY,
} from "../../board/constants";

suite("bridge contract", () => {
  test("matches the web app hostBridge constants", () => {
    assert.strictEqual(MESSAGE_SOURCE, "kanbeasy");
    assert.strictEqual(PROTOCOL_VERSION, 1);
    assert.strictEqual(NEXT_CARD_NUMBER_KEY, "kanbeasy:nextCardNumber");
  });
});
```

- [ ] **Step 6: Run the unit test to verify it passes**

Run: `npm run test:unit`
Expected: PASS (1 test). This also proves the unit lane (tsc → mocha) works end to end.

- [ ] **Step 7: Commit**

```bash
git add package.json .vscode-test.mjs src/board/types.ts src/board/constants.ts src/test/unit/contract.test.ts src/test/integration/extension.test.ts package-lock.json
git rm --cached src/test/extension.test.ts 2>/dev/null; true
git commit -m "chore: add MCP deps, shared board contract, and unit test lane"
```

---

## Task 2: BoardStore (source of truth)

**Files:**

- Create: `src/board/BoardStore.ts`
- Test: `src/test/unit/BoardStore.test.ts`

`BoardStore` wraps a `MementoLike` (VS Code's `globalState` implements it). It holds the board and a KV map, both persisted. The card-number counter lives in KV under `NEXT_CARD_NUMBER_KEY`. It exposes a change event (tiny internal emitter — no `vscode` import).

- [ ] **Step 1: Write the failing tests**

Create `src/test/unit/BoardStore.test.ts`:

```ts
import * as assert from "assert";
import { BoardStore, type MementoLike } from "../../board/BoardStore";

function fakeMemento(): MementoLike {
  const map = new Map<string, unknown>();
  return {
    get<T>(key: string): T | undefined {
      return map.get(key) as T | undefined;
    },
    update(key: string, value: unknown) {
      map.set(key, value);
    },
  };
}

suite("BoardStore", () => {
  test("seeds a default board with three columns and counter 1", () => {
    const store = new BoardStore(fakeMemento());
    const board = store.getBoard();
    assert.deepStrictEqual(
      board.columns.map((c) => c.title),
      ["To Do", "In Progress", "Done"],
    );
    assert.strictEqual(board.archive.length, 0);
    assert.strictEqual(store.getNextCardNumber(), 1);
  });

  test("addCard appends a numbered card and advances the counter", () => {
    const store = new BoardStore(fakeMemento());
    const todo = store.getBoard().columns[0];
    const card = store.addCard({ columnId: todo.id }, { title: "Write tests" });
    assert.strictEqual(card.number, 1);
    assert.strictEqual(card.title, "Write tests");
    assert.strictEqual(store.getNextCardNumber(), 2);
    const board = store.getBoard();
    assert.strictEqual(board.columns[0].cards[0].id, card.id);
  });

  test("addCard resolves a column by title", () => {
    const store = new BoardStore(fakeMemento());
    const card = store.addCard({ columnTitle: "Done" }, { title: "Shipped" });
    const done = store.getBoard().columns.find((c) => c.title === "Done")!;
    assert.strictEqual(done.cards[0].id, card.id);
  });

  test("addCard throws when the column cannot be resolved", () => {
    const store = new BoardStore(fakeMemento());
    assert.throws(() => store.addCard({ columnTitle: "Nope" }, { title: "x" }));
  });

  test("updateCard patches fields and bumps updatedAt", () => {
    const store = new BoardStore(fakeMemento());
    const todo = store.getBoard().columns[0];
    const card = store.addCard({ columnId: todo.id }, { title: "old" });
    const updated = store.updateCard(card.number, {
      title: "new",
      dueDate: "2026-07-01",
    });
    assert.strictEqual(updated.title, "new");
    assert.strictEqual(updated.dueDate, "2026-07-01");
    assert.ok(updated.updatedAt >= card.updatedAt);
  });

  test("moveCard relocates a card and appends column history", () => {
    const store = new BoardStore(fakeMemento());
    const [todo, , done] = store.getBoard().columns;
    const card = store.addCard({ columnId: todo.id }, { title: "move me" });
    store.moveCard(card.number, { columnId: done.id });
    const board = store.getBoard();
    assert.strictEqual(board.columns[0].cards.length, 0);
    const moved = board.columns[2].cards[0];
    assert.strictEqual(moved.id, card.id);
    assert.strictEqual(
      moved.columnHistory[moved.columnHistory.length - 1].columnId,
      done.id,
    );
  });

  test("archiveCard moves a card to the archive; restoreCard brings it back", () => {
    const store = new BoardStore(fakeMemento());
    const todo = store.getBoard().columns[0];
    const card = store.addCard({ columnId: todo.id }, { title: "temp" });
    store.archiveCard(card.number);
    assert.strictEqual(store.getBoard().columns[0].cards.length, 0);
    assert.strictEqual(store.getBoard().archive[0].id, card.id);

    store.restoreCard(card.number, { columnId: todo.id });
    assert.strictEqual(store.getBoard().archive.length, 0);
    assert.strictEqual(store.getBoard().columns[0].cards[0].id, card.id);
  });

  test("addColumn / renameColumn manage columns", () => {
    const store = new BoardStore(fakeMemento());
    const col = store.addColumn("Backlog");
    assert.ok(store.getBoard().columns.some((c) => c.id === col.id));
    store.renameColumn({ columnId: col.id }, "Icebox");
    assert.strictEqual(
      store.getBoard().columns.find((c) => c.id === col.id)!.title,
      "Icebox",
    );
  });

  test("removeColumn archives its cards before removing the column", () => {
    const store = new BoardStore(fakeMemento());
    const todo = store.getBoard().columns[0];
    const card = store.addCard({ columnId: todo.id }, { title: "rescue me" });
    store.removeColumn({ columnId: todo.id });
    const board = store.getBoard();
    assert.ok(!board.columns.some((c) => c.id === todo.id));
    assert.strictEqual(board.archive[0].id, card.id);
    assert.strictEqual(board.archive[0].archivedFromColumnId, todo.id);
  });

  test("fires onDidChangeBoard after a mutation and persists across instances", () => {
    const memento = fakeMemento();
    const store = new BoardStore(memento);
    let fired = 0;
    store.onDidChangeBoard(() => (fired += 1));
    const todo = store.getBoard().columns[0];
    store.addCard({ columnId: todo.id }, { title: "persist" });
    assert.strictEqual(fired, 1);

    const reloaded = new BoardStore(memento);
    assert.strictEqual(
      reloaded.getBoard().columns[0].cards[0].title,
      "persist",
    );
  });

  test("getInitPayload includes the board and kv with the counter", () => {
    const store = new BoardStore(fakeMemento());
    store.addCard({ columnTitle: "To Do" }, { title: "x" });
    const init = store.getInitPayload();
    assert.ok(init.board.columns.length === 3);
    assert.strictEqual(init.kv["kanbeasy:nextCardNumber"], 2);
  });

  test("setKv/removeKv persist settings and saveBoard replaces state", () => {
    const store = new BoardStore(fakeMemento());
    store.setKv("kanbeasy:theme", "dark");
    assert.strictEqual(store.getKv()["kanbeasy:theme"], "dark");
    store.removeKv("kanbeasy:theme");
    assert.strictEqual(store.getKv()["kanbeasy:theme"], undefined);

    const replacement = { columns: [], archive: [] };
    store.saveBoard(replacement);
    assert.deepStrictEqual(store.getBoard(), replacement);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit`
Expected: FAIL — `Cannot find module '../../board/BoardStore'`.

- [ ] **Step 3: Implement `src/board/BoardStore.ts`**

```ts
import { randomUUID } from "node:crypto";
import type { ArchivedCard, BoardState, Card, Column } from "./types";
import {
  GLOBAL_BOARD_KEY,
  GLOBAL_KV_KEY,
  NEXT_CARD_NUMBER_KEY,
} from "./constants";

export interface MementoLike {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void> | void;
}

export type ColumnRef = { columnId?: string; columnTitle?: string };

export interface CardFields {
  title?: string;
  description?: string;
  cardTypeId?: string | null;
  dueDate?: string | null;
}

export interface InitPayload {
  board: BoardState;
  kv: Record<string, unknown>;
}

type Listener = () => void;

function createDefaultBoard(): BoardState {
  const now = Date.now();
  const mk = (title: string): Column => ({
    id: randomUUID(),
    title,
    cards: [],
    createdAt: now,
    updatedAt: now,
  });
  return { columns: [mk("To Do"), mk("In Progress"), mk("Done")], archive: [] };
}

export class BoardStore {
  private board: BoardState;
  private kv: Record<string, unknown>;
  private readonly listeners = new Set<Listener>();

  constructor(private readonly memento: MementoLike) {
    this.board =
      memento.get<BoardState>(GLOBAL_BOARD_KEY) ?? createDefaultBoard();
    this.kv = memento.get<Record<string, unknown>>(GLOBAL_KV_KEY) ?? {};
    if (this.kv[NEXT_CARD_NUMBER_KEY] === undefined) {
      this.kv[NEXT_CARD_NUMBER_KEY] = 1;
    }
  }

  onDidChangeBoard(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getBoard(): BoardState {
    return this.board;
  }

  getKv(): Record<string, unknown> {
    return this.kv;
  }

  getNextCardNumber(): number {
    return (this.kv[NEXT_CARD_NUMBER_KEY] as number) ?? 1;
  }

  getInitPayload(): InitPayload {
    return { board: this.board, kv: this.kv };
  }

  // --- writes from the webview ---

  saveBoard(state: BoardState): void {
    this.board = state;
    this.persistBoard();
  }

  setKv(key: string, value: unknown): void {
    this.kv = { ...this.kv, [key]: value };
    this.persistKv();
  }

  removeKv(key: string): void {
    const next = { ...this.kv };
    delete next[key];
    this.kv = next;
    this.persistKv();
  }

  // --- card mutations ---

  addCard(column: ColumnRef, fields: CardFields): Card {
    const col = this.requireColumn(column);
    const now = Date.now();
    const number = this.getNextCardNumber();
    const card: Card = {
      id: randomUUID(),
      number,
      title: fields.title ?? "",
      description: fields.description ?? "",
      cardTypeId: fields.cardTypeId ?? null,
      dueDate: fields.dueDate ?? null,
      createdAt: now,
      updatedAt: now,
      columnHistory: [{ columnId: col.id, enteredAt: now }],
    };
    this.replaceColumn(col.id, (c) => ({ ...c, cards: [...c.cards, card] }));
    this.kv = { ...this.kv, [NEXT_CARD_NUMBER_KEY]: number + 1 };
    // Write KV without emitting; persistBoard() fires a single change event so
    // a card add produces exactly one onDidChangeBoard notification.
    this.memento.update(GLOBAL_KV_KEY, this.kv);
    this.persistBoard();
    return card;
  }

  updateCard(number: number, fields: CardFields): Card {
    const loc = this.requireCard(number);
    const existing = this.board.columns[loc.col].cards[loc.idx];
    const updated: Card = {
      ...existing,
      ...("title" in fields && fields.title !== undefined
        ? { title: fields.title }
        : {}),
      ...("description" in fields && fields.description !== undefined
        ? { description: fields.description }
        : {}),
      ...("cardTypeId" in fields
        ? { cardTypeId: fields.cardTypeId ?? null }
        : {}),
      ...("dueDate" in fields ? { dueDate: fields.dueDate ?? null } : {}),
      updatedAt: Date.now(),
    };
    const colId = this.board.columns[loc.col].id;
    this.replaceColumn(colId, (c) => ({
      ...c,
      cards: c.cards.map((x) => (x.id === updated.id ? updated : x)),
    }));
    this.persistBoard();
    return updated;
  }

  moveCard(number: number, to: ColumnRef, position?: number): void {
    const loc = this.requireCard(number);
    const fromCol = this.board.columns[loc.col];
    const card = fromCol.cards[loc.idx];
    const target = this.requireColumn(to);
    const now = Date.now();
    const moved: Card = {
      ...card,
      updatedAt: now,
      columnHistory: [
        ...card.columnHistory,
        { columnId: target.id, enteredAt: now },
      ],
    };
    const columns = this.board.columns.map((c) => {
      if (c.id === fromCol.id) {
        return { ...c, cards: c.cards.filter((x) => x.id !== card.id) };
      }
      return c;
    });
    const withInsert = columns.map((c) => {
      if (c.id !== target.id) {
        return c;
      }
      const cards = [...c.cards];
      const at =
        position === undefined
          ? cards.length
          : Math.max(0, Math.min(position, cards.length));
      cards.splice(at, 0, moved);
      return { ...c, cards };
    });
    this.board = { ...this.board, columns: withInsert };
    this.persistBoard();
  }

  archiveCard(number: number): void {
    const loc = this.requireCard(number);
    const col = this.board.columns[loc.col];
    const card = col.cards[loc.idx];
    const archived: ArchivedCard = {
      ...card,
      archivedAt: Date.now(),
      archivedFromColumnId: col.id,
    };
    const columns = this.board.columns.map((c) =>
      c.id === col.id
        ? { ...c, cards: c.cards.filter((x) => x.id !== card.id) }
        : c,
    );
    this.board = {
      ...this.board,
      columns,
      archive: [...this.board.archive, archived],
    };
    this.persistBoard();
  }

  restoreCard(number: number, to?: ColumnRef): void {
    const idx = this.board.archive.findIndex((a) => a.number === number);
    if (idx === -1) {
      throw new Error(`No archived card with number ${number}`);
    }
    const archived = this.board.archive[idx];
    const targetId = to
      ? this.requireColumn(to).id
      : (this.findColumnById(archived.archivedFromColumnId)?.id ??
        this.board.columns[0]?.id);
    if (!targetId) {
      throw new Error("No column available to restore the card into");
    }
    const now = Date.now();
    const { archivedAt: _a, archivedFromColumnId: _f, ...card } = archived;
    const restored: Card = {
      ...card,
      updatedAt: now,
      columnHistory: [
        ...card.columnHistory,
        { columnId: targetId, enteredAt: now },
      ],
    };
    const columns = this.board.columns.map((c) =>
      c.id === targetId ? { ...c, cards: [...c.cards, restored] } : c,
    );
    const archive = this.board.archive.filter((_, i) => i !== idx);
    this.board = { ...this.board, columns, archive };
    this.persistBoard();
  }

  // --- column mutations ---

  addColumn(title: string, position?: number): Column {
    const now = Date.now();
    const col: Column = {
      id: randomUUID(),
      title,
      cards: [],
      createdAt: now,
      updatedAt: now,
    };
    const columns = [...this.board.columns];
    const at =
      position === undefined
        ? columns.length
        : Math.max(0, Math.min(position, columns.length));
    columns.splice(at, 0, col);
    this.board = { ...this.board, columns };
    this.persistBoard();
    return col;
  }

  renameColumn(column: ColumnRef, title: string): void {
    const col = this.requireColumn(column);
    this.replaceColumn(col.id, (c) => ({ ...c, title, updatedAt: Date.now() }));
    this.persistBoard();
  }

  removeColumn(column: ColumnRef): void {
    const col = this.requireColumn(column);
    const now = Date.now();
    const archivedFromColumn: ArchivedCard[] = col.cards.map((card) => ({
      ...card,
      archivedAt: now,
      archivedFromColumnId: col.id,
    }));
    this.board = {
      columns: this.board.columns.filter((c) => c.id !== col.id),
      archive: [...this.board.archive, ...archivedFromColumn],
    };
    this.persistBoard();
  }

  // --- internals ---

  private requireColumn(ref: ColumnRef): Column {
    const col = ref.columnId
      ? this.findColumnById(ref.columnId)
      : ref.columnTitle
        ? this.board.columns.find(
            (c) => c.title.toLowerCase() === ref.columnTitle!.toLowerCase(),
          )
        : undefined;
    if (!col) {
      throw new Error(
        `Column not found (${ref.columnId ?? ref.columnTitle ?? "no reference"})`,
      );
    }
    return col;
  }

  private findColumnById(id: string): Column | undefined {
    return this.board.columns.find((c) => c.id === id);
  }

  private requireCard(number: number): { col: number; idx: number } {
    for (let col = 0; col < this.board.columns.length; col++) {
      const idx = this.board.columns[col].cards.findIndex(
        (c) => c.number === number,
      );
      if (idx !== -1) {
        return { col, idx };
      }
    }
    throw new Error(`No card with number ${number}`);
  }

  private replaceColumn(id: string, fn: (c: Column) => Column): void {
    this.board = {
      ...this.board,
      columns: this.board.columns.map((c) => (c.id === id ? fn(c) : c)),
    };
  }

  private persistBoard(): void {
    this.memento.update(GLOBAL_BOARD_KEY, this.board);
    this.emit();
  }

  private persistKv(): void {
    this.memento.update(GLOBAL_KV_KEY, this.kv);
    this.emit();
  }

  private emit(): void {
    for (const l of this.listeners) {
      l();
    }
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:unit`
Expected: PASS (all BoardStore tests + the contract test).

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: clean (fix any issues in `BoardStore.ts`).

- [ ] **Step 6: Commit**

```bash
git add src/board/BoardStore.ts src/test/unit/BoardStore.test.ts
git commit -m "feat: add BoardStore as the extension-owned source of truth"
```

---

## Task 3: MCP tool handlers (SDK-free)

**Files:**

- Create: `src/mcp/tools.ts`
- Test: `src/test/unit/tools.test.ts`

Thin handlers over `BoardStore`. Cards referenced by `number`; columns by `columnId` or `columnTitle`. Each handler returns `{ content: [{ type: "text", text }] }`. Errors are caught and returned as `{ ..., isError: true }` so the agent sees the message.

- [ ] **Step 1: Write the failing tests**

Create `src/test/unit/tools.test.ts`:

```ts
import * as assert from "assert";
import { BoardStore, type MementoLike } from "../../board/BoardStore";
import { tools } from "../../mcp/tools";

function fakeMemento(): MementoLike {
  const map = new Map<string, unknown>();
  return {
    get<T>(key: string): T | undefined {
      return map.get(key) as T | undefined;
    },
    update(key: string, value: unknown) {
      map.set(key, value);
    },
  };
}
const byName = (name: string) => {
  const t = tools.find((x) => x.name === name);
  if (!t) {
    throw new Error(`tool ${name} not registered`);
  }
  return t;
};

suite("mcp tools", () => {
  test("exposes the expected tool names", () => {
    const names = tools.map((t) => t.name).sort();
    assert.deepStrictEqual(names, [
      "add_card",
      "add_column",
      "archive_card",
      "get_board",
      "get_card",
      "list_cards",
      "list_columns",
      "move_card",
      "remove_column",
      "rename_column",
      "restore_card",
      "search_cards",
      "update_card",
    ]);
  });

  test("add_card creates a card and returns its number", () => {
    const store = new BoardStore(fakeMemento());
    const res = byName("add_card").handler(store, {
      column: "To Do",
      title: "Wire MCP",
    });
    assert.ok(!res.isError);
    assert.match(res.content[0].text, /#1/);
    assert.strictEqual(store.getBoard().columns[0].cards[0].title, "Wire MCP");
  });

  test("get_card finds a card by number", () => {
    const store = new BoardStore(fakeMemento());
    byName("add_card").handler(store, { column: "To Do", title: "Find me" });
    const res = byName("get_card").handler(store, { number: 1 });
    assert.match(res.content[0].text, /Find me/);
  });

  test("archive_card removes the card from its column", () => {
    const store = new BoardStore(fakeMemento());
    byName("add_card").handler(store, { column: "To Do", title: "Temp" });
    const res = byName("archive_card").handler(store, { number: 1 });
    assert.ok(!res.isError);
    assert.strictEqual(store.getBoard().columns[0].cards.length, 0);
    assert.strictEqual(store.getBoard().archive.length, 1);
  });

  test("remove_column archives its cards", () => {
    const store = new BoardStore(fakeMemento());
    byName("add_card").handler(store, { column: "To Do", title: "Keep safe" });
    const res = byName("remove_column").handler(store, { column: "To Do" });
    assert.ok(!res.isError);
    assert.ok(!store.getBoard().columns.some((c) => c.title === "To Do"));
    assert.strictEqual(store.getBoard().archive.length, 1);
  });

  test("returns isError when a card number does not exist", () => {
    const store = new BoardStore(fakeMemento());
    const res = byName("get_card").handler(store, { number: 999 });
    assert.strictEqual(res.isError, true);
    assert.match(res.content[0].text, /999/);
  });

  test("every tool has a non-empty title and description", () => {
    for (const t of tools) {
      assert.ok(t.title.length > 0, `${t.name} missing title`);
      assert.ok(t.description.length > 0, `${t.name} missing description`);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit`
Expected: FAIL — `Cannot find module '../../mcp/tools'`.

- [ ] **Step 3: Implement `src/mcp/tools.ts`**

```ts
import { z } from "zod";
import type { BoardStore, ColumnRef } from "../board/BoardStore";

export interface ToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: z.ZodRawShape;
  handler: (store: BoardStore, args: Record<string, unknown>) => ToolResult;
}

const ok = (text: string): ToolResult => ({
  content: [{ type: "text", text }],
});
const err = (text: string): ToolResult => ({
  content: [{ type: "text", text }],
  isError: true,
});

/** Resolve a `column` arg (id or title) into a ColumnRef. */
function columnRef(value: unknown): ColumnRef {
  const s = String(value);
  // Heuristic: a UUID-looking value is treated as an id, otherwise a title.
  return /^[0-9a-f-]{36}$/i.test(s) ? { columnId: s } : { columnTitle: s };
}

function summarizeCard(c: {
  number: number;
  title: string;
  dueDate: string | null;
}): string {
  return `#${c.number} ${c.title}${c.dueDate ? ` (due ${c.dueDate})` : ""}`;
}

function guard(fn: () => ToolResult): ToolResult {
  try {
    return fn();
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}

const columnArg = z.string().describe("Column id or exact column title");
const numberArg = z.number().int().describe("The card's number (e.g. 42)");

export const tools: ToolDef[] = [
  {
    name: "get_board",
    title: "Get board",
    description:
      "Return the whole board: each column with its id, title and cards, plus the archive count.",
    inputSchema: {},
    handler: (store) =>
      ok(
        JSON.stringify(
          {
            columns: store.getBoard().columns.map((c) => ({
              id: c.id,
              title: c.title,
              cards: c.cards.map((card) => ({
                number: card.number,
                title: card.title,
                dueDate: card.dueDate,
              })),
            })),
            archived: store.getBoard().archive.length,
          },
          null,
          2,
        ),
      ),
  },
  {
    name: "list_columns",
    title: "List columns",
    description:
      "List the board's columns with their ids, titles and card counts.",
    inputSchema: {},
    handler: (store) =>
      ok(
        store
          .getBoard()
          .columns.map(
            (c) => `${c.title} [${c.id}] — ${c.cards.length} card(s)`,
          )
          .join("\n") || "(no columns)",
      ),
  },
  {
    name: "list_cards",
    title: "List cards",
    description:
      "List cards, optionally filtered to a single column (by id or title).",
    inputSchema: { column: columnArg.optional() },
    handler: (store, args) =>
      guard(() => {
        const columns = store.getBoard().columns.filter((c) => {
          if (args.column === undefined) {
            return true;
          }
          const ref = columnRef(args.column);
          return ref.columnId
            ? c.id === ref.columnId
            : c.title.toLowerCase() === ref.columnTitle!.toLowerCase();
        });
        const lines = columns.flatMap((c) =>
          c.cards.map((card) => `${c.title}: ${summarizeCard(card)}`),
        );
        return ok(lines.join("\n") || "(no cards)");
      }),
  },
  {
    name: "get_card",
    title: "Get card",
    description: "Return full detail for a single card by its number.",
    inputSchema: { number: numberArg },
    handler: (store, args) =>
      guard(() => {
        const num = Number(args.number);
        for (const col of store.getBoard().columns) {
          const card = col.cards.find((c) => c.number === num);
          if (card) {
            return ok(JSON.stringify({ column: col.title, ...card }, null, 2));
          }
        }
        throw new Error(`No card with number ${num}`);
      }),
  },
  {
    name: "search_cards",
    title: "Search cards",
    description:
      "Find cards whose title or description contains the query (case-insensitive).",
    inputSchema: { query: z.string().describe("Text to search for") },
    handler: (store, args) => {
      const q = String(args.query).toLowerCase();
      const lines = store
        .getBoard()
        .columns.flatMap((c) =>
          c.cards
            .filter(
              (card) =>
                card.title.toLowerCase().includes(q) ||
                card.description.toLowerCase().includes(q),
            )
            .map((card) => `${c.title}: ${summarizeCard(card)}`),
        );
      return ok(lines.join("\n") || "(no matches)");
    },
  },
  {
    name: "add_card",
    title: "Add card",
    description: "Create a card in a column. Returns the new card's number.",
    inputSchema: {
      column: columnArg,
      title: z.string().describe("Card title"),
      description: z
        .string()
        .optional()
        .describe("Card description (markdown)"),
      dueDate: z.string().optional().describe("Due date, ISO yyyy-mm-dd"),
    },
    handler: (store, args) =>
      guard(() => {
        const card = store.addCard(columnRef(args.column), {
          title: String(args.title),
          description: args.description as string | undefined,
          dueDate: args.dueDate as string | undefined,
        });
        return ok(`Added card #${card.number} "${card.title}"`);
      }),
  },
  {
    name: "update_card",
    title: "Update card",
    description: "Update fields of a card identified by number.",
    inputSchema: {
      number: numberArg,
      title: z.string().optional(),
      description: z.string().optional(),
      dueDate: z
        .string()
        .nullable()
        .optional()
        .describe("ISO date or null to clear"),
    },
    handler: (store, args) =>
      guard(() => {
        const fields: Record<string, unknown> = {};
        if (args.title !== undefined) {
          fields.title = args.title;
        }
        if (args.description !== undefined) {
          fields.description = args.description;
        }
        if ("dueDate" in args) {
          fields.dueDate = args.dueDate ?? null;
        }
        const card = store.updateCard(Number(args.number), fields);
        return ok(`Updated card #${card.number}`);
      }),
  },
  {
    name: "move_card",
    title: "Move card",
    description: "Move a card to another column, optionally at a position.",
    inputSchema: {
      number: numberArg,
      toColumn: columnArg,
      position: z.number().int().optional().describe("0-based insert index"),
    },
    handler: (store, args) =>
      guard(() => {
        store.moveCard(
          Number(args.number),
          columnRef(args.toColumn),
          args.position === undefined ? undefined : Number(args.position),
        );
        return ok(`Moved card #${Number(args.number)}`);
      }),
  },
  {
    name: "archive_card",
    title: "Archive card",
    description:
      "Archive a card (recoverable). This is how cards are 'deleted' — use restore_card to undo.",
    inputSchema: { number: numberArg },
    handler: (store, args) =>
      guard(() => {
        store.archiveCard(Number(args.number));
        return ok(`Archived card #${Number(args.number)}`);
      }),
  },
  {
    name: "restore_card",
    title: "Restore card",
    description: "Restore an archived card, optionally into a specific column.",
    inputSchema: { number: numberArg, toColumn: columnArg.optional() },
    handler: (store, args) =>
      guard(() => {
        store.restoreCard(
          Number(args.number),
          args.toColumn === undefined ? undefined : columnRef(args.toColumn),
        );
        return ok(`Restored card #${Number(args.number)}`);
      }),
  },
  {
    name: "add_column",
    title: "Add column",
    description: "Add a new column, optionally at a position.",
    inputSchema: {
      title: z.string().describe("Column title"),
      position: z.number().int().optional().describe("0-based insert index"),
    },
    handler: (store, args) =>
      guard(() => {
        const col = store.addColumn(
          String(args.title),
          args.position === undefined ? undefined : Number(args.position),
        );
        return ok(`Added column "${col.title}" [${col.id}]`);
      }),
  },
  {
    name: "rename_column",
    title: "Rename column",
    description: "Rename a column (identified by id or current title).",
    inputSchema: { column: columnArg, title: z.string().describe("New title") },
    handler: (store, args) =>
      guard(() => {
        store.renameColumn(columnRef(args.column), String(args.title));
        return ok(`Renamed column to "${String(args.title)}"`);
      }),
  },
  {
    name: "remove_column",
    title: "Remove column",
    description:
      "Remove a column. Its cards are archived first (recoverable), then the column is deleted.",
    inputSchema: { column: columnArg },
    handler: (store, args) =>
      guard(() => {
        store.removeColumn(columnRef(args.column));
        return ok(`Removed column (its cards were archived)`);
      }),
  },
];
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:unit`
Expected: PASS (all tools tests).

- [ ] **Step 5: Lint, then commit**

Run: `npm run lint` (fix issues), then:

```bash
git add src/mcp/tools.ts src/test/unit/tools.test.ts
git commit -m "feat: add MCP tool handlers over BoardStore"
```

---

## Task 4: In-process HTTP MCP server

**Files:**

- Create: `src/mcp/server.ts`
- Test: (verified by build + Task 6 integration smoke; no unit test — this file imports the ESM-only SDK)

> The MCP SDK is ESM-only and must not be imported by a tsc-compiled unit test. This file is validated by `npm run compile` (esbuild bundles it) and exercised end-to-end by the integration smoke in Task 6.

- [ ] **Step 1: Implement `src/mcp/server.ts`**

```ts
import * as http from "node:http";
import { AddressInfo } from "node:net";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { BoardStore } from "../board/BoardStore";
import { tools } from "./tools";

export interface RunningMcpServer {
  url: string;
  dispose(): Promise<void>;
}

function buildMcpServer(store: BoardStore): McpServer {
  const server = new McpServer({ name: "kanbeasy", version: "1.0.0" });
  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
      },
      async (args: Record<string, unknown>) => tool.handler(store, args ?? {}),
    );
  }
  return server;
}

async function readBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) {
    return undefined;
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/**
 * Start a stateless Streamable-HTTP MCP server bound to localhost.
 * A fresh server+transport is created per request (stateless mode).
 */
export async function startMcpServer(
  store: BoardStore,
): Promise<RunningMcpServer> {
  const httpServer = http.createServer(async (req, res) => {
    try {
      if (req.method !== "POST") {
        res.writeHead(405).end();
        return;
      }
      const server = buildMcpServer(store);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, await readBody(req));
    } catch {
      if (!res.headersSent) {
        res.writeHead(500).end();
      }
    }
  });

  await new Promise<void>((resolve) =>
    httpServer.listen(0, "127.0.0.1", resolve),
  );
  const { port } = httpServer.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}/`;

  return {
    url,
    dispose: () =>
      new Promise<void>((resolve) => httpServer.close(() => resolve())),
  };
}
```

- [ ] **Step 2: Verify it builds (esbuild bundles the SDK)**

Run: `npm run compile`
Expected: type-check, lint, and esbuild bundle all succeed; `dist/extension.js` is produced. If esbuild reports the SDK import path is wrong, inspect `node_modules/@modelcontextprotocol/sdk/package.json` `exports` and correct the `server/mcp.js` / `server/streamableHttp.js` specifiers. If `registerTool`'s signature differs in the installed version, adapt the `buildMcpServer` call to match the installed `.d.ts` (the contract is: name, `{ title, description, inputSchema: ZodRawShape }`, async handler returning `{ content: [...] }`).

- [ ] **Step 3: Commit**

```bash
git add src/mcp/server.ts
git commit -m "feat: add in-process HTTP MCP server"
```

---

## Task 5: Webview bridge + host-mode content

**Files:**

- Create: `src/webview/bridge.ts`
- Create: `src/webview/content.ts`
- Test: `src/test/unit/bridge.test.ts`

The bridge's message-handling is a pure function `reduceWebviewMessage(store, message)` returning an optional reply message; `attachBridge` wires it to a `vscode.Webview`. `content.ts` builds the webview HTML: it loads the web app with `?host=vscode` and relays messages between `acquireVsCodeApi()` and the iframe.

- [ ] **Step 1: Write the failing tests**

Create `src/test/unit/bridge.test.ts`:

```ts
import * as assert from "assert";
import { BoardStore, type MementoLike } from "../../board/BoardStore";
import {
  reduceWebviewMessage,
  boardChangedMessage,
} from "../../webview/bridge";
import { MESSAGE_SOURCE, PROTOCOL_VERSION } from "../../board/constants";

function fakeMemento(): MementoLike {
  const map = new Map<string, unknown>();
  return {
    get<T>(key: string): T | undefined {
      return map.get(key) as T | undefined;
    },
    update(key: string, value: unknown) {
      map.set(key, value);
    },
  };
}
const wrap = (type: string, payload: unknown) => ({
  source: MESSAGE_SOURCE,
  protocolVersion: PROTOCOL_VERSION,
  type,
  payload,
});

suite("webview bridge", () => {
  test("ignores foreign messages", () => {
    const store = new BoardStore(fakeMemento());
    assert.strictEqual(
      reduceWebviewMessage(store, { source: "other", type: "host:ready" }),
      undefined,
    );
  });

  test("host:ready returns a host:init with board + kv", () => {
    const store = new BoardStore(fakeMemento());
    const reply = reduceWebviewMessage(store, wrap("host:ready", {}));
    assert.ok(reply);
    assert.strictEqual(reply!.type, "host:init");
    assert.strictEqual(reply!.source, MESSAGE_SOURCE);
    const payload = reply!.payload as {
      board: unknown;
      kv: Record<string, unknown>;
    };
    assert.ok(payload.board);
    assert.strictEqual(payload.kv["kanbeasy:nextCardNumber"], 1);
  });

  test("host:saveBoard replaces the store's board", () => {
    const store = new BoardStore(fakeMemento());
    const replacement = { columns: [], archive: [] };
    const reply = reduceWebviewMessage(
      store,
      wrap("host:saveBoard", { state: replacement }),
    );
    assert.strictEqual(reply, undefined);
    assert.deepStrictEqual(store.getBoard(), replacement);
  });

  test("host:kvSet and host:kvRemove update store kv", () => {
    const store = new BoardStore(fakeMemento());
    reduceWebviewMessage(
      store,
      wrap("host:kvSet", { key: "kanbeasy:theme", value: "dark" }),
    );
    assert.strictEqual(store.getKv()["kanbeasy:theme"], "dark");
    reduceWebviewMessage(
      store,
      wrap("host:kvRemove", { key: "kanbeasy:theme" }),
    );
    assert.strictEqual(store.getKv()["kanbeasy:theme"], undefined);
  });

  test("boardChangedMessage wraps current state and counter", () => {
    const store = new BoardStore(fakeMemento());
    store.addCard({ columnTitle: "To Do" }, { title: "x" });
    const msg = boardChangedMessage(store);
    assert.strictEqual(msg.type, "host:boardChanged");
    const payload = msg.payload as { state: unknown; nextCardNumber: number };
    assert.ok(payload.state);
    assert.strictEqual(payload.nextCardNumber, 2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit`
Expected: FAIL — `Cannot find module '../../webview/bridge'`.

- [ ] **Step 3: Implement `src/webview/bridge.ts`**

```ts
import type { BoardStore } from "../board/BoardStore";
import type { BoardState } from "../board/types";
import { MESSAGE_SOURCE, PROTOCOL_VERSION } from "../board/constants";

export interface BridgeMessage {
  source: string;
  protocolVersion?: number;
  type: string;
  payload?: unknown;
}

function wrap(type: string, payload: unknown): BridgeMessage {
  return {
    source: MESSAGE_SOURCE,
    protocolVersion: PROTOCOL_VERSION,
    type,
    payload,
  };
}

export function boardChangedMessage(store: BoardStore): BridgeMessage {
  return wrap("host:boardChanged", {
    state: store.getBoard(),
    nextCardNumber: store.getNextCardNumber(),
  });
}

/**
 * Apply an inbound webview message to the store. Returns a reply message to
 * post back to the webview, or undefined if there's nothing to send.
 */
export function reduceWebviewMessage(
  store: BoardStore,
  message: unknown,
): BridgeMessage | undefined {
  const msg = message as BridgeMessage | undefined;
  if (!msg || msg.source !== MESSAGE_SOURCE || typeof msg.type !== "string") {
    return undefined;
  }
  switch (msg.type) {
    case "host:ready":
      return wrap("host:init", store.getInitPayload());
    case "host:saveBoard":
      store.saveBoard((msg.payload as { state: BoardState }).state);
      return undefined;
    case "host:kvSet": {
      const { key, value } = msg.payload as { key: string; value: unknown };
      store.setKv(key, value);
      return undefined;
    }
    case "host:kvRemove": {
      const { key } = msg.payload as { key: string };
      store.removeKv(key);
      return undefined;
    }
    default:
      return undefined;
  }
}
```

Append the wiring helper (uses `vscode`; not unit-tested, exercised in Task 6):

```ts
import type * as vscode from "vscode";

/**
 * Wire a webview to the store: relay inbound messages through the reducer and
 * push host:boardChanged whenever the store changes. Returns a disposable.
 */
export function attachBridge(
  webview: vscode.Webview,
  store: BoardStore,
): { dispose(): void } {
  let applyingOutbound = false;
  const sub = webview.onDidReceiveMessage((message) => {
    const reply = reduceWebviewMessage(store, message);
    if (reply) {
      void webview.postMessage(reply);
    }
  });
  const off = store.onDidChangeBoard(() => {
    if (applyingOutbound) {
      return;
    }
    applyingOutbound = true;
    void webview.postMessage(boardChangedMessage(store));
    applyingOutbound = false;
  });
  return {
    dispose() {
      sub.dispose();
      off();
    },
  };
}
```

- [ ] **Step 4: Implement `src/webview/content.ts`**

```ts
const APP_URL = "https://darrenjaworski.github.io/kanbeasy/?host=vscode";

/**
 * Webview HTML: embeds the kanbeasy web app in host mode and relays bridge
 * messages between the VS Code webview API and the cross-origin iframe.
 * The extension host cannot postMessage the iframe directly; this in-page
 * relay bridges acquireVsCodeApi() <-> iframe.contentWindow.
 */
export function getWebviewContent(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>kanbeasy</title>
</head>
<body style="margin:0;padding:0;overflow:hidden;height:100vh;width:100vw;">
  <iframe id="app" src="${APP_URL}" style="border:none;width:100vw;height:100vh;"></iframe>
  <script>
    const vscode = acquireVsCodeApi();
    const iframe = document.getElementById('app');
    // iframe -> extension
    window.addEventListener('message', (event) => {
      const data = event.data;
      if (!data || data.source !== 'kanbeasy') { return; }
      if (event.source === iframe.contentWindow) {
        vscode.postMessage(data);
      } else {
        // extension -> iframe
        iframe.contentWindow && iframe.contentWindow.postMessage(data, '*');
      }
    });
  </script>
</body>
</html>`;
}
```

- [ ] **Step 5: Run unit tests + lint, then commit**

Run: `npm run test:unit` (PASS) and `npm run lint` (clean), then:

```bash
git add src/webview/bridge.ts src/webview/content.ts src/test/unit/bridge.test.ts
git commit -m "feat: add webview bridge and host-mode webview content"
```

---

## Task 6: Wire it all into the extension + provider registration

**Files:**

- Create: `src/mcp/provider.ts`
- Modify: `src/extension.ts`
- Modify: `package.json` (contributes)
- Test: `src/test/integration/mcp.test.ts`

- [ ] **Step 1: Implement `src/mcp/provider.ts`**

```ts
import * as vscode from "vscode";

/**
 * Registers the running MCP HTTP server with VS Code so Copilot can discover it.
 */
export function registerMcpProvider(
  context: vscode.ExtensionContext,
  getUrl: () => string | undefined,
): void {
  const didChange = new vscode.EventEmitter<void>();
  context.subscriptions.push(didChange);
  context.subscriptions.push(
    vscode.lm.registerMcpServerDefinitionProvider("kanbeasy.mcp", {
      onDidChangeMcpServerDefinitions: didChange.event,
      provideMcpServerDefinitions: async () => {
        const url = getUrl();
        if (!url) {
          return [];
        }
        return [
          new vscode.McpHttpServerDefinition({
            label: "Kanbeasy Board",
            uri: vscode.Uri.parse(url),
            version: "1.0.0",
          } as unknown as ConstructorParameters<
            typeof vscode.McpHttpServerDefinition
          >[0]),
        ];
      },
      resolveMcpServerDefinition: async (server) => server,
    }),
  );
  // Server URL becomes available after async start; fire once so VS Code re-queries.
  didChange.fire();
}
```

> Note: verify the `McpHttpServerDefinition` constructor against the installed `vscode.d.ts` (engines is `^1.103.0`, which has the finalized API). The cast keeps the build green if the exact options type name differs; replace it with the real options object once confirmed (`{ label, uri, version }`).

- [ ] **Step 2: Add the contribution point to `package.json`**

Under `contributes`, add:

```json
"mcpServerDefinitionProviders": [
  {
    "id": "kanbeasy.mcp",
    "label": "Kanbeasy Board"
  }
]
```

- [ ] **Step 3: Rewrite `src/extension.ts` to wire everything**

```ts
import * as vscode from "vscode";
import { BoardStore } from "./board/BoardStore";
import { startMcpServer, type RunningMcpServer } from "./mcp/server";
import { registerMcpProvider } from "./mcp/provider";
import { attachBridge } from "./webview/bridge";
import { getWebviewContent } from "./webview/content";

class KanbeasyTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }
  getChildren(): vscode.TreeItem[] {
    return [];
  }
}

let mcp: RunningMcpServer | undefined;

export async function activate(context: vscode.ExtensionContext) {
  const store = new BoardStore(context.globalState);

  // Start the in-process MCP server and register it with VS Code.
  mcp = await startMcpServer(store);
  registerMcpProvider(context, () => mcp?.url);

  const treeDataProvider = new KanbeasyTreeDataProvider();
  vscode.window.createTreeView("kanbeasyView", { treeDataProvider });

  let kanbanPanel: vscode.WebviewPanel | undefined;
  let bridge: { dispose(): void } | undefined;

  const toggleCommand = vscode.commands.registerCommand(
    "kanbeasy.toggleBoard",
    () => {
      if (kanbanPanel) {
        kanbanPanel.dispose();
        return;
      }
      kanbanPanel = vscode.window.createWebviewPanel(
        "kanbeasyBoard",
        "Kanbeasy",
        vscode.ViewColumn.One,
        { enableScripts: true, retainContextWhenHidden: true },
      );
      kanbanPanel.webview.html = getWebviewContent();
      bridge = attachBridge(kanbanPanel.webview, store);
      kanbanPanel.onDidDispose(
        () => {
          bridge?.dispose();
          bridge = undefined;
          kanbanPanel = undefined;
        },
        null,
        context.subscriptions,
      );
      vscode.commands.executeCommand("workbench.action.closeSidebar");
    },
  );
  context.subscriptions.push(toggleCommand);

  const openCommand = vscode.commands.registerCommand(
    "kanbeasy.openBoard",
    () => {
      vscode.commands.executeCommand("kanbeasy.toggleBoard");
    },
  );
  context.subscriptions.push(openCommand);

  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  statusBarItem.text = "Kanbeasy";
  statusBarItem.tooltip = "Toggle Kanbeasy Board";
  statusBarItem.command = "kanbeasy.toggleBoard";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);
}

export async function deactivate() {
  await mcp?.dispose();
  mcp = undefined;
}
```

- [ ] **Step 4: Write the integration smoke test**

Create `src/test/integration/mcp.test.ts`:

```ts
import * as assert from "assert";
import * as vscode from "vscode";

suite("MCP integration", () => {
  test("activates and registers the MCP provider contribution", async () => {
    const ext = vscode.extensions.getExtension("darrenjaworski.kanbeasy");
    assert.ok(ext, "extension not found");
    await ext!.activate();
    const contributes = ext!.packageJSON.contributes;
    const providers = contributes.mcpServerDefinitionProviders;
    assert.ok(
      Array.isArray(providers) &&
        providers.some((p: { id: string }) => p.id === "kanbeasy.mcp"),
      "kanbeasy.mcp provider not contributed",
    );
  });

  test("toggleBoard command is registered", async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes("kanbeasy.toggleBoard"));
  });
});
```

- [ ] **Step 5: Build and run integration tests**

Run: `npm run compile`
Expected: clean build.

Run: `npm test`
Expected: the Electron VS Code host launches; both integration tests pass. (If the host cannot download VS Code in this environment, report it — the build + unit suites are the primary gates.)

- [ ] **Step 6: Commit**

```bash
git add src/mcp/provider.ts src/extension.ts package.json src/test/integration/mcp.test.ts
git commit -m "feat: wire MCP server, provider, and webview bridge into the extension"
```

---

## Task 7: Verification, docs, packaging

**Files:**

- Modify: `CHANGELOG.md`, `README.md`

- [ ] **Step 1: Full verification**

Run: `npm run test:unit` → all unit suites pass.
Run: `npm run compile` → type-check, lint, esbuild bundle all succeed.
Run: `npm test` → integration suite passes (or report environment limitation).

- [ ] **Step 2: Package smoke**

Run: `npm run vsce-package`
Expected: a `.vsix` is produced without errors (confirms the bundled SDK is included and packaging is valid).

- [ ] **Step 3: Update `CHANGELOG.md`**

Add a new dated entry near the top (match the file's existing heading style):

```markdown
## [Unreleased]

### Added

- **MCP server for Copilot**: the extension now runs an in-process MCP server so GitHub Copilot can read and edit your board (cards and columns) whether or not the board panel is open. The extension owns board state (`globalState`); deletes archive (recoverable). New board data is synced live with an open panel.
```

- [ ] **Step 4: Update `README.md`**

Add a short "Copilot / MCP integration" section describing: the extension exposes a "Kanbeasy Board" MCP server discovered automatically in Copilot agent mode; available actions (add/update/move/archive/restore cards; add/rename/remove columns); deletes archive rather than destroy; board is global across workspaces.

- [ ] **Step 5: Commit**

```bash
git add CHANGELOG.md README.md
git commit -m "docs: changelog and readme for MCP Copilot integration"
```

---

## Self-Review Notes

- **Spec coverage:** `BoardStore`/globalState source of truth (Task 2) → spec "extension owns the data"; in-process HTTP MCP server + `McpHttpServerDefinition` (Tasks 4, 6) → spec MCP transport decision; full tool surface incl. columns, archive-on-delete, `remove_column` archives first, cards-by-number (Task 3) → spec tool table; webview bridge + host-mode content + relay (Task 5) → spec webview bridge & HTML change; live push on change (Task 5 `attachBridge`) → spec data-flow "board open"; works-when-closed (MCP handlers hit `BoardStore` directly, no webview) → spec goal. Excluded `reset_board`/`clear_archive`/permanent delete are simply not in `tools` (Task 3).
- **Deferred items carried from the web-app review** (tracked, intentionally not blocking): the extension reliably sends `host:init` on `host:ready` (Task 5 reducer), satisfying the web app's dependence; `nextCardNumber` IS persisted host-side (counter lives in `globalState` kv, advanced by `BoardStore.addCard`); inbound `protocolVersion` validation remains light (the reducer checks `source` + `type`) — acceptable for a trusted same-author bridge.
- **Type consistency:** `MementoLike`, `ColumnRef`, `InitPayload`, `ToolDef`/`ToolResult`, `BridgeMessage`, `RunningMcpServer` are defined once and reused across tasks. Tool names in the Task 3 test list exactly match the `tools` array.
- **Known adaptation points (third-party API, version-sensitive):** the MCP SDK import specifiers / `registerTool` signature (Task 4 Step 2) and the `McpHttpServerDefinition` constructor options (Task 6 Step 1) must be confirmed against the installed `.d.ts`; both tasks call this out with the exact contract to satisfy and a build/integration gate that catches drift.
