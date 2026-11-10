# Chapter 2 手动修改清单

对应文档：`BTIS3103_2026B_B240077B.docx`。以下是修改建议和可自行采用的英文段落，没有修改原始 Word 文件。范围仅为 Chapter 2。

代码已加入词库与匹配机制，但本次没有运行模型评估、自动化测试或 Docker 构建。正文可以描述所采用的方法；准确率、性能和部署结果需要等实际评估后再写。

## 1. 修改 AI pipeline 小节标题和部署表述

在 Chapter 2 的 **Framework** 中找到：

`Multi-Modal Local AI Tagging Pipeline`

建议标题改为：

**Self-Hosted Multimodal AI Tagging Pipeline**

在介绍 FastAPI 与独立 AI 服务的现有两段之后，可补充：

> The inference components run within the platform's own deployment environment. Local containers support development, while the same service architecture can be hosted in the cloud for production. Asset analysis is performed by the platform's AI worker, with Redis separating the tagging workload from interactive application requests. FastAPI provides the job-submission interface, and generated metadata is returned to the backend in a structured JSON format.

这段用于明确“云端部署”与“自行运行模型”的关系。KeyBERT、YAMNet 和 Whisper 的现有说明继续沿用。

## 2. 替换现有 CLIP 段落，并增加可扩展词库说明

查找以这句话开头的现有 CLIP 段落：

`In the suggested digital asset management system, the platform utilizes CLIP technology...`

建议用下面的 CLIP 原理段落替换：

> CLIP learns a shared representation of images and natural-language descriptions through contrastive pretraining. This representation supports zero-shot classification by comparing a visual asset with descriptions of candidate concepts (Radford et al., 2021). The proposed platform retains the pretrained openai/clip-vit-base-patch32 checkpoint for image tagging and for analysing rendered previews of 3D models. Additional concept descriptions can be encoded without retraining the model. The resulting recommendations depend on the supplied vocabulary and prompt descriptions; CLIP does not independently generate new tag names outside that vocabulary.

原理依据：[Radford et al. (2021), Learning Transferable Visual Models From Natural Language Supervision](https://proceedings.mlr.press/v139/radford21a.html)。模型接口依据：[Hugging Face CLIP documentation](https://huggingface.co/docs/transformers/en/model_doc/clip)。

接着加入一个说明词库的段落：

> An extensible vocabulary provides the candidate concepts for visual tagging. A versioned core vocabulary contains curated concepts relevant to game assets, while each workspace can maintain additional concepts that users explicitly confirm as visually identifiable. Entries record a canonical name, aliases, a visual description, a concept category and the applicable asset types. Canonical names and aliases support consistent labelling, while separate concept descriptions distinguish ambiguous terms. Content, asset-form and visual-style concepts are organised into separate facets. Labels describing gameplay roles or administrative status remain under human control.

再加入 WordNet 的辅助作用说明：

> WordNet can assist vocabulary preparation by grouping words into synsets representing distinct senses and by identifying semantic relationships such as synonymy and hypernymy (Miller, 1995; Fellbaum, 1998). Selected noun senses can supply additional concepts and lexical provenance for a reviewed vocabulary release. A parent category is recorded as a semantic relationship rather than treated as a synonym of a more specific object. WordNet is used during vocabulary preparation, while the inference worker receives a prepared vocabulary snapshot from the backend.

来源：[WordNet 官方说明](https://wordnet.princeton.edu/)、[WordNet 文献引用信息](https://wordnet.princeton.edu/citing-wordnet)。现有初始词库为项目策划的词条；WordNet 扩展工具已加入代码，但本次没有导入或评估 WordNet 语料。避免将整套初始词库描述为“AI 自行生成”或“已经从全部 WordNet 自动提取”。

最后补充评分、缓存与可重复性说明：

> The proposed matching method compares normalised image and text embeddings using cosine similarity. Candidate concepts are ranked and filtered within their respective facets, and up to five suggestions are returned when the selection criteria are met. Low-similarity inputs may produce no semantic suggestions. Cached text embeddings reduce repeated encoding of unchanged concept descriptions. Vocabulary versions, prompt versions and matching settings accompany the generated metadata so that different processing runs can be interpreted. Similarity scores serve as ranking signals, and the selection thresholds require evaluation using representative game assets.

这里描述的是本项目采用的匹配设计。代码中的 `0.25` 与 `0.04` 是起始设置，不代表已经验证的准确率或置信度；Chapter 2 不需要加入这些尚未评估的具体参数。

## 3. 调整 Hybrid Metadata Strategy 的最后一段

保留确定性元数据与 CLIP 语义标签的组合思路。在以下现有段落中修改 3D 推断范围：

`Along with deterministic metadata extraction, the new system creates two-dimensional preview pictures...`

建议替换为：

> The platform combines deterministic metadata extraction with semantic analysis of two-dimensional previews rendered from 3D model geometry. Deterministic information includes the file format, vertex count, face count and structural properties. The existing CLIP checkpoint compares each rendered preview with candidate descriptions of objects and shapes. Technical metadata and semantic suggestions are retained as separate fields. This approach supports semantic asset retrieval through an image encoder without introducing a dedicated 3D learning model. In the current iteration, the preview renderer uses geometry and synthetic shading; colour and material recommendations depend on texture-aware rendering planned for a subsequent implementation.

需要明确三点：

- `modelTags` 来源于文件和几何信息，`semanticTags` 来源于 CLIP 对预览的匹配。
- 当前没有实现真实 texture/material 渲染，因此不要写成已经能分析 3D 的真实颜色、材质或纹理。
- 文件级 `textured` 标签不等于 CLIP 已经查看了真实贴图。后续 texture 功能完成后，再根据实际实现更新本段最后一句。

## 4. 在 Chapter 2 的 PostgreSQL 说明中补充词库数据管理

在介绍 JSON/JSONB 与事务支持的段落之后，可增加：

> PostgreSQL also stores workspace-specific vocabulary records, including concept names, aliases, visual descriptions, applicable asset types and approval attribution. Workspace identifiers keep these custom concepts associated with the appropriate collaborative repository. The shared core vocabulary is maintained as a versioned data resource, while generated AI metadata records the vocabulary snapshot used for each analysis. This arrangement supports controlled vocabulary extension and traceability of semantic recommendations.

本次新增数据库表保存自定义视觉词条，现有 repository tags 继续表示已经分配给资产的标签。避免在正文中把两者写成同一个用途。

## 5. Chapter 2 的 AI-assisted Auto tagging 小节

现有“AI 辅助、用户审核”的论点可以继续使用。若要补充一条与本次机制直接对应的句子，可使用：

> Human review applies both to accepting asset-level tag suggestions and to approving additional visual concepts for future matching within a workspace.

这两个操作对应不同决定：接受某个资产的标签，以及将一个词收录为后续候选概念。系统不会仅凭未经确认的 AI 建议自动扩展自定义词库。

## 本章可用的参考出处

- Radford et al. (2021). *Learning Transferable Visual Models From Natural Language Supervision*. Proceedings of the 38th International Conference on Machine Learning, PMLR 139, 8748–8763. [原论文页面](https://proceedings.mlr.press/v139/radford21a.html)
- Miller, G. A. (1995). *WordNet: A Lexical Database for English*. Communications of the ACM, 38(11), 39–41. [官方引用信息](https://wordnet.princeton.edu/citing-wordnet)
- Fellbaum, C. (Ed.). (1998). *WordNet: An Electronic Lexical Database*. MIT Press. [官方引用信息](https://wordnet.princeton.edu/citing-wordnet)

按现有 report 的格式处理 Chapter 2 正文引用。上面的 WordNet 文献用于解释所采用的词库准备方法，不代表已经完成了 WordNet 导入、模型效果评估或云端部署。
