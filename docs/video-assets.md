# 视频资产：使用、部署与验收记录

日期：2026-11-01（Asia/Kuala_Lumpur）

最近更新：2026-11-06（WebM 扩展已部署到原有 Docker 服务，部署记录见第 10 节）

状态：视频管理、抽帧 CLIP 建议、审核及检索代码已接入并在隔离环境验收；2026-11-03 已更新本机 AI 服务，真实上传的视频已成功完成分析，详见第 8 节。Word report 未修改。完整跨浏览器、真实移动设备、目标笔记本及标签质量评估仍待进行，不能把本文称为所有验收项目已完成。

## 1. 如何使用

1. Owner 或 Manager 在 **Upload** 选择 MP4 或 WebM。视频使用一份主文件，不需要 OBJ/FBX 的材质或附件步骤。
2. 上传完成进入详情。播放器加载鉴权后的完整文件，然后可播放、暂停、调音量、跳转和全屏。首版不是 HTTP Range 流式播放。
3. **Video information** 显示时长、显示尺寸，展开可查看编码、平均帧率、音轨和旋转信息。这些由服务器读取，不能手动修改。
4. **Video visual suggestions** 独立显示等待、处理、完成或失败。分析不阻止播放、评论或手动添加 repository tags。
5. 展开 **View sampled evidence** 查看建议依据及实际解码时间点。分数是 CLIP cosine similarity，不是正确概率。
6. Owner 或原上传 Manager 可 **Accept**、**Edit → Accept edited tag**、**Reject**；可撤销拒绝。只有接受后的标签才加入 repository tags 和当前视频的 AI 检索投影。编辑后的文本属于人工修正，原始建议与分数仍保留。
7. **Search → Asset type → Videos** 筛选视频；接受后的标签可通过 AI tag 条件检索。未经审核/拒绝的候选不会因此被命中。
8. **Versions → Upload new version** 替换文件；此前的文件及 metadata 会保留。历史 Preview 使用对应旧文件，允许 Collaborator 预览。Repository tags 保留，请检查它们是否仍适合新内容。
9. 失败时可 **Retry analysis**；已完成任务可确认后重新生成。重新生成保留人工 repository tags，但清空当前批次的 videoTags 投影，新候选重新审核。

词库仍为现有受控 CLIP 视觉词库。视频业务类型为 video，单帧分析复用 **Images / video frames** 词库域；没有新增视频大模型，也未引入 WordNet。音轨只参与播放，不做视频语音转录、声音识别、剧情或动作理解。

## 2. 实际支持范围

| 项目 | 当前校验 |
| --- | --- |
| 容器 | `.mp4`：major brand 为 isom/iso2/mp41/mp42/avc1；`.webm`：有界 EBML 头 DocType 必须为 webm；再检查 ffprobe 媒体流，扩展名须与真实容器一致 |
| 视频 | 一条视频流。MP4：8-bit yuv420p H.264 Baseline/Constrained Baseline/Main/High，level ≤ 4.2。WebM：8-bit yuv420p VP8 或 VP9 profile 0；不接受透明或 HDR |
| 音轨 | 无音轨或一条 1–2 声道音轨。MP4：AAC-LC；WebM：Opus/Vorbis |
| 其他轨道 | 不接收封面代替视频、多视频/多音轨、字幕/其他媒体流、可识别的加密轨道 |
| 文件大小 | 非空，≤ 104,857,600 bytes（100 MiB）；上传及版本一致 |
| 时长 | `0 < duration ≤ 180` 秒；非有限/未知值拒绝 |
| 编码尺寸 | 长边 ≤ 1920，短边 ≤ 1080；横竖屏均可；方形像素 |
| 旋转 | 90 度的整数倍；保存编码尺寸及旋转后显示尺寸 |
| 帧率 | ffprobe 平均及报告帧率均须有效且 ≤ 60 fps；不把此项称为 VFR 峰值帧率保证 |
| 未开放 | HEVC/H.265、AV1、10-bit/HDR、透明视频、MOV、AVI、普通 MKV 等；改后缀不等于转换 |

上传验证包含受限 ffprobe 与首帧解码。它不能保证整段视频完全无损；处理中遇到后段损坏会显示失败或部分帧未处理。无效上传在写入资产/版本前拒绝，不替换旧文件。

## 3. 采样、任务与资源配置

- 模型保持 `openai/clip-vit-base-patch32`，使用现有 `ClipVocabularyTagger` 的完整有限分数集合。
- 新任务使用 `midpoint-v2`：`N = min(45, max(1, ceil(D / 2)))`，请求中点 `(i + 0.5) × D / N`。旧 `midpoint-v1` 任务继续使用不可变快照的 30 帧上限；不回写旧任务输入。
- 一次顺序解码，select 在每个中点对应的时间区间选第一张可用画面；稀疏/VFR 跨过多个区间时不重复同一帧，缺失区间计为失败。showinfo 的整数 PTS × time_base 提供实际时间（避免显示用 pts_time 的小数截断），先减去媒体 start_time；FFmpeg 保留自动旋转。
- v2 输出包含 requestIndices；Backend 按该任务的 sampling 快照计算 requestedCount、检查实际 PTS 区间、严格递增与证据对应关系。旧 v1 回调不强制新增映射字段。
- 对单帧极短片，若中点之后没有画面，回退首帧，保存真实时间点 0，不伪造为请求时间。
- 先按每帧 facet 阈值/分差计算命中，再汇总每概念 maxScore、hitFrameCount、sampleCount；先覆盖 facet，再取最多 10 个候选。未出现于单帧 top-K 的概念仍能参与汇总。
- 初始阈值 0.25、最大分差 0.04；在任务创建时固定。可用 `CLIP_IMAGE_MIN_SIMILARITY`、`CLIP_MAX_SCORE_GAP` 配置，需重新创建任务才作用于该任务。这些阈值尚未经过视频相关性评估。
- 至少成功解码请求数的一半（向上取整），且至少一帧；否则失败。允许成功但零候选，保留一张封面。
- 每候选最多两张证据，每任务合计最多十张、去重；全量采样文件只在任务临时目录保留。证据 Base64 合计最多 3 MiB，服务器 JSON 请求上限 4 MiB，并重新编码私有 JPEG。
- Backend 最多并行校验两个视频；单次 probe/开头解码 15 秒，输出 512 KiB，Linux 子进程地址空间 2 GiB、CPU 15 秒、文件输出 4 MiB、文件描述符 64。
- Worker 串行处理；流式下载最多 100 MiB；probe 15 秒、一次顺序抽帧墙钟/CPU 上限 120 秒，总任务期限仍为 300 秒。Linux 子进程地址空间 2 GiB、单输出文件硬限制 4 MiB、文件描述符 64。应用在抽帧期间及结束后检查最多 45 张、每张 ≤ 500,000 bytes、合计 ≤ 22,500,000 bytes；stdout/stderr 分别 ≤ 4 MiB。模型复用，不按帧重载。
- 原文件加采样图预算约 121.5 MiB，另留两个日志最多 8 MiB 及运行开销，合计约 129.5 MiB。此为预算估算，监督检查存在时间间隔，不是实测峰值或文件系统硬配额。结果提交后清理；315 秒 watchdog 可重启卡住的 Worker；一小时以上的本模块残留目录在后续任务启动时清理。
- 新任务 JSON 记录 processing.deadlineSeconds=300；Backend 租约与恢复、Worker deadline/watchdog 一致，旧任务缺失该字段按 300 秒处理。前端只有视频上传和视频 Blob 预览请求放宽到 300 秒；一般 API 和非视频上传不变。大文件加载显示 MiB 进度、可取消/重试；切换文件/版本/workspace 或卸载时中止并释放 Blob URL。
- 60 秒租约、15 秒心跳、最多三次尝试。Backend 每 15 秒恢复未投递/超过 60 秒等待的 queued 任务及到期 processing 任务。Redis 可丢消息，持久 Job 是恢复依据。
- 回写同时锁 Asset 与 Job，检查 workspace、源 key、currentAiJobId、当前 leaseToken 和期限。视频拒绝旧的 ID-less `/ai-result`；FastAPI `/jobs` 也拒绝直接给视频排旧式消息。
- 私有证据位于 `video-jobs/<jobId>/<leaseToken>/`，外部只能通过鉴权 frame ID 接口读取。无 Asset/Version 引用的证据由有界周期扫描回收；删除覆盖原文件、历史及所有 Job 源文件/证据。

任务输入、候选及原始审核记录存 `AssetAiJobs`，不会塞进普通搜索扫描的 Asset.metadata。当前仅把仍有关联的已接受标签投影到 `metadata.ai.videoTags`；删除 repository tag 同步撤销投影。

## 4. 权限

| 操作 | Owner | 原上传 Manager | 其他 Manager | Collaborator |
| --- | --- | --- | --- | --- |
| 查看/播放当前及历史、metadata、建议、证据 | 是 | 是 | 是 | 是 |
| 下载原文件/历史文件 | 是 | 是 | 是 | 否 |
| 更新、改名、标签、审核、重新分析、删除 | 是 | 是 | 否 | 否 |
| 管理共享视觉词库 | 是 | 是 | 是 | 否 |

全部限定当前 Workspace 及有效账户/成员状态。SystemAdministrator 无工作区全局读取权。Collaborator 原生控件使用 `nodownload`，产品不提供下载按钮，下载 API 返回 403；鉴权播放不是 DRM。

## 5. 迁移与部署

2026-11-01 的验收采用 `aether-video-validation` 隔离项目、临时内存数据库/MinIO 和独立端口，当时未部署原项目服务。2026-11-03 的本机故障修复见第 8 节；两次操作均未重置原有数据卷。

正常部署前保留数据库及对象存储备份。在项目根目录执行：

```powershell
docker compose build backend frontend ai-service ai-worker
docker compose up -d
docker compose logs --tail 100 backend ai-worker
```

- Backend 镜像新增 ffmpeg/ffprobe 与 util-linux-misc（prlimit）。AI 镜像已有 FFmpeg；新增 Python 模块不改变现有模型名称。
- 正常 Backend 启动入口执行 `20261101000000-add-video-assets.js`：新增 `AssetAiJobs`、可空 `Assets.currentAiJobId` 与 `Versions.metadata`。保留既有 Asset/Version 行；不回填旧 AI 结果，不强制重跑所有资产。
- 沿用项目已有 startup `sync({ alter: true })`；本次未改成另一套迁移框架，未使用 `sync force` 或重建数据库。
- 视频版本直接引用不可变原文件对象，由 Version 接管引用，不额外拷贝出无归属的视频原件。仅已成功分析的 Job ID 会进入新 Version 的证据引用。
- `AI_SERVICE_TOKEN` 必须在 Backend、API 服务、Worker 一致。AI 服务与 Redis 保持内部网络。
- 自行运行 Backend 时需配置 FFmpeg/ffprobe；Windows 可设 `FFMPEG_PATH`、`FFPROBE_PATH`。首版生产资源限制针对 Linux Docker 实现。
- 新环境若有反向代理转发上传，请设置例如 Nginx `client_max_body_size 101m;`，容纳 100 MiB 文件和 multipart 字段/边界；上传/读取超时需覆盖校验和大文件传输（例如 300 秒）。当前前端 Nginx 仅服务静态文件，浏览器直接调用鉴权 Backend API，因此没有现有上传代理配置需要放宽。Backend 仍按文件字节执行 100 MiB 包总量、视频 100 MiB、其他主文件 50 MiB、MTL 2 MiB、纹理每张 10 MiB。

暂停新增视频上传（现有视频读取不受此开关影响）：在 `.env` 设 `VIDEO_UPLOAD_ENABLED=false`，重新创建 backend。不要通过删除视频列/表回退已有数据。若确需执行 migration down，先导出 Job/Version metadata；down 会删除这些新增分析记录，应作为独立维护操作。

## 6. 首版历史验收（2026-11-01：50 MiB / 60 秒 / 30 帧）

| 类别 | 真实结果 |
| --- | --- |
| Backend | 174 项 Node tests 通过，含真实 FFmpeg 上传校验；无跳过 |
| Frontend | 33 suites / 116 tests 通过；lint 与 production build 通过 |
| Python | 22 项 pytest 通过，含真实 7 fps 视频 PTS 与 0.04 秒单帧回退；有一条测试依赖的 Starlette/httpx 弃用警告 |
| 镜像 | 独立测试标签的 Backend、Frontend 镜像均构建通过；Linux prlimit/ffprobe/ffmpeg 实际执行通过 |
| 数据迁移 | 隔离 PostgreSQL 15 空库正常启动；另建旧 schema/旧 Asset/Version 数据，up 连续执行两次后旧行/metadata 保留，新列为 null |
| 上传及无效替换 | 自制 H.264/AAC MP4 上传及技术信息正确；假 MP4、新建/替换被拒绝，Asset/Version 数量与 MinIO 对象集合未增加 |
| 权限 | 四种工作区角色可读取；Collaborator 当前/历史下载 403、预览 200；他人 Manager 可下载但不能审核/重新分析 |
| 真实 CLIP | 使用已有本地模型缓存、CPU 跑通下载→抽帧→建议→私有证据→回调；原模型及 image 词库域不变 |
| 审核与搜索 | pending 查询不命中；接受后命中；重复接受无重复 Tag；移除后不再通过 AI 投影命中；旧 Job 审核 409 |
| 故障恢复 | 停止隔离 Redis 时任务仍持久 queued，视频/人工标签保留；恢复后投递；丢消息重新排队；旧租约拒绝，三次到期后 failed，用户 retry 新建任务 |
| 浏览器 | Windows 内嵌 Chromium：当前竖屏 240×320 与历史横屏 320×240 均 readyState 4、duration 4 s；Collaborator 实际播放时间推进；原生菜单无下载项 |
| 页面审核 | 原上传 Manager 在 UI 编辑后接受、拒绝、撤销拒绝成功；审核前后播放器 Blob URL 相同 |
| 删除清理 | 隔离资产删除后，Asset/Version 行归零，MinIO 对象集合为空；原文件、历史副本和所有 Job 证据均无残留 |
| 响应式 | 390×844 视口模拟，document clientWidth/scrollWidth 均 380，无横向溢出；不等同真实手机验收 |

测试视频由 FFmpeg color/sine 自行生成，无第三方素材。纯蓝画面会产生不合适的语义候选，说明管线打通不能证明标签质量；UI 验收将候选人工修正为 `blue test frame`，不得把这个人工文本当作 CLIP 原始预测。

一次 4 秒、320×240、7 fps 的自制样本实际采样 PTS 为 1、3 秒；两次真实处理记录约 1.69 秒和 0.94 秒。重试测试的单独 CLIP 进程峰值 RSS 约 1324.85 MiB。这些只是诊断数据，**不是**平均速度/高分位基准，也未包含同时加载 Whisper、YAMNet 等全部服务的总内存。

验收主机 CPU 为 Intel Core Ultra 5 225F，约 31.6 GiB RAM；CLIP 使用 CPU。Windows 测试 FFmpeg 8.1.2、容器 FFmpeg 8.1.3，Python 3.12.14（本机 tests）/3.11（现有 AI 镜像），Node 24.22.1、PostgreSQL 15。不能据此宣称 RTX 4060 8 GB / 16 GB RAM 笔记本或云端的性能已验收。

截图保存在 `exports/video-collaborator-preview-20261101.png`、`video-history-preview-20261101.png`、`video-manager-review-20261101.png`、`video-mobile-layout-20261101.png`。

## 7. 尚未完成的验收及报告工作

- Chrome/Edge/Firefox 分别验收、真实移动设备、Safari；大文件慢网等待/峰值内存、所有编码/profile/VFR/分辨率边界的真实样本矩阵。
- 目标 16 GB 笔记本与整套 AI 服务共同运行的资源评估，云端配置与部署。
- 授权游戏视频的单帧对多帧对照、预定义标签相关性规则、precision/recall 或固定 K 指标、失败率与处理时间分布。不能用本次色块演示替代研究评估。
- Report 由用户自行修改；后续按 scope plan 对实际实现补充，保留限制及人工审核，勿预写准确率或速度提升。

接口契约见 `backend/swagger.yaml`；原计划见 [video-asset-implementation-handoff.md](video-asset-implementation-handoff.md)。媒体参数依据参见 [FFprobe 官方文档](https://www.ffmpeg.org/ffprobe.html)、[FFmpeg showinfo](https://ffmpeg.org/ffmpeg-filters.html#showinfo)。

## 8. 2026-11-03：真实上传一直等待的排查与恢复

- 现象：上传自制 10 秒卡车 MP4 后，视频可查看，但没有 AI 建议。
- 根因：本机前后端已经更新，`ai-service` / `ai-worker` 容器仍使用两周前的代码。旧 Worker 没有 `video_processing.py` 或 `process_video` 分支，日志明确出现 `Skipping asset 66 because file type is unsupported`。它取走 Redis 消息却没有 claim 视频 Job，因此任务一直 `queued / waiting`、attempt 为 0。
- 处理：保留旧镜像为 `assetmanagementsystem-ai-runtime:pre-video-20261103` 及 `pre-video-service-20261103`，复用原镜像的模型和依赖，仅叠加当前 Python 业务文件，再以 Compose 重建两个 AI 容器。原镜像与工作区 `requirements.txt` SHA-256 一致，未重新安装或升级依赖，未更换 CLIP/Whisper/YAMNet 模型配置。
- 结果：持久任务恢复机制自动重新投递原任务，无需重新上传或手动修改数据库。Asset 66 的当前 Job `e177f07f-ad98-4d6c-88fd-3a62a591964f` 已为 `succeeded / completed`、attempt 为 1；在 1、3、5、7、9 秒成功采样 5 帧，生成 `truck`，命中 5/5 帧，初次结果回写时审核状态为 pending；末次核查已为 accepted。本次修复未调用审核接口，没有自动替用户接受标签。
- 数据：保留原视频、Asset ID、账号及 Workspace；未重建数据库，未清理 Redis 或删除存储卷。新容器首次启动还会初始化现有的多个模型；本次重新取得了相同 Whisper base 缓存。

以后发布视频后端变更时，应同时更新 AI 服务与 Worker。只重建 frontend 不会让旧 Worker 获得 MP4 处理能力；正常完整构建命令仍见第 5 节。


## 9. WebM 扩展验收（2026-11-06）

本次依据 `video-webm-duration-extension-handoff.md` 修改代码。未自动部署原有服务，未修改原始 Word report、模型或用户数据。新旧任务结构兼容，无新增数据库列或迁移。隔离项目为 `aether-webm-validation`，PostgreSQL/MinIO 使用 tmpfs，端口与原服务分开；验收后移除。

### 本轮检查结果

| 类别 | 本轮结果 |
| --- | --- |
| Backend | 242 项通过；5 项独立 public-trial 数据库测试未配置而跳过。已启用并通过真实治理 PostgreSQL/MinIO 测试，覆盖来源版本、编辑锁、回收站、恢复与原件/历史/视频证据清理 |
| Frontend | 42 suites / 145 tests 通过；lint / production build 通过。含两处 100 MiB 上传、WebM 历史预览、进度/取消、Blob 清理及稳定文件标识 |
| Python | 40 项通过，包含真实 MP4/VP8/VP9、旧 30 帧/新 45 帧快照、极短回退、VFR、非零 start_time、旋转、稀疏 PTS 去重与成功比例；一条 Starlette/httpx 测试依赖弃用警告 |
| 格式与边界 | VP8/Opus、VP9/Opus、VP9/Vorbis、无音轨与竖屏/极短 WebM；拒绝 MKV 伪装、假扩展名、损坏 EBML、未知 duration、AV1、10-bit、透明视频；100 MiB MP4/WebM 接受，超一字节和非视频 >50 MiB 拒绝，MTL/纹理旧限制保留 |
| 真实任务 | 60/180 秒 MP4、VP8、VP9 均上传并完成原 CLIP 回写；60 秒 30/30、180 秒 45/45；审核后可检索；完整 100 MiB 两种容器均完成 Worker 下载与分析 |
| 版本与权限 | MP4→WebM→MP4，历史容器/metadata/原上传者保留；无效替换不改变原文件、任务或版本数；其他 Manager 不可修改但可管理共享词库；Collaborator 当前/历史预览可用，下载仍 403；回收站状态拒绝预览 |
| 浏览器 | Windows IAB Chromium 实际播放 180 秒 VP9 WebM、60 秒 WebM 历史及 100 MiB MP4，readyState=4、播放进度递增；Collaborator 无下载按钮且 controlsList=nodownload；Search 显示 Videos (.mp4, .webm) 并返回两种格式 |

100 MiB 测试文件采用合法 MP4 free box / WebM Void 填充以精确验证容量边界，不能把这些样本视为高码率复杂画面性能验收。临时 job 目录验收后为 0。隔离 Worker 只加载原 CLIP 及其 tagger，不加载正式 Worker 的 Whisper/YAMNet/KeyBERT；正式 Worker 的消息路由仍由相同持久视频处理函数执行。

### 解码对比与处理耗时

测试机为 Intel Core Ultra 5 225F、约 31.6 GiB 系统内存，Docker 可用约 15.44 GiB，CLIP 使用 CPU / 4 Torch threads；FFmpeg 7.1.5、Python 3.11.15。下表为自制卡车视频缩为 320×180 / 15 fps 的单次测量，缓存和运行先后未控制；不是统计性 benchmark 或标签质量评估。旧方式对每个目标重新从头解码，本轮对同一目标配置顺序解码。单独解码对比使用空 tagger，不含模型推理；实际 CLIP 任务耗时另列。

| 编码 / 秒数 | 反复解码（秒） | 顺序管线（秒，无推理） | 实际 CLIP 任务（秒） | 成功采样 |
| --- | --- | --- | --- | --- |
| h264 / 60 | 3.627 | 0.264 | 2.357 | 30/30 |
| h264 / 180 | 8.248 | 0.408 | 2.003 | 45/45 |
| vp8 / 60 | 3.778 | 0.256 | 1.356 | 30/30 |
| vp8 / 180 | 9.302 | 0.460 | 2.059 | 45/45 |
| vp9 / 60 | 3.930 | 0.256 | 1.349 | 30/30 |
| vp9 / 180 | 10.308 | 0.459 | 2.077 | 45/45 |

补充 180 秒 / 1920×1080 / 60 fps 的静态色块样本：MP4 H.264 约 6.096 秒、WebM VP9 约 4.604 秒，均 45/45；它们验证分辨率/帧率/时长组合与资源限制，不代表复杂 gameplay 的性能。小样本解码对比中子进程 max RSS 约 62.4 MiB；任务结束后 CLIP-only 容器当前使用约 512.2 MiB，均不能作为完整正式 Worker 的峰值内存结论。原始测量见 [机器可读验收记录](validation/video-webm-20261106.json)。

未完成：目标 RTX 4060 / 16GB 笔记本实测、完整移动/Safari/Firefox 矩阵、限速慢网浏览器验收、真实复杂视频性能和标签相关性量化。加载取消/切换/迟到响应与 URL 释放已做组件测试，不等同于慢网实机测试。

### 变更入口及部署

- Backend：`src/utils/videoPolicy.js`（新），`videoMetadata.js`、`modelPackage.js`、`clipVocabulary.js`、`searchQuery.js`，`middleware/modelUpload.js`，`services/assetAiJobs.js`，相关测试、`package.json` 和 Swagger。
- AI：`video_policy.py`（新）、`video_processing.py`、`video_decoder.py`、`main.py`、`worker.py` 及相应测试。模型、依赖清单不变。
- Frontend：Upload/Search、VersionHistory、AssetPreview/Card/Thumbnail、MetadataPanel、VideoTechnicalInfo、VideoPreview、assetService 及相应测试。`formatBytes` 仍按 1024 计算，单位标记改为 KiB/MiB/GiB。
- 文档：README、本文与机器可读验收记录；Word 未修改。此前未提交的治理、来源版本、配额及其他修改保留。

保持 `VIDEO_UPLOAD_ENABLED` 开关及其默认值；无需新增环境变量或迁移。不要让新版 Backend 先开始向旧 Worker 投递 WebM / midpoint-v2 任务。准备部署时先停止旧 AI 接收与处理进程，再完整重建并协调创建服务（这次未执行以下生产操作）：

```powershell
docker compose stop backend ai-service ai-worker
docker compose build backend frontend ai-service ai-worker
docker compose up -d backend frontend ai-service ai-worker
docker compose logs --tail 100 backend ai-worker
```

先停止 Backend 会有维护窗口，也避免构建期间旧 Worker 获得新任务；沿用既有数据库和对象存储卷，不运行 down -v。若构建失败，修复后继续构建并启动；不要只恢复新版 Backend 配旧 Worker。整体任务期限保持 300 秒、watchdog 315 秒；60 秒租约和 15 秒心跳不变，顺序抽帧子进程的 CPU/墙钟额度为 120 秒。

### Report 手动更新位置

按本次 handoff 的第 9 节，由用户手动更新 1.5.2 System Scope 中的视频范围为 MP4/H.264/AAC-LC、WebM/VP8/VP9/Opus/Vorbis、100 MiB、三分钟、最多 45 帧且需审核。若实现/测试章节描述首版限制，再同步容器校验、顺序解码、实际 PTS 与本轮边界测试；保留首版 50 MiB/60 秒/30 帧测试为历史数据。原 Word 文件未改动。

## 10. 原有 Docker 部署（2026-11-06）

用户明确授权后已完成部署：Backend、Frontend 正常构建；两个 AI 镜像基于原已验证 Worker runtime 复制当前全部 Python 模块构建，依赖及模型保持原版本。常规 AI Dockerfile 的非固定 pip 层开始重新安装依赖后已中止，未将该层部署。现有 API 镜像、Worker 镜像与本地 requirements.txt 的 SHA256 均为 `8132fb019c9447ee7592460d7fa7beabbf5a4a64d78d977f5f538a732572feed`，故采用相同依赖运行时覆盖代码层。无需改动 Compose、模型或数据库结构；正常启动仍执行现有幂等迁移。

- Backend image：`cf5e71e1c899a3f9d1d6b71c519558e9c1a8a65836b9af1e1bc9477fe237c983`。
- Frontend image：`762a5a3408beb7f5f6dcd06fec309e20787a4955b2fefa5430425517544dd3d4`。
- AI API / Worker image：`2fec666fa850981a2a702bbb5323f2efd05c8c0a028bde5c4d789b6056d24abb`。
- 七项服务均 running；四个重建应用容器重启计数为 0；Worker 已输出 `Worker started...`，CLIP、Whisper、YAMNet 均加载完成。本机继续使用 CPU。新容器重新取得同一 Whisper base 缓存，没有更换模型。
- `http://localhost/` 与 `/team` 均 HTTP 200；Backend health 的 database / redis / minio 均 ok，AI API health=ok；实际服务的前端脚本包含 `.webm`、100 MiB、180 seconds，容器内新策略为 100 MiB / 180 秒 / midpoint-v2 45 帧 / 300 秒任务期限。
- 部署前后 4 个 Users、17 个 Assets、3 个 Versions 数量一致；账号身份/密码散列和资产/版本文件引用的校验散列完全一致；22 个被引用的 MinIO 原件、包附件与历史对象全部 stat 成功。未往正式工作区新增测试账号或测试资产。
- 本地备份位于 `backups/webm-deploy-20261106/`（Git 忽略）：数据库自定义格式 dump、MinIO 完整数据卷 tar.gz、部署前后校验及本轮 AI 代码层 Dockerfile。保留四个 `assetmanagementsystem-<service>:pre-webm-20261106` 镜像标签供回退。未删除原数据卷，也未执行全局镜像/构建缓存清理。

本次记录证明原服务已加载新构建与原数据仍可用；完整格式、上传、CLIP 与版本端到端验收使用第 9 节的隔离环境结果，没有通过往用户工作区添加测试内容来重复验证。原 Word report 未修改。
