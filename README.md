# Orbis — AI-Powered Journal Recommendation Engine

An intelligent academic journal matching system that reads your manuscript, understands its domain and methodology through semantic analysis, and recommends the best-fit journals using hybrid vector search across 200M+ academic records.

**Built for the Taylor & Francis × HackCulture × Vibe Coding Hackathon.**

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [How It Works](#how-it-works)
- [Built on Node-Production-Backend](#built-on-node-production-backend)
- [Installation & Setup](#installation--setup)
- [Environment Variables](#environment-variables)
- [API Endpoints](#api-endpoints)
- [Frontend Routes](#frontend-routes)
- [Performance](#performance)
- [Cost Analysis](#cost-analysis)
- [Testing](#testing)
- [Docker Support](#docker-support)
- [Author](#author)

---

## Overview

Researchers publish 30M+ papers annually across 40,000+ journals. Finding the right journal is a painful, weeks-long process of trial and error. A wrong choice leads to desk rejection and months of wasted effort.

Existing tools rely on basic keyword matching with no semantic understanding of paper content vs. journal scope.

**Orbis solves this.** Upload a manuscript PDF, and Orbis:

1. Extracts and understands the paper's abstract, domain, methodology, and contribution type
2. Generates semantic embeddings using a local sentence-BERT model
3. Searches 3,000+ pre-indexed venue vectors via hybrid search (vector DB + OpenAlex fallback)
4. Enriches results with live citation metrics from OpenAlex (200M+ records)
5. Ranks journals using multi-signal scoring: semantic fit, domain alignment, keyword overlap, and reputation
6. Returns the top 5 journals with detailed explanations and a publication readiness assessment

All in under 60 seconds.

---

## Key Features

### Intelligent Analysis
- **Semantic Vector Search** — sentence-BERT embeddings (768 dims) capture the meaning of your paper, not just keywords. Matches against 3,000 pre-indexed venue vectors
- **Hybrid Fallback** — Vector search returns topK:30 candidates. If fewer than 5 strong matches, falls back to OpenAlex keyword search. Guarantees relevant results every time
- **Domain-Aware Scoring** — Multi-signal ranking: semantic similarity + domain match + keyword overlap + journal reputation + contribution alignment. Off-domain detection prevents irrelevant results
- **Deep Analysis** — AI-powered novelty assessment, impact potential categorization (foundational/incremental/application/survey), and publication readiness scoring

### Performance & Privacy
- **100% Local Embeddings** — Xenova/all-mpnet-base-v2 runs entirely on-server. No data leaves the machine. Zero per-query embedding cost
- **Pre-built Binary Vector Store** — `venue-embeddings.bin` (8.8MB Float32Array) + `venue-index.json` loads in 17ms at startup. Vector search completes in <5ms
- **Parallel Processing Pipeline** — `Promise.all()` runs AI feature extraction + embedding generation + deep analysis concurrently. OpenAlex enrichment batches all journal lookups in parallel. ~30s instead of ~90s sequential
- **Circuit Breaker Pattern** — Prevents cascade failures on API downtime with graceful degradation

### Real-Time Experience
- **SSE Progress Streaming** — Server-Sent Events push 7-step progress to the frontend in real time
- **Dark Responsive UI** — Modern dark theme built with Tailwind CSS, animated pipeline cards, drag-and-drop PDF upload
- **Full-Screen Progress Overlay** — Portal-based overlay with step-by-step progress tracking using Lucide icons

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React 19 + Vite)                   │
│  Landing → AnalyzePage (upload + SSE progress) → ResultsPage        │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ POST /analyze (multipart PDF)
                               │ GET /analyze/progress/:sessionId (SSE)
┌──────────────────────────────▼──────────────────────────────────────┐
│                     BACKEND (Express 5 + ESM)                       │
│                                                                     │
│  ┌─────────────┐   ┌──────────────┐   ┌─────────────────────────┐  │
│  │ PDF Service  │   │  AI Service   │   │  Embedding Service      │  │
│  │ pdf-parse +  │   │ Gemini 2.5    │   │ Xenova/all-mpnet-base-v2│  │
│  │ pdfjs-dist   │   │ Groq Llama-3  │   │ 768-dim local SBERT    │  │
│  └──────┬───────┘   └──────┬────────┘   └──────────┬──────────────┘  │
│         │                  │                        │               │
│         └──────────────────┼────────────────────────┘               │
│                            ▼                                        │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              Analysis Pipeline (7 Steps)                     │   │
│  │  Extract → Features → Search → Enrich → Score → Explain     │   │
│  └─────────────────────────┬───────────────────────────────────┘   │
│                            │                                        │
│  ┌─────────────────┐  ┌───▼────────────┐  ┌────────────────────┐  │
│  │ Vector Store     │  │ Journal Search  │  │  Scoring Service   │  │
│  │ venue-index.json │  │ OpenAlex API    │  │  Cosine + Domain   │  │
│  │ venue-embed.bin  │  │ 200M+ records   │  │  + Keywords + Rep  │  │
│  └─────────────────┘  └────────────────┘  └────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Runtime** | Node.js (ESM) | JavaScript runtime with ES modules |
| **Framework** | Express 5 | Web application framework |
| **AI — Extraction** | Google Gemini 2.5 Flash | Feature extraction from manuscripts |
| **AI — Generation** | Groq Llama-3.3-70B | Explanations, analysis, readiness scoring |
| **AI — Embeddings** | Xenova/all-mpnet-base-v2 | Local 768-dim sentence-BERT embeddings |
| **Data Enrichment** | OpenAlex API | Live h-index, citations, topics (200M+ records) |
| **PDF Parsing** | pdf-parse + pdfjs-dist | Dual-parser text extraction from PDFs |
| **Validation** | Zod | Runtime schema validation |
| **Security** | Helmet.js | Security headers |
| **Logging** | Winston | Structured logging with file + console transports |
| **Frontend** | React 19 + Vite 8 | Modern SPA with hot module replacement |
| **Styling** | Tailwind CSS 4 | Utility-first CSS framework |
| **Icons** | Lucide React | Icon library |
| **Routing** | React Router 7 | Client-side routing |
| **File Upload** | Multer | Multipart form data handling (10MB limit) |
| **Testing** | Jest 30 + Supertest | Unit and integration testing |
| **Code Quality** | ESLint + Prettier | Linting and formatting |
| **Containerization** | Docker | Multi-environment containerization |

---

## Project Structure

```
Vibe_Coding/
├── backend/
│   ├── src/
│   │   ├── app.js                          # Express app configuration
│   │   ├── index.js                        # Entry point
│   │   ├── server.js                       # Server startup + service initialization
│   │   ├── config/
│   │   │   └── logger.js                   # Winston logging configuration
│   │   ├── controllers/
│   │   │   └── analyze.controller.js       # 7-step analysis pipeline
│   │   ├── data/
│   │   │   ├── elite-venues.js             # Curated elite venue metadata
│   │   │   └── journals.json               # Pre-indexed journal database
│   │   ├── middleware/
│   │   │   └── error.middleware.js          # Global error handler
│   │   ├── routes/
│   │   │   └── analyze.route.js            # POST /analyze + SSE progress
│   │   ├── services/
│   │   │   ├── ai.service.js               # Gemini + Groq AI orchestration
│   │   │   ├── analysis.service.js         # Deep novelty & impact analysis
│   │   │   ├── embedding.service.js        # Local sentence-BERT embeddings
│   │   │   ├── journal-search.service.js   # OpenAlex search & enrichment
│   │   │   ├── pdf.service.js              # Dual PDF text extraction
│   │   │   ├── scoring.service.js          # Multi-signal journal scoring
│   │   │   └── venue-discovery.service.js  # Elite venue discovery & caching
│   │   ├── tests/
│   │   │   └── pdf.service.test.js         # PDF service test suite
│   │   └── utils/
│   │       ├── cosineSimilarity.js         # Cosine similarity computation
│   │       ├── domainMatch.js              # Fuzzy domain matching
│   │       ├── format.js                   # Zod error formatting
│   │       ├── keywordExtractor.js         # Frequency + embedding keyword extraction
│   │       ├── keywordMatch.js             # Substring keyword overlap
│   │       ├── openAlexUtils.js            # OpenAlex inverted index → text
│   │       ├── progressEmitter.js          # SSE progress EventEmitter
│   │       └── semanticKeywordMatch.js     # Embedding-based semantic matching
│   ├── coverage/                           # Test coverage reports
│   ├── logs/                               # Application log files
│   ├── Dockerfile                          # Container build instructions
│   ├── docker-compose.dev.yml              # Development environment
│   ├── docker-compose.prod.yml             # Production environment
│   ├── eslint.config.js                    # ESLint configuration
│   ├── jest.config.mjs                     # Jest test configuration
│   └── package.json                        # Backend dependencies
├── frontend/
│   ├── src/
│   │   ├── App.jsx                         # React Router configuration
│   │   ├── main.jsx                        # React entry point
│   │   ├── index.css                       # Global styles
│   │   ├── Landing.css                     # Landing page animations
│   │   ├── components/
│   │   │   └── StarMap.jsx                 # Animated star background
│   │   └── pages/
│   │       ├── Landing.jsx                 # Landing page with pipeline viz
│   │       ├── AnalyzePage.jsx             # PDF upload + progress overlay
│   │       └── ResultsPage.jsx             # Journal results dashboard
│   ├── public/                             # Static assets
│   ├── index.html                          # HTML entry point
│   ├── vite.config.js                      # Vite configuration
│   ├── tailwind.config.js                  # Tailwind CSS configuration
│   └── package.json                        # Frontend dependencies
├── .gitignore                              # Git exclusions
└── package.json                            # Root monorepo scripts
```

---

## How It Works

### The 7-Step Pipeline

| Step | Process | Service | Duration |
|------|---------|---------|----------|
| **1** | PDF text extraction & abstract detection | `PdfService` (pdf-parse + pdfjs-dist) | ~2s |
| **2** | AI feature extraction + embedding + deep analysis *(parallel)* | `AiService` (Gemini) + `EmbeddingService` (local SBERT) + `AnalysisService` (Groq) | ~8s |
| **3** | Hybrid journal discovery: Vector DB → OpenAlex fallback | `VectorStoreService` + `JournalSearchService` | ~5s |
| **4** | Enrich top candidates with live publication data *(batched, concurrency=10)* | `JournalSearchService` via OpenAlex | ~6s |
| **5** | Multi-signal semantic scoring | `ScoringService` (cosine + domain + keywords + reputation) | ~3s |
| **6** | Generate detailed explanations for top 5 | `AiService` (Groq/Llama-3) | ~5s |
| **7** | Publication readiness assessment | `ScoringService` | ~1s |

### Data Flow

```
PDF Buffer → Raw Text → Abstract → Features JSON → Vector Matches → Enriched Data → Ranked Results → Final Report
```

### Scoring Signals

Each journal candidate is scored using multiple signals:

- **Semantic Similarity** — Cosine similarity between paper embedding and journal centroid embedding
- **Domain Match** — Fuzzy matching with acronym expansion and cross-domain mapping
- **Keyword Overlap** — Both substring-based and embedding-based semantic keyword matching
- **Journal Reputation** — Elite venue lookup with h-index and citation normalization
- **Off-Domain Detection** — Filters out journals that don't align with the paper's research domain

---

## Built on Node-Production-Backend

Orbis was built on top of [Node-Production-Backend](https://github.com/Prayas248/Node-Production-Backend), a production-ready Node.js framework that provided the foundational architecture. Here's what carried over and what was adapted:

### Inherited from the Framework

| Component | What It Provided |
|-----------|-----------------|
| **MVC Architecture** | Controllers → Services → Routes layered structure. Orbis follows the same separation of concerns |
| **Express Configuration** | `app.js` setup pattern — middleware ordering (Helmet → CORS → body parsers → Morgan → routes → error handler) |
| **Winston Logging** | Structured logging with JSON format, file transports (`error.log` + `combined.log`), and colorized console output |
| **Error Middleware** | Centralized `errorHandler` with stack trace exposure in dev, hidden in production |
| **Security Headers** | Helmet.js integration for secure HTTP headers out of the box |
| **Docker Setup** | `Dockerfile`, `docker-compose.dev.yml`, `docker-compose.prod.yml`, and shell scripts for dev/prod Docker workflows |
| **Testing Infrastructure** | Jest configuration with ESM support (`--experimental-vm-modules`), Supertest for HTTP testing, coverage reporting |
| **Code Quality Pipeline** | ESLint + Prettier configuration, format checking, lint-fix scripts |
| **Project Structure** | `src/config/`, `src/controllers/`, `src/middleware/`, `src/services/`, `src/utils/`, `src/routes/` — the entire directory convention |
| **Utility Patterns** | `format.js` (Zod error formatting) and the cookie/JWT utility pattern adapted for domain-specific helpers |
| **Environment Management** | `dotenv` configuration, `NODE_ENV`-aware behavior throughout the codebase |

### What Orbis Added

| Addition | Purpose |
|----------|---------|
| 6 specialized AI services | Gemini, Groq, local SBERT, OpenAlex, scoring engine, venue discovery |
| 8 domain-specific utilities | Cosine similarity, domain matching, keyword extraction, semantic matching, progress emitter, OpenAlex utils |
| Binary vector store | Pre-indexed Float32Array with brute-force cosine search |
| SSE progress streaming | Real-time 7-step pipeline progress via EventEmitter + Server-Sent Events |
| React 19 frontend | Full SPA with animated landing, upload page, results dashboard |
| Hybrid search architecture | Vector DB primary + OpenAlex API fallback with circuit breaker |

The framework's clean separation of concerns made it straightforward to swap out auth controllers for an analysis controller while keeping the same middleware chain, logging, error handling, and Docker setup.

---

## Installation & Setup

### Prerequisites

- Node.js v20+ (v24 recommended)
- npm v9+
- Docker (optional, for containerized deployment)

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/Prayas248/Vibe_Coding.git
   cd Vibe_Coding
   ```

2. **Install backend dependencies**
   ```bash
   cd backend
   npm install
   ```

3. **Install frontend dependencies**
   ```bash
   cd ../frontend
   npm install
   ```

4. **Set up environment variables**
   ```bash
   cd ../backend
   cp .env.example .env
   ```
   Edit `.env` with your API keys (see [Environment Variables](#environment-variables)).

5. **Start the backend**
   ```bash
   npm run dev
   ```

6. **Start the frontend** (in a new terminal)
   ```bash
   cd frontend
   npm run dev
   ```

7. Open `http://localhost:5173` in your browser.

---

## Environment Variables

Create a `.env` file in the `backend/` directory:

```env
# Server
PORT=3000
NODE_ENV=development

# Google Gemini
GEMINI_API_KEY=your-gemini-api-key

# Groq
GROQ_API_KEY=your-groq-api-key

# CORS (optional — defaults to '*')
CORS_ORIGIN=http://localhost:5173

# Frontend (set in frontend/.env)
VITE_API_URL=http://localhost:3000
```

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 3000) |
| `NODE_ENV` | No | Environment (development/production) |
| `GEMINI_API_KEY` | Yes | Google AI API key for Gemini 2.5 Flash |
| `GROQ_API_KEY` | Yes | Groq API key for Llama-3.3-70B |
| `CORS_ORIGIN` | No | Allowed CORS origin (default: `*`) |
| `VITE_API_URL` | No | Backend URL for frontend (default: `http://localhost:3000`) |

> **Note:** OpenAlex API and local embeddings require no API keys. Embeddings run entirely on-server with zero external calls.

---

## API Endpoints

### Analysis

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `POST` | `/analyze` | Upload PDF manuscript for analysis (multipart, 10MB max) | No |
| `GET` | `/analyze/progress/:sessionId` | SSE stream for real-time progress updates | No |

### System

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check (status, uptime, memory usage) |

### POST /analyze

**Request:**
```
Content-Type: multipart/form-data
Header: x-session-id: <uuid>
Body: file (PDF, max 10MB)
```

**Response:**
```json
{
  "features": {
    "summary": "Paper summary...",
    "domain": "Computer Science - NLP",
    "keywords": ["transformers", "attention", "..."],
    "abstractSource": "detected"
  },
  "readinessScore": {
    "overall": 78,
    "factors": { "novelty": 85, "methodology": 72, "..." },
    "acceptanceLevel": "Strong",
    "risks": ["..."],
    "suggestions": ["..."]
  },
  "topJournals": [
    {
      "name": "Neural Networks",
      "focusScore": 93,
      "explanation": "Detailed match explanation...",
      "hIndex": 142,
      "citationCount": 85000
    }
  ],
  "debug": {
    "timings": { "extraction": 2100, "features": 8200, "..." },
    "totalTime": 32500
  }
}
```

---

## Frontend Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/` | `Landing` | Animated landing page with pipeline visualization and StarMap background |
| `/analyze` | `AnalyzePage` | Drag-and-drop PDF upload with full-screen SSE progress overlay |
| `/results/:id` | `ResultsPage` | Journal recommendation dashboard with expandable cards and readiness scores |

---

## Performance

| Metric | Value |
|--------|-------|
| Vector store load time | **17ms** |
| Vector search (3,000 venues) | **<5ms** |
| Full pipeline (end-to-end) | **~30s** |
| Embedding generation (local) | **~2s** per text |
| OpenAlex enrichment (batched) | **~6s** for 30 journals |
| Memory footprint | **~200MB** (including ML model) |
| Vector store size | **11.6MB** (8.8MB embeddings + 2.8MB index) |

### Why It's Fast

- **Parallel execution** — Steps 2 runs 3 operations concurrently via `Promise.all()`
- **Batch enrichment** — OpenAlex lookups run at concurrency=10, not sequentially
- **Binary vector store** — Raw Float32Array, no database overhead, no network latency
- **Embedding cache** — Repeated texts return cached embeddings instantly
- **Local inference** — Embeddings never leave the server; no API round-trip

---

## Cost Analysis

### Demo / Free Tier

| Service | Cost | Notes |
|---------|------|-------|
| Gemini API (Free tier) | $0 | 1,500 requests/day |
| Groq API (Free tier) | $0 | 30 requests/minute |
| OpenAlex API | $0 | Fully free, 100K requests/day |
| Embeddings (Local) | $0 | Runs on-server, no API cost |
| **Total** | **$0/mo** | |

### Enterprise at Scale (500K+ users/mo)

| Service | Cost | Calculation |
|---------|------|-------------|
| Gemini API | ~$1,500/mo | 500K calls × $0.003/call |
| Groq API | ~$1,000/mo | 500K calls × $0.002/call |
| Cloud Infrastructure | ~$200/mo | Auto-scaling 16GB+ (AWS/GCP) |
| CDN + Domain + SSL | ~$50/mo | Global edge caching |
| OpenAlex API | $0 | Free at any scale |
| Embeddings (Local) | $0 | No per-query cost |
| **Total** | **~$2,750/mo** | |

---

## Testing

```bash
cd backend

# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test -- pdf.service.test.js
```

Tests use Jest 30 with ESM support (`--experimental-vm-modules`) and Supertest for HTTP endpoint testing.

---

## Docker Support

### Development

```bash
cd backend
chmod +x development-docker.sh
./development-docker.sh
```

Or directly:
```bash
docker-compose -f docker-compose.dev.yml up --build
```

### Production

```bash
chmod +x production-docker.sh
./production-docker.sh
```

Or directly:
```bash
docker-compose -f docker-compose.prod.yml up --build -d
```

---

## Author

**Prayas Yadav**

- GitHub: [@Prayas248](https://github.com/Prayas248)
- Framework: [Node-Production-Backend](https://github.com/Prayas248/Node-Production-Backend)
- Project: [Vibe_Coding](https://github.com/Prayas248/Vibe_Coding)
