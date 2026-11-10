"""Video bounds and immutable sampling versions; no model dependencies."""
import math

MAX_BYTES = 100 * 1024 * 1024
MAX_DURATION = 180
TASK_SECONDS = 300
MAX_SAMPLE_BYTES = 500000
LEGACY_SAMPLING = {"version": "midpoint-v1", "intervalSeconds": 2, "maxFrames": 30}


def sample_times(duration, policy=None):
    policy = policy if policy is not None else LEGACY_SAMPLING
    version = policy.get("version")
    if (version not in ("midpoint-v1", "midpoint-v2") or policy.get("intervalSeconds") != 2
            or policy.get("maxFrames") != (30 if version == "midpoint-v1" else 45)):
        raise ValueError("Unsupported sampling policy")
    if not math.isfinite(duration) or not 0 < duration <= MAX_DURATION:
        raise ValueError("Unsupported duration")
    count = min(policy["maxFrames"], max(1, math.ceil(duration / policy["intervalSeconds"])))
    return [(i + 0.5) * duration / count for i in range(count)]


def input_options(container):
    return ["-protocol_whitelist", "file", *(["-enable_drefs", "0", "-use_absolute_path", "0"]
            if container == "mp4" else []), "-max_alloc", "67108864"]


def detect_container(header):
    if len(header) >= 12 and header[4:8] == b"ftyp" and header[8:12] in (b"isom", b"iso2", b"mp41", b"mp42", b"avc1"):
        return "mp4"
    if header[:4] != b"\x1a\x45\xdf\xa3":
        raise ValueError("Unsupported container header")

    def vint(offset, is_id=False):
        if offset >= len(header) or header[offset] == 0:
            raise ValueError("Invalid EBML header")
        width, mask = 1, 128
        while not header[offset] & mask:
            width, mask = width + 1, mask >> 1
        if width > (4 if is_id else 8) or offset + width > len(header):
            raise ValueError("Invalid EBML header")
        value = int.from_bytes(header[offset:offset + width], "big")
        if not is_id:
            value &= (1 << (7 * width)) - 1
            if value == (1 << (7 * width)) - 1:
                raise ValueError("Unknown EBML header length")
        return value, offset + width

    length, offset = vint(4)
    end = offset + length
    if end > min(4096, len(header)):
        raise ValueError("Oversized or truncated EBML header")
    doc_type = None
    while offset < end:
        element, offset = vint(offset, True)
        length, offset = vint(offset)
        next_offset = offset + length
        if next_offset > end:
            raise ValueError("Invalid EBML element length")
        if element == 0x4282:
            if doc_type is not None:
                raise ValueError("Duplicate EBML DocType")
            doc_type = header[offset:next_offset]
        offset = next_offset
    if doc_type != b"webm":
        raise ValueError("Not a WebM DocType")
    return "webm"


def validate_source(probe, media, container):
    """Recheck downloaded bytes rather than trusting an extension or a queue message."""
    streams = probe.get("streams", [])
    videos = [s for s in streams if s.get("codec_type") == "video"]
    audios = [s for s in streams if s.get("codec_type") == "audio"]
    if len(videos) != 1 or len(audios) > 1 or any(s.get("codec_type") not in ("video", "audio") for s in streams):
        raise ValueError("Unsupported media tracks")
    v = videos[0]
    duration = float(probe["format"]["duration"])
    if not math.isfinite(duration) or not 0 < duration <= MAX_DURATION:
        raise ValueError("Unknown or unsupported duration")
    if (container != media.get("container", "mp4") or v.get("width") != media["encodedWidth"]
            or v.get("height") != media["encodedHeight"] or abs(duration - media["durationSeconds"]) > 0.05
            or v.get("codec_name") != media.get("videoCodec", "h264")):
        raise ValueError("Video source metadata changed")
    if container == "mp4":
        supported = (v.get("codec_name") == "h264" and v.get("profile") in ("Baseline", "Constrained Baseline", "Main", "High")
                     and isinstance(v.get("level"), (int, float)) and 0 < v["level"] <= 42)
    else:
        supported = v.get("codec_name") in ("vp8", "vp9") and (v["codec_name"] != "vp9" or str(v.get("profile")) in ("0", "Profile 0"))
    if (not supported or v.get("pix_fmt") != "yuv420p" or v.get("disposition", {}).get("attached_pic")
            or v.get("color_transfer") in ("smpte2084", "arib-std-b67")
            or any(s.get("codec_tag_string") in ("encv", "enca") or any(k.lower() == "alpha_mode" and str(value) != "0"
                for k, value in s.get("tags", {}).items()) for s in streams)):
        raise ValueError("Unsupported video encoding")
    if audios:
        a = audios[0]
        if (not 0 < a.get("channels", 0) <= 2 or (container == "mp4" and (a.get("codec_name") != "aac" or a.get("profile") != "LC"))
                or (container == "webm" and a.get("codec_name") not in ("opus", "vorbis"))):
            raise ValueError("Unsupported audio encoding")
    return duration
