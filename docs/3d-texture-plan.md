# FBX / OBJ 贴图接入规划

日期：2026-10-07。状态：规划，尚未实现本文件中的功能。

## 1. 建议采用的范围

首期围绕一个完整流程：**主模型与伴随文件一起上传 → 检查引用 → 保存为一个资产 → 正确显示基础颜色与贴图 → 完整下载和保留版本**。随后接入服务器渲染及 CLIP 外观标签。

继续使用现有 `openai/clip-vit-base-patch32`。词库使用现有人工维护机制；本阶段无需启用 WordNet。开发演示考虑 RTX 4060 8 GB / 16 GB 内存，最终部署以云端环境为准。

| 首期支持 | 后续扩展 |
|---|---|
| OBJ、MTL、PNG/JPG/JPEG；FBX 的受支持内嵌图片和外部 PNG/JPG/JPEG | ZIP / 文件夹批量导入、TGA/DDS/KTX2 等额外贴图格式 |
| UV、多个材质、基础颜色、漫反射贴图、基础透明度 | 更完整的 normal/bump/PBR 材质兼容、复杂着色器 |
| 完整模型下载、贴图随版本保留、缺失文件提示 | 更复杂的材质编辑器、LOD 和专门的贴图压缩 |

OBJ 的材质由伴随 MTL 文件描述，Three.js 提供 `MTLLoader` 与 `OBJLoader.setMaterials()` 完成加载。[MTLLoader](https://threejs.org/docs/pages/MTLLoader.html)、[OBJLoader](https://threejs.org/docs/pages/OBJLoader.html)

FBX 可在导出时嵌入贴图，也可记录外部文件路径；跨设备使用时，引用原电脑上的文件路径并不能替代提供贴图文件。[Autodesk：Embed Media](https://help.autodesk.com/cloudhelp/2024/ENU/Maya-Basics/files/GUID-FE8DBEAA-C2DD-43B3-9933-4BA4CDDEAA89.htm)

## 2. 当前代码的缺口

| 部分 | 已查到的情况 | 需要调整 |
|---|---|---|
| UploadPage / assetService | 文件选择、拖入和 FormData 都只处理一个 `asset` 文件 | 3D 文件选中后增加材质与贴图附件区域 |
| 上传及版本 API | `upload.single('asset')`；Multer 使用内存存储 | 接收多文件并设置数量、大小限制；3D 附件使用临时磁盘或流式存储 |
| MinIO / Asset | 一个随机主文件 object key；没有附件清单 | 增加包清单和按版本隔离的资源路径 |
| OBJ 预览 | 直接 `OBJLoader.parse()`，没有设置 MTL 材质 | 先解析材质，再装配模型和贴图 |
| FBX 预览 | `FBXLoader.parse(buffer, '')`，没有外部资源映射或完整性状态 | 为外部贴图提供受控映射，等待纹理加载完成 |
| 内嵌 FBX | 当前 Three.js 加载器已有内嵌图片解析逻辑 | 用实际导出样本确认支持情况，不能统一判定所有 FBX 都缺贴图 |
| AI 预览 | Python 只提取顶点、面；PIL 以合成颜色绘制 | 引入真正保留 UV、材质、场景变换的带贴图渲染路径 |
| AI 标签 | 3D 只声明 `geometry` 能力，颜色/材质词条被限制 | 根据实际渲染结果开放相应外观词条 |
| 版本和下载 | 快照与下载只处理主文件 | 每次保留完整包；提供包含贴图的下载文件 |

上述结论来自当前项目代码，未进行模型导入、渲染或性能实验。

## 3. 上传前，用户怎样准备文件

### OBJ

导出模型时保留 UV，并导出材质文件；把实际使用的贴图一起准备好。推荐结构：

```text
chair/
  chair.obj
  chair.mtl
  textures/
    chair_diffuse.png
```

引用关系通常是：`chair.obj` 的 `mtllib` 指向 MTL，`usemtl` 指定材质；MTL 的 `map_Kd` 指向颜色贴图。用户选择主模型后，再选择这些伴随文件。首期的普通多文件选择可能只有文件名，因此系统要根据引用建立映射；文件夹原始层级的自动保留属于后续导入增强。

没有 MTL 的 OBJ 可以作为仅几何模型上传。仅提供 OBJ 和一张任意 PNG，不能保证知道图片应贴到哪个材质；首期提示用户补充对应的 MTL，或者明确选择仅几何模式。

### FBX

推荐导出为兼容的 Binary FBX，并在导出软件支持时启用 Embed Media / Embed Textures。只有确认贴图确实嵌入且受加载器支持，才可以只上传 FBX。外部贴图方案则上传 FBX 和它引用的图片；MTL 属于 OBJ 的伴随文件，不用于 FBX。

示例：

```text
robot/
  robot.fbx
  textures/
    robot_diffuse.jpg
```

具体 FBX 版本按现有加载器支持范围检查；不能承诺任意导出版本或原软件的复杂材质都能完全复现。[FBXLoader 支持说明](https://threejs.org/docs/pages/FBXLoader.html)

## 4. Upload 页面流程

1. **选择主文件。** `.obj` / `.fbx` 保持为一个资产的入口；图片、音频等继续使用单文件流程。
2. **展开“材质与贴图”区域。** OBJ 提供 MTL 文件选择及贴图多选；FBX 提供外部贴图多选，并显示内嵌贴图的检测结果。用户通过文件选择或拖放提供文件。[浏览器 File API](https://developer.mozilla.org/en-US/docs/Web/API/File_API/Using_files_from_web_applications)
3. **检查文件关联。** 展示已关联、缺失、不支持、名称冲突等状态。缺失资源应列出具体名称，如 `chair_diffuse.png`。
4. **处理缺失或冲突。** 可以补选文件；按原引用路径优先匹配，普通文件选择时仅在文件名唯一的情况下自动匹配。发生歧义时要求指定对应文件，或整理名称后重新导出，不能静默选第一个文件。
5. **显示本地预览。** 用户能在上传前看到基础贴图效果。提示“材质完整”“部分贴图缺失”或“仅几何”；预览只是用户确认步骤，后端仍须验证文件与引用。
6. **用户选择上传方式。** 正常上传完整模型；有缺失时可以明确选择“仅上传几何模型”，保留警告。附件文件格式不支持时，可以保留原文件用于下载，但不能宣称它参与了预览。
7. **上传并处理。** 分别显示传输与服务器处理状态。所有资源保存并提交清单后，再触发 AI；浏览器显示“上传成功”和“AI 分析中”两个不同状态。

建议页面文案：

```text
主模型          chair.obj
材质文件        chair.mtl                    已关联
贴图文件        chair_diffuse.png            已关联
贴图状态        基础颜色贴图已准备好

[添加伴随文件]   [预览模型]   [上传完整模型]
```

如需仅几何上传，单独提供明确选项；不要默认忽略用户提供的错误贴图。

## 5. 资源识别与绑定

- 同时处理 OBJ 中的 `mtllib`、`usemtl`、UV；支持模型内多个材质和多个 MTL 的合并，重复材质名称发生冲突时给出说明。
- MTL 路径按 MTL 所在逻辑目录解析。文件名带空格、贴图参数、Windows 反斜杠不能用简单的空格切割草率处理。
- 匹配顺序：清单中的明确绑定 → 规范化后的原相对路径 → 唯一文件名。大小写容错只用于无歧义的查找，不能覆盖两个不同资源。
- 将 Windows 绝对路径重新关联到用户提供的文件；不按模型路径访问服务器文件系统，也不下载模型引用的外部网址。
- 当前安装的 FBXLoader 会对部分 Windows 图片路径只保留文件名。首期遇到不同文件夹内同名贴图时应明确报冲突，并建议重命名、重新导出；不能承诺仅靠 URL 映射解决所有 FBX 路径歧义。
- 缺失基础颜色贴图、UV 缺失、不支持的图片解码、材质连接丢失分别记录。UV 或材质引用的存在不能直接证明纹理已成功渲染。
- FBX 内嵌图片来自加载器生成的 `blob:` / `data:` 资源，资源映射需保留这些有效内容，不能将它们误认为外部附件。

## 6. 保存为一个可保留版本的模型包

模型、材质和贴图作为一个 Asset 管理；附件不分别产生资产卡片或独立的 AI 图像任务。

建议先新增两个可为空的专用字段，控制数据库复杂度：

- `Asset.packageManifest`：当前 3D 包的 JSONB 清单。
- `Version.packageManifest`：历史包的清单快照。

这是服务端维护的结构，不放进用户可自由编辑的 metadata。旧单文件资产没有清单时，继续走当前单文件路径。

清单记录：包 ID、主文件 ID、各文件的资源 ID/逻辑路径/存储 key/用途/MIME/字节数/校验值，以及引用绑定。资源清单可以记录 `source`、`material`、`texture`；内嵌图片无需强制重复保存为外部文件，但应记录解析状态。

建议 MinIO 路径：

```text
workspaces/{workspaceId}/assets/{assetId}/packages/{packageId}/
  source/chair.obj
  source/chair.mtl
  source/textures/chair_diffuse.png
  derived/preview.png
```

`Asset.filename` 继续指向主模型 key。原始文件保存不改写，文件解析和贴图映射通过清单完成。预览所需的缩小图片放入 `derived`，完整下载仍提供原文件。

上传顺序：接收并验证 → 为本次包生成唯一 ID → 写入全部原始文件 → 数据库提交资产及清单 → 排入分析队列。上传失败清理本次临时文件和未提交对象。AI 排队失败记录为可重试的处理状态，不能误报文件上传失败。PostgreSQL 事务和 MinIO 写入不能当作一个天然原子事务，需补偿清理。

## 7. API 与权限调整

| 接口 | 建议调整 |
|---|---|
| `POST /api/assets/upload` | 保留 `asset` 主文件字段；增加 `materials`、`textures` 及引用绑定；只有 3D 使用多文件能力 |
| `POST /api/assets/:id/versions/upload` | 同样支持完整包，并保留上一包清单 |
| `GET /api/assets/:id/package` | 返回可展示的资源清单、包 ID 和文件状态；隐藏内部存储细节 |
| `GET /api/assets/:id/resources/:resourceId` | 通过资源 ID 读取清单内附件；使用当前工作区和资产权限检查 |
| 历史版本资源读取 | 由 versionId 找到该资产的历史清单；验证版本属于当前资产 |
| 下载接口 | 模型包默认下载 ZIP，包含模型和依赖文件；另提供“仅下载主文件” |
| 内部 asset-info | 给 worker 返回服务端清单与 packageId，让 worker 能读取同一版本的完整资源 |

资源权限与主模型一致。普通浏览器 TextureLoader 不会自动带上项目 Axios 的 JWT，因此建议先经 `assetService` 认证请求资源为 Blob，再交给 Three.js 的资源映射；不要为贴图把 MinIO 目录改成公开。

原始模型包接收使用临时磁盘或流式处理；限制文件数量、单文件/整包大小和图片像素数。路径只来自规范化清单，拒绝上传路径逃出包目录；下载 ZIP 使用经过校验的逻辑路径。ZIP 导入作为后续功能时，另处理解压总量、路径逃逸和压缩文件数量。

## 8. 前端真实贴图预览

OBJ：获取清单 → 读取 MTL 与关联图片 → `MTLLoader.parse()` → 合并材质 → `OBJLoader.setMaterials()` → 解析 OBJ。

FBX：读取 FBX 与附件 → 同一个 LoadingManager 关联外部资源 → 加载内嵌/外部图片 → 保留原材质和层级。

用 `LoadingManager.setURLModifier()` 把引用映射到已获取的 Blob URL，并通过加载完成/错误回调维护状态。[Three.js 资源映射](https://threejs.org/docs/pages/LoadingManager.html)

共同要求：

- 等待实际材质/图片加载完成后才显示“贴图已加载”；仅完成 `parse()` 不够。
- 没有 UV 的模型不能保证正确贴图；提供缺失 UV 的具体提示。
- 基础颜色/漫反射贴图按颜色数据处理；normal/bump 等数值图不能统一当作颜色图。[Texture 色彩空间](https://threejs.org/docs/pages/Texture.html)
- 使用中性光照显示原始外观，增加“材质显示 / 几何显示”切换。当前预览中的紫色轮廓光应在颜色核对模式中关闭。
- 清理材质、纹理、几何、监听器、Blob URL；共用纹理避免重复创建与提前释放。
- 重新上传贴图后按 packageId 刷新预览，不能只依赖资产 ID 与主文件名。
- 当前加载器的材质映射不能保证复现导出软件全部 PBR/节点材质；首期只对明确覆盖的基础外观给出支持说明。

## 9. 服务器渲染与 CLIP

网页显示贴图正确后，还需让 AI 使用真正带贴图的模型预览。现有顶点/面加 PIL 着色流程没有 UV、材质绑定与完整 FBX 场景变换，不能通过传入一个 PNG 就得到正确结果。

优先方案：抽出前端的纯模型加载与资源绑定逻辑，给服务器的离屏 Three.js 页面复用；Python worker 调用固定版本的 headless Chromium 完成渲染。JS 依赖随镜像构建打包，资源只从本次本地包读取，分析过程不依赖用户打开浏览器或外部 CDN。Headless 可用于无界面浏览器运行；目标 Docker 内的 WebGL/软件渲染是否可用、资源预算和耗时仍需单独验证。[Chrome Headless](https://developer.chrome.com/docs/automation-and-testing/headless)

这一步作为第二阶段的技术检查点：先确认 OBJ+MTL、FBX 外部贴图、FBX 内嵌图片都能在目标 Docker 中得到有效图像，再接入正式队列。若目标环境无法稳定渲染，保留现有 geometry 回退并保持外观分析关闭，再评估替代渲染器；不能以浏览器端截图代替独立服务器分析。

AI 图像建议：

- 3 个固定角度、512×512；镜头只框住模型，统一尺度、中性背景与白色光照。
- 模型的 hierarchy、UV、材质和必要的静态姿态保持一致；不绘制网页网格、紫色光照或界面控件。
- 第一轮先保留一张代表图走现有 CLIP 接口，验证颜色偏差；多视角融合需明确评分方法并记录版本，不能直接沿用单图阈值宣称已验证。
- 技术属性仍用现有解析器提取；CLIP 语义标签继续保留为建议，由用户确认。
- 稳定后扩充少量人工维护的 3D 颜色、材质外观词条与描述，并调整 `clipVocabulary.js`、`VisualVocabulary.jsx` 和 `clip_tags.py` 的能力限制。
- 有真实基础色但没有图片贴图的材质，也可支持颜色判断；能力应区分 geometry、materialColor、textures，避免把“没有纹理图片”等同于“没有任何原始颜色”。
- 对缺失基础色、部分材质不完整或回退到合成着色的模型，首期保守关闭整个模型的外观标签，仍可给出几何/物体标签。以后再考虑按完整子网格分析。
- 木纹、金属等结果描述的是可见外观，不能用它证明物理材质。先验证颜色建议，再评估材质外观建议的表现。
- 保存 packageId、渲染器版本、视角/色彩设置、真实材质能力、缺失资源、词库版本及 CLIP 分数，便于解释结果。

## 10. 版本、下载与后补贴图

- 新模型包生成新 packageId，旧包不可就地覆盖。历史 Version 引用旧包清单，包含全部依赖；不必重复复制同一包来创建快照。
- 新版本上传成功后，不删除仍被历史清单引用的旧主模型、MTL 或贴图。
- 详情页增加“补充 / 更新贴图”。用户可复用当前主模型，只更换附件；服务端组装新的包，仍形成一次可追踪的版本更新。
- 仅改贴图也要更换包 ID，清空陈旧的外观分析并重新排队。AI 回写同时核对源主文件和 packageId，避免旧任务覆盖新贴图结果。
- 完整包下载保留逻辑路径，用户解压后能重新加载材质。下载按钮应使用 `.zip` 文件名，不能沿用主模型的 `.obj` / `.fbx` 扩展名。
- 删除资产时处理属于它的主文件、依赖、预览和历史包对象；其他资产拥有的资源不受影响。首期附件归包独占，减少共享引用管理复杂度。

## 11. 资源预算建议

下面是可配置的起始预算，尚无实测性能保证：

| 项目 | 起始建议 |
|---|---|
| 完整上传包 | 100 MB |
| 主模型 | 50 MB |
| 单张外部贴图 | 10 MB；同时限制解码像素数，不能只限制压缩字节数 |
| 附件数量 | 32 个 |
| 预览贴图 | 长边最多 2048，按需生成派生图片；原文件保留 |
| AI 预览 | 512×512，最多 3 个角度 |
| 同时渲染 | 1 个任务；设置超时和内存上限 |

内嵌 FBX 同样需要限制解码后的纹理总量；只限制 FBX 文件大小不足以控制内存。预览纹理预算按解码后像素量计算，并记录超过预算的降级结果。实际数据超出这些初始预算时，依据 laptop 和云端实测调整。

CLI / Docker 渲染先以不依赖专用 GPU 的部署目标评估；若后来启用 GPU，需要单独配置容器访问。性能数字、显存占用和“4060 可以稳定达到多少 FPS”应在实测后给出。

## 12. 实现顺序与后续验收条件

| 阶段 | 交付范围 | 完成条件 |
|---|---|---|
| 1：完整模型资产 | 清单、附件上传、OBJ/FBX 基础贴图预览、缺失诊断、整包下载、版本完整性 | 上传后在另一浏览器/设备重新打开仍有贴图，旧版本不会拿到新版贴图 |
| 2：真实渲染与标签 | 服务器渲染适配、中性图像、能力与包版本记录、颜色建议 | 无人打开网页也能生成真实外观预览；合成几何图不会产生颜色/材质建议 |
| 3：便利性与材质范围 | ZIP/文件夹导入、额外图像格式、normal/bump/PBR 兼容、多视角评分优化 | 每项按支持样本和失败状态逐步确认 |

将来实施后覆盖的样本至少包括：OBJ+MTL+一张贴图；多材质；MTL 无图片但有基础色；缺失 MTL；缺失贴图；无 UV；Windows 路径；文件名带空格；同名图片冲突；FBX 内嵌/外部图片；不支持的图片格式；贴图更新和旧 AI 任务；当前/历史整包下载；跨工作区资源访问；超出大小或解码预算。

本次没有创建或执行测试，也没有安装渲染器、变更运行服务或更新原始 report。

## 13. 实施时预计涉及的代码

| 范围 | 文件 / 工作 |
|---|---|
| 上传与版本界面 | `frontend/src/pages/UploadPage.jsx`、`frontend/src/components/versions/VersionHistory.jsx`、附件选择与缺失提示组件 |
| 资源 API 调用 | `frontend/src/services/assetService.js` |
| 模型加载 | `frontend/src/components/assets/ThreeModelPreview.jsx`、抽出的资源绑定/材质加载逻辑 |
| 详情和词库界面 | `AssetDetailPage.jsx`、`VisualVocabulary.jsx`、`MetadataPanel.jsx` |
| 数据结构 | Asset / Version 清单字段及兼容迁移 |
| 上传、读取、下载、版本 | `backend/src/routes/assets.js`、`assetsController.js`、模型包管理工具 |
| 权限 | 复用工作区、资产、历史版本权限，应用到每个资源接口 |
| AI 输入与结果 | `ai-service/worker.py`、渲染适配器、`model_metadata.py`、`clip_tags.py` |
| 词库 | `backend/src/utils/clipVocabulary.js`、核心词库中的 3D 外观描述 |
| 部署 | 渲染器构建资源、Docker 依赖、预算与超时配置 |

## 14. Report 的后续对应

实现与评估完成后，由用户手动更新 Chapter 2 的 3D hybrid metadata / rendering 描述：写清 UV、材质、真实贴图如何进入预览，以及 CLIP 分析带贴图的渲染图。性能和识别效果只写实际测得的结果；WordNet 维持可选未来扩展。此规划不修改原始 Word 文件。
