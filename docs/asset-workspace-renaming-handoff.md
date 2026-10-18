# Asset 与 Workspace 改名功能：Agent 实施交接

编写日期：2026-10-13（Asia/Kuala_Lumpur）

状态：方案与代码入口已核对；本次仅整理文档，尚未实施或验证改名功能。接手 agent 应先检查当前分支与工作区，避免覆盖其他人的修改。

前置任务（2026-10-13 更新）：先实施并验证 [Manager 仅管理本人资产的权限调整](asset-manager-ownership-permissions-plan.md)，再执行本文。用户已要求 Manager 仅能修改、删除自己上传的 Asset；Owner 可管理同 Workspace 全部 Asset。评论保持原样，共享词库继续允许 Manager 管理。本文的 Asset 改名权限已同步新要求，不能沿用旧的 Manager 全 Workspace 资产写入规则。

前置实施进度：权限代码、自动回归、容器部署、真实数据库/存储/队列及浏览器验收已完成，复用 `backend/src/utils/assetPermissions.js` 和 `frontend/src/auth/assetPermissions.js`。专门测试数据已清理，原有数据内容摘要一致；详情见前置任务实施记录。本文改名功能仍未实施。

## 1. 目标与实施范围

让有权限的用户修改 Asset 的展示名称及 Workspace 的名称，并在保存后同步相关页面。保留现有配色，电脑端优先、兼顾手机，延续既有弹窗、操作反馈和未保存草稿保护。

此前的 UI 优化背景与实施记录见 [frontend-ui-optimization-plan.md](frontend-ui-optimization-plan.md)。本文专门交接改名功能，不要求重新实施整份 UI 优化计划。

Asset 权限范围采用用户最新明确要求；其余长度和交互规则是本方案的**建议实施基线**，并非已经存在的功能或用户逐项确认的决定。如无后续指示，可据此实施，并在交付中说明实际采用的规则。

| 项目 | 建议基线 |
| --- | --- |
| Asset 名称 | 新增可空字段 `displayName`，只用于展示和名称搜索 |
| Asset 默认显示 | `displayName` → `originalname` → `filename` → 固定兜底文案 |
| Asset 改名权限 | 当前 Workspace 的 Owner 可改任意 Asset；Manager 仅可改自己上传的 Asset |
| Workspace 名称 | 更新现有 `Teams.name`，无需新增 Workspace 表或名称字段 |
| Workspace 改名权限 | 当前 Workspace 的 Owner |
| 重名 | 允许；身份、关联和权限始终使用 ID |
| 名称限制 | Asset：trim 后 1–200；Workspace：trim 后 2–100，与现有创建流程最小长度一致 |
| 长度计数 | 前后端统一使用 JavaScript `String.length`，与输入框 `maxLength` 一致；emoji 可能占两个单位 |
| 保存确认 | 编辑弹窗中的 Save 即确认，无需再弹一次“确定改名？” |
| 文件行为 | 上传源文件名、下载文件名、对象存储路径、版本记录均保留原有含义 |

例：文件 `hero_idle.fbx` 的 Asset 展示名称改为“主角待机动画”。页面展示新名称，原始文件仍是 `hero_idle.fbx`；预览、下载和历史版本继续按原来的文件字段运行。

本轮不包含：修改真实文件名或扩展名、移动 MinIO 对象、批量改名、名称唯一性、改名历史审计、实时跨用户推送、清空名称以恢复自动命名的独立操作。不要为完成本轮而引入这些扩展。

## 2. 已核对的现状与关键注意点

| 当前实现 | 对本次实施的影响 |
| --- | --- |
| `Asset.originalname` 同时用于展示、格式识别、下载和版本快照 | 不可全局替换为展示名称；需要逐个区分显示用途与文件用途 |
| `Asset.filename` 是存储对象标识，模型关闭了 timestamps | 不要修改存储键，也不要假设存在 `updatedAt`、版本号或 ETag 并发控制 |
| Workspace 后端仍使用 `Team` 模型及 `Teams` 表 | 复用现有结构和 `/api/teams` 路由 |
| `Team.name` 为 `STRING(100)`，没有唯一约束 | 无需新增字段，也不需要人为增加重名限制 |
| `assetResponse()` 手工列出返回字段 | 添加模型字段后仍须补充序列化输出 |
| Dashboard 的 recentUploads 查询只选 `id`、`filename`、`uploadedAt` | 须显式增加 `originalname`、`displayName`，否则前端无法显示新名称 |
| `WorkspaceSwitcher` 独立缓存 `teams` 列表，只在挂载时加载 | 只更新 AuthContext 不足以更新下拉选项名称 |
| `activateTeam()` 会保存 session 到本地存储 | 同步名称时保留当前 ID、token、账号角色和 Workspace 角色 |
| 通用 `validate` 只有 required、type、minLength、email | 尚不支持 maxLength，也不自动 trim；仅在 schema 写 maxLength 不会生效 |
| 启动入口显式执行部分迁移，再运行 `sequelize.sync({ alter: true })` | 新迁移需接入实际启动流程，不要假设存在自动发现全部迁移的 runner |
| 后端 `npm test` 显式枚举测试文件 | 新增测试文件须加入脚本，或明确单独执行并记录结果 |

代码路径以本文编写时为准；实施前重新核对函数和调用者，不依赖固定行号。

## 3. 数据与校验规则

### 3.1 Asset 数据变更

- 在 `backend/src/models/asset.js` 新增 `displayName: STRING(200), allowNull: true`。
- 在 `backend/migrations/` 新增对应的可重复执行迁移，参考 `20261008000000-add-model-packages.js` 的表/列存在检查。
- 在 `backend/src/index.js` 接入迁移顺序；兼容已有数据库升级和首次建库。首次建库尚无 Assets 表时可跳过迁移，由包含新字段的模型建表。
- 旧数据保留 `NULL`，无需批量复制 `originalname`。这样未自定义名称的 Asset 在上传替换版本后仍可自然显示新的源文件名。
- `assetResponse()` 返回独立的 `displayName`，旧记录返回 `null`；保持 `originalname`、`filename` 等既有字段及响应外层结构兼容。
- 检查详情、搜索、上传结果、替换版本结果和 Dashboard 的返回字段，避免某入口丢失名称。
- 替换文件版本时保留已有自定义 `displayName`；改名本身不调用 `preserveCurrent()`、MinIO 写入或 AI 入队逻辑。

迁移的 up/down 应在测试或可丢弃数据库验证；down 会删除自定义名称数据，应记录这一回滚影响，不要在共享或生产数据库试跑回滚。

### 3.2 输入规则

两个接口都仅接受规定的字符串字段，先检查类型，再 trim，再检查长度。拒绝缺失、`null`、非字符串、全空白、超长值及换行/控制字符，允许中文、emoji、正常空格和标点。

前后端使用一致的长度与控制字符规则；建议拒绝 U+0000–U+001F、U+007F–U+009F，原始输入中的换行不能通过 trim 被静默接受。API 为最终校验来源，不能仅依赖 HTML 输入框。

可增加专门的名称校验工具，或小范围扩展通用 validator；如果扩展通用逻辑，需要覆盖既有行为，避免顺带改变其他接口。不要把展示名称当文件路径处理，也不要通过改写用户文本来制造文件名。

保存与当前规范化名称相同的请求可返回成功且不写库；前端在无有效修改时禁用 Save。第一版不支持用空字符串或 `null` 清除自定义名称，避免语义不明确。

## 4. API 合约与权限

### 4.1 Asset 改名

```http
PATCH /api/assets/:id/name
Content-Type: application/json

{ "displayName": "主角待机动画" }
```

成功：`200`，返回 `{ "asset": <assetResponse(updatedAsset)> }`，包含 ID、保存后的 `displayName` 和原有文件信息。前端 service 建议增加 `assetService.rename(assetId, displayName)`。

实施要求：

- 路由复用 `auth`、`denySystemAdministrator`、`requireWorkspace`、`authorizePermission('manageMetadata')`、`workspaceAssetAccess`。
- 控制器复用前置权限任务完成后的 `canManageAsset()` 或同等判断：Workspace 匹配，且为 Owner，或为 Manager 且 `Asset.userId` 与当前用户 ID 匹配。不可只依赖前端隐藏按钮，也不能继续使用仅判断 Owner/Manager 的旧 helper。
- 只允许更新 `displayName`，使用字段白名单及限定字段的写入。请求夹带的 `workspaceId`、`userId`、`filename`、`originalname`、`metadata` 等字段不得写入。
- 保留当前跨 Workspace 访问拒绝、未分配 Workspace 的旧 Asset 拒绝、缺失 Asset 返回 404 的行为。
- “本人上传”与当前 Manager 角色必须同时满足；Collaborator、已离开 Workspace 的原上传者不获得改名权限。上传者依据数据库 `Asset.userId`，不能由请求体或版本创建者推导。
- 限定写入字段，避免并发改名与上传新版本相互覆盖其他属性。第一版同时改名采用最后成功写入生效，不假装已有冲突检测。

### 4.2 Workspace 改名

```http
PATCH /api/teams/current/name
Content-Type: application/json

{ "name": "游戏美术素材库" }
```

成功：`200`，返回 `{ "team": { "id": 12, "name": "游戏美术素材库" }, "role": "workspaceOwner" }`。前端 service 建议增加 `teamService.rename(name)`。

实施要求：

- 复用 teams 路由现有认证和系统管理员禁止逻辑，新增路由明确使用 `requireWorkspace` 与 `authorizePermission('manageTeam')`。
- 使用认证中间件根据实际成员关系确定的当前 Workspace ID；忽略请求体中伪造的 teamId、workspaceId 或角色。
- 只更新 `Team.name`；不改 ID、邀请码、成员关系、Owner、资产归属。
- 响应无需返回邀请码或全部成员；前端合并新名称时保留已加载的成员列表与其他详情。
- 当前成员角色由后端每次请求核对；改名无需重新签发 JWT。

### 4.3 错误处理

名称校验失败返回 `400`，建议沿用 `{ message: 'Validation failed', errors: [{ field, location: 'body', message }] }`；权限不足、无有效当前成员关系、跨 Workspace 访问返回 `403`；授权检查通过但目标不存在时返回 `404`；服务端异常返回现有安全错误格式。

认证失败沿用当前 auth 中间件约定：缺失 token 返回 401，无效 token 当前返回 400。此次不要顺带重构全局认证状态码。前端统一通过现有 API 错误处理展示失败原因，失败时保留输入。

在 `backend/swagger.yaml` 补充两个端点、输入限制、权限、响应及 Asset 新字段，保持 API 文档与实现一致。

## 5. 前端交互与状态同步

### 5.1 两个编辑入口

- Asset：在 `AssetDetailPage.jsx` 名称旁加入可访问的编辑按钮；Owner 可见，Manager 仅在本人上传的 Asset 上可见，且都须匹配当前 Workspace。
- Workspace：在 `TeamPage.jsx` 标题附近加入编辑入口，仅 Owner 显示。
- 复用 `components/common/Dialog.jsx`，提供有 label 的单行输入、长度提示、Save、Cancel、内联错误和保存中状态。
- 现有界面为英文，新增文案保持英文一致；本文中文说明不意味着新增中文 UI。
- 打开后聚焦输入，支持键盘操作和焦点恢复。保存期间阻止重复提交及关闭，避免用户把关闭误认为取消已发送的写入。
- 无修改的 Cancel/关闭直接退出；有实际修改时，在丢弃前确认。保存失败保持弹窗和输入，允许重试；保存成功关闭并显示清晰反馈。
- 保存本身不再弹第二次确认。Asset 弹窗可简短说明只修改显示名称，并展示原文件名帮助识别。
- 长名称在卡片/导航中合理截断，在详情/弹窗中换行或可完整查看；按钮不能被标题挤出屏幕。手机端不产生横向滚动，保持现有颜色风格。

### 5.2 复用草稿保护

使用 `context/UnsavedChangesContext.jsx` 导出的 `useUnsavedChanges(dirty, label, pending)`；该 hook **直接返回清除自身登记的函数**，不是对象。

只在弹窗打开且有修改/请求进行中时登记。关闭弹窗只处理本弹窗的草稿，使用已有 `useConfirmation` 进行必要的丢弃确认；不要调用会清空整个 provider 登记集合的全局离开操作来关闭单个弹窗。

保存成功或确认取消后只清除自身登记。页面的 Metadata、评论、上传文件等其他草稿必须继续受到保护。Workspace 改名不能被当成切换 Workspace，不能触发路由跳转、Outlet 重新挂载或其他草稿丢失。

### 5.3 Asset 展示与搜索

新增一个统一的展示名称 helper，例如 `getAssetDisplayName(asset)`，供页面和组件复用 fallback。明确将它限定在**展示用途**。

| 位置 | 要求 |
| --- | --- |
| 详情标题、AssetCard、Dashboard/ActivityFeed | 优先展示自定义名称 |
| 删除等操作确认中的对象标签 | 使用展示名称；必要时附原文件名帮助区分同名资产 |
| 图片 alt 等可访问文案 | 适当使用展示名称 |
| 文件信息区、版本文件名、下载回退名称 | 保留原始文件名 |
| 模型类型识别、预览 loader、包资源路径、ZIP | 继续使用源文件/存储/manifest 字段 |

特别检查 `VersionHistory`、`ModelPackageEditor`、`AssetThumbnail`、`AssetPreview` 以及 3D 加载调用：即使某个 prop 名为 `assetName`，也要确认是否参与文件逻辑，不可按变量名猜用途。

名称搜索保留现有 `filename` 查询参数兼容性，在 `buildAssetSearchWhere()` 同一 OR 条件中增加 `displayName`，保留对 `originalname`、`filename` 的既有匹配。与 Workspace、类型、日期等过滤条件仍保持正确组合，不改变分页和去重行为；AI 查询参数 `q` 的用途保持原样。

搜索页标签及顶部搜索提示改为 Asset name or filename 一类文案。保存后立即更新当前详情的名称字段；其他列表在下一次加载时取得新名称，有已挂载缓存则按 Asset ID 定点更新或重新加载。不要用改名前开始的请求结果覆盖新名称，也不要全量刷新页面导致草稿丢失。

### 5.4 Workspace 名称同步

保存成功后至少同步以下位置：

1. TeamPage 当前详情中的名称，保留成员、邀请码等其他已加载字段。
2. AuthContext 的当前 `user.team.name` 与本地持久化 session，保留 ID、token 和权限信息。
3. WorkspaceSwitcher 的成员 Workspace 列表缓存，确保下拉选项立即显示新名称。

可新增按 ID 更新名称的 Context 方法，或复用现有 session 更新机制并补齐列表同步。无需为此引入新状态管理依赖。若用 effect 联动切换器，依赖稳定的 ID/name，避免循环请求；处理正在进行的旧列表请求，避免其回包恢复旧名称。

处理异步结果前核对目标 ID 与当前 session：如果请求期间用户已切到其他 Workspace 或退出登录，不得重新激活原 Workspace、恢复旧 session。对旧 Workspace 的列表更新可按 ID 合并，不改变当前选择。

其他用户或浏览器标签页在下一次获取 Workspace 信息时看到新名称即可；本轮不要求 WebSocket 广播。

## 6. 文件入口清单

下列路径相对仓库根目录；新增 helper、弹窗组件或测试的具体命名可由实施者按现有结构选择。

| 范围 | 主要文件 |
| --- | --- |
| 数据模型与迁移 | `backend/src/models/asset.js`、`backend/src/models/team.js`、`backend/migrations/`、`backend/src/index.js` |
| Asset API、返回值及 Dashboard 查询 | `backend/src/routes/assets.js`、`backend/src/controllers/assetsController.js` |
| Workspace API | `backend/src/routes/teams.js`、`backend/src/controllers/teamController.js` |
| 权限与隔离复用 | `backend/src/middleware/auth.js`、`rbac.js`、`requireWorkspace.js`、`workspaceAssetAccess.js`；`backend/src/utils/workspaceScope.js` |
| 校验、搜索、API 文档 | `backend/src/middleware/validate.js`、`backend/src/utils/searchQuery.js`、`backend/swagger.yaml` |
| 编辑入口、service | `frontend/src/pages/AssetDetailPage.jsx`、`TeamPage.jsx`；`frontend/src/services/assetService.js`、`teamService.js` |
| 弹窗与草稿保护 | `frontend/src/components/common/Dialog.jsx`、`frontend/src/hooks/useConfirmation.jsx`、`frontend/src/context/UnsavedChangesContext.jsx` |
| Session 与切换器 | `frontend/src/context/AuthContext.jsx`、`frontend/src/components/layout/WorkspaceSwitcher.jsx` |
| 名称展示与搜索 | `frontend/src/components/assets/AssetCard.jsx`、`AssetThumbnail.jsx`；`frontend/src/components/dashboard/ActivityFeed.jsx`；`frontend/src/pages/DashboardPage.jsx`、`SearchPage.jsx`；`frontend/src/components/layout/AppShell.jsx` |
| 需要保持文件语义的逻辑 | `backend/src/utils/modelPackage.js`、版本上传/下载控制器、前端 AssetPreview/VersionHistory/ModelPackageEditor/3D loader 的调用者 |

## 7. 建议实施顺序

- [ ] 检查工作区、适用的仓库指引与当前代码，确认尚未被其他任务实现；保护无关改动。
- [ ] 确认前置权限调整已实施并通过验证；改名 API 和 UI 复用其最终规则。
- [ ] 确定名称校验实现，增加 Asset 字段、迁移和启动接入，处理旧记录 fallback。
- [ ] 实现两个 PATCH 接口、字段白名单、权限检查与 Swagger 文档。
- [ ] 补齐所有 Asset 返回字段及名称搜索；重点检查 Dashboard 显式字段投影。
- [ ] 增加前端 service 和统一展示 helper；实现两个编辑弹窗及草稿保护。
- [ ] 更新名称展示位置、Workspace session 与切换器列表同步，处理旧请求回包。
- [ ] 补充下列有意义的测试，运行相关检查和浏览器验收。
- [ ] 在本文末尾或交付记录写明完成项、实际验证结果和剩余限制。

## 8. 验收与测试矩阵

| 类别 | 必须验证的行为 |
| --- | --- |
| Asset 权限 | Owner 可改同 Workspace 任意 Asset；Manager 改本人 Asset 成功、改他人 Asset 返回 403；Collaborator、无成员关系用户、systemAdministrator 被拒绝；不能修改其他 Workspace 资产 |
| Workspace 权限 | Owner 成功；Manager、Collaborator、systemAdministrator 被拒绝；伪造 ID/角色不能越权 |
| 校验 | 中文/emoji、首尾空格、最小和最大长度边界；缺失、null、数字、全空白、控制字符、超长输入失败 |
| 数据兼容 | 旧 Asset 无 displayName 正常展示；重复名称允许；只写允许字段；失败不产生部分修改 |
| 搜索 | 新名称、原文件名均可找到同一资产；跨 Workspace 过滤、组合条件、分页正常 |
| 文件回归 | 改名不增加 Version、不触发 AI、不写 MinIO；预览、下载文件名、ZIP/模型资源及版本记录不变 |
| 替换版本 | 有自定义名称时保留；从未自定义名称时跟随新的原始文件名展示 |
| 弹窗 | 正确预填、无改动禁用 Save、Cancel 零写入、dirty 关闭确认、失败保留输入、重复点击只提交一次 |
| 草稿与异步 | 改名不丢其他表单草稿；pending 防离开；旧请求不回滚新名称或重新激活已离开的 Workspace |
| Workspace 同步 | TeamPage、AuthContext、本地存储、切换器立即一致；刷新仍保留新名称；ID、成员及权限不变 |
| 可访问性和布局 | 键盘焦点/Escape/焦点恢复；桌面与窄屏长名称不撑破布局，原配色保持 |
| 迁移 | 旧库升级、新库创建、重复 up、测试库 down；测试完成与仅静态检查应分别记录 |

优先扩展现有 `backend/__tests__/assetsController.test.js`、`searchQuery.test.js`、`workspaceIsolation.test.js`、`routes.test.js` 和必要的校验测试；按需新增 Workspace 改名控制器与迁移测试。不要只验证函数被调用，需验证越权拒绝、实际更新字段及副作用不发生。

前端优先扩展 `AssetDetailPage.test.jsx`、`TeamPage.test.jsx`、`WorkspaceSwitcher.test.jsx`、`AuthContext.test.js` 和相关搜索/展示测试；覆盖改名与已有草稿同时存在的场景。

建议命令（PowerShell，各自在指定工作目录执行）：

```powershell
# 工作目录：backend。先确保新测试文件已纳入 scripts.test。
npm test
```

```powershell
# 工作目录：frontend。
npm run lint
$env:CI = 'true'
npm test -- --watchAll=false --runInBand
npm run build
```

数据库集成验证和浏览器验收应使用明确的测试数据，至少验证一个普通文件和一个带依赖资源的 3D 包。若缺少可用服务或测试数据库，完成可执行的检查并在交付中标明未验证项；不要把 mock 测试或历史 UI 测试通过当成真实改名流程已通过。

## 9. 接手 Agent 的完成标准

交付应说明：实际采用的名称/权限规则、变更文件、迁移接入方式、测试命令与结果，以及尚未验证的运行环境。提供可检查的代码和页面结果，不以“已经添加改名按钮”作为完成标准。

当且仅当两个接口、两个编辑入口、相关名称展示/搜索、Workspace 状态同步及必要回归验证完成，才将本功能标记为已实施。本文初始状态仅为实施交接说明。
