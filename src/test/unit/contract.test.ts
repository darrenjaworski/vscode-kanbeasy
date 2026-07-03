import * as assert from "assert";
import {
  MESSAGE_SOURCE,
  PROTOCOL_VERSION,
  NEXT_CARD_NUMBER_KEY,
} from "../../board/constants";
import { BoardStore, type MementoLike } from "../../board/BoardStore";
import {
  reduceWebviewMessage,
  type BridgeMessage,
  type ClipboardLike,
} from "../../webview/bridge";

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

suite("bridge contract", () => {
  test("matches the web app hostBridge constants", () => {
    assert.strictEqual(MESSAGE_SOURCE, "kanbeasy");
    assert.strictEqual(PROTOCOL_VERSION, 1);
    assert.strictEqual(NEXT_CARD_NUMBER_KEY, "kanbeasy:nextCardNumber");
  });

  test("host:init payload always contains board, kv, isFirstRun, and capabilities", () => {
    const store = new BoardStore(fakeMemento());
    const raw = reduceWebviewMessage(store, wrap("host:ready", {}));
    assert.ok(raw, "host:ready must produce a reply");
    assert.ok(!(raw instanceof Promise), "host:init must be synchronous");
    const reply = raw as BridgeMessage;
    assert.strictEqual(reply.type, "host:init");
    const payload = reply.payload as Record<string, unknown>;
    assert.ok("board" in payload, "host:init payload must include board");
    assert.ok("kv" in payload, "host:init payload must include kv");
    assert.ok(
      "isFirstRun" in payload,
      "host:init payload must include isFirstRun — web app depends on it for migration",
    );
    assert.ok(
      "capabilities" in payload,
      "host:init payload must include capabilities — web app gates its clipboard bridge on capabilities.clipboard",
    );
  });

  test("all inbound message types the bridge handles are exercised without throwing", () => {
    // This list documents the protocol surface. Add here when adding a new message type.
    const cases: Array<[string, unknown]> = [
      ["host:ready", {}],
      ["host:saveBoard", { state: { columns: [], archive: [] } }],
      ["host:kvSet", { key: "k", value: "v" }],
      ["host:kvRemove", { key: "k" }],
      ["host:clipboard:write", { text: "t" }],
      ["host:clipboard:read", { requestId: "r" }],
    ];
    const clipboard: ClipboardLike = {
      readText: () => Promise.resolve(""),
      writeText: () => Promise.resolve(),
    };
    const store = new BoardStore(fakeMemento());
    for (const [type, payload] of cases) {
      assert.doesNotThrow(
        () => reduceWebviewMessage(store, wrap(type, payload), clipboard),
        `bridge must handle "${type}" without throwing`,
      );
    }
  });
});
