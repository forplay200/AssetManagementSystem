import re
import struct
import zlib


FBX_BINARY_HEADER = b"Kaydara FBX Binary  \x00\x1a\x00"


def extract_model_metadata(filename, content):
    extension = filename.rsplit(".", 1)[-1].lower()
    if extension == "obj":
        vertex_count, face_count, features = _extract_obj(content)
    elif extension == "fbx":
        vertex_count, face_count, features = _extract_fbx(content)
    else:
        raise ValueError(f"Unsupported 3D format: {extension}")

    return {
        "type": "3d",
        "vertexCount": vertex_count,
        "faceCount": face_count,
        "modelTags": _model_tags(extension, vertex_count, face_count, features),
    }


def extract_model_geometry(filename, content):
    """Return vertices and triangulated faces for representative rendering."""
    extension = filename.rsplit(".", 1)[-1].lower()
    if extension == "obj":
        return _extract_obj_geometry(content)
    if extension == "fbx":
        return _extract_fbx_geometry(content)
    raise ValueError(f"Unsupported 3D format: {extension}")


def _extract_obj(content):
    text = content.decode("utf-8", errors="replace")
    lines = [line.lstrip() for line in text.splitlines()]
    vertex_count = sum(line.startswith("v ") for line in lines)
    face_lines = [line for line in lines if line.startswith("f ")]
    features = {
        "textured": any(line.startswith(("vt ", "usemtl ", "mtllib ")) for line in lines),
        "multi_part": sum(line.startswith(("o ", "g ")) for line in lines) > 1,
        "triangulated": bool(face_lines) and all(len(line.split()) == 4 for line in face_lines),
    }
    return vertex_count, len(face_lines), features


def _extract_obj_geometry(content):
    text = content.decode("utf-8", errors="replace")
    vertices = []
    triangles = []

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if line.startswith("v "):
            values = line.split()[1:4]
            if len(values) == 3:
                vertices.append(tuple(float(value) for value in values))
        elif line.startswith("f "):
            face = []
            for token in line.split()[1:]:
                raw_index = int(token.split("/", 1)[0])
                index = raw_index - 1 if raw_index > 0 else len(vertices) + raw_index
                if 0 <= index < len(vertices):
                    face.append(index)
            triangles.extend(_triangulate_face(face))

    return vertices, triangles


def _extract_fbx(content):
    if content.startswith(FBX_BINARY_HEADER):
        vertex_count, face_count = _extract_binary_fbx(content)
        return vertex_count, face_count, {"binary": True}

    text = content.decode("utf-8", errors="replace")
    vertex_matches = re.findall(r"\bVertices\s*:\s*\*(\d+)", text, re.IGNORECASE)
    polygon_matches = re.findall(
        r"PolygonVertexIndex\s*:\s*\*\d+\s*\{\s*a\s*:\s*([^}]*)",
        text,
        re.IGNORECASE | re.DOTALL,
    )
    vertex_count = sum(int(length) // 3 for length in vertex_matches) if vertex_matches else None
    indices = [int(value) for block in polygon_matches for value in re.findall(r"-?\d+", block)]
    face_count = sum(index < 0 for index in indices) if indices else None
    return vertex_count, face_count, {"binary": False}


def _extract_binary_fbx(content):
    arrays = _read_binary_fbx_arrays(content)
    vertex_count = sum(array[0] // 3 for array in arrays["Vertices"]) if arrays["Vertices"] else None
    readable_polygons = [array[1] for array in arrays["PolygonVertexIndex"] if array[1] is not None]
    face_count = sum(index < 0 for values in readable_polygons for index in values) if readable_polygons else None
    return vertex_count, face_count


def _read_binary_fbx_arrays(content):
    if len(content) < 27:
        return {"Vertices": [], "PolygonVertexIndex": []}

    version = struct.unpack_from("<I", content, 23)[0]
    is_64_bit = version >= 7500
    sentinel_size = 25 if is_64_bit else 13
    arrays = {"Vertices": [], "PolygonVertexIndex": []}

    def visit_range(offset, range_end):
        while offset + sentinel_size <= min(range_end, len(content)):
            if is_64_bit:
                end_offset, property_count, property_length, name_length = struct.unpack_from("<QQQB", content, offset)
                header_size = 25
            else:
                end_offset, property_count, property_length, name_length = struct.unpack_from("<IIIB", content, offset)
                header_size = 13

            if end_offset == 0:
                break
            if end_offset > len(content) or end_offset <= offset:
                break

            name_start = offset + header_size
            name_end = name_start + name_length
            name = content[name_start:name_end].decode("utf-8", errors="replace")
            properties_start = name_end
            properties_end = properties_start + property_length

            if property_count and name in arrays and properties_start < len(content):
                value = _read_fbx_array(content, properties_start, include_values=True)
                if value:
                    arrays[name].append(value)

            if properties_end < end_offset - sentinel_size:
                visit_range(properties_end, end_offset)
            offset = end_offset

    visit_range(27, len(content))
    return arrays


def _extract_fbx_geometry(content):
    if content.startswith(FBX_BINARY_HEADER):
        arrays = _read_binary_fbx_arrays(content)
        vertex_arrays = [array[1] for array in arrays["Vertices"] if array[1] is not None]
        polygon_arrays = [array[1] for array in arrays["PolygonVertexIndex"] if array[1] is not None]
    else:
        text = content.decode("utf-8", errors="replace")
        vertex_blocks = re.findall(r"\bVertices\s*:\s*\*\d+\s*\{\s*a\s*:\s*([^}]*)", text, re.IGNORECASE | re.DOTALL)
        polygon_blocks = re.findall(r"PolygonVertexIndex\s*:\s*\*\d+\s*\{\s*a\s*:\s*([^}]*)", text, re.IGNORECASE | re.DOTALL)
        vertex_arrays = [[float(value) for value in re.findall(r"-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?", block)] for block in vertex_blocks]
        polygon_arrays = [[int(value) for value in re.findall(r"-?\d+", block)] for block in polygon_blocks]

    vertices = []
    triangles = []
    for coordinates, polygon_indices in zip(vertex_arrays, polygon_arrays):
        base_index = len(vertices)
        mesh_vertices = [tuple(coordinates[index:index + 3]) for index in range(0, len(coordinates) - 2, 3)]
        vertices.extend(mesh_vertices)
        face = []
        for raw_index in polygon_indices:
            local_index = -raw_index - 1 if raw_index < 0 else raw_index
            if 0 <= local_index < len(mesh_vertices):
                face.append(base_index + local_index)
            if raw_index < 0:
                triangles.extend(_triangulate_face(face))
                face = []

    return vertices, triangles


def _triangulate_face(face):
    if len(face) < 3:
        return []
    return [(face[0], face[index], face[index + 1]) for index in range(1, len(face) - 1)]


def _read_fbx_array(content, offset, include_values=False):
    array_type = chr(content[offset])
    if array_type not in {"d", "f", "i", "l"} or offset + 13 > len(content):
        return None

    length, encoding, data_length = struct.unpack_from("<III", content, offset + 1)
    payload_start = offset + 13
    payload = content[payload_start:payload_start + data_length]
    if not include_values:
        return length, None

    if encoding == 1:
        payload = zlib.decompress(payload)
    elif encoding != 0:
        return length, None

    format_char = {"i": "i", "l": "q", "f": "f", "d": "d"}[array_type]
    item_size = struct.calcsize(format_char)
    available = min(length, len(payload) // item_size)
    values = struct.unpack_from(f"<{available}{format_char}", payload) if available else ()
    return length, values


def _model_tags(extension, vertex_count, face_count, features):
    tags = ["3d model", extension]
    if face_count is not None:
        tags.append("low-poly" if face_count < 1000 else "mid-poly" if face_count < 100000 else "high-poly")
    if features.get("textured"):
        tags.append("textured")
    if features.get("multi_part"):
        tags.append("multi-part")
    if features.get("triangulated"):
        tags.append("triangulated")
    if features.get("binary"):
        tags.append("binary")
    return tags
