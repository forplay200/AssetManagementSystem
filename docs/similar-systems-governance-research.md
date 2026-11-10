# 相似系统研究：侵权、删除冲突、权限与 Audit Trail

研究日期：2026-10-26（Asia/Kuala_Lumpur）

状态：**官方公开资料研究，未对商业产品进行账号内实测，也未修改本系统业务逻辑。** 产品行为、套餐与文档会变化；本文说明的是本次查到的机制，不保证涵盖所有部署方式。

相关规划：[中文建议稿](fyp-copyright-deletion-audit-recommendations.md)、[English recommendations](fyp-copyright-deletion-audit-recommendations.en.md)。本文提供证据和比较，不自动批准或改变其中尚未确认的政策。

## 1. 研究范围与证据规则

选取 FYP report 的 Existing System 部分已有的四个系统：Anchorpoint、Google Drive、LottieFiles、Eagle。聚焦四类问题：

1. 文件被误删或被管理者删除后，是否可以恢复？
2. 谁能删除、恢复或覆盖他人的操作？
3. 操作历史能否说明发生了什么，它是否等于独立审计日志？
4. 侵权投诉是否只有条款，还是有处理和申诉渠道？

只依据官方产品文档、帮助中心、政策和开发者文档。区分：

- **已确认：** 资料明确说明的行为。
- **未确认：** 本次没有足够资料支持，不能写成“没有该功能”。
- **设计推论：** 从机制得到的项目建议，不是产品官方承诺。

报告引用日期应保留原来的历史记录；本次新增资料以本次访问日期记录。不得把 2026 年的新说明自动当成较早版本已有能力。

## 2. 核心发现

- 已查到的做法包括版本恢复、文件锁、回收站、权限分级、审计和投诉处理，解决的风险并不相同。
- **未发现本次检查的文档将“必须取得原上传者同意才能删除”规定为通用流程。** 不能因此证明所有产品都没有这项功能，也不能把它描述为行业标准。
- 有回收站不等于管理者不能提前永久删除；有版本历史不等于历史不可篡改；有版权条款不等于平台自动免责。
- 本项目若选择“Owner 不能跳过保留期 + 上传者异议暂停清理”，应明确为针对目标团队的额外治理设计，并验证成本与边界。

## 3. Anchorpoint：区分版本协作与管理争议

### 3.1 架构和权限边界

Anchorpoint 的 Security infosheet（页面标注更新于 2025-10-08）说明了生产文件位于用户的 Git 仓库、共享目录或 NAS，而 Anchorpoint 云主要管理协作 metadata 的模式。因此，在这种模式下，底层储存/仓库权限也是保护边界。[官方架构说明](https://www.anchorpoint.app/policies/security)

官方项目文档进一步要求参与者具备实际文件目录或 Git 服务端仓库的访问权限；Project Admin 管理项目设置与字段，Workspace Admin 自动具有项目设置权限。[Workspaces and projects](https://docs.anchorpoint.app/administration/projects/)

注意：当前文档也包括 Lore 工作流。下文的 Git 结论限定为 Git 模式，不能用较早安全说明推断所有当前部署完全相同。[Lore settings and commands](https://docs.anchorpoint.app/lore/settings-and-commands/)

**对本项目的意义：** 本项目由后端和 MinIO 集中提供资产，必须在自身 API、对象访问和任务处理上执行保护，不能假设外部 Git/NAS 会替系统完成这一层。

### 3.2 误删、覆盖和恢复

Git 模式提供从 commit 恢复文件、Undo Commit 等操作；单文件版本页也提供 Restore as Copy，便于保留当前文件并取出历史副本。[Git commands](https://docs.anchorpoint.app/git/settings-and-commands/)、[Version history](https://docs.anchorpoint.app/git/versions/)

这属于已经进入版本历史且仍可取得的内容恢复，不应描述成“任何文件永久删除后都能找回”。项目归档则保留 timeline 和成员并支持重新启用，与删除资产文件不是同一操作。[Project archiving](https://docs.anchorpoint.app/administration/projects/)

### 3.3 文件锁是否等于上传者否决权？

文件锁用于降低互相覆盖的风险。官方说明允许解锁他人的文件，并在侧栏记录谁执行了解锁；还说明部分应用可以强制覆盖只读文件，以及 NAS 上的写保护限制。[File locking](https://docs.anchorpoint.app/git/file-locking/)

**设计推论：** Anchorpoint 在这个场景体现的是“协调操作、显示责任人、保留可恢复历史”。文件锁不能直接当作“原作者可以否决管理者删除”的证据。

### 3.4 Timeline 是否就是不可篡改审计？

不能等同。Git 文档明确讨论 force push 重写服务端历史的风险，且 Anchorpoint 刻意不提供普通 force-push 按钮。[Force push guidance](https://docs.anchorpoint.app/git/settings-and-commands/#force-push)

本次确认了版本历史和特定操作记录，但未确认覆盖所有权限、成员、metadata 和删除操作的完整不可篡改审计系统。因此，报告宜写“版本与协作操作可追溯”，不要未经证实写“完整安全审计”。

### 3.5 Anchorpoint 如何处理侵权？

本次查到的 Terms and Conditions 包括账户处置、知识产权和联系渠道，EULA 描述软件许可及适用法律等事项；本次检查未找到像 LottieFiles 那样清晰、独立公开的用户资产版权通知/反通知流程。[Terms and Conditions](https://www.anchorpoint.app/policies/terms-and-conditions)、[EULA](https://www.anchorpoint.app/policies/eula)

结论只能是“公开证据不足”，不能据此声称 Anchorpoint 完全不处理侵权，也不能说它只靠条款就没有法律风险。其储存模式与本项目的集中上传服务存在差异，法律和运营责任不能直接照搬。

## 4. Google Drive：必须区分 My Drive 与 Shared drives

### 4.1 删除与恢复的权限

| 模式 | 官方说明的关键机制 |
| --- | --- |
| My Drive | 文件所有者可以删除；非所有者通常只能从自己的 Drive 移除该文件 |
| Shared drives | 内容管理者及以上可移入 Trash；Contributor 及以上可恢复；Manager 可提前永久删除 |

普通 Trash 保留期为 30 天。Shared drives 中的文件按团队/组织模式管理，成员离开后文件仍保留。这里的“文件所有权”是产品管理语境，不能据此判定底层作品著作权归属。[Shared drives comparison](https://support.google.com/a/users/answer/7212025?hl=en)、[My Drive deletion](https://support.google.com/drive/answer/2375102?hl=en)

**关键差异：** Google 的 Manager 是其产品角色，不等于本项目的 Manager。它允许该角色提前永久删除，因此 30 天是常规清理期限，不是不可绕过的保护期。

还有访问语义差异：Google 的 My Drive 删除说明指出，共享对象可能在文件进入 Trash 后仍可访问，直到永久删除。不能假设所有产品的软删除都会立即阻断内容访问。[My Drive deletion behaviour](https://support.google.com/drive/answer/2375102?hl=en)

### 4.2 审计

Google Workspace 提供 Drive log events，可记录操作者、时间、对象和事件，包含删除相关事件。但官方明确指出并非所有活动都会记录，查看能力和覆盖范围受 Workspace 版本与管理权限影响。[Drive log events](https://knowledge.workspace.google.com/admin/reports/drive-log-events?hl=en)

不能将这描述为“任何免费 Google Drive 账号都有完整管理员审计”。

### 4.3 侵权与违规处理

Google 有版权投诉、撤回投诉与反通知/申诉流程。Drive 的一般违规处理也可以限制共享并接受复核请求；一般产品政策复核与版权反通知不是同一法律程序。[Copyright complaint resolution](https://support.google.com/legal-help-center/answer/13965229?hl=en)、[Drive violation review](https://support.google.com/drive/answer/2463328?hl=en)

**对本项目的意义：** 普通删除、恢复、投诉限制和申诉应有不同状态及权限；文件恢复不自动等于允许重新共享。

## 5. LottieFiles：与本项目回收站和审计界面更接近

### 5.1 最近删除

官方说明文件/文件夹进入 Recently Deleted 后保留 30 天，可以恢复，也可以提前永久删除。删除时协作者失去访问、分享链接停用；恢复会恢复评论、版本历史等关联信息。文件夹内单个文件不能单独恢复。[Managing Deleted Files](https://help.lottiefiles.com/hc/en-us/articles/16777607831833-Recently-Deleted)

这支持“恢复整个资产上下文”的设计思路，而不只是把原文件放回磁盘。但本页没有完整说明各角色可执行永久删除的矩阵，因此不推断任意成员都可以，也没有证据证明需要上传者批准。

### 5.2 Audit Log

LottieFiles 官方明确提供 Enterprise Workspace 的管理员 Audit Log，显示 Date、User、Action，支持详情、日期过滤和 CSV 导出。[Using the Audit Log](https://help.lottiefiles.com/hc/en-us/articles/45885687957273-using-the-audit-log)

这直接支持本项目将审计独立于普通文件信息显示的方向。套餐限制应在竞品表注明；不能写成所有 LottieFiles 账号都拥有该功能，也不能由页面推导出日志绝对不可修改。

### 5.3 侵权举报与版权程序

公开动画页面有 Report Animation，版权/抄袭是举报理由之一，团队会审核；帮助中心建议提供原作品链接。[Reporting an Animation](https://help.lottiefiles.com/hc/en-us/articles/900002477766-How-can-I-report-when-someone-has-plagiarised-my-work-and-uploaded-it-as-their-own-onto-LottieFiles)

其单独的 Copyright Policy（页面标注 2019-07-14）说明版权通知、指定接收方、反通知和重复侵权账户处置，采用美国 DMCA 框架。[Copyright Policy](https://lottiefiles.com/page/copyright-policy)

**设计推论：** 可借鉴“条款 + 举报入口 + 证据 + 人工处理 + 申诉”结构；不得把美国程序、时限和法律文字直接当成马来西亚项目的适用规则。公开动画举报入口也不能直接证明私有 Workspace 内有完全相同的举报界面。

## 6. Eagle：本地素材库与集中协作平台不能混为一谈

官方开发者文档明确有 `moveToTrash()`，因此可确认移入回收站这一操作存在。[Eagle item API](https://developer.eagle.cool/plugin-api/api/item)

2026-08-11 官方 V5 开发文章说明其历史架构主要围绕单人本地素材库，并讨论未来多用户、权限和审计基础；文章明确是开发进展，不是发布公告，不能把这些方向当成全部已经交付。[Eagle V5 development update](https://www.eagle.cool/blog/post/eagle-v5-development-update)

本次打开以下帮助文章时，抓取结果只有标题和导航，未获得正文，所以**不能确定**自动清理期限或文件删除权限细则：

- [Does Eagle Automatically Delete Items in the Trash?](https://en.eagle.cool/support/article/does-eagle-automatically-delete-items-in-the-trash)
- [Does Eagle Support File Deletion Permission Control?](https://en.eagle.cool/support/article/does-eagle-support-file-deletion-permission-control)

本次也未获得足够证据，将 Eagle 本地素材库描述为具备与云端内容平台相同的统一版权举报/裁决流程。不得把本地应用、插件服务及公开资源社区的治理能力相互混用。

## 7. 对本项目建议的调整

以下是基于研究的建议，不是已批准的实施指令。

| 风险/目标 | 建议设计 | 证据与取舍 |
| --- | --- | --- |
| 误删与操作后悔 | 优先做回收站、恢复和清楚的永久删除提示 | LottieFiles、Drive 的回收站，以及 Anchorpoint 的版本恢复提供不同参考 |
| 谁做了什么 | 独立审计记录，Dashboard 提供查询入口 | 参考 Google Workspace 与 LottieFiles Enterprise；不把普通版本列表当完整审计 |
| Owner 立即清除他人资产 | 若目标是保护上传者，就显式禁止绕过保护期 | 这是比已查到的 Drive Manager 提前删除规则更严格的选择 |
| Manager 反对删除 | 可选增加异议冻结；先定义处理人和长期未决结果 | 本次没有依据称其为竞品通用规则，需证明适合目标团队 |
| 侵权投诉 | 权利声明、来源记录、接收渠道、人工处理、限制访问、申诉 | 借鉴 LottieFiles 与 Google 的过程结构，不复制外国法定时限 |
| 侵权期间恢复文件 | 恢复生命周期与解除内容限制分别判断 | 避免通用 Restore 绕过投诉处理 |

### 7.1 与先前建议如何衔接

先前建议中的七天只是候选值。本次两个云端产品提供三十天参考，并不代表本项目必须改为三十天。应结合使用频率、储存成本和误删恢复需求确定期限。

为控制 FYP 范围，可把基础方案优先级设为：

1. 上传权限/来源声明与投诉处理责任。
2. 软删除、保留、恢复、通知与审计。
3. 投诉访问限制与普通恢复隔离。
4. 只有在确实需要主张“Manager 能反对 Owner 永久删除”时，再加入异议、冻结和处理流程。

如果只完成前面三项，答辩应说“减少误删损失并改善可追溯性”，不要承诺已经解决管理者滥权或团队所有权争议。

## 8. Report 中值得修正的比较表述

根据已提取的原报告 Existing System 内容，下列比较需要收窄。这里只提出修订建议，没有修改原始 Word 文件。

1. **Google Drive：** 原文把其访问控制描述为缺少 RBAC，过于笼统。当前官方资料明确存在 Shared drives 角色分级和 Workspace 管理日志。应限定比较的是个人 My Drive、某个套餐，还是团队 Shared drives，避免把角色权限本身说成没有。
2. **Anchorpoint：** 可以突出其版本控制、文件锁和游戏工作流，但不宜笼统说它不处理资产组织。官方说明包含 metadata、标签与项目管理；本项目差异应落到具体 AI 标签流程、集中网页体验和目标用户验证。
3. **LottieFiles：** 若新增治理维度，注明回收站及 Enterprise Audit Log，而不是只列评论和动画支持。
4. **Eagle：** 明确比较版本与访问日期。现有本地工作流和 V5 开发路线不能当作同一批已交付功能。

以上判断的依据分别见本文各产品段落所附官方链接。竞品“未知”应该用 Not verified / Not documented in reviewed sources，不能默认标为 No。

建议为 comparison matrix 增加以下维度，而不是只比较“有没有 AI”：恢复方式、提前永久删除权限、日志可见范围、侵权投诉/申诉、部署与套餐边界。

## 9. 老师询问时可以这样回答

### 中文答辩版本

> 我查阅了 Anchorpoint、Google Drive 和 LottieFiles 的官方资料。Anchorpoint 的 Git 模式提供文件锁和历史版本恢复；Google Shared drives 与 LottieFiles 提供回收站，部分管理或企业功能提供独立操作记录。它们解决的是协作协调、可恢复性与可追溯性，并不共同要求删除必须先取得原上传者同意。
>
> 因此，我计划先为项目加入软删除、通知、恢复窗口和审计记录。若进一步加入上传者异议保护，我会把它明确为适合目标团队的治理设计，并补充争议处理规则，而不是声称这是所有 DAM 的标准做法。
>
> 侵权方面，LottieFiles 和 Google 公开了投诉及申诉机制，所以我的方案也不应停留在条款声明。系统应有授权和来源记录、接收投诉及处理访问限制的流程，但不会声称 AI tagging 能判断版权归属或保证没有侵权。

### English viva version

> My review distinguishes recovery, accountability and decision-making authority. Anchorpoint's Git workflow documents file locking and version restoration. Google Shared drives and LottieFiles document trash-based recovery, while administrative audit capabilities depend on the product and plan. These sources do not establish uploader approval as a universal prerequisite for deletion.
>
> I therefore propose soft deletion, notification, a recovery window and audit records as the initial safeguards. An uploader-objection mechanism would be an additional governance decision for my target users, requiring a defined resolution process rather than being presented as an industry-standard feature.
>
> For copyright, the published complaint and appeal procedures of LottieFiles and Google show why terms alone are not a complete operational response. My project should record declared permissions and sources, provide a complaint channel and separate access restrictions from ordinary restoration. AI tagging would not certify copyright ownership.

使用边界：上述本项目功能仍以 proposed / plan to 表达。商业产品资料证明的是设计参考，不是本系统已完成的证据。

## 10. 尚未验证的事项

- 各产品在真实账号、套餐和不同部署下的完整删除角色矩阵，以及默认删除通知是否发送给原上传者。
- Anchorpoint 是否另有未公开或特定合同下的完整治理审计/版权处理功能。
- Eagle 两篇帮助文章正文涉及的当前具体规则。
- 本项目目标用户对三十天或更短窗口、异议冻结及管理者最终权限的真实偏好。

本次没有联系厂商、创建商业账号、提交举报或执行产品内删除。若后续进行实测，应使用自有测试资产，分别记录软删除、提前永久删除、恢复和日志的实际结果。
