import hashlib
import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ConfigDict
from sqlmodel import Field, SQLModel

# available in container (copied from auth)
# from user_info import UserBase, user_info  # type: ignore

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


class UserBase(SQLModel):
    """Base model with common user fields and their definitions."""

    name: Optional[str] = Field(default=None, description="User's full name")
    # Accept None for users that are not logged in; in database, email != None
    email: Optional[str] = Field(
        default=None,
        unique=True,
        index=True,
        description="User's email address (unique)",
    )
    roles: str = Field(
        default="public",
        description="Comma-separated roles (e.g., 'public,admin,private,personal,family')",
    )
    enabled: bool = Field(
        default=True, description="Whether the user account is enabled"
    )
    picture: str = Field(default="", description="URL to user's profile picture")

    model_config = ConfigDict(extra="ignore")

    @property
    def logged_in(self) -> bool:
        return self.email is not None


def user_info(request: Request) -> UserBase:
    """
    Return user info based on session cache.
    """
    try:
        session_cookie = request.cookies.get("session")

        logger.warning(f"USER_INFO 1 {session_cookie}")

        if not session_cookie or session_cookie.strip() == "":
            # non-authenticated user
            return UserBase(roles="public")

        # Create cache key based on session token hash for security
        cache_key = (
            f"user_info_{hashlib.sha256(session_cookie.encode()).hexdigest()[:16]}"
        )

        # Check if we have cached user info in session
        if hasattr(request, "session") and cache_key in request.session:
            cached_info = request.session[cache_key]
            logger.warning(f"USER_INFO 2 {cached_info}")
            return UserBase(**cached_info)

        logger.warning(f"USER_INFO 3 {cache_key}")

        # authenticated, but user_info not in session
        return UserBase(roles="public")
    except Exception as e:
        logger.error(f"user_info {e}", e)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting docs server ...")
    yield
    # No cleanup needed since we're not using a global HTTP client


app = FastAPI(
    title="Photo Web Docs Service",
    description="Docs service for Photo Web application",
    version="1.0.0",
    lifespan=lifespan,
    root_path="/doc",
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)


@app.get("/api/health")
async def health_check():
    return {"status": "Docs service is healthy"}


@app.get("/api/test-me")
async def get_me(request: Request) -> str:
    """
    Get user information from auth service.

    This endpoint is a proxy to the auth service's /me endpoint.
    """
    roles = request.headers.get("X-Forwarded-Roles", "public")
    logger.info(f"test-me {roles}")
    return roles
