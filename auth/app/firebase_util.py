import hashlib
import logging
import os
from datetime import datetime, timedelta

from fastapi import HTTPException, Request
from firebase_admin import auth, credentials, initialize_app
from models import UserBase, UserCreate

logger = logging.getLogger("uvicorn.error")

# validity of user info cache
CACHE_VALID_MINUTES = 60

# initialize firebase
try:
    cred = credentials.Certificate("app/service-account.json")
    initialize_app(cred)
except Exception as e:
    logger.error(f"failed firebase_admin.initialize_app: {e}")


def verify_cookie(session_cookie: str) -> UserBase:
    """
    Verify firebase cookie. Create new user if not already in database.
    """
    try:
        # Verify the session token with Firebase
        user_info = auth.verify_session_cookie(session_cookie)
        email = user_info.get("email")

        if email is None:
            logger.warning(f"no email in session_cookie, {user_info}")
            # default role for user that is not logged in is 'public'
            return UserBase(roles="public")

        # Get roles from database
        # Import here to avoid circular imports
        from database import get_database_manager

        db = get_database_manager()
        user = db.get_user_by_email(email)

        if not user:
            # default roles for logged-in user is 'public,protected'
            user = UserBase(**user_info, roles="public,protected")
            db.create_user(UserCreate(user))

        return user
    except (
        auth.InvalidIdTokenError,
        auth.ExpiredIdTokenError,
        auth.RevokedIdTokenError,
    ) as e:
        raise HTTPException(status_code=500, detail=f"Invalid Token, {e}")


def verify_user(request: Request) -> UserBase:
    """
    Return user info based on cache or session cookie.
    """
    session_cookie = request.cookies.get("session")

    if not session_cookie or session_cookie.strip() == "":
        # non-authenticated user
        return UserBase(roles="public")

    # Create cache key based on session token hash for security
    cache_key = f"user_info_{hashlib.sha256(session_cookie.encode()).hexdigest()[:16]}"

    # Check if we have cached user info in session
    if hasattr(request, "session") and cache_key in request.session:
        cached_info = request.session[cache_key]
        # Check if cache is still valid

        cache_time = datetime.fromisoformat(
            cached_info.get("_cached_at", "1970-01-01T00:00:00")
        )

        if datetime.now() - cache_time < timedelta(minutes=CACHE_VALID_MINUTES):
            # Return cached info without the internal cache timestamp
            return UserBase(**cached_info)

    # get user info from session_cookie
    user_info = verify_cookie(session_cookie)

    # ensure default roles are set
    roles = set([role.strip() for role in user_info.roles.split(",")])
    roles.add("public")  # ensure 'public' role is always present
    if user_info.email == os.getenv("ADMIN_EMAIL", ""):
        roles.add("admin")
    user_info.roles = ",".join(sorted(roles))

    # update cache
    cached_result = user_info.model_dump()
    cached_result["_cached_at"] = datetime.now().isoformat()
    request.session[cache_key] = cached_result

    return user_info


def create_session_token(id_token):
    # Get session expiration from environment variable, default to 5 days
    try:
        session_expires_days = int(os.getenv("AUTH_COOKIE_EXPIRATION_DAYS", 5))
    except ValueError:
        logger.warning(
            "Invalid AUTH_COOKIE_EXPIRATION_DAYS in .env, defaulting to 5 days"
        )
        session_expires_days = 5

    expires_in = timedelta(days=session_expires_days)
    session_token = auth.create_session_cookie(id_token, expires_in=expires_in)
    return session_token
