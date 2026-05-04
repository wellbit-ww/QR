Place equipment-specific documentation here for ingestion.

Structure:
- `data/knowledge/<equipment-id>/*.md`
- `data/knowledge/<equipment-id>/*.txt`
- `data/knowledge/<equipment-id>/*.pdf`
- `data/knowledge/<equipment-id>/*.doc` (классический Word)
- `data/knowledge/<equipment-id>/*.docx`

Example:
- `data/knowledge/wattsan-1313a/manual-notes.md`

Run ingestion:
- `npm run ingest:knowledge`

Required environment:
- `POSTGRES_URL` (Postgres with pgvector extension)
- Optional: `EMBEDDING_URL`, `EMBEDDING_MODEL`, `INGEST_CHUNK_SIZE`, `INGEST_CHUNK_OVERLAP`
