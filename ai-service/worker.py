import redis
import json
import requests
import torch
import whisper
import csv
import os
import librosa
import tensorflow as tf
import tensorflow_hub as hub

from minio import Minio
from io import BytesIO
from keybert import KeyBERT

from PIL import Image
from transformers import pipeline
from audio_tags import select_audio_tags
from model_metadata import extract_model_geometry, extract_model_metadata
from model_render import render_model_preview
from clip_tags import ClipVocabularyTagger

BACKEND_HEADERS = {
    "X-AI-Service-Token": os.environ["AI_SERVICE_TOKEN"]
}
BACKEND_URL = os.getenv("BACKEND_URL", "http://backend:3000").rstrip("/")

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
    model="openai/clip-vit-base-patch32",
    device=os.getenv("CLIP_DEVICE", "cpu")
)
visual_tagger = ClipVocabularyTagger(
    classifier,
    image_threshold=float(os.getenv("CLIP_IMAGE_MIN_SIMILARITY", "0.25")),
    model_threshold=float(os.getenv("CLIP_MODEL_MIN_SIMILARITY", "0.25")),
    max_score_gap=float(os.getenv("CLIP_MAX_SCORE_GAP", "0.04"))
)

kw_model = KeyBERT()


print("Loading Whisper model...")

whisper_model = whisper.load_model("base")

print("Whisper model loaded.")

print("Loading YAMNet model...")

yamnet_model = hub.load(
    os.getenv("YAMNET_MODEL_URL", "https://tfhub.dev/google/yamnet/1")
)

with tf.io.gfile.GFile(
    yamnet_model.class_map_path().numpy().decode("utf-8")
) as class_map_file:
    yamnet_class_names = [
        row["display_name"]
        for row in csv.DictReader(class_map_file)
    ]

print("YAMNet model loaded.")


print("CLIP model loaded.")
print("Worker started...")

def process_asset(payload):
    asset_id = payload["assetId"]

    
    
    asset_response = requests.get(
        f"{BACKEND_URL}/api/assets/{asset_id}/info",
        headers=BACKEND_HEADERS,
        timeout=30
    )


    
    print("Status:")
    print(asset_response.status_code)

    
    asset_response.raise_for_status()
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

        results, tags, clip_metadata = visual_tagger.classify(
            image,
            asset["clipVocabulary"],
            "image"
        )
        clip_metadata["sourceFilename"] = object_key

        print("\nCLIP Results:")
        print(results[:10])

        print("\nGenerated Tags:")
        print(tags)

        api_response = requests.post(
            f"{BACKEND_URL}/api/assets/{asset_id}/ai-result",
            headers=BACKEND_HEADERS,
            timeout=30,
            json={                
                "metadata": {
                "ai": {
                    "type": "image",
                    "imageTags": tags,
                    "clip": clip_metadata
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
            f"{BACKEND_URL}/api/assets/{asset_id}/ai-result",
            headers=BACKEND_HEADERS,
            timeout=30,
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

        keyword_results = kw_model.extract_keywords(
            transcript,
            top_n=5
        )

        keywords = [
            keyword[0]
            for keyword in keyword_results
        ]

        summary = (
            "Audio discusses: "
            + ", ".join(keywords)
        ) if keywords else "No summary generated."

        waveform, _ = librosa.load(
            temp_file,
            sr=16000,
            mono=True
        )

        yamnet_scores, _, _ = yamnet_model(waveform)
        mean_scores = tf.reduce_mean(yamnet_scores, axis=0).numpy()
        audio_tags = select_audio_tags(
            mean_scores,
            yamnet_class_names
        )

        
        print("\nKeywords:")
        print(keywords)

        
        print("\nSummary:")
        print(summary)

        print("\nYAMNet Audio Tags:")
        print(audio_tags)

        api_response = requests.post(
            f"{BACKEND_URL}/api/assets/{asset_id}/ai-result",
            headers=BACKEND_HEADERS,
            timeout=30,
            json={
                "metadata": {
                "ai": {
                    "type": "audio",
                    "transcript": transcript,
                    "keywords": keywords,
                    "summary": summary,
                    "audioTags": audio_tags


                    }
                }
            }
       )


    elif object_key.lower().endswith((".obj", ".fbx")):
        print("3D Asset Detected")

        object_response = minio_client.get_object(
            "assets",
            object_key
        )
        model_bytes = object_response.read()
        model_metadata = extract_model_metadata(
            object_key,
            model_bytes
        )

        try:
            vertices, triangles = extract_model_geometry(
                object_key,
                model_bytes
            )
            rendered_preview = render_model_preview(
                vertices,
                triangles
            )
            semantic_results, semantic_tags, clip_metadata = visual_tagger.classify(
                rendered_preview,
                asset["clipVocabulary"],
                "3d",
                render_capabilities=("geometry",)
            )
            print("\n3D CLIP Results:")
            print(semantic_results[:10])
        except Exception as render_error:
            print("3D semantic rendering failed:", render_error)
            semantic_tags = []
            clip_metadata = {
                "model": "openai/clip-vit-base-patch32",
                "vocabularyVersion": asset.get("clipVocabulary", {}).get("version"),
                "vocabularyRevision": asset.get("clipVocabulary", {}).get("revision"),
                "status": "failed",
                "renderCapabilities": ["geometry"],
                "tagScores": []
            }

        model_metadata["semanticTags"] = semantic_tags
        clip_metadata["sourceFilename"] = object_key
        model_metadata["clip"] = clip_metadata

        print("\n3D Metadata:")
        print(model_metadata)

        api_response = requests.post(
            f"{BACKEND_URL}/api/assets/{asset_id}/ai-result",
            headers=BACKEND_HEADERS,
            timeout=30,
            json={
                "metadata": {
                    "ai": model_metadata
                }
            }
        )


    else:

        print(
            f"Skipping asset {asset_id} because file type is unsupported"
        )

        return

    print("\nStore Result:")
    print(api_response.status_code)
    print(api_response.text)
    api_response.raise_for_status()
    print("\nAI processing completed.")


while True:
    _, raw_payload = r.brpop("ai_jobs")
    payload = None
    try:
        payload = json.loads(raw_payload)
        process_asset(payload)
    except requests.RequestException as request_error:
        print("AI job request failed:", request_error, flush=True)
        status = request_error.response.status_code if request_error.response is not None else None
        attempts = payload.get("attempts", 0) if isinstance(payload, dict) else 3
        if (status is None or status >= 500) and attempts < 3:
            r.lpush("ai_jobs", json.dumps({**payload, "attempts": attempts + 1}))
    except Exception as processing_error:
        print("AI job processing failed:", processing_error, flush=True)
