# Architecture Document

## 1. System Overview

The AI-Enhanced Collaborative Digital Asset Management Platform is a web-based solution for independent game developers and small development teams. The platform provides centralized asset storage, AI-assisted metadata generation, advanced search, version management, collaboration features, and secure Role-Based Access Control (RBAC).

## 2. High-Level Architecture

```text
React UI -> Express Backend -> PostgreSQL
                           -> MinIO Object Storage
                           -> Redis Queue -> FastAPI AI Worker
```

## 3. Frontend Architecture
- React.js
- React Router
- Axios
- Tailwind CSS

Responsibilities:
- Authentication
- Asset Management
- Search & Filtering
- Version History
- Comments
- Dashboard

## 4. Backend Architecture
- Node.js
- Express.js
- JWT Authentication

Responsibilities:
- RBAC
- Asset APIs
- Search APIs
- Version Control
- AI Job Creation

## 5. AI Processing Architecture
- FastAPI
- CLIP
- KeyBERT
- YAMNet
- Whisper

Workflow:
Upload -> MinIO -> Redis Job -> FastAPI Processing -> PostgreSQL Metadata

## 6. Storage Architecture
### PostgreSQL
- Users
- Teams
- Team Memberships
- Roles
- Assets
- Versions
- Comments
- Tags

### MinIO
- Images
- Audio
- Scripts
- 3D Models

## 7. Security Architecture
- JWT Authentication
- Password Hashing
- RBAC Authorization

Workspace roles:
- Owner
- Manager
- Collaborator

Account lifecycle:
- A newly registered User has no repository access until they create or join a team.
- Team membership roles are independent from account identity.
- Legacy Administrator, Developer, and Designer account roles remain supported during migration; Developer and Designer map to Manager capabilities.

Authorization context:
- JWT identifies the account.
- `X-Workspace-Id` selects an active workspace and is validated against membership on every protected request. `X-Team-Id` remains a temporary client compatibility alias.
- Newly uploaded assets store `workspaceId` and are visible only inside that workspace.
- Legacy assets without a reviewed workspace assignment are quarantined from user-facing repository APIs during migration.

## 8. Version Management
Each asset maintains version history with metadata snapshots.

## 9. Search Architecture
Search by:
- Filename
- Tags
- Description
- Creator
- Asset Type

## 10. Collaboration Architecture
- Asset Comments
- Replies
- Discussion History

## 11. Deployment Architecture
Docker Compose Services:
- React
- Express
- PostgreSQL
- FastAPI
- Redis
- MinIO

## 12. Architecture Principles
- Modularity
- Scalability
- Maintainability
- Security by Design
- Cloud Readiness
- Asynchronous Processing
