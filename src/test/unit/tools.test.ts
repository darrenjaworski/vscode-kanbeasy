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

  test("update_card clears dueDate when passed null", () => {
    const store = new BoardStore(fakeMemento());
    byName("add_card").handler(store, {
      column: "To Do",
      title: "Has a due date",
      dueDate: "2026-07-01",
    });
    assert.strictEqual(
      store.getBoard().columns[0].cards[0].dueDate,
      "2026-07-01",
    );
    const res = byName("update_card").handler(store, {
      number: 1,
      dueDate: null,
    });
    assert.ok(!res.isError);
    assert.strictEqual(store.getBoard().columns[0].cards[0].dueDate, null);
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
