# AI-Enhanced Collaborative Digital Asset Management Platform

A web-based platform for managing digital assets with AI-assisted tagging, version control, and role-based access control.

## Features

- User authentication (JWT-based)
- Role-based access control (Admin, Developer, Designer, Collaborator)
- Asset upload/download with validation for images, audio, 3D models, scripts, and data files
- AI-powered auto-tagging:
  - Image tagging using CLIP
  - Text tagging using KeyBERT
  - Audio classification using YAMNet and transcription via Whisper
  - 3D model metadata extraction
- Advanced search and filtering by filename, metadata, tags, type, date, creator
- Version management with change logs
- Collaboration through comments and replies
- Dashboard with analytics and recent activity
- RESTful API with Swagger/OpenAPI documentation
- Dockerized deployment with PostgreSQL, MinIO, and Redis

## Architecture

The system follows a microservices-inspired architecture:

- **Frontend**: React.js with React Router and Axios
- **Backend**: Node.js with Express.js, JWT authentication, Sequelize ORM
- **AI Service**: Python FastAPI with ML models (CLIP, KeyBERT, YAMNet, Whisper)
- **Database**: PostgreSQL for relational data
- **Object Storage**: MinIO S3-compatible storage for binary assets
- **Caching/Queue**: Redis for job queuing
- **Communication**: REST APIs over HTTP/HTTPS

## Prerequisites

- Node.js (v18+)
- Python (v3.11+)
- Docker and Docker Compose (optional for containerized setup)
- Git

## Setup

### 1. Clone the repository

`ash
git clone <repository-url>
cd AssetManagementSystem
`

### 2. Environment Setup

Copy the example environment file and configure it:

`ash
cp .env.example .env
# Edit .env to set your secrets and configuration
`

### 3. Install Dependencies

#### Backend
`ash
cd backend
npm install
`

#### AI Service
`ash
cd ../ai-service
pip install -r requirements.txt
`

#### Frontend
`ash
cd ../frontend
npm install
`

### 4. Start the Services

#### Option A: Using Docker Compose (recommended for development)
`ash
cd ..
docker-compose up --build
`

#### Option B: Manual Start
1. Start the backend:
   `ash
   cd backend
   npm start
   `
2. Start the AI service:
   `ash
   cd ../ai-service
   uvicorn app.main:app --reload
   `
3. Start the frontend:
   `ash
   cd ../frontend
   npm start
   `

### 5. Access the Application

- Frontend: http://localhost:3000
- Backend API: http://localhost:3000/api
- API Documentation: http://localhost:3000/api-docs
- AI Service: http://localhost:8000

## API Documentation

Once the backend is running, visit http://localhost:3000/api-docs to view the interactive Swagger UI with all available endpoints.

## Usage

1. Register a new account or log in with existing credentials.
2. Upload assets through the interface.
3. View AI-generated tags and edit them as needed.
4. Organize assets with folders/categories (if implemented).
5. Collaborate by leaving comments on assets.
6. View version history and revert to previous versions if needed.
7. Use the search bar to find assets quickly.

## Contributing

1. Fork the repository
2. Create a feature branch (git checkout -b feature/amazing-feature)
3. Commit your changes (git commit -m 'Add amazing feature')
4. Push to the branch (git push origin feature/amazing-feature)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
