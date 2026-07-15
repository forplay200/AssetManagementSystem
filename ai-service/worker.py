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
from tags import GAME_TAGS, MODEL_SEMANTIC_TAGS
from audio_tags import select_audio_tags
from model_metadata import extract_model_geometry, extract_model_metadata
from model_render import render_model_preview
from clip_tags import classify_with_clip

BACKEND_HEADERS = {
    "X-AI-Service-Token": os.environ["AI_SERVICE_TOKEN"]
}

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

while True:

    item = r.brpop("ai_jobs")

    payload = json.loads(item[1])

    asset_id = payload["assetId"]

    
    
    asset_response = requests.get(
        f"http://backend:3000/api/assets/{asset_id}/info",
        headers=BACKEND_HEADERS
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

        results, tags = classify_with_clip(
            classifier,
            image,
            GAME_TAGS
        )

        print("\nCLIP Results:")
        print(results)

        print("\nGenerated Tags:")
        print(tags)

        api_response = requests.post(
            f"http://backend:3000/api/assets/{asset_id}/ai-result",
            headers=BACKEND_HEADERS,
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
            headers=BACKEND_HEADERS,
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
            f"http://backend:3000/api/assets/{asset_id}/ai-result",
            headers=BACKEND_HEADERS,
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
            semantic_results, semantic_tags = classify_with_clip(
                classifier,
                rendered_preview,
                MODEL_SEMANTIC_TAGS
            )
            print("\n3D CLIP Results:")
            print(semantic_results)
        except Exception as render_error:
            print("3D semantic rendering failed:", render_error)
            semantic_tags = []

        model_metadata["semanticTags"] = semantic_tags

        print("\n3D Metadata:")
        print(model_metadata)

        api_response = requests.post(
            f"http://backend:3000/api/assets/{asset_id}/ai-result",
            headers=BACKEND_HEADERS,
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

        continue

    print("\nStore Result:")
    print(api_response.status_code)
    print(api_response.text)

    print("\nAI processing completed.")
