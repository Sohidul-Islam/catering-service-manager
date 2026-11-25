import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";

async function main() {
  const url = process.env.TURSO_DATABASE_URL?.trim();
  const authToken = process.env.TURSO_AUTH_TOKEN?.trim();

  if (!url) {
    throw new Error("TURSO_DATABASE_URL is not set.");
  }

  const client = createClient({
    url,
    authToken: authToken || undefined,
  });

  await client.execute(`
    CREATE TABLE IF NOT EXISTS "_turso_migrations" (
      "name" TEXT NOT NULL PRIMARY KEY,
      "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const appliedRes = await client.execute(`SELECT "name" FROM "_turso_migrations";`);
  const appliedSet = new Set(appliedRes.rows.map((r) => String(r.name)));

  const migrationsDir = path.join(process.cwd(), "prisma", "migrations");
  const entries = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  let appliedCount = 0;

  for (const dirName of entries) {
    if (appliedSet.has(dirName)) {
      console.log(`Skipping already applied migration: ${dirName}`);
      continue;
    }

    const sqlPath = path.join(migrationsDir, dirName, "migration.sql");
    if (!fs.existsSync(sqlPath)) continue;

    const sql = fs.readFileSync(sqlPath, "utf8");
    console.log(`Applying migration to Turso: ${dirName}...`);
    await client.executeMultiple(sql);
    await client.execute({
      sql: `INSERT INTO "_turso_migrations" ("name") VALUES (?);`,
      args: [dirName],
    });
    appliedCount++;
  }

  console.log(`Turso migration sync complete. Applied ${appliedCount} new migration(s).`);
  client.close();
}

main().catch((err) => {
  console.error("Failed to push migrations to Turso:", err);
  process.exit(1);
});
