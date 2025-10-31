RAG-Powered News Chatbot (Backend)

Overview
This Express backend powers a Retrieval-Augmented Generation (RAG) chatbot over a news corpus. It ingests RSS news, generates embeddings, stores them with Redis-backed persistence, retrieves top-k relevant items, and asks Gemini to produce grounded answers with sources.

Key Features
- News ingestion from multiple RSS sources
- Embeddings via Jina (with Redis caching and a local fallback)
- Vector search in-memory with Redis persistence for durability
- Chat sessions and history in Redis with TTL
- Gemini v1 API integration for final answers
- Upstash-friendly Redis usage (SCAN not KEYS) and rich connection diagnostics
- Admin endpoints for ingestion, stats, and debugging stored articles

Quick Start
1) Install
```bash
npm install
```

2) Configure environment
Copy env.example to .env and fill values:
```bash
cp env.example .env
```

Required ENV vars
- REDIS_URL: Upstash TCP URL or local Redis
  - rediss://default:<TOKEN>@<HOST>:6379 (Upstash) or redis://localhost:6379 (local)
- JINA_EMBEDDING_API_KEY: Jina Embeddings API key
- GOOGLE_GEMINI_API_KEY: Google AI Studio API key
- GEMINI_MODEL: One of: gemini-1.5-flash (recommended), gemini-1.5-flash-8b, gemini-1.5-pro
- CHAT_HISTORY_TTL: Seconds to keep chat history (default 3600)
- EMBEDDINGS_CACHE_TTL: Seconds to cache embeddings (default 86400)

3) Run the server
```bash
npm run start
# Server: http://localhost:8000
```
On startup you should see logs: protocol/host/port/TLS, a PING=PONG, and health URLs.

Populate the Index
Run ingestion to fetch ~200 articles, embed, and persist to Redis:
```bash
curl -X POST http://localhost:8000/api/ingest-news
```
Verify stats:
```bash
curl http://localhost:8000/api/stats
# Expect articlesInRedis > 0
```

Usage (Core Endpoints)
- POST /api/chat
  - Body: { "sessionId": "<uuid>", "message": "<text>" }
  - Returns: { message, sources[], relevance }

- GET /api/history/:sessionId
  - Returns chat history stored in Redis

- DELETE /api/history/:sessionId
  - Clears a session’s history

- POST /api/ingest-news
  - Runs the full ingestion pipeline (RSS → embed → store)

- GET /api/stats
  - Returns vector store stats: counts, sources, lastUpdated, memory usage

Admin/Debug Endpoints
- GET /api/debug/keys
  - Lists total count of article:* keys and a small sample

- GET /api/debug/article?key=article:...
  - Returns a compact view of a stored article: title, source, hasEmbedding, embeddingLength, content snippet

Architecture
1) Ingestion (services/newsIngestion.js)
   - Fetches RSS feeds (BBC, TechCrunch, Ars Technica, etc.)
   - For each article: builds text (title + content) and requests an embedding
   - Stores structured article JSON with embedding in Redis as article:<guid>
   - Updates vectorstore:metadata in Redis

2) Embeddings (services/embeddingService.js)
   - Uses Jina Embeddings (jina-embeddings-v2-base-en)
   - Caches embeddings in Redis as embedding:<hash>
   - Fallback embedding generator avoids hard failures during development

3) Vector Store (services/vectorStore.js)
   - In-memory array for fast cosine similarity search
   - On first query, repopulates from Redis with SCAN (Upstash-safe)
   - Metadata persisted to Redis for counts/sources/lastUpdated

4) Chat (services/chatService.js)
   - Saves messages to session in Redis (chat:<sessionId>) with TTL
   - Builds query embedding, retrieves top-k similar articles
   - Calls Gemini to generate a grounded answer with cited sources

5) LLM (services/geminiService.js)
   - v1 endpoint: https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent
   - Set GEMINI_MODEL to a model your key supports (gemini-1.5-flash recommended)
   - Fallback response synthesizes from retrieved articles if the API call fails

Redis & Upstash Notes
- Client: node-redis using TCP/TLS (rediss)
- We enable TLS automatically if URL starts with rediss://
- We never use KEYS in production code; we use SCAN/scanIterator to avoid blocking
- On startup we log protocol/host/TLS and run a PING to validate connectivity

Troubleshooting
- Stats show 0 articles
  - Ensure you ran POST /api/ingest-news with the same REDIS_URL the server uses
  - Use GET /api/debug/keys to confirm article:* keys exist
  - Use GET /api/debug/article?key=... to verify hasEmbedding=true and embeddingLength=384

- Upstash returns 0 keys
  - Confirm SCAN is being used (logs show "Scanning Redis for article:*")
  - Verify REDIS_URL is the Upstash TCP URL (rediss://...:6379)

- Gemini 404: model not found
  - Set a supported v1 model: export GEMINI_MODEL=gemini-1.5-flash
  - Restart server

- Different results locally vs Upstash
  - Make sure ingestion and chat both use the same REDIS_URL
  - If you ingested locally, you must reingest when pointing to Upstash

Scripts & Examples
Start (Upstash):
```bash
REDIS_URL="rediss://default:<TOKEN>@<HOST>:6379" \
GEMINI_MODEL=gemini-1.5-flash \
npm run start
```

Ingest & verify:
```bash
curl -X POST http://localhost:8000/api/ingest-news
curl http://localhost:8000/api/stats
curl http://localhost:8000/api/debug/keys
```

Chat:
```bash
curl -X POST http://localhost:8000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"sessionId":"test-session","message":"tesla todays budget"}'
```

Security
- Do not commit .env or secrets
- Use environment variables for all credentials (Redis, Jina, Gemini)

Next Improvements
- Swap in a proper vector database (Qdrant/Chroma/Pinecone) for scalable similarity search
- Streaming responses or server-sent events (SSE)
- Optional SQL persistence for final transcripts
- Automatic scheduled ingestion

License
MIT


