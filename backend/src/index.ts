import { handleRequest } from "./app.ts";

const PORT = Number(process.env.PORT || 3000);
Bun.serve({ port: PORT, fetch: handleRequest });

console.log(`backend listening on ${PORT} (postgres=${(process.env.DATABASE_URL || "postgres://app:app@localhost:5432/app").replace(/:[^:@/]+@/, ":***@")})`);
