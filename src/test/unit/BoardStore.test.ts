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

  test("moveCard reorders within the same column at a given position", () => {
    const store = new BoardStore(fakeMemento());
    const todo = store.getBoard().columns[0];
    const a = store.addCard({ columnId: todo.id }, { title: "a" });
    const b = store.addCard({ columnId: todo.id }, { title: "b" });
    const c = store.addCard({ columnId: todo.id }, { title: "c" });
    // Move c to the front of its own column.
    store.moveCard(c.number, { columnId: todo.id }, 0);
    const cards = store.getBoard().columns[0].cards;
    assert.deepStrictEqual(
      cards.map((card) => card.id),
      [c.id, a.id, b.id],
    );
  });

  test("moveCard clamps an out-of-range position to the end", () => {
    const store = new BoardStore(fakeMemento());
    const [todo, , done] = store.getBoard().columns;
    store.addCard({ columnId: done.id }, { title: "first" });
    const mover = store.addCard({ columnId: todo.id }, { title: "mover" });
    store.moveCard(mover.number, { columnId: done.id }, 999);
    const cards = store.getBoard().columns[2].cards;
    assert.strictEqual(cards[cards.length - 1].id, mover.id);
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

  test("getInitPayload includes isFirstRun:true when no board was in globalState", () => {
    const store = new BoardStore(fakeMemento());
    const payload = store.getInitPayload();
    assert.strictEqual(payload.isFirstRun, true);
  });

  test("getInitPayload includes isFirstRun:false when board already existed in globalState", () => {
    const mem = fakeMemento();
    // Pre-populate globalState with a board (simulates pre-existing data)
    const existingBoard = { columns: [], archive: [] };
    mem.update("kanbeasy.board", existingBoard);
    const store = new BoardStore(mem);
    const payload = store.getInitPayload();
    assert.strictEqual(payload.isFirstRun, false);
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
