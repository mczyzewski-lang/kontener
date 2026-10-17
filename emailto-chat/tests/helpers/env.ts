/** Test environment. Imported first by every server test. */
import { randomBytes } from "node:crypto";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/emailtochat_test";

// Never point tests at the dev database.
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.APP_URL = "http://localhost:3000";
process.env.GOOGLE_CLIENT_ID = "test-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
process.env.SESSION_SECRET = randomBytes(32).toString("base64url");
process.env.CRON_SECRET = "test-cron-secret";
process.env.MAX_BACKFILL_THREADS = "1500";
delete process.env.GMAIL_PUBSUB_TOPIC;
delete process.env.PUBSUB_SERVICE_ACCOUNT_EMAIL;
delete process.env.PUBSUB_VERIFICATION_TOKEN;
