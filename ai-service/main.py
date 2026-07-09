from fastapi import FastAPI
from pydantic import BaseModel
import redis
import json

app = FastAPI()

r = redis.Redis(
    host="redis",
    port=6379,
    decode_responses=True
)

class JobRequest(BaseModel):
    assetId: int
    jobType: str


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "ai-service"
    }

@app.post("/jobs")
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

