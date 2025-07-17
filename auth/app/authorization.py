import csv
import fnmatch
import logging
from typing import List, Optional

try:
    import httpx
except ImportError:
    httpx = None

from fastapi import Request

logger = logging.getLogger(__name__)
logger.setLevel(logging.WARNING)


class AuthorizationRule:
    """Represents a single authorization rule from roles.csv"""

    def __init__(self, action: str, uri_pattern: str, role: Optional[str] = None):
        self.action = action.strip().lower()
        self.uri_pattern = uri_pattern.strip()
        self.role = role.strip() if role and role.strip() else None

    def matches_uri(self, uri: str) -> bool:
        """Check if the URI matches this rule's pattern using fnmatch"""
        return fnmatch.fnmatch(uri, self.uri_pattern)

    def applies_to_role(self, user_roles: List[str]) -> bool:
        """Check if this rule applies to the given user roles"""
        if self.role is None:
            return True  # Rule applies to all roles
        if self.is_delegated:
            return True  # Delegated rules apply to all roles (delegation service will check)
        return self.role in user_roles

    @property
    def is_delegated(self) -> bool:
        """Check if this rule delegates authorization to another service"""
        return self.role is not None and self.role.startswith("!")

    @property
    def delegation_url(self) -> str:
        """Get the delegation URL if this is a delegated rule"""
        if self.is_delegated:
            return f"http://{self.role[1:]}"  # Remove the ! prefix
        return ""


class AuthorizationManager:
    """Manages authorization rules and checks"""

    def __init__(self, roles_file_path: str = "app/roles.csv"):
        self.roles_file_path = roles_file_path
        self.rules: List[AuthorizationRule] = []
        self.load_rules()

    def load_rules(self):
        """Load authorization rules from CSV file"""
        self.rules = []

        try:
            with open(self.roles_file_path, "r", newline="") as csvfile:
                reader = csv.reader(csvfile)
                for row_num, row in enumerate(reader, 1):
                    if not row or row[0].strip().startswith("#"):
                        continue  # Skip empty rows and comments

                    if len(row) < 2:
                        logger.warning(f"Invalid rule at line {row_num}: {row}")
                        continue

                    action = row[0]
                    uri_pattern = row[1]
                    role = row[2] if len(row) > 2 else None

                    rule = AuthorizationRule(action, uri_pattern, role)
                    self.rules.append(rule)

            logger.info(
                f"Loaded {len(self.rules)} authorization rules from {self.roles_file_path}"
            )

        except FileNotFoundError:
            logger.error(f"Authorization rules file not found: {self.roles_file_path}")
        except Exception as e:
            logger.error(f"Error loading authorization rules: {e}")

    def is_authorized(
        self, uri: str, user_roles: List[str], request: Optional[Request] = None
    ) -> bool:
        """
        Check if user with given roles is authorized to access the URI.

        Rules are processed in order. First matching rule determines the result.
        If no rules match, access is denied by default.

        Args:
            uri: The URI to check authorization for
            user_roles: List of user roles
            request: FastAPI Request object (required for delegation)
        """
        for rule in self.rules:
            if rule.matches_uri(uri) and rule.applies_to_role(user_roles):
                logger.debug(
                    f"RULE matched: {rule.action} {rule.uri_pattern} {rule.role} for URI {uri} with roles {user_roles}"
                )

                if rule.action == "allow":
                    if rule.is_delegated:
                        # Delegate authorization to another service
                        logger.debug(
                            f"DELEGATE: {rule.action} {rule.uri_pattern} {rule.role} for URI {uri} with roles {user_roles}"
                        )
                        return self._delegate_authorization(
                            rule, uri, user_roles, request
                        )
                    else:
                        return True
                else:
                    return False

        # No matching rule found, deny by default
        logger.debug(
            f"No matching rule found for URI {uri} with roles {user_roles}, denying access"
        )
        return False

    def _delegate_authorization(
        self,
        rule: AuthorizationRule,
        uri: str,
        user_roles: List[str],
        request: Optional[Request],
    ) -> bool:
        """
        Delegate authorization to another service.
        Args:
            rule: The authorization rule with delegation URL
            uri: The original URI being accessed
            user_roles: The user's roles
            request: FastAPI Request object containing headers and cookies
        Returns:
            True if delegated service authorizes access, False otherwise
        """
        if not request:
            logger.error("Request object required for delegation but not provided")
            return False
        try:
            delegation_url = rule.delegation_url
            # Prepare headers to forward to delegation service
            headers = {
                "X-Forwarded-Uri": uri,
                "X-Forwarded-Roles": ",".join(user_roles),
                "X-Forwarded-Method": request.method,
                "X-Forwarded-Host": request.headers.get("host", ""),
                "X-Forwarded-Proto": request.headers.get("x-forwarded-proto", "http"),
                "User-Agent": request.headers.get("user-agent", ""),
            }

            # Forward the session cookie for authentication
            cookies = {}
            if "session" in request.cookies:
                cookies["session"] = request.cookies["session"]

            full_url = f"{delegation_url}/authorize"
            logger.debug(
                f"DELEGATE: Making request to {full_url} with headers {headers}"
            )

            # Make HTTP request to delegation service
            with httpx.Client(timeout=5.0) as client:
                response = client.get(full_url, headers=headers, cookies=cookies)

                # 2xx status codes indicate authorization success
                authorized = 200 <= response.status_code < 300
                logger.debug(
                    f"GOT {response.status_code}, body: {response.text}, auth: {authorized}"
                )

                return authorized

        except httpx.TimeoutException:
            logger.error(
                f"Timeout when delegating authorization to {rule.delegation_url}", e
            )
            return False
        except httpx.RequestError as e:
            logger.error(
                f"Error delegating authorization to {rule.delegation_url}: {e}", e
            )
            return False
        except Exception as e:
            logger.error(f"Unexpected error during delegation: {e}", e)
            return False


# Global authorization manager instance
auth_manager: Optional[AuthorizationManager] = None


def get_authorization_manager() -> AuthorizationManager:
    """Get the global authorization manager instance"""
    global auth_manager
    if auth_manager is None:
        auth_manager = AuthorizationManager()
    return auth_manager
