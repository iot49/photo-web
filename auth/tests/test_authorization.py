import os
import sys
import tempfile
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.authorization import AuthorizationManager, AuthorizationRule
from app.database import DatabaseManager
from app.main import app, get_db
from app.models import UserCreate


@pytest.fixture
def temp_roles_file():
    """Create a temporary roles.csv file for testing."""
    temp_file = tempfile.NamedTemporaryFile(mode="w", delete=False, suffix=".csv")
    temp_file.write("deny, /auth/authorize\n")
    temp_file.write("deny, /auth/users*, public\n")
    temp_file.write("deny, /auth/users*, protected\n")
    temp_file.write("allow, /auth/*, admin\n")
    temp_file.write("allow, /auth*, public\n")
    temp_file.write("allow, /photos/api/*, public\n")
    temp_file.write("allow, /private/*, private\n")
    temp_file.close()

    yield temp_file.name

    # Cleanup
    os.unlink(temp_file.name)


@pytest.fixture
def temp_db():
    """Create a temporary database for testing."""
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

    def override_get_db():
        return temp_db

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as test_client:
        yield test_client

    # Clean up dependency override
    app.dependency_overrides.clear()


class TestAuthorizationRule:
    """Test AuthorizationRule class."""

    def test_rule_creation(self):
        """Test creating authorization rules."""
        rule = AuthorizationRule("allow", "/photos/*", "public")
        assert rule.action == "allow"
        assert rule.uri_pattern == "/photos/*"
        assert rule.role == "public"

    def test_rule_creation_no_role(self):
        """Test creating rule without specific role."""
        rule = AuthorizationRule("deny", "/admin/*")
        assert rule.action == "deny"
        assert rule.uri_pattern == "/admin/*"
        assert rule.role is None

    def test_uri_matching(self):
        """Test URI pattern matching."""
        rule = AuthorizationRule("allow", "/photos/*", "public")

        assert rule.matches_uri("/photos/api/albums")
        assert rule.matches_uri("/photos/test")
        assert not rule.matches_uri("/auth/login")
        assert not rule.matches_uri("/photos")  # No trailing slash

    def test_uri_matching_exact(self):
        """Test exact URI matching."""
        rule = AuthorizationRule("deny", "/auth/authorize", None)

        assert rule.matches_uri("/auth/authorize")
        assert not rule.matches_uri("/auth/authorize/test")
        assert not rule.matches_uri("/auth/login")

    def test_role_application(self):
        """Test role application logic."""
        # Rule with specific role
        rule_with_role = AuthorizationRule("allow", "/admin/*", "admin")
        assert rule_with_role.applies_to_role(["admin"])
        assert rule_with_role.applies_to_role(["public", "admin"])
        assert not rule_with_role.applies_to_role(["public"])
        assert not rule_with_role.applies_to_role([])

        # Rule without specific role (applies to all)
        rule_without_role = AuthorizationRule("deny", "/forbidden/*", None)
        assert rule_without_role.applies_to_role(["admin"])
        assert rule_without_role.applies_to_role(["public"])
        assert rule_without_role.applies_to_role([])


class TestAuthorizationManager:
    """Test AuthorizationManager class."""

    def test_load_rules(self, temp_roles_file):
        """Test loading rules from CSV file."""
        auth_manager = AuthorizationManager(temp_roles_file)

        assert len(auth_manager.rules) == 7

        # Check first rule (should be deny /auth/authorize)
        rule1 = auth_manager.rules[0]
        assert rule1.action == "deny"
        assert rule1.uri_pattern == "/auth/authorize"
        assert rule1.role is None

    def test_authorization_public_access(self, temp_roles_file):
        """Test public access authorization."""
        auth_manager = AuthorizationManager(temp_roles_file)

        # Public access should be allowed
        assert auth_manager.is_authorized("/photos/api/albums", ["public"])
        assert auth_manager.is_authorized("/auth/login", ["public"])
        assert auth_manager.is_authorized("/auth/health", ["public"])

    def test_authorization_admin_access(self, temp_roles_file):
        """Test admin access authorization."""
        auth_manager = AuthorizationManager(temp_roles_file)

        # Admin should have access to admin endpoints
        assert auth_manager.is_authorized("/auth/users", ["admin"])
        assert auth_manager.is_authorized("/auth/users/test@example.com", ["admin"])

    def test_authorization_denied_access(self, temp_roles_file):
        """Test denied access scenarios."""
        auth_manager = AuthorizationManager(temp_roles_file)

        # These should be denied
        assert not auth_manager.is_authorized("/auth/authorize", ["public"])
        assert not auth_manager.is_authorized("/auth/authorize", ["admin"])
        assert not auth_manager.is_authorized("/auth/users", ["public"])

    def test_authorization_private_access(self, temp_roles_file):
        """Test private role access."""
        auth_manager = AuthorizationManager(temp_roles_file)

        # Private access
        assert auth_manager.is_authorized("/private/photos", ["private"])
        assert not auth_manager.is_authorized("/private/photos", ["public"])
        assert not auth_manager.is_authorized("/private/photos", ["protected"])

    def test_authorization_no_matching_rule(self, temp_roles_file):
        """Test authorization when no rule matches (should deny)."""
        auth_manager = AuthorizationManager(temp_roles_file)

        # No rule matches, should deny
        assert not auth_manager.is_authorized("/unknown/endpoint", ["public"])
        assert not auth_manager.is_authorized("/unknown/endpoint", ["admin"])

    def test_authorization_rule_order_matters(self, temp_roles_file):
        """Test that rule order matters (first match wins)."""
        auth_manager = AuthorizationManager(temp_roles_file)

        # /auth/authorize should be denied even for admin because deny rule comes first
        assert not auth_manager.is_authorized("/auth/authorize", ["admin"])


class TestAuthorizeEndpoint:
    """Test the /authorize endpoint."""

    def test_authorize_public_access_allowed(self, client, temp_roles_file):
        """Test authorize endpoint allows public access."""
        with patch("app.main.get_authorization_manager") as mock_get_auth_manager:
            mock_auth_manager = MagicMock()
            mock_auth_manager.is_authorized.return_value = True
            mock_get_auth_manager.return_value = mock_auth_manager

            response = client.get(
                "/authorize",
                headers={
                    "X-Forwarded-Uri": "/photos/api/albums",
                    "X-Forwarded-Host": "example.com",
                },
            )

            assert response.status_code == 200
            assert response.json()["status"] == "authorized"
            assert response.json()["roles"] == "public"

    def test_authorize_no_session_redirect_to_login(self, client, temp_roles_file):
        """Test authorize endpoint redirects to login when no session."""
        with patch("app.main.get_authorization_manager") as mock_get_auth_manager:
            mock_auth_manager = MagicMock()
            # First call (public access) returns False, triggering login check
            mock_auth_manager.is_authorized.return_value = False
            mock_get_auth_manager.return_value = mock_auth_manager

            response = client.get(
                "/authorize",
                headers={
                    "X-Forwarded-Uri": "/protected/resource",
                    "X-Forwarded-Host": "example.com",
                },
                follow_redirects=False,
            )

            assert response.status_code == 302
            assert (
                "/auth/login?redirect=/protected/resource"
                in response.headers["location"]
            )

    def test_authorize_invalid_session_redirect_to_login(self, client, temp_roles_file):
        """Test authorize endpoint redirects to login with invalid session."""
        with patch("app.main.get_authorization_manager") as mock_get_auth_manager:
            with patch("app.main.verify_session_token") as mock_verify:
                mock_auth_manager = MagicMock()
                mock_auth_manager.is_authorized.return_value = False
                mock_get_auth_manager.return_value = mock_auth_manager

                # Mock invalid session token
                mock_verify.return_value = {}

                response = client.get(
                    "/authorize",
                    headers={
                        "X-Forwarded-Uri": "/protected/resource",
                        "X-Forwarded-Host": "example.com",
                    },
                    cookies={"session": "invalid-token"},
                    follow_redirects=False,
                )

                assert response.status_code == 302
                assert (
                    "/auth/login?redirect=/protected/resource"
                    in response.headers["location"]
                )

    def test_authorize_valid_user_authorized(self, client, temp_db, temp_roles_file):
        """Test authorize endpoint with valid user and authorization."""
        # Create test user
        user_data = UserCreate(
            name="Test User",
            email="test@example.com",
            uuid="test-uuid",
            roles="admin",
            enabled=True,
        )
        temp_db.create_user(user_data)

        with patch("app.main.get_authorization_manager") as mock_get_auth_manager:
            with patch("app.main.verify_session_token") as mock_verify:
                mock_auth_manager = MagicMock()
                # First call (public) returns False, second call (with user roles) returns True
                mock_auth_manager.is_authorized.side_effect = [False, True]
                mock_get_auth_manager.return_value = mock_auth_manager

                # Mock valid session token
                mock_verify.return_value = {
                    "email": "test@example.com",
                    "uid": "test-uuid",
                }

                response = client.get(
                    "/authorize",
                    headers={
                        "X-Forwarded-Uri": "/auth/users",
                        "X-Forwarded-Host": "example.com",
                    },
                    cookies={"session": "valid-token"},
                )

                assert response.status_code == 200
                assert response.json()["status"] == "authorized"
                assert response.json()["user"] == "test@example.com"
                assert response.json()["roles"] == "admin"

    def test_authorize_valid_user_not_authorized(
        self, client, temp_db, temp_roles_file
    ):
        """Test authorize endpoint with valid user but not authorized."""
        # Create test user
        user_data = UserCreate(
            name="Test User",
            email="test@example.com",
            uuid="test-uuid",
            roles="public",
            enabled=True,
        )
        temp_db.create_user(user_data)

        with patch("app.main.get_authorization_manager") as mock_get_auth_manager:
            with patch("app.main.verify_session_token") as mock_verify:
                mock_auth_manager = MagicMock()
                # Both calls return False (not authorized)
                mock_auth_manager.is_authorized.return_value = False
                mock_get_auth_manager.return_value = mock_auth_manager

                # Mock valid session token
                mock_verify.return_value = {
                    "email": "test@example.com",
                    "uid": "test-uuid",
                }

                response = client.get(
                    "/authorize",
                    headers={
                        "X-Forwarded-Uri": "/admin/secret",
                        "X-Forwarded-Host": "example.com",
                    },
                    cookies={"session": "valid-token"},
                )

                assert response.status_code == 403
                assert "Access denied" in response.json()["detail"]

    def test_authorize_disabled_user(self, client, temp_db, temp_roles_file):
        """Test authorize endpoint with disabled user."""
        # Create disabled test user
        user_data = UserCreate(
            name="Disabled User",
            email="disabled@example.com",
            uuid="disabled-uuid",
            roles="admin",
            enabled=False,
        )
        temp_db.create_user(user_data)

        with patch("app.main.get_authorization_manager") as mock_get_auth_manager:
            with patch("app.main.verify_session_token") as mock_verify:
                mock_auth_manager = MagicMock()
                mock_auth_manager.is_authorized.return_value = False
                mock_get_auth_manager.return_value = mock_auth_manager

                # Mock valid session token
                mock_verify.return_value = {
                    "email": "disabled@example.com",
                    "uid": "disabled-uuid",
                }

                response = client.get(
                    "/authorize",
                    headers={
                        "X-Forwarded-Uri": "/auth/users",
                        "X-Forwarded-Host": "example.com",
                    },
                    cookies={"session": "valid-token"},
                )

                assert response.status_code == 403
                assert "User account is disabled" in response.json()["detail"]

    def test_authorize_user_not_in_database(self, client, temp_db, temp_roles_file):
        """Test authorize endpoint with user not in database."""
        with patch("app.main.get_authorization_manager") as mock_get_auth_manager:
            with patch("app.main.verify_session_token") as mock_verify:
                mock_auth_manager = MagicMock()
                mock_auth_manager.is_authorized.return_value = False
                mock_get_auth_manager.return_value = mock_auth_manager

                # Mock valid session token for user not in database
                mock_verify.return_value = {
                    "email": "notfound@example.com",
                    "uid": "notfound-uuid",
                }

                response = client.get(
                    "/authorize",
                    headers={
                        "X-Forwarded-Uri": "/auth/users",
                        "X-Forwarded-Host": "example.com",
                    },
                    cookies={"session": "valid-token"},
                )

                assert response.status_code == 403
                assert "User not found" in response.json()["detail"]

    def test_authorize_missing_headers(self, client, temp_roles_file):
        """Test authorize endpoint with missing forwarded headers."""
        with patch("app.main.get_authorization_manager") as mock_get_auth_manager:
            mock_auth_manager = MagicMock()
            mock_auth_manager.is_authorized.return_value = True
            mock_get_auth_manager.return_value = mock_auth_manager

            # Test without X-Forwarded-Uri header (should default to "/")
            response = client.get("/authorize")

            assert response.status_code == 200
            # Should check authorization for default URI "/"
            mock_auth_manager.is_authorized.assert_called_with("/", ["public"])


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
