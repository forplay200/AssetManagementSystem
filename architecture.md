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

Roles:
- Administrator
- Developer
- Designer
- Collaborator

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
