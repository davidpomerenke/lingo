import { createClient } from "@libsql/client";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export interface DbMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

// Initialize the database table
export async function initDb() {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

// Get all messages
export async function getMessages(): Promise<DbMessage[]> {
  await initDb();
  const result = await client.execute(
    "SELECT id, role, content, created_at FROM messages ORDER BY created_at ASC"
  );
  return result.rows.map((row) => ({
    id: row.id as string,
    role: row.role as "user" | "assistant",
    content: row.content as string,
    created_at: row.created_at as string,
  }));
}

// Add a new message
export async function addMessage(
  id: string,
  role: "user" | "assistant",
  content: string
): Promise<void> {
  await initDb();
  await client.execute({
    sql: "INSERT INTO messages (id, role, content) VALUES (?, ?, ?)",
    args: [id, role, content],
  });
}

// Update an existing message (for appending transcript chunks)
export async function updateMessage(id: string, content: string): Promise<void> {
  await client.execute({
    sql: "UPDATE messages SET content = ? WHERE id = ?",
    args: [content, id],
  });
}

// Clear all messages
export async function clearMessages(): Promise<void> {
  await client.execute("DELETE FROM messages");
}

export { client };

