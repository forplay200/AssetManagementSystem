# FYP Discussion Recommendations: Copyright Infringement, Deletion Governance and Audit Trails

Date: 2026-10-26 (Asia/Kuala_Lumpur)

Status: **Discussion draft for the project author, supervisor, moderator and subsequent agents. Not all rules have been confirmed, and this proposal has not been implemented.** Do not describe these recommendations as existing system capabilities. This document does not authorise changes to application code or the introduction of additional administrator privileges.

Language: English translation of the [Chinese version](fyp-copyright-deletion-audit-recommendations.md).

Related agreed objective: [Video Asset Support Scope](video-asset-support-scope-plan.md) (Chinese). The relevant terms are **copyright infringement** and **audit trail**.

## 1. Core Recommendations

1. The platform cannot guarantee the elimination of infringement, but it should provide prevention, complaint response and traceability mechanisms. Terms and Conditions do not automatically establish exemption from liability.
2. A recycle bin provides a recovery window; an audit trail records actions; approval and objection rules determine who can authorise permanent deletion. These mechanisms serve different purposes and cannot replace one another.
3. For ordinary deletion, use soft deletion, notification and a retention period. If a Manager is to be protected when objecting to an Owner's deletion, define how deletion is put on hold and how the objection is resolved.
4. “Deletion requires the Manager's explicit approval” and “deletion proceeds automatically after several days without a response” are different policies. The latter is a notification and objection window. Silence must not be recorded as consent.
5. Handle access restrictions related to suspected infringement separately from ordinary recycle-bin restoration. The Restore action must not make restricted content accessible again.

## 2. Verified Current Behaviour and Gaps

When preparing the Chinese source document, the `deleteAsset` function in `backend/src/controllers/assetsController.js` was inspected. After checking deletion permission, it removes the object files associated with the asset and its versions, then deletes the version and Asset records. This path does not provide the recycle-bin retention window proposed here.

The inspection of `backend/src/models/asset.js` did not identify the recycle-bin state fields proposed in this document. This is not a claim that every logging or operational capability in the repository has been audited. It establishes only that the inspected asset-deletion path does not support a claim of recoverable deletion.

The current permission baseline is:

- An Owner may manage any Asset in the current Workspace.
- A Manager may modify or delete only Assets they originally uploaded. The existing exception for managing the shared vocabulary remains in place.
- Collaborator download restrictions are marked as implemented in the relevant handoff document. Preview and commenting remain available.
- The existing System Administrator role does not automatically grant access to assets in every Workspace.

Adopting deletion protection would introduce procedural restrictions on an Owner's ability to perform irreversible deletion. Other asset-editing permissions should not be changed incidentally.

## 3. Copyright Infringement: Defining the System's Responsibilities

### 3.1 Distinguish Application Roles from Legal Rights

| Concept | Interpretation in this system |
| --- | --- |
| Workspace Owner | An administrative role in the application; it does not automatically establish copyright ownership |
| Asset uploader | The person who uploaded the asset; not necessarily its author or copyright holder |
| Copyright holder / licensor | A rights-related status that must be assessed using authorisations, contracts and applicable rules |
| AI visual tags | Descriptive assistance, not certification of permission or a finding of infringement |

A gameplay recording created by a user may still contain third-party music, images or models. Source and permission records should accommodate these different components. “I recorded it” must not automatically be treated as evidence that all included content is authorised.

### 3.2 Recommended Preventive Measures

- Upload declaration: ask users to confirm that they have permission to store the file in the Workspace, provide access to its members and process it for the project's stated purposes. Asking only whether the work is original is insufficient.
- Source metadata: record the source type, declared author or rights holder, source link, licence name and version, permitted uses, attribution requirements and necessary evidence of permission.
- Label unchecked statements as “user-declared” or “unverified”. Do not present them as “legality verified by the platform”.
- Explain the purpose of AI content analysis. The project intends to run inference to generate tags; it should not imply that user assets will be used to train models. Implementation and policy must remain consistent.
- Enforce Workspace access and download permissions on the backend. While previews remain available, hiding download buttons must not be described as preventing copying or infringement.
- Use self-created assets, explicitly authorised assets or assets whose licences permit the intended demonstration and evaluation uses. Retain the necessary source information.

Terms should explain permitted uses, prohibit unauthorised uploads, describe complaint handling and access-restriction/deletion procedures, and provide an appeal channel. They should not claim that all responsibility belongs to users and the platform therefore has none.

### 3.3 Recommended Complaint-Handling Process

```text
Complaint or notice reaches the designated contact channel
  → Record the asset concerned, grounds, time and case reference
  → Designated personnel review it and determine access restrictions
    under the applicable procedure
  → Notify the uploader and allow evidence of permission or an appeal
  → Restore access or take action on the content according to the outcome
  → Retain necessary handling records under appropriate access controls
```

- External rights holders may not be Workspace members. The complaint channel must therefore not be available only after signing in.
- Do not disclose an entire private Workspace to a complainant. Accept the asset-identifying information and evidence of rights they can provide.
- Restricting access is not the same as immediately destroying evidence. Define what is retained, who may access it and for how long. Do not retain every original file indefinitely.
- A complaint contact and handling responsibility must be assigned at the platform-operation level. This responsibility has not yet been defined. Do not automatically grant the existing System Administrator unrestricted asset access, or make an Owner who is the subject of a complaint the sole decision-maker.
- A simple web form or manually maintained case register could fit an initial FYP scope. However, without actual access restrictions and recorded outcomes, it must not be presented during the defence as a complete takedown system.
- Do not use the proposed seven-day recycle-bin retention period to determine response deadlines for statutory notices.

### 3.4 Limits on the Use of Legal References

The version of the *Copyright Act 1987* published by MyIPO is labelled as at 30 June 2022. Part VIB addresses limitations of service-provider liability. Section 43G concerns complaint contact information, while section 43H addresses notices, removal or disabling of access, and counter-notification procedures. These provisions illustrate why user terms alone cannot establish automatic exemption from liability. [MyIPO Act text](https://www.myipo.gov.my/wp-content/uploads/2025/02/Lampiran-A1-ENG-Akta-Hak-Cipta-setakat-22-Jun-2023.pdf)

This document proposes risk-control measures for an FYP; it does not determine that the project qualifies for a particular legal protection. Before operating the service, verify the applicable law, the text then in force and the relevant facts. A webpage or file publication date must not be treated as the date of a legal amendment. The project's internal complaint process also cannot substitute for applicable statutory procedures.

## 4. Deletion Governance: Refining the Original Proposal

### 4.1 Basic Recycle-Bin Design

1. Replace Delete with Move to recycle bin. The confirmation should explain the impact, retention period and restoration process.
2. An Owner may soft-delete any asset in the current Workspace. A Manager may soft-delete their own uploaded assets.
3. Remove the asset from ordinary listings, search results and normal content-access paths. Preserve the files, historical versions, associated metadata and other data needed for recovery.
4. Require a reason when an Owner deletes another uploader's asset, and persist a notification addressed to the original uploader.
5. Seven days is a candidate retention period; the duration remains undecided. This is not a legal deadline or a duration already selected by the user.
6. An ordinary, unrestricted and undisputed asset may be restored by an Owner or by its original uploader if that uploader still has permission to manage it. Record the restoration as well.
7. For the first version, prohibit manual permanent deletion during the retention period to avoid an immediate-deletion bypass. If early permanent deletion is introduced later, define its permissions, informed confirmation and audit requirements separately.
8. A background job may permanently remove the asset after expiry only when there is no hold or dispute and all applicable conditions are satisfied.

This basic design can reduce losses from accidental deletion. By itself, it does not guarantee that a Manager can veto an Owner's deletion.

### 4.2 Protecting a Manager's Objection: Introduce a Disputed State

The original proposal seeks to reduce the impact of an Owner unilaterally deleting another person's assets. Express that protection as follows:

> An Owner may move an asset to the recycle bin but cannot immediately remove it irreversibly. The original uploader may object during the protection window. An objection pauses automatic permanent deletion until the defined resolution process produces an outcome.

Suggested states:

```text
Active → Trashed → Purging → Purged
             ↓
          Disputed
             ↓
    Restore or reschedule permanent deletion after explicit resolution

Trashed → Active: only where ordinary restoration is permitted
```

- No response is not consent. The reason for automatic deletion should be `retention_expired_without_objection`, not a fabricated `approved_by_uploader` event.
- Once an objection is received, pause scheduled permanent deletion. An Owner must not unilaterally remove a dispute hold concerning their own deletion action.
- An independent adjudication role has not been defined. An initial FYP design could require agreement between both parties; otherwise, retain the hold and report the unresolved status. The storage burden and possibility of long-running disputes must be acknowledged as limitations.
- If a binding final decision is required, separately define a neutral decision-maker, their permissions and the appeal rules. An implementing agent must not assign this authority to the existing System Administrator without authorisation.
- If permanent deletion is still intended after a hold is lifted, issue a new notification and provide a clearly defined response window. Do not delete immediately merely because the original deadline has passed.
- Ordinary restoration is available only while the user retains the relevant management permission. Assets subject to infringement restrictions, preservation requirements or dispute handling must follow their dedicated process; the general Restore action must not bypass it.

### 4.3 Bypass Scenarios a Moderator May Raise

- **An Owner removes or demotes a Manager before waiting for deletion:** membership changes must not count as consent or cancel an existing objection. If an uploader loses the ability to respond while deletion of their asset is pending, pause automatic deletion and route the case through an explicit handling process.
- **An Owner deletes the entire Workspace:** Workspace deletion must not bypass asset protection periods, dispute/complaint restrictions or audit-record retention.
- **The original uploader deletes their account, leaves or is deactivated:** do not restore their access to Workspace content. Define a separate appeal or manual-handling route for pending cases instead of assuming they can still use an in-app action.
- **An Owner repeatedly deletes and a Manager repeatedly restores:** record each state change and allow escalation to dispute handling. Repeatedly resetting the retention period does not resolve the underlying issue.
- **Notification fails or the user does not sign in:** distinguish notification creation in the inbox, delivery and reading. If a persistent notification cannot be created, the recommendation is not to start automatic deletion. Successful creation does not establish that it was read or accepted.
- **An Owner changes the retention period:** shortening a Workspace setting must not bring forward permanent deletion of assets already within a protection window.
- **Someone has database or server privileges:** application permissions cannot guarantee protection against these privileged actions. Additional operational controls are required; do not claim complete tamper resistance.

Only when these paths are also constrained is it appropriate to claim that an Owner is prevented from bypassing the protection window. Otherwise, describe the benefit more narrowly as reducing accidental deletion and improving traceability.

## 5. Audit Trails: What to Record and What Not to Claim

The Dashboard is a presentation layer for records. The backend should generate independent events when business actions occur. Frontend success messages and browser logs are insufficient.

Each event should include:

| Field | Purpose |
| --- | --- |
| eventId, request/correlationId | Identify the event and correlate repeated requests or background tasks |
| serverTime (UTC) | Record when the event occurred on the server; display it in the user's local time zone |
| actorId, actorRoleSnapshot, actorType | Distinguish users from system tasks and preserve the role at the time |
| workspaceId, assetId, assetNameSnapshot, versionId where applicable | Keep the affected object identifiable after renaming or deletion |
| action, reason, outcome | Distinguish soft deletion, restoration, purge requests, success, failure and denial |
| beforeState, afterState, scheduledPurgeAt where applicable | Explain state transitions and scheduled deadlines |

The recommended minimum event scope covers soft deletion, restoration, notification creation, objections and their resolution, permanent-deletion requests/completion/failure, and relevant membership or permission changes. Tag, metadata, version and name changes can be added according to the research scope.

Design requirements:

- Workspace Owners and Managers must not be able to modify or delete these events through application APIs. Ordinary users may read only records within their authorised scope.
- Audit events must not be cascade-deleted through Asset or Workspace foreign keys. Keep limited name snapshots rather than unnecessary copies of sensitive content.
- Record a background deletion task as a system actor and link it to the original initiator. Do not present its execution time as the time when the Owner clicked Delete.
- Where possible, write asset state changes and required audit/pending-notification records in the same database transaction, preventing deletion from succeeding without a record.
- Do not assume object-storage removal and database changes form one atomic transaction. Use a retryable Purging state, and record Purged only after all targeted objects have been removed.
- Include the current file, all versions, video thumbnails/sampled frames and other derived objects in cleanup. Avoid deleting shared objects that remain referenced elsewhere.
- Define separate retention and access policies for audit records. Keeping an audit summary does not require keeping the deleted original file forever.
- Do not place passwords, tokens, signed download links, complete permission documents or sensitive complainant information in the ordinary Dashboard.
- Appending events at the application layer and restricting APIs does not make database administrators unable to alter records. Stronger requirements would need separate evaluation of independent log storage, separation of privileges and tamper detection.

OWASP recommends that logs identify when, where, who and what, protect records against unauthorised modification and deletion, and exclude sensitive information such as credentials. The specific events and state machine above are project-specific design recommendations. [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)

## 6. Coordinating Infringement Restrictions with the Recycle Bin

Represent content-access restrictions separately from the file lifecycle. A single deleted boolean should not carry every meaning:

- Lifecycle: Active / Trashed / Disputed / Purging / Purged.
- Access restriction: normal / restricted during complaint handling / another authorised restriction.
- Purge hold: whether permanent deletion is blocked, the reason, who applied it and its review status.

These are conceptual fields, not an approved database migration.

For example, after a complaint, an asset may remain stored while ordinary preview and download access is restricted. Restoring it from the recycle bin must not automatically remove that restriction. If the original video is restricted, access to historical versions and derived content such as thumbnails and sampled frames must also be checked.

Handle internal retention periods separately from complaint procedures. Automatic deletion must not destroy evidence awaiting handling, but a dispute must not become a justification for retaining all content indefinitely either. Define responsibility for review, retention and disposal.

## 7. Recommended FYP Priorities and Acceptance Checks

### Phase 1: Recommended Initial Priorities

- Upload permission declarations and source/licence metadata.
- A clear complaint contact channel and assigned responsibility, with at least case registration and status tracking.
- Ordinary soft deletion, recycle bin, restoration, persistent notifications and retention periods.
- Independent audit events and a history view in the Dashboard or asset details.
- Separation between infringement-related access restrictions and ordinary restoration.

### Phase 2: Required for Stronger Claims of Manager Protection

- Objection holds and a resolution process involving both parties.
- Controls against bypass through membership removal, Workspace deletion and retention-period changes.
- Appeals after loss of membership and a process for unresolved disputes.

Without Phase 2, do not promise during the defence that a Manager can prevent an Owner from permanently deleting an asset.

### Essential Verification Examples

1. After an Owner deletes a Manager's asset, the file and historical versions remain recoverable during the protection period, subject to permissions.
2. A deleted asset is not still ordinarily accessible through old URLs, version endpoints or derived-preview paths outside the normal listings.
3. A Manager cannot manage another Manager's assets, and Collaborator download restrictions remain effective.
4. If objections are implemented, neither the cleanup job nor an Owner's manual path can permanently delete an asset while its hold is active.
5. Demoting/removing the uploader, deleting the Workspace or shortening the period cannot bypass the stated protection.
6. Partial object-removal failure remains visible as incomplete and retryable; it must not generate a false successful-deletion audit event.
7. Renamed or deleted assets still have understandable event records, without cross-Workspace disclosure.
8. Ordinary restoration cannot lift complaint-related restrictions. Notification failure and long periods without sign-in have defined outcomes.

## 8. Suggested Answers for Supervisor or Moderator Questions

Use “I plan to” or “the proposed design” for capabilities that have not been implemented. Change this to “the system already provides” only after implementation and verification.

### Q1: What happens if a user uploads infringing content?

> I cannot guarantee that every uploaded asset is free from infringement, and I would not claim that user terms alone exempt the platform from liability. I plan to combine upload permission declarations, source and licence records, Workspace access controls, and a complaint review and access-restriction process to reduce the risk. AI tagging helps describe and retrieve content; it does not establish copyright ownership. Permission issues that the system cannot verify automatically will require human handling and an appeal channel.

### Q2: What if an Owner unilaterally deletes an asset uploaded by a Manager?

> The current deletion process still directly removes files, so I am proposing a recycle-bin design. An Owner's deletion would first become a recoverable soft deletion, with notification to the uploader and a record of the reason and time. If objection protection is added, an uploader's objection would pause permanent deletion. This reduces the risk of immediate asset loss and creates a traceable record. It does not mean that the uploader automatically owns the copyright or that the system can resolve every team dispute.

### Q3: Does deletion require the Manager's approval, or does it happen automatically after several days?

> Those are different policies. If automatic deletion after expiry is adopted, I will describe it as a notification and objection window: deletion proceeds according to the stated schedule only when there is no objection, and silence is not recorded as consent. If explicit approval is mandatory, a timeout cannot substitute for that approval. I currently favour evaluating the first approach, together with objection holds and clear resolution rules.

### Q4: Can Dashboard records prevent abuse?

> The Dashboard provides visibility. The actual records should be generated on the backend and retained independently. Audit logs provide accountability, the recycle bin supports recovery, and permissions and hold rules constrain actions. Each addresses a different part of the problem. I would not claim that logging alone prevents every deletion or protects against someone with database-administrator privileges.

### Q5: Does this weaken the Owner's authority?

> It adds procedural safeguards to irreversible actions. The Owner still manages the Workspace, but deleting another uploader's asset requires a reason, notification and a recovery window. If objections are supported, disputes must also follow the agreed process. An administrative role in the application is separate from copyright ownership.

### Q6: Why not wait for the Manager's approval before restricting allegedly infringing content?

> Ordinary team deletion and infringement complaint handling need separate procedures. Access restrictions should follow clearly assigned responsibility and the applicable process; ordinary deletion approval must not delay them. Whether the file is retained and whether access may be restored are governed by separate handling and retention rules.

## 9. Policy Decisions Still Required

This section records open decisions. It does not require the current task to pause while awaiting answers:

- The retention-period length and notification rules.
- Whether to implement the basic recycle bin first or include objection holds at the same time.
- Who handles unresolved disputes, their permissions, time limits and the outcome when agreement cannot be reached.
- An appeal route after the uploader leaves or is removed.
- Who handles complaints and what limited access that responsibility requires.
- Who may view audit and complaint records, their retention periods and disposal rules.
- Whether early permanent deletion may be needed later, and the conditions preventing it from bypassing protection.

The next step is to confirm these product rules before preparing a detailed implementation handoff, state transitions and permission tests. Candidate values and role arrangements in this proposal must not be treated as final policies already approved by the user.
