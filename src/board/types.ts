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
