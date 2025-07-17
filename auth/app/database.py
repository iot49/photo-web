import os
from datetime import datetime
from typing import List, Optional

from models import User, UserCreate, UserUpdate
from sqlmodel import Session, SQLModel, create_engine, select


class DatabaseManager:
    """Database manager for SQLite operations."""

    def __init__(self, database_url: str = "sqlite:///./auth.db"):
        """Initialize database connection."""
        self.engine = create_engine(database_url, echo=False)
        self.create_tables()

    def create_tables(self):
        """Create database tables."""
        SQLModel.metadata.create_all(self.engine)

    def get_session(self):
        """Get database session."""
        return Session(self.engine)

    def create_user(self, user_data: UserCreate) -> User:
        """Create a new user."""
        with self.get_session() as session:
            # Check if user already exists
            existing_user = session.exec(
                select(User).where(User.email == user_data.email)
            ).first()

            if existing_user:
                raise ValueError(f"User with email {user_data.email} already exists")

            # Create new user
            user_dict = user_data.model_dump()

            # Set roles to "public,admin" if email equals SUPER_USER_EMAIL
            super_user_email = os.getenv("SUPER_USER_EMAIL")
            if super_user_email and user_data.email == super_user_email:
                user_dict["roles"] = "public,admin"

            user = User(**user_dict)
            session.add(user)
            session.commit()
            session.refresh(user)
            return user

    def get_user_by_email(self, email: str) -> Optional[User]:
        """Get user by email."""
        with self.get_session() as session:
            return session.exec(select(User).where(User.email == email)).first()

    def get_user_by_id(self, user_id: int) -> Optional[User]:
        """Get user by ID."""
        with self.get_session() as session:
            return session.get(User, user_id)

    def get_all_users(self) -> List[User]:
        """Get all users."""
        with self.get_session() as session:
            return session.exec(select(User)).all()

    def update_user(self, email: str, user_update: UserUpdate) -> Optional[User]:
        """Update user by email."""
        with self.get_session() as session:
            user = session.exec(select(User).where(User.email == email)).first()

            if not user:
                return None

            # Update only provided fields
            update_data = user_update.model_dump(exclude_unset=True)
            for field, value in update_data.items():
                setattr(user, field, value)

            session.add(user)
            session.commit()
            session.refresh(user)
            return user

    def update_last_login(self, email: str) -> Optional[User]:
        """Update user's last login timestamp."""
        with self.get_session() as session:
            user = session.exec(select(User).where(User.email == email)).first()

            if not user:
                return None

            user.last_login = datetime.utcnow().isoformat() + "Z"
            session.add(user)
            session.commit()
            session.refresh(user)
            return user

    def delete_user(self, email: str) -> bool:
        """Delete user by email."""
        with self.get_session() as session:
            user = session.exec(select(User).where(User.email == email)).first()

            if not user:
                return False

            session.delete(user)
            session.commit()
            return True

    def create_or_update_user_from_firebase(self, firebase_user_data: dict) -> User:
        """Create or update user from Firebase authentication data."""
        email = firebase_user_data.get("email")
        if not email:
            raise ValueError("Email is required")

        # Check if user exists
        existing_user = self.get_user_by_email(email)

        if existing_user:
            # Update existing user with Firebase data
            update_data = UserUpdate(
                name=firebase_user_data.get("name", existing_user.name),
                picture=firebase_user_data.get("picture", existing_user.picture),
            )
            user = self.update_user(email, update_data)
            # Update last login
            user = self.update_last_login(email)
            return user
        else:
            # Create new user
            user_data = UserCreate(
                name=firebase_user_data.get("name", ""),
                email=email,
                picture=firebase_user_data.get("picture", ""),
                roles="public",  # Default role
                enabled=True,
            )
            user = self.create_user(user_data)
            # Set initial login time
            user = self.update_last_login(email)
            return user


# Global database manager instance
db_manager: Optional[DatabaseManager] = None


def get_database_manager() -> DatabaseManager:
    """Get the global database manager instance."""
    global db_manager
    if db_manager is None:
        # Get database URL from environment or use default
        database_url = os.getenv("DATABASE_URL", "sqlite:///./auth.db")
        db_manager = DatabaseManager(database_url)
    return db_manager


def init_database():
    """Initialize the database."""
    get_database_manager()
