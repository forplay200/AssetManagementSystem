import struct

import numpy as np

from model_metadata import extract_model_geometry, extract_model_metadata
from model_render import render_model_preview


def test_extracts_obj_geometry_and_basic_tags():
    content = b"""o Button\nmtllib button.mtl\nv 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nf 1/1 2/1 3/1\n"""
    result = extract_model_metadata("button.obj", content)

    assert result["type"] == "3d"
    assert result["vertexCount"] == 3
    assert result["faceCount"] == 1
    assert result["modelTags"] == ["3d model", "obj", "low-poly", "textured", "triangulated"]
    vertices, triangles = extract_model_geometry("button.obj", content)
    assert len(vertices) == 3
    assert triangles == [(0, 1, 2)]


def test_extracts_ascii_fbx_geometry_counts():
    content = b"""; FBX 7.4.0 project file\nVertices: *9 { a: 0,0,0,1,0,0,0,1,0 }\nPolygonVertexIndex: *3 { a: 0,1,-3 }\n"""
    result = extract_model_metadata("button.fbx", content)

    assert result["vertexCount"] == 3
    assert result["faceCount"] == 1
    assert result["modelTags"] == ["3d model", "fbx", "low-poly"]
    vertices, triangles = extract_model_geometry("button.fbx", content)
    assert len(vertices) == 3
    assert triangles == [(0, 1, 2)]


def test_aggregates_multiple_ascii_fbx_meshes():
    content = b"""Vertices: *9 { a: 0,0,0,1,0,0,0,1,0 }\nPolygonVertexIndex: *3 { a: 0,1,-3 }\nVertices: *9 { a: 0,0,1,1,0,1,0,1,1 }\nPolygonVertexIndex: *3 { a: 0,1,-3 }\n"""
    result = extract_model_metadata("multi.fbx", content)

    assert result["vertexCount"] == 6
    assert result["faceCount"] == 2


def test_detects_binary_fbx_and_preserves_metadata_shape_when_counts_are_unavailable():
    content = b"Kaydara FBX Binary  \x00\x1a\x00" + struct.pack("<I", 7400) + (b"\x00" * 13)
    result = extract_model_metadata("button.fbx", content)

    assert result == {
        "type": "3d",
        "vertexCount": None,
        "faceCount": None,
        "modelTags": ["3d model", "fbx", "binary"],
    }


def test_extracts_binary_fbx_geometry_arrays():
    prefix = b"Kaydara FBX Binary  \x00\x1a\x00" + struct.pack("<I", 7400)

    def array_property(kind, values, format_char):
        payload = struct.pack(f"<{len(values)}{format_char}", *values)
        return kind.encode() + struct.pack("<III", len(values), 0, len(payload)) + payload

    def node(name, property_bytes, start):
        name_bytes = name.encode()
        end = start + 13 + len(name_bytes) + len(property_bytes) + 13
        return struct.pack("<IIIB", end, 1, len(property_bytes), len(name_bytes)) + name_bytes + property_bytes + (b"\x00" * 13)

    vertices = array_property("d", [0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0], "d")
    vertex_node = node("Vertices", vertices, len(prefix))
    polygons = array_property("i", [0, 1, -3], "i")
    polygon_node = node("PolygonVertexIndex", polygons, len(prefix) + len(vertex_node))
    result = extract_model_metadata("button.fbx", prefix + vertex_node + polygon_node + (b"\x00" * 13))

    assert result["vertexCount"] == 3
    assert result["faceCount"] == 1
    assert result["modelTags"] == ["3d model", "fbx", "low-poly", "binary"]
    vertices, triangles = extract_model_geometry("button.fbx", prefix + vertex_node + polygon_node + (b"\x00" * 13))
    assert len(vertices) == 3
    assert triangles == [(0, 1, 2)]


def test_renders_representative_2d_preview_from_extracted_geometry():
    image = render_model_preview(
        [(0, 0, 0), (1, 0, 0), (0, 1, 0)],
        [(0, 1, 2)],
        size=128,
    )

    pixels = np.asarray(image)
    assert image.size == (128, 128)
    assert np.any(pixels != np.array([9, 9, 11]))
