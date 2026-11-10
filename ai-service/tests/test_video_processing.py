import math
import shutil
from pathlib import Path

import pytest
from video_processing import aggregate, analyse, sample_times
from video_policy import detect_container


def test_midpoints_and_invalid_duration():
    assert sample_times(0.04) == [0.02]
    assert sample_times(4) == [1, 3]
    assert len(sample_times(60)) == 30
    modern = {'version': 'midpoint-v2', 'intervalSeconds': 2, 'maxFrames': 45}
    assert len(sample_times(60, modern)) == 30
    assert len(sample_times(90, modern)) == len(sample_times(180, modern)) == 45
    assert sample_times(180, modern)[0] == 2
    assert len(sample_times(180)) == 30  # Existing v1 snapshots retain their cap.
    for policy in [{**modern, 'maxFrames': 46}, {**modern, 'version': 'future'}, {**modern, 'intervalSeconds': 0}]:
        with pytest.raises(ValueError):
            sample_times(4, policy)
    for value in (0, -1, 180.01, math.inf, math.nan):
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


@pytest.mark.skipif(not shutil.which('ffmpeg') or not shutil.which('ffprobe'), reason='Requires actual FFmpeg/ffprobe')
@pytest.mark.parametrize('codec,extension,audio', [('libx264', 'mp4', None), ('libvpx', 'webm', None), ('libvpx-vp9', 'webm', None)])
@pytest.mark.parametrize('duration,expected', [(60, 30), (180, 45)])
@pytest.mark.parametrize('version,cap', [('midpoint-v1', 30), ('midpoint-v2', 45)])
def test_long_real_formats_use_one_decode_and_fixed_sampling(tmp_path, monkeypatch, codec, extension, audio, duration, expected, version, cap):
    import json
    import subprocess
    import video_processing
    local = tmp_path / f'source.{extension}'
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', f'color=c=blue:s=160x120:r=7:d={duration}',
                    *(['-f', 'lavfi', '-i', f'sine=duration={duration}', '-c:a', audio] if audio else []),
                    '-c:v', codec, '-pix_fmt', 'yuv420p', '-threads', '1', str(local)], check=True, timeout=40)
    probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_format', '-of', 'json', str(local)]))
    duration = float(probe['format']['duration'])
    # Audio encoder padding can push a nominal 180 second file over the limit;
    # choose silent long boundary media and test audio combinations separately.
    if duration > 180:
        subprocess.run(['ffmpeg', '-v', 'error', '-i', str(local), '-map', '0:v:0', '-c', 'copy', '-an', '-y', str(tmp_path / f'silent.{extension}')], check=True)
        local = tmp_path / f'silent.{extension}'
        duration = float(json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_format', '-of', 'json', str(local)]))['format']['duration'])
    calls = []
    original = video_processing.run_media
    def instrument(binary, *args, **kwargs):
        calls.append(binary)
        return original(binary, *args, **kwargs)
    monkeypatch.setattr(video_processing, 'run_media', instrument)

    class Tagger:
        def classify(self, image, vocabulary, asset_type):
            assert asset_type == 'image'
            return ([], [], {})

    job = {'input': {'media': {'container': extension, 'videoCodec': {'libx264': 'h264', 'libvpx': 'vp8', 'libvpx-vp9': 'vp9'}[codec],
            'encodedWidth': 160, 'encodedHeight': 120, 'durationSeconds': duration},
            'sampling': {'version': version, 'intervalSeconds': 2, 'maxFrames': cap}, 'vocabulary': {},
            'aggregation': {'minimumSimilarity': .25, 'maximumScoreGap': .04, 'maxCandidates': 10, 'maxEvidence': 10}}}
    output = analyse(local, tmp_path, job, Tagger(), lambda: 120, lambda stage: None)
    assert output['sampling']['requestedCount'] == min(expected, cap)
    assert output['sampling']['decodedCount'] == min(expected, cap)
    assert output['sampling']['requestIndices'] == list(range(min(expected, cap)))
    assert calls.count('ffmpeg') == 1
    assert len(output['frames']) == 1 and output['candidates'] == []


@pytest.mark.skipif(not shutil.which('ffmpeg') or not shutil.which('ffprobe'), reason='Requires actual FFmpeg/ffprobe')
@pytest.mark.parametrize('codec', ['libvpx', 'libvpx-vp9'])
def test_webm_extremely_short_clip_retains_first_frame_fallback(tmp_path, codec):
    import subprocess
    local = tmp_path / 'single.webm'
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'color=blue:s=120x160:r=25:d=0.04', '-c:v', codec, '-threads', '1', str(local)], check=True)
    class Tagger:
        def classify(self, *_):
            return ([], [], {})
    job = {'input': {'media': {'container': 'webm', 'videoCodec': 'vp8' if codec == 'libvpx' else 'vp9', 'encodedWidth': 120, 'encodedHeight': 160, 'durationSeconds': .04},
           'sampling': {'version': 'midpoint-v2', 'intervalSeconds': 2, 'maxFrames': 45}, 'vocabulary': {},
           'aggregation': {'minimumSimilarity': .25, 'maximumScoreGap': .04, 'maxCandidates': 10, 'maxEvidence': 10}}}
    output = analyse(local, tmp_path, job, Tagger(), lambda: 60, lambda stage: None)
    assert output['sampling']['times'] == [0.0]
    assert output['sampling']['requestIndices'] == [0]


def test_worker_container_parser_refuses_mkv_and_unbounded_headers():
    assert detect_container(bytes.fromhex('1a45dfa3874282847765626d')) == 'webm'
    for header in [b'garbage', bytes.fromhex('1a45dfa3ff'), bytes.fromhex('1a45dfa38b4282886d6174726f736b61')]:
        with pytest.raises(ValueError):
            detect_container(header)


@pytest.mark.skipif(not shutil.which('ffmpeg') or not shutil.which('ffprobe'), reason='Requires actual FFmpeg/ffprobe')
def test_vfr_nonzero_start_and_rotation_preserve_actual_pts(tmp_path):
    import subprocess, json
    source = tmp_path / 'vfr.mp4'
    rotated = tmp_path / 'rotated.mp4'
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=160x120:r=10:d=8',
        '-vf', r'select=lt(t\,3)*not(mod(n\,2))+gte(t\,3)*not(mod(n\,3)),setpts=PTS+7/TB', '-fps_mode', 'vfr', '-c:v', 'libx264', '-threads', '1', str(source)], check=True)
    help_text = subprocess.check_output(['ffmpeg', '-hide_banner', '-h', 'full'], stderr=subprocess.DEVNULL).decode('utf-8', 'replace')
    rotation_option = ['-display_rotation:v:0', '90'] if '-display_rotation' in help_text else []
    subprocess.run(['ffmpeg', '-v', 'error', '-copyts', *rotation_option, '-i', str(source), '-c', 'copy', '-metadata:s:v:0', 'rotate=90', str(rotated)], check=True)
    probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_format', '-show_frames', '-of', 'json', str(rotated)]))
    duration = float(probe['format']['duration']); origin = float(probe['format']['start_time'])
    assert origin > 0
    source_pts = [float(f['best_effort_timestamp_time']) - origin for f in probe['frames'] if f['media_type'] == 'video']
    sizes = []
    class Tagger:
        def classify(self, image, *_):
            sizes.append(image.size)
            return ([], [], {})
    policy = {'version': 'midpoint-v2', 'intervalSeconds': 2, 'maxFrames': 45}
    job = {'input': {'media': {'container': 'mp4', 'videoCodec': 'h264', 'encodedWidth': 160, 'encodedHeight': 120, 'durationSeconds': duration},
           'sampling': policy, 'vocabulary': {}, 'aggregation': {'minimumSimilarity': .25, 'maximumScoreGap': .04, 'maxCandidates': 10, 'maxEvidence': 10}}}
    result = analyse(rotated, tmp_path, job, Tagger(), lambda: 60, lambda stage: None)
    assert all(size[0] < size[1] for size in sizes)  # FFmpeg autorotation is preserved.
    assert all(any(abs(actual - t) < 1e-6 for t in source_pts) for actual in result['sampling']['times'])
    assert result['sampling']['times'] != sample_times(duration, policy)
    assert len(set(result['sampling']['times'])) == result['sampling']['decodedCount']


@pytest.mark.skipif(not shutil.which('ffmpeg') or not shutil.which('ffprobe'), reason='Requires actual FFmpeg/ffprobe')
@pytest.mark.parametrize('sparse_frames,passes', [(3, True), (2, False)])
def test_sparse_pts_gaps_are_not_reused_as_multiple_frames(tmp_path, sparse_frames, passes):
    import json, subprocess
    local = tmp_path / 'sparse.mp4'
    expr = 'if(eq(N,0),0,if(eq(N,1),3,7))/TB' if sparse_frames == 3 else '7*PTS'
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', f'color=blue:s=160x120:r=1:d={sparse_frames}',
        '-vf', 'setpts=' + expr.replace(',', r'\,'), '-fps_mode', 'vfr', '-c:v', 'libx264', '-threads', '1', str(local)], check=True)
    duration = float(json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_format', '-of', 'json', str(local)]))['format']['duration'])
    class Tagger:
        def classify(self, *_):
            return ([], [], {})
    job = {'input': {'media': {'container': 'mp4', 'videoCodec': 'h264', 'encodedWidth': 160, 'encodedHeight': 120, 'durationSeconds': duration},
        'sampling': {'version': 'midpoint-v2', 'intervalSeconds': 2, 'maxFrames': 45}, 'vocabulary': {},
        'aggregation': {'minimumSimilarity': .25, 'maximumScoreGap': .04, 'maxCandidates': 10, 'maxEvidence': 10}}}
    if not passes:
        with pytest.raises(ValueError, match='Too few sampled frames'):
            analyse(local, tmp_path, job, Tagger(), lambda: 60, lambda stage: None)
    else:
        result = analyse(local, tmp_path, job, Tagger(), lambda: 60, lambda stage: None)
        assert result['sampling']['decodedCount'] == 2
        assert result['sampling']['requestIndices'] == [1, 3]
