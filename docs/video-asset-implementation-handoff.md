# 视频资产接入：实施步骤与 Agent 交接

日期：2026-11-01（Asia/Kuala_Lumpur）  
状态：**阶段 0–5 已接入代码，阶段 6 已完成隔离环境功能/权限/恢复与部分界面验收；原项目未部署。** 完整浏览器、真实手机、目标硬件与标签质量评估仍未完成。实际说明与证据见 [video-assets.md](video-assets.md)。

本文最初为规划交接；用户随后明确要求开始实施，现已按首版范围接入业务代码，未修改 FYP report。用户已确定目标是“视频资产管理＋抽帧视觉 AI 标签＋人工审核”；下文原规划建议应与实施记录区分，实际支持以 [video-assets.md](video-assets.md) 为准。

实施顺序：**功能开发 → 功能、权限及性能验收 → 整理真实证据 → 再修改报告。**

## 1. 目标与边界

完成以下闭环才算完成视频接入：

1. 上传视频，保存原文件和技术 metadata。
2. 在资产详情与历史版本中播放视频，支持暂停、音量和跳转。
3. 视频可在列表、类型筛选和搜索中正常使用。
4. 用户按现有权限管理手动标签、更新版本、改名、删除和评论。
5. 后台均匀抽帧，复用本地 CLIP 与受控词库生成视觉标签候选。
6. 用户查看画面依据，接受、编辑后接受或拒绝候选；已确认标签参与检索。
7. AI 失败可重试；旧任务、旧文件和手动操作不能相互覆盖。

本期不做视频音轨转录、声音识别、完整动作/剧情理解、自动剪辑、任意格式转码、字幕编辑、云端视频模型或 DRM。视频有声音时正常播放，但声音不参与本期 AI tagging。

回收站、侵权投诉和完整 Audit Trail 仍是独立规划，不能在实现视频时顺带视为已获实施授权，也不要求先完成它们才能接入视频。视频新增文件必须纳入当前删除与清理流程；若这些治理功能之后已落地，则遵循其状态限制。

相关文档：

- [范围决策与报告影响](video-asset-support-scope-plan.md)
- [Manager 只能修改自己的资产](asset-manager-ownership-permissions-plan.md)
- [Collaborator 下载限制](collaborator-download-restriction-plan.md)
- [Asset 与 Workspace 改名](asset-workspace-renaming-handoff.md)
- [侵权、删除治理与 Audit Trail 建议](fyp-copyright-deletion-audit-recommendations.md)

## 2. 应支持哪些视频格式

### 2.1 推荐的首版格式

**首版建议只接收 `.mp4`，实际视频编码为 H.264/AVC，音轨为 AAC-LC 或无音轨。** 不在服务器自动转换不支持的上传文件。容器和编码共同影响播放能力，`.mp4` 后缀本身不能保证浏览器可播放。[依据：MDN 容器说明](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Containers)

| 格式/组合 | 首版建议 | 后续方向 |
| --- | --- | --- |
| MP4 + H.264 + AAC-LC，或无音轨 | 纳入；逐项验证实际媒体流和目标浏览器 | 首版支持矩阵的基础 |
| MP4 + HEVC/H.265、AV1 或其他编码 | 暂不接收；明确提示不支持的编码 | 独立评估浏览器与解码成本 |
| WebM + VP8/VP9 + Opus/Vorbis，或无音轨 | 第二阶段候选，不在首版上传说明中宣称支持 | 添加真实样本、校验及播放测试后再开放 |
| MOV | 暂缓 | 常见导出格式，但还要处理不同视频编码和浏览器兼容性 |
| AVI、MKV、WMV、FLV、其他容器 | 暂缓 | 若将来引入统一预览转码，再单独规划 |

拒绝提示应说明原因，例如：“此 MP4 使用 HEVC；当前支持 H.264 视频及 AAC 音轨，请导出为支持的组合后再上传。”不要只显示“Invalid file”，也不要暗示更改扩展名就能转换编码。

### 2.2 推荐起始参数，需实测后冻结

这些是工程起点，不是准确率、处理速度或容量承诺。实施 Agent 在阶段 0 记录最终选值及理由；不增加格式或放宽上限作为未经评估的默认行为。

| 项目 | 推荐起点 | 校验/解释 |
| --- | --- | --- |
| 主文件大小 | `50 × 1024 × 1024` bytes（50 MiB） | 与现有主文件限制一致；前端说明、后端、版本上传、部署代理一致 |
| 时长 | `0 < duration ≤ 60` 秒 | 缺失、非有限值或无法可靠判定时拒绝；不能只信浏览器报告 |
| 分辨率 | 长边 ≤ 1920、短边 ≤ 1080 | 接受横屏与竖屏；校验实际编码尺寸，另外记录旋转后的显示尺寸 |
| 视频流 | 一条正常视频流 | 排除只有封面图片的“视频”、多角度视频、多视频轨和受保护/加密内容 |
| H.264 | 8-bit、4:2:0；Baseline/Main/High 中经实测的配置 | 记录 profile、level、像素格式；不承诺所有 H.264 变体 |
| 音频流 | 零或一条 AAC-LC 音轨，最多双声道 | 首版不做音轨选择；额外音轨明确拒绝 |
| 帧率 | 以 ≤ 60 fps 的样本作为首版范围 | VFR 不能把平均帧率当峰值保证；解码另有资源上限 |
| 字幕及额外数据轨 | 不提供字幕/数据轨功能 | 明确区分可忽略的普通容器信息与不支持的附加媒体流；不得凭扩展名默认接收 |
| 抽帧 | 每约 2 秒一个采样区间，最多 30 帧 | 具体算法见第 6 节 |
| Worker 并发 | 每个 Worker 先串行处理一个视频任务 | 结合整台主机已有 CLIP/Whisper/YAMNet 内存占用实测 |
| 超时 | probe 15 秒、单次抽帧 45 秒、视频任务总计 300 秒作为初始上限 | 总时限独立于单次限制；模型启动耗时单独记录，不能让任务永久 processing |

不将 4K、长视频或手机默认 HEVC 文件误列为已支持。50 MiB/60 秒只是首版 FYP 范围；有需要时可以在有性能证据后另行调整。

## 3. 当前代码与缺口（2026-11-01 读取）

实施前再次核对实际代码；以下是观察结果，不是实现完成清单。

| 位置 | 当前行为 | 接入工作 |
| --- | --- | --- |
| `frontend/src/pages/UploadPage.jsx` | 上传扩展名未包含视频；上传后还有 metadata 保存请求 | 增加格式说明和选择；防止后续 metadata 保存覆盖技术字段 |
| `backend/src/middleware/modelUpload.js` | 主文件限 50 MiB，使用临时磁盘；响应结束清理临时目录 | 保持现有限制；验证应在临时文件有效期内完成 |
| `backend/src/utils/modelPackage.js` | `SUPPORTED` 无视频；通用存储可保存单文件；非模型格式主要依赖输入 MIME | 增加实际视频校验、规范化 MIME、技术 metadata，不把视频塞进 3D package manifest |
| `backend/src/controllers/assetsController.js` | 新建、版本上传、预览、删除、AI 入队和回写集中于此 | 接入校验结果、任务状态、历史 metadata、受保护字段与衍生文件清理 |
| `backend/src/models/asset.js` / `version.js` | Sequelize；Asset 有 JSON metadata；Version 没有 metadata 快照 | 加迁移；不要使用 Prisma 方案或新建重复的 Video 资产实体 |
| `queueAsset` / `createAiJob` | Redis payload 主要是 assetId/jobType；无持久任务 ID | 视频增加可追踪的任务、文件绑定与恢复机制 |
| `storeAiResult` | 只有可选 `metadata.ai.clip.sourceFilename` 检查；随后合并 metadata | 视频不能沿用可省略来源的回写；防止新旧任务竞态 |
| `updateAssetMetadata` | 整体替换 metadata | 视频技术数据与任务结果必须由服务端保留，避免旧表单覆盖新结果 |
| `ai-service/worker.py` / `main.py` | Worker 无视频分支；Redis `BRPOP`；另有服务鉴权的 `/jobs` 入口 | 新增视频处理；检查第二入口，不能绕过持久任务创建 |
| `ai-service/clip_tags.py` | 仅支持 `image` / `3d` 词库域；返回全量分数及筛选结果 | 视频帧复用 image 域，另外进行跨帧汇总 |
| `backend/src/utils/clipVocabulary.js` / `controllers/vocabularyController.js` | 视觉类型与词库规则仅 image/3d | 将视频帧映射到 image 词库域，保留共享词库权限 |
| `frontend/src/components/assets/AssetPreview.jsx` | 图片、音频、文本、模型；鉴权请求取 Blob；无视频分支 | 增加视频播放及取消/清理；刷新状态不重新获取整段视频 |
| `frontend/src/components/versions/VersionHistory.jsx` | 历史 Preview 按钮主要对 OBJ/FBX 开放 | 为视频增加独立于下载权限的历史预览入口 |
| `frontend/src/components/metadata/MetadataPanel.jsx` | 已有接受标签、确认框、折叠内容；AI 修改可经普通 metadata PUT | 视频候选走专用审核契约，技术信息只读 |
| `backend/src/utils/searchQuery.js` | video MIME 已包含 mp4/quicktime；查询可扫描整个 metadata/ai | 筛选存在不等于支持 MOV；未审核候选不能被普通搜索误当已确认标签 |
| `Dockerfile.ai` / `Dockerfile.backend` | AI 镜像已有 FFmpeg；backend 镜像未安装 | 上传校验若在 backend 执行，需给 backend 配置 ffprobe/ffmpeg |
| `.github/workflows/ci.yml` / `backend/package.json` | CI 当前主要跑 backend；backend test 为显式文件列表 | 新测试加入实际执行列表；补齐视频相关 frontend/AI 检查 |

## 4. 数据与接口设计建议

### 4.1 原文件、技术数据与历史版本

- 仍使用 `Asset` 与 `Version`，原文件采用现有随机对象 key；改名只改 `displayName`，不能改变用于任务绑定的对象身份。
- 技术数据建议放入受保护的 `Asset.metadata.media`：`schemaVersion`、`type: video`、`container`、`videoCodec`、`profile`、`level`、`pixelFormat`、`durationSeconds`、编码宽高、显示宽高、`rotationDegrees`、`avgFrameRate`、`audioCodec`、`audioChannels`、`hasAudio`。未知的可选信息用 null，不伪造 0。
- `avgFrameRate` 保存可解释的数值或有理数；不要显示为“恒定帧率”，也不要用 `duration × fps` 冒充实际帧数。
- 增加可空的 `Version.metadata` JSONB 快照，迁移兼容已有版本。`preserveCurrent` 在切换文件前保存当时技术信息及已确认结果；旧记录无数据时显示“暂无信息”。
- 版本预览使用该 Version 自己的 `fileName`/`mimeType`，不能回退到当前 Asset 文件。历史 metadata 不跟随新任务变化。
- 上传新版本时重建 `media`、清除当前文件的旧 AI 展示引用并重新建任务；不能保留旧视频时长/分辨率，也不能把它带到后来上传的非视频文件中。
- 保留现有人工 repository tags；提示用户检查它们是否仍适合新内容。新版本上传者不改变 `Asset.userId`。
- 当前视频换成图片、图片换成视频等既有允许的跨类型更新，要测试技术字段清理和任务失效。不要无意改变整个系统的版本类型规则。

### 4.2 持久任务：新增一个小范围模型

建议新增 `AssetAiJob`（名称可按仓库规范调整），首版为视频使用，不强制重写其他文件的 AI 流程；但所有能给视频排队或回写结果的入口都必须遵循同一契约。

| 字段组 | 建议内容 |
| --- | --- |
| 身份 | UUID `id`、`assetId`、`workspaceId`、不可变 `sourceFilename`、`jobType`、`requestedBy` |
| 状态 | `status`、`stage`、`attempt`、`leaseToken`、`leaseExpiresAt`、开始/完成/更新时间、有限错误码与可读错误摘要 |
| 固定输入 | 词库快照或可重建的不可变快照引用、模型版本、采样参数、汇总参数 |
| 输出 | 有上限的候选、帧时间点、分数、证据帧 manifest、实际成功采样数、处理耗时 |
| 审核 | 每个候选的 pending/accepted/edited/rejected、最终文本、审核人/时间、对应 Tag ID（如有） |

`Asset` 增加可空的 `currentAiJobId`，明确当前文件正在展示哪一批视频结果。字段只由服务端更新。旧资产无任务时仍正常工作；不是要求回填全部旧文件或重新运行全部 AI。

建议状态：`queued → processing → succeeded / failed`；`superseded` 表示新文件或新任务已取代，`cancelled` 表示资产被删除等取消原因。`stage` 可区分 downloading/extracting/tagging，用户界面显示易读名称，不展示伪造的精确百分比。

- 在锁定 Asset 的事务中创建任务、固定源文件和词库、替换当前任务引用；事务提交后再投递 Redis。
- Redis payload 至少有 `jobId`、`assetId`、`sourceFilename`；Worker 向服务端取得这一任务的可信输入，不自行拿“最新 Asset”替换任务文件。
- 重复点击默认返回已有的活动任务；明确的重新生成操作经确认后创建新任务，旧任务变为 superseded。
- Redis 投递失败不回滚成功上传的资产。保留可恢复的任务记录，界面显示等待/重试状态。
- `BRPOP` 会移除消息，不能仅靠 Redis 列表声称任务不丢失。加入周期恢复：重新投递超过等待期限的 queued 任务；处理租约到期的 processing 任务；最多 3 次尝试，达到上限转 failed。
- Worker 通过原子 claim 取得任务与新的 leaseToken；重复消息不能同时获得有效租约。续租、状态及完成回调都验证当前租约；超时的旧进程不能覆盖新的尝试。
- 回写事务同时检查 Asset 存在、workspace 匹配、源文件匹配、currentAiJobId 匹配、任务/租约有效。检查与写入必须在同一锁定事务，不能“先检查、稍后无条件保存”。重复完成回调幂等，过期回调返回可识别的 409/410，Worker 不无限重试。
- 现有内部 AI callback 对视频拒绝无 jobId 的结果，`ai-service /jobs` 不能直接创造 ID-less 视频任务。图片/音频/3D 的兼容分支必须另有回归测试。

### 4.3 对外与内部接口

可沿用现有 URL 风格；以下是建议契约，实施时更新 Swagger 与调用方，避免只加 UI。

| 接口 | 建议职责 | 权限 |
| --- | --- | --- |
| 现有 upload / versions/upload | 返回 asset/version 和 `processing: {jobId, status}`；技术校验失败不提交新版本 | 现有上传/本人资产写权限 |
| 现有 `POST /assets/ai/job` | 视频创建或返回活动任务，返回持久 jobId | Owner 或原上传 Manager |
| `GET /assets/:id/ai-jobs/current` | 只返回可展示的任务状态、候选、审核与证据引用 | viewAsset + 当前 workspace |
| `POST /assets/:id/ai-jobs/:jobId/review` | 原子处理一批候选决策；防重复/旧任务审核 | manageMetadata + 原上传者规则 |
| `GET /assets/:id/ai-jobs/:jobId/frames/:frameId` | 读取受保护的证据图；路径通过服务端 manifest 解析 | viewAsset，绑定 asset/job/frame/workspace |
| 现有当前/历史 preview | 鉴权读取正确文件，继续区分 download endpoint | viewAsset |
| 内部 job claim / heartbeat / result | 取得固定输入、续租、回写；校验服务 token 与任务/租约 | 仅内部服务鉴权 |

普通 metadata PUT 应在事务中保留服务端最新的 media、视频 AI 结果及任务引用；忽略旧客户端原样回传的受保护副本，或使用清晰的专用可编辑字段接口。禁止用整个客户端对象覆盖这些字段。视频候选的增删改走审核接口；其他资产既有 metadata 编辑体验不能因此全部失效。

### 4.4 候选审核与搜索

- **原始候选、词库快照和内部日志存 Job，不直接塞进可被全文检索的 Asset.metadata。** 当前搜索会扫描 metadata，简单增加 `pendingCandidates` 字段会让未审核标签进入搜索。
- 接受：校验候选属于当前有效任务，规范化名称，在事务中幂等添加 repository Tag 并记录决策。允许接受已存在的同名 Tag，但不重复创建关联。
- 编辑后接受：记录原候选和最终人工文本，走现有标签长度/规范化规则；人工标签不必是 CLIP 视觉词库中的概念。
- 拒绝：更新候选决策；不删除本来就存在的人工 Tag。删除 repository Tag 继续使用既有操作与确认框。
- 建议仅把**当前文件仍有效、已接受且 Tag 关联仍存在**的标签投影到 `metadata.ai.videoTags`，供现有 AI 搜索使用；`findAiMatch` 增加对应来源。Raw scores/provenance 留在 Job，不扩大普通搜索面。
- 移除 Tag 时同步撤销该投影；重新生成清空当前批次投影但保留 repository tags 和历史决策，新任务不能自动把旧审核视为新审核。旧候选审核请求返回冲突，不偷偷应用到新任务。
- 普通 repository-tag 搜索继续找到用户保留的标签；新版本不把旧 AI 分数/证据显示成新文件结果。
- UI 展示“待审核建议”和“已确认标签”，无候选属于成功结果，不能显示成系统故障。

## 5. 上传、预览与存储处理

### 5.1 上传校验

1. 先执行现有角色、workspace 和资产所有权检查，再接收/处理文件；新版本保持现有先鉴权后 multer 顺序。
2. 检查大小与扩展名，再使用 backend 可用的 ffprobe 读取实际容器、媒体流与技术信息。不要信任上传的 Content-Type，也不要因探测结果同时包含 mov/mp4 family 就默认它是允许的 MP4；结合容器标识与实际流验证。
3. 校验第 2 节的范围，规范化 MIME 为 `video/mp4`。Probe 返回的 `N/A`、分母为 0、无穷数、异常 JSON、无视频流均有明确处理。
4. 执行有界的解码检查。Probe/少量画面成功不等于完整文件无损坏；后续完整处理若遇到中段损坏，保留原资产并显示处理/播放错误，不声称上传校验保证整片完好。
5. 验证完成后才持久化资产/版本。无效新文件不得生成版本记录、替换当前文件或遗留 MinIO 对象。
6. 数据库和对象存储不能假定同一事务；沿用 writtenKeys 补偿清理。不要把异步 Worker 指向响应结束就删除的 multer 临时路径。

ffprobe 可提供结构化 JSON 与 stream/format 字段；实施时限制输出字段与体积，不能解析人读日志充当可靠协议。[依据：FFprobe 官方文档](https://www.ffmpeg.org/ffprobe.html)

### 5.2 首版播放方案：鉴权 Blob

**首版推荐复用现有带 Bearer 与 Workspace header 的 Blob 预览。** 在 50 MiB/60 秒范围内，这能复用当前鉴权，不需要先重做会话体系。代价是取得整份文件后才能播放；网络读取不等于支持 HTTP Range。

- 新增可复用的视频播放器，供当前 Asset 和 Version 使用；使用正确的受保护 preview API。
- 为视频预览设置适当的超时（可先沿用历史预览的 120 秒），显示加载/失败/重试。只有打开预览时才获取视频，不在网格卡片中下载整段文件。
- 获取 Blob 后可以拖动本地视频时间轴；验收同时记录“首次等待时间”和“加载后跳转”，不能宣传即时起播或服务器分段播放。
- 使用稳定的 assetId、sourceFilename/versionId 作为加载依赖；任务轮询、改名或 metadata 刷新不能导致重新获取整份视频。
- 路由、workspace、文件或历史版本切换时取消请求、停止播放器、撤销 Object URL；只保留当前打开的播放器。防止切换后旧请求把旧 Workspace 的预览挂回页面。
- `playsInline`、保持比例、限制最大高度，不自动播放；历史预览按钮以 viewAsset 控制，不能放在 canDownload 条件下。
- Collaborator 无下载/导出按钮，download API 继续拒绝。`controlsList="nodownload"` 只影响部分浏览器控制项，不能保证隐藏所有浏览器保存能力，也不是 DRM。[依据：MDN controlsList](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/controlsList)
- 在目标浏览器检查原生控件；如首版目标浏览器无法满足“不出现产品下载入口”，使用无下载项的可访问自定义控制栏，保留键盘操作及播放/暂停、跳转、音量、全屏。不用禁右键假装实现权限。

若实测 Blob 的等待/内存不可接受，另开受保护 Range 播放步骤：先设计能携带权限的媒体访问机制，再实现 206/416、正确长度、权限过期与跨 workspace 测试。不能把 Bearer token 放 URL，不能改成公共 MinIO URL；仅加 `<video src="/api/...">` 无法自动附带当前 Axios 的鉴权 header。Range 不是首版默认承诺。

### 5.3 封面与证据图

- 网格先显示视频图标、时长与处理状态；封面属于异步衍生物，尚未生成或失败时不影响播放。
- 封面和有限证据图使用私有对象存储，单独 manifest 记录 jobId、源文件身份、frameId、实际时间点、key、MIME、尺寸；外部只暴露受保护的资源引用。
- 默认只长期保存一张封面及最终候选需要的有限证据图（建议每个候选最多 2 张、每任务总计最多 10 张且去重）。全量采样图片为临时文件，完成/失败后清理。
- Version 快照可保留有效已完成任务的引用，以便其证据仍指向原文件；历史尚未完成的任务显示“当时暂无分析结果”，不能永久显示 processing。
- 重新生成后清理无当前 Asset/Version 引用的旧证据；先保证新结果提交成功，再回收旧对象。Asset 删除覆盖当前、历史、job 衍生物及临时残留。
- 删除与 Worker 并发：回调拒绝过期结果；按任务命名空间清理晚生成对象，补偿/定期清理无归属对象。不能只删除数据库行就认为所有视频副本已删除。

## 6. 抽帧与 CLIP 标签

### 6.1 复用 image 词库域

业务资产类型为 video，但单帧推理使用现有 `image` 词库、prompt 与 CLIP 模型。建议新增明确的“资产 → 视觉词库域”映射函数，供 backend 的 info、词库管理及 AI 任务快照调用；不要把所有 `assetType` 枚举直接加 `video` 后期待现有验证自动兼容。

- `Asset` 显示 video；任务记录输入类型 video / 分析方式 sampled frames / vocabulary domain image。
- `ClipVocabularyTagger.classify(..., asset_type="image")` 使用固定词库快照；不把视频喂入现有音频分支。
- `VisualVocabulary` 说明 Images 词库同样用于视频帧，避免用户以为修改只影响静态图片。
- 保留 Manager 管理 Workspace 共享词库的例外，包括当前视频由其他 Manager 上传的情况；该例外不授予资产修改权限。
- 不将 NPC、enemy、版权状态、工作流状态等需要语义或业务背景的概念作为画面能可靠判断的事实。

### 6.2 可复现的采样与汇总

1. 从私有存储有界地流式下载原文件至本任务临时目录，记录实际大小；不要使用整份 `.read()` 无限制驻留内存。
2. 再核对必要媒体信息及源文件身份；按时长 D 取 `N = min(30, max(1, ceil(D / 2)))`。
3. 请求时间点为 `t_i = (i + 0.5) × D / N`，`i = 0…N-1`。读取并记录**实际解码 PTS 对应的播放时间**，统一减去媒体起点；不能把 requested time 冒充 actual time。
4. 正确处理 VFR、旋转与显示比例；RGB、保持比例缩放至推理输入。对重复实际时间点去重；极短视频至少尝试一帧。记录 requestedCount、decodedCount、failedCount 与实际时间点列表。
5. 使用现有 classify 返回的完整有限分数集合做汇总，不能只统计每帧已截断 top-K 而误报“未出现”。可复用现有 facet 阈值和分差逻辑，但参数需固定并记录。
6. 初始汇总建议：按概念保留 `maxScore`、满足该帧筛选规则的 `hitFrameCount`、实际 `sampleCount` 与最高分证据；按 facet 保留代表性候选后限制总数（建议最多 10 个）。这是待评估策略，不宣称优于其他汇总方法。
7. 允许成功但 0 个候选。若部分帧失败，记录并在结果中提示“部分画面未处理”；建议成功帧少于请求数的一半（至少需要一帧）时判失败，具体容忍值在阶段 0 冻结。0 帧始终失败。
8. 内部保留模型名称/修订、词库版本与 revision、promptVersion、采样/汇总算法版本、阈值、实际样本数、耗时；UI 默认只展示候选、少量画面与时间点，更多依据折叠。

CLIP 分数沿用现有 cosine similarity 含义，不能标成“95% 正确概率”。命中采样帧比例不能写成内容持续时间比例；画面没有覆盖的短暂物体可能漏检。本方法不证明理解了视频中的动作、顺序或剧情。

### 6.3 资源与失败边界

- FFmpeg/ffprobe 使用参数数组启动，不拼接 shell；只读取服务端本地临时文件，限制输入协议，避免媒体文件引用远程/外部资源。
- 限制进程数、线程、内存、临时磁盘、输出文件大小/数量、stdout/stderr 与总墙钟时间；缩小输出图片不能代替限制输入解码尺寸。
- 一次处理少量帧，及时释放图片/张量，复用既有模型；不每帧加载模型，也不新增一套视频大模型。
- `finally` 清理临时文件、终止超时子进程；Worker 崩溃后的残留由启动/定期清理补偿，清理范围严格限于任务目录。
- 网络/服务短暂故障可有限重试；不支持的编码、确定损坏和权限/来源失效不反复重试。错误页面允许用户播放/手动打标签，AI 失败不删除资产。

## 7. 权限与界面验收约束

| 操作 | Owner | 原上传 Manager | 其他 Manager | Collaborator |
| --- | --- | --- | --- | --- |
| 查看、播放当前/历史版本、阅读 metadata/候选 | 是 | 是 | 是 | 是 |
| 下载当前/历史原文件 | 是 | 是 | 是 | 否，UI 与 API 均受限 |
| 改名、更新版本、改 metadata、增删标签、审核/重新生成 AI | 是 | 是 | 否 | 否 |
| 删除资产 | 是 | 是 | 否 | 否 |
| 管理 Workspace 共享视觉词库 | 是 | 是 | 是 | 否 |
| 评论 | 沿用当前规则 | 沿用当前规则 | 沿用当前规则 | 沿用当前规则 |

以上全部限定当前 Workspace 和既有账户状态；跨 Workspace、移除成员、未登录均不能访问。SystemAdministrator 不因此取得全局视频读取权。实际角色名称和中间件以仓库实现为准。

- 延续现有配色，桌面优先、手机基本可用；不要为了视频接入重做整套页面。
- 详情先显示播放器与基础信息；时长、分辨率、编码等技术数据只读，详细信息可折叠。
- AI 状态与上传成功分开：等待处理、处理中、待审核、无合适建议、失败可重试。
- 证据图、候选和技术字段复用折叠/分页/内部滚动，不能再次把右侧栏拉到屏幕外；手机顺序堆叠并限制播放器高度。
- 重新生成、替换版本、删除资产/标签继续使用现有确认交互，明确影响的资产/版本/建议。接受单个建议可直接操作并反馈，拒绝建议可提供撤销；不要给所有无害操作堆确认框。
- 轮询使用独立任务状态请求（建议 3–5 秒），终态停止；离开页面/切换 workspace 停止；失败退避，不刷新整个详情导致播放位置丢失。
- 保留 keyboard focus、按钮名称、状态反馈和未保存编辑保护；手机验证播放、横竖屏及长标签换行。

## 8. 给实施 Agent 的阶段清单

每阶段交付可验证结果和剩余项。中途完成播放不能把整个视频任务标为完成；AI 与审核仍是目标的一部分。

| 阶段 | 修改范围与任务 | 通过条件 |
| --- | --- | --- |
| 0：复核与固定契约 | 读本文和最新代码；复核权限；固定格式/限制、API/schema、样本与资源参数；记录 Node/Python/FFmpeg/浏览器版本 | 不把建议写成已实现；准备有效/无效及权限测试素材 |
| 1：校验、存储与版本 | 增加 video probe helper、上传 allowlist、backend 工具依赖、media 字段与 Version 快照迁移；处理补偿与字段保护 | 当前/新版本有效上传；无效文件不影响旧数据；技术字段不可伪造或被旧表单覆盖 |
| 2：基础使用 | UploadPage、AssetPreview/独立播放器、VersionHistory、assetService、列表与类型筛选、只读技术面板 | 当前/历史可播放；Collaborator 可预览无下载入口；跨 workspace 拒绝；已有格式无回归 |
| 3：可靠任务与契约 | AssetAiJob 与 currentAiJobId 迁移；排队、claim、租约、状态查询、回调校验、恢复与删除清理 | Redis/Worker 中断可恢复；旧文件、旧任务及旧租约不能覆盖当前结果 |
| 4：视频 AI | 新增 video processing 模块；worker 视频分支；固定 image 词库映射；抽帧/汇总/私有证据；失败处理 | 有限资源下有结果或明确无建议/失败；每个候选有可核对来源时间点 |
| 5：审核与检索 | 专用 review API；前端候选审核与确认；repository tags、videoTags 投影及 searchQuery；权限例外回归 | 未审核/拒绝候选不作为已确认标签命中；接受/修改/移除与搜索一致；旧审核冲突可见 |
| 6：完整验收与部署说明 | 权限矩阵、端到端、失败恢复、浏览器/移动端、旧格式回归；资源测量与迁移/回退记录 | 第 9 节通过，未通过项明确列出；更新实际支持说明 |
| 7：报告准备，单独后续任务 | 整理功能截图、图表变化、真实配置、评估与限制 | **仅在功能完成验收后开始修改 report**；不能把计划/假设写成实验结果 |

建议新增代码位置（可小幅调整，不应把整条管线堆入现有大 controller）：

- Backend：`utils/videoMetadata.js`、`services/assetAiJobs.js`、job controller/model/migrations 及相关测试。
- AI：`video_processing.py`、`tests/test_video_processing.py`，在 worker 中保持按类型分派。
- Frontend：复用的 VideoPreview 与 VideoSuggestions 组件；assetService 中集中视频任务接口。
- 文档：实际支持矩阵、验收记录、部署说明；Swagger 与配置示例同步。

实施应保护已有工作区改动，不修改无关 `exports/`、`projects/` 文件，不清空/重建用户数据库。新增表/可空列用正常迁移；既有资产默认保持原行为。此文档不授权自动部署、数据库重置或删除现有资产。

## 9. 验证矩阵与完成定义

### 9.1 必须覆盖的场景

| 类别 | 样本/操作 | 预期 |
| --- | --- | --- |
| 支持格式 | H.264/AAC MP4、无音轨、横竖屏、旋转标记、极短片、VFR | 上传、技术信息、播放与采样时间点正确 |
| 限制边界 | 大小/时长/尺寸恰等于上限及刚超限、60 fps、低帧率 | 前后端规则一致；错误不留下新资产/版本/对象 |
| 假格式/坏文件 | 文本改后缀、MOV 改 mp4、MP4+HEVC、只有音轨/封面、多轨、截断、损坏、probe 超时 | 明确拒绝或在后续解码发现时明确失败；不伪装成功分析 |
| 版本 | v1→v2、两人并发更新、跨类型更新、历史视频播放 | 历史仍对应 v1，当前对应 v2；旧 technical/AI 数据不泄漏到新文件 |
| 身份与权限 | 四种角色、其他 workspace、被移除成员、伪造 job/version/frame ID | 每个新增入口都校验；前端隐藏不能代替 backend 拒绝 |
| 旧任务 | A 在跑时上传 B；A 在跑时重新生成；任务完成时同时编辑 metadata/删除资产 | A 不能覆写 B 或人工内容；删除后不恢复记录，不留下可访问证据 |
| 恢复与幂等 | Redis 不可用、Worker 在 BRPOP 后退出、租约过期、重复消息/回调、回调网络失败 | 可恢复且有限重试；同一结果/Tag 不重复；旧租约无效 |
| 审核 | 接受、编辑接受、拒绝、重复请求、已存在标签、删除已接受 Tag、旧候选请求 | 决策与关联一致；人工标签不会被拒绝/重新生成意外删除 |
| 搜索 | 仅出现在 pending/rejected 候选、词库或内部日志中的词 | 不作为视频已确认标签命中；接受后命中，删除后不因旧投影残留命中 |
| 播放资源 | 50 MiB、慢网、取消加载、频繁改名/轮询、切换 workspace、历史预览开关 | 不重复整段获取、不遗留 Object URL、不显示过期页面数据 |
| 页面 | 桌面 Chrome/Edge/Firefox；至少一种真实移动浏览器；Safari 有条件则验证 | 记录实际系统/版本；未测浏览器不宣称通过；侧栏、控件、下载入口符合要求 |
| 原有类型 | 图片、MP3/WAV、OBJ/FBX package、文本/脚本/数据 | 上传、预览、版本、词库、AI、改名、搜索及权限无相关回归 |

### 9.2 测试执行与证据

- Backend 采用现有 Node test runner；将新增测试加入 `backend/package.json` 的显式 test 列表，执行 `npm --prefix backend test`。
- Frontend 使用现有测试体系，执行 `npm --prefix frontend test -- --watchAll=false --runInBand`、`npm --prefix frontend run lint` 与 `npm --prefix frontend run build`；记录原有失败，不能虚报全部通过。
- AI 使用 pytest（仓库已有 `pytest.ini` 和函数式测试）。在 `ai-service` 工作目录执行 `python -m pytest`；测试环境显式安装/声明 pytest，不误用 unittest 得到 0 tests passed。
- 快速测试使用 mock probe/CLIP/MinIO/Redis；另用小型真实媒体测试解码、实际 PTS、旋转和浏览器播放。Mock 通过不证明真实视频可处理。
- 新迁移测试空库及带旧资产/版本的数据库；保持默认值兼容。按项目现有迁移入口执行，不能用 sync force 或删除数据库替代迁移。
- CI 补入相关 frontend/AI 检查；需要模型/FFmpeg 的集成检查明确标注环境，不让普通单测每次下载全部模型。
- 记录样本许可/来源、硬件、冷/热启动、处理耗时中位数及高分位/最大值、峰值内存/临时磁盘、失败数与总样本数。
- 比较单帧与多帧方法，预先定义相关标签标注与 precision/recall 或固定 K 的评价口径。按原始视频/来源分组划分调参与测试，不能用测试集反复调阈值。
- 资源/质量不能满足目标时如实降低支持范围或保留未完成项；不能仅因能运行一段 demo 就宣称稳定、准确或可扩展。

### 9.3 完成清单

- [ ] 支持格式、编码及所有限制有实际可执行校验和用户说明。
- [ ] 当前与历史视频可播放、可显示正确 metadata，下载权限未放宽。
- [ ] 手动标签、改名、版本、删除、评论沿用正确权限。
- [ ] 抽帧、视觉候选、证据、人工审核和检索闭环可用。
- [ ] 旧任务/文件/租约及并发 metadata 编辑不会覆盖当前结果。
- [ ] Worker/Redis 故障有明确状态与恢复；临时和衍生文件有清理。
- [ ] 既有类型回归、桌面/手机界面及限制测试有记录。
- [ ] 部署依赖、配置、迁移、禁用新增视频上传的回退办法已记录。
- [ ] 无凭空性能/准确率结论；报告修改尚未开始或在功能验收之后另行进行。

## 10. 后续扩展与报告衔接

建议扩展顺序：先依据首版实际反馈决定是否增加 WebM；再考虑更大文件与受保护 Range 预览；MOV/其他编码若要求广泛兼容，单独规划原文件＋转码预览、额外存储、队列成本与清理规则。不要通过仅修改 accept 字符串扩大承诺。

实施期间只收集证据与设计变化记录。完成后参照[范围文档第 7 节](video-asset-support-scope-plan.md#7-对-fyp-report-的影响)更新系统范围、AI 管线、图表、UI 截图、验证及限制；原始 report 由用户自行修改，本次未编辑。

## 11. 2026-11-01 实施交接

- 已新增视频 probe/解码校验、Version metadata 迁移、视频播放器和技术面板、视频类型筛选、持久 Job/租约/恢复、视频采样与 CLIP 汇总、私有证据、专用审核与 videoTags 搜索投影。
- 实际支持 MP4/H.264/AAC-LC 或无音轨、50 MiB/60 秒/1080p/60 fps；额外限制、参数、接口及资源上限见 [video-assets.md](video-assets.md)。
- 隔离验收已覆盖真实 PostgreSQL 迁移、MinIO 原文件/版本/证据、Redis 故障及消息恢复、真实本地 CLIP、角色权限、审核/检索、旋转和历史播放；未连接原有数据卷。
- Backend 174 tests，Frontend 33 suites/116 tests，Python 22 pytest；前端 lint/build、Backend Docker 构建通过。截图和未验证矩阵见实际记录。
- 阶段 7 未开始：未修改 Word report。第 9 节要求的全部真实样本、浏览器、手机、目标硬件和研究质量/性能实验尚未逐项通过，因此不勾选整个任务“全量验收完成”。

交接给下一位 Agent 时，至少写明：已完成阶段、变更文件、真实支持矩阵、已执行检查与结果、失败/未验证项、迁移/运行方式及剩余任务。不得只交接“视频已支持”一句话。
