import logging
from typing import Dict, List

from doc_utils import dedent_and_convert_to_html
from fastapi import APIRouter, Depends, HTTPException, Request
from models import DB, AlbumModel, PhotoModel

logger = logging.getLogger(__name__)

router = APIRouter()


async def get_db() -> DB:
    """Photos database dependency - will be overridden by main.py."""
    raise NotImplementedError("Database dependency not configured")


@router.get(
    "/api/albums/{album_uuid}",
    tags=["albums"],
    summary="Get Album Photos",
    description=dedent_and_convert_to_html(
        """
    Get detailed information for all photos in a specific album.
    
    Returns a list of all photos in the specified album including metadata
    such as dimensions, date taken, location, and camera information.
    File paths are excluded for security reasons.
    
    **Access Control:**
    - Album access determined by folder-based classification
    - Public albums: accessible to all users
    - Protected albums: require protected or private role
    - Private albums: require private role
    
    **Photo Metadata Included:**
    - UUID and filename
    - Dimensions (width/height)
    - Date taken and modified
    - Camera make and model
    - Location information (if available)
    - File size and format
    """
    ),
    responses={
        200: {
            "description": "Album photos successfully retrieved",
            "content": {
                "application/json": {
                    "example": [
                        {
                            "uuid": "photo-uuid-456",
                            "filename": "IMG_1234.HEIC",
                            "original_filename": "IMG_1234.HEIC",
                            "date_taken": "2024-01-15T14:30:00Z",
                            "date_modified": "2024-01-15T14:30:00Z",
                            "width": 4032,
                            "height": 3024,
                            "file_size": 2048576,
                            "camera_make": "Apple",
                            "camera_model": "iPhone 15 Pro",
                            "latitude": 37.7749,
                            "longitude": -122.4194,
                            "address": "San Francisco, CA",
                            "mime_type": "image/heic",
                            "uti": "public.heic",
                        }
                    ]
                }
            },
        },
        404: {
            "description": "Album not found",
            "content": {"application/json": {"example": {"detail": "Album not found"}}},
        },
        403: {
            "description": "Access denied - insufficient permissions for album",
            "content": {"application/json": {"example": {"detail": "Access denied"}}},
        },
    },
)
async def get_album_details(
    album_uuid: str, request: Request, db: DB = Depends(get_db)
) -> List[PhotoModel]:
    """
    Get details of all photos in an album by UUID.

    Returns comprehensive metadata for all photos in the specified album.
    File paths are excluded for security reasons. Access control is handled
    by the authorization service based on album classification.

    Args:
        album_uuid: UUID of the album to retrieve photos from
        request: FastAPI request object with user context
        db: Photos database dependency

    Returns:
        List[PhotoModel]: List of photo metadata objects

    Raises:
        HTTPException: 404 if album not found
    """
    album = db.albums.get(album_uuid)
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")

    logger.debug(f"User accessing album {album_uuid}")

    return [
        PhotoModel.model_validate(db.photos.get(photo_uuid))
        for photo_uuid in album.photos
    ]


@router.get(
    "/api/albums",
    tags=["albums"],
    summary="List Albums",
    description=dedent_and_convert_to_html(
        """
    Get a list of albums filtered by user access level.
    
    Returns all albums that the current user has permission to access
    based on their role assignments. Albums are classified by their
    folder structure in the Apple Photos library.
    
    **Access Control Rules:**
    - **Public role**: Only albums in "Public" folders
    - **Protected role**: Albums in "Public" and "Protected" folders
    - **Private role**: All albums including "Private" folders
    
    **Album Classification:**
    Albums are automatically classified based on their folder path:
    - Folders starting with "Public" → public access
    - Folders starting with "Protected" → protected access
    - Folders starting with "Private" → private access
    - Other folders → default to protected access
    
    **Response Format:**
    Returns a dictionary with album UUIDs as keys and album metadata as values.
    """
    ),
    responses={
        200: {
            "description": "Albums successfully retrieved and filtered",
            "content": {
                "application/json": {
                    "example": {
                        "album-uuid-123": {
                            "uuid": "album-uuid-123",
                            "title": "Family Vacation 2024",
                            "folder": "Protected/Family",
                            "realm": "protected",
                            "photo_count": 45,
                            "cover_photo_uuid": "photo-uuid-456",
                            "created_date": "2024-01-15T00:00:00Z",
                            "modified_date": "2024-01-20T12:30:00Z",
                            "photos": ["photo-uuid-456", "photo-uuid-789"],
                        },
                        "album-uuid-456": {
                            "uuid": "album-uuid-456",
                            "title": "Public Events",
                            "folder": "Public/Events",
                            "realm": "public",
                            "photo_count": 23,
                            "cover_photo_uuid": "photo-uuid-101",
                            "created_date": "2024-01-10T00:00:00Z",
                            "modified_date": "2024-01-18T15:45:00Z",
                            "photos": ["photo-uuid-101", "photo-uuid-102"],
                        },
                    }
                }
            },
        },
        403: {
            "description": "Access denied - authentication required",
            "content": {"application/json": {"example": {"detail": "Access denied"}}},
        },
    },
)
async def list_albums(
    request: Request, db: DB = Depends(get_db)
) -> Dict[str, AlbumModel]:
    """
    List albums filtered by user access level.

    Returns all albums that the current user has permission to access
    based on their role assignments. Albums are automatically filtered
    based on folder-based access control rules.

    Args:
        request: FastAPI request object with user roles in headers
        db: Photos database dependency

    Returns:
        Dict[str, AlbumModel]: Dictionary of accessible albums keyed by UUID
    """
    user_roles = request.headers.get("X-Forwarded-Roles", "public")
    roles_list = [role.strip().lower() for role in user_roles.split(",")]

    # Filter albums based on user roles
    filtered_albums = {}

    for uuid, album in db.albums.items():
        if album.realm in roles_list:
            filtered_albums[uuid] = AlbumModel.model_validate(album)
        # If role matches, the album is not included in the response

    logger.debug(
        f"User roles: {user_roles}, returning {len(filtered_albums)} albums out of {len(db.albums)} total"
    )
    return filtered_albums
