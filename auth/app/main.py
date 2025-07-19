import json
import logging
import os
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

from authorization import get_authorization_manager
from database import DatabaseManager, get_database_manager, init_database
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from firebase_util import create_session_token, verify_cookie, verify_user
from models import UserCreate, UserResponse
from starlette.middleware.sessions import SessionMiddleware
from users_api import router as users_router

logging.basicConfig(level=logging.WARNING)

logger = logging.getLogger(__name__)
logger.setLevel(logging.WARNING)


@asynccontextmanager
async def lifespan(app: FastAPI):
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

# Include the users router
app.include_router(users_router)


def get_db() -> DatabaseManager:
    """Dependency to get database manager."""
    return get_database_manager()


# Remove the firebase_auth dependency since we're using init_firebase functions directly


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "Auth service is healthy"}


@app.get("/firebase-config")
async def firebase_config():
    """Return Firebase configuration for frontend initialization."""
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


@app.post("/login", response_class=RedirectResponse)
async def session_login(
    request: Request,
    id_token: str,
    redirect_uri: str = "/",
    db: DatabaseManager = Depends(get_db),
) -> RedirectResponse:
    """Handle user login with Firebase ID token.

    Creates a session cookie and stores/updates user information in the database.
    """
    try:
        """
        Prepare response.

        Per https://stackoverflow.com/questions/79352184/why-does-my-fastapi-application-redirect-to-http-and-not-https
        RedirectResponse (via FastAPI and uvicorn) sets the protocol based on the X-Forwarded-Proto header.
        It ignores the protocol specified in the url.
        Hence it is important that the reverse proxies (traefik and nginx) in front of the auth service are 
        configured to set X-Forwarded-Proto correctly.
        Furthermore uvicorn must be invoked with `--forwarded-allow-ips *`.

        Problem seems with ui/src/app/login.ts.
        """
        response = RedirectResponse(url=redirect_uri, status_code=302)
        logger.warning(
            f"LOGIN DEBUG: redirect_uri='{redirect_uri}', request.url='{request.url}', request.url.scheme='{request.url.scheme}', asgi_scope_scheme='{request.scope.get('scheme')}', response.headers='{response.headers}'"
        )
        # Check if user is already logged in with a valid session
        existing_session_token = request.cookies.get("session")
        if existing_session_token:
            try:
                # Verify existing session token
                existing_user_info = verify_user(request)
                if existing_user_info and existing_user_info.email:
                    return response
            except Exception:
                # Invalid session token, continue with login process
                pass

        # New login, add session cookie
        session_token = create_session_token(id_token)

        # user name, email, picture
        user_info = verify_cookie(session_token)

        user_email = user_info.email
        if user_email:
            existing_user = db.get_user_by_email(user_email)
            if not existing_user:
                # Create user in database if not exists
                new_user_data = UserCreate(
                    email=user_email,
                    name=user_info.name or user_email,
                    picture=user_info.picture,
                )
                db.create_user(new_user_data)
            # Update last login time for both new and existing users
            db.update_last_login(user_email)
        else:
            logger.warning("User email not found in session token.")

        expiration_days = int(os.getenv("AUTH_COOKIE_EXPIRATION_DAYS", 14))
        response.set_cookie(
            key="session",
            value=session_token,
            httponly=True,
            secure=True,
            samesite="strict",
            expires=datetime.now(timezone.utc) + timedelta(days=expiration_days),
            domain=os.getenv("ROOT_DOMAIN", "dev49.org"),
        )
        return response
    except Exception as e:
        logger.error(f"LOGIN ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/logout", response_class=RedirectResponse)
async def logout(request: Request, redirect_uri: str = "/") -> RedirectResponse:
    """Handle user logout by clearing the session cookie and invalidating session cache.

    Clears the session cookie, invalidates any cached session data, and redirects to the specified URI.
    """
    try:
        # Clear session cache before logout
        session_token = request.cookies.get("session")
        if session_token and hasattr(request, "session"):
            # Create the same cache key used in verify_session_token
            import hashlib

            cache_key = (
                f"user_info_{hashlib.sha256(session_token.encode()).hexdigest()[:16]}"
            )

            # Remove cached user info from session
            if cache_key in request.session:
                del request.session[cache_key]

        response = RedirectResponse(url=redirect_uri, status_code=302)
        logger.warning(
            f"LOGOUT DEBUG: redirect_uri='{redirect_uri}', request.url.scheme='{request.url.scheme}', response.headers='{response.headers}'"
        )
        # Clear the session cookie by setting it to expire immediately
        response.set_cookie(
            key="session",
            value="",
            httponly=True,
            secure=True,
            expires=datetime.now(timezone.utc) - timedelta(seconds=1),
            domain=os.getenv("ROOT_DOMAIN", "dev49.org"),
        )

        return response

    except Exception as e:
        logger.error(f"LOGOUT ERROR: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.get("/me", response_model=UserResponse)
async def get_current_user(request: Request):
    """Get current user information from session cookie.

    Returns empty dict if user is not logged in (no cookie found).
    """
    try:
        # Get session cookie from request
        session_token = request.cookies.get("session")
        if not session_token:
            return {"roles": "public"}

        # Verify session token with Firebase and extract information
        return verify_user(request)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting current user: {e}", e)
        # Return public role instead of raising error to prevent auth failures
        return UserResponse({"roles": "public"})


@app.get("/authorize")
async def authorize(
    request: Request, response: Response, db: DatabaseManager = Depends(get_db)
):
    """Traefik forwardAuth endpoint for authorization checking.

    This endpoint is used by Traefik to verify if a user is authorized to access
    a specific resource based on the rules defined in roles.csv.

    Returns:
        - 200 (OK) if authorized
        - 401 (Unauthorized) if not logged in and login is required
        - 403 (Forbidden) if logged in but not authorized
        - 302 (Redirect) to login if authentication is needed
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
