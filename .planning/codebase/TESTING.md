# Testing Patterns

**Analysis Date:** 2026-06-29

## Test Framework

**Runner:**

- Mocha 11.7.6 (TDD-style)
- Config: `.mocharc.json` with `"ui": "tdd"`

**Assertion Library:**

- Node.js built-in `assert` module
- Methods: `strictEqual()`, `deepStrictEqual()`, `ok()`, `throws()`, `doesNotThrow()`

**VS Code Integration:**

- `@vscode/test-electron` 3.0.0 for integration/e2e tests
- `@vscode/test-cli` 0.0.15 for test orchestration

**Run Commands:**

```bash
npm run test              # Run all tests via vscode-test (integration + unit)
npm run test:unit        # Run unit tests only with mocha
npm run pretest           # Compile, type-check, lint, then run tests
npm run compile-tests     # Compile test files to out/
npm run watch-tests       # Watch and recompile test files
```

## Test File Organization

**Location:**

- Unit tests: `src/test/unit/`
- Integration tests: `src/test/integration/`
- Test discovery: Compiled tests run from `out/test/` directory

**Naming:**

- Pattern: `{module}.test.ts`
- Examples: `BoardStore.test.ts`, `bridge.test.ts`, `content.test.ts`, `extension.test.ts`

**Structure:**

```
src/test/
├── unit/
│   ├── BoardStore.test.ts      # Store logic (mutations, state)
│   ├── bridge.test.ts          # Message protocol and state sync
│   ├── content.test.ts         # Webview HTML generation
│   ├── contract.test.ts        # Protocol compatibility
│   └── tools.test.ts           # MCP tool definitions
└── integration/
    ├── extension.test.ts       # Extension lifecycle (activate/deactivate)
    └── mcp.test.ts             # MCP server integration
```

## Test Structure

**Suite Organization:**
Uses Mocha's TDD-style API:

```typescript
suite("BoardStore", () => {
  test("seeds a default board with three columns and counter 1", () => {
    const store = new BoardStore(fakeMemento());
    const board = store.getBoard();
    assert.deepStrictEqual(
      board.columns.map((c) => c.title),
      ["To Do", "In Progress", "Done"],
    );
  });

  test("addCard appends a numbered card and advances the counter", () => {
    const store = new BoardStore(fakeMemento());
    const todo = store.getBoard().columns[0];
    const card = store.addCard({ columnId: todo.id }, { title: "Write tests" });
    assert.strictEqual(card.number, 1);
    assert.strictEqual(store.getNextCardNumber(), 2);
  });
});
```

**Setup:**

- No `beforeEach`/`afterEach` hooks — each test creates fresh instances
- Prevents test pollution and makes dependencies explicit
- Fresh `fakeMemento()` created per test

**Teardown:**

- Resource cleanup via disposal methods (e.g., `activeBridge?.dispose()`)
- No explicit teardown hooks — relies on instance scoping

**Assertion Patterns:**

```typescript
// Value equality
assert.strictEqual(card.number, 1);

// Object deep equality
assert.deepStrictEqual(board.columns[0].cards[0].id, card.id);

// Truthiness
assert.ok(updated.updatedAt >= card.updatedAt);

// Error conditions
assert.throws(() => store.addCard({ columnTitle: "Nope" }, { title: "x" }));

// Non-throwing operations
assert.doesNotThrow(
  () => reduceWebviewMessage(store, wrap(type, payload)),
  `bridge must handle "${type}" without throwing`,
);
```

## Mocking

**Framework:** Manual mocking with helper functions — no external mocking library

**Patterns:**

```typescript
// src/test/unit/BoardStore.test.ts
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

// src/test/unit/bridge.test.ts
const wrap = (type: string, payload: unknown) => ({
  source: MESSAGE_SOURCE,
  protocolVersion: PROTOCOL_VERSION,
  type,
  payload,
});
```

**What to Mock:**

- VS Code extension APIs (Memento, Webview messaging)
- External dependencies with side effects
- Protocol adapters (wrap function for bridge messages)

**What NOT to Mock:**

- Core domain logic (BoardStore mutations)
- Type-safe operations (rely on TypeScript and assertions)
- Contract compliance (verify exact behavior with real objects)

## Fixtures and Factories

**Test Data:**
Helper functions create reusable test objects:

```typescript
// Create fake storage
function fakeMemento(): MementoLike { ... }

// Create message wrappers with protocol constants
const wrap = (type: string, payload: unknown) => ({ ... })

// Domain objects created in-situ for each test
const store = new BoardStore(fakeMemento());
const card = store.addCard({ columnId: todo.id }, { title: "Write tests" });
```

**Location:** Inline in test files — no separate factory modules

**Reuse Pattern:** Helper functions exported within test files or small helper utils

## Coverage

**Requirements:** None enforced

**View Coverage:**

```bash
npm run test  # Run all tests
```

## Test Types

**Unit Tests (src/test/unit/):**

- Scope: Individual functions and classes
- Tests: BoardStore (mutations, state persistence), bridge (message protocol), content (HTML generation), tools (MCP definitions)
- Pattern: Isolated, fast, no external dependencies
- Example: `BoardStore.test.ts` tests 13 scenarios covering addCard, moveCard, archiveCard, column management

**Integration Tests (src/test/integration/):**

- Scope: Extension lifecycle and MCP server behavior
- Tests: Extension activation/deactivation, MCP server HTTP handling
- Pattern: May use real VS Code APIs
- Example: `extension.test.ts` verifies activation flow with real vscode module

**E2E Tests:** Not currently used

## Common Patterns

**Async Testing:**
Tests use `async/await` within test bodies:

```typescript
test("startMcpServer creates an HTTP listener", async () => {
  const mcp = await startMcpServer(store);
  assert.ok(mcp.url);
  await mcp.dispose();
});
```

**Error Testing:**

```typescript
test("addCard throws when the column cannot be resolved", () => {
  const store = new BoardStore(fakeMemento());
  assert.throws(() => store.addCard({ columnTitle: "Nope" }, { title: "x" }));
});
```

**State Verification Across Instances:**
Tests verify persistence by creating new instances from the same backing store:

```typescript
test("fires onDidChangeBoard after a mutation and persists across instances", () => {
  const memento = fakeMemento();
  const store = new BoardStore(memento);
  let fired = 0;
  store.onDidChangeBoard(() => (fired += 1));
  const todo = store.getBoard().columns[0];
  store.addCard({ columnId: todo.id }, { title: "persist" });
  assert.strictEqual(fired, 1);

  const reloaded = new BoardStore(memento);
  assert.strictEqual(reloaded.getBoard().columns[0].cards[0].title, "persist");
});
```

**Contract Testing:**
Protocol compatibility is verified with named test suites:

```typescript
// src/test/unit/contract.test.ts
suite("bridge contract", () => {
  test("matches the web app hostBridge constants", () => {
    assert.strictEqual(MESSAGE_SOURCE, "kanbeasy");
    assert.strictEqual(PROTOCOL_VERSION, 1);
  });

  test("host:init payload always contains board, kv, and isFirstRun", () => {
    // Verify shape of protocol message
    const reply = reduceWebviewMessage(store, wrap("host:ready", {}));
    assert.ok(reply, "host:ready must produce a reply");
    const payload = reply!.payload as Record<string, unknown>;
    assert.ok("board" in payload);
    assert.ok("kv" in payload);
    assert.ok("isFirstRun" in payload);
  });
});
```

**Round-Trip Testing:**
Verifies data persists and migrations work correctly:

```typescript
test("migration round-trip: isFirstRun:true on fresh store, host:saveBoard persists board, isFirstRun:false on reopen", () => {
  const mem = fakeMemento();
  const store = new BoardStore(mem);

  // First open: fresh globalState → isFirstRun:true in host:init
  const initReply = reduceWebviewMessage(store, wrap("host:ready", {}));
  const initPayload = initReply!.payload as { isFirstRun: boolean };
  assert.strictEqual(initPayload.isFirstRun, true);

  // Web app detects isFirstRun, reads IDB, sends migrated board back
  const migratedBoard = { columns: [...], archive: [] };
  reduceWebviewMessage(
    store,
    wrap("host:saveBoard", { state: migratedBoard }),
  );

  // Second open (new BoardStore from same memento): isFirstRun:false
  const store2 = new BoardStore(mem);
  assert.strictEqual(store2.getInitPayload().isFirstRun, false);
});
```

---

_Testing analysis: 2026-06-29_
