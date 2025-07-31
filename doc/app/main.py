import logging
import os
from fnmatch import fnmatch
from typing import List

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, DirectoryPath, Field

# excludes (may use * and ? wildcards)
EXCLUDE_FILES = [".DS_Store"]
EXCLUDE_FOLDERS = ["__pycache__", ".venv", ".git", ".*cache"]

# Setup logging first
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

# set working directory to documents location (only in Docker container)
if os.path.exists("/docs"):
    os.chdir("/docs")
else:
    # For local development, use a test directory or current directory
    logger.warning(
        "Documents directory /docs not found, using current directory for development"
    )


def is_folder_empty(folder_path: str) -> bool:
    """Check if a folder is empty (contains no accessible files or folders)"""
    try:
        for item in os.listdir(folder_path):
            item_path = os.path.join(folder_path, item)
            if os.path.isfile(item_path):
                # Check if file should be excluded
                if not any(fnmatch(item, p) for p in EXCLUDE_FILES):
                    return False
            elif os.path.isdir(item_path):
                # Check if folder should be excluded
                if not any(fnmatch(item, p) for p in EXCLUDE_FOLDERS):
                    return False
        return True
    except (OSError, PermissionError):
        # If we can't access the folder, consider it empty
        return True


class FolderModel(BaseModel):
    """Model representing a folder structure with files and subfolders"""

    path: DirectoryPath = Field(
        description="Path relative to /docs root directory", example="admin/reports"
    )
    folders: List[str] = Field(
        description="Names of accessible sub-folders within this path",
        default=[],
        example=["monthly", "quarterly", "annual"],
    )
    files: List[str] = Field(
        description="Names of files within this path",
        default=[],
        example=["summary.pdf", "data.xlsx", "notes.txt"],
    )

    @property
    def realm(self) -> str:
        """Extract the top-level realm (role) from the path"""
        return os.path.normpath(self.path).split(os.sep)[0]

    @property
    def name(self) -> str:
        """Get the display name of this folder"""
        return os.path.normpath(self.path).split(os.sep)[-1]

    class Config:
        json_schema_extra = {
            "example": {
                "path": "admin/reports",
                "folders": ["monthly", "quarterly"],
                "files": ["summary.pdf", "overview.docx"],
            }
        }


class HealthResponse(BaseModel):
    """Health check response model"""

    status: str = Field(
        description="Service health status", example="Docs service is healthy"
    )


class AuthorizationResponse(BaseModel):
    """Authorization check response model"""

    status: str = Field(
        description="Authorization result",
        example="authorized /doc/api/folder/admin admin in ['admin', 'public']",
    )


class ErrorResponse(BaseModel):
    """Error response model"""

    detail: str = Field(
        description="Error message",
        example="Access denied for /doc/api/folder/admin and roles=['public']",
    )


app = FastAPI(
    title="Photo Web Document Service",
    description="""
    The Document Service provides secure, role-based access to document repositories 
    for the Photo Web application. Users can browse and access documents based on 
    their assigned roles and permissions.
    
    ## Features
    
    * **Role-based Access Control**: Documents organized by realms matching user roles
    * **Secure File Access**: Read-only access with path traversal protection  
    * **Delegated Authorization**: Integrates with auth service for permission validation
    * **File System Integration**: Direct access to host document repositories
    
    ## Authentication
    
    All endpoints (except health check) require authentication via the auth service.
    User roles are passed through request headers and determine document access.
    
    ## Document Realms
    
    Documents are organized into realms (top-level folders) that correspond to user roles:
    - `public`: Accessible to all authenticated users
    - `admin`: Accessible to users with admin role
    - `private`: Accessible to users with private role
    
    Access to a realm requires the corresponding role in the user's role list.
    """,
    version="1.0.0",
    root_path="/doc",
    contact={
        "name": "Photo Web Support",
        "url": "https://github.com/your-org/photo-web",
    },
    license_info={
        "name": "MIT License",
        "url": "https://opensource.org/licenses/MIT",
    },
)


@app.get(
    "/api/health",
    response_model=HealthResponse,
    summary="Health Check",
    description="Check if the document service is running and healthy",
    tags=["Health"],
)
async def health_check() -> HealthResponse:
    """
    Perform a basic health check of the document service.

    Returns:
        HealthResponse: Service health status
    """
    return HealthResponse(status="Docs service is healthy")


@app.get(
    "/api/root",
    response_model=FolderModel,
    summary="Get Accessible Document Realms",
    description="Retrieve the list of document realms (top-level folders) that the authenticated user can access based on their roles",
    responses={
        200: {
            "description": "Successfully retrieved accessible realms",
            "model": FolderModel,
        },
        403: {
            "description": "Access denied - user not authenticated",
            "model": ErrorResponse,
        },
    },
    tags=["Documents"],
)
async def get_roots(request: Request) -> FolderModel:
    """
    Get document realms accessible to the current user based on their roles.

    The service examines the user's roles (passed via X-Forwarded-Roles header)
    and returns only the document realms (top-level folders) that correspond to
    those roles and contain accessible content.

    Args:
        request: HTTP request containing user role information in headers

    Returns:
        FolderModel: Root folder model with accessible realms as subfolders

    Example:
        If user has roles ['admin', 'public'], they will see realms:
        - admin/ (if it exists and contains files)
        - public/ (if it exists and contains files)
    """
    roles = [
        role.strip()
        for role in request.headers.get("X-Forwarded-Roles", "public").split(",")
    ]
    roots = [
        folder
        for folder in roles
        if os.path.isdir(folder) and not is_folder_empty(folder)
    ]
    return FolderModel(path="", folders=sorted(roots))


@app.get(
    "/api/file/{path:path}",
    summary="Download File",
    description="Download or view a specific file from the document repository",
    responses={
        200: {
            "description": "File successfully retrieved",
            "content": {"application/octet-stream": {}},
        },
        403: {
            "description": "Access denied - insufficient permissions for this realm",
            "model": ErrorResponse,
        },
        404: {"description": "File not found", "model": ErrorResponse},
    },
    tags=["Documents"],
)
async def get_file(path: str):
    """
    Download or view a file from the document repository.

    Access is controlled by the realm (top-level folder) that contains the file.
    Users must have the corresponding role to access files in a realm.

    Args:
        path: File path relative to the document root (e.g., "admin/reports/summary.pdf")

    Returns:
        FileResponse: The requested file for download/viewing

    Raises:
        HTTPException: 403 if user lacks permission, 404 if file not found

    Example:
        GET /api/file/admin/reports/summary.pdf
        - Requires 'admin' role to access files in the 'admin' realm
    """
    normalized_path = os.path.normpath(path)
    if not os.path.isfile(normalized_path):
        raise HTTPException(status_code=404, detail=f"File not found: {path}")
    return FileResponse(normalized_path)


@app.get(
    "/api/folder/{path:path}",
    response_model=FolderModel,
    summary="Browse Folder Contents",
    description="Retrieve the contents of a specific folder in the document repository",
    responses={
        200: {
            "description": "Folder contents successfully retrieved",
            "model": FolderModel,
        },
        403: {
            "description": "Access denied - insufficient permissions for this realm",
            "model": ErrorResponse,
        },
        404: {"description": "Folder not found", "model": ErrorResponse},
    },
    tags=["Documents"],
)
async def get_folder(path: str) -> FolderModel:
    """
    Browse the contents of a folder in the document repository.

    Returns a list of subfolders and files within the specified path.
    Access is controlled by the realm (top-level folder) - users must have
    the corresponding role to browse folders within a realm.

    System files and empty folders are automatically filtered out.

    Args:
        path: Folder path relative to the document root (e.g., "admin/reports")

    Returns:
        FolderModel: Folder structure with subfolders and files

    Raises:
        HTTPException: 403 if user lacks permission, 404 if folder not found

    Example:
        GET /api/folder/admin/reports
        - Requires 'admin' role to browse the 'admin' realm
        - Returns subfolders and files within admin/reports/
    """
    normalized_path = os.path.normpath(path)

    if not os.path.isdir(normalized_path):
        raise HTTPException(status_code=404, detail=f"Folder not found: {path}")

    try:
        folders = [
            folder
            for folder in os.listdir(normalized_path)
            if os.path.isdir(os.path.join(normalized_path, folder))
            if not any(fnmatch(folder, p) for p in EXCLUDE_FOLDERS)
            if not is_folder_empty(os.path.join(normalized_path, folder))
        ]
        files = [
            file
            for file in os.listdir(normalized_path)
            if os.path.isfile(os.path.join(normalized_path, file))
            if not any(fnmatch(file, p) for p in EXCLUDE_FILES)
        ]
        return FolderModel(
            path=normalized_path, folders=sorted(folders), files=sorted(files)
        )
    except (OSError, PermissionError) as e:
        raise HTTPException(status_code=403, detail=f"Access denied: {str(e)}")


@app.get(
    "/authorize",
    response_model=AuthorizationResponse,
    summary="Internal Authorization Check",
    description="Internal endpoint used by the auth service for delegated authorization decisions",
    responses={
        200: {
            "description": "Access authorized for the requested resource",
            "model": AuthorizationResponse,
        },
        400: {
            "description": "Bad request - missing required headers",
            "model": ErrorResponse,
        },
        403: {
            "description": "Access denied - insufficient permissions",
            "model": ErrorResponse,
        },
        500: {
            "description": "Internal server error during authorization check",
            "model": ErrorResponse,
        },
    },
    tags=["Authorization"],
    include_in_schema=False,  # Hide from public API docs as this is internal
)
async def authorize_access(request: Request) -> AuthorizationResponse:
    """
    Internal authorization endpoint for delegated authorization from auth service.

    This endpoint is called by the auth service to determine if a user should
    be granted access to a specific document resource. Authorization is based
    on extracting the realm from the requested URI and checking if the user's
    roles include access to that realm.

    **Note**: This is an internal endpoint used by the auth service and should
    not be called directly by client applications.

    Recognized URI patterns:
    - `/doc/api/folder/{realm}/{path}` - Folder access
    - `/doc/api/file/{realm}/{path}` - File access

    Args:
        request: HTTP request containing X-Forwarded-Uri and X-Forwarded-Roles headers

    Returns:
        AuthorizationResponse: Authorization result with status message

    Raises:
        HTTPException:
            - 400 if required headers are missing
            - 403 if access is denied
            - 500 if authorization check fails

    Headers Required:
        - X-Forwarded-Uri: The original URI being accessed
        - X-Forwarded-Roles: Comma-separated list of user roles
    """
    try:
        uri = request.headers.get("X-Forwarded-Uri", "")
        if not uri:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="X-Forwarded-Uri header required",
            )

        roles = [
            role.strip().lower()
            for role in request.headers.get("X-Forwarded-Roles", "public").split(",")
        ]

        # Extract realm from URI path: /doc/api/folder/{realm}/...
        uri_parts = os.path.normpath(uri).split(os.sep)
        if len(uri_parts) < 5:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid URI format: {uri}",
            )

        realm = uri_parts[4]

        logger.debug(
            f"uri={uri} realm={realm} roles={roles} authorize={realm in roles}"
        )

        if realm in roles:
            return AuthorizationResponse(status=f"authorized {uri} {realm} in {roles}")

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied for {uri} and roles={roles}",
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Authorization check failed for {uri}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Authorization check failed for {uri}: {str(e)}",
        )
