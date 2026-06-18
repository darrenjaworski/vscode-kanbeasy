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
