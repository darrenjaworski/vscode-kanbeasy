import * as assert from "assert";
import { BoardStore, type MementoLike } from "../../board/BoardStore";
import {
  reduceWebviewMessage,
  boardChangedMessage,
  type BridgeMessage,
  type ClipboardLike,
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

/** Assert the reducer replied synchronously and return the message. */
function syncReply(
  reply: ReturnType<typeof reduceWebviewMessage>,
): BridgeMessage {
  assert.ok(reply, "expected a reply");
  assert.ok(!(reply instanceof Promise), "expected a synchronous reply");
  return reply;
}

function fakeClipboard(initialText = ""): ClipboardLike & {
  written: string[];
} {
  const written: string[] = [];
  return {
    written,
    readText: () => Promise.resolve(initialText),
    writeText: (value: string) => {
      written.push(value);
      return Promise.resolve();
    },
  };
}

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
    const reply = syncReply(
      reduceWebviewMessage(store, wrap("host:ready", {})),
    );
    assert.strictEqual(reply.type, "host:init");
    assert.strictEqual(reply.source, MESSAGE_SOURCE);
    const payload = reply.payload as {
      board: unknown;
      kv: Record<string, unknown>;
      isFirstRun: boolean;
      capabilities: { clipboard: boolean };
    };
    assert.ok(payload.board);
    assert.strictEqual(payload.kv["kanbeasy:nextCardNumber"], 1);
    assert.strictEqual(payload.isFirstRun, true); // ← add this assertion
    assert.strictEqual(
      payload.capabilities.clipboard,
      false,
      "host:init must not advertise clipboard when no clipboard impl is attached",
    );
  });

  test("host:init advertises clipboard capability when a clipboard is attached", () => {
    const store = new BoardStore(fakeMemento());
    const reply = syncReply(
      reduceWebviewMessage(store, wrap("host:ready", {}), fakeClipboard()),
    );
    const payload = reply.payload as { capabilities: { clipboard: boolean } };
    assert.strictEqual(payload.capabilities.clipboard, true);
  });

  test("host:clipboard:write writes to the host clipboard", () => {
    const store = new BoardStore(fakeMemento());
    const clipboard = fakeClipboard();
    const reply = reduceWebviewMessage(
      store,
      wrap("host:clipboard:write", { text: "hello" }),
      clipboard,
    );
    assert.strictEqual(reply, undefined);
    assert.deepStrictEqual(clipboard.written, ["hello"]);
  });

  test("host:clipboard:read replies with the clipboard text and requestId", async () => {
    const store = new BoardStore(fakeMemento());
    const reply = await reduceWebviewMessage(
      store,
      wrap("host:clipboard:read", { requestId: "r1" }),
      fakeClipboard("pasted text"),
    );
    assert.ok(reply);
    assert.strictEqual(reply!.type, "host:clipboard:readResult");
    assert.deepStrictEqual(reply!.payload, {
      requestId: "r1",
      text: "pasted text",
    });
  });

  test("host:clipboard:read replies with empty text when the read fails", async () => {
    const store = new BoardStore(fakeMemento());
    const failing: ClipboardLike = {
      readText: () => Promise.reject(new Error("denied")),
      writeText: () => Promise.resolve(),
    };
    const reply = await reduceWebviewMessage(
      store,
      wrap("host:clipboard:read", { requestId: "r2" }),
      failing,
    );
    assert.ok(reply, "must reply even on failure so the app doesn't hang");
    assert.deepStrictEqual(reply!.payload, { requestId: "r2", text: "" });
  });

  test("clipboard messages are ignored when no clipboard is attached", () => {
    const store = new BoardStore(fakeMemento());
    assert.strictEqual(
      reduceWebviewMessage(store, wrap("host:clipboard:write", { text: "x" })),
      undefined,
    );
    assert.strictEqual(
      reduceWebviewMessage(
        store,
        wrap("host:clipboard:read", { requestId: "r" }),
      ),
      undefined,
    );
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

  test("migration round-trip: isFirstRun:true on fresh store, host:saveBoard persists board, isFirstRun:false on reopen", () => {
    const mem = fakeMemento();
    const store = new BoardStore(mem);

    // First open: fresh globalState → isFirstRun:true in host:init
    const initReply = syncReply(
      reduceWebviewMessage(store, wrap("host:ready", {})),
    );
    const initPayload = initReply.payload as {
      board: unknown;
      kv: Record<string, unknown>;
      isFirstRun: boolean;
    };
    assert.strictEqual(initPayload.isFirstRun, true);

    // Web app detects isFirstRun, reads IDB, sends migrated board back
    const migratedBoard = {
      columns: [
        { id: "c1", title: "Backlog", cards: [], createdAt: 1, updatedAt: 1 },
      ],
      archive: [],
    };
    reduceWebviewMessage(
      store,
      wrap("host:saveBoard", { state: migratedBoard }),
    );

    // Extension persisted the migrated board
    assert.deepStrictEqual(store.getBoard(), migratedBoard);

    // Second open (new BoardStore from same memento): isFirstRun:false — migration won't run again
    const store2 = new BoardStore(mem);
    assert.strictEqual(store2.getInitPayload().isFirstRun, false);
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
