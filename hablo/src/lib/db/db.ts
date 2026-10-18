import type { TableName, Tables } from "./types";

/**
 * Minimal, typed data-access API shared by the Supabase implementation
 * (production) and the local JSON store (clearly labelled demo mode + tests).
 * Learning logic is written against this interface only.
 */
export type Op = "eq" | "neq" | "in" | "lt" | "lte" | "gt" | "gte" | "is" | "contains";
export interface Filter {
  col: string;
  op: Op;
  value: unknown;
}
export interface Query {
  where?: Filter[];
  order?: { col: string; asc?: boolean }[];
  limit?: number;
}
export type Row<T extends TableName> = Tables[T];
export type Insert<T extends TableName> = Partial<Tables[T]>;

export interface Db {
  readonly kind: "supabase" | "local";
  select<T extends TableName>(table: T, q?: Query): Promise<Row<T>[]>;
  insert<T extends TableName>(table: T, rows: Insert<T> | Insert<T>[]): Promise<Row<T>[]>;
  /** Insert or update on the given conflict columns (defaults to the primary key). */
  upsert<T extends TableName>(
    table: T,
    rows: Insert<T> | Insert<T>[],
    opts?: { onConflict?: string[]; ignoreDuplicates?: boolean },
  ): Promise<Row<T>[]>;
  update<T extends TableName>(table: T, where: Filter[], patch: Insert<T>): Promise<Row<T>[]>;
  remove<T extends TableName>(table: T, where: Filter[]): Promise<number>;
  count<T extends TableName>(table: T, where?: Filter[]): Promise<number>;
}

export const eq = (col: string, value: unknown): Filter => ({ col, op: "eq", value });
export const neq = (col: string, value: unknown): Filter => ({ col, op: "neq", value });
export const inList = (col: string, value: unknown[]): Filter => ({ col, op: "in", value });
export const lt = (col: string, value: unknown): Filter => ({ col, op: "lt", value });
export const lte = (col: string, value: unknown): Filter => ({ col, op: "lte", value });
export const gt = (col: string, value: unknown): Filter => ({ col, op: "gt", value });
export const gte = (col: string, value: unknown): Filter => ({ col, op: "gte", value });
export const isNull = (col: string): Filter => ({ col, op: "is", value: null });
export const contains = (col: string, value: unknown): Filter => ({ col, op: "contains", value });

export async function first<T extends TableName>(db: Db, table: T, q: Query): Promise<Row<T> | null> {
  const rows = await db.select(table, { ...q, limit: 1 });
  return rows[0] ?? null;
}
