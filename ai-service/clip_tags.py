from collections import OrderedDict
from datetime import datetime, timezone
import math


def classify_with_clip(classifier, image, candidate_labels, threshold=0.10, limit=5):
    """Legacy helper retained for callers using the original pipeline contract."""
    results = classifier(image, candidate_labels=candidate_labels)
    tags = [result["label"] for result in results if result["score"] > threshold][:limit]
    return results, tags


class ClipVocabularyTagger:
    """Rank an external vocabulary using the existing CLIP model's embeddings."""

    def __init__(self, classifier, image_threshold=0.25, model_threshold=0.25,
                 max_score_gap=0.04, limit=5, batch_size=64, cache_size=4096):
        import torch

        if not all(math.isfinite(value) and -1 <= value <= 1
                   for value in (image_threshold, model_threshold)):
            raise ValueError("CLIP minimum similarities must be between -1 and 1.")
        if not math.isfinite(max_score_gap) or not 0 <= max_score_gap <= 2:
            raise ValueError("CLIP score gap must be between 0 and 2.")
        if min(limit, batch_size, cache_size) <= 0:
            raise ValueError("CLIP limits, batch sizes and cache sizes must be positive.")
        self.torch = torch
        self.model = classifier.model
        self.model.eval()
        self.tokenizer = classifier.tokenizer
        self.image_processor = classifier.image_processor
        self.device = self.model.device
        self.model_name = "openai/clip-vit-base-patch32"
        self.model_revision = getattr(self.model.config, "_commit_hash", None)
        self.thresholds = {"image": image_threshold, "3d": model_threshold}
        self.max_score_gap = max_score_gap
        self.limit = limit
        self.batch_size = batch_size
        self.cache_size = cache_size
        self.text_cache = OrderedDict()

    def _normalise(self, features):
        # Transformers 4 returns tensors; 5 returns projected pooler outputs.
        if not self.torch.is_tensor(features):
            features = features.pooler_output
        features = features.float()
        return features / features.norm(dim=-1, keepdim=True).clamp_min(1e-12)

    def _text_features(self, prompts, prompt_version):
        keys = [(self.model_name, self.model_revision, prompt_version, prompt) for prompt in prompts]
        vectors = {}
        missing = []
        for key in dict.fromkeys(keys):
            if key in self.text_cache:
                self.text_cache.move_to_end(key)
                vectors[key] = self.text_cache[key]
            else:
                missing.append(key)
        max_length = self.model.config.text_config.max_position_embeddings
        for start in range(0, len(missing), self.batch_size):
            batch = missing[start:start + self.batch_size]
            tokens = self.tokenizer(
                [key[-1] for key in batch], padding=True, truncation=True,
                max_length=max_length, return_tensors="pt"
            ).to(self.device)
            with self.torch.inference_mode():
                encoded = self._normalise(self.model.get_text_features(**tokens, return_dict=True)).cpu()
            for key, vector in zip(batch, encoded):
                # Copy a row so a single cached item does not retain a whole batch.
                vector = vector.clone()
                vectors[key] = vector
                self.text_cache[key] = vector
                if len(self.text_cache) > self.cache_size:
                    self.text_cache.popitem(last=False)
        return self.torch.stack([vectors[key] for key in keys])

    def classify(self, image, vocabulary, asset_type, render_capabilities=()):
        if vocabulary.get("model") != self.model_name:
            raise ValueError("The vocabulary must use the existing CLIP checkpoint.")
        if asset_type not in self.thresholds or vocabulary.get("assetType") != asset_type:
            raise ValueError("The vocabulary does not match this asset type.")
        if not vocabulary.get("revision") or not vocabulary.get("promptVersion"):
            raise ValueError("A versioned vocabulary snapshot is required.")
        templates = vocabulary["promptTemplates"].get(asset_type, {})
        capabilities = set(render_capabilities)
        entries = []
        names = set()
        for entry in vocabulary.get("entries", []):
            if asset_type not in entry.get("assetTypes", []) or entry.get("facet") not in templates:
                continue
            if asset_type == "3d" and entry["facet"] in ("appearance", "style") and "textures" not in capabilities:
                continue
            if asset_type == "3d" and not set(entry.get("requires", [])).issubset(capabilities):
                continue
            if entry["name"] not in names:
                entries.append(entry)
                names.add(entry["name"])

        provenance = {
            "model": self.model_name,
            "modelRevision": self.model_revision,
            "vocabularyVersion": vocabulary["version"],
            "vocabularyRevision": vocabulary["revision"],
            "promptVersion": vocabulary["promptVersion"],
            "candidateCount": len(entries),
            "scoreType": "cosineSimilarity",
            "minimumSimilarity": self.thresholds[asset_type],
            "maximumScoreGap": self.max_score_gap,
            "thresholdStatus": "initial-unvalidated",
            "status": "completed",
            "processedAt": datetime.now(timezone.utc).isoformat(),
            "tagScores": []
        }
        if asset_type == "3d":
            provenance["renderCapabilities"] = sorted(capabilities)
        if not entries:
            return [], [], provenance

        prompts = [templates[entry["facet"]].format(description=entry["description"], name=entry["name"])
                   for entry in entries]
        text_features = self._text_features(prompts, vocabulary["promptVersion"])
        pixels = self.image_processor(images=image.convert("RGB"), return_tensors="pt")
        pixel_values = pixels["pixel_values"].to(device=self.device, dtype=self.model.dtype)
        with self.torch.inference_mode():
            image_features = self._normalise(self.model.get_image_features(pixel_values=pixel_values, return_dict=True)).cpu()
            similarities = (image_features @ text_features.T).clamp(-1, 1)[0].tolist()
        results = sorted([
            {"label": entry["name"], "score": float(score), "facet": entry["facet"],
             "conceptId": entry["id"], "source": entry["source"]}
            for entry, score in zip(entries, similarities) if math.isfinite(score)
        ], key=lambda result: (-result["score"], result["label"]))

        by_facet = {}
        for result in results:
            by_facet.setdefault(result["facet"], []).append(result)
        accepted_groups = []
        for facet_results in by_facet.values():
            best = facet_results[0]["score"]
            accepted = [result for result in facet_results
                        if result["score"] >= self.thresholds[asset_type]
                        and best - result["score"] <= self.max_score_gap]
            if accepted:
                accepted_groups.append(accepted)

        # Represent each matching facet before filling the remaining suggestion slots.
        selected = sorted([group[0] for group in accepted_groups], key=lambda result: -result["score"])[:self.limit]
        selected_names = {result["label"] for result in selected}
        remaining = sorted([result for group in accepted_groups for result in group[1:]],
                           key=lambda result: -result["score"])
        for result in remaining:
            if len(selected) >= self.limit:
                break
            if result["label"] not in selected_names:
                selected.append(result)
                selected_names.add(result["label"])
        selected.sort(key=lambda result: -result["score"])
        provenance["tagScores"] = [{**result, "score": round(result["score"], 6)} for result in selected]
        provenance["processedAt"] = datetime.now(timezone.utc).isoformat()
        return results, [result["label"] for result in selected], provenance
