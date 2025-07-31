# Getting Started

This guide will help you set up a local development environment for Photo Web and get you up and running quickly.

## Prerequisites

Before you begin, ensure you have the following installed on your system:

### Required Software

- **Docker**: Version 20.0 or later
- **Docker Compose**: Version 2.0 or later
- **Node.js**: Version 18 or later (for frontend development)
- **Git**: For version control

### Verify Installation

```bash
# Check Docker installation
docker --version
# Expected: Docker version 20.x.x or later

# Check Docker Compose
docker-compose --version
# Expected: Docker Compose version 2.x.x or later

# Check Node.js
node --version
# Expected: v18.x.x or later

# Check npm
npm --version
# Expected: 8.x.x or later
```

## Initial Setup

### 1. Clone the Repository

```bash
# Navigate to your development directory
cd ~/Documents/iot

# Clone the repository (if not already done)
git clone <repository-url> photo-web
cd photo-web
```

### 2. Environment Configuration

Create your local environment configuration:

```bash
# Copy the example environment file
cp .env.example .env

# Edit the environment file
nano .env
```

**Required Environment Variables:**

```bash
# Domain Configuration
ROOT_DOMAIN=dev49.org

# Firebase Configuration
FIREBASE_PROJECT_ID=your-firebase-project-id
AUTH_COOKIE_EXPIRATION_DAYS=30

# Data Sources
PHOTOS_LIBRARY_PATH=/path/to/your/Photos Library.photoslibrary
DOCS_PATH=/path/to/your/documents

# Development Settings
DEBUG=true
LOG_LEVEL=DEBUG
```

### 3. DNS Configuration

Since Photo Web requires HTTPS with valid certificates, you must configure local DNS resolution:

```bash
# Add local domain to hosts file
echo "127.0.0.1 dev49.org" | sudo tee -a /etc/hosts

# Verify the entry
grep dev49.org /etc/hosts
```

!!! warning "HTTPS Requirement"
    Photo Web enforces HTTPS-only access. Requests to `localhost` or IP addresses will fail with certificate errors. The DNS configuration above is essential for local development.

### 4. Firebase Setup

#### Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or use an existing one
3. Enable Authentication with Google provider
4. Generate a service account key

#### Configure Firebase Credentials

```bash
# Create Firebase secrets directory
mkdir -p auth/firebase_secrets

# Create service account file
nano auth/firebase_secrets/service-account.json
```

Add your Firebase service account JSON:

```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "your-key-id",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com",
  "client_id": "your-client-id",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token"
}
```

### 5. Data Source Configuration

#### Apple Photos Library

```bash
# Find your Photos library (macOS)
find ~/Pictures -name "*.photoslibrary" -type d

# Update .env with the correct path
PHOTOS_LIBRARY_PATH=/Users/yourusername/Pictures/Photos Library.photoslibrary
```

#### Documents Directory

```bash
# Create a documents directory structure
mkdir -p ~/Documents/photo-web-docs/{Public,Protected,Private}

# Add some sample documents
echo "# Public Document" > ~/Documents/photo-web-docs/Public/readme.md
echo "# Protected Document" > ~/Documents/photo-web-docs/Protected/guide.md

# Update .env with the path
DOCS_PATH=/Users/yourusername/Documents/photo-web-docs
```

## Development Workflow

### Starting the Application

```bash
# Build and start all services
docker-compose up -d

# View logs from all services
docker-compose logs -f

# View logs from specific service
docker-compose logs -f auth
```

### Service Status Check

```mermaid
graph LR
    START[Start Services] --> CHECK{All Services Running?}
    CHECK -->|Yes| ACCESS[Access Application]
    CHECK -->|No| DEBUG[Check Logs]
    DEBUG --> FIX[Fix Issues]
    FIX --> START
    ACCESS --> DEV[Development Ready]
```

Verify all services are running:

```bash
# Check service status
docker-compose ps

# Expected output:
# NAME                COMMAND                  SERVICE             STATUS
# photo-web-auth-1    "uvicorn app.main:ap…"   auth                Up
# photo-web-photos-1  "uvicorn app.main:ap…"   photos              Up
# photo-web-files-1     "uvicorn app.main:ap…"   files              Up
# photo-web-nginx-1   "/docker-entrypoint.…"   nginx               Up
# photo-web-traefik-1 "/entrypoint.sh trae…"   traefik             Up
```

### Accessing the Application

Once all services are running:

1. **Main Application**: https://dev49.org
2. **Auth API Docs**: https://dev49.org/auth/docs
3. **Photos API Docs**: https://dev49.org/photos/docs
4. **Files API Docs**: https://dev49.org/files/docs
5. **Traefik Dashboard**: https://dev49.org:8080 (if enabled)

### Frontend Development

For active frontend development:

```bash
# Navigate to UI directory
cd ui

# Install dependencies
npm install

# Start development server (optional)
npm run dev

# Build for production
npm run build

# The build output is automatically served by nginx
```

### Making Changes

#### Backend Changes

```bash
# After modifying Python code, restart the service
docker-compose restart auth

# Or rebuild if dependencies changed
docker-compose up -d --build auth
```

#### Frontend Changes

```bash
# Rebuild the frontend
cd ui && npm run build

# Changes are immediately available at https://dev49.org
```

## Development Tools

### Useful Commands

```bash
# Service Management
docker-compose up -d              # Start all services
docker-compose down               # Stop all services
docker-compose restart [service]  # Restart specific service
docker-compose logs [service]     # View service logs
docker-compose exec [service] bash # Access service shell

# Database Operations
docker-compose exec auth python -c "from app.database import init_db; init_db()"
docker-compose exec photos python -c "from app.read_db import reload_db; reload_db()"

# Health Checks
curl -k https://dev49.org/auth/health
curl -k https://dev49.org/photos/health
curl -k https://dev49.org/files/health
```

### Testing Access

Since direct localhost access is blocked, use these testing strategies:

#### 1. Docker Exec Method

```bash
# Test auth service internally
docker-compose exec auth curl http://localhost:8000/health

# Test photos service internally
docker-compose exec photos curl http://localhost:8000/api/albums
```

#### 2. Application Testing Endpoints

Add test endpoints to your services:

```python
# In your FastAPI app
@app.get("/test/status")
async def test_status():
    return {"status": "ok", "timestamp": datetime.now()}
```

#### 3. Browser Developer Tools

Use browser developer tools to:
- Monitor network requests
- Check authentication cookies
- Debug JavaScript errors
- Inspect API responses

## Troubleshooting

### Common Issues

#### 1. Certificate Errors

**Problem**: Browser shows certificate warnings

**Solution**:
```bash
# Verify DNS configuration
nslookup dev49.org
# Should return 127.0.0.1

# Check Traefik certificate generation
docker-compose logs traefik | grep -i cert
```

#### 2. Services Not Starting

**Problem**: Docker services fail to start

**Solution**:
```bash
# Check service logs
docker-compose logs [service-name]

# Common issues:
# - Port conflicts: Change ports in docker-compose.yml
# - Permission issues: Check file permissions
# - Missing dependencies: Rebuild containers
```

#### 3. Firebase Authentication Fails

**Problem**: Login doesn't work

**Solution**:
```bash
# Verify Firebase configuration
docker-compose exec auth python -c "
from app.firebase_util import test_connection
test_connection()
"

# Check environment variables
docker-compose exec auth env | grep FIREBASE
```

#### 4. Photos Library Not Accessible

**Problem**: Photos service can't read Apple Photos

**Solution**:
```bash
# Check library path and permissions
ls -la "/path/to/Photos Library.photoslibrary"

# Verify OSXPhotos installation
docker-compose exec photos python -c "import osxphotos; print('OSXPhotos OK')"
```

### Debug Mode

Enable debug mode for detailed logging:

```bash
# Set debug environment variables
echo "DEBUG=true" >> .env
echo "LOG_LEVEL=DEBUG" >> .env

# Restart services
docker-compose down && docker-compose up -d

# View detailed logs
docker-compose logs -f
```

### Performance Monitoring

Monitor resource usage during development:

```bash
# Check container resource usage
docker stats

# Monitor disk usage
docker system df

# Clean up unused resources
docker system prune
```

## Next Steps

Once you have the development environment running:

1. **Explore the API**: Visit the auto-generated API documentation
2. **Review the Code**: Familiarize yourself with the service architecture
3. **Run Tests**: Execute the test suite to ensure everything works
4. **Make Changes**: Start developing new features or fixing bugs
5. **Read Guidelines**: Review the [Development Guidelines](guidelines.md) for coding standards

## Getting Help

If you encounter issues:

1. **Check Logs**: Always start with `docker-compose logs [service]`
2. **Review Documentation**: Check the relevant service documentation
3. **Test Connectivity**: Use the testing strategies outlined above
4. **Verify Configuration**: Double-check environment variables and secrets

The development environment is designed to be as close to production as possible while remaining easy to work with locally.