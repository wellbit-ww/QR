const { Pool } = require("pg");

let sharedPool = null;

function getPool(postgresUrl) {
  if (!postgresUrl) {
    return null;
  }

  if (!sharedPool) {
    sharedPool = new Pool({
      connectionString: postgresUrl,
    });
  }

  return sharedPool;
}

async function ensureRagSchema(pool) {
  await pool.query("CREATE EXTENSION IF NOT EXISTS vector;");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS knowledge_chunks (
      id BIGSERIAL PRIMARY KEY,
      equipment_id TEXT NOT NULL,
      source_doc TEXT NOT NULL,
      section TEXT,
      page INTEGER,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      embedding VECTOR(1024) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(equipment_id, source_doc, chunk_index)
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS knowledge_chunks_equipment_id_idx
      ON knowledge_chunks(equipment_id);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_idx
      ON knowledge_chunks USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS knowledge_chunks_metadata_idx
      ON knowledge_chunks USING GIN (metadata);
  `);
}

module.exports = {
  getPool,
  ensureRagSchema,
};
