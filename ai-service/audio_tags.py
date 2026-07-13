import numpy as np


def select_audio_tags(mean_scores, class_names, threshold=0.10, limit=5):
    """Return unique, normalized YAMNet labels ordered by confidence."""
    scores = np.asarray(mean_scores)
    tags = []

    for class_index in np.argsort(scores)[::-1]:
        if scores[class_index] < threshold or len(tags) >= limit:
            break
        tag = class_names[class_index].strip().lower()
        if tag and tag not in tags:
            tags.append(tag)

    return tags
