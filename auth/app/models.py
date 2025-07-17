from typing import Optional

from pydantic import ConfigDict
from sqlmodel import Field, SQLModel

# Clear any existing metadata to avoid table redefinition issues in tests
SQLModel.metadata.clear()


class UserBase(SQLModel):
    """Base model with common user fields and their definitions."""

    name: str = Field(default=None, description="User's full name")
    # Accept None for users that are not logged in; in database, email != None
    email: Optional[str] = Field(
        default=None,
        unique=True,
        index=True,
        description="User's email address (unique)",
    )
    roles: str = Field(
        default="public",
        description="Comma-separated roles (e.g., 'public,admin,photos')",
    )
    enabled: bool = Field(
        default=True, description="Whether the user account is enabled"
    )
    picture: str = Field(default="", description="URL to user's profile picture")

    model_config = ConfigDict(extra="ignore")

    @property
    def logged_in(self) -> bool:
        return self.email is not None


class User(UserBase, table=True, extend_existing=True):
    """User model for storing user authentication and authorization data."""

    id: Optional[int] = Field(default=None, primary_key=True)
    last_login: str = Field(
        default="", description="Last login timestamp in UTC string format"
    )

    class Config:
        """SQLModel configuration."""

        json_schema_extra = {
            "example": {
                "name": "John Doe",
                "email": "john.doe@example.com",
                "roles": "public,photos",
                "last_login": "2025-07-06T14:30:00Z",
                "enabled": True,
                "logged_in": True,
                "picture": "https://example.com/profile.jpg",
            }
        }


class UserCreate(UserBase):
    """Model for creating a new user."""

    # Inherits all fields from UserBase with their default values
    pass


class UserUpdate(SQLModel):
    """Model for updating user data."""

    name: Optional[str] = None
    roles: Optional[str] = None
    enabled: Optional[bool] = None
    picture: Optional[str] = None


class UserResponse(UserBase):
    """Model for user response (excludes internal fields)."""

    pass
