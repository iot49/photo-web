import os
from datetime import datetime
from typing import List, Optional

from models import User, UserCreate, UserUpdate
from sqlmodel import Session, SQLModel, create_engine, select


class DatabaseManager:
    """Database manager for SQLite operations."""

    def __init__(self, database_url: str):
        """Initialize database connection.

        Args:
            database_url: SQLite database URL (e.g., 'sqlite:///./data/auth.db')
        """
        self.engine = create_engine(database_url, echo=False)
        self.create_tables()

    def create_tables(self):
        """Create database tables."""
        SQLModel.metadata.create_all(self.engine)

    def run_migrations(self):
        """Run database migrations. Should be called once during application startup."""
        import logging
        import traceback

        logger = logging.getLogger(__name__)

        try:
            from sqlalchemy import text

            with self.get_session() as session:
                # Create migrations table if it doesn't exist
                session.execute(
                    text("""
                    CREATE TABLE IF NOT EXISTS migrations (
                        id INTEGER PRIMARY KEY,
                        name TEXT UNIQUE NOT NULL,
                        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                )

                # Check if config column migration has already been applied
                result = session.execute(
                    text(
                        "SELECT COUNT(*) FROM migrations WHERE name = 'add_config_column'"
                    )
                )
                migration_exists = result.scalar() > 0

                if migration_exists:
                    logger.warning(
                        "MIGRATION: ✓ 'config' column migration already applied"
                    )
                    return

                logger.warning("MIGRATION: Starting config column migration...")

                # Check if config column exists
                result = session.execute(text("PRAGMA table_info(user)"))
                columns = result.fetchall()
                column_names = [col[1] for col in columns]

                if "config" not in column_names:
                    logger.warning(
                        "MIGRATION: Adding missing 'config' column to user table..."
                    )
                    # Add the config column with default value
                    session.execute(
                        text("ALTER TABLE user ADD COLUMN config TEXT DEFAULT '{}'")
                    )
                    logger.warning(
                        "MIGRATION: ✓ Successfully added 'config' column to user table"
                    )

                # Record that this migration has been applied
                session.execute(
                    text("INSERT INTO migrations (name) VALUES ('add_config_column')")
                )
                session.commit()
                logger.warning(
                    "MIGRATION: ✓ Config column migration completed and recorded"
                )

        except Exception as e:
            logger.error(f"MIGRATION ERROR: Error during config column migration: {e}")
            logger.error(f"MIGRATION ERROR: Traceback: {traceback.format_exc()}")
            # Don't raise the exception - let the app continue to work

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

            # Set created_at to current date if not provided
            if not user_dict.get("created_at"):
                user_dict["created_at"] = datetime.now().strftime("%Y-%m-%d")

            user = User(**user_dict)
            session.add(user)
            session.commit()
            session.refresh(user)
            return user

    def get_user_by_email(self, email: str) -> Optional[User]:
        """Get user by email."""
        with self.get_session() as session:
            user = session.exec(select(User).where(User.email == email)).first()

            # Add admin role if this is the super user
            if user:
                if user.email == os.getenv("SUPER_USER_EMAIL"):
                    # Ensure admin role is present
                    roles = set(
                        [role.strip() for role in user.roles.split(",") if role.strip()]
                    )
                    roles.add("admin")
                    user.roles = ",".join(sorted(roles))

            return user

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

            user.last_login = datetime.now().isoformat() + "Z"
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
                created_at=datetime.now().strftime("%Y-%m-%d"),
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
        # Get database URL from environment (required)
        database_url = os.getenv("DATABASE_URL")
        if not database_url:
            raise ValueError("DATABASE_URL environment variable is required")
        db_manager = DatabaseManager(database_url)
    return db_manager


def init_database():
    """Initialize the database and run migrations."""
    db_manager = get_database_manager()
    db_manager.run_migrations()
