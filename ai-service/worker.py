import redis
import json
import requests
import torch
import whisper

from minio import Minio
from io import BytesIO
from keybert import KeyBERT

from PIL import Image
from transformers import pipeline
from tags import GAME_TAGS

minio_client = Minio(
    "minio:9000",
    access_key="minioadmin",
    secret_key="minioadmin",
    secure=False
)

# Redis connection
r = redis.Redis(
    host="redis",
    port=6379,
    decode_responses=True
)

print("Loading CLIP model...")

classifier = pipeline(
    "zero-shot-image-classification",
    model="openai/clip-vit-base-patch32"
)

kw_model = KeyBERT()


print("Loading Whisper model...")

whisper_model = whisper.load_model("base")

print("Whisper model loaded.")


print("CLIP model loaded.")
print("Worker started...")

while True:

    item = r.brpop("ai_jobs")

    payload = json.loads(item[1])

    asset_id = payload["assetId"]

    
    
    asset_response = requests.get(
        f"http://backend:3000/api/assets/{asset_id}/info"
    )


    
    print("Status:")
    print(asset_response.status_code)

    print("Response:")
    print(asset_response.text)

    
    asset = asset_response.json()

    object_key = asset["filename"]

    print(f"Object Key: {object_key}")
    print(f"\nProcessing Asset {asset_id}")

    if object_key.lower().endswith(
        (".png", ".jpg", ".jpeg", ".gif", ".webp")
    ):

        print("Image Asset Detected")

        object_response = minio_client.get_object(
            "assets",
            object_key
        )

        image_bytes = object_response.read()

        image = Image.open(
            BytesIO(image_bytes)
        )

        results = classifier(
            image,
            candidate_labels=GAME_TAGS
        )

        print("\nCLIP Results:")
        print(results)

        tags = [
            result["label"]
            for result in results
            if result["score"] > 0.10
        ][:5]

        print("\nGenerated Tags:")
        print(tags)

        api_response = requests.post(
            f"http://backend:3000/api/assets/{asset_id}/ai-result",
            json={                
                "metadata": {
                "ai": {
                    "type": "image",
                    "imageTags": tags
                        }

        }

            }
        )

    elif object_key.lower().endswith(
        (".txt", ".json", ".xml", ".js", ".cs")
    ):

        print("Text Asset Detected")

        object_response = minio_client.get_object(
            "assets",
            object_key
        )

        text_content = (
            object_response.read()
            .decode("utf-8")
        )

        keywords = kw_model.extract_keywords(
            text_content,
            top_n=5
        )

        tags = [
            keyword[0]
            for keyword in keywords
        ]

        print("\nKeywords:")
        print(tags)

        api_response = requests.post(
            f"http://backend:3000/api/assets/{asset_id}/ai-result",
            json={
                "metadata": {             
                "ai": {
                    "type": "text",
                    "keywords": tags
                    }
                }
            }
        )
    elif object_key.lower().endswith(
            (".mp3", ".wav", ".m4a")
    ):
        print("Audio Asset Detected")

        object_response = minio_client.get_object(
            "assets",
            object_key
        )
        audio_bytes = object_response.read()
       
        temp_file = f"/tmp/{object_key}"

        with open(temp_file, "wb") as f:
            f.write(audio_bytes)

        print("Saved:", temp_file)


        result = whisper_model.transcribe(
            temp_file
        )

        transcript = result["text"]

        
        print("\nTranscript:")
        print(transcript)

        
        keywords = [
            keyword[0]
            for keyword in keywords
        ]

        summary = (
            "Audio discusses: "
            + ", ".join(keywords)
        )

        
        print("\nKeywords:")
        print(keywords)

        
        summary = (
            "Audio discusses: "
            + ", ".join(keywords)
        )

        print("\nSummary:")
        print(summary)

        api_response = requests.post(
            f"http://backend:3000/api/assets/{asset_id}/ai-result",
            json={
                "metadata": {
                "ai": {
                    "type": "audio",
                    "transcript": transcript,
                    "keywords": keywords,
                    "summary": summary


                    }
                }
            }
       )


    else:

        print(
            f"Skipping asset {asset_id} because file type is unsupported"
        )

        continue

    print("\nStore Result:")
    print(api_response.status_code)
    print(api_response.text)

    print("\nAI processing completed.")
