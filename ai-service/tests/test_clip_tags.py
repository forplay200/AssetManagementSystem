from clip_tags import classify_with_clip


def test_shared_clip_pipeline_applies_existing_threshold_and_limit():
    calls = []

    def classifier(image, candidate_labels):
        calls.append((image, candidate_labels))
        return [
            {"label": "car", "score": 0.91},
            {"label": "vehicle", "score": 0.72},
            {"label": "transportation", "score": 0.43},
            {"label": "noise", "score": 0.08},
        ]

    results, tags = classify_with_clip(classifier, "rendered-image", ["car", "vehicle", "transportation", "noise"])
    assert len(results) == 4
    assert tags == ["car", "vehicle", "transportation"]
    assert calls == [("rendered-image", ["car", "vehicle", "transportation", "noise"])]
