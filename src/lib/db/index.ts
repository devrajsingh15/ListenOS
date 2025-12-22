import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// For server-side only - this file should only be imported in API routes
const connectionString = process.env.DATABASE_URL;

// Lazy initialization to avoid build-time errors
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

function getDb() {
  if (!_db) {
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    
    // Create postgres connection
    const client = postgres(connectionString, {
      max: 1, // Use single connection for serverless
      idle_timeout: 20,
      connect_timeout: 10,
    });
    
    _db = drizzle(client, { schema });
  }
  return _db;
}

// Export a proxy that lazily initializes the db
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop) {
    return getDb()[prop as keyof typeof _db];
  },
});

// Export schema for convenience
export * from "./schema";
