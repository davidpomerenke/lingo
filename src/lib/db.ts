import { createClient } from "@libsql/client";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// ============ Types ============

export interface DbUser {
  id: string;
  email: string;
  created_at: string;
}

export interface DbSession {
  id: string;
  user_id: string;
  expires_at: string;
}

export interface DbAuthToken {
  token: string;
  email: string;
  expires_at: string;
  used: number;
}

export interface DbMessage {
  id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

// ============ Schema ============

let dbInitialized = false;

export async function initDb() {
  if (dbInitialized) return;
  dbInitialized = true;
  // Users table
  await client.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Auth tokens for magic links (short-lived)
  await client.execute(`
    CREATE TABLE IF NOT EXISTS auth_tokens (
      token TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER DEFAULT 0
    )
  `);

  // Sessions (longer-lived)
  await client.execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Messages with user_id
  await client.execute(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
}

// ============ Users ============

export async function getUserByEmail(email: string): Promise<DbUser | null> {
  const result = await client.execute({
    sql: "SELECT id, email, created_at FROM users WHERE email = ?",
    args: [email.toLowerCase()],
  });
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    id: row.id as string,
    email: row.email as string,
    created_at: row.created_at as string,
  };
}

export async function getUserById(id: string): Promise<DbUser | null> {
  const result = await client.execute({
    sql: "SELECT id, email, created_at FROM users WHERE id = ?",
    args: [id],
  });
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    id: row.id as string,
    email: row.email as string,
    created_at: row.created_at as string,
  };
}

export async function createUser(email: string): Promise<DbUser> {
  const id = crypto.randomUUID();
  await client.execute({
    sql: "INSERT INTO users (id, email) VALUES (?, ?)",
    args: [id, email.toLowerCase()],
  });
  return { id, email: email.toLowerCase(), created_at: new Date().toISOString() };
}

export async function getOrCreateUser(email: string): Promise<DbUser> {
  const existing = await getUserByEmail(email);
  if (existing) return existing;
  return createUser(email);
}

// ============ Auth Tokens (Magic Links) ============

export async function createAuthToken(email: string): Promise<string> {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minutes
  
  await client.execute({
    sql: "INSERT INTO auth_tokens (token, email, expires_at) VALUES (?, ?, ?)",
    args: [token, email.toLowerCase(), expiresAt],
  });
  
  return token;
}

export async function verifyAuthToken(token: string): Promise<string | null> {
  const result = await client.execute({
    sql: "SELECT email, expires_at, used FROM auth_tokens WHERE token = ?",
    args: [token],
  });
  
  if (result.rows.length === 0) return null;
  
  const row = result.rows[0];
  const expiresAt = new Date(row.expires_at as string);
  const used = row.used as number;
  
  if (used || expiresAt < new Date()) {
    return null; // Token already used or expired
  }
  
  // Mark as used
  await client.execute({
    sql: "UPDATE auth_tokens SET used = 1 WHERE token = ?",
    args: [token],
  });
  
  return row.email as string;
}

// Clean up old tokens periodically
export async function cleanupAuthTokens(): Promise<void> {
  await client.execute(
    "DELETE FROM auth_tokens WHERE expires_at < datetime('now') OR used = 1"
  );
}

// ============ Sessions ============

export async function createSession(userId: string): Promise<string> {
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
  
  await client.execute({
    sql: "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)",
    args: [id, userId, expiresAt],
  });
  
  return id;
}

export async function getSession(sessionId: string): Promise<DbSession | null> {
  const result = await client.execute({
    sql: "SELECT id, user_id, expires_at FROM sessions WHERE id = ?",
    args: [sessionId],
  });
  
  if (result.rows.length === 0) return null;
  
  const row = result.rows[0];
  const expiresAt = new Date(row.expires_at as string);
  
  if (expiresAt < new Date()) {
    await deleteSession(sessionId);
    return null;
  }
  
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    expires_at: row.expires_at as string,
  };
}

export async function deleteSession(sessionId: string): Promise<void> {
  await client.execute({
    sql: "DELETE FROM sessions WHERE id = ?",
    args: [sessionId],
  });
}

// Clean up expired sessions
export async function cleanupSessions(): Promise<void> {
  await client.execute("DELETE FROM sessions WHERE expires_at < datetime('now')");
}

// ============ Messages (per-user) ============

export async function getMessages(userId: string): Promise<DbMessage[]> {
  const result = await client.execute({
    sql: "SELECT id, user_id, role, content, created_at FROM messages WHERE user_id = ? ORDER BY created_at ASC",
    args: [userId],
  });
  return result.rows.map((row) => ({
    id: row.id as string,
    user_id: row.user_id as string,
    role: row.role as "user" | "assistant",
    content: row.content as string,
    created_at: row.created_at as string,
  }));
}

export async function addMessage(
  id: string,
  userId: string,
  role: "user" | "assistant",
  content: string
): Promise<void> {
  await client.execute({
    sql: "INSERT INTO messages (id, user_id, role, content) VALUES (?, ?, ?, ?)",
    args: [id, userId, role, content],
  });
}

export async function updateMessage(id: string, content: string): Promise<void> {
  await client.execute({
    sql: "UPDATE messages SET content = ? WHERE id = ?",
    args: [content, id],
  });
}

export async function clearMessages(userId: string): Promise<void> {
  await client.execute({
    sql: "DELETE FROM messages WHERE user_id = ?",
    args: [userId],
  });
}

export { client };
