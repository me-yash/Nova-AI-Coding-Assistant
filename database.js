const Database = require("better-sqlite3");


// Create/open Nova database
const db = new Database("nova.db");


// Improve SQLite performance and make foreign-key cascades reliable.
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("synchronous = NORMAL");
db.pragma("busy_timeout = 5000");


// =====================================
// CONVERSATIONS TABLE
// =====================================

db.prepare(`
    CREATE TABLE IF NOT EXISTS conversations (

        id INTEGER PRIMARY KEY AUTOINCREMENT,

        title TEXT NOT NULL,

        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP

    )
`).run();


// =====================================
// MESSAGES TABLE
// =====================================

db.prepare(`
    CREATE TABLE IF NOT EXISTS messages (

        id INTEGER PRIMARY KEY AUTOINCREMENT,

        conversation_id INTEGER NOT NULL,

        role TEXT NOT NULL,

        content TEXT NOT NULL,

        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (conversation_id)
            REFERENCES conversations(id)
            ON DELETE CASCADE

    )
`).run();


console.log("Nova database ready.");

module.exports = db;

// Indexes keep chat history/sidebar queries fast as Nova grows.
db.prepare(`CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id)`).run();
db.prepare(`CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC)`).run();
