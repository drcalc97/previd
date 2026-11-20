import "server-only";
import postgres, { type Sql, type TransactionSql } from "postgres";
import { config } from "../config";
import type { Role } from "@/domain/permissions";

/** The authenticated, tenant-verified context every tenant-scoped operation requires. */
export type OrgContext = {
  userId: string;
  orgId: string;
  orgSlug: string;
  role: Role;
  ipHash: string | null;
};

export type Tx = TransactionSql;

const g = globalThis as unknown as { __previdSql?: Sql };

export function db(): Sql {
  if (!g.__previdSql) {
    g.__previdSql = postgres(config().DATABASE_URL, {
      max: 10,
      prepare: false, // compatible with transaction-mode poolers (Supabase Supavisor / PgBouncer)
      idle_timeout: 20,
      onnotice: () => {},
      ssl: config().DATABASE_SSL === "require" ? "require" : false,
    });
  }
  return g.__previdSql;
}

/**
 * Run `fn` in a transaction with the RLS session context set. This is the ONLY way tenant data
 * is read or written. The context is transaction-local (set_config(..., true)).
 */
export async function withOrg<T>(ctx: Pick<OrgContext, "userId" | "orgId">, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db().begin(async (tx) => {
    await tx`select set_config('app.user_id', ${ctx.userId}, true), set_config('app.org_id', ${ctx.orgId}, true)`;
    return fn(tx);
  }) as Promise<T>;
}

/** User-scoped (no organisation selected yet), e.g. listing the organisations a user belongs to. */
export async function withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db().begin(async (tx) => {
    await tx`select set_config('app.user_id', ${userId}, true), set_config('app.org_id', '', true)`;
    return fn(tx);
  }) as Promise<T>;
}

/** No identity (pre-authentication). Only touches tables without RLS (rate limits, local auth). */
export async function withAnon<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db().begin(async (tx) => {
    await tx`select set_config('app.user_id', '', true), set_config('app.org_id', '', true)`;
    return fn(tx);
  }) as Promise<T>;
}
