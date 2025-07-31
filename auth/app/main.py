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
    title="Photo Web Auth Service",
    description="Authentication and Authorization service for Photo Web application",
    version="1.0.0",
    lifespan=lifespan,
    root_path="/auth",
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


@app.get("/health")
async def health_check():
    """
    Health check endpoint for service monitoring.

    Returns:
        dict: Service status information
    """
    return {"status": "Auth service is healthy"}


@app.get("/authorize")
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


@app.get("/firebase-config")
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


@app.get("/roles-csv")
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
