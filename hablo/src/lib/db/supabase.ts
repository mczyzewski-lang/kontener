import type { SupabaseClient } from "@supabase/supabase-js";
import type { Db, Filter, Insert, Query, Row } from "./db";
import { TABLE_META, type TableName } from "./types";

/** Db implementation backed by Supabase PostgREST. RLS scopes every query to the signed-in user. */

const PAGE = 1000;

// The builder types of supabase-js are very deep generics; we only rely on the
// documented filter methods, so a narrow structural type keeps this file simple.
interface Builder {
  eq(c: string, v: unknown): Builder;
  neq(c: string, v: unknown): Builder;
  in(c: string, v: unknown[]): Builder;
  lt(c: string, v: unknown): Builder;
  lte(c: string, v: unknown): Builder;
  gt(c: string, v: unknown): Builder;
  gte(c: string, v: unknown): Builder;
  is(c: string, v: null): Builder;
  contains(c: string, v: unknown[]): Builder;
  order(c: string, o: { ascending: boolean }): Builder;
  range(from: number, to: number): Builder;
  limit(n: number): Builder;
  select(cols?: string): Builder;
  then: PromiseLike<{ data: unknown; error: { message: string } | null; count?: number | null }>["then"];
}

function applyFilters(b: Builder, where: Filter[] = []): Builder {
  for (const f of where) {
    switch (f.op) {
      case "eq":
        b = b.eq(f.col, f.value);
        break;
      case "neq":
        b = b.neq(f.col, f.value);
        break;
      case "in":
        b = b.in(f.col, f.value as unknown[]);
        break;
      case "lt":
        b = b.lt(f.col, f.value);
        break;
      case "lte":
        b = b.lte(f.col, f.value);
        break;
      case "gt":
        b = b.gt(f.col, f.value);
        break;
      case "gte":
        b = b.gte(f.col, f.value);
        break;
      case "is":
        b = b.is(f.col, null);
        break;
      case "contains":
        b = b.contains(f.col, Array.isArray(f.value) ? f.value : [f.value]);
        break;
    }
  }
  return b;
}

async function run<T>(b: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await b;
  if (error) throw new Error(error.message);
  return data as T;
}

export class SupabaseDb implements Db {
  readonly kind = "supabase" as const;
  constructor(private client: SupabaseClient) {}

  private from(t: TableName) {
    return this.client.from(t) as unknown as {
      select(cols?: string, opts?: { count?: "exact"; head?: boolean }): Builder;
      insert(rows: unknown): Builder;
      upsert(rows: unknown, opts: { onConflict: string; ignoreDuplicates?: boolean }): Builder;
      update(patch: unknown): Builder;
      delete(opts?: { count?: "exact" }): Builder;
    };
  }

  async select<T extends TableName>(t: T, q: Query = {}): Promise<Row<T>[]> {
    const build = () => {
      let b = applyFilters(this.from(t).select("*"), q.where);
      for (const o of q.order ?? []) b = b.order(o.col, { ascending: o.asc !== false });
      return b;
    };
    if (q.limit !== undefined) return run<Row<T>[]>(build().limit(q.limit));
    // PostgREST caps responses (1000 rows by default): page through everything.
    const out: Row<T>[] = [];
    for (let from = 0; ; from += PAGE) {
      const page = await run<Row<T>[]>(build().range(from, from + PAGE - 1));
      out.push(...page);
      if (page.length < PAGE) break;
    }
    return out;
  }

  async insert<T extends TableName>(t: T, rows: Insert<T> | Insert<T>[]): Promise<Row<T>[]> {
    return run<Row<T>[]>(this.from(t).insert(rows).select());
  }

  async upsert<T extends TableName>(
    t: T,
    rows: Insert<T> | Insert<T>[],
    opts: { onConflict?: string[]; ignoreDuplicates?: boolean } = {},
  ): Promise<Row<T>[]> {
    const onConflict = (opts.onConflict ?? TABLE_META[t].pk).join(",");
    return run<Row<T>[]>(
      this.from(t).upsert(rows, { onConflict, ignoreDuplicates: opts.ignoreDuplicates }).select(),
    );
  }

  async update<T extends TableName>(t: T, where: Filter[], patch: Insert<T>): Promise<Row<T>[]> {
    if (!where.length) throw new Error("Refusing unfiltered update");
    return run<Row<T>[]>(applyFilters(this.from(t).update(patch), where).select());
  }

  async remove<T extends TableName>(t: T, where: Filter[]): Promise<number> {
    if (!where.length) throw new Error("Refusing unfiltered delete");
    const res = await applyFilters(this.from(t).delete({ count: "exact" }), where);
    if (res.error) throw new Error(res.error.message);
    return res.count ?? 0;
  }

  async count<T extends TableName>(t: T, where: Filter[] = []): Promise<number> {
    const res = await applyFilters(this.from(t).select("*", { count: "exact", head: true }), where);
    if (res.error) throw new Error(res.error.message);
    return res.count ?? 0;
  }
}
