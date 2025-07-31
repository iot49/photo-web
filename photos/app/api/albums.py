import logging
from typing import Dict, List

from fastapi import APIRouter, Depends, HTTPException, Request
from models import DB, AlbumModel, PhotoModel

logger = logging.getLogger(__name__)

router = APIRouter()


async def get_db() -> DB:
    """Photos database dependency - will be overridden by main.py."""
    raise NotImplementedError("Database dependency not configured")


@router.get("/api/albums/{album_uuid}")
async def get_album_details(
    album_uuid: str, request: Request, db: DB = Depends(get_db)
) -> List[PhotoModel]:
    """
    Get details of all photos in an album by UUID. Do not include the path.

    Access rules handled by /authorize
    """
    album = db.albums.get(album_uuid)
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")

    logger.debug(f"User accessing album {album_uuid}")

    return [
        PhotoModel.model_validate(db.photos.get(photo_uuid))
        for photo_uuid in album.photos
    ]


@router.get("/api/albums")
async def list_albums(
    request: Request, db: DB = Depends(get_db)
) -> Dict[str, AlbumModel]:
    """
    List albums filtered by user access level.

    Access rules:
    - No login (public role): only albums with realm 'public'
    - Protected role: albums with realm 'public' or 'protected'
    - Private role: all albums
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
