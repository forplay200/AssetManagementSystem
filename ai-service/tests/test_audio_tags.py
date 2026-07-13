import numpy as np

from audio_tags import select_audio_tags


def test_selects_confident_yamnet_tags_in_score_order():
    scores = np.array([0.72, 0.51, 0.08, 0.33])
    labels = ["Speech", "Music", "Noise", "Vehicle"]

    assert select_audio_tags(scores, labels) == [
        "speech",
        "music",
        "vehicle",
    ]


def test_normalizes_deduplicates_and_limits_audio_tags():
    scores = np.array([0.9, 0.8, 0.7, 0.6])
    labels = [" Speech ", "speech", "Music", "Vehicle"]

    assert select_audio_tags(scores, labels, limit=2) == ["speech", "music"]
