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
  isFirstRun: boolean;
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
  private readonly isFirstRun: boolean;
  private readonly listeners = new Set<Listener>();

  constructor(private readonly memento: MementoLike) {
    const existingBoard = memento.get<BoardState>(GLOBAL_BOARD_KEY);
    this.isFirstRun = existingBoard === undefined;
    this.board = existingBoard ?? createDefaultBoard();
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
    return { board: this.board, kv: this.kv, isFirstRun: this.isFirstRun };
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
