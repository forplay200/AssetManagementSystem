import math
import shutil
from pathlib import Path

import pytest
from video_processing import aggregate, analyse, sample_times


def test_midpoints_and_invalid_duration():
    assert sample_times(0.04) == [0.02]
    assert sample_times(4) == [1, 3]
    assert len(sample_times(60)) == 30
    for value in (0, -1, 60.01, math.inf, math.nan):
        with pytest.raises(ValueError):
            sample_times(value)


def test_full_scores_are_aggregated_by_facet_and_evidence_is_bounded():
    samples = []
    for i in range(30):
        samples.append(({"id": f"f{i}"}, [
            {"label": "bird", "score": 0.31, "facet": "content"},
            {"label": "penguin", "score": 0.29 if i == 4 else 0.15, "facet": "content"},
            {"label": "blue", "score": 0.32, "facet": "appearance"},
            {"label": "noise", "score": math.nan, "facet": "content"}]))
    candidates, evidence = aggregate(samples, {"minimumSimilarity": 0.25, "maximumScoreGap": 0.04, "maxCandidates": 10, "maxEvidence": 10})
    penguin = next(c for c in candidates if c["name"] == "penguin")
    assert penguin["hitFrameCount"] == 1 and penguin["frameIds"] == ["f4"]
    assert len(evidence) <= 10
    assert all(len(c["frameIds"]) <= 2 for c in candidates)
    assert {c["facet"] for c in candidates} == {"appearance", "content"}


def test_success_without_candidates():
    candidates, evidence = aggregate([({"id": "f0"}, [{"label": "bird", "score": 0.1, "facet": "content"}])], {"minimumSimilarity": 0.25, "maximumScoreGap": 0.04, "maxCandidates": 10, "maxEvidence": 10})
    assert candidates == [] and evidence == set()


@pytest.mark.skipif(not shutil.which('ffmpeg') or not shutil.which('ffprobe'), reason='Requires actual FFmpeg/ffprobe')
@pytest.mark.parametrize("length,fps,expected", [(3.2, 7, 2), (0.04, 25, 1)])
def test_real_decode_records_actual_pts_and_uses_image_vocabulary(tmp_path, length, fps, expected):
    import subprocess
    local = tmp_path / 'source.mp4'
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', f'color=c=blue:s=160x120:r={fps}:d={length}', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', str(local)], check=True, timeout=20)
    raw = subprocess.check_output(['ffprobe', '-v', 'error', '-show_format', '-of', 'json', str(local)], timeout=15)
    import json
    duration = float(json.loads(raw)['format']['duration'])
    calls = []

    class Tagger:
        def classify(self, image, vocabulary, asset_type):
            calls.append((image.size, vocabulary, asset_type))
            return ([{'label': 'blue', 'facet': 'appearance', 'score': 0.4}], [], {'modelRevision': 'test'})

    job = {'input': {'media': {'encodedWidth': 160, 'encodedHeight': 120, 'durationSeconds': duration}, 'vocabulary': {'revision': 'fixed'}, 'aggregation': {'minimumSimilarity': 0.25, 'maximumScoreGap': 0.04, 'maxCandidates': 10, 'maxEvidence': 10}}}
    output = analyse(local, tmp_path, job, Tagger(), lambda: 60, lambda stage: None)
    assert output['sampling']['decodedCount'] == expected
    assert all(call[2] == 'image' for call in calls)
    assert output['sampling']['times'] != sample_times(duration)
    assert output['frames'][0]['jpegBase64']
