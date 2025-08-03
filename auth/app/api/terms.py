import logging
from datetime import date

from database import DatabaseManager, get_database_manager
from fastapi import APIRouter, Depends, HTTPException, Request
from firebase_util import verify_user
from models import UserResponse, UserUpdate

logger = logging.getLogger(__name__)


def get_db() -> DatabaseManager:
    """Dependency to get database manager."""
    return get_database_manager()


# Create router for terms-related endpoints
router = APIRouter(tags=["terms"])


@router.post(
    "/term-accepted",
    response_model=UserResponse,
    summary="Accept Terms and Conditions",
    description="""
    Update the current authenticated user's terms acceptance date to today.
    
    This endpoint allows authenticated users to accept the terms and conditions
    by updating their terms_accepted field to the current date. This is typically
    called when a user accepts terms in the frontend interface.
    
    **Authentication Required:** User must be logged in with a valid session
    
    **Behavior:**
    - Updates the terms_accepted field to today's date
    - Returns the updated user information
    - Only affects the current authenticated user
    
    **Use Cases:**
    - Terms and conditions acceptance flow
    - Privacy policy acceptance
    - User agreement updates
    
    **Rate Limiting:** 100 requests per minute per IP
    """,
    responses={
        200: {
            "description": "Terms acceptance successfully recorded",
            "content": {
                "application/json": {
                    "example": {
                        "id": "firebase-uid-123",
                        "email": "user@example.com",
                        "name": "John Doe",
                        "picture": "https://example.com/avatar.jpg",
                        "roles": "public,protected",
                        "terms_accepted": "2025-08-03",
                        "enabled": True,
                    }
                }
            },
        },
        401: {
            "description": "Authentication required - no valid session",
            "content": {
                "application/json": {"example": {"detail": "Authentication required"}}
            },
        },
        404: {
            "description": "User not found in database",
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
async def accept_terms(
    request: Request, db: DatabaseManager = Depends(get_db)
) -> UserResponse:
    """
    Update the current authenticated user's terms acceptance date to today.

    This endpoint allows authenticated users to accept terms and conditions
    by updating their terms_accepted field to the current date. Requires
    a valid session cookie for authentication.

    Args:
        request: FastAPI request object containing session cookie
        db: Database manager dependency for user operations

    Returns:
        UserResponse: Updated user information with new terms_accepted date

    Raises:
        HTTPException:
            - 401 if user is not authenticated
            - 404 if user not found in database
            - 500 if database operation fails

    Note:
        Only updates the terms_accepted field, leaving other user data unchanged.
    """
    try:
        # Verify user is authenticated
        user_info = verify_user(request)
        if not user_info.email:
            raise HTTPException(status_code=401, detail="Authentication required")

        # Update user's terms_accepted date to today
        user_update = UserUpdate(terms_accepted=date.today().isoformat())
        updated_user = db.update_user(user_info.email, user_update)

        if not updated_user:
            raise HTTPException(status_code=404, detail="User not found")

        return updated_user

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error accepting terms for user: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
