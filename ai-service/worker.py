import redis
import json

r = redis.Redis(
    host="redis",
    port=6379,
    decode_responses=True
)

print("Worker started...")


while True:

    item = r.brpop("ai_jobs")

    payload = json.loads(item[1])

    asset_id = payload["assetId"]

    print(f"Processing Asset {asset_id}")

    tags = [
        "image",
        "screenshot",
        "ui"
    ]

    print("Generated Tags:")
    print(tags)
