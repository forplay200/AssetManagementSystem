# 视频资产：使用、部署与验收记录

日期：2026-11-01（Asia/Kuala_Lumpur）

状态：视频管理、抽帧 CLIP 建议、审核及检索代码已接入，已在隔离环境验收；尚未替换原项目服务。Word report 未修改。完整跨浏览器、真实移动设备、目标笔记本及标签质量评估仍待进行，不能把本文称为所有验收项目已完成。

## 1. 如何使用

1. Owner 或 Manager 在 **Upload** 选择 MP4。视频使用一份主文件，不需要 OBJ/FBX 的材质或附件步骤。
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
| 容器 | `.mp4`，文件头 major brand 为 isom/iso2/mp41/mp42/avc1；ffprobe 检查真实媒体流 |
| 视频 | 一条 H.264 流；8-bit yuv420p；Baseline/Constrained Baseline/Main/High；level ≤ 4.2 |
| 音轨 | 无音轨或一条 AAC-LC，1–2 声道 |
| 其他轨道 | 不接收封面代替视频、多视频/多音轨、字幕/其他媒体流、可识别的加密轨道 |
| 文件大小 | 非空，≤ 52,428,800 bytes（50 MiB）；上传及版本一致 |
| 时长 | `0 < duration ≤ 60` 秒；非有限/未知值拒绝 |
| 编码尺寸 | 长边 ≤ 1920，短边 ≤ 1080；横竖屏均可；方形像素 |
| 旋转 | 90 度的整数倍；保存编码尺寸及旋转后显示尺寸 |
| 帧率 | ffprobe 平均及报告帧率均须有效且 ≤ 60 fps；不把此项称为 VFR 峰值帧率保证 |
| 未开放 | HEVC/H.265、AV1、WebM、MOV、AVI、MKV 等；改后缀不等于转换 |

上传验证包含受限 ffprobe 与首帧解码。它不能保证整段视频完全无损；处理中遇到后段损坏会显示失败或部分帧未处理。无效上传在写入资产/版本前拒绝，不替换旧文件。

## 3. 采样、任务与资源配置

- 模型保持 `openai/clip-vit-base-patch32`，使用现有 `ClipVocabularyTagger` 的完整有限分数集合。
- `N = min(30, max(1, ceil(D / 2)))`，请求中点 `(i + 0.5) × D / N`；记录 ffmpeg showinfo 的实际 PTS，减去媒体起点；重复实际时间点去重。
- 对单帧极短片，若中点之后没有画面，回退首帧，保存真实时间点 0，不伪造为请求时间。
- 先按每帧 facet 阈值/分差计算命中，再汇总每概念 maxScore、hitFrameCount、sampleCount；先覆盖 facet，再取最多 10 个候选。未出现于单帧 top-K 的概念仍能参与汇总。
- 初始阈值 0.25、最大分差 0.04；在任务创建时固定。可用 `CLIP_IMAGE_MIN_SIMILARITY`、`CLIP_MAX_SCORE_GAP` 配置，需重新创建任务才作用于该任务。这些阈值尚未经过视频相关性评估。
- 至少成功解码请求数的一半（向上取整），且至少一帧；否则失败。允许成功但零候选，保留一张封面。
- 每候选最多两张证据，每任务合计最多十张、去重；全量采样文件只在任务临时目录保留。证据 Base64 合计最多 3 MiB，服务器 JSON 请求上限 4 MiB，并重新编码私有 JPEG。
- Backend 最多并行校验两个视频；单次 probe/开头解码 15 秒，输出 512 KiB，Linux 子进程地址空间 2 GiB、CPU 15 秒、文件输出 4 MiB、文件描述符 64。
- Worker 串行处理；流式下载最多 50 MiB；probe 15 秒、单次抽帧最多 45 秒，总任务期限 300 秒。Linux 解码子进程地址空间 2 GiB、CPU 45 秒、单输出文件 4 MiB、文件描述符 64；单张采样图 ≤ 500,000 bytes，最多 30 张。模型复用，不按帧重载。
- 每任务临时磁盘上界由原文件、最多 30 张采样图和两个有界日志构成，约 74 MiB；结果提交后清理。315 秒 watchdog 可重启卡住的 Worker；一小时以上的本模块残留目录在后续任务启动时清理。
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

本次未对原项目服务自动部署或操作原有数据卷。验收采用 `aether-video-validation` 隔离项目、临时内存数据库/MinIO 和独立端口；测试数据不是原有账号或资产。

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
- 新环境若有反向代理转发上传，应允许 50 MiB 主文件加 multipart 开销，且请求超时须覆盖校验；当前前端直接调用鉴权 Backend API。

暂停新增视频上传（现有视频读取不受此开关影响）：在 `.env` 设 `VIDEO_UPLOAD_ENABLED=false`，重新创建 backend。不要通过删除视频列/表回退已有数据。若确需执行 migration down，先导出 Job/Version metadata；down 会删除这些新增分析记录，应作为独立维护操作。

## 6. 本次已执行的验收

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
