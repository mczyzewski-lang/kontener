import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { __etcPrisma?: PrismaClient };

function create(): PrismaClient {
  return new PrismaClient({ log: process.env.PRISMA_LOG === "1" ? ["query", "warn", "error"] : ["warn", "error"] });
}

/** Lazily created singleton (survives Next.js dev hot reloads). */
export function getDb(): PrismaClient {
  if (!globalForPrisma.__etcPrisma) globalForPrisma.__etcPrisma = create();
  return globalForPrisma.__etcPrisma;
}

/** Proxy so modules can `import { db }` without instantiating Prisma at import time (build-safe). */
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_t, prop) {
    const client = getDb();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}
