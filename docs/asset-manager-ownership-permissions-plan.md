# Asset 权限调整规划：Manager 仅管理自己上传的资产

日期：2026-10-13（Asia/Kuala_Lumpur）

状态：2026-10-13 已完成代码、容器部署、真实接口和浏览器验收；后端 106 项、前端 79 项、AI 鉴权与连接配置 6 项通过，前端 lint 与生产编译通过。真实 PostgreSQL、MinIO、Redis 与内部 HTTP 边界另有运行验证，测试数据已清理，原有数据库记录数量和内容摘要完全一致。本文是 [Asset 与 Workspace 改名交接文档](asset-workspace-renaming-handoff.md) 的前置任务；改名尚未实施。

## 1. 用户已确定的规则

1. Manager 只能修改、删除**自己上传**的 Asset，包括 Regenerate tags、增加/删除/编辑标签、更新 metadata、更新文件等资产写入操作。
2. Owner 可以修改、删除**当前 Workspace 内任何成员上传**的 Asset，不受上传者限制。现有 Workspace 隔离继续生效，Owner 不获得跨 Workspace 或系统管理员权限。
3. 评论功能保持原样，不因 Asset 是否由自己上传而改变。
4. **共享词库例外已由用户明确选择：保留 Manager 管理 Workspace 共享词库。** 这是 Workspace 级操作，不按当前页面 Asset 的上传者限制。
5. 原规划先写 Markdown 交接；用户随后授权按本文实施权限调整。改名仍属于后续任务。

保留现有颜色风格，电脑端优先、兼顾手机；保留已有删除确认、Regenerate 确认、未保存草稿保护。

## 2. 目标权限矩阵

以下所有“允许”均要求有效登录、有效账号、当前 Workspace 成员关系和匹配的 Asset Workspace。系统管理员仍不能通过账号角色访问 Workspace 操作。

| 操作 | Owner | Manager：本人上传 | Manager：他人上传 | Collaborator |
| --- | --- | --- | --- | --- |
| 查看、搜索、预览、下载 | 允许 | 允许 | 允许 | 允许 |
| 查看 metadata、标签、版本、AI 结果 | 允许 | 允许 | 允许 | 允许 |
| Refresh results（重新读取结果） | 允许 | 允许 | 允许 | 允许 |
| 上传新 Asset | 允许 | 允许 | 不按已有 Asset 判断 | 禁止 |
| Regenerate tags / 发起 AI 任务 | 允许 | 允许 | 禁止 | 禁止 |
| 编辑 metadata、AI 标签/关键词等内容 | 允许 | 允许 | 禁止 | 禁止 |
| 添加/移除 repository tag、接受 AI 建议为标签 | 允许 | 允许 | 禁止 | 禁止 |
| 保存版本快照、上传替换版本、更新材质/贴图 | 允许 | 允许 | 禁止 | 禁止 |
| 删除整个 Asset | 允许 | **允许，新增能力** | 禁止 | 禁止 |
| Asset 改名（后续任务） | 允许 | 允许 | 禁止 | 禁止 |
| Workspace 共享词库新增/扩展/删除 | 允许 | 允许 | **允许，保留的例外** | 禁止 |
| 评论、回复 | 沿用当前规则 | 沿用当前规则 | 沿用当前规则 | 沿用当前规则 |
| 编辑/删除已有评论 | 同 Workspace 任意评论 | 仅本人评论 | 仅本人评论 | 仅本人评论 |
| Workspace 管理及后续 Workspace 改名 | 允许 | 禁止 | 禁止 | 禁止 |

Manager A 可以给 Manager B 的 Asset 留评论、编辑自己的评论、管理 Workspace 共享词库，但不能对 B 的 Asset 增删标签、改 metadata、Regenerate、上传替换版本或删除。Owner 可以对 A、B 的 Asset 执行这些资产操作。

### 2.1 “自己上传”的定义

- 以数据库 `Asset.userId`（首次创建资产的上传者）与认证后的当前用户 ID 相等为准。
- 不使用请求体的 userId、前端布尔值、显示名称、metadata 中的作者、`Version.createdBy` 或最后修改者判断。
- 上传新 Asset 时继续由服务器填写 `userId = req.user.id`；客户端不能指定其他上传者。
- 上传新版本、Owner 修改资产、修改材质/贴图和后续改名，都不改变 `Asset.userId`。
- Owner 更新了 Manager A 的资产后，A 仍可管理；Manager 不能因自己创建过某个版本而获得他人 Asset 的管理权。
- 权限同时依赖当前角色：用户降为 Collaborator 或离开 Workspace 后，即使是原上传者也不能继续修改/删除。
- 已有 `Asset.userId` 可直接用于判断，本阶段无需新增 ownerId 字段、权限表、角色枚举或数据库迁移。
- 无有效上传者 ID 的异常旧记录不能被任意 Manager 认领；Owner 可管理已明确归属当前 Workspace 的记录。缺少 Workspace 的旧 Asset 继续按现有规则隔离，不借此开放访问。

## 3. 实施前核对的代码现状

| 代码位置 | 当前行为 | 需要的调整 |
| --- | --- | --- |
| `backend/src/controllers/assetsController.js` 的 `canManageAsset()` | 同 Workspace 的 Owner/Manager 都能修改，无上传者判断 | Owner 全部；Manager 加 `Asset.userId` 校验 |
| 同文件 `canDeleteAsset()` | 仅 Owner | 增加 Manager 删除本人 Asset |
| 同文件 `createAiJob()` | 查找资产后直接 Redis 入队；当前路由检查角色和 Workspace，但未检查上传者 | 入队前使用资产写入权限判断，拒绝时不得入队 |
| `backend/src/middleware/rbac.js` | Manager 没有 `deleteAsset` | 放行 Manager 进入删除操作，再按具体 Asset 归属裁决 |
| `backend/src/middleware/workspaceAssetAccess.js` | 仅校验 Workspace，查询字段为 id/workspaceId | 保持读取/评论可用；不能全局变成“本人上传”检查 |
| `backend/src/controllers/vocabularyController.js` 的 `canManageVocabulary()` | 同 Workspace 的 Owner/Manager 可改共享词库 | **保留此边界**，不能直接替换为新的资产归属判断 |
| `frontend/src/auth/permissions.js` | Manager 没有 `deleteAsset` | 与后端角色层放行同步，页面仍须做 Asset 级判断 |
| `frontend/src/pages/AssetDetailPage.jsx` | Manager 同 Workspace 全可编辑；Owner 可删；另有非匹配 Workspace 时回退 ownsAsset 的分支 | 使用严格 Workspace + 角色 + 上传者判断，移除不匹配时的 ownsAsset 放行 |
| `MetadataPanel.jsx` → `AiEnrichment` → `VisualVocabulary` | 资产编辑和共享词库共用 `canEdit` | 拆开资产写入与共享词库权限，避免连带禁用共享词库 |
| 评论控制器与 CommentThread | Owner 可管理同 Workspace 任意评论，其他成员仅本人评论 | 保持原样并补充回归验证 |
| `ai-service/main.py` 的 `POST /jobs` | 无应用层鉴权，直接写 Redis 队列 | 核对并封闭绕开后端授权直接入队的入口，见第 5 节 |

现有 RBAC 文档与测试包含“Manager 不能删除任何 Asset”等旧结论。实施者必须区分角色层能力和具体 Asset 权限，更新旧断言及文档，不能只改一个 helper。

## 4. 后端实施方案

### 4.1 统一资产写入判断，保留不同资源的权限边界

建议在 `backend/src/utils/assetPermissions.js` 提取可单测的资产权限 helper，并让资产控制器复用。具体文件名可按仓库习惯调整。

逻辑顺序：

```text
先通过现有认证、账号状态、系统管理员禁止和成员关系检查
Asset 必须属于当前已验证的 Workspace
Owner -> 允许管理和删除
Manager 且有效 Asset.userId == 有效当前用户 ID -> 允许管理和删除
其他情况 -> 拒绝
```

ID 比较需兼容来自接口的数字字符串，但必须先确保是有效正整数，避免把 null、空字符串或 0 转换后误判为同一人。身份与角色只能来自认证上下文及数据库。

保留 `canManageAsset`、`canDeleteAsset` 两种语义入口，即使本阶段规则相同，也方便调用者明确操作目的。共享词库继续用 Workspace 角色判断；评论继续用评论作者判断。

不要将原 `workspaceAssetAccess` 的全局行为改为“只有上传者可访问”。它服务于查看、下载、评论、词库等不同路由；一刀切会破坏已明确保留的能力。如增加资产写入中间件，只挂到需要此限制的路由。

### 4.2 角色权限与资源权限共同生效

- 后端 Manager 的角色权限增加 `deleteAsset`，前端同步。此处 true 只代表角色具备执行此类操作的资格，不能代表可以删除任意资产。
- `manageMetadata`、`manageVersions` 等现有角色许可保留，在取得目标 Asset 后补充/复用归属检查。
- 未认证、无有效成员关系、已停用账号、系统管理员、Collaborator、其他 Workspace 请求继续被现有门禁拒绝。
- 保持现有 400/401/403/404 处理约定，不顺带重构全部认证状态码。身份有效但无权修改某个已有 Asset 时返回 403，不返回成功并静默忽略。
- 响应可说明“仅上传者或 Workspace Owner 可执行此操作”，避免把 Manager 对他人 Asset 的限制描述为该角色完全只读。

### 4.3 逐项覆盖 API

路径以 `/api/assets` 为前缀，后续 agent 必须检查实际路由链及控制器的副作用发生顺序。

| 方法与路径 | 操作 | 所需检查 |
| --- | --- | --- |
| `PUT /:id/metadata` | 普通字段、AI 标签修改/删除等 | 新 `canManageAsset`，保存前检查 |
| `POST /:assetId/tags` | 添加手动标签、接受 AI 建议 | 新 `canManageAsset`，创建标签/关联前检查 |
| `DELETE /:assetId/tags` | 删除资产标签关联 | 新 `canManageAsset`，移除关联前检查 |
| `POST` / `DELETE /:assetId/tags/:tagId` | 兼容标签路由 | 与规范路由完全相同，不能留下旧路径绕过 |
| `POST /ai/job` | Regenerate / AI 入队 | 从请求体 assetId 查询资产，在 `lPush` 前检查新规则 |
| `POST /:id/versions` | 保存当前版本快照 | 新规则，复制对象/创建 Version 前检查 |
| `POST /:id/versions/upload` | 替换文件、更新材质/贴图 | 新规则，保留旧版本和持久化新文件前检查 |
| `DELETE /:id` | 删除当前文件及版本等资源 | 新 `canDeleteAsset`，任何对象删除或数据库删除前检查 |
| `PATCH /:id/name`（未来新增） | 改名 | 必须复用本阶段最终规则 |
| `POST /:assetId/vocabulary` | 新增/批准/扩展共享概念 | 原 Workspace Owner/Manager 规则，**不检查上传者** |
| `DELETE /:assetId/vocabulary/:entryId` | 删除 Workspace 概念 | 原 Workspace Owner/Manager 规则，保持 entryId 的 Workspace 限定 |

不改变标签数据模型：从某个 Asset 移除普通标签应继续只删除该资产的关联，不删除其他资产共用的 Tag 记录。修改本资产的 AI 标签只更新本资产 metadata。

替换上传的资源 ID 在 URL 中，建议在 `modelUpload` 解析 multipart 前进行写入资格检查；控制器保留最终检查，尤其是事务中重新读取 Asset 的路径。拒绝请求不得写 MinIO、创建版本、删文件或入队；不得因新增门禁破坏临时文件清理。

### 4.4 删除行为

Manager 删除本人 Asset 使用既有删除流程与确认弹窗，覆盖当前主文件、依赖资源和历史版本。不能通过给 Manager 加角色权限而跳过上传者检查，也不能仅隐藏他人 Asset 的按钮。

删除前确认对象身份与不可撤销影响；请求失败保留当前页面并明确显示错误，不提前显示删除成功。测试需包含有版本、普通标签、评论及 3D 依赖资源的 Asset，确认关联约束和现有生命周期正常。

“评论维持原样”指评论 API 的授权、回复、编辑和软删除规则；本轮不新增“删除 Asset 时保留可独立访问的评论”等产品行为，也不重写评论生命周期。

## 5. AI 与队列边界

这是 Regenerate 权限能够实际生效的一部分，不应只检查按钮和主 API。

### 5.1 用户触发与 worker 写回分开处理

- 用户触发入口 `POST /api/assets/ai/job` 必须检查目标 Asset 的新权限；被拒绝时 Redis 入队次数为零。
- 新 Asset 上传和合法的新版本上传仍可按原流程自动入队；先完成对应上传授权。
- `POST /api/assets/:id/ai-result` 与 `GET /api/assets/:id/info` 是 `internalAiAuth` 保护的 worker 接口，不依赖浏览器用户的 teamRole。不要把“本人上传”中间件直接加到它们上面而阻断合法 worker。
- 保留服务凭证验证和已有源文件变化检查；普通用户 token 不能代替服务凭证。目标 Asset 已删除时，回调不能重建资产。
- 本阶段在用户请求/任务入队时判定权限。已被合法接受的任务可按原流程完成，不要求增加角色变更后的任务撤销或持久化任务授权系统；不要主动清空既有队列。

### 5.2 已发现的另一条入队路径

源码 `ai-service/main.py` 的 `POST /jobs` 接收 assetId/jobType 后直接 Redis 入队，没有应用层认证；`Dockerfile.ai` 启动该 FastAPI 应用，`docker-compose.yml` 发布了 8000 端口，并发布了 Redis 的 6379 端口。这是静态配置事实，尚未验证实际运行环境的端口可达性。

实施基线建议：浏览器统一经后端受权限控制的入口提交 AI 任务。为兼容可能存在的服务调用，`/jobs` 如保留，应仅接受可信服务凭证并限制为服务内部访问；缺失/错误凭证不能入队，凭证不能放入前端。核对并收紧面向普通客户端的 AI 服务及 Redis 直连入口，容器间通信与 health 检查保持可用。

当前已核对的后端入队代码直接使用 Redis；`docs/ai-service-runtime.md` 仍描述后端调用 FastAPI `/jobs`。实施前按实际调用方核对，并同步文档。若证明兼容入口已无调用方，可删除其写入能力；不要为了保留旧文档而留下未受保护的入队路径。

## 6. 前端实施方案

### 6.1 Asset 权限统一计算

在现有 `frontend/src/auth/permissions.js` 或同目录专门 helper 中提供资产权限判断，供 AssetDetailPage 及未来改名按钮复用：

- `canManageAsset(user, asset)`：当前 Workspace 匹配，Owner 或 Manager 本人上传。
- `canDeleteAsset(user, asset)`：同样的范围，并结合角色层 `deleteAsset` 许可。
- `canManageWorkspaceVocabulary(user, asset)`：当前 Workspace 匹配，Owner/Manager，不检查上传者。

名称仅为建议，重点是前后端规则一致。数据未加载、身份不明、缺少 Workspace、Workspace 不匹配时默认不显示写入入口，不能回退到 ownsAsset 放行。

`AssetDetailPage.jsx` 目前自己计算权限且带不匹配 Workspace 时的 fallback，需要替换。角色层 `can('deleteAsset')` 的 Manager 许可也要同步，否则新按钮仍不会出现。

### 6.2 拆开共享词库权限

`MetadataPanel` 中的 `canEdit` 目前向下传到 AiEnrichment，再传到 VisualVocabulary。直接把 canEdit 收紧为“本人 Asset”会误伤用户明确保留的共享词库能力。

建议增加独立的 `canManageVocabulary` prop，沿调用链传递：

```text
AssetDetailPage
  MetadataPanel
    canEdit = 当前资产可修改
    canManageVocabulary = 当前 Workspace 的 Owner/Manager
      AiEnrichment
        Asset 写入按钮 -> canEdit
        VisualVocabulary -> canManageVocabulary
```

保留编辑中、保存中、确认和草稿的互斥保护，但不要用“不是上传者”隐藏整个共享词库模块。Manager 在他人的图片/3D Asset 页面仍能管理该 Workspace 的共享词库；其他资产标签和 metadata 继续只读。共享词库操作只影响未来建议，不自动重写现有资产标签，也不顺带为他人 Asset 触发 Regenerate。

### 6.3 页面行为

- Manager 看自己的 Asset：显示 metadata 编辑、标签写入、Regenerate、版本/材质更新及 Delete。
- Manager 看他人的 Asset：显示内容、下载、历史版本、Refresh results、评论和共享词库；隐藏资产写入操作。
- Owner：当前 Workspace 内全部 Asset 的原有管理操作可用。
- Collaborator：原有读取、下载、评论能力不变。
- 适当显示只读原因，例如 `Only the uploader or a workspace owner can modify this asset.`，不使用“你的角色只有只读权限”的笼统文案。
- 共享词库继续显示现有 Workspace 影响说明与删除确认；不要把“接受标签到本资产”误当成共享词库管理而放开。
- 角色变化或过期页面发出请求时，后端仍应拒绝；前端展示 403 并刷新权限上下文，不自动重试写入或静默丢弃草稿。
- 保留原配色和现有布局。此阶段无需新增完整设置页、资产转让功能或状态管理依赖。

## 7. 评论与读取回归边界

资产写入限制不得挂到评论路由、只读详情或整个资产页面上。

评论现状需要维持：Owner、Manager、Collaborator 可以在同 Workspace 可访问的 Asset 下评论/回复；Owner 可编辑或软删除同 Workspace 任意评论；Manager 和 Collaborator 只能编辑或软删除自己发表的评论，与资产上传者无关。已删除评论占位、回复记录、长度校验、父评论属于同一 Asset 的检查和分页维持原行为。

搜索、列表、Dashboard、预览、下载、版本历史、AI 结果刷新继续按 Workspace 共享；不要为实现“只改自己”把读取查询改成 `where: { userId: currentUserId }`。

## 8. 文件与测试入口

路径相对仓库根目录；新增 helper/测试命名可按现有结构调整。

| 范围 | 文件 |
| --- | --- |
| 后端角色许可 | `backend/src/middleware/rbac.js` |
| 资产判断与所有写入操作 | `backend/src/controllers/assetsController.js`、`backend/src/routes/assets.js`；拟新增 `backend/src/utils/assetPermissions.js` |
| Workspace 读取边界 | `backend/src/middleware/workspaceAssetAccess.js`、`backend/src/utils/workspaceScope.js`、`backend/src/middleware/auth.js`、`backend/src/middleware/requireWorkspace.js` |
| 共享词库边界 | `backend/src/controllers/vocabularyController.js`、`backend/src/utils/clipVocabulary.js` |
| AI 入口和内部认证 | `ai-service/main.py`、`backend/src/middleware/internalAiAuth.js`、`ai-service/worker.py`、`Dockerfile.ai`、`docker-compose.yml` |
| 前端权限与详情页 | `frontend/src/auth/permissions.js`、`frontend/src/hooks/usePermissions.js`、`frontend/src/pages/AssetDetailPage.jsx` |
| 标签、AI 与词库 UI | `frontend/src/components/metadata/MetadataPanel.jsx`、`frontend/src/components/metadata/VisualVocabulary.jsx` |
| 版本 UI | `frontend/src/components/versions/VersionHistory.jsx` 及其模型资源编辑调用链 |
| 评论回归 | `backend/src/controllers/commentsController.js`、`backend/src/routes/comments.js`、`frontend/src/components/comments/CommentThread.jsx` |
| 文档同步 | `backend/swagger.yaml`、`docs/rbac-redesign.md`、`docs/ai-service-runtime.md`、`docs/asset-workspace-renaming-handoff.md` |

### 8.1 有意义的测试

准备同 Workspace 的 Owner O、Manager A、Manager B、Collaborator C，以及其他 Workspace 的成员。准备分别由 O、A、B 上传的资产，包含一个带资源的 3D 模型和一个有版本/标签/评论的资产。

| 测试组 | 验收要求 |
| --- | --- |
| 每个资产写入入口 | A 对 A 资产成功；A 对 B/O 资产 403；O 对 A/B 资产成功；不能只测 helper |
| 删除 | A 可删除本人资产；对他人失败且文件/版本/数据库均未删除；O 可删除同 Workspace 任意资产 |
| 角色层 + 资源层 | Manager 的 `deleteAsset` 角色检查通过，但他人 Asset 的资源检查仍拒绝 |
| AI 入队 | 他人资产 403 且 Redis 无新增任务；本人/Owner 合法请求正常；直接 `/jobs` 未授权调用不能入队 |
| AI 回写 | 合法 worker 正常，浏览器 token 不能伪装 worker；已删除 Asset 不被重建 |
| 原始上传者 | 新上传忽略伪造 userId；Owner 更新版本后原 userId 不变；Version.createdBy 不授予资产权限 |
| 标签隔离 | 删除本人资产标签不影响他人资产的同名 Tag 关联；编辑本人 AI 数组不影响他人 metadata |
| 共享词库例外 | A 在 B 资产页/接口能管理同 Workspace 词库，但仍不能改 B 标签或 Regenerate；跨 Workspace entryId 不能修改 |
| 评论不变 | A 可在 B 的资产评论并管理自己的评论，不能改 B 的评论；资产上传者身份不授予评论管理权；Owner 行为保持 |
| 读取不变 | A 仍能搜索、查看、下载 B 的资产、版本和 AI 结果，C 的读取/评论也不受影响 |
| 身份边界 | 字符串/数字 ID、缺失 ID、无 Workspace、角色降级、成员移除、停用账号、系统管理员、跨 Workspace 请求 |
| 前端 | 自己/他人资产按钮区别；共享词库独立可编辑；评论可用；删除确认 Cancel 不发请求；失败不假成功、不丢草稿 |

优先扩展现有 `backend/__tests__/rbac.test.js`、`assetsController.test.js`、`workspaceIsolation.test.js`、`commentsController.test.js` 和路由测试；增加真实经过路由中间件的权限用例，不能只用源码字符串断言证明权限有效。按需新增 assetPermissions 与 vocabularyController 测试。

前端优先扩展 `frontend/src/auth/permissions.test.js`、`frontend/src/pages/AssetDetailPage.test.jsx`、`frontend/src/components/metadata/MetadataPanel.test.jsx`、`frontend/src/components/versions/VersionHistory.test.jsx` 和评论测试；按需新增词库权限集成测试。旧 fixture 缺少 workspaceId 时应补齐合法上下文，不保留旧 fallback 来迁就测试。

后端当前 `npm test` 显式列举测试文件，新增文件必须加入脚本或单独运行并记录。已有“Manager deleteAsset 为 false”断言需更新为“角色许可为 true，但实际资产范围受限”，同时保留真实越权拒绝测试。

### 8.2 检查命令与运行验证

```powershell
# 工作目录：backend，先检查新测试是否纳入 scripts.test。
npm test
```

```powershell
# 工作目录：frontend。
npm run lint
$env:CI = 'true'
npm test -- --watchAll=false --runInBand
npm run build
```

若修改 FastAPI 鉴权或部署配置，还须增加/执行相应的未授权入队测试与配置检查。浏览器至少用 Manager A/B 和 Owner 验证上述主要流程；删除使用可丢弃测试资产，不删除真实用户数据。共享词库也使用专门测试 Workspace。

本规划没有执行应用测试或启动服务，不能把历史通过记录视为新规则验证结果。实施中若发现既有失败，区分基线问题和本次回归并记录，不通过删除断言掩盖。

## 9. 实施顺序与改名衔接

- [x] 读取适用仓库指引、检查当前分支和工作区，保护已有及无关改动。
- [x] 落实第 2 节矩阵与上传者定义；提取统一的 Asset 写入权限，保留词库和评论各自边界。
- [x] 调整后端 Manager 删除角色许可；覆盖全部 Asset 写入接口，特别是 AI 入队、版本及兼容标签路径。
- [x] 在代码和 Compose 配置中封闭独立 AI/Redis 未授权入队路径，验证服务凭证和 worker 边界；运行中的配置仍需重建生效。
- [x] 调整前端角色与 Asset 级判断，拆开共享词库权限；保留评论、读取、确认和草稿保护。
- [x] 完成接口中间件、副作用、前端自动回归测试，更新 Swagger、RBAC/AI 文档。
- [x] 重建容器，并使用专门测试数据完成真实数据库和浏览器验收。
- [x] 记录变更文件、通过/未通过/未运行的检查及限制。
- [ ] 再执行改名交接文档；新改名 API 和按钮直接复用本任务最终的权限 helper。

改名方案已同步为：Owner 可改同 Workspace 任意 Asset 名称，Manager 仅可改自己上传的 Asset 名称；Workspace 改名继续 Owner 专属。不得在后续改名时重新引入“同 Workspace 的全部 Manager 都可改任意 Asset”的旧规则。

完成标准：Manager 本人资产可改可删、他人资产写入被服务端拒绝、Owner 同 Workspace 管理正常、共享词库和评论按用户选择维持、读取不收窄、独立队列入口不能绕过授权，并有相应验证证据。代码、自动测试及本次专门测试数据的运行验收已覆盖这些边界。

## 10. 2026-10-13 实施记录

### 代码

- 新增后端 `src/utils/assetPermissions.js` 和前端 `src/auth/assetPermissions.js`，统一严格 Workspace、当前角色和原始上传者判断。没有新增数据库字段或迁移。
- Manager 获得删除操作类别许可，实际删除仍受资产上传者限制。metadata、普通/兼容标签、AI 入队、快照、替换版本、材质/贴图更新均复用资产规则。
- `assetWriteAccess` 在替换上传解析 multipart 之前检查资格；版本控制器在事务内再次检查。原始 `Asset.userId` 不改变。
- 共享词库仍使用原 Workspace 角色检查；前端独立传递词库管理权限。评论控制器及其作者规则未改变，读取查询未增加上传者过滤。
- FastAPI `/jobs` 增加服务凭证验证，Compose 移除 AI 服务和 Redis 的宿主端口发布。后端依然直接写 Redis；worker 凭证回写规则保持独立。运行验收发现现有 Redis 客户端空闲读超时使 worker 重启，已显式设置 `socket_timeout=None` 适配阻塞式 `BRPOP`，模型与推理规则保持不变。
- 认证先清除 JWT 的旧成员声明，再从数据库恢复有效 Workspace/角色，避免无效 Workspace 请求头保留旧权限。
- 前端遇到资产 403 后刷新成员权限，不重试写入；角色改变时保留草稿并禁用保存，延迟回包不能激活已切离的 Workspace。

### 验证

| 检查 | 结果及范围 |
| --- | --- |
| 后端 `npm test` | 106/106 通过；包括实际 Express HTTP 路由、中间件、JWT/成员身份验证及写入副作用断言。数据库、MinIO、Redis 使用测试替身，未操作真实账号或资产 |
| 前端完整 Jest 回归 | 27 个套件、79/79 通过；本人/他人资产按钮、共享词库例外、评论、删除取消/失败、草稿保留和权限刷新已覆盖 |
| 前端 lint | 无错误或警告 |
| 前端生产编译 | `Compiled successfully` |
| AI `test_job_authorization.py` | 实际 AI 镜像中 6/6 通过；缺失/错误/未配置服务凭证不入队，合法凭证正常，health 保留，生产 worker 连接没有空闲读截止时间。队列使用测试替身；实际内部 HTTP 和真实 Redis 行为另行验证 |
| Swagger / Compose | YAML 可解析；自动断言 AI/Redis 无宿主发布端口，容器通信地址保持可用 |
| Docker 部署 | 前后端、AI 服务/worker 及 Redis 已更新并运行。AI/Redis 不再发布宿主端口；PostgreSQL 与 MinIO 数据卷保留 |
| 真实权限接口 | 专门新建 Owner、Manager A/B、Collaborator、其他 Workspace Owner；真实数据库、文件存储和队列下，九类他人资产写入均 403、无新任务/版本/文件替换；本人及 Owner 写入、完整 3D 包删除、共享词库、评论、读取/ZIP 下载、角色降级与跨 Workspace 拒绝通过 |
| 实际服务 HTTP | 从内部容器访问 FastAPI，缺失/错误/browser 凭证不入队，服务凭证入队一次；worker 凭证可读取 info、回写结果，旧源文件回写返回 409 |
| 浏览器 | Manager A/B 本人/他人按钮范围及 Owner 全部管理确认；真实共享词库添加成功；评论草稿跨面板保留；删除 Cancel 保留资产；Manager 降级后的旧页面保存被拒绝、权限刷新、草稿保留且保存禁用；有效测试贴图显示 Materials ready |
| 数据清理与保留 | 测试账号、工作区、资产、版本、标签、词库和评论已清理；测试 MinIO 包目录为空；原有 User/Team/TeamMember/Asset/Version/Tag/Comment/ClipVocabularyEntry 八类记录计数和 SHA256 摘要与部署前一致 |

发现并修正的旧测试适配问题：部分上传测试仍使用第一阶段前的内存文件和旧 Multer 路由断言，现已按临时磁盘/模型包上传适配；Manager 删除断言同步新规则。没有删除权限断言来掩盖失败。

### 运行生效

本次已完成部署：正常构建 backend/frontend；AI 全量构建发现缓存缺失后停止，改为从已有 AI 镜像构建仅含 `main.py`、`worker.py` 和鉴权测试的更新层，复用现有模型权重及全部 Python 依赖。使用 `docker compose up -d --no-build --no-deps backend frontend ai-service ai-worker redis` 启动新版；不删除数据卷。部署前队列为 0，worker 已空闲；验收阶段暂时停 worker 检查拒绝请求无入队副作用，随后恢复并让合法测试任务处理完成，没有主动清空队列。

下面是以后使用标准 Dockerfile 重建的步骤；完整 AI 镜像重建可能重新下载未锁定版本的依赖，应与复用既有运行环境的本次更新区别对待。

启动 Docker Desktop 后，先检查旧队列，并等待队列中的任务及 worker 正在处理的任务完成。Redis 当前没有数据卷，重新创建容器会丢失尚未持久化的队列；有未完成任务时先不要重新创建 Redis。确认可以重建后，在仓库根目录执行：

```powershell
docker compose up -d --build backend frontend ai-service ai-worker redis
```

此命令重建相关应用，并重新创建 Redis 以移除旧宿主端口映射；不使用 `down -v`、不主动清空队列或删除数据卷。启动后用专门的测试 Workspace/账号/资产验收，不删除真实用户资产。

原始 Word report 和改名业务代码未修改。

### 验收记录与保留数据

- 原有账号 4、Workspace 2、成员关系 3、Asset 16、历史 Version 3、Tag 17、Comment 7，内容摘要全部一致。
- 创建并清理的专门测试前缀：`rbac1791860577222`；没有删除真实用户资产或账号。
- 原 Asset 删除流程会使评论的外键置空，本轮保持既有生命周期；清理测试评论时先校验剩余评论摘要与部署前一致，再按精确测试评论 ID 删除。
- 最初用于验收的小 PNG 数据无法完整解码，已通过正常版本接口换成有效测试图片；未因此修改模型预览业务。后续 3D 本人及共享读取均显示 `Materials ready`。
- 页面截图：[Manager 查看他人资产并管理共享词库](../exports/rbac-manager-other-asset-20261013.png)、[角色降级后草稿保留](../exports/rbac-role-downgrade-draft-20261013.png)。截图为清理前的专门测试数据。
- 最后检查：全部七个服务运行；AI worker 空闲观察约两分钟，重启次数为 0，队列长度为 0。测试凭证、临时脚本及测试浏览器标签已清理。此观察验证了本次空闲超时修复，不代表长期性能评估。
