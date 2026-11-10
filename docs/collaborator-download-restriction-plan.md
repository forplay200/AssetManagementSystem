# Collaborator 禁止下载：Agent 实施交接

日期：2026-10-26（Asia/Kuala_Lumpur）

状态：**已于 2026-10-26 实施并部署。** 前后端下载权限、历史预览、导出入口与相关文档已同步；自动测试、真实接口及浏览器验收结果与限制见第 8 节。

## 1. 用户要求与范围

用户要求 Collaborator 不能下载 Asset，也不应看到下载 UI。前次仅生成本规划；用户随后明确授权按本文修改权限，本轮已实施。

实施目标：

- Collaborator 无 `downloadAsset` 权限，直接调用当前文件、原始主文件、模型包 ZIP 和历史版本下载接口时均被后端拒绝。
- Collaborator 看不到详情标题区、Asset actions、版本列表中的下载按钮，也不显示引导下载的文案或空操作区。
- 为使页面不再出现下载入口，全文阅读中的 `Download TXT` 和音频播放器内可控制的下载选项也随权限隐藏。
- 查看、搜索、预览、读取 metadata/AI 结果、查看版本历史以及评论/回复维持现有规则。
- Owner、Manager 下载当前 Workspace 内可访问资产的权限保持不变，包括 Manager 下载其他人上传的 Asset。
- 既有 Manager 仅修改/删除本人上传资产、Owner 管理当前 Workspace 全部资产、共享词库规则不变。
- 保持现有配色，桌面优先、兼顾手机；不增加数据库字段、迁移或新角色。

此前 [Manager 权限调整文档](asset-manager-ownership-permissions-plan.md) 和 [RBAC 文档](rbac-redesign.md) 中的“Collaborator 可以下载”是旧规则。后续实施本任务时应同步这些文档，并明确标记实施/验证状态，避免其他 agent 再按旧矩阵恢复下载权限。

### 1.1 下载限制与预览的边界

本方案限制的是**产品提供的下载/导出入口及专门的下载 API**，同时继续允许预览。现有图片、音频和 3D 预览会将内容传到浏览器，用户仍可能通过浏览器保存预览数据；隐藏按钮、设置 inline 或禁用原生下载菜单都不是防复制措施。

如果未来要求“Collaborator 绝不能取得原始资产字节”，需要另行设计预览衍生文件或服务端渲染，不能仅通过本次 RBAC 修改达到。不要为了宣称全面禁止下载而关闭预览，也不要把预览接口伪装成下载接口继续提供按钮。

## 2. 目标权限矩阵

以下范围均限定在具有有效成员关系的当前 Workspace；跨 Workspace 隔离、账号停用与系统管理员限制照旧。

| 功能 | Owner | Manager | Collaborator |
| --- | --- | --- | --- |
| 查看、搜索、预览 Asset | 允许 | 允许 | 允许 |
| 查看 metadata、标签、AI 结果 | 允许 | 允许 | 允许 |
| 查看历史版本与既有版本预览 | 允许 | 允许 | 允许 |
| 下载当前文件/原始主文件 | 允许 | 允许 | **禁止** |
| 下载模型包 ZIP | 允许 | 允许 | **禁止** |
| 下载历史版本文件/ZIP | 允许 | 允许 | **禁止** |
| 下载 transcript TXT | 允许 | 允许 | **隐藏导出入口** |
| 阅读/复制 transcript 文本 | 允许 | 允许 | 允许 |
| 评论、回复及评论管理 | 原规则 | 原规则 | 原规则 |
| 修改/删除 Asset、共享词库管理 | 原规则 | 原规则 | 原规则 |

Manager 的下载权限与资产写入权限独立：Manager 不能修改其他人上传的资产，但仍可下载同 Workspace 的这些资产。不要把 `canManageAsset` 直接用作下载判断。

## 3. 当前实现与容易遗漏的入口

| 文件/位置 | 已核对现状 | 实施要求 |
| --- | --- | --- |
| `backend/src/middleware/rbac.js` | Collaborator 权限包含 `viewAsset`、`downloadAsset`、`comment` | 仅移除 `downloadAsset` |
| `frontend/src/auth/permissions.js` | 同样包含 `downloadAsset` | 与后端同步 |
| `backend/src/routes/assets.js` | 当前文件和历史版本下载已使用 `authorizePermission('downloadAsset')` | 保留路由检查，以真实 HTTP 测试证明新角色限制生效 |
| `frontend/src/pages/AssetDetailPage.jsx` | 标题区 Download、Asset actions Download/ZIP/Original main file 未按下载权限显示 | 全部使用统一下载判断；无任何可用操作时隐藏整个 Asset actions |
| `frontend/src/components/versions/VersionHistory.jsx` | 每个版本的 Download/Download ZIP 无下载权限开关 | 增加独立 `canDownload`，保留版本内容和 Preview |
| `frontend/src/utils/loadModelPackage.js` | 无 package manifest 的旧历史模型，预览调用 `downloadVersion(..., { main: true })` | 必须改用受查看权限保护的预览路径，否则 Collaborator 预览会因 403 失败 |
| `frontend/src/components/common/ExpandableText.jsx` | 全文阅读弹窗始终显示 Download TXT | 增加显式导出权限并从上层传入 |
| `frontend/src/components/metadata/MetadataPanel.jsx` | AiEnrichment → AiText → ExpandableText 展示 transcript | 将下载权限沿调用链传递，不与 canEdit 混用 |
| `frontend/src/components/assets/AssetPreview.jsx` | 音频使用浏览器原生 `<audio controls>` | 对无下载权限用户隐藏播放器支持的下载选项，播放保持正常 |
| `frontend/src/pages/ProfilePage.jsx` | Collaborator 描述包括 `Download permitted files` | 改为符合实际权限的查看/预览/反馈说明 |

代码依据是本文件编写时工作区的实际内容。实施时先重新检查源码与未提交修改，尤其当前工作区已有 Node 运行时、构建配置及其他文档修改，不应覆盖或顺带提交这些内容。

## 4. 后端修改方案

### 4.1 移除角色下载能力

将 Collaborator 权限由 `['viewAsset', 'downloadAsset', 'comment']` 改为 `['viewAsset', 'comment']`。Owner/Manager 的 `downloadAsset` 保持不变。

继续使用认证中间件根据数据库成员关系判定当前角色，不信任请求体或旧 token 中伪造/过期的 Owner、Manager 声明。无须修改 JWT 格式或重新创建账号。

需要验证的现有路由：

| 路由 | 下载形式 | Collaborator 预期 |
| --- | --- | --- |
| `GET /api/assets/download/:id` | 普通文件，或带 package 的 ZIP | 403 |
| `GET /api/assets/download/:id?main=true` | 模型原始主文件 | 403 |
| `GET /api/assets/:id/versions/:versionId/download` | 历史文件，或历史包 ZIP | 403 |
| `GET /api/assets/:id/versions/:versionId/download?main=true` | 历史版本主文件 | 403 |

拒绝必须发生在文件读取或 ZIP 流开始前，不能只在前端隐藏按钮。下载 URL、查询参数 main 的变化或请求头伪造均不能恢复权限。保留其他认证/缺失资源状态码约定，不顺带重构整个错误处理系统。

### 4.2 解除历史预览对下载接口的依赖

建议新增查看权限保护的接口：

```http
GET /api/assets/:id/versions/:versionId/preview
```

实施要求：

1. 路由复用 `auth`、`denySystemAdministrator`、`requireWorkspace`、`authorizePermission('viewAsset')`、`workspaceAssetAccess`。
2. 使用 `{ id: versionId, assetId: id }` 查找 Version，不能只凭 versionId 获取其他资产的版本；目标版本不存在或不属于该 Asset 返回 404。
3. 返回用于预览的版本主文件，沿用 `streamFile` 的 inline 行为与响应错误处理。不提供 ZIP 下载，也不支持把该路由切换为 attachment 下载的查询参数。
4. 在 `assetService` 增加 `getVersionPreview(assetId, versionId)`，返回 blob。
5. `loadModelPackage()` 中旧历史模型无 manifest 时改用该方法。当前 Asset 继续使用 `getPreview()`；有 manifest 的模型继续使用已有 package/resource 预览流程。
6. 确认 Owner/Manager 预览同样使用预览路径，避免同一功能按角色走不同数据来源。

既有 package/resource 路由仍用于查看和模型加载，不应一律改成 downloadAsset 权限。其资源范围与 Workspace/版本归属校验保持不变。不要通过让 Collaborator 的下载接口继续返回 200 来修复预览。

在 `backend/swagger.yaml` 补充新的版本预览接口，并说明下载接口仅供 Owner/Manager 使用。

## 5. 前端修改方案

### 5.1 使用独立下载权限

页面计算 `canDownload`，结合现有 `downloadAsset` 角色能力和有效当前 Workspace。可在 `frontend/src/auth/assetPermissions.js` 增加 `canDownloadAsset(user, asset)`，复用已有 Workspace 匹配逻辑。

要求：

- 不使用 `canManageAsset` 或 `canCreate` 代替下载权限；它们会误限制 Manager 下载他人资产。
- 未加载身份/Asset、缺失 Workspace、Workspace 不匹配时默认不展示下载操作。
- 子组件的 `canDownload` 建议默认 false，由实际页面显式传入；避免未来新增调用者意外开放下载按钮。
- 点击处理函数也检查权限，阻止状态变化后的陈旧入口触发下载。后端仍是最终裁决来源。
- 角色降级导致 403 时沿用既有权限刷新与错误处理，不自动重试下载或改用预览接口保存文件。

### 5.2 详情页与历史版本

`AssetDetailPage.jsx`：

- 标题区的 Download/Download ZIP 按 canDownload 渲染。
- Asset actions 中的 Download、Download ZIP、Original main file 同样受控。
- 如果没有下载、删除、材质更新等任何可用操作，则不渲染整个 Asset actions 面板；Collaborator 不应看到空面板或 `Download the current file` 文案。
- 删除、修改、改名等原权限判断保持独立。
- 向 VersionHistory、AssetPreview、MetadataPanel 传递下载能力，不把评论区绑定到下载能力。

`VersionHistory.jsx`：

- 增加独立的 canDownload prop，隐藏每个版本的下载按钮。
- 保留历史记录、版本说明、文件信息及原有模型 Preview 按钮。
- 只有当本行确有 Preview 或 Download 操作时，才渲染操作按钮容器。
- 上传/更新版本权限继续由 canCreate 控制；不要给 Collaborator 开放任何版本写入。

### 5.3 全文阅读和播放器

`ExpandableText.jsx` 建议增加 `canDownload = false` 或语义相当的 prop，仅在允许时显示 Download TXT。从 AssetDetailPage 经 MetadataPanel、AiEnrichment、AiText 传入，保留 Owner/Manager 的 transcript 导出。

Read full text、Show more/less、Copy full text 继续可用。其他不需要下载的通用文本组件无需新增权限依赖；优先显式传参，避免将通用组件强制绑定 AuthContext 后破坏现有调用及测试。

`AssetPreview.jsx` 对无下载权限的音频播放器设置支持的 `controlsList="nodownload"`。这是原生控件的 UI 提示，不是访问控制；播放器仍应能播放、暂停和拖动进度。浏览器原生菜单行为应在实际目标浏览器检查，不宣称该属性能阻止所有浏览器保存内容。

不新增视频预览或其他无关功能，不用拦截右键作为权限实现。

### 5.4 权限文案

移除 ProfilePage 中 Collaborator 的 `Download permitted files`。同步实际角色说明和相关文档，把“查看/预览”与“下载”拆开；Owner/Manager 仍具备下载能力。

产品页面不需要新增数据库、RBAC 或接口实现细节说明，只展示与用户操作有关的能力。

## 6. 测试与验收

这是权限变更，必须覆盖后端真实路由和前端入口，不能只检查权限数组或截图。

| 测试组 | 预期 |
| --- | --- |
| 角色权限 | Collaborator downloadAsset 为 false，viewAsset/comment 为 true；Owner/Manager 下载仍为 true |
| 下载 API | Collaborator 对当前文件、main=true、ZIP、历史版本及历史 main=true 全部 403，且没有存储读取/ZIP 流副作用 |
| 管理角色回归 | Owner/Manager 下载正常；Manager 可以下载同 Workspace 他人上传的资产 |
| 成员状态 | Manager 降为 Collaborator 后，持原 token 的下一次下载请求被拒绝；跨 Workspace、停用、移除成员规则继续生效 |
| 当前预览 | Collaborator 图片、音频、文本和已有 3D 包预览仍可用 |
| 历史预览 | 无 manifest 的旧 OBJ/FBX 版本不再调用 downloadVersion；新 preview 路由返回可预览内容，历史包预览保持可用 |
| 版本隔离 | 用其他 Asset 的 versionId 访问新 preview 路由失败；跨 Workspace 失败；不存在版本返回 404 |
| 详情 UI | Collaborator 看不到 Download、Download ZIP、Original main file，也没有空 Asset actions 或下载引导文案 |
| 版本 UI | Collaborator 可看历史并 Preview，但无下载按钮；Owner/Manager 仍显示并可下载 |
| 文本导出 | Collaborator 可展开、阅读全文、复制，但没有 Download TXT；Owner/Manager 导出保留 |
| 音频 | 无下载权限时播放器配置 nodownload，播放操作正常；实测原生控件的显示 |
| 评论与草稿 | 评论、回复、本人评论编辑/删除及未保存草稿保护均不依赖下载能力 |
| Profile/布局 | Collaborator 角色介绍不再宣称可下载；桌面/手机无空面板、异常留白或配色变化 |

优先扩展这些测试：

- `backend/__tests__/rbac.test.js`：现有 Collaborator downloadAsset 为 true 的断言需要修改。
- `backend/__tests__/assetOwnershipRoutes.test.js`：已有完整路由、真实认证和模拟存储的基础；增加不同下载形式、角色降级及版本预览隔离测试，记录文件读取次数。
- `backend/__tests__/routes.test.js` / `assetsController.test.js`：按需覆盖版本预览路由与响应；源码字符串检查不能代替真实权限验证。
- `frontend/src/auth/permissions.test.js` / `assetPermissions.test.js`：角色与 Workspace 匹配；Manager 下载他人资产不能误用写入规则。
- `frontend/src/pages/AssetDetailPage.test.jsx`：隐藏整套下载 UI，保留评论、预览及 Manager/Owner 正常下载入口。
- `frontend/src/components/versions/VersionHistory.test.jsx`：下载能力和创建版本能力互相独立。
- `frontend/src/components/common/ExpandableText.test.jsx` / `metadata/MetadataPanel.test.jsx`：全文阅读、复制、导出权限传递。
- `frontend/src/components/assets/AssetPreview.test.js`：音频控件权限配置；按需新增 loadModelPackage 旧版本预览回归测试。

后端 `npm test` 当前显式枚举测试文件。若新增文件，需要加入测试脚本或明确单独运行；修改已有 package.json 时保留工作区的 Node 版本等无关修改。

建议命令（分别在 backend / frontend 工作目录执行）：

```powershell
# backend
npm test
```

```powershell
# frontend
npm run lint
$env:CI = 'true'
npm test -- --watchAll=false --runInBand
npm run build
```

浏览器验收使用专用测试 Workspace 和 Collaborator/Manager/Owner 账号，至少检查一个模型包、一个旧历史模型、一个音频含 transcript 的 Asset。不能把 unit mock 或历史测试通过当作真实 UI 已验证；不可使用真实数据做破坏性权限测试。

## 7. 实施顺序与交付

- [x] 读取仓库指引，检查当前分支、适用源码和未提交修改；不覆盖其他任务的改动。
- [x] 移除前后端 Collaborator 的 downloadAsset 权限；保留查看和评论。
- [x] 新增受查看权限保护的历史版本预览路径，替换旧模型预览中的下载调用。
- [x] 增加并传递独立 canDownload，隐藏详情/版本/TXT/播放器下载 UI；整理空操作区与角色文案。
- [x] 验证 Owner/Manager 下载仍可用，尤其 Manager 下载他人资产；验证 Collaborator 当前/历史预览与评论不回归。
- [x] 运行相关测试、lint、build 和浏览器验收；记录通过、失败及未验证的项目。
- [x] 更新 Swagger、RBAC 与旧权限规划中的下载规则，注明真实实施日期和部署状态。

无需数据库迁移。若服务通过 Docker 运行，源码修改不会自动改变已构建镜像；交付应区分“代码完成”“本地测试完成”“运行中的服务已更新”。遵循当前任务授权处理部署，不因验收而删除数据卷或重置账号。

最终交付应说明变更文件、后端拒绝下载的证据、前端隐藏下载 UI 的证据、预览/评论保持可用的验证结果及未验证项。只有这些完成后，才能把本计划状态改为已实施。

## 8. 2026-10-26 实施与验收记录

### 已实现

- 前后端 Collaborator 权限均为 `viewAsset`、`comment`；下载接口仍执行原有认证、当前数据库成员角色与 Workspace 隔离检查。
- 新增 `GET /api/assets/:id/versions/:versionId/preview`，按 Asset ID 和 Version ID 一同查找，仅 inline 返回版本主文件。旧模型预览使用 `getVersionPreview()`，不再调用 `downloadVersion()`。
- 新增 `canDownloadAsset(user, asset)`，默认拒绝未知、停用、管理员及不匹配 Workspace 的上下文；Manager 下载不受上传者限制。
- 独立 `canDownload` 已传入版本历史、AssetPreview、MetadataPanel → AiEnrichment → AiText → ExpandableText；隐藏当前/ZIP/主文件/历史/TXT 下载入口，音频采用 `controlsList="nodownload"`。没有可用操作时不渲染 Asset actions。
- 下载点击处理函数保留权限判断；403 沿用既有权限刷新，不自动改用预览来保存文件。
- Profile 文案、Swagger、RBAC 和 Manager 原权限规划已同步。共享词库、资产写入与评论作者规则保持独立。无需数据库迁移。

### 验证结果

| 层次 | 结果 |
| --- | --- |
| 后端自动测试 | 146 项通过；包含真实 Express/认证/权限路由及模拟存储。Collaborator 各下载形式 403 且存储读取次数为 0；Owner/Manager 正常；旧 token 角色降级、版本隔离及 inline 查询参数行为通过 |
| 前端自动测试 | 31 套件、111 项通过；覆盖独立 Workspace 下载能力、空操作面板、历史预览、TXT 能力传递、音频配置及既有评论草稿 |
| 静态/构建 | lint 无警告，生产构建与 Docker 前后端构建成功 |
| 真实数据服务 | 专用 Owner/Manager/Collaborator 与两个 Workspace；模型包、无 manifest 的旧 OBJ 历史版本、WAV+transcript、PNG、TXT 已验收 |
| 实际下载 API | Collaborator 当前文件/main/ZIP/历史文件/历史 main 均 403；Owner 和 Manager（下载 Owner 上传的资产）成功返回并读取完整响应字节 |
| 实际预览/评论 | 当前图片、音频、文本、模型包/资源、历史主文件预览成功；评论、回复、本人编辑和软删除成功；Manager 持原 token 降为 Collaborator 后下载立即 403 |
| 浏览器 | Collaborator 无下载按钮、无空操作区；旧 OBJ 历史模型显示成功；图片和文本预览正常；WAV 实际播放（readyState=4、currentTime 前进），原生菜单只显示播放速度；全文阅读/复制成功而无 Download TXT；Profile 文案正确 |
| 管理角色 UI | Manager 下载他人模型的 ZIP/主文件入口保留，写入入口保持隐藏；Owner 当前下载及全文 Download TXT 入口保留 |
| 手机布局 | 390px 验收页面无下载面板或横向溢出（documentWidth=380，viewport=390） |
| 清理/数据保留 | 专用账号、Workspace、资产、历史、评论及文件均已清理；原有 8 组数据库记录摘要和 40 个 MinIO 对象摘要与验收前一致，队列为空 |

### 工具限制与边界

- Manager 页面点击 ZIP 后，浏览器验收工具等待下载事件/文件路径时发生超时，最终文件落盘未确认；没有将这一步记录为浏览器下载成功。相同角色、相同模型包的真实 HTTP 下载与响应字节读取已通过。
- 旧 FBX 的前端服务路径与 loader 调用由自动测试覆盖；本次实际历史模型渲染使用 OBJ。
- 原生播放器菜单仅验证本次内置 Chromium 浏览器；`nodownload` 不是跨浏览器防复制保证。预览仍将内容传到浏览器，产品下载限制不等同于无法保存预览内容。
- Word report 未修改；既有 Node.js/CI 配置改动未覆盖，未提交或推送代码。

截图位于 `exports/`：

- `collaborator-no-download-model-20261026.png`
- `collaborator-legacy-version-preview-20261026.png`
- `collaborator-audio-menu-20261026.png`
- `collaborator-transcript-no-export-20261026.png`
- `collaborator-mobile-no-download-20261026.png`
- `owner-transcript-export-preserved-20261026.png`
