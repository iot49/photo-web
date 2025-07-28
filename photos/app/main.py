import io
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Dict, List, Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, StreamingResponse
from models import DB, AlbumModel, PhotoModel
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

# Initialize the scheduler
scheduler = AsyncIOScheduler()

# In-memory database (populated from Apple Photos library)
db: DB = DB(albums={}, photos={})


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
    # Load database on startup
    await load_db()

    # Start the scheduler
    scheduler.start()

    # Schedule daily database reload at 2am
    scheduler.add_job(
        load_db,
        "cron",
        hour=2,
        minute=0,
        id="daily_db_reload",
        name="Daily database reload at 2am",
        replace_existing=True,
    )

    logger.info("Starting server with scheduled daily database reload at 2am...")
    yield

    # Shutdown the scheduler
    scheduler.shutdown()


app = FastAPI(
    title="Photo Web Photos Service",
    description="Photos service for Photo Web application",
    version="1.0.0",
    lifespan=lifespan,
    root_path="/photos",
)


@app.get("/api/health")
async def health_check():
    return {"status": "Photos service is healthy"}


@app.get("/api/nginx-cache")
async def inspect_nginx_cache():
    """
    Inspect nginx cache directory and return cache statistics.

    Returns information about cached files including:
    - Total cache size
    - Individual file sizes
    - Cache file metadata
    - Access statistics if available
    """
    cache_dir = "/var/cache/nginx/photos"

    try:
        # Check if cache directory exists and is accessible
        if not os.path.exists(cache_dir):
            return {
                "error": "Cache directory not found",
                "cache_dir": cache_dir,
                "total_files": 0,
                "total_size": 0,
                "files": [],
            }

        cache_files = []
        total_size = 0

        # Walk through cache directory structure (levels=1:2)
        for root, dirs, files in os.walk(cache_dir):
            for file in files:
                file_path = os.path.join(root, file)
                try:
                    stat = os.stat(file_path)
                    file_size = stat.st_size
                    total_size += file_size

                    # Try to read cache metadata if available
                    cache_info = {
                        "filename": file,
                        "path": file_path.replace(cache_dir, ""),
                        "size": file_size,
                        "size_human": format_bytes(file_size),
                        "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                        "accessed": datetime.fromtimestamp(stat.st_atime).isoformat(),
                    }

                    # Try to extract cache key information
                    try:
                        with open(file_path, "rb") as f:
                            # Read first few bytes to check for nginx cache header
                            header = f.read(1024)
                            if header:
                                # Look for KEY: marker in cache file
                                header_str = header.decode("utf-8", errors="ignore")
                                if "KEY:" in header_str:
                                    key_start = header_str.find("KEY:") + 4
                                    key_end = header_str.find("\n", key_start)
                                    if key_end > key_start:
                                        cache_key = header_str[
                                            key_start:key_end
                                        ].strip()
                                        cache_info["cache_key"] = cache_key

                                        # Try to parse the original URL from cache key
                                        if cache_key.startswith("http"):
                                            cache_info["original_url"] = cache_key
                    except:  # noqa: E722
                        # If we can't read the cache file, that's okay
                        pass

                    cache_files.append(cache_info)

                except OSError:
                    # Skip files we can't stat
                    continue

        # Sort files by size (largest first)
        cache_files.sort(key=lambda x: x["size"], reverse=True)

        return {
            "cache_dir": cache_dir,
            "total_files": len(cache_files),
            "total_size": total_size,
            "total_size_human": format_bytes(total_size),
            "files": cache_files,
            "timestamp": datetime.now().isoformat(),
        }

    except Exception as e:
        logger.error(f"Error inspecting nginx cache: {e}")
        return {
            "error": f"Failed to inspect cache: {str(e)}",
            "cache_dir": cache_dir,
            "total_files": 0,
            "total_size": 0,
            "files": [],
        }


def format_bytes(bytes_value: int) -> str:
    """Format bytes into human readable format."""
    if bytes_value == 0:
        return "0 B"

    units = ["B", "kB", "MB", "GB", "TB"]
    unit_index = 0
    size = float(bytes_value)

    while size >= 1024 and unit_index < len(units) - 1:
        size /= 1024
        unit_index += 1

    if unit_index == 0:
        return f"{int(size)} {units[unit_index]}"
    else:
        return f"{size:.1f} {units[unit_index]}"


@app.get("/api/test-me")
async def get_me(request: Request):
    """
    Get user roles. Testing only.
    """
    roles = request.headers.get("X-Forwarded-Roles", "public")
    return roles


@app.get("/authorize")
async def authorize_access(request: Request, db: DB = Depends(get_db)):
    """
    Authorization endpoint for delegated authorization from auth service.

    Recognized uri's: (access is determined based on realm)
        - /photos/api/photos/{photo_id}...
        - /photos/api/albums/{album_id}...


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
        uri = request.headers.get("X-Forwarded-Uri", "")
        if not uri:
            raise HTTPException(
                status_code=400, detail="X-Forwarded-Uri header required"
            )

        roles = [
            role.strip().lower()
            for role in request.headers.get("X-Forwarded-Roles", "public").split(",")
        ]

        path = os.path.normpath(uri).split(os.sep)
        kind = path[3]
        uuid = path[4]

        logger.debug(f"uri={uri} path={path} roles={roles}")

        if kind == "photos":
            item = db.photos.get(uuid)
            if item.realm in roles:
                return {"status": "authorized"}
        if kind == "albums":
            item = db.albums.get(uuid)
            if item.realm in roles:
                return {"status": "authorized"}

        raise HTTPException(
            status_code=403,
            detail=f"Access denied for {uri} roles {roles}",
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Authorization check failed for {uri}: {e}", e)
        raise HTTPException(
            status_code=500, detail=f"Authorization check failed for {uri}: {e}"
        )


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
@app.get("/api/reload-db")
async def reload_db():
    """Reload the database from the Apple Photos library."""
    try:
        await load_db()
        return {"status": "Database reloaded successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
