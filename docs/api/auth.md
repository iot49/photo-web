# Authentication API Reference

The Authentication API provides user authentication via Firebase and role-based authorization for all Photo Web services.

## Base URL

```
https://${ROOT_DOMAIN}/auth
```

## Authentication

Most endpoints require authentication via session cookies. Public endpoints are marked as such.

## Endpoints

### Authentication Endpoints

#### POST `/login`

Authenticate user with Firebase ID token and create session.

**Access**: Public

**Request Body:**
```json
{
  "firebase_token": "string"
}
```

**Parameters:**
- `firebase_token` (string, required): Valid Firebase ID token from client authentication

**Response (200 OK):**
```json
{
  "success": true,
  "user": {
    "id": "firebase-uid-123",
    "email": "user@example.com",
    "name": "John Doe",
    "roles": ["public", "protected"],
    "created_at": "2024-01-01T00:00:00Z",
    "last_login": "2024-01-15T10:30:00Z"
  }
}
```

**Side Effects:**
- Creates or updates user record in database
- Sets secure session cookie (`session_id`)
- Updates user's last login timestamp

**Error Responses:**
- `400 Bad Request`: Invalid or missing Firebase token
- `401 Unauthorized`: Firebase token verification failed
- `500 Internal Server Error`: Database or Firebase service error

**Example:**
```bash
curl -X POST https://dev49.org/auth/login \
  -H "Content-Type: application/json" \
  -d '{"firebase_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."}'
```

---

#### POST `/logout`

Terminate user session and clear authentication cookies.

**Access**: Authenticated users

**Request Body:** None

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

**Side Effects:**
- Removes session from database
- Clears session cookie
- Invalidates current authentication

**Example:**
```bash
curl -X POST https://dev49.org/auth/logout \
  -H "Cookie: session_id=your-session-cookie"
```

---

#### GET `/me`

Get current authenticated user information.

**Access**: Authenticated users

**Response (200 OK):**
```json
{
  "id": "firebase-uid-123",
  "email": "user@example.com",
  "name": "John Doe",
  "roles": ["public", "protected"],
  "created_at": "2024-01-01T00:00:00Z",
  "last_login": "2024-01-15T10:30:00Z"
}
```

**Error Responses:**
- `401 Unauthorized`: No valid session cookie
- `404 Not Found`: User not found in database

**Example:**
```bash
curl https://dev49.org/auth/me \
  -H "Cookie: session_id=your-session-cookie"
```

### Configuration Endpoints

#### GET `/firebase-config`

Get Firebase configuration for frontend authentication.

**Access**: Public

**Response (200 OK):**
```json
{
  "apiKey": "your-firebase-api-key",
  "authDomain": "your-project.firebaseapp.com",
  "projectId": "your-project-id",
  "storageBucket": "your-project.appspot.com",
  "messagingSenderId": "123456789",
  "appId": "1:123456789:web:abcdef123456"
}
```

**Example:**
```bash
curl https://dev49.org/auth/firebase-config
```

### Authorization Endpoints

#### GET `/authorize`

Internal endpoint for Traefik forward authentication.

**Access**: Internal (Traefik only)

**Headers:**
- `X-Original-URL`: Original request URL
- `X-Original-Method`: Original HTTP method
- `Cookie`: Session cookie

**Response (200 OK):**
```
Access granted
```

**Response Headers:**
- `X-User-Id`: Authenticated user ID
- `X-User-Email`: User email address
- `X-User-Roles`: Comma-separated list of user roles

**Error Responses:**
- `401 Unauthorized`: No valid session
- `403 Forbidden`: Access denied by authorization rules

**Authorization Flow:**
1. Extract session cookie from request
2. Validate session and get user information
3. Load authorization rules from `roles.csv`
4. Check if user roles allow access to requested path
5. Handle delegation to other services if configured
6. Return authorization decision

### Administrative Endpoints

#### GET `/users`

List all users in the system.

**Access**: Admin role required

**Query Parameters:**
- `limit` (integer, optional): Maximum number of users to return (default: 100)
- `offset` (integer, optional): Number of users to skip (default: 0)
- `search` (string, optional): Search users by email or name

**Response (200 OK):**
```json
{
  "users": [
    {
      "id": "firebase-uid-123",
      "email": "user@example.com",
      "name": "John Doe",
      "roles": ["public", "protected"],
      "created_at": "2024-01-01T00:00:00Z",
      "last_login": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 1,
  "limit": 100,
  "offset": 0
}
```

**Example:**
```bash
curl https://dev49.org/auth/users \
  -H "Cookie: session_id=admin-session-cookie"
```

---

#### GET `/users/{user_id}`

Get detailed information for a specific user.

**Access**: Admin role required

**Path Parameters:**
- `user_id` (string, required): Firebase UID of the user

**Response (200 OK):**
```json
{
  "id": "firebase-uid-123",
  "email": "user@example.com",
  "name": "John Doe",
  "roles": ["public", "protected"],
  "created_at": "2024-01-01T00:00:00Z",
  "last_login": "2024-01-15T10:30:00Z",
  "session_count": 2,
  "last_ip": "192.168.1.100"
}
```

**Error Responses:**
- `404 Not Found`: User not found

---

#### PUT `/users/{user_id}/roles`

Update user roles.

**Access**: Admin role required

**Path Parameters:**
- `user_id` (string, required): Firebase UID of the user

**Request Body:**
```json
{
  "roles": ["public", "protected", "private"]
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "user": {
    "id": "firebase-uid-123",
    "email": "user@example.com",
    "name": "John Doe",
    "roles": ["public", "protected", "private"],
    "updated_at": "2024-01-15T10:30:00Z"
  }
}
```

**Example:**
```bash
curl -X PUT https://dev49.org/auth/users/firebase-uid-123/roles \
  -H "Content-Type: application/json" \
  -H "Cookie: session_id=admin-session-cookie" \
  -d '{"roles": ["public", "protected", "private"]}'
```

### Health and Status Endpoints

#### GET `/health`

Basic service health check.

**Access**: Public

**Response (200 OK):**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "version": "1.0.0",
  "database": "connected",
  "firebase": "connected"
}
```

---

#### GET `/health/ready`

Readiness check for load balancer.

**Access**: Public

**Response (200 OK):**
```json
{
  "ready": true,
  "checks": {
    "database": "ok",
    "firebase": "ok",
    "roles_config": "ok"
  }
}
```

---

#### GET `/health/live`

Liveness check for container orchestration.

**Access**: Public

**Response (200 OK):**
```json
{
  "alive": true,
  "uptime": "2h 15m 30s"
}
```

## Data Models

### User Model

```json
{
  "id": "string",           // Firebase UID (primary key)
  "email": "string",        // User email address
  "name": "string",         // Display name
  "roles": ["string"],      // Array of assigned roles
  "created_at": "datetime", // Account creation timestamp
  "last_login": "datetime"  // Last successful login
}
```

### Session Model

```json
{
  "session_id": "string",   // Unique session identifier
  "user_id": "string",      // Associated user ID
  "created_at": "datetime", // Session creation time
  "expires_at": "datetime", // Session expiration time
  "ip_address": "string",   // Client IP address
  "user_agent": "string"    // Client user agent
}
```

## Error Handling

### Error Response Format

All error responses follow this format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {
      "field": "Additional error context"
    }
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_TOKEN` | 400 | Firebase token is invalid or malformed |
| `TOKEN_EXPIRED` | 401 | Firebase token has expired |
| `UNAUTHORIZED` | 401 | No valid session cookie provided |
| `FORBIDDEN` | 403 | User lacks required permissions |
| `USER_NOT_FOUND` | 404 | Requested user does not exist |
| `INVALID_ROLES` | 400 | Invalid role assignment attempted |
| `DATABASE_ERROR` | 500 | Database operation failed |
| `FIREBASE_ERROR` | 500 | Firebase service error |

## Rate Limiting

The authentication service implements rate limiting to prevent abuse:

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/login` | 5 requests | 1 minute |
| `/logout` | 10 requests | 1 minute |
| `/users` | 100 requests | 1 minute |
| Other endpoints | 1000 requests | 1 minute |

Rate limit headers are included in responses:

```
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 4
X-RateLimit-Reset: 1642248600
```

## Security Considerations

### Session Security

- **Secure Cookies**: All session cookies use `HttpOnly`, `Secure`, and `SameSite=Lax` attributes
- **Session Expiration**: Configurable expiration (default 30 days)
- **Session Rotation**: New session ID generated on login
- **Automatic Cleanup**: Expired sessions automatically removed

### Input Validation

- **Firebase Token**: Verified with Firebase Admin SDK
- **User Roles**: Validated against allowed role list
- **Request Size**: Limited to prevent DoS attacks
- **SQL Injection**: Prevented through parameterized queries

### Authorization Rules

Authorization is configured via `roles.csv` with the following format:

```csv
action,route_pattern,role,comment
allow,/,public,main entry point
allow,/ui*,public,user interface
allow,/auth/login*,public,login endpoints
deny,/admin/*,public,block admin access
allow,/admin/*,admin,admin interface
allow,/photos/api/albums/*,!photos:8000,delegate to photos service
```

Rules are processed in order, with the first match determining access.

## SDK and Client Libraries

### JavaScript/TypeScript

```typescript
// Example client usage
const authClient = new PhotoWebAuth('https://dev49.org/auth');

// Login with Firebase token
const user = await authClient.login(firebaseToken);

// Get current user
const currentUser = await authClient.getCurrentUser();

// Logout
await authClient.logout();
```

### Python

```python
# Example server-side usage
import requests

# Login
response = requests.post('https://dev49.org/auth/login', 
                        json={'firebase_token': token})
user = response.json()['user']

# Check authorization
response = requests.get('https://dev49.org/auth/authorize',
                       headers={'X-Original-URL': '/photos/api/albums'})
authorized = response.status_code == 200
```

This API provides secure, scalable authentication and authorization for the Photo Web application.