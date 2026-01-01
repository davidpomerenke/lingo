import { createClient } from "@libsql/client";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// ============ Types ============

export interface DbUser {
  id: string;
  email: string;
  languages: string[]; // User's selected languages
  script_modes: Record<string, boolean>; // Per-language: true = Latin letters, false = native script
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
  language?: string;
  use_latin_letters?: boolean;
  provider?: "gemini" | "openai";
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
      languages TEXT DEFAULT '["English","Spanish","French","Italian","German","Arabic","Hindi","Japanese","Korean","Chinese"]',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  
  // Add languages column if it doesn't exist (migration)
  try {
    await client.execute(`ALTER TABLE users ADD COLUMN languages TEXT DEFAULT '["English","Spanish","French","Italian","German","Arabic","Hindi","Japanese","Korean","Chinese"]'`);
  } catch {
    // Column already exists
  }
  
  // Add script_modes column if it doesn't exist (migration)
  try {
    await client.execute(`ALTER TABLE users ADD COLUMN script_modes TEXT DEFAULT '{}'`);
  } catch {
    // Column already exists
  }
  
  // Add language column to messages if it doesn't exist (migration)
  try {
    await client.execute(`ALTER TABLE messages ADD COLUMN language TEXT`);
  } catch {
    // Column already exists
  }
  
  // Add use_latin_letters column to messages if it doesn't exist (migration)
  try {
    await client.execute(`ALTER TABLE messages ADD COLUMN use_latin_letters INTEGER`);
  } catch {
    // Column already exists
  }
  
  // Add provider column to messages if it doesn't exist (migration)
  try {
    await client.execute(`ALTER TABLE messages ADD COLUMN provider TEXT`);
  } catch {
    // Column already exists
  }

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

const DEFAULT_LANGUAGES = ["English","Spanish","French","Italian","German","Arabic","Hindi","Japanese","Korean","Chinese"];

function parseLanguages(raw: string | null): string[] {
  if (!raw) return DEFAULT_LANGUAGES;
  try {
    return JSON.parse(raw);
  } catch {
    return DEFAULT_LANGUAGES;
  }
}

function parseScriptModes(raw: string | null): Record<string, boolean> {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export async function getUserByEmail(email: string): Promise<DbUser | null> {
  const result = await client.execute({
    sql: "SELECT id, email, languages, script_modes, created_at FROM users WHERE email = ?",
    args: [email.toLowerCase()],
  });
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    id: row.id as string,
    email: row.email as string,
    languages: parseLanguages(row.languages as string | null),
    script_modes: parseScriptModes(row.script_modes as string | null),
    created_at: row.created_at as string,
  };
}

export async function getUserById(id: string): Promise<DbUser | null> {
  const result = await client.execute({
    sql: "SELECT id, email, languages, script_modes, created_at FROM users WHERE id = ?",
    args: [id],
  });
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    id: row.id as string,
    email: row.email as string,
    languages: parseLanguages(row.languages as string | null),
    script_modes: parseScriptModes(row.script_modes as string | null),
    created_at: row.created_at as string,
  };
}

export async function createUser(email: string): Promise<DbUser> {
  const id = crypto.randomUUID();
  await client.execute({
    sql: "INSERT INTO users (id, email) VALUES (?, ?)",
    args: [id, email.toLowerCase()],
  });
  return { 
    id, 
    email: email.toLowerCase(), 
    languages: DEFAULT_LANGUAGES,
    script_modes: {},
    created_at: new Date().toISOString() 
  };
}

export async function getOrCreateUser(email: string): Promise<{ user: DbUser; isNew: boolean }> {
  const existing = await getUserByEmail(email);
  if (existing) return { user: existing, isNew: false };
  const user = await createUser(email);
  return { user, isNew: true };
}

export async function updateUserLanguages(userId: string, languages: string[]): Promise<void> {
  await client.execute({
    sql: "UPDATE users SET languages = ? WHERE id = ?",
    args: [JSON.stringify(languages), userId],
  });
}

export async function updateUserScriptModes(userId: string, scriptModes: Record<string, boolean>): Promise<void> {
  await client.execute({
    sql: "UPDATE users SET script_modes = ? WHERE id = ?",
    args: [JSON.stringify(scriptModes), userId],
  });
}

export { DEFAULT_LANGUAGES };

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
    sql: "SELECT id, user_id, role, content, language, use_latin_letters, provider, created_at FROM messages WHERE user_id = ? ORDER BY created_at ASC",
    args: [userId],
  });
  return result.rows.map((row) => ({
    id: row.id as string,
    user_id: row.user_id as string,
    role: row.role as "user" | "assistant",
    content: row.content as string,
    language: row.language as string | undefined,
    use_latin_letters: row.use_latin_letters === 1 ? true : row.use_latin_letters === 0 ? false : undefined,
    provider: row.provider as "gemini" | "openai" | undefined,
    created_at: row.created_at as string,
  }));
}

export async function addMessage(
  id: string,
  userId: string,
  role: "user" | "assistant",
  content: string,
  language?: string,
  useLatinLetters?: boolean,
  provider?: "gemini" | "openai"
): Promise<void> {
  await client.execute({
    sql: "INSERT INTO messages (id, user_id, role, content, language, use_latin_letters, provider) VALUES (?, ?, ?, ?, ?, ?, ?)",
    args: [id, userId, role, content, language ?? null, useLatinLetters === undefined ? null : useLatinLetters ? 1 : 0, provider ?? null],
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

// Migrate anonymous messages to a real user
export async function migrateAnonMessages(anonId: string, userId: string): Promise<number> {
  const result = await client.execute({
    sql: "UPDATE messages SET user_id = ? WHERE user_id = ?",
    args: [userId, anonId],
  });
  return result.rowsAffected;
}

// Count messages for a user (including anonymous)
export async function countMessages(userId: string): Promise<number> {
  const result = await client.execute({
    sql: "SELECT COUNT(*) as count FROM messages WHERE user_id = ?",
    args: [userId],
  });
  return result.rows[0].count as number;
}

export { client };
