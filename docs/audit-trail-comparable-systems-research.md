# Audit trail 相似系统研究与 FYP 设计建议

研究日期：2026-11-02（Asia/Kuala_Lumpur）。

本文基于公开官方文档与当前工作区源码静态阅读，属于研究和设计建议，未实施功能，也未登录这些产品做实际操作验证。不同部署、权限与版本可能影响功能可用性。

## 1. 本项目需要回答的问题

当前项目是协作式数字资产管理系统（DAM）。主要情境是：Workspace Owner 有权修改或删除 Manager 上传的资产。需要能够回答：谁在何时修改了哪项资产、原上传者是谁、具体改了什么，以及删除后能否追查。

应区分两类事件：

- **资产内容变更**：Owner 修改 Manager 资产的 tag、metadata、名称或文件，或删除资产。这是本次核心。
- **成员权限变更**：Owner 将成员从 Manager 改为 Collaborator、移除成员等。项目也有这些管理入口，应纳入独立事件类型。

权限控制决定谁可以操作；audit trail 记录已经发生的操作。文件版本、回收站和通知分别处理版本保留、误删恢复、告知成员，不能互相代替。

## 2. 建议比较的三个系统

以下“官方文档确认”是产品事实，“可借鉴设计”是针对本项目的建议；不要把建议写成其他系统已具备的功能。

| 系统 | 官方文档确认 | 本项目可借鉴设计 |
| --- | --- | --- |
| **ResourceSpace** | 同时有用户日志和单个资源日志，记录操作人、时间、metadata／访问／状态变更，编辑日志可显示旧值与新值。[Logs](https://www.resourcespace.com/knowledge-base/user/logs) | Asset Detail 增加 History，具体显示 tag 或 metadata 的变化。 |
| **Bynder** | Change History 分为 Users、Permissions、Assets 等类别；资产记录包含 metadata 属性和删除变更。查看与 CSV 导出需要相应权限，功能需客服启用。[Change History](https://support.bynder.com/hc/en-us/articles/8389077589394-How-To-Use-And-Export-Change-History-In-The-DAM) | Workspace Audit Log 将资产操作与成员权限操作分开筛选；查看和导出可单独授权。 |
| **Canto** | Operation Logs 支持时间范围及 File Name、User、Operation 筛选；管理员或具备 view reports 权限的 contributor 可查看，也支持 CSV。文档描述可显示当年和上一整年的数据。[Reports – Logs](https://support.canto.com/hc/en-us/articles/23001478643601-Reports-Logs) | Workspace 日志按资产、操作人、动作和时间检索，并明确查询范围。 |

注意：Canto 的上述页面没有说明每种操作是否都保存 before/after，也不能据此断言日志绝对不可删除。其 Metadata Activity 报告主要是关键词／标签使用统计，不宜当作字段修改历史的证据。[Metadata Activity](https://support.canto.com/hc/en-us/articles/23001513706897-Reports-Metadata-Activity)

**建议主要分析 ResourceSpace 和 Bynder，以 Canto 补充日志检索与权限设计。** 它们都与数字文件、metadata 和多人协作有关，适合作为本项目的比较对象。

## 3. 删除和恢复的参考做法

- **ResourceSpace**：普通删除先进入 Deleted 工作流状态，永久删除另行执行。[Deleting resources](https://www.resourcespace.com/knowledge-base/user/deleting-resources)
- **Bynder**：文档说明误删资产可在 30 天内通过 Trash 恢复，恢复需要专门权限，可按 Removed by 查找删除者。[Restore deleted assets](https://support.bynder.com/hc/en-us/articles/360013875320-How-To-Restore-Deleted-Assets-Metaproperties-And-Metaproperty-Options)
- **ResourceSpace 的撤销**：启用相应版本功能后，可从日志撤销 metadata 编辑或文件替换；撤销本身也会形成日志。[Version control](https://www.resourcespace.com/knowledge-base/user/version-control)

这些文档支持“删除可分阶段”“历史可用于恢复”的设计依据，不能推断所有产品在永久删除后都无限期保留日志，也不能推断它们都要求上传者批准管理员操作。Bynder 的 30 天是该产品文档的恢复窗口，不是本项目必须采用的期限。

## 4. 当前代码中的实际缺口

本节依据当前工作区源码，不是运行环境验收结果。

| 代码位置 | 已确认的行为 | 与 audit trail 的关系 |
| --- | --- | --- |
| [assetPermissions.js](../backend/src/utils/assetPermissions.js) | 同 Workspace 的 Owner 可管理资产；Manager 须为原上传者。 | 已有操作权限边界，尚需记录允许操作后的变更。 |
| [ActivityFeed.jsx](../frontend/src/components/dashboard/ActivityFeed.jsx) | 从 recentUploads、recentUsers 拼出最多八条动态。 | 不是持久审计事件，不能追踪 tag 修改和删除。 |
| [version.js](../backend/src/models/version.js) | 有 createdBy、createdAt、changeLog 等版本字段。 | 版本说明不能覆盖每次独立的标签、metadata、名称或成员权限变更。 |
| [assetsController.js](../backend/src/controllers/assetsController.js) | tag、metadata、改名路径直接写入业务数据；删除路径清理对象文件，删除 Version 与 Asset。 | 所读路径未写独立审计事件；删除后不能依赖 Asset／Version 查历史，也没有回收站窗口。 |
| [teamController.js](../backend/src/controllers/teamController.js) | 有成员角色调整和成员移除入口。 | 这些管理操作也需要单独的权限事件。 |

在 backend/src 与 backend/migrations 的检索中未发现独立 audit log 实现。项目已有[删除治理与 Audit Trail 建议](fyp-copyright-deletion-audit-recommendations.md)，它是设计资料，不能作为功能已实现的证据。

## 5. 适合 FYP 的最小设计

### 5.1 两个查看入口，共用一套事件

1. **Asset Detail → History**：查看某项资产的上传、改名、tag／metadata 变化、文件版本变化和删除／恢复事件。
2. **Workspace → Audit Log**：检索 workspace 内事件，包含已删除资产及成员角色调整，按时间、资产、操作者和动作筛选。

不能只保留资产详情入口：资产被删除后，需要仍能在 workspace 日志找到记录。

### 5.2 首期记录范围

| 事件 | 应显示的差异或上下文 |
| --- | --- |
| 资产上传、改名 | 原上传者、资产标识；改名前后名称。 |
| tag 增加／移除、metadata 编辑 | 实际变化的字段、旧值、新值；区分资产标签关联与共享词库操作。 |
| 文件替换／保存版本 | 相关版本编号、操作者、版本说明。 |
| 资产删除 | 删除者、原上传者、资产名称快照、时间、原因、结果。 |
| 成员角色调整／移除 | 被影响成员、原角色、新角色或移除状态。 |

若随后增加回收站，再增加移入回收站、恢复、永久清理请求／完成／失败事件。不要在功能尚未存在时把事件列为已实现。

AI 操作也应区分用户发起 Regenerate、系统任务完成、用户接受建议。后台执行者可以是 system，但应关联发起者和 jobId；生成建议不应被记录成用户已接受标签。

### 5.3 单条记录内容

建议包含：eventId、workspaceId、服务端时间、操作者 ID 与当时角色、actorType、动作、目标类型与 ID、资产名称及原上传者快照、实际 before/after 差异、原因、结果，以及关联请求／任务 ID。

只保存必要内容，排除 token、密码、签名下载 URL 等凭证。普通无变化的重复保存不应伪装成新的字段变更。

示例仅用于解释拟议设计：

| 时间（MYT） | 操作者 | 目标 | 操作 | 变化／原因 |
| --- | --- | --- | --- | --- |
| 2026-11-02 10:15 | Alice（Owner） | Ben 上传的 city.png | 移除 tag | [city, night] → [city]；标签不准确。 |
| 2026-11-02 10:20 | Alice（Owner） | Ben 上传的 city.png | 移入回收站 | Active → Trashed；重复上传。此动作以未来实现回收站为前提。 |
| 2026-11-02 10:25 | Alice（Owner） | Ben 的成员身份 | 更改角色 | Manager → Collaborator。 |

### 5.4 查看和修改权限

- Owner 可查看本 Workspace 全部审计记录，但也必须被记录，且不能通过业务接口编辑或删除日志。
- 建议 Manager 至少可查看自己上传资产的历史，包括 Owner 对其执行的操作及删除记录。是否开放所有成员的资产历史，是独立产品选择。
- Collaborator 可按现有资产读取权限查看允许公开的内容历史，不默认获得全 workspace 成员权限日志。
- 导出、留存和维护清理另设规则。日志不随 Asset 删除而级联消失；用户改名或注销后仍能根据有限快照辨认事件。

这些是本项目建议，不是三个产品统一采用的角色矩阵。应用层限制日志修改，也不等于数据库管理员绝对无法篡改。

### 5.5 写入与删除的一致性

由后端在实际业务操作时产生事件。数据库变更与必要审计事件应放在同一数据库事务中，避免操作成功却漏记；失败或拒绝不能记成成功。

MinIO 文件删除不能随 PostgreSQL 事务回滚。若设计回收站及永久清理，需要分别记录删除请求、清理结果，使用可重试任务；不要仅把外部文件删除放进数据库事务，就声称文件与日志原子完成。

建议 Owner 删除他人资产时填写原因，便于解释管理行为。普通 tag 编辑可先自动记录差异，避免每次都要求冗长说明。通知原上传者可作为后续功能，它不能取代审计记录。

## 6. 向讲师展示与验证

可优先收集官方文档中的三个界面证据：ResourceSpace 的 Resource Log、Bynder 的 Change History 分类界面、Canto 的 Operation Logs 筛选界面。截图需注明产品、页面来源、访问日期；没有亲自试用时，应标注为官方文档分析。

可使用以下说明：

> 本项目允许 Workspace Owner 管理其他成员上传的资产，因此需要对管理操作提供可追溯性。我比较了 ResourceSpace、Bynder 和 Canto 的官方文档，拟采用资产级 History 与 Workspace 级 Audit Log，记录操作者、时间、目标与实际变更。日志独立于资产保存，使删除之后仍能追查；回收站则另行处理误删恢复。

后续实现时，最关键的验收情境为：Owner 修改 Manager 的 tag 后，Manager 能看到修改人和前后差异；资产删除后 workspace 日志仍存在；跨 workspace 不能读取日志；角色调整保留旧值与新值；失败操作不会显示为成功；Owner 无编辑或删除审计事件的业务入口。

