def classify_with_clip(classifier, image, candidate_labels, threshold=0.10, limit=5):
    """Run the shared CLIP pipeline and return raw results plus accepted labels."""
    results = classifier(image, candidate_labels=candidate_labels)
    tags = [result["label"] for result in results if result["score"] > threshold][:limit]
    return results, tags
