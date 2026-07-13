# AI Service Runtime

## Current Architecture

AI processing uses two independent long-running processes connected through Redis:

```text
Backend upload
  -> POST http://ai-service:8000/jobs
  -> FastAPI pushes a job to Redis list ai_jobs
  -> ai-worker blocks on ai_jobs
  -> worker reads the asset from the backend and MinIO
  -> worker generates AI metadata
  -> worker posts the result to the backend
```

The FastAPI application in `main.py` owns the health and `/jobs` HTTP endpoints. `worker.py` owns model loading and Redis queue consumption. These responsibilities remain separate.

## Root Cause

The AI image defined only this default command:

```text
uvicorn main:app --host 0.0.0.0 --port 8000
```

Docker Compose started the FastAPI producer, so `POST /jobs` returned a queued response and Redis received the job. No container started `worker.py`, leaving the queue without a consumer. Assets therefore remained with empty metadata.

## Fix Applied

- Kept the existing `ai-service` container and its FastAPI `/jobs` endpoint unchanged.
- Added a dedicated `ai-worker` Compose service built from the same AI image.
- Overrode only the worker service command with `python -u worker.py`.
- Added `restart: unless-stopped` so both AI processes recover from process or host restarts.
- Added `init: true` so Docker provides correct signal forwarding and child-process reaping.
- Kept the worker internal-only; it exposes no host port.
- Declared backend, MinIO, and Redis startup dependencies for the worker.
- Removed the obsolete Compose schema-version declaration so current Docker Compose validates the file without the version warning.

No manual `python /app/worker.py` command is required.

## Updated Docker Startup Flow

Running the normal stack command starts both processes automatically:

```text
docker compose up --build
```

Compose now starts:

1. `ai-service`: `uvicorn main:app --host 0.0.0.0 --port 8000`
2. `ai-worker`: `python -u worker.py`

The backend continues sending jobs to `http://ai-service:8000/jobs`. Redis stores the jobs in `ai_jobs`, and the independently restartable `ai-worker` consumes them. The `-u` option keeps worker logs unbuffered for container observability.

To verify the runtime after startup:

```text
docker compose ps ai-service ai-worker
docker compose logs ai-worker
```

The worker log should show model loading followed by `Worker started...`. Newly uploaded supported assets should then receive an `ai` object in their metadata after processing completes.

## YAMNet Audio Classification

The audio worker preserves the existing Whisper transcription, KeyBERT keyword, and summary pipeline. It now also loads Google YAMNet once at worker startup and classifies the same audio as a mono 16 kHz waveform.

The five highest-confidence YAMNet labels above `0.10` are normalized to lowercase and added without changing existing fields:

```json
{
  "ai": {
    "type": "audio",
    "transcript": "...",
    "keywords": [],
    "summary": "...",
    "audioTags": ["speech", "music"]
  }
}
```

The Docker image downloads YAMNet during image construction alongside the existing model preparation. This avoids downloading the model while processing the first queued audio asset. The AI Metadata panel displays `audioTags`, and canonical `q` search includes them through the existing `metadata.ai` query.

## 3D Metadata Extraction

The same worker detects OBJ and FBX storage keys and routes their bytes through the dependency-light `model_metadata` extractor. It stores `type: "3d"`, available vertex/face counts, and generated `modelTags` through the existing AI result callback. See `docs/3d-processing.md` for format details and test coverage.

The 3D path now also creates an in-memory representative software render and passes it through the already-loaded CLIP classifier. Rendering/classification failures are isolated so deterministic counts and `modelTags` still persist; successful semantic results are added only as `semanticTags`.
