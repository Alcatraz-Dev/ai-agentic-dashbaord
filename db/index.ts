import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';

const databaseUrl = process.env.DATABASE_URL || 'postgresql://placeholder-url';

const client = postgres(databaseUrl, { prepare: false });
export const db = drizzle({ client, schema });
// Every table and inferred type lives in db/schema.ts; re-exported for the app.
export * from '@/db/schema';
