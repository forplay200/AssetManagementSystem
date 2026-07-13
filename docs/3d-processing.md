# 3D Asset Processing

## Architecture

OBJ and FBX assets follow the existing asynchronous AI workflow:

```text
OBJ / FBX upload
  -> MinIO object storage
  -> FastAPI /jobs
  -> Redis ai_jobs queue
  -> ai-worker detects the file extension
  -> model_metadata extracts geometry information
  -> backend /ai-result stores metadata.ai
  -> Asset Detail and Search consume the stored result
```

No new database structure or result endpoint is introduced. The worker posts the existing metadata shape:

```json
{
  "ai": {
    "type": "3d",
    "vertexCount": 3,
    "faceCount": 1,
    "modelTags": ["3d model", "obj", "low-poly", "textured", "triangulated"]
  }
}
```

## Extraction Strategy

### Phase 1: Detection and OBJ

- Detects `.obj` independently of the browser-provided MIME type.
- Counts geometric vertices from `v` records.
- Counts polygon faces from `f` records.
- Detects texture/material references, multiple object/group declarations, and fully triangulated faces.
- Tolerates invalid text bytes by decoding with replacement rather than failing the queue worker.

### Phase 2: FBX

- Detects `.fbx` and distinguishes ASCII from the standard Kaydara binary header.
- ASCII FBX reads declared `Vertices` arrays and polygon termination markers in `PolygonVertexIndex`.
- Binary FBX supports both pre-7500 32-bit node records and 7500+ 64-bit node records.
- Reads uncompressed or zlib-compressed array properties.
- Aggregates multiple mesh geometry nodes, deriving `vertexCount` from coordinate-array lengths and `faceCount` from negative polygon terminators.
- Returns `null` counts when a valid FBX variant does not expose readable geometry arrays, while retaining `type: "3d"` and format tags.

Basic model tags include format, polygon density (`low-poly`, `mid-poly`, or `high-poly`), texturing, multipart geometry, triangulation, and binary FBX where detectable.

## Hybrid 3D Tagging

### Existing Deterministic Extraction

The technical path remains authoritative and unchanged in shape. OBJ/FBX parsing always runs first and retains:

- `vertexCount`
- `faceCount`
- `modelTags`

If semantic rendering or CLIP classification fails, these deterministic results are still stored normally.

### 2D Rendering Strategy

The worker extracts renderable vertex and polygon arrays from the same OBJ, ASCII FBX, or binary FBX bytes. Polygon faces are triangulated, multiple mesh nodes are combined, and invalid indices are discarded.

A dependency-light CPU renderer then:

1. Centers the complete geometry around its bounding box.
2. Applies a consistent isometric yaw and pitch.
3. Normalizes the model to a 512 × 512 frame.
4. Depth-sorts up to 75,000 triangles.
5. Applies directional face shading over a neutral dark background.

The representative image stays in memory and does not create a new asset or require a GPU, Blender, WebGL, or a backend endpoint.

### CLIP Semantic Tagging Workflow

```text
OBJ / FBX bytes
  -> deterministic metadata extraction
  -> representative 2D software render
  -> existing CLIP zero-shot classifier
  -> semanticTags
  -> existing /api/assets/:id/ai-result callback
```

The worker reuses the already-loaded CLIP classifier and the existing game-asset candidates, extended for 3D concepts such as car, transportation, building, furniture, robot, aircraft, boat, tool, and game prop. Up to five labels above the existing `0.10` threshold are stored separately from technical tags.

Rendering intentionally uses geometry rather than final production materials: FBX node transforms, skeletal poses, textures, and material appearance may not be represented in the semantic frame. Models above 75,000 triangles are evenly sampled for bounded CPU rendering time, and the fixed isometric view may miss concepts visible only from another angle. These limitations affect `semanticTags` quality but never remove deterministic metadata.

### Example Output

```json
{
  "ai": {
    "type": "3d",
    "vertexCount": 30993,
    "faceCount": 44358,
    "modelTags": ["3d model", "fbx", "mid-poly", "binary"],
    "semanticTags": ["car", "vehicle", "transportation"]
  }
}
```

## Search Integration

`modelTags` and `semanticTags` are stored under `metadata.ai`, so canonical `q` search filters both in PostgreSQL before pagination. Result ranking reports `matchSource: "modelTags"` for technical terms such as `low-poly` or `fbx`, and `matchSource: "semanticTags"` for visual concepts such as `car` or `transportation`.

The frontend AI Metadata panel keeps technical information separate: 3D Metadata contains counts, Generated Model Tags contains deterministic labels, and CLIP Semantic Tags contains rendered-image concepts. Both tag collections reuse the existing accept/edit/remove controls.

## Test Results

Automated extraction cases cover:

- OBJ vertex and face counting.
- OBJ format, polygon-density, texture, and triangulation tags.
- ASCII FBX vertex and face counting.
- Binary FBX detection with stable nullable count fields.
- Binary FBX geometry-array counting and multiple-mesh aggregation.
- Representative 2D rendering from extracted geometry.
- `modelTags` AI search-source detection.
- `semanticTags` AI search-source detection.
- Frontend display of model tags, vertex count, and face count.
- Frontend display of semantic tags separately from technical metadata.
- Page-level Asset Detail integration using stored counts of 30,993 vertices and 44,358 faces.

Production verification should rebuild `ai-service` and `ai-worker`, upload representative OBJ, ASCII FBX, and binary FBX files, and confirm persisted metadata against known geometry counts.

## Interactive Asset Preview

### Components Created

- `ThreeModelPreview`: owns the Three.js scene, authenticated model loading, camera fitting, interaction controls, resize handling, animation lifecycle, and fallback UI.
- `AssetPreview`: routes `.obj` and `.fbx` assets into a lazy-loaded interactive viewer while preserving the existing image, audio, and source previews. Three.js is excluded from the initial application bundle until a 3D asset is opened.

### Libraries Used

- Three.js `0.185.1`
- `OBJLoader` from the official Three.js examples modules
- `FBXLoader` from the official Three.js examples modules
- `OrbitControls` for pointer rotation, screen-space panning, and wheel/pinch zoom

The viewer requests protected bytes through the existing frontend service integration:

```text
GET /api/assets/preview/:id
Authorization: Bearer <token>
```

No backend API changes were required.

### Supported Formats

- OBJ, parsed from authenticated response bytes with `OBJLoader`.
- ASCII and binary FBX, parsed from authenticated response bytes with `FBXLoader`.
- Models are normalized to a consistent scene size, centered automatically, lit from multiple directions, and placed over a technical grid.
- Users can drag to rotate, Shift-drag to pan, and scroll or pinch to zoom.

### Limitations

- OBJ material libraries and external texture files are not fetched because the preview endpoint returns only the selected asset. Geometry still renders with loader defaults.
- FBX files with external texture references may render without those textures; embedded materials supported by `FBXLoader` can render normally.
- Very large models remain constrained by browser memory, GPU limits, and parsing time.
- WebGL-disabled browsers receive a safe fallback and retain the normal Asset Detail download action.
- The viewer does not provide skeletal animation playback, material editing, measurement, or mesh inspection tools.

### Preview Test Cases

- OBJ and FBX extensions route to the model preview independently of MIME type.
- A minimal OBJ triangle parses into a Three.js mesh.
- Protected preview requests display a loading state.
- Request or parser failures display the 3D preview fallback.
- Existing image, audio, text, and unsupported preview classifications remain covered.
