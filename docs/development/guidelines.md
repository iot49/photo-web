# Development Guidelines

This document outlines the coding standards, best practices, and development workflow for Photo Web.

## Project Structure

All project files are located in `/Users/boser/Documents/iot/photo-web` with the following organization:

```
photo-web/
├── auth/                    # Authentication service
│   ├── app/                # FastAPI application
│   ├── Dockerfile          # Container configuration
│   └── requirements.txt    # Python dependencies
├── photos/                 # Photos service
│   ├── app/                # FastAPI application
│   ├── Dockerfile          # Container configuration
│   └── requirements.txt    # Python dependencies
├── files/                 # Files service
│   ├── app/                # FastAPI application
│   ├── Dockerfile          # Container configuration
│   └── requirements.txt    # Python dependencies
├── ui/                     # Frontend application
│   ├── src/                # TypeScript source code
│   ├── package.json        # Node.js dependencies
│   └── vite.config.ts      # Build configuration
├── nginx/                  # Static file server
├── traefik/               # Reverse proxy configuration
├── docker-compose.yml     # Service orchestration
└── .env                   # Environment variables
```

## Coding Standards

### General Principles

1. **DRY (Don't Repeat Yourself)**: Refactor code to eliminate duplication when adding features
2. **Concise Documentation**: Document work with brief, clear descriptions
3. **File Length Limit**: Keep code files under 120 lines; create new files as needed
4. **Security First**: Never commit secrets to version control

### Code Organization

#### Backend Services (Python/FastAPI)

```python
# File structure for each service
app/
├── __init__.py
├── main.py              # FastAPI application entry point
├── models.py            # Data models and schemas
├── database.py          # Database connection and operations
├── api/                 # API route modules
│   ├── __init__.py
│   ├── users.py         # User-related endpoints
│   └── login.py         # Authentication endpoints
└── utils/               # Utility functions
    ├── __init__.py
    └── helpers.py
```

**Example Service Structure:**

```python
# main.py - Keep under 120 lines
from fastapi import FastAPI
from .api import users, login
from .database import init_db

app = FastAPI(title="Auth Service")

@app.on_event("startup")
async def startup():
    await init_db()

app.include_router(users.router, prefix="/api")
app.include_router(login.router, prefix="/api")
```

#### Frontend (TypeScript/LitElement)

```typescript
// Component structure
src/
├── index.ts             # Application entry point
├── pw-main.ts           # Main application component
├── pw-nav-page.ts       # Navigation and layout
├── pw-album-browser.ts  # Photo album interface
├── pw-files-browser.ts  # Files browser
├── app/                 # Application logic
│   ├── api.ts           # API client
│   ├── context.ts       # Application context
│   ├── interfaces.ts    # TypeScript interfaces
│   └── utilities.ts     # Helper functions
└── tests/               # Test files
    └── auth-photos-files.ts
```

**Component Example:**

```typescript
// pw-album-browser.ts - Keep focused and under 120 lines
import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('pw-album-browser')
export class AlbumBrowser extends LitElement {
  @property({ type: Array }) albums = [];

  static styles = css`
    /* Component styles */
  `;

  render() {
    return html`
      <!-- Component template -->
    `;
  }
}
```

## Configuration Management

### Secrets and Configuration

**Critical Rule**: Never copy configuration or secrets into code files. Always reference the source.

#### Environment Variables (`.env`)

```bash
# Domain Configuration
ROOT_DOMAIN=dev49.org

# Authentication
FIREBASE_PROJECT_ID=your-project-id
AUTH_COOKIE_EXPIRATION_DAYS=30

# Services
PHOTOS_LIBRARY_PATH=/path/to/Photos Library.photoslibrary
FILES_PATH=/path/to/documents
```

#### Firebase Secrets (`auth/firebase_secrets`)

Store Firebase service account credentials separately:

```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "key-id",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...",
  "client_email": "firebase-adminsdk@project.iam.gserviceaccount.com"
}
```

#### Authorization Rules (`auth/app/roles.csv`)

```csv
action,route_pattern,role,comment
allow,/,public,main entry point
allow,/ui*,public,user interface
allow,/photos/api/albums,public,public album list
allow,/photos/api/albums/*,!photos:8000,delegate to photos service
```

### Configuration Access Pattern

```python
# ✅ Correct: Reference configuration source
import os
from pathlib import Path

def load_firebase_config():
    """Load Firebase configuration from secrets file"""
    secrets_path = Path("firebase_secrets")
    with open(secrets_path) as f:
        return json.load(f)

# ❌ Incorrect: Hardcoded configuration
FIREBASE_CONFIG = {
    "project_id": "hardcoded-project-id",  # Never do this!
    "private_key": "hardcoded-key"
}
```

## Development Workflow

### Local Development Setup

1. **Prerequisites**:
   ```bash
   # Required tools
   docker --version
   docker-compose --version
   node --version  # For UI development
   ```

2. **Environment Setup**:
   ```bash
   # Clone and configure
   cd /Users/boser/Documents/iot/photo-web
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **DNS Configuration**:
   ```bash
   # Add to /etc/hosts (required for HTTPS)
   echo "127.0.0.1 dev49.org" | sudo tee -a /etc/hosts
   ```

4. **Start Services**:
   ```bash
   # Build and start all services
   docker-compose up -d
   
   # View logs
   docker-compose logs -f
   ```

5. **Frontend Development**:
   ```bash
   # Rebuild frontend after changes
   cd ui && npm run build
   
   # Access application
   open https://dev49.org
   ```

### Development Commands

```bash
# Service Management
docker-compose up -d              # Start all services
docker-compose down               # Stop all services
docker-compose restart [service]  # Restart specific service
docker-compose logs [service]     # View service logs

# Frontend Development
cd ui
npm install                       # Install dependencies
npm run dev                       # Development server
npm run build                     # Production build
npm run test                      # Run tests

# Database Operations
docker-compose exec auth python -c "from app.database import init_db; init_db()"
docker-compose exec photos python -c "from app.read_db import reload_db; reload_db()"
```

## Testing Strategy

### Backend Testing

```python
# test_auth.py
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_login_endpoint():
    """Test user login functionality"""
    response = client.post("/auth/login", json={
        "firebase_token": "test-token"
    })
    assert response.status_code == 200

def test_authorization():
    """Test role-based authorization"""
    # Test implementation
    pass
```

### Frontend Testing

```typescript
// auth-photos-files.ts
import { expect } from '@esm-bundle/chai';
import './pw-main.js';

describe('Photo Web Application', () => {
  it('should load main component', () => {
    const element = document.createElement('pw-main');
    expect(element).to.exist;
  });

  it('should handle authentication', async () => {
    // Test authentication flow
  });
});
```

### Testing Access Patterns

Since the application requires HTTPS with valid certificates, testing strategies include:

1. **Docker Exec Access**:
   ```bash
   docker-compose exec auth curl http://localhost:8000/health
   ```

2. **Application Testing Code**:
   ```python
   # Add to service for testing
   @app.get("/test/health")
   async def test_health():
       return {"status": "ok", "timestamp": datetime.now()}
   ```

3. **Test Containers**:
   ```yaml
   # docker-compose.test.yml
   test-runner:
     build: ./tests
     depends_on:
       - auth
       - photos
     command: pytest -v
   ```

## Code Quality

### Linting and Formatting

#### Python (Backend)

```bash
# Install development tools
pip install black flake8 mypy

# Format code
black app/

# Lint code
flake8 app/

# Type checking
mypy app/
```

#### TypeScript (Frontend)

```bash
# Install development tools
npm install --save-dev eslint prettier @typescript-eslint/parser

# Format code
npm run format

# Lint code
npm run lint
```

### Pre-commit Hooks

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/psf/black
    rev: 22.3.0
    hooks:
      - id: black
        language_version: python3

  - repo: https://github.com/pycqa/flake8
    rev: 4.0.1
    hooks:
      - id: flake8

  - repo: https://github.com/pre-commit/mirrors-prettier
    rev: v2.6.2
    hooks:
      - id: prettier
        files: \.(ts|js|json|css|md)$
```

## Security Guidelines

### Development Security

1. **Environment Variables**: Use `.env` files, never hardcode secrets
2. **Git Ignore**: Ensure `.env` and secret files are in `.gitignore`
3. **Dependencies**: Regularly update dependencies for security patches
4. **Code Review**: Security-focused code reviews for all changes

### Secure Development Practices

```python
# ✅ Secure: Use environment variables
DATABASE_URL = os.getenv("DATABASE_URL")

# ✅ Secure: Validate inputs
@app.post("/api/users")
async def create_user(user: UserCreate):
    # Pydantic automatically validates input
    pass

# ❌ Insecure: SQL injection risk
def get_user(user_id: str):
    query = f"SELECT * FROM users WHERE id = '{user_id}'"  # Don't do this!
```

## Performance Guidelines

### Backend Performance

- **Database Connections**: Use connection pooling
- **Caching**: Implement appropriate caching strategies
- **Async Operations**: Use async/await for I/O operations
- **Resource Limits**: Set appropriate memory and CPU limits

### Frontend Performance

- **Lazy Loading**: Load components and data on demand
- **Image Optimization**: Use appropriate image sizes
- **Bundle Splitting**: Split code for optimal loading
- **Caching**: Leverage browser caching effectively

## Documentation Standards

### Code Documentation

```python
def process_image(image_path: str, size: int) -> bytes:
    """
    Process image to specified size.
    
    Args:
        image_path: Path to source image file
        size: Maximum dimension in pixels
        
    Returns:
        Processed image data as bytes
        
    Raises:
        ImageProcessingError: If image cannot be processed
    """
    pass
```

### API Documentation

Use FastAPI's automatic documentation features:

```python
@app.post("/api/login", response_model=LoginResponse)
async def login(credentials: LoginRequest):
    """
    Authenticate user with Firebase token.
    
    - **firebase_token**: Valid Firebase ID token
    - Returns user information and sets session cookie
    """
    pass
```

## Deployment Guidelines

### Production Checklist

- [ ] Environment variables configured
- [ ] Secrets properly secured
- [ ] HTTPS certificates valid
- [ ] Database backups configured
- [ ] Monitoring and logging enabled
- [ ] Resource limits set
- [ ] Health checks implemented

### Monitoring

```python
# Health check implementation
@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.now(),
        "version": os.getenv("APP_VERSION", "unknown")
    }
```

This ensures maintainable, secure, and performant code that follows Photo Web's architectural principles.