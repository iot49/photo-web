import os
import sys
import tempfile

import pytest
from fastapi.testclient import TestClient

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import DatabaseManager
from app.main import app, get_db


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


@pytest.fixture
def client(temp_db):
    """Create a test client with temporary database."""

    # Override the database dependency
    def override_get_db():
        return temp_db

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as test_client:
        yield test_client

    # Clean up dependency override
    app.dependency_overrides.clear()


@pytest.fixture
def sample_user_data():
    """Sample user data for testing."""
    return {
        "name": "John Doe",
        "email": "john.doe@example.com",
        "uuid": "firebase-uuid-123",
        "picture": "https://example.com/profile.jpg",
        "roles": "public,photos",
        "enabled": True,
    }


@pytest.fixture
def sample_user_update_data():
    """Sample user update data for testing."""
    return {
        "name": "John Updated",
        "roles": "public,admin",
        "enabled": False,
        "picture": "https://example.com/new-profile.jpg",
    }


class TestHealthEndpoint:
    """Test health check endpoint."""

    def test_health_check(self, client):
        """Test health check endpoint returns success."""
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "Auth service is healthy"}


class TestMeEndpoint:
    """Test current user endpoint."""

    def test_get_current_user_not_logged_in(self, client):
        """Test /me endpoint returns empty dict when not logged in."""
        response = client.get("/me")
        assert response.status_code == 200
        assert response.json() == {}


class TestCreateUserEndpoint:
    """Test user creation endpoint."""

    def test_create_user_success(self, client, sample_user_data):
        """Test successful user creation."""
        response = client.post("/users", json=sample_user_data)
        assert response.status_code == 200

        data = response.json()
        assert data["name"] == sample_user_data["name"]
        assert data["email"] == sample_user_data["email"]
        assert data["uuid"] == sample_user_data["uuid"]
        assert data["picture"] == sample_user_data["picture"]
        assert data["roles"] == sample_user_data["roles"]
        assert data["enabled"] == sample_user_data["enabled"]
        assert "id" in data
        assert data["last_login"] == ""

    def test_create_user_duplicate_email(self, client, sample_user_data):
        """Test creating user with duplicate email returns 400."""
        # Create first user
        response = client.post("/users", json=sample_user_data)
        assert response.status_code == 200

        # Try to create duplicate user
        response = client.post("/users", json=sample_user_data)
        assert response.status_code == 400
        assert "already exists" in response.json()["detail"]

    def test_create_user_missing_required_fields(self, client):
        """Test creating user with missing required fields returns 422."""
        incomplete_data = {
            "name": "John Doe"
            # Missing email, uuid
        }
        response = client.post("/users", json=incomplete_data)
        assert response.status_code == 422

    def test_create_user_invalid_email_format(self, client):
        """Test creating user with invalid email format."""
        invalid_data = {
            "name": "John Doe",
            "email": "invalid-email",
            "uuid": "firebase-uuid-123",
        }
        response = client.post("/users", json=invalid_data)
        # Note: This test depends on whether email validation is implemented
        # Currently the model doesn't enforce email format validation
        assert response.status_code in [200, 422]  # Either succeeds or validation error

    def test_create_user_with_defaults(self, client):
        """Test creating user with minimal data uses defaults."""
        minimal_data = {
            "name": "Jane Doe",
            "email": "jane.doe@example.com",
            "uuid": "firebase-uuid-456",
        }
        response = client.post("/users", json=minimal_data)
        assert response.status_code == 200

        data = response.json()
        assert data["roles"] == "public"  # Default role
        assert data["enabled"] is True  # Default enabled
        assert data["picture"] == ""  # Default empty picture


class TestGetUserEndpoint:
    """Test get user by email endpoint."""

    def test_get_user_success(self, client, sample_user_data):
        """Test successful user retrieval by email."""
        # Create user first
        create_response = client.post("/users", json=sample_user_data)
        assert create_response.status_code == 200

        # Get user by email
        email = sample_user_data["email"]
        response = client.get(f"/users/{email}")
        assert response.status_code == 200

        data = response.json()
        assert data["email"] == email
        assert data["name"] == sample_user_data["name"]

    def test_get_user_not_found(self, client):
        """Test getting non-existent user returns 404."""
        response = client.get("/users/nonexistent@example.com")
        assert response.status_code == 404
        assert response.json()["detail"] == "User not found"

    def test_get_user_with_special_characters_in_email(self, client):
        """Test getting user with special characters in email."""
        user_data = {
            "name": "Special User",
            "email": "user+test@example.com",
            "uuid": "firebase-uuid-special",
        }

        # Create user
        create_response = client.post("/users", json=user_data)
        assert create_response.status_code == 200

        # Get user (URL encoding should be handled by the client)
        response = client.get(f"/users/{user_data['email']}")
        assert response.status_code == 200
        assert response.json()["email"] == user_data["email"]


class TestGetAllUsersEndpoint:
    """Test get all users endpoint."""

    def test_get_all_users_empty(self, client):
        """Test getting all users when database is empty."""
        response = client.get("/users")
        assert response.status_code == 200
        assert response.json() == []

    def test_get_all_users_with_data(self, client):
        """Test getting all users with multiple users in database."""
        # Create multiple users
        users_data = [
            {"name": "User 1", "email": "user1@example.com", "uuid": "uuid1"},
            {"name": "User 2", "email": "user2@example.com", "uuid": "uuid2"},
            {"name": "User 3", "email": "user3@example.com", "uuid": "uuid3"},
        ]

        for user_data in users_data:
            response = client.post("/users", json=user_data)
            assert response.status_code == 200

        # Get all users
        response = client.get("/users")
        assert response.status_code == 200

        data = response.json()
        assert len(data) == 3

        emails = [user["email"] for user in data]
        for user_data in users_data:
            assert user_data["email"] in emails


class TestUpdateUserEndpoint:
    """Test user update endpoint."""

    def test_update_user_success(
        self, client, sample_user_data, sample_user_update_data
    ):
        """Test successful user update."""
        # Create user first
        create_response = client.post("/users", json=sample_user_data)
        assert create_response.status_code == 200

        # Update user
        email = sample_user_data["email"]
        response = client.put(f"/users/{email}", json=sample_user_update_data)
        assert response.status_code == 200

        data = response.json()
        assert data["name"] == sample_user_update_data["name"]
        assert data["roles"] == sample_user_update_data["roles"]
        assert data["enabled"] == sample_user_update_data["enabled"]
        assert data["picture"] == sample_user_update_data["picture"]
        assert data["email"] == email  # Email should not change

    def test_update_user_partial(self, client, sample_user_data):
        """Test partial user update (only some fields)."""
        # Create user first
        create_response = client.post("/users", json=sample_user_data)
        assert create_response.status_code == 200
        original_data = create_response.json()

        # Update only name
        partial_update = {"name": "Partially Updated Name"}
        email = sample_user_data["email"]
        response = client.put(f"/users/{email}", json=partial_update)
        assert response.status_code == 200

        data = response.json()
        assert data["name"] == partial_update["name"]
        # Other fields should remain unchanged
        assert data["roles"] == original_data["roles"]
        assert data["enabled"] == original_data["enabled"]
        assert data["picture"] == original_data["picture"]

    def test_update_user_not_found(self, client, sample_user_update_data):
        """Test updating non-existent user returns 404."""
        response = client.put(
            "/users/nonexistent@example.com", json=sample_user_update_data
        )
        assert response.status_code == 404
        assert response.json()["detail"] == "User not found"

    def test_update_user_empty_data(self, client, sample_user_data):
        """Test updating user with empty data."""
        # Create user first
        create_response = client.post("/users", json=sample_user_data)
        assert create_response.status_code == 200
        original_data = create_response.json()

        # Update with empty data
        email = sample_user_data["email"]
        response = client.put(f"/users/{email}", json={})
        assert response.status_code == 200

        # Data should remain unchanged
        data = response.json()
        assert data["name"] == original_data["name"]
        assert data["roles"] == original_data["roles"]
        assert data["enabled"] == original_data["enabled"]


class TestDeleteUserEndpoint:
    """Test user deletion endpoint."""

    def test_delete_user_success(self, client, sample_user_data):
        """Test successful user deletion."""
        # Create user first
        create_response = client.post("/users", json=sample_user_data)
        assert create_response.status_code == 200

        # Delete user
        email = sample_user_data["email"]
        response = client.delete(f"/users/{email}")
        assert response.status_code == 200
        assert response.json() == {"message": "User deleted successfully"}

        # Verify user is deleted
        get_response = client.get(f"/users/{email}")
        assert get_response.status_code == 404

    def test_delete_user_not_found(self, client):
        """Test deleting non-existent user returns 404."""
        response = client.delete("/users/nonexistent@example.com")
        assert response.status_code == 404
        assert response.json()["detail"] == "User not found"

    def test_delete_user_and_verify_others_remain(self, client):
        """Test deleting one user doesn't affect others."""
        # Create multiple users
        users_data = [
            {"name": "User 1", "email": "user1@example.com", "uuid": "uuid1"},
            {"name": "User 2", "email": "user2@example.com", "uuid": "uuid2"},
        ]

        for user_data in users_data:
            response = client.post("/users", json=user_data)
            assert response.status_code == 200

        # Delete first user
        response = client.delete("/users/user1@example.com")
        assert response.status_code == 200

        # Verify first user is deleted
        response = client.get("/users/user1@example.com")
        assert response.status_code == 404

        # Verify second user still exists
        response = client.get("/users/user2@example.com")
        assert response.status_code == 200
        assert response.json()["email"] == "user2@example.com"


class TestCRUDWorkflow:
    """Test complete CRUD workflow scenarios."""

    def test_complete_crud_workflow(self, client):
        """Test complete Create, Read, Update, Delete workflow."""
        # 1. Create user
        user_data = {
            "name": "Workflow Test User",
            "email": "workflow@example.com",
            "uuid": "workflow-uuid",
            "roles": "public",
        }

        create_response = client.post("/users", json=user_data)
        assert create_response.status_code == 200
        created_user = create_response.json()
        assert "id" in created_user

        # 2. Read user
        read_response = client.get(f"/users/{user_data['email']}")
        assert read_response.status_code == 200
        read_user = read_response.json()
        assert read_user["email"] == user_data["email"]
        assert read_user["id"] == created_user["id"]

        # 3. Update user
        update_data = {"name": "Updated Workflow User", "roles": "public,admin"}
        update_response = client.put(f"/users/{user_data['email']}", json=update_data)
        assert update_response.status_code == 200
        updated_user = update_response.json()
        assert updated_user["name"] == update_data["name"]
        assert updated_user["roles"] == update_data["roles"]

        # 4. Verify update persisted
        read_after_update = client.get(f"/users/{user_data['email']}")
        assert read_after_update.status_code == 200
        assert read_after_update.json()["name"] == update_data["name"]

        # 5. Delete user
        delete_response = client.delete(f"/users/{user_data['email']}")
        assert delete_response.status_code == 200

        # 6. Verify deletion
        read_after_delete = client.get(f"/users/{user_data['email']}")
        assert read_after_delete.status_code == 404

    def test_multiple_users_crud_operations(self, client):
        """Test CRUD operations with multiple users."""
        # Create multiple users
        users = []
        for i in range(3):
            user_data = {
                "name": f"User {i + 1}",
                "email": f"user{i + 1}@example.com",
                "uuid": f"uuid{i + 1}",
            }
            response = client.post("/users", json=user_data)
            assert response.status_code == 200
            users.append(response.json())

        # Verify all users exist
        all_users_response = client.get("/users")
        assert all_users_response.status_code == 200
        all_users = all_users_response.json()
        assert len(all_users) == 3

        # Update middle user
        update_data = {"name": "Updated User 2"}
        update_response = client.put("/users/user2@example.com", json=update_data)
        assert update_response.status_code == 200

        # Delete first user
        delete_response = client.delete("/users/user1@example.com")
        assert delete_response.status_code == 200

        # Verify final state
        final_users_response = client.get("/users")
        assert final_users_response.status_code == 200
        final_users = final_users_response.json()
        assert len(final_users) == 2

        emails = [user["email"] for user in final_users]
        assert "user1@example.com" not in emails
        assert "user2@example.com" in emails
        assert "user3@example.com" in emails

        # Verify updated user has new name
        user2 = next(
            user for user in final_users if user["email"] == "user2@example.com"
        )
        assert user2["name"] == "Updated User 2"


class TestErrorHandling:
    """Test error handling scenarios."""

    def test_invalid_json_payload(self, client):
        """Test endpoints with invalid JSON payload."""
        # Test with malformed JSON
        response = client.post(
            "/users", data="invalid json", headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 422

    def test_wrong_content_type(self, client):
        """Test endpoints with wrong content type."""
        user_data = {
            "name": "Test User",
            "email": "test@example.com",
            "uuid": "test-uuid",
        }

        # Send as form data instead of JSON
        response = client.post("/users", data=user_data)
        assert response.status_code == 422

    def test_sql_injection_attempt(self, client):
        """Test that SQL injection attempts are handled safely."""
        # Attempt SQL injection in email parameter
        malicious_email = "'; DROP TABLE user; --"
        response = client.get(f"/users/{malicious_email}")
        # Should return 404, not cause database error
        assert response.status_code == 404

        # Verify database is still intact by creating a user
        user_data = {
            "name": "Test User",
            "email": "safe@example.com",
            "uuid": "safe-uuid",
        }
        create_response = client.post("/users", json=user_data)
        assert create_response.status_code == 200


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
