import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import type { Db, Filter, Insert, Query, Row } from "./db";
import { TABLE_META, type TableName } from "./types";

/**
 * Db implementation for a plain PostgreSQL database (e.g. Railway Postgres).
 * The app is the only client of this database, so there is no RLS: every
 * user-owned query is filtered by user_id in the learning code, exactly as
 * with the Supabase service role.
 */

// Return the same JSON shapes as Supabase/PostgREST: ISO timestamps as
// strings, dates as YYYY-MM-DD, numeric and bigint as numbers.
const types = {
  getTypeParser(oid: number, format?: "text" | "binary") {
    if (oid === 1184 || oid === 1114) return (v: string) => new Date(oid === 1114 ? `${v}Z` : v).toISOString();
    if (oid === 1082) return (v: string) => v;
    if (oid === 1700 || oid === 20) return (v: string) => Number(v);
    return pg.types.getTypeParser(oid, format);
  },
} as pg.CustomTypesConfig;

const IDENT = /^[a-z_][a-z0-9_]*$/;
function ident(name: string): string {
  if (!IDENT.test(name)) throw new Error(`Invalid identifier: ${name}`);
  return `"${name}"`;
}

type ColumnTypes = Map<string, Map<string, string>>; // table -> column -> udt_name

export interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
}

export class PostgresDb implements Db {
  readonly kind = "postgres" as const;
  private columns: Promise<ColumnTypes> | null = null;
  constructor(private client: Queryable) {}

  private colTypes(): Promise<ColumnTypes> {
    this.columns ??= this.client
      .query("select table_name, column_name, udt_name from information_schema.columns where table_schema = 'public'")
      .then(({ rows }) => {
        const m: ColumnTypes = new Map();
        for (const r of rows) {
          const t = r.table_name as string;
          if (!m.has(t)) m.set(t, new Map());
          m.get(t)!.set(r.column_name as string, r.udt_name as string);
        }
        return m;
      });
    return this.columns;
  }

  /** jsonb values are sent as JSON text; Postgres arrays and scalars as-is. */
  private async encode(t: TableName, col: string, value: unknown): Promise<unknown> {
    const type = (await this.colTypes()).get(t)?.get(col);
    if (!type) throw new Error(`Unknown column ${t}.${col}`);
    if (value === undefined || value === null) return null;
    return type === "jsonb" || type === "json" ? JSON.stringify(value) : value;
  }

  private async where(t: TableName, filters: Filter[] = [], params: unknown[]): Promise<string> {
    const parts: string[] = [];
    for (const f of filters) {
      const c = ident(f.col);
      const p = () => `$${params.length}`;
      switch (f.op) {
        case "is":
          parts.push(`${c} is null`);
          break;
        case "eq":
        case "neq":
          if (f.value === null || f.value === undefined) {
            parts.push(`${c} is ${f.op === "eq" ? "" : "not "}null`);
            break;
          }
          params.push(await this.encode(t, f.col, f.value));
          parts.push(`${c} ${f.op === "eq" ? "=" : "<>"} ${p()}`);
          break;
        case "in":
          params.push(f.value as unknown[]);
          parts.push(`${c} = any(${p()})`);
          break;
        case "lt":
        case "lte":
        case "gt":
        case "gte":
          params.push(await this.encode(t, f.col, f.value));
          parts.push(`${c} ${{ lt: "<", lte: "<=", gt: ">", gte: ">=" }[f.op]} ${p()}`);
          break;
        case "contains":
          params.push(await this.encode(t, f.col, Array.isArray(f.value) ? f.value : [f.value]));
          parts.push(`${c} @> ${p()}`);
          break;
      }
    }
    return parts.length ? ` where ${parts.join(" and ")}` : "";
  }

  async select<T extends TableName>(t: T, q: Query = {}): Promise<Row<T>[]> {
    const params: unknown[] = [];
    let sql = `select * from ${ident(t)}${await this.where(t, q.where, params)}`;
    if (q.order?.length) sql += ` order by ${q.order.map((o) => `${ident(o.col)} ${o.asc === false ? "desc" : "asc"}`).join(", ")}`;
    if (q.limit !== undefined) sql += ` limit ${Math.max(0, Math.floor(q.limit))}`;
    return (await this.client.query(sql, params)).rows as unknown as Row<T>[];
  }

  /** Rows with different column sets are written in separate statements. */
  private async writeRows<T extends TableName>(t: T, input: Insert<T> | Insert<T>[], tail: (cols: string[]) => string): Promise<Row<T>[]> {
    const rows = (Array.isArray(input) ? input : [input]).map((r) =>
      Object.fromEntries(Object.entries(r as Record<string, unknown>).filter(([, v]) => v !== undefined)),
    );
    const groups = new Map<string, Record<string, unknown>[]>();
    for (const r of rows) {
      const key = Object.keys(r).sort().join(",");
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    const out: Row<T>[] = [];
    for (const [key, group] of groups) {
      const cols = key ? key.split(",") : [];
      for (let i = 0; i < group.length; i += 500) {
        const chunk = group.slice(i, i + 500);
        const params: unknown[] = [];
        let sql: string;
        if (!cols.length) {
          sql = `insert into ${ident(t)} default values`;
        } else {
          const values: string[] = [];
          for (const r of chunk) {
            const ph: string[] = [];
            for (const c of cols) {
              params.push(await this.encode(t, c, r[c]));
              ph.push(`$${params.length}`);
            }
            values.push(`(${ph.join(", ")})`);
          }
          sql = `insert into ${ident(t)} (${cols.map(ident).join(", ")}) values ${values.join(", ")}`;
        }
        out.push(...((await this.client.query(`${sql}${tail(cols)} returning *`, params)).rows as unknown as Row<T>[]));
      }
    }
    return out;
  }

  async insert<T extends TableName>(t: T, rows: Insert<T> | Insert<T>[]): Promise<Row<T>[]> {
    return this.writeRows(t, rows, () => "");
  }

  async upsert<T extends TableName>(
    t: T,
    rows: Insert<T> | Insert<T>[],
    opts: { onConflict?: string[]; ignoreDuplicates?: boolean } = {},
  ): Promise<Row<T>[]> {
    const target = (opts.onConflict ?? TABLE_META[t].pk).map(ident).join(", ");
    return this.writeRows(t, rows, (cols) => {
      const set = cols.filter((c) => !(opts.onConflict ?? TABLE_META[t].pk).includes(c));
      if (opts.ignoreDuplicates || !set.length) return ` on conflict (${target}) do nothing`;
      return ` on conflict (${target}) do update set ${set.map((c) => `${ident(c)} = excluded.${ident(c)}`).join(", ")}`;
    });
  }

  async update<T extends TableName>(t: T, where: Filter[], patch: Insert<T>): Promise<Row<T>[]> {
    if (!where.length) throw new Error("Refusing unfiltered update");
    const entries = Object.entries(patch as Record<string, unknown>).filter(([, v]) => v !== undefined);
    if (!entries.length) return this.select(t, { where });
    const params: unknown[] = [];
    const set: string[] = [];
    for (const [c, v] of entries) {
      params.push(await this.encode(t, c, v));
      set.push(`${ident(c)} = $${params.length}`);
    }
    const sql = `update ${ident(t)} set ${set.join(", ")}${await this.where(t, where, params)} returning *`;
    return (await this.client.query(sql, params)).rows as unknown as Row<T>[];
  }

  async remove<T extends TableName>(t: T, where: Filter[]): Promise<number> {
    if (!where.length) throw new Error("Refusing unfiltered delete");
    const params: unknown[] = [];
    const res = await this.client.query(`delete from ${ident(t)}${await this.where(t, where, params)}`, params);
    return res.rowCount ?? 0;
  }

  async count<T extends TableName>(t: T, where: Filter[] = []): Promise<number> {
    const params: unknown[] = [];
    const res = await this.client.query(`select count(*)::int as n from ${ident(t)}${await this.where(t, where, params)}`, params);
    return Number(res.rows[0].n);
  }
}

// ---------------------------------------------------------------------------
// Connection pool and automatic migrations
// ---------------------------------------------------------------------------

const MIGRATIONS_DIR = path.join(process.cwd(), "postgres");

/**
 * Applies postgres/*.sql in name order, once each, under an advisory lock so
 * that two starting instances never migrate at the same time.
 */
export async function migrate(pool: pg.Pool, dir = MIGRATIONS_DIR): Promise<string[]> {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query("select pg_advisory_lock(727001)");
    await client.query("create table if not exists public.hablo_migrations (name text primary key, applied_at timestamptz not null default now())");
    const done = new Set((await client.query("select name from public.hablo_migrations")).rows.map((r) => r.name as string));
    for (const f of files) {
      if (done.has(f)) continue;
      await client.query("begin");
      try {
        await client.query(fs.readFileSync(path.join(dir, f), "utf8"));
        await client.query("insert into public.hablo_migrations (name) values ($1)", [f]);
        await client.query("commit");
        applied.push(f);
      } catch (e) {
        await client.query("rollback");
        throw new Error(`Migration ${f} failed: ${e instanceof Error ? e.message : e}`);
      }
    }
  } finally {
    await client.query("select pg_advisory_unlock(727001)").catch(() => null);
    client.release();
  }
  return applied;
}

const g = globalThis as unknown as { habloPg?: { pool: pg.Pool; ready: Promise<void> } };

export function createPool(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString, types, max: 5 });
}

/** One pool per server process, migrated before first use. */
export async function getPool(connectionString: string): Promise<pg.Pool> {
  if (!g.habloPg) {
    const pool = createPool(connectionString);
    const ready = migrate(pool).then((applied) => {
      if (applied.length) console.log(`[hablo] applied database migrations: ${applied.join(", ")}`);
    });
    g.habloPg = { pool, ready };
    ready.catch(() => {
      // Let the next request retry instead of caching a failed start.
      g.habloPg = undefined;
      void pool.end();
    });
  }
  const { pool, ready } = g.habloPg;
  await ready;
  return pool;
}
