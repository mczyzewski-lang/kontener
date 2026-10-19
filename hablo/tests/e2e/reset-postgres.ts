import pg from "pg";

/** Empties the e2e Postgres database. Refuses anything that does not look like a test database. */
const url = process.env.E2E_DATABASE_URL;
if (!url) throw new Error("E2E_DATABASE_URL is not set");
const name = new URL(url).pathname.slice(1);
if (!/test|e2e/i.test(name)) throw new Error(`Refusing to reset database "${name}": its name must contain "test" or "e2e"`);
async function main() {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query("drop schema public cascade; create schema public;");
  await client.end();
  console.log(`reset ${name}`);
}
void main();
