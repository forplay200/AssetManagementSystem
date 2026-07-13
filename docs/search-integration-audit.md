# Search Integration Audit

## Supported Backend Search Parameters

`GET /api/assets/search` supports the following query parameters:

| Parameter | Behavior |
|---|---|
| `filename` | Case-insensitive partial match against `originalname`; the generated storage `filename` remains a compatibility fallback. |
| `metadata` | Case-insensitive partial match across scalar metadata values only. JSON property names are excluded. |
| `q` | Case-insensitive AI-only search across `metadata.ai`, including `imageTags`, `semanticTags`, `modelTags`, `audioTags`, `keywords`, `transcript`, and `summary`. Results retain `matchSource` and `score`. |
| `aiTag` | Backward-compatible alias for an AI metadata term. It uses the same AI JSON search expression as `q`. |
| `tags` | Comma-separated repository tag names; matches any supplied partial tag. |
| `type` | `image`, `audio`, `video`, `text`, or `model`, mapped to supported MIME types. |
| `date` | Upload date in `YYYY-MM-DD` format. |
| `creator` | Numeric user ID or case-insensitive partial username. |
| `page` | One-based result page; defaults to `1`. |
| `pageSize` | Results per page; defaults to `10` and is capped at `100`. |

All search parameters can be combined. Authentication is required.

## Frontend Search Parameters

The Search Assets page sends:

- `filename`
- `metadata`
- `q`
- `tags`
- `type`
- `date`
- `creator`
- `page`
- `pageSize` (`24` from the current grid)

The UI does not send the legacy `aiTag` alias. Its dedicated **AI metadata** field uses the canonical `q` parameter.

## Mismatches

### Filename

The UI described filename search as the user-visible upload name, but the backend queried `filename`, which is a generated MinIO object key such as a timestamp plus extension. This made extension searches appear to work while meaningful base names did not.

### Metadata Text

The Asset model stores metadata as PostgreSQL JSON. Applying `LIKE` directly to the JSON column caused PostgreSQL to reject the expression and the API to return `Server error`.

An intermediate whole-object text cast fixed that server error but also serialized JSON property names. As a result, a term such as `type` could match the key `"type"` even when no metadata value contained that text.

### AI Metadata

The backend accepted `q` and `aiTag`, but the frontend exposed neither parameter explicitly. The old `q` implementation also fetched and paginated assets before filtering AI fields in JavaScript, producing incomplete counts and missing matches outside the current database page.

### Case Sensitivity

Filename, tag, and creator text used `LIKE`, which is case-sensitive in PostgreSQL. That differed from the search UI's general text-search behavior.

## Fixes Applied

- Filename search now prioritizes `originalname` while retaining generated `filename` as a compatibility fallback.
- Metadata search now uses PostgreSQL JSONPath to recursively extract string, number, and boolean scalar values with `jsonb_path_query_array`, then applies `ILIKE` to that value array. Object keys are never included in the searchable expression.
- AI search now filters the `metadata.ai` JSON subtree in PostgreSQL before pagination.
- Added a dedicated frontend **AI metadata** field mapped to `q`.
- AI results continue to expose `matchSource` and `score` for `imageTags`, `semanticTags`, `modelTags`, `audioTags`, `keywords`, `summary`, and `transcript`.
- Tag and creator text matching now use case-insensitive `ILIKE`.
- Expanded text/audio MIME mappings for common browser upload MIME values.
- Moved query construction and AI source detection into a modular search utility.
- Added regression tests for original names, PostgreSQL JSON casts, and all four AI fields.

## Test Cases

| Search term | Parameter | Example stored value | Expected match |
|---|---|---|---|
| `dashboard` | `q` | `imageTags: ["dashboard interface"]` | `matchSource: imageTags` |
| `redis` | `q` | `keywords: ["redis queue"]` | `matchSource: keywords` |
| `postgresql` | `q` | `transcript: "PostgreSQL stores structured metadata."` | `matchSource: transcript` |
| `digital formats` | `q` | `summary: "Overview of digital formats"` | `matchSource: summary` |
| `music` | `q` | `audioTags: ["speech", "music"]` | `matchSource: audioTags` |
| `low-poly` | `q` | `modelTags: ["3d model", "low-poly"]` | `matchSource: modelTags` |
| `transportation` | `q` | `semanticTags: ["car", "vehicle", "transportation"]` | `matchSource: semanticTags` |

Additional contract checks verify that `filename=dashboard` generates an `originalname ILIKE '%dashboard%'` predicate and that metadata/AI values are cast to text rather than compared directly as JSON.

Metadata value-only examples:

| Metadata | Search | Expected |
|---|---|---|
| `description: "It is for the button"` | `button` | Match |
| `project: "project one"` | `project one` | Match |
| `category: "UI"` | `UI` | Match |
| key named `type`, with no value containing `type` | `type` | No match |
