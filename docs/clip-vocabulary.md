# Extensible CLIP vocabulary

## Implemented behaviour

- The checkpoint remains `openai/clip-vit-base-patch32`; no training or replacement model is introduced.
- `backend/data/clip-vocabulary.json` defines core release `1.0.0`: 93 image concepts, including 67 entity concepts for 3D previews. Each entry includes a stable ID, canonical name, aliases, category, facet, applicable asset types, description and source.
- The initial core is project curated. WordNet enrichment is a separate, optional preparation step; this release does not claim to have imported the full WordNet corpus.
- The backend combines the core with `ClipVocabularyEntries` from the current asset's workspace and supplies a snapshot through the authenticated internal asset-info endpoint. Workers share the backend's vocabulary definition.
- New workspace concepts require explicit human confirmation by a `workspaceOwner` or `workspaceManager`. Adding or accepting a repository tag alone does not add it to the CLIP vocabulary.
- Workspace concepts are stored in PostgreSQL with approval attribution and timestamps. Names and aliases are checked for collisions inside the workspace and against the core. Up to 256 custom concepts are supported per workspace.
- The backend normalises new tag input to lowercase and normalises whitespace and known aliases. Existing case variants are reused; historical tags are not bulk renamed or deleted.
- Images use content, form/interface, style and optional appearance facets. The initial core has no colour/material vocabulary. 3D currently uses content concepts and geometry-based previews only.
- File properties and geometry tags remain separate from CLIP semantic recommendations. Labels such as `npc`, `enemy`, file formats and approval status are not eligible custom visual concepts.
- CLIP encodes the entry descriptions using facet-specific prompts, then compares normalised image and text embeddings by cosine similarity. There is no candidate-set softmax in the new worker path.
- The text-vector cache is bounded to 4,096 prompts per worker. Keys include checkpoint identity, resolved revision, prompt version and actual prompt text; changed descriptions are encoded again. The cache is in memory and rebuilt after a worker restart.
- Facets are filtered separately by minimum similarity and maximum difference from the best score. Valid facets are represented before filling up to five suggestion slots. A result can contain no suggestions.
- Successful results record model identity/revision, vocabulary version and snapshot hash, prompt version, candidate count, scores, thresholds and processing time in `metadata.ai.clip`. `imageTags`, `semanticTags` and `modelTags` retain their existing frontend contracts.
- The worker includes the source filename in visual results. The backend rejects a result for a file replaced while processing was in progress.

## Activate the code

From the project root:

```powershell
docker compose up -d --build backend ai-service ai-worker frontend
```

The current backend startup uses Sequelize synchronisation, which creates the new vocabulary table. The rebuild uses the existing PostgreSQL and MinIO named volumes. This change does not rewrite stored accounts, assets or repository-tag associations.

Existing AI metadata remains available until an asset is processed again. For an existing image or model, choose **Regenerate tags** and then **Refresh results** after processing. Accepted repository tags remain independent of regenerated suggestions.

No Docker rebuild, model inference or automated tests were run as part of this implementation.

## Add a workspace concept

1. Open an image or 3D asset with a Workspace Owner or Manager account.
2. In **AI enrichment**, expand **Visual vocabulary**.
3. Enter an English concept and, when useful, a disambiguating description: `katana` / `a Japanese katana sword`.
4. Select the concept type and applicable asset types. Non-content facets apply to images only in this iteration.
5. Confirm that the concept is visually identifiable, then choose **Add to visual vocabulary**.
6. New jobs for this workspace include the concept. Regenerate an existing asset to include it immediately in matching.

Removing a workspace concept stops it from participating in subsequent matching. Existing asset labels and historical AI metadata are preserved. Core concepts are maintained through the core data file and cannot be deleted through the workspace interface.

## Core releases and WordNet

Update the JSON core version when its concepts, descriptions or aliases change. Update `promptVersion` when prompt templates change. The backend reloads the file when its modification time or size changes; worker snapshots include a hash of their actual contents. In a container, publish a changed core by rebuilding the backend image, or configure `CLIP_VOCABULARY_PATH` to point at a managed mounted file.

The optional `ai-service/vocabulary_tools.py` command prepares a separate candidate release from selected WordNet noun synsets. It records the corpus version, synset and hypernyms. Alias words with multiple noun senses, or conflicts with another concept, are skipped. Parent categories are not converted into synonyms.

Example from a Python environment with the AI service requirements installed:

```powershell
python ai-service/vocabulary_tools.py --input backend/data/clip-vocabulary.json --output backend/data/clip-vocabulary.next.json --version 1.1.0 --synset car.n.01 --synset dog.n.01 --download-wordnet
```

This example enriches existing car/dog records; it does not activate the candidate output automatically. Inspect the selected senses and resulting aliases before publishing it as the active core. `--download-wordnet` is a preparation-only option. Subsequent commands can use an already installed corpus through `NLTK_DATA`. Image/3D matching never queries WordNet or downloads its corpus at inference time.

WordNet supplies lexical relationships and senses, rather than evidence that an asset contains an object. The curated descriptions and the CLIP matching result determine the recommendation. Sources: [WordNet](https://wordnet.princeton.edu/), [NLTK WordNet reader](https://www.nltk.org/howto/wordnet.html).

## Configuration and evaluation status

| Setting | Default | Meaning |
|---|---|---|
| `CLIP_DEVICE` | `cpu` | CLIP execution device; a CUDA setting also requires container GPU access |
| `CLIP_IMAGE_MIN_SIMILARITY` | `0.25` | Minimum image cosine similarity |
| `CLIP_MODEL_MIN_SIMILARITY` | `0.25` | Minimum 3D preview cosine similarity |
| `CLIP_MAX_SCORE_GAP` | `0.04` | Maximum gap below the best match within a facet |

These are initial settings with no measured precision or recall. Metadata labels their status `initial-unvalidated`. Similarity scores are ranking values, not calibrated confidence percentages. Evaluation on representative assets is needed before claiming identification accuracy or laptop/cloud throughput.

The implementation uses the image/text embedding functions of the existing model. Reference: [official CLIP implementation](https://github.com/openai/CLIP), [Hugging Face CLIP documentation](https://huggingface.co/docs/transformers/en/model_doc/clip).

## Later texture implementation

The current renderer still produces a geometry preview with synthetic shading. Colour and material labels are excluded from 3D workspace approval and from its prompt facets. Image appearance concepts can be explicitly approved for images.

Future texture support must first load and correctly render the asset's real texture/material data. After that implementation is evaluated, extend the 3D appearance prompts and eligibility rules, and provide a `textures` render capability for entries requiring it. The current worker declares only `geometry`. The file-level `textured` model tag alone is not evidence that CLIP has inspected the model's real material or colour.

## API additions

| Endpoint | Permission | Behaviour |
|---|---|---|
| `GET /api/assets/:assetId/vocabulary` | View asset in active workspace | Current asset-type vocabulary snapshot |
| `POST /api/assets/:assetId/vocabulary` | Manage metadata in active workspace | Confirm a concept or extend an existing workspace concept to another supported asset type |
| `DELETE /api/assets/:assetId/vocabulary/:entryId` | Manage metadata in active workspace | Remove a workspace concept without removing asset tags |

Approval accepts `name`, optional `description`, `facet`, `assetTypes`, `aliases`, `category`, and requires `confirmed: true`. The frontend also exposes the existing `POST /api/assets/ai/job` endpoint for regeneration.
