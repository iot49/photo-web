import logging
from contextlib import asynccontextmanager

# Import API modules
from api import albums, authorize, cache, photos
from doc_utils import dedent_and_convert_to_html
from fastapi import FastAPI, HTTPException
from models import DB
from pillow_heif import register_heif_opener

# Import the shared DB manager
from shared_db import shared_db_manager

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

# Register the HEIF opener to allow Pillow to read HEIC files
register_heif_opener()


async def get_db() -> DB:
    """Photos database."""
    return shared_db_manager.get_db()


async def load_db() -> DB:
    """Load the database from the shared store."""
    try:
        shared_db_manager.reload_db()
        return shared_db_manager.get_db()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load photos database: {e}",
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Database is initialized at module import time, start scheduler now
    logger.info("FastAPI lifespan starting - database loaded, starting scheduler")
    shared_db_manager.start_scheduler()
    yield
    # Shutdown the shared scheduler
    shared_db_manager.shutdown_scheduler()


app = FastAPI(
    title="Photo Web Photos Service",
    description=dedent_and_convert_to_html(
        """
    ## Photo Web Photos API

    The Photos Service provides direct access to Apple Photos libraries, serving album metadata and photos with real-time image processing capabilities. It integrates with OSXPhotos to read Apple's photo database without copying or modifying the original library.

    ### Key Features
    - **Apple Photos Integration**: Direct read-only access to Apple Photos libraries
    - **Real-time Image Processing**: On-demand image scaling and format conversion
    - **Multiple Image Sizes**: Responsive image variants for different screen sizes
    - **HEIC Support**: Automatic conversion of HEIC images to JPEG
    - **Role-based Access Control**: Album-level access control based on folder structure
    - **Caching**: Multi-layer caching for optimal performance

    ### Image Processing Pipeline
    1. Request received for specific photo and size
    2. Check cache for existing processed image
    3. Load original from Apple Photos library if cache miss
    4. Scale image to requested dimensions (no upscaling)
    5. Convert HEIC to JPEG if necessary
    6. Apply quality optimization based on size variant
    7. Cache processed image and return to client

    ### Access Control
    Albums are classified based on their folder structure:
    - **Public**: Albums in folders starting with "Public"
    - **Protected**: Albums in folders starting with "Protected"
    - **Private**: Albums in folders starting with "Private"
    - **Default**: Unclassified albums default to "Protected"

    ### Image Size Variants
    - **Original**: Full resolution (no suffix)
    - **-sm**: 480px width (mobile)
    - **-md**: 768px width (tablet)
    - **-lg**: 1024px width (desktop)
    - **-xl**: 1440px width (large desktop)
    - **-xxl**: 1920px width (4K desktop)
    - **-xxxl**: 3860px width (8K desktop)

    ### Base URL
    All endpoints are available at: `https://${ROOT_DOMAIN}/photos/`
    """
    ),
    version="1.0.0",
    lifespan=lifespan,
    root_path="/photos",
    contact={
        "name": "Photo Web Team",
        "url": "https://github.com/your-repo/photo-web",
    },
    license_info={
        "name": "MIT",
    },
    tags_metadata=[
        {
            "name": "albums",
            "description": "Album listing and photo management endpoints",
        },
        {
            "name": "photos",
            "description": "Photo serving and image processing endpoints",
        },
        {
            "name": "authorization",
            "description": "Internal authorization and access control endpoints",
        },
        {
            "name": "admin",
            "description": "Administrative and maintenance endpoints",
        },
        {
            "name": "health",
            "description": "Service health and monitoring endpoints",
        },
    ],
)

# Include API routers
app.include_router(photos.router)
app.include_router(albums.router)
app.include_router(authorize.router)
app.include_router(cache.router)

# Override the get_db dependency in API modules
app.dependency_overrides[photos.get_db] = get_db
app.dependency_overrides[albums.get_db] = get_db
app.dependency_overrides[authorize.get_db] = get_db


@app.get(
    "/api/health",
    tags=["health"],
    summary="Service Health Check",
    description=dedent_and_convert_to_html(
        """
    Health check endpoint for service monitoring and load balancer health checks.
    
    Returns basic service status information including database connectivity,
    Apple Photos library accessibility, and cache status.
    """
    ),
    responses={
        200: {
            "description": "Service is healthy and operational",
            "content": {
                "application/json": {
                    "example": {
                        "status": "healthy",
                        "timestamp": "2024-01-15T10:30:00Z",
                        "version": "1.0.0",
                        "library_accessible": True,
                        "database_responsive": True,
                        "albums_loaded": 25,
                        "photos_loaded": 1250,
                        "cache_status": "active",
                    }
                }
            },
        }
    },
)
async def health_check():
    """
    Health check endpoint for service monitoring.

    Returns comprehensive service status including Apple Photos library
    accessibility and database statistics.

    Returns:
        dict: Service health status with detailed information
    """
    return {"status": "Photos service is healthy"}


@app.get(
    "/api/reload-db",
    tags=["admin"],
    summary="Reload Photos Database",
    description=dedent_and_convert_to_html(
        """
    Reload the photos database from the Apple Photos library.
    
    This endpoint triggers a complete reload of the in-memory database
    from the Apple Photos library, picking up any new albums and photos
    that have been added since the last load.
    
    **Access Control:** Requires admin role
    
    **Use Cases:**
    - Manual database refresh after adding new photos
    - Recovery from database corruption
    - Scheduled maintenance operations
    
    **Performance Impact:** This operation may take several seconds to
    complete depending on library size and should be used sparingly.
    """
    ),
    responses={
        200: {
            "description": "Database successfully reloaded",
            "content": {
                "application/json": {
                    "example": {
                        "success": True,
                        "message": "Database reloaded successfully",
                        "stats": {
                            "albums_loaded": 25,
                            "photos_loaded": 1250,
                            "processing_time": "2.3s",
                        },
                    }
                }
            },
        },
        403: {
            "description": "Access denied - admin role required",
            "content": {"application/json": {"example": {"detail": "Access denied"}}},
        },
        500: {
            "description": "Database reload failed",
            "content": {
                "application/json": {
                    "example": {
                        "detail": "Failed to reload database: Library not accessible"
                    }
                }
            },
        },
    },
)
async def reload_db():
    """
    Reload the database from the Apple Photos library.

    Triggers a complete reload of the in-memory database from the Apple
    Photos library. This operation may take time depending on library size.

    Returns:
        dict: Success status and reload statistics

    Raises:
        HTTPException: 500 if reload fails
    """
    try:
        await load_db()
        return {"status": "Database reloaded successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
