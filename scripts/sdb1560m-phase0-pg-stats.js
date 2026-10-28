require("./load-env-file").loadEnvFile();
const { getPool } = require("../src/rag/pg-client");
const { getRagConfig } = require("../src/rag/config");

async function main() {
  const pool = getPool(getRagConfig().postgresUrl);
  if (!pool) {
    console.error("POSTGRES_URL missing");
    process.exit(1);
  }
  const id = "sdb1560m";
  const total = await pool.query(
    "SELECT COUNT(*)::int AS n FROM knowledge_chunks WHERE equipment_id = $1",
    [id],
  );
  const byDoc = await pool.query(
    `SELECT source_doc, COUNT(*)::int AS n
     FROM knowledge_chunks WHERE equipment_id = $1
     GROUP BY source_doc ORDER BY n DESC`,
    [id],
  );
  const modes = await pool.query(
    `SELECT COALESCE(metadata->>'chunkKind', metadata->>'blockType', 'unknown') AS kind,
            COUNT(*)::int AS n
     FROM knowledge_chunks WHERE equipment_id = $1
     GROUP BY 1 ORDER BY n DESC LIMIT 12`,
    [id],
  );
  console.log(
    JSON.stringify(
      {
        equipmentId: id,
        totalChunks: total.rows[0].n,
        bySourceDoc: byDoc.rows,
        byKind: modes.rows,
      },
      null,
      2,
    ),
  );
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
