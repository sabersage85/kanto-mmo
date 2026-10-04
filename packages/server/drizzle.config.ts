import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit config. Generate a SQL migration after editing
 * `src/db/schema.ts`:
 *
 *   npm run db:generate -w packages/server
 *
 * Then apply pending migrations to the configured database:
 *
 *   npm run db:migrate -w packages/server
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://kanto:kanto@localhost:5432/kanto_mmo',
  },
});
