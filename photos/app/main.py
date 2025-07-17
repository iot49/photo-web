import io
import logging
import os
import re
from contextlib import asynccontextmanager
from typing import Dict, List, Optional

import httpx
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from models import DB, AlbumModel, PhotoModel, Realm
from PIL import Image
from pillow_heif import register_heif_opener
from read_db import read_db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Define common screen sizes for responsive images
SCREEN_SIZES = {
    "": {
        "width": 0,
        "height": 0,
        "description": "Original size",
    },  # Default - full size
    "-thumb": {"width": 200, "height": 150, "description": "Thumbnail"},
    "-sm": {"width": 480, "height": 320, "description": "Small mobile"},
    "-md": {"width": 768, "height": 512, "description": "Tablet"},
    "-lg": {"width": 1024, "height": 768, "description": "Desktop"},
    "-xl": {"width": 1440, "height": 1080, "description": "Large desktop"},
    "-xxl": {"width": 1920, "height": 1440, "description": "4K desktop"},
}

# Register the HEIF opener to allow Pillow to read HEIC files
register_heif_opener()


# In-memory database (populated from Apple Photos library)
db: DB = DB(albums={}, photos={})


async def get_user_info(request: Request) -> dict:
    """Get user information from auth service."""
    auth_service_url = os.getenv("AUTH_SERVICE_URL", "http://auth:8000") + "/me"
    session_cookie = request.cookies.get("session")

    if not session_cookie:
        # No session cookie, so user is not logged in.
        # Return public role.
        return {"roles": "public"}

    # Forward session cookie to auth service
    headers = {"Cookie": f"session={session_cookie}"}

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(auth_service_url, headers=headers, timeout=5.0)
            response.raise_for_status()  # Raise an exception for bad status codes
            user_info = response.json()
            logger.debug(f"Auth service returned user_info: {user_info}")
            return user_info
    except Exception as e:
        logger.error(f"An unexpected error occurred while fetching user info: {e}", e)
        return {"roles": "public"}  # Fallback


async def get_db() -> DB:
    """Photos database."""
    return db


async def load_db() -> DB:
    """Load the database from the in-memory store."""
    global db
    photos_db_path = os.getenv("PHOTOS_LIBRARY_MOUNT", "/photo_db")
    photos_db_filters = os.getenv("PHOTOS_DB_FILTERS", "Public:Protected:Private")

    try:
        logger.debug(
            f"Loading photos database from {photos_db_path} with filters {photos_db_filters} ..."
        )
        db = read_db(photos_db_path, photos_db_filters)
        logger.info(
            f"Database with {len(db.albums)} albums and {len(db.photos)} photos loaded successfully."
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load photos database from {photos_db_path}: {e}",
        )
    return db


@asynccontextmanager
async def lifespan(app: FastAPI):
    await load_db()
    logger.info("Starting server ...")
    yield
    # No cleanup needed since we're not using a global HTTP client


app = FastAPI(
    title="Photo Web Photos Service",
    description="Photos service for Photo Web application",
    version="1.0.0",
    lifespan=lifespan,
    root_path="/photos",
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)


@app.get("/api/health")
async def health_check():
    return {"status": "Photos service is healthy"}


@app.get("/api/test-me")
async def get_me(request: Request):
    """
    Get user information from auth service.

    This endpoint is a proxy to the auth service's /me endpoint.
    """
    return await get_user_info(request)


@app.get("/authorize")
async def authorize_access(request: Request, db: DB = Depends(get_db)):
    """
    Authorization endpoint for delegated authorization from auth service.

    This endpoint is called by the auth service when authorization rules
    delegate to the photos service (e.g., for /photos/api/albums/* or /photos/api/photos/*).

    The endpoint extracts the original URI from X-Forwarded-Uri header,
    parses the resource ID (album_id or photo_id), and checks if the user
    has permission to access that specific resource based on its realm.

    Returns:
        - 200 (OK) if authorized
        - 403 (Forbidden) if not authorized
        - 404 (Not Found) if resource doesn't exist
        - 400 (Bad Request) if URI format is invalid
    """
    try:
        original_uri = request.headers.get("X-Forwarded-Uri", "")
        if not original_uri:
            raise HTTPException(
                status_code=400, detail="X-Forwarded-Uri header required"
            )

        # Parse the URI to extract resource type and ID
        # Handle various URI formats:
        # - /photos/api/photos/{photo_id}/img{size_suffix}
        # - /photos/api/photos/{photo_id}
        # - /photos/api/albums/{album_id}/img{size_suffix}
        # - /photos/api/albums/{album_id}
        # - /photos/api/albums (list all albums)
        # - /photos/api/photos/srcset

        # Handle photo URIs (both with and without /img)
        photo_match = re.match(r"/photos/api/photos/([^/]+)(?:/img.*)?", original_uri)
        # Handle album URIs (both with and without /img)
        album_match = re.match(r"/photos/api/albums/([^/]+)(?:/img.*)?", original_uri)
        # Handle album list URI
        album_list_match = re.match(r"/photos/api/albums/?$", original_uri)
        # Handle srcset URI
        srcset_match = re.match(r"/photos/api/photos/srcset/?$", original_uri)

        if photo_match:
            # Handle photo URI
            photo_id = photo_match.group(1)

            # Get the photo from database
            photo = db.photos.get(photo_id)
            if not photo:
                logger.warning(f"Photo not found: {original_uri}")
                raise HTTPException(status_code=404, detail="Photo not found")

            realm = photo.realm

        elif album_match:
            # Handle album URI
            album_id = album_match.group(1)

            # Get the album from database
            album = db.albums.get(album_id)
            if not album:
                logger.warning(f"Album not found: {original_uri}")
                raise HTTPException(status_code=404, detail="Album not found")

            realm = album.realm

        elif album_list_match or srcset_match:
            # These endpoints don't require specific resource authorization
            # They handle their own authorization logic in their respective handlers
            # For delegation purposes, we'll allow public access and let the endpoint handle it
            realm = Realm.PUBLIC

        else:
            raise HTTPException(status_code=400, detail="Invalid URI format")

        # If the resource is public, allow access immediately without checking user info
        if realm == Realm.PUBLIC:
            resource_id = (
                photo_id
                if "photo_id" in locals()
                else (album_id if "album_id" in locals() else "unknown")
            )
            logger.debug(f"Access granted to public resource {resource_id}")
            return {"status": "authorized", "realm": "public"}

        resource_id = (
            photo_id
            if "photo_id" in locals()
            else (album_id if "album_id" in locals() else "unknown")
        )
        logger.debug(f"AUTH 1: {original_uri} id: {resource_id} realm {realm}")

        # For non-public resources, get user information from forwarded header
        user_roles = request.headers.get("X-Forwarded-Roles", "public")
        roles_list = [role.strip().lower() for role in user_roles.split(",")]

        logger.debug(f"AUTH 2: {original_uri} realm {realm} user_info {user_roles}")

        if realm == Realm.PROTECTED:
            # Protected resources require 'protected' or 'private' role
            if "protected" in roles_list or "private" in roles_list:
                logger.debug(
                    f"AUTH 2: Access granted to protected resource {resource_id}"
                )
                return {"status": "authorized", "realm": "protected"}
            else:
                logger.debug(
                    f"AUTH 3: Access denied to protected resource {original_uri} for roles: {user_roles}"
                )
                raise HTTPException(
                    status_code=403,
                    detail="Insufficient permissions for protected resource",
                )

        elif realm == Realm.PRIVATE:
            # Private resources require 'private' role
            if "private" in roles_list:
                logger.debug(
                    f"AUTH 4: Access granted to private resource {original_uri}"
                )
                return {"status": "authorized", "realm": "private"}
            else:
                logger.debug(
                    f"AUTH 5: Access denied to private resource {original_uri} for roles: {user_roles}"
                )
                raise HTTPException(
                    status_code=403,
                    detail="Insufficient privileges for private resource",
                )

        else:
            logger.debug(f"AUTH 6: Unknown realm: {realm}")
            raise HTTPException(status_code=500, detail="Unknown resource realm")

    except HTTPException:
        raise
    except Exception as e:
        logger.debug(f"AUTH 7: Unexpected error: {e}")
        raise HTTPException(status_code=500, detail="Authorization check failed")


@app.get("/api/albums/{album_uuid}")
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


@app.get("/api/albums")
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
    # Get user information from auth service
    user_info = await get_user_info(request)
    user_roles = user_info.get("roles", "public")

    # Parse roles (comma-separated string)
    roles_list = [role.strip().lower() for role in user_roles.split(",")]

    # Filter albums based on user roles
    filtered_albums = {}

    for uuid, album in db.albums.items():
        album_realm = album.realm  # Realm enum value

        # Check access permissions
        if album_realm == Realm.PUBLIC:
            # Public albums are accessible to everyone
            filtered_albums[uuid] = AlbumModel.model_validate(album)
        elif album_realm == Realm.PROTECTED and (
            "protected" in roles_list or "private" in roles_list
        ):
            # Protected albums require protected or private role
            filtered_albums[uuid] = AlbumModel.model_validate(album)
        elif album_realm == Realm.PRIVATE and "private" in roles_list:
            # Private albums require private role
            filtered_albums[uuid] = AlbumModel.model_validate(album)
        # If none of the conditions match, album is not included

    logger.debug(
        f"User roles: {user_roles}, returning {len(filtered_albums)} albums out of {len(db.albums)} total"
    )
    return filtered_albums


@app.get("/api/photos/{photo_id}/img")
@app.get("/api/photos/{photo_id}/img{size_suffix}")
async def serve_photo_image_sized(
    photo_id: str,
    request: Request,
    size_suffix: str = "",
    quality: Optional[int] = Query(75, ge=1, le=100),
    db: DB = Depends(get_db),
):
    """
    Serve a photo image scaled to common screen sizes.

    Access rules handled by /authorize

    Size suffixes:
    - "" (empty): Original full-size image
    - "-sm": Small mobile (480x320)
    - "-md": Tablet (768x512)
    - "-lg": Desktop (1024x768)
    - "-xl": Large desktop (1440x1080)
    - "-xxl": 4K desktop (1920x1440)

    Access rules same as /api/photo/{photo_uuid}/image endpoint.

    Args:
        photo_id (str): The UUID of the photo
        size_suffix (str): Size suffix like "-sm", "-md", etc.
        quality (int): JPEG quality (1-100, default 75)

    Returns:
        Image file scaled to the specified size with correct MIME type
    """
    # Validate size suffix
    if size_suffix not in SCREEN_SIZES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid size suffix '{size_suffix}'. Valid options: {list(SCREEN_SIZES.keys())}",
        )

    photo = db.photos.get(photo_id)
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    path = photo.path
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Photo file not found")

    # Get target dimensions from size configuration
    size_config = SCREEN_SIZES[size_suffix]
    target_width = size_config["width"]
    target_height = size_config["height"]

    # Calculate actual dimensions respecting aspect ratio and no upscaling
    original_aspect = photo.width / photo.height

    # For original size (empty suffix), use original dimensions
    if size_suffix == "":
        width = photo.width
        height = photo.height
    else:
        # Don't upscale - limit to original dimensions
        max_width = min(target_width, photo.width)
        max_height = min(target_height, photo.height)

        # Calculate dimensions maintaining aspect ratio
        if max_width / original_aspect <= max_height:
            # Width is the limiting factor
            width = max_width
            height = int(width / original_aspect)
        else:
            # Height is the limiting factor
            height = max_height
            width = int(height * original_aspect)

    # Process the image
    try:
        # Check if format conversion is needed (HEIC/TIFF always need conversion to JPEG)
        needs_conversion = photo.uti in ["public.heic", "public.tiff"]
        mime_type = "image/jpeg" if needs_conversion else photo.mime_type

        # Check if scaling is needed for scalable image formats
        needs_scaling = (width > 0 and width < photo.width) or (
            height > 0 and height < photo.height
        )
        needs_scaling = needs_scaling and photo.uti in [
            "public.jpeg",
            "public.jpeg-2000",
            "public.tiff",
        ]

        # Process image if conversion or scaling is needed
        needs_processing = needs_conversion or needs_scaling

        if not needs_processing:
            # Return original unscaled image
            return FileResponse(path, media_type=mime_type)

        # Process the image
        img = Image.open(path)
        img = img.resize((width, height), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=quality)
        buf.seek(0)

        # Return the processed image
        return StreamingResponse(buf, media_type="image/jpeg")

    except Exception as e:
        logger.error(f"Error processing image {path}: {e}")
        raise HTTPException(status_code=500, detail=f"Error processing image: {str(e)}")


@app.get("/api/photos/srcset")
async def get_photos_srcset():
    """
    Get srcset string for a specific photo in the format expected by HTML img srcset attribute.

    Returns the image sizes that /api/photos/{photo_id}/img{-XXX} returns.

    Args:
        photo_id (str): The UUID of the photo to generate srcset for

    Returns:
        JSON object with an array of supported sizes, e.g.
        ```json
        [
            {
                "suffix": "-thumb",
                "width": 200,
                "height": 150,
                "description": "Thumbnail"
            },
            {
                "suffix": "-xxl",
                "width": 1920,
                "height": 1440,
                "description": "4K desktop"
            }
        ]
        ```
    """
    sizes_info = []

    for suffix, size_config in SCREEN_SIZES.items():
        width = size_config["width"]

        # Skip the original size (empty suffix)
        if suffix == "":
            continue

        sizes_info.append(
            {
                "suffix": suffix,
                "width": width,
                "height": size_config["height"],
                "description": size_config["description"],
            }
        )

    return sizes_info


# Keep other endpoints from original file...
@app.get("/api/reload_db")
async def reload_db():
    """Reload the database from the Apple Photos library."""
    try:
        await load_db()
        return {"status": "Database reloaded successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
