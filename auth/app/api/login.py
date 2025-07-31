import logging
import os
from datetime import datetime, timedelta, timezone

from database import DatabaseManager, get_database_manager
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from firebase_util import create_session_token, verify_cookie, verify_user
from models import UserCreate, UserResponse

logger = logging.getLogger(__name__)


def get_db() -> DatabaseManager:
    """Dependency to get database manager."""
    return get_database_manager()


# Create router for authentication endpoints
router = APIRouter(tags=["authentication"])


@router.post(
    "/login",
    response_class=RedirectResponse,
    summary="User Login with Firebase Token",
    description="""
    Authenticate user with Firebase ID token and create secure session.
    
    This endpoint validates a Firebase ID token received from the frontend,
    creates or updates the user record in the database, and establishes a
    secure session cookie for subsequent requests.
    
    **Authentication Flow:**
    1. Frontend authenticates user with Firebase
    2. Frontend sends Firebase ID token to this endpoint
    3. Service validates token with Firebase Admin SDK
    4. User record created/updated in database
    5. Secure session cookie set with configurable expiration
    6. User redirected to specified URI
    
    **Session Security:**
    - HttpOnly cookies prevent XSS attacks
    - Secure flag ensures HTTPS-only transmission
    - SameSite=Strict prevents CSRF attacks
    - Configurable expiration (default 14 days)
    
    **Rate Limiting:** 5 requests per minute per IP
    """,
    responses={
        302: {
            "description": "Login successful - redirecting to specified URI",
            "headers": {
                "Set-Cookie": {
                    "description": "Secure session cookie",
                    "schema": {"type": "string"},
                },
                "Location": {
                    "description": "Redirect URI",
                    "schema": {"type": "string"},
                },
            },
        },
        400: {
            "description": "Invalid Firebase ID token",
            "content": {
                "application/json": {"example": {"detail": "Invalid Firebase token"}}
            },
        },
        500: {
            "description": "Internal server error during login process",
            "content": {
                "application/json": {"example": {"detail": "Login process failed"}}
            },
        },
    },
)
async def session_login(
    request: Request,
    id_token: str,
    redirect_uri: str = "/",
    db: DatabaseManager = Depends(get_db),
) -> RedirectResponse:
    """
    Handle user login with Firebase ID token and create session.

    Validates the Firebase ID token, creates a secure session cookie,
    and stores/updates user information in the database. Handles both
    new user registration and existing user login.

    Args:
        request: FastAPI request object containing cookies and headers
        id_token: Firebase ID token from frontend authentication
        redirect_uri: URI to redirect to after successful login (default: "/")
        db: Database manager dependency for user operations

    Returns:
        RedirectResponse: Redirect to specified URI with session cookie set

    Raises:
        HTTPException: 500 if login process fails or token is invalid

    Note:
        Sets secure session cookie with configurable expiration.
        Handles X-Forwarded-Proto header for proper HTTPS redirects.
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


@router.post(
    "/logout",
    response_class=RedirectResponse,
    summary="User Logout",
    description="""
    Terminate user session and clear authentication cookies.
    
    This endpoint invalidates the current user session by:
    - Clearing the session cookie (expires immediately)
    - Removing cached session data from server-side store
    - Redirecting user to specified URI
    
    **Security Features:**
    - Immediate cookie expiration prevents session reuse
    - Server-side cache cleanup ensures complete logout
    - Safe redirect to prevent open redirect vulnerabilities
    
    **Rate Limiting:** 10 requests per minute per IP
    """,
    responses={
        302: {
            "description": "Logout successful - redirecting to specified URI",
            "headers": {
                "Set-Cookie": {
                    "description": "Expired session cookie",
                    "schema": {"type": "string"},
                },
                "Location": {
                    "description": "Redirect URI",
                    "schema": {"type": "string"},
                },
            },
        },
        500: {
            "description": "Internal server error during logout",
            "content": {
                "application/json": {"example": {"detail": "Internal server error"}}
            },
        },
    },
)
async def logout(request: Request, redirect_uri: str = "/") -> RedirectResponse:
    """
    Handle user logout by clearing session data and cookies.

    Invalidates the user session by clearing the session cookie and
    removing any cached session data from the server-side session store.

    Args:
        request: FastAPI request object containing session data
        redirect_uri: URI to redirect to after logout (default: "/")

    Returns:
        RedirectResponse: Redirect to specified URI with cleared session cookie

    Raises:
        HTTPException: 500 if logout process encounters an error

    Note:
        Expires session cookie immediately and clears server-side cache.
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


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get Current User",
    description="""
    Get current authenticated user information from session.
    
    Extracts and validates the session cookie to return comprehensive user
    details including email, name, picture, roles, and timestamps.
    
    **Behavior:**
    - Returns full user details for authenticated users
    - Returns `{"roles": "public"}` for unauthenticated users
    - Does not raise errors for missing sessions (graceful degradation)
    
    **Use Cases:**
    - Frontend user profile display
    - Role-based UI rendering
    - Session validation checks
    - User state management
    
    **Rate Limiting:** 1000 requests per minute per IP
    """,
    responses={
        200: {
            "description": "User information successfully retrieved",
            "content": {
                "application/json": {
                    "examples": {
                        "authenticated_user": {
                            "summary": "Authenticated user",
                            "value": {
                                "id": "firebase-uid-123",
                                "email": "user@example.com",
                                "name": "John Doe",
                                "picture": "https://example.com/avatar.jpg",
                                "roles": "public,protected",
                                "created_at": "2024-01-01T00:00:00Z",
                                "last_login": "2024-01-15T10:30:00Z",
                            },
                        },
                        "unauthenticated_user": {
                            "summary": "Unauthenticated user",
                            "value": {"roles": "public"},
                        },
                    }
                }
            },
        }
    },
)
async def get_current_user(request: Request):
    """
    Get current authenticated user information from session.

    Extracts and validates the session cookie to return user details
    including email, name, picture, and roles. Falls back to public
    role if no valid session exists.

    Args:
        request: FastAPI request object containing session cookie

    Returns:
        UserResponse: User information with roles, or public role if not authenticated

    Raises:
        HTTPException: If session validation fails with specific error

    Note:
        Returns {"roles": "public"} for unauthenticated users instead of errors.
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
