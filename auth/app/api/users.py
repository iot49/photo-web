import hashlib
import logging
from typing import List

from database import DatabaseManager, get_database_manager
from doc_utils import dedent_and_convert_to_html
from fastapi import APIRouter, Depends, HTTPException, Request
from models import UserCreate, UserResponse, UserUpdate

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)


def get_db() -> DatabaseManager:
    """Dependency to get database manager."""
    return get_database_manager()


def get_user_roles_from_request(request: Request) -> List[str]:
    """Extract user roles from request headers (set by auth middleware)."""
    roles_header = request.headers.get("X-Forwarded-Roles", "")
    if not roles_header:
        return ["public"]  # Default role if no roles found
    return [role.strip() for role in roles_header.split(",") if role.strip()]


# Create router for user endpoints
router = APIRouter(prefix="/users", tags=["users"])


@router.get(
    "",
    response_model=List[UserResponse],
    summary="List All Users",
    description=dedent_and_convert_to_html(
        """
    Get a list of all users in the system.
    
    Returns comprehensive information for all registered users including
    their roles, creation dates, and last login timestamps.
    
    **Access Control:** Requires admin role
    
    **Use Cases:**
    - User management interfaces
    - Administrative reporting
    - System monitoring
    - Bulk operations planning
    
    **Rate Limiting:** 100 requests per minute per IP
    """
    ),
    responses={
        200: {
            "description": "List of all users successfully retrieved",
            "content": {
                "application/json": {
                    "example": [
                        {
                            "id": "firebase-uid-123",
                            "email": "user@example.com",
                            "name": "John Doe",
                            "picture": "https://example.com/avatar.jpg",
                            "roles": "public,protected",
                            "created_at": "2024-01-01T00:00:00Z",
                            "last_login": "2024-01-15T10:30:00Z",
                        },
                        {
                            "id": "firebase-uid-456",
                            "email": "admin@example.com",
                            "name": "Admin User",
                            "picture": "https://example.com/admin.jpg",
                            "roles": "public,protected,private,admin",
                            "created_at": "2024-01-01T00:00:00Z",
                            "last_login": "2024-01-15T11:00:00Z",
                        },
                    ]
                }
            },
        },
        403: {
            "description": "Access denied - admin role required",
            "content": {"application/json": {"example": {"detail": "Access denied"}}},
        },
        500: {
            "description": "Internal server error",
            "content": {
                "application/json": {"example": {"detail": "Internal server error"}}
            },
        },
    },
)
async def get_all_users(db: DatabaseManager = Depends(get_db)):
    """
    Get all users in the database.

    Returns a list of all registered users with their complete information.
    Requires admin role for access.

    Returns:
        List[UserResponse]: List of all users in the system

    Raises:
        HTTPException: 500 if database operation fails
    """
    try:
        users = db.get_all_users()
        return users
    except Exception as e:
        logger.error(f"Error getting users: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get(
    "/{email}",
    response_model=UserResponse,
    summary="Get User by Email",
    description=dedent_and_convert_to_html(
        """
    Retrieve detailed information for a specific user by email address.
    
    Returns comprehensive user information including roles, timestamps,
    and profile data for the specified email address.
    
    **Access Control:** Requires admin role or self-access
    
    **Use Cases:**
    - User profile viewing
    - Administrative user lookup
    - Role verification
    - Account management
    """
    ),
    responses={
        200: {
            "description": "User information successfully retrieved",
            "content": {
                "application/json": {
                    "example": {
                        "id": "firebase-uid-123",
                        "email": "user@example.com",
                        "name": "John Doe",
                        "picture": "https://example.com/avatar.jpg",
                        "roles": "public,protected",
                        "created_at": "2024-01-01T00:00:00Z",
                        "last_login": "2024-01-15T10:30:00Z",
                    }
                }
            },
        },
        404: {
            "description": "User not found",
            "content": {"application/json": {"example": {"detail": "User not found"}}},
        },
        403: {
            "description": "Access denied - insufficient permissions",
            "content": {"application/json": {"example": {"detail": "Access denied"}}},
        },
        500: {
            "description": "Internal server error",
            "content": {
                "application/json": {"example": {"detail": "Internal server error"}}
            },
        },
    },
)
async def get_user(email: str, db: DatabaseManager = Depends(get_db)):
    """
    Get user by email address.

    Retrieves detailed information for a specific user identified by their
    email address. Access control ensures users can only view their own
    information unless they have admin privileges.

    Args:
        email: Email address of the user to retrieve
        db: Database manager dependency

    Returns:
        UserResponse: Complete user information

    Raises:
        HTTPException: 404 if user not found, 500 if database error
    """
    try:
        user = db.get_user_by_email(email)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return user
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting user {email}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post(
    "",
    response_model=UserResponse,
    summary="Create New User",
    description=dedent_and_convert_to_html(
        """
    Create a new user account in the system.
    
    Creates a new user with the provided information including email,
    name, and optional profile picture. Default roles are assigned
    based on system configuration.
    
    **Access Control:** Requires admin role
    
    **Validation:**
    - Email must be unique and valid format
    - Name is required and non-empty
    - Picture URL must be valid if provided
    
    **Default Behavior:**
    - New users get 'public' role by default
    - Creation timestamp automatically set
    - Last login initially null
    """
    ),
    responses={
        201: {
            "description": "User successfully created",
            "content": {
                "application/json": {
                    "example": {
                        "id": "firebase-uid-789",
                        "email": "newuser@example.com",
                        "name": "New User",
                        "picture": "https://example.com/newuser.jpg",
                        "roles": "public",
                        "created_at": "2024-01-15T12:00:00Z",
                        "last_login": None,
                    }
                }
            },
        },
        400: {
            "description": "Invalid user data or email already exists",
            "content": {
                "application/json": {"example": {"detail": "Email already exists"}}
            },
        },
        403: {
            "description": "Access denied - admin role required",
            "content": {"application/json": {"example": {"detail": "Access denied"}}},
        },
        500: {
            "description": "Internal server error",
            "content": {
                "application/json": {"example": {"detail": "Internal server error"}}
            },
        },
    },
)
async def create_user(user_data: UserCreate, db: DatabaseManager = Depends(get_db)):
    """
    Create a new user account.

    Creates a new user with the provided information. Validates that the
    email is unique and all required fields are present.

    Args:
        user_data: User creation data including email, name, and picture
        db: Database manager dependency

    Returns:
        UserResponse: Created user information

    Raises:
        HTTPException: 400 if validation fails, 500 if database error
    """
    try:
        user = db.create_user(user_data)
        return user
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating user: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.put(
    "/{email}/put",
    response_model=UserResponse,
    summary="Update User Profile",
    description=dedent_and_convert_to_html(
        """
    Update user profile information with authorization controls.
    
    **Authorization Rules:**
    - Requires "protected" or "admin" role to make any changes
    - Only "admin" role can change fields other than config
    - Non-admin users can only update their config field
    
    **Updatable Fields:**
    - Config (JSON string) - requires protected/admin role
    - Other fields (name, roles, etc.) - requires admin role
    
    **Access Control:** Public endpoint with field-level authorization
    """
    ),
    responses={
        200: {
            "description": "User successfully updated",
            "content": {
                "application/json": {
                    "example": {
                        "id": "firebase-uid-123",
                        "email": "user@example.com",
                        "name": "Updated Name",
                        "picture": "https://example.com/newavatar.jpg",
                        "roles": "public,protected",
                        "created_at": "2024-01-01T00:00:00Z",
                        "last_login": "2024-01-15T10:30:00Z",
                        "config": '{"slideshow": {"duration": 5}}',
                    }
                }
            },
        },
        403: {
            "description": "Access denied - insufficient permissions",
            "content": {"application/json": {"example": {"detail": "Access denied"}}},
        },
        404: {
            "description": "User not found",
            "content": {"application/json": {"example": {"detail": "User not found"}}},
        },
        500: {
            "description": "Internal server error",
            "content": {
                "application/json": {"example": {"detail": "Internal server error"}}
            },
        },
    },
)
async def update_user_profile(
    email: str,
    user_update: UserUpdate,
    request: Request,
    db: DatabaseManager = Depends(get_db),
):
    """
    Update user profile with authorization controls.

    Simple authorization logic:
    - If user has neither "admin" nor "protected" role, do nothing (return 403)
    - If user doesn't have "admin" role, remove all fields except config
    - Admin users can update any field

    Args:
        email: Email address of the user to update
        user_update: User update data with optional fields
        request: FastAPI request object to extract user roles
        db: Database manager dependency

    Returns:
        UserResponse: Updated user information

    Raises:
        HTTPException: 403 if insufficient permissions, 404 if user not found, 500 if database error
    """
    try:
        # Get user roles from request headers
        user_roles = get_user_roles_from_request(request)

        # Check if user has protected or admin role
        has_protected_or_admin = "protected" in user_roles or "admin" in user_roles
        if not has_protected_or_admin:
            logger.debug(
                f"UPDATE_USER_PROFILE: Access denied for user with roles {user_roles}"
            )
            raise HTTPException(
                status_code=403,
                detail="Access denied - requires protected or admin role",
            )

        # If user is not admin, filter out all fields except config
        is_admin = "admin" in user_roles
        if not is_admin:
            update_data = user_update.model_dump(exclude_unset=True)
            filtered_data = {}
            logger.debug(f"PUT user {update_data}")

            # Only allow config field for non-admin users
            if "config" in update_data:
                filtered_data["config"] = update_data["config"]
                logger.debug(
                    f"UPDATE_USER_PROFILE: Non-admin user updating config only {filtered_data}"
                )

            if len(filtered_data) == 0:
                logger.debug(
                    "UPDATE_USER_PROFILE: No valid fields to update for non-admin user"
                )
                # Still need to return the current user data
                user = db.get_user_by_email(email)
                if not user:
                    raise HTTPException(status_code=404, detail="User not found")
                return user

            user_update = UserUpdate(**filtered_data)

        # Perform the update
        user = db.update_user(email, user_update)
        if not user:
            logger.debug(f"UPDATE_USER_PROFILE: User {email} not found in database")
            raise HTTPException(status_code=404, detail="User not found")

        # Clear cache for this user after successful database update
        session_token = request.cookies.get("session")
        if session_token and hasattr(request, "session"):
            cache_key = (
                f"user_info_{hashlib.sha256(session_token.encode()).hexdigest()[:16]}"
            )
            if cache_key in request.session:
                del request.session[cache_key]
                logger.debug(f"UPDATE_USER_PROFILE: Cleared cache for user {email}")

        logger.debug(f"UPDATE_USER_PROFILE: Successfully updated user {email}")
        return user

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"UPDATE_USER_PROFILE ERROR: Error updating user {email}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.delete(
    "/{email}",
    summary="Delete User",
    description=dedent_and_convert_to_html(
        """
    Delete a user account by email address.
    
    Permanently removes the user account and all associated data from
    the system. This action cannot be undone.
    
    **Access Control:** Requires admin role
    
    **Side Effects:**
    - User account permanently deleted
    - All user sessions invalidated
    - User removed from all role assignments
    - Associated data may be retained for audit purposes
    
    **Security Note:** This is a destructive operation that should be
    used with caution and proper authorization.
    """
    ),
    responses={
        200: {
            "description": "User successfully deleted",
            "content": {
                "application/json": {
                    "example": {"message": "User deleted successfully"}
                }
            },
        },
        404: {
            "description": "User not found",
            "content": {"application/json": {"example": {"detail": "User not found"}}},
        },
        403: {
            "description": "Access denied - admin role required",
            "content": {"application/json": {"example": {"detail": "Access denied"}}},
        },
        500: {
            "description": "Internal server error",
            "content": {
                "application/json": {"example": {"detail": "Internal server error"}}
            },
        },
    },
)
async def delete_user(email: str, db: DatabaseManager = Depends(get_db)):
    """
    Delete user account by email.

    Permanently removes the specified user account from the system.
    This is a destructive operation that cannot be undone.

    Args:
        email: Email address of the user to delete
        db: Database manager dependency

    Returns:
        dict: Success message confirming deletion

    Raises:
        HTTPException: 404 if user not found, 500 if database error
    """
    try:
        success = db.delete_user(email)
        if not success:
            raise HTTPException(status_code=404, detail="User not found")
        return {"message": "User deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting user {email}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
