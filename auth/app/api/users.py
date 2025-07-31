import logging
from typing import List

from database import DatabaseManager, get_database_manager
from fastapi import APIRouter, Depends, HTTPException
from models import UserCreate, UserResponse, UserUpdate

logger = logging.getLogger(__name__)


def get_db() -> DatabaseManager:
    """Dependency to get database manager."""
    return get_database_manager()


# Create router for user endpoints
router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=List[UserResponse])
async def get_all_users(db: DatabaseManager = Depends(get_db)):
    """Get all users in the database."""
    try:
        users = db.get_all_users()
        return users
    except Exception as e:
        logger.error(f"Error getting users: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/{email}", response_model=UserResponse)
async def get_user(email: str, db: DatabaseManager = Depends(get_db)):
    """Get user by email."""
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


@router.post("", response_model=UserResponse)
async def create_user(user_data: UserCreate, db: DatabaseManager = Depends(get_db)):
    """Create a new user."""
    try:
        user = db.create_user(user_data)
        return user
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating user: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.put("/{email}", response_model=UserResponse)
async def update_user(
    email: str, user_update: UserUpdate, db: DatabaseManager = Depends(get_db)
):
    """Update user by email."""
    try:
        user = db.update_user(email, user_update)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return user
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating user {email}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.delete("/{email}")
async def delete_user(email: str, db: DatabaseManager = Depends(get_db)):
    """Delete user by email."""
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
