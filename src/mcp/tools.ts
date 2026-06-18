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
// Canonical UUID shape — narrow enough that a real column title is unlikely to
// be misread as an id. A title that happens to be a valid UUID would still be
// treated as an id (acceptable trade-off for an SDK-free heuristic).
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function columnRef(value: unknown): ColumnRef {
  const s = String(value);
  // Heuristic: a UUID-looking value is treated as an id, otherwise a title.
  return UUID_RE.test(s) ? { columnId: s } : { columnTitle: s };
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
