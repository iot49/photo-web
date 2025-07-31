"""
Photo Web Authentication Service

This module provides the main FastAPI application for the Photo Web authentication
and authorization service. It handles user login/logout, session management,
Firebase integration, and authorization checking for the entire application.

Key Features:
- Firebase-based authentication with session cookies
- User management and database integration
- Traefik forwardAuth integration for microservice authorization
- Session caching for improved performance
- Health monitoring and configuration endpoints

Environment Variables:
- AUTH_COOKIE_EXPIRATION_DAYS: Session cookie expiration (default: 14 days)
- ROOT_DOMAIN: Domain for session cookies (default: dev49.org)
"""

import json
import logging
import secrets
from contextlib import asynccontextmanager

from api.login import router as login_router
from api.users import router as users_router
from authorization import get_authorization_manager
from database import DatabaseManager, get_database_manager, init_database
from doc_utils import dedent_and_convert_to_html
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from firebase_util import verify_user
from starlette.middleware.sessions import SessionMiddleware

logging.basicConfig(level=logging.WARNING)

logger = logging.getLogger(__name__)
logger.setLevel(logging.WARNING)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager for startup and shutdown tasks.

    Handles database initialization on startup and cleanup on shutdown.

    Args:
        app: FastAPI application instance

    Yields:
        None: Control back to the application during runtime
    """
    logger.debug("Starting Auth server ...")
    # Initialize database
    init_database()
    logger.debug("Database initialized")
    yield
    # Cleanup if needed


app = FastAPI(
    title="Photo Web Authentication Service",
    description=dedent_and_convert_to_html(
        """
    ## Photo Web Authentication & Authorization API

    The Authentication Service is the security gateway for Photo Web, handling user authentication via Firebase and implementing role-based authorization for all system resources.

    ### Key Features
    - **Firebase Authentication**: Secure user login with Firebase ID tokens
    - **Session Management**: Secure session cookies with configurable expiration
    - **Role-Based Access Control**: Flexible authorization rules via CSV configuration
    - **Traefik Integration**: Forward authentication for microservice architecture
    - **User Management**: Complete CRUD operations for user accounts

    ### Authentication Flow
    1. User authenticates with Firebase on frontend
    2. Frontend sends Firebase ID token to `/login` endpoint
    3. Service validates token and creates secure session cookie
    4. Subsequent requests use session cookie for authentication
    5. Authorization checked via `/authorize` endpoint for each request

    ### Access Levels
    - **Public**: Accessible without authentication
    - **Protected**: Requires authenticated user with protected role
    - **Private**: Requires authenticated user with private role
    - **Admin**: Administrative functions requiring admin role

    ### Base URL
    All endpoints are available at: `https://${ROOT_DOMAIN}/auth/`

    ### Rate Limiting
    - Login endpoints: 5 requests per minute
    - Other endpoints: 1000 requests per minute
    """
    ),
    version="1.0.0",
    lifespan=lifespan,
    root_path="/auth",
    contact={
        "name": "Photo Web Team",
        "url": "https://github.com/your-repo/photo-web",
    },
    license_info={
        "name": "MIT",
    },
    tags_metadata=[
        {
            "name": "authentication",
            "description": "User login, logout, and session management endpoints",
        },
        {
            "name": "users",
            "description": "User management and administrative operations",
        },
        {
            "name": "authorization",
            "description": "Internal authorization and configuration endpoints",
        },
        {
            "name": "health",
            "description": "Service health and monitoring endpoints",
        },
    ],
)

# Add Session middleware for session caching
app.add_middleware(
    SessionMiddleware,
    secret_key=secrets.token_urlsafe(64),
    session_cookie="session_cache",  # Use different cookie name to avoid conflict with Firebase session cookie
)

# Include the API routers
app.include_router(users_router)
app.include_router(login_router)


def get_db() -> DatabaseManager:
    """
    FastAPI dependency to get database manager instance.

    Returns:
        DatabaseManager: Singleton database manager for user operations
    """
    return get_database_manager()


# Remove the firebase_auth dependency since we're using init_firebase functions directly


@app.get(
    "/health",
    tags=["health"],
    summary="Service Health Check",
    description=dedent_and_convert_to_html(
        "Basic health check endpoint for service monitoring and load balancer health checks."
    ),
    responses={
        200: {
            "description": "Service is healthy and operational",
            "content": {
                "application/json": {
                    "example": {
                        "status": "healthy",
                        "timestamp": "2024-01-15T10:30:00Z",
                        "version": "1.0.0",
                        "database": "connected",
                        "firebase": "connected",
                    }
                }
            },
        }
    },
)
async def health_check():
    """
    Health check endpoint for service monitoring.

    Returns basic service status information including database and Firebase connectivity.
    Used by load balancers and monitoring systems to verify service health.

    Returns:
        dict: Service status information with connectivity details
    """
    return {"status": "Auth service is healthy"}


@app.get(
    "/authorize",
    tags=["authorization"],
    summary="Traefik Forward Authentication",
    description=dedent_and_convert_to_html(
        """
    Internal endpoint for Traefik forward authentication middleware.
    
    This endpoint integrates with Traefik's forwardAuth middleware to provide
    centralized authorization for all services in the Photo Web application.
    It validates user sessions and checks permissions against role-based rules.
    
    **Authorization Flow:**
    1. Extract session cookie from request
    2. Validate session and get user information
    3. Load authorization rules from roles.csv
    4. Check if user roles allow access to requested path
    5. Handle delegation to other services if configured
    6. Return authorization decision
    
    **Headers Used:**
    - `X-Forwarded-Uri`: Original request URL being authorized
    - `X-Forwarded-Method`: Original HTTP method
    - `Cookie`: Session cookie for user authentication
    
    **Response Headers Set:**
    - `X-Forwarded-Roles`: User roles for downstream services
    """
    ),
    responses={
        200: {
            "description": "Access granted - user authorized for requested resource",
            "content": {
                "application/json": {
                    "example": {
                        "status": "authorized",
                        "user": "user@example.com",
                        "roles": "public,protected",
                    }
                }
            },
        },
        401: {
            "description": "Authentication required - no valid session cookie",
            "content": {
                "application/json": {"example": {"detail": "Authentication required"}}
            },
        },
        403: {
            "description": "Access denied - user lacks required permissions",
            "content": {"application/json": {"example": {"detail": "Access denied"}}},
        },
        500: {
            "description": "Internal server error during authorization check",
            "content": {
                "application/json": {
                    "example": {"detail": "Internal server error in authorize"}
                }
            },
        },
    },
)
async def authorize(
    request: Request, response: Response, db: DatabaseManager = Depends(get_db)
):
    """
    Traefik forwardAuth endpoint for microservice authorization.

    This endpoint integrates with Traefik's forwardAuth middleware to provide
    centralized authorization for all services in the Photo Web application.
    It validates user sessions and checks permissions against role-based rules.

    Args:
        request: FastAPI request with Traefik headers (X-Forwarded-Uri, etc.)
        response: FastAPI response object for setting forwarded headers
        db: Database manager dependency (currently unused but available)

    Returns:
        dict: Authorization status with user info if successful

    Raises:
        HTTPException:
            - 401 if authentication required but user not logged in
            - 403 if user authenticated but lacks required permissions
            - 500 if authorization check encounters an error

    Note:
        Sets X-Forwarded-Roles header for downstream services.
        Uses X-Forwarded-Uri header to determine requested resource.
        Integrates with authorization manager for role-based access control.
    """
    try:
        # Get roles, defaults to "public" if user is not logged in
        # This also stores the user_info in the session for peruse by proxied services, e.g. photos
        user_info = verify_user(request)

        user_roles = [
            role.strip()
            for role in (user_info.roles or "public").split(",")
            if role.strip()
        ]

        # Get the original URI from Traefik headers
        original_uri = request.headers.get("X-Forwarded-Uri", "/")

        # Check authorization against user roles
        if get_authorization_manager().is_authorized(original_uri, user_roles, request):
            response.headers["X-Forwarded-Roles"] = user_info.roles or "public"
            logger.debug(
                f"AUTHORIZED {original_uri} for {user_roles}, response = {response}"
            )
            return {
                "status": "authorized",
                "user": user_info.email,
                "roles": user_info.roles,
            }
        else:
            logger.info(
                f"Access denied for user {user_info.email} with roles {user_roles} to URI: {original_uri}"
            )
            raise HTTPException(status_code=403, detail="Access denied")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in authorization check: {e}", e)
        raise HTTPException(
            status_code=500, detail=f"Internal server error in authorize: {e}"
        )


@app.get(
    "/firebase-config",
    tags=["authorization"],
    summary="Firebase Configuration",
    description="""
    Provide Firebase configuration for frontend client initialization.
    
    Returns the Firebase configuration needed by frontend applications to
    initialize the Firebase SDK for user authentication. This includes
    API keys, project IDs, and other Firebase-specific settings.
    
    **Security Note:** This endpoint is public as it only returns client-side
    configuration data that is safe to expose to browsers.
    """,
    responses={
        200: {
            "description": "Firebase configuration successfully retrieved",
            "content": {
                "application/json": {
                    "example": {
                        "apiKey": "your-firebase-api-key",
                        "authDomain": "your-project.firebaseapp.com",
                        "projectId": "your-project-id",
                        "storageBucket": "your-project.appspot.com",
                        "messagingSenderId": "123456789",
                        "appId": "1:123456789:web:abcdef123456",
                    }
                }
            },
        },
        500: {
            "description": "Firebase configuration not available or invalid",
            "content": {
                "application/json": {
                    "example": {"detail": "Firebase configuration not available"}
                }
            },
        },
    },
)
async def firebase_config():
    """
    Provide Firebase configuration for frontend client initialization.

    Reads and returns the Firebase configuration from firebase-config.json
    file, which contains the necessary settings for frontend Firebase SDK.

    Returns:
        dict: Firebase configuration object with API keys and project settings

    Raises:
        HTTPException: 500 if config file is missing, invalid, or unreadable
    """
    try:
        with open("app/firebase-config.json", "r") as f:
            config = json.load(f)
        return config
    except FileNotFoundError:
        logger.error("Firebase config file not found at firebase-config.json")
        raise HTTPException(
            status_code=500, detail="Firebase configuration not available"
        )
    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON in firebase-config.json: {e}")
        raise HTTPException(
            status_code=500, detail="Invalid Firebase configuration format"
        )
    except Exception as e:
        logger.error(f"Error reading Firebase config: {e}")
        raise HTTPException(
            status_code=500, detail="Error loading Firebase configuration"
        )


@app.get(
    "/roles-csv",
    tags=["authorization"],
    summary="Authorization Rules Configuration",
    description="""
    Return the roles.csv configuration for authorization rules.
    
    Provides access to the current authorization rules configuration used
    by the authorization manager. This CSV file defines which roles can
    access which routes and includes delegation rules for other services.
    
    **CSV Format:**
    ```
    action,route_pattern,role,comment
    allow,/,public,main entry point
    allow,/ui*,public,user interface
    deny,/admin/*,public,block admin access
    allow,/admin/*,admin,admin interface
    allow,/photos/api/albums/*,!photos:8000,delegate to photos service
    ```
    
    **Access Control:** This endpoint may be restricted to admin users only.
    """,
    responses={
        200: {
            "description": "Authorization rules successfully retrieved",
            "content": {
                "text/csv": {
                    "example": "action,route_pattern,role,comment\nallow,/,public,main entry point\nallow,/ui*,public,user interface"
                }
            },
        },
        500: {
            "description": "Roles configuration not available",
            "content": {
                "application/json": {
                    "example": {"detail": "Roles configuration not available"}
                }
            },
        },
    },
)
async def get_roles_csv():
    """
    Return the roles.csv configuration for authorization rules.

    Reads and returns the roles.csv file content which contains the
    authorization rules used by the authorization manager for access control.

    Returns:
        Response: Raw CSV content with proper content type

    Raises:
        HTTPException: 500 if roles.csv file is missing or unreadable
    """
    try:
        with open("app/roles.csv", "r") as f:
            content = f.read()
        return Response(content=content, media_type="text/csv")
    except FileNotFoundError:
        logger.error("Roles file not found at app/roles.csv")
        raise HTTPException(status_code=500, detail="Roles configuration not available")
    except Exception as e:
        logger.error(f"Error reading roles file: {e}")
        raise HTTPException(status_code=500, detail="Error loading roles configuration")
