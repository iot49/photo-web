from typing import Optional

from pydantic import ConfigDict
from sqlmodel import Field, SQLModel

# Clear any existing metadata to avoid table redefinition issues in tests
SQLModel.metadata.clear()


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
    terms_accepted: str = Field(
        default="2000-01-01",
        description="Date when the user last accepted terms (ISO format)",
    )
    created_at: str = Field(
        default="",
        description="Date when the user account was created (ISO format)",
    )
    last_login: str = Field(
        default="", description="Last login timestamp in UTC string format"
    )
    config: str = Field(
        default="{}",
        description="User configuration as JSON string (default: empty dict)",
    )

    model_config = ConfigDict(extra="ignore")

    @property
    def logged_in(self) -> bool:
        return self.email is not None


class User(UserBase, table=True, extend_existing=True):
    """User model for storing user authentication and authorization data."""

    id: Optional[int] = Field(default=None, primary_key=True)

    class Config:
        """SQLModel configuration."""

        json_schema_extra = {
            "example": {
                "name": "John Doe",
                "email": "john.doe@example.com",
                "roles": "public,protected",
                "last_login": "2025-07-06T14:30:00Z",
                "enabled": True,
                "logged_in": True,
                "picture": "https://example.com/profile.jpg",
                "created_at": "2025-01-01",
                "config": '{"theme": "dark", "autoplay": true}',
            }
        }


class UserCreate(UserBase):
    """Model for creating a new user."""

    # Inherits all fields from UserBase with their default values
    pass


class UserUpdateProfile(SQLModel):
    """Model for updating user profile (admin)."""

    roles: Optional[str] = None
    enabled: Optional[bool] = None
    terms_accepted: Optional[str] = None


class UserUpdateConfig(SQLModel):
    """Model for updating user configuration"""

    config: Optional[str] = None


class UserUpdate(UserUpdateProfile, UserUpdateConfig):
    """Model for updating user (internal use) - combines profile and config updates."""

    last_login: Optional[str] = None


class UserResponse(UserBase):
    """Model for user response (excludes internal fields)."""

    pass
