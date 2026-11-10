# AI Service Runtime

## Current Architecture

AI processing uses two independent long-running processes connected through Redis:

```text
Backend authorized upload / replacement / Regenerate
  -> backend writes directly to Redis list ai_jobs
  -> ai-worker blocks on ai_jobs
  -> worker reads the asset from the backend and MinIO
  -> worker generates AI metadata
  -> worker posts the result to the backend
```

The FastAPI application in `main.py` owns the health and compatibility `/jobs` HTTP endpoints. `worker.py` owns model loading and Redis queue consumption. Browser requests use the backend, which checks workspace role and asset uploader before enqueueing. Backend source currently calls Redis directly, not FastAPI `/jobs`.

## Historical Root Cause

The AI image defined only this default command:

```text
uvicorn main:app --host 0.0.0.0 --port 8000
```

Docker Compose started the FastAPI producer, so `POST /jobs` returned a queued response and Redis received the job. No container started `worker.py`, leaving the queue without a consumer. Assets therefore remained with empty metadata.

## Original Worker Startup Fix

- Kept the existing `ai-service` container and its FastAPI `/jobs` endpoint at that stage. The endpoint now requires internal service authentication, as described below.
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

The backend writes jobs directly to Redis `ai_jobs`, and the independently restartable `ai-worker` consumes them. The `-u` option keeps worker logs unbuffered for container observability.

To verify the runtime after startup:

```text
docker compose ps ai-service ai-worker
docker compose logs ai-worker
```

The worker log should show model loading followed by `Worker started...`. Newly uploaded supported assets should then receive an `ai` object in their metadata after processing completes.

## Internal Service Authentication

Workspace isolation keeps the worker's asset-ID workflow but removes unauthenticated access to its backend callbacks. Docker Compose supplies the same `AI_SERVICE_TOKEN` to the backend and worker. The worker sends it as `X-AI-Service-Token` when reading `/api/assets/:id/info` and posting `/api/assets/:id/ai-result`; the backend uses a constant-time comparison before allowing either call. Set a deployment-specific `AI_SERVICE_TOKEN` outside local development.

### Queue Authorization Update 2026-10-13

- User-triggered jobs use `POST /api/assets/ai/job`. Owner may request analysis for any asset in the current workspace; Manager only for their original uploads; Collaborator cannot enqueue. Denied requests do not reach Redis.
- FastAPI `/jobs` remains for trusted internal service compatibility. It requires `X-AI-Service-Token`, checked against `AI_SERVICE_TOKEN` with a constant-time comparison. No configured secret returns 503, no credential returns 401, and a wrong credential returns 403. None enqueue a job. A browser JWT is not a service credential.
- Compose no longer publishes AI port 8000 or Redis port 6379 to the host. Services remain reachable on the Compose network (`ai-service:8000`, `redis:6379`). Health remains available internally without a secret.
- Worker callbacks retain internal credentials and the existing changed-source check. Their authorization is separate from browser asset ownership; a legitimately accepted job may finish after a member's role changes. Existing queues are not cleared.
- New Compose network settings and source changes require rebuilding/recreating the affected containers before they apply to a running stack. Local unit/route tests do not prove live container behavior.

Deployment and live checks were completed on 2026-10-13. This update reused the existing AI runtime image and copied only changed application files and the regression test; it did not reinstall model dependencies. Dedicated test assets exercised authorized queueing, service HTTP authentication and actual worker callbacks. The worker processed its accepted jobs and the queue returned to zero before test cleanup.

The live check also exposed an idle worker restart: the installed Redis client imposed a socket read deadline while `BRPOP` waited without a queue timeout. The worker now explicitly uses `socket_timeout=None`; this changes the queue connection setting only. Model loading and inference logic remain unchanged. The regression test executes the production Redis connection expression without loading models to check that setting.

Run the compatibility endpoint tests inside an AI environment with FastAPI, Redis and HTTPX installed:

```text
python -m unittest discover -s tests -p test_job_authorization.py -v
```

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
