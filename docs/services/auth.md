# Authentication Service

The Authentication Service is the security gateway for Photo Web, handling user authentication via Firebase and implementing role-based authorization for all system resources.

## Overview

- **Technology**: FastAPI with SQLite database
- **Port**: 8000 (internal Docker network)
- **External Access**: `https://${ROOT_DOMAIN}/auth/*`
- **API Documentation**: Available at `/auth/docs` and `/auth/redoc`

## Architecture

```mermaid
graph TB
    subgraph "External"
        USER[User Browser]
        FB[Firebase Auth]
    end
    
    subgraph "Auth Service"
        API[FastAPI Application]
        AUTH[Authorization Module]
        DB[SQLite Database]
        ROLES[roles.csv]
    end
    
    subgraph "Other Services"
        TRAEFIK[Traefik]
        PHOTOS[Photos Service]
        FILES[Doc Service]
    end
    
    USER --> API
    API --> FB
    API --> DB
    AUTH --> ROLES
    
    TRAEFIK -.->|Auth Requests| AUTH
    PHOTOS -.->|Delegation| AUTH
    FILES -.->|Delegation| AUTH
```

## Core Components

### Authentication Module (`firebase_util.py`)

Handles Firebase integration and token validation:

```python
async def verify_firebase_token(token: str) -> dict:
    """Verify Firebase ID token and return user info"""
    # Token verification logic
    # Returns user data: uid, email, name
```

### Authorization Module (`authorization.py`)

Implements role-based access control:

```python
def check_authorization(user_roles: List[str], path: str) -> bool:
    """Check if user roles allow access to path"""
    # Parse roles.csv
    # Apply first matching rule
    # Handle delegation to other services
```

### Database Models (`models.py`)

User and session data models:

```python
class User(BaseModel):
    id: str              # Firebase UID
    email: str           # User email
    name: str            # Display name
    roles: List[str]     # Assigned roles
    created_at: datetime
    last_login: datetime

class Session(BaseModel):
    session_id: str      # Unique session identifier
    user_id: str         # Associated user ID
    created_at: datetime
    expires_at: datetime
```

## API Documentation

The Authentication Service provides a comprehensive REST API for user authentication, session management, and authorization.

**📖 Complete API Documentation:** [https://${ROOT_DOMAIN}/auth/docs](https://${ROOT_DOMAIN}/auth/docs)

The interactive API documentation includes:

- **Complete endpoint reference** with request/response examples
- **Interactive testing** - try API calls directly from your browser
- **Authentication flows** with step-by-step examples
- **Error handling** documentation with all possible error codes
- **Data models** with complete schema definitions

### Key API Endpoints

| Endpoint | Method | Purpose | Access |
|----------|--------|---------|---------|
| `/login` | POST | User authentication with Firebase tokens | Public |
| `/logout` | POST | Session termination | Authenticated |
| `/me` | GET | Current user information | Authenticated |
| `/authorize` | GET | Internal Traefik authorization | Internal |
| `/users` | GET | List all users | Admin |
| `/users/{email}` | GET/PUT/DELETE | User management | Admin |
| `/firebase-config` | GET | Frontend Firebase configuration | Public |

### Quick Start

1. **Authentication**: Send Firebase ID token to `/login`
2. **Session**: Secure cookie automatically set for subsequent requests
3. **User Info**: Get current user details from `/me`
4. **Authorization**: All requests automatically authorized via Traefik

For detailed examples and testing, visit the [interactive API documentation](https://${ROOT_DOMAIN}/auth/docs).

## Role-Based Access Control

### Role Configuration (`roles.csv`)

The authorization system is configured via a CSV file with the following format:

```csv
action,route_pattern,role,comment
allow,/,public,main entry point
allow,/ui*,public,user interface
allow,/auth/login*,public,login page
allow,/photos/api/albums,public,public album list
allow,/photos/api/albums/*,!photos:8000,delegate to photos service
deny,/admin/*,public,block admin access
allow,/admin/*,admin,admin interface
```

### Authorization Flow

```mermaid
sequenceDiagram
    participant T as Traefik
    participant A as Auth Service
    participant S as Target Service
    
    T->>A: GET /auth/authorize
    Note over A: Extract session cookie
    A->>A: Validate session
    A->>A: Load user roles
    A->>A: Check roles.csv rules
    
    alt Rule: allow with role
        A->>T: 200 OK (Access granted)
    else Rule: deny
        A->>T: 403 Forbidden
    else Rule: delegate (!service:port)
        A->>S: Forward auth request
        S->>A: Authorization decision
        A->>T: Forward decision
    else No matching rule
        A->>T: 403 Forbidden (Default deny)
    end
```

### Delegation Model

Services can handle their own authorization by prefixing the role with `!service:port`:

```csv
allow,/photos/api/albums/*,!photos:8000,delegate album access
```

This forwards the authorization request to the photos service at port 8000.

## Database Schema

### Users Table

```sql
CREATE TABLE users (
    id TEXT PRIMARY KEY,           -- Firebase UID
    email TEXT UNIQUE NOT NULL,    -- User email
    name TEXT NOT NULL,            -- Display name
    roles TEXT NOT NULL,           -- JSON array of roles
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);
```

### Sessions Table

```sql
CREATE TABLE sessions (
    session_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users (id)
);
```

## Configuration

### Environment Variables

```bash
# Firebase Configuration
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY_ID=your-key-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@your-project.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=your-client-id
FIREBASE_AUTH_URI=https://accounts.google.com/o/oauth2/auth
FIREBASE_TOKEN_URI=https://oauth2.googleapis.com/token

# Session Configuration
AUTH_COOKIE_EXPIRATION_DAYS=30
SESSION_SECRET_KEY=your-secret-key

# Database
DATABASE_URL=sqlite:///./auth.db
```

### Security Configuration

- **Secure Cookies**: HttpOnly, Secure, SameSite=Lax
- **CORS**: Configured for frontend domain
- **Rate Limiting**: Implemented for login endpoints
- **Input Validation**: All inputs validated and sanitized

## Deployment

### Docker Configuration

```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app/ ./app/
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Health Checks

- **Health Endpoint**: `/health` - Basic service health
- **Ready Endpoint**: `/health/ready` - Database connectivity
- **Live Endpoint**: `/health/live` - Service responsiveness

## Monitoring

### Metrics

- **Authentication Rate**: Successful/failed login attempts
- **Session Duration**: Average session length
- **Authorization Decisions**: Allow/deny ratios
- **Response Times**: API endpoint performance

### Logging

```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "level": "INFO",
  "event": "user_login",
  "user_id": "firebase-uid-123",
  "email": "user@example.com",
  "ip_address": "192.168.1.100"
}
```

## Troubleshooting

### Common Issues

1. **Firebase Token Validation Fails**
   - Check Firebase project configuration
   - Verify service account credentials
   - Ensure system time is synchronized

2. **Authorization Rules Not Working**
   - Validate `roles.csv` syntax
   - Check rule order (first match wins)
   - Verify user roles assignment

3. **Session Cookie Issues**
   - Confirm HTTPS is enabled
   - Check cookie domain configuration
   - Verify session expiration settings

### Debug Commands

```bash
# Check service logs
docker-compose logs auth

# Validate roles.csv
docker-compose exec auth python -c "from app.authorization import load_roles; print(load_roles())"

# Test Firebase connection
docker-compose exec auth python -c "from app.firebase_util import test_connection; test_connection()"