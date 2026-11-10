"""Bounded, visual-only video analysis using the existing image CLIP vocabulary."""
import base64
from io import BytesIO
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time

from PIL import Image
import requests
from video_policy import (MAX_BYTES, MAX_SAMPLE_BYTES, TASK_SECONDS, LEGACY_SAMPLING,
                          sample_times, input_options, detect_container, validate_source)

ROOT = Path(tempfile.gettempdir()) / "aether-video-jobs"


def run_media(binary, args, directory, timeout, max_samples=None, allow_partial=False):
    command = [binary, *args]
    if sys.platform == "linux":
        command = [sys.executable, str(Path(__file__).with_name("video_decoder.py")), *command]
    with tempfile.TemporaryFile(dir=directory) as out, tempfile.TemporaryFile(dir=directory) as err:
        process = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=out, stderr=err)
        try:
            deadline = time.monotonic() + timeout
            while process.poll() is None:
                if time.monotonic() > deadline:
                    raise subprocess.TimeoutExpired(command, timeout)
                if os.fstat(out.fileno()).st_size > 4 * 1024**2 or os.fstat(err.fileno()).st_size > 4 * 1024**2:
                    raise ValueError("Media output exceeded its limit")
                if max_samples is not None:
                    sizes = [p.stat().st_size for p in directory.glob("sample-*.jpg")]
                    if len(sizes) > max_samples or any(s > MAX_SAMPLE_BYTES for s in sizes) or sum(sizes) > max_samples * MAX_SAMPLE_BYTES:
                        raise ValueError("Sample images exceeded their disk budget")
                time.sleep(0.05)
        finally:
            if process.poll() is None:
                process.kill()
            process.wait()
        if out.tell() > 4 * 1024**2 or err.tell() > 4 * 1024**2:
            raise ValueError("Media output exceeded its limit")
        out.seek(0)
        err.seek(0)
        stdout, stderr = out.read().decode("utf-8", "replace"), err.read().decode("utf-8", "replace")
        if process.returncode and not (allow_partial and re.search(r'\bn:\s*\d+\s+pts:', stderr)):
            raise ValueError("Video could not be decoded")
        return stdout, stderr


def cleanup_stale():
    ROOT.mkdir(mode=0o700, parents=True, exist_ok=True)
    for path in ROOT.iterdir():
        # Only directories this module creates; one task may run for at most five minutes.
        if path.name.startswith("job-") and path.is_dir() and not path.is_symlink() and time.time() - path.stat().st_mtime > 3600:
            shutil.rmtree(path)


def aggregate(samples, parameters):
    concepts = {}
    for frame, results in samples:
        facets = {}
        for r in results:
            if math.isfinite(r["score"]):
                facets[r["facet"]] = max(facets.get(r["facet"], -1), r["score"])
        for r in results:
            score = r["score"]
            if not math.isfinite(score):
                continue
            item = concepts.setdefault(r["label"], {"name": r["label"], "facet": r["facet"], "maxScore": -1, "hits": []})
            item["maxScore"] = max(score, item["maxScore"])
            if score >= parameters["minimumSimilarity"] and facets[r["facet"]] - score <= parameters["maximumScoreGap"]:
                item["hits"].append((score, frame["id"]))
    ranked = sorted((c for c in concepts.values() if c["hits"]), key=lambda c: (-c["maxScore"], c["name"]))
    selected, represented = [], set()
    for c in ranked:
        if c["facet"] not in represented:
            selected.append(c)
            represented.add(c["facet"])
    selected = (selected + [c for c in ranked if c not in selected])[:parameters["maxCandidates"]]
    evidence, candidates = set(), []
    for c in selected:
        frame_ids = []
        for _, frame_id in sorted(c["hits"], reverse=True):
            if frame_id in frame_ids:
                continue
            if frame_id in evidence or len(evidence) < parameters["maxEvidence"]:
                evidence.add(frame_id)
                frame_ids.append(frame_id)
            if len(frame_ids) == 2:
                break
        if frame_ids:
            candidates.append({k: c[k] for k in ("name", "facet", "maxScore")} | {"hitFrameCount": len(c["hits"]), "frameIds": frame_ids})
    return candidates, evidence


def analyse(local_file, directory, job, tagger, check_deadline, progress):
    with local_file.open('rb') as source:
        container = detect_container(source.read(4096))
    raw, _ = run_media("ffprobe", ["-v", "error", *input_options(container), "-show_streams", "-show_format", "-of", "json", str(local_file)], directory, min(15, check_deadline()))
    probe = json.loads(raw)
    media = job["input"]["media"]
    duration = validate_source(probe, media, container)
    policy = job['input'].get('sampling', LEGACY_SAMPLING)
    requested = sample_times(duration, policy)
    progress("extracting")
    samples, frames, actual_times, request_indices, provenance = [], [], [], [], {}
    origin = float(probe["format"].get("start_time", 0))
    if not math.isfinite(origin):
        raise ValueError("Invalid media start time")
    step = duration / len(requested)

    def extract(first_frame=False):
        # Select the first decoded frame in each midpoint bucket in one pass.
        # Sparse/VFR gaps leave missing buckets instead of duplicating a frame.
        first = requested[0]
        expr = f"gte(t,{first:.12f})*if(isnan(prev_selected_t),1,gt(floor((t-{first:.12f})/{step:.12f}),floor((prev_selected_t-{first:.12f})/{step:.12f})))"
        selection = "eq(n,0)" if first_frame else expr
        selection = selection.replace(',', r'\,')
        filters = f"setpts=PTS-({origin})/TB,select={selection},scale=640:640:force_original_aspect_ratio=decrease,setsar=1,showinfo"
        _, log = run_media("ffmpeg", ["-hide_banner", "-loglevel", "info", "-xerror", "-nostdin", "-copyts", *input_options(container), "-threads", "1", "-i", str(local_file), "-map", "0:v:0", "-vf", filters,
            "-frames:v", str(len(requested)), "-fps_mode", "passthrough", "-threads", "1", "-q:v", "3", "-start_number", "0", "-y", str(directory / 'sample-%02d.jpg')],
            directory, min(120, check_deadline()), max_samples=len(requested), allow_partial=True)
        # pts_time is printed at limited precision. Integer PTS + filter time base
        # preserves exact bucket alignment for long/VFR clips.
        base = re.search(r'config in time_base:\s*(\d+)/(\d+)', log)
        points = re.findall(r'\bn:\s*\d+\s+pts:\s*(-?\d+)\s+pts_time:', log)
        if points and (not base or int(base.group(2)) == 0):
            raise ValueError('Missing decoded time base')
        return [int(value) * int(base.group(1)) / int(base.group(2)) for value in points]

    try:
        decoded_times = extract()
    except ValueError:
        if len(requested) != 1:
            raise
        decoded_times = []
    if not decoded_times and len(requested) == 1:
        decoded_times = extract(first_frame=True)
    sizes = [p.stat().st_size for p in directory.glob('sample-*.jpg')]
    if len(sizes) > len(requested) or any(s > MAX_SAMPLE_BYTES for s in sizes) or sum(sizes) > len(requested) * MAX_SAMPLE_BYTES:
        raise ValueError('Sample images exceeded their disk budget')
    for output_index, actual in enumerate(decoded_times):
        check_deadline()
        image_path = directory / f"sample-{output_index:02d}.jpg"
        try:
            if not image_path.is_file() or image_path.stat().st_size > MAX_SAMPLE_BYTES:
                continue
            if not math.isfinite(actual) or actual < 0 or actual > duration or actual in actual_times:
                continue
            i = min(len(requested) - 1, max(0, math.floor((actual - requested[0]) / step + 0.00002 / step)))
            if i in request_indices:
                continue
            check_deadline()
            progress("tagging")
            with Image.open(image_path) as image:
                results, _, provenance = tagger.classify(image, job["input"]["vocabulary"], "image")
            frame = {"id": f"f{i}", "timeSeconds": actual, "path": image_path}
            frames.append(frame)
            actual_times.append(actual)
            request_indices.append(i)
            samples.append((frame, results))
        except (ValueError, subprocess.TimeoutExpired, OSError):
            continue
    if len(samples) < max(1, math.ceil(len(requested) / 2)):
        raise ValueError("Too few sampled frames could be decoded")
    candidates, evidence = aggregate(samples, job["input"]["aggregation"])
    # One cover remains available even when CLIP finds no suitable suggestion.
    if not evidence:
        evidence.add(frames[0]["id"])
    output_frames = []
    total_encoded = 0
    for f in frames:
        if f["id"] not in evidence:
            continue
        with Image.open(f["path"]) as image:
            buffer = BytesIO()
            image.convert('RGB').save(buffer, format='JPEG', quality=75, optimize=True)
        encoded = base64.b64encode(buffer.getvalue()).decode('ascii')
        total_encoded += len(encoded)
        if total_encoded > 3 * 1024**2:
            raise ValueError('Evidence payload exceeded its budget')
        output_frames.append({"id": f["id"], "timeSeconds": f["timeSeconds"], "jpegBase64": encoded})
    return {"candidates": candidates, "frames": output_frames,
            "sampling": {"requestedCount": len(requested), "decodedCount": len(samples), "times": actual_times, "requestIndices": request_indices},
            "provenance": {"modelRevision": provenance.get("modelRevision")}}


def process_video(payload, tagger, storage, backend_url, headers):
    """Claim durable input. Missing IDs cannot enter the legacy video pipeline."""
    if not payload.get("jobId") or not payload.get("sourceFilename"):
        return
    prefix = f'{backend_url}/api/assets/{payload["assetId"]}/ai-jobs/{payload["jobId"]}'
    response = requests.post(prefix + "/claim", headers=headers, json={"sourceFilename": payload["sourceFilename"]}, timeout=20)
    if response.status_code in (404, 409, 410):
        return
    response.raise_for_status()
    job = response.json()
    started = time.monotonic()
    stop, lost = threading.Event(), threading.Event()
    stage = ["downloading"]

    def check_deadline():
        remaining = TASK_SECONDS - (time.monotonic() - started)
        if remaining <= 0 or lost.is_set():
            raise TimeoutError("Video deadline or lease expired")
        return remaining

    def beat():
        while not stop.wait(15):
            try:
                result = requests.post(prefix + "/heartbeat", headers=headers, json={"leaseToken": job["leaseToken"], "stage": stage[0]}, timeout=10)
                if result.status_code in (404, 409, 410):
                    lost.set()
                    return
            except requests.RequestException:
                pass  # Server expiry still rejects any delayed result.

    thread = threading.Thread(target=beat, daemon=True)
    # A stalled native model call cannot retain the serial worker indefinitely.
    # A process restart is safe because durable leases recover interrupted work.
    watchdog = threading.Timer(TASK_SECONDS + 15, lambda: os._exit(70))
    watchdog.daemon = True
    watchdog.start()
    thread.start()
    try:
        cleanup_stale()
        with tempfile.TemporaryDirectory(prefix="job-", dir=ROOT) as temp:
            directory = Path(temp)
            if job['input'].get('processing', {}).get('deadlineSeconds', TASK_SECONDS) != TASK_SECONDS:
                raise ValueError('Unsupported task deadline policy')
            container = job['input']['media'].get('container', 'mp4')
            if container not in ('mp4', 'webm'):
                raise ValueError('Unsupported source container')
            local = directory / f"source.{container}"
            stream = storage.get_object("assets", job["sourceFilename"])
            size = 0
            try:
                with local.open("wb") as target:
                    for chunk in stream.stream(1024 * 1024):
                        check_deadline()
                        size += len(chunk)
                        if size > MAX_BYTES:
                            raise ValueError("Video exceeds size limit")
                        target.write(chunk)
            finally:
                stream.close()
                stream.release_conn()
            if size != job["input"]["size"]:
                raise ValueError("Video size changed")
            output = analyse(local, directory, job, tagger, check_deadline, lambda value: stage.__setitem__(0, value))
            check_deadline()
            output["elapsedSeconds"] = time.monotonic() - started
            body = {"leaseToken": job["leaseToken"], "output": output}
            # Idempotent completion permits a lost acknowledgement to be retried.
            for attempt in range(3):
                try:
                    result = requests.post(prefix + "/result", headers=headers, json=body, timeout=30)
                    if result.status_code in (404, 409, 410):
                        return
                    result.raise_for_status()
                    return
                except requests.RequestException:
                    if attempt == 2:
                        raise
    except Exception as error:
        try:
            requests.post(prefix + "/result", headers=headers, json={"leaseToken": job["leaseToken"], "error": True, "retryable": isinstance(error, (requests.RequestException, TimeoutError))}, timeout=20)
        except requests.RequestException:
            pass  # The persisted lease/recovery loop owns further retries.
        print("Video job failed:", type(error).__name__, flush=True)
    finally:
        watchdog.cancel()
        stop.set()
        thread.join(timeout=11)
