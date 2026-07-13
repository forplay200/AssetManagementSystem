import numpy as np
from PIL import Image, ImageDraw


def render_model_preview(vertices, triangles, size=512, max_faces=75000):
    """Render a normalized isometric model view without requiring a GPU."""
    points = np.asarray(vertices, dtype=np.float32)
    faces = np.asarray(triangles, dtype=np.int64)
    if points.ndim != 2 or points.shape[0] < 3 or points.shape[1] != 3 or faces.size == 0:
        raise ValueError("The model contains no renderable geometry.")

    valid_faces = np.all((faces >= 0) & (faces < len(points)), axis=1)
    faces = faces[valid_faces]
    if not len(faces):
        raise ValueError("The model contains no valid faces.")
    if len(faces) > max_faces:
        faces = faces[np.linspace(0, len(faces) - 1, max_faces, dtype=np.int64)]

    points = points - ((points.min(axis=0) + points.max(axis=0)) / 2)
    yaw = np.deg2rad(35)
    pitch = np.deg2rad(-25)
    rotation_y = np.array([[np.cos(yaw), 0, np.sin(yaw)], [0, 1, 0], [-np.sin(yaw), 0, np.cos(yaw)]], dtype=np.float32)
    rotation_x = np.array([[1, 0, 0], [0, np.cos(pitch), -np.sin(pitch)], [0, np.sin(pitch), np.cos(pitch)]], dtype=np.float32)
    transformed = points @ (rotation_x @ rotation_y).T

    extent = np.ptp(transformed[:, :2], axis=0)
    scale = (size * 0.78) / max(float(extent.max()), 1e-6)
    screen = transformed[:, :2] * scale
    screen[:, 0] += size / 2
    screen[:, 1] = (size / 2) - screen[:, 1]

    image = Image.new("RGB", (size, size), (9, 9, 11))
    draw = ImageDraw.Draw(image)
    light = np.array([0.35, 0.55, 0.76], dtype=np.float32)
    light /= np.linalg.norm(light)
    depths = transformed[faces, 2].mean(axis=1)

    for face_index in np.argsort(depths):
        triangle = faces[face_index]
        world_triangle = transformed[triangle]
        normal = np.cross(world_triangle[1] - world_triangle[0], world_triangle[2] - world_triangle[0])
        length = np.linalg.norm(normal)
        brightness = 0.45 if length == 0 else 0.28 + (0.72 * abs(float(np.dot(normal / length, light))))
        color = (int(58 + 80 * brightness), int(74 + 82 * brightness), int(118 + 105 * brightness))
        polygon = [tuple(screen[index]) for index in triangle]
        draw.polygon(polygon, fill=color, outline=(31, 41, 62))

    return image
