from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
import redis
import json
import hmac
import os

app = FastAPI()

r = redis.Redis.from_url(os.environ.get("REDIS_URL", "redis://redis:6379"), decode_responses=True)

class JobRequest(BaseModel):
    assetId: int = Field(gt=0)
    jobType: str = Field(min_length=1, max_length=80)


def require_service_token(x_ai_service_token: str | None = Header(default=None)):
    expected = os.environ.get("AI_SERVICE_TOKEN")
    if not expected:
        raise HTTPException(status_code=503, detail="AI service authentication is not configured")
    if not x_ai_service_token:
        raise HTTPException(status_code=401, detail="AI service authentication required")
    if not hmac.compare_digest(expected.encode("utf-8"), x_ai_service_token.encode("utf-8")):
        raise HTTPException(status_code=403, detail="Invalid AI service credentials")


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "ai-service"
    }

@app.post("/jobs", dependencies=[Depends(require_service_token)])
def create_job(job: JobRequest):

    payload = {
        "assetId": job.assetId,
        "jobType": job.jobType
    }

    r.lpush(
        "ai_jobs",
        json.dumps(payload)
    )

    return {
        "assetId": job.assetId,
        "jobType": job.jobType,
        "status": "queued"
    }

