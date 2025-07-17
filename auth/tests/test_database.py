import os
import sys
import tempfile

import pytest
from sqlmodel import text

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import DatabaseManager
from app.models import UserCreate, UserUpdate


@pytest.fixture
def temp_db():
    """Create a temporary database for testing."""
    # Create a temporary file for the test database
    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".db")
    temp_file.close()

    database_url = f"sqlite:///{temp_file.name}"
    db_manager = DatabaseManager(database_url)

    yield db_manager

    # Cleanup
    os.unlink(temp_file.name)


def test_create_tables(temp_db):
    """Test that tables are created successfully."""
    # Tables should be created during DatabaseManager initialization
    with temp_db.get_session() as session:
        # Check if User table exists by trying to query it
        result = session.exec(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='user'")
        ).first()
        assert result is not None


def test_create_user(temp_db):
    """Test creating a new user."""
    user_data = UserCreate(
        name="John Doe",
        email="john.doe@example.com",
        uuid="firebase-uuid-123",
        picture="https://example.com/profile.jpg",
        roles="public,photos",
    )

    user = temp_db.create_user(user_data)

    assert user.id is not None
    assert user.name == "John Doe"
    assert user.email == "john.doe@example.com"
    assert user.uuid == "firebase-uuid-123"
    assert user.picture == "https://example.com/profile.jpg"
    assert user.roles == "public,photos"
    assert user.enabled is True
    assert user.last_login == ""


def test_create_duplicate_user(temp_db):
    """Test that creating a user with duplicate email raises an error."""
    user_data = UserCreate(
        name="John Doe", email="john.doe@example.com", uuid="firebase-uuid-123"
    )

    # Create first user
    temp_db.create_user(user_data)

    # Try to create duplicate user
    with pytest.raises(
        ValueError, match="User with email john.doe@example.com already exists"
    ):
        temp_db.create_user(user_data)


def test_get_user_by_email(temp_db):
    """Test retrieving a user by email."""
    user_data = UserCreate(
        name="Jane Smith", email="jane.smith@example.com", uuid="firebase-uuid-456"
    )

    created_user = temp_db.create_user(user_data)
    retrieved_user = temp_db.get_user_by_email("jane.smith@example.com")

    assert retrieved_user is not None
    assert retrieved_user.id == created_user.id
    assert retrieved_user.email == "jane.smith@example.com"
    assert retrieved_user.name == "Jane Smith"


def test_get_nonexistent_user_by_email(temp_db):
    """Test retrieving a non-existent user by email."""
    user = temp_db.get_user_by_email("nonexistent@example.com")
    assert user is None


def test_get_user_by_id(temp_db):
    """Test retrieving a user by ID."""
    user_data = UserCreate(
        name="Bob Wilson", email="bob.wilson@example.com", uuid="firebase-uuid-789"
    )

    created_user = temp_db.create_user(user_data)
    retrieved_user = temp_db.get_user_by_id(created_user.id)

    assert retrieved_user is not None
    assert retrieved_user.id == created_user.id
    assert retrieved_user.email == "bob.wilson@example.com"


def test_get_all_users(temp_db):
    """Test retrieving all users."""
    # Initially should be empty
    users = temp_db.get_all_users()
    assert len(users) == 0

    # Create some users
    user1_data = UserCreate(name="User 1", email="user1@example.com", uuid="uuid1")
    user2_data = UserCreate(name="User 2", email="user2@example.com", uuid="uuid2")

    temp_db.create_user(user1_data)
    temp_db.create_user(user2_data)

    users = temp_db.get_all_users()
    assert len(users) == 2

    emails = [user.email for user in users]
    assert "user1@example.com" in emails
    assert "user2@example.com" in emails


def test_update_user(temp_db):
    """Test updating a user."""
    user_data = UserCreate(
        name="Original Name",
        email="update.test@example.com",
        uuid="firebase-uuid-update",
        roles="public",
    )

    created_user = temp_db.create_user(user_data)

    # Update user
    update_data = UserUpdate(name="Updated Name", roles="public,admin", enabled=False)

    updated_user = temp_db.update_user("update.test@example.com", update_data)

    assert updated_user is not None
    assert updated_user.name == "Updated Name"
    assert updated_user.roles == "public,admin"
    assert updated_user.enabled is False
    assert updated_user.email == "update.test@example.com"  # Should remain unchanged


def test_update_nonexistent_user(temp_db):
    """Test updating a non-existent user."""
    update_data = UserUpdate(name="New Name")
    result = temp_db.update_user("nonexistent@example.com", update_data)
    assert result is None


def test_update_last_login(temp_db):
    """Test updating user's last login timestamp."""
    user_data = UserCreate(
        name="Login Test", email="login.test@example.com", uuid="firebase-uuid-login"
    )

    created_user = temp_db.create_user(user_data)
    assert created_user.last_login == ""

    # Update last login
    updated_user = temp_db.update_last_login("login.test@example.com")

    assert updated_user is not None
    assert updated_user.last_login != ""
    assert updated_user.last_login.endswith("Z")  # Should be UTC format


def test_delete_user(temp_db):
    """Test deleting a user."""
    user_data = UserCreate(
        name="Delete Test", email="delete.test@example.com", uuid="firebase-uuid-delete"
    )

    temp_db.create_user(user_data)

    # Verify user exists
    user = temp_db.get_user_by_email("delete.test@example.com")
    assert user is not None

    # Delete user
    success = temp_db.delete_user("delete.test@example.com")
    assert success is True

    # Verify user is deleted
    user = temp_db.get_user_by_email("delete.test@example.com")
    assert user is None


def test_delete_nonexistent_user(temp_db):
    """Test deleting a non-existent user."""
    success = temp_db.delete_user("nonexistent@example.com")
    assert success is False


def test_create_or_update_user_from_firebase_new_user(temp_db):
    """Test creating a new user from Firebase data."""
    firebase_data = {
        "email": "firebase.new@example.com",
        "name": "Firebase User",
        "uid": "firebase-uid-123",
        "picture": "https://firebase.com/profile.jpg",
    }

    user = temp_db.create_or_update_user_from_firebase(firebase_data)

    assert user.email == "firebase.new@example.com"
    assert user.name == "Firebase User"
    assert user.uuid == "firebase-uid-123"
    assert user.picture == "https://firebase.com/profile.jpg"
    assert user.roles == "public"  # Default role
    assert user.enabled is True
    assert user.last_login != ""  # Should be set


def test_create_or_update_user_from_firebase_existing_user(temp_db):
    """Test updating an existing user from Firebase data."""
    # Create initial user
    user_data = UserCreate(
        name="Original Name",
        email="firebase.existing@example.com",
        uuid="original-uuid",
        roles="public,admin",
    )
    temp_db.create_user(user_data)

    # Update with Firebase data
    firebase_data = {
        "email": "firebase.existing@example.com",
        "name": "Updated Firebase Name",
        "uid": "original-uuid",
        "picture": "https://firebase.com/new-profile.jpg",
    }

    user = temp_db.create_or_update_user_from_firebase(firebase_data)

    assert user.email == "firebase.existing@example.com"
    assert user.name == "Updated Firebase Name"
    assert user.picture == "https://firebase.com/new-profile.jpg"
    assert user.roles == "public,admin"  # Should preserve existing roles
    assert user.last_login != ""  # Should be updated


def test_create_or_update_user_from_firebase_missing_email(temp_db):
    """Test that missing email raises an error."""
    firebase_data = {"name": "No Email User", "uid": "firebase-uid-no-email"}

    with pytest.raises(ValueError, match="Email is required"):
        temp_db.create_or_update_user_from_firebase(firebase_data)


if __name__ == "__main__":
    pytest.main([__file__])
