import io
import logging
import os
import subprocess
from typing import Optional

from doc_utils import dedent_and_convert_to_html
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse, StreamingResponse
from imagemagick_service import process_image_with_imagemagick_service
from models import DB

logger = logging.getLogger(__name__)

# Define common screen sizes for responsive images
SCREEN_SIZES = {
    "-sm": {"width": 480, "description": "Small mobile"},
    "-md": {"width": 768, "description": "Tablet"},
    "-lg": {"width": 1024, "description": "Desktop"},
    "-xl": {"width": 1440, "description": "Large desktop"},
    "-xxl": {"width": 1920, "description": "4K desktop"},
    "-xxxl": {"width": 3860, "description": "8K desktop"},
}

router = APIRouter()


async def get_db() -> DB:
    """Photos database dependency - will be overridden by main.py."""
    raise NotImplementedError("Database dependency not configured")


def process_image_with_imagemagick(
    input_path: str,
    width: int,
    height: int,
    quality: int = 85,
    test_overlay: str = None,
) -> bytes:
    """
    Process any image format including HEIC using ImageMagick.

    Args:
        input_path: Path to the input image file
        width: Target width in pixels
        height: Target height in pixels
        quality: JPEG quality (1-100)
        test_overlay: Optional text to overlay for testing

    Returns:
        bytes: Processed image as JPEG bytes

    Raises:
        subprocess.CalledProcessError: If ImageMagick command fails
        FileNotFoundError: If ImageMagick is not installed
    """
    try:
        # Build ImageMagick 7 command with proper HEIC handling
        cmd = [
            "magick",
            input_path,
            "-auto-orient",  # Handle EXIF orientation from HEIC
            "-resize",
            f"{width}x{height}>",  # Don't upscale (> means only shrink)
            "-strip",  # Remove metadata for smaller file size
            "-quality",
            str(quality),  # ImageMagick 7 accepts quality as integer
            "-sampling-factor",
            "4:2:0",  # Optimize JPEG compression
        ]

        # Add test overlay if requested
        if test_overlay:
            # Calculate font size based on image width (5% of width, min 20, max 100)
            font_size = max(20, min(100, int(0.05 * width)))
            cmd.extend(
                [
                    "-gravity",
                    "SouthEast",
                    "-pointsize",
                    str(font_size),
                    "-fill",
                    "white",
                    "-annotate",
                    "+50+50",
                    test_overlay,
                ]
            )

        # Output as JPEG to stdout
        cmd.append("jpg:-")

        logger.debug(f"Running ImageMagick command: {' '.join(cmd)}")

        # Execute ImageMagick command
        result = subprocess.run(
            cmd,
            capture_output=True,
            check=True,
            timeout=30,  # 30 second timeout for safety
        )

        logger.info(
            f"ImageMagick processed image: {input_path} -> {width}x{height} (quality: {quality})"
        )
        return result.stdout

    except subprocess.CalledProcessError as e:
        error_msg = e.stderr.decode() if e.stderr else str(e)
        logger.error(f"ImageMagick 7 command failed: {error_msg}")

        # Check for specific HEIC-related errors
        if "no decode delegate" in error_msg.lower() or "heic" in error_msg.lower():
            raise HTTPException(
                status_code=500,
                detail="HEIC format not supported. Please ensure ImageMagick 7 is compiled with libheif support.",
            )
        else:
            raise HTTPException(
                status_code=500,
                detail=f"Image processing failed: {error_msg}",
            )
    except subprocess.TimeoutExpired:
        logger.error(f"ImageMagick command timed out for image: {input_path}")
        raise HTTPException(status_code=500, detail="Image processing timed out")
    except FileNotFoundError:
        logger.error(
            "ImageMagick 7 'magick' command not found - ensure ImageMagick 7 is installed"
        )
        raise HTTPException(
            status_code=500,
            detail="ImageMagick 7 not available - image processing service unavailable",
        )


@router.get(
    "/api/photos/{photo_id}/img",
    tags=["photos"],
    summary="Serve Photo Image (Original)",
    description=dedent_and_convert_to_html(
        """
    Serve the original full-resolution photo image.
    
    Returns the photo in its original resolution and format, with optional
    format conversion from HEIC to JPEG for browser compatibility.
    
    **Access Control:** Photo access inherited from most permissive album
    
    **Format Handling:**
    - HEIC images automatically converted to JPEG using ImageMagick
    - Other formats served as-is when possible
    - Quality parameter applies only to JPEG conversion
    
    **Performance Notes:**
    - Original images may be very large (10MB+)
    - Consider using size variants for better performance
    - Images are cached after first processing
    """
    ),
    responses={
        200: {
            "description": "Photo image successfully served",
            "content": {"image/jpeg": {}, "image/png": {}, "image/tiff": {}},
            "headers": {
                "Content-Type": {
                    "description": "Image MIME type",
                    "schema": {"type": "string"},
                },
                "Cache-Control": {
                    "description": "Cache control header",
                    "schema": {"type": "string"},
                },
                "ETag": {
                    "description": "Entity tag for caching",
                    "schema": {"type": "string"},
                },
            },
        },
        404: {
            "description": "Photo not found",
            "content": {"application/json": {"example": {"detail": "Photo not found"}}},
        },
        403: {
            "description": "Access denied - insufficient permissions",
            "content": {"application/json": {"example": {"detail": "Access denied"}}},
        },
        500: {
            "description": "Image processing error",
            "content": {
                "application/json": {"example": {"detail": "Error processing image"}}
            },
        },
    },
)
@router.get(
    "/api/photos/{photo_id}/img{size_suffix}",
    tags=["photos"],
    summary="Serve Photo Image (Sized)",
    description=dedent_and_convert_to_html(
        """
    Serve a photo image scaled to specific screen sizes for responsive design.
    
    Returns the photo scaled to the specified size with optimized quality
    settings for each size variant. No upscaling is performed - images
    smaller than the target size are returned at original dimensions.
    
    **Size Variants:**
    - **-sm**: 480px width (small mobile)
    - **-md**: 768px width (tablet)
    - **-lg**: 1024px width (desktop)
    - **-xl**: 1440px width (large desktop)
    - **-xxl**: 1920px width (4K desktop)
    - **-xxxl**: 3860px width (8K desktop)
    
    **Quality Optimization:**
    - Smaller sizes use lower quality for faster loading
    - Larger sizes maintain higher quality for detail
    - HEIC images always converted to JPEG using ImageMagick
    
    **Caching:**
    - Processed images cached at multiple levels
    - Browser cache: 24 hours
    - Nginx cache: 7 days
    - In-memory cache: 1 hour
    
    **Test Mode:**
    When `test=true`, adds a text overlay showing the size suffix
    for debugging responsive image implementations.
    """
    ),
    responses={
        200: {
            "description": "Scaled photo image successfully served",
            "content": {"image/jpeg": {}},
            "headers": {
                "Content-Type": {
                    "description": "Always image/jpeg for scaled images",
                    "schema": {"type": "string", "example": "image/jpeg"},
                },
                "Cache-Control": {
                    "description": "Cache control header",
                    "schema": {"type": "string", "example": "public, max-age=604800"},
                },
                "ETag": {
                    "description": "Entity tag including size suffix",
                    "schema": {"type": "string", "example": "photo-uuid-456-img50"},
                },
            },
        },
        400: {
            "description": "Invalid size suffix",
            "content": {
                "application/json": {
                    "example": {
                        "detail": "Invalid size suffix '-invalid'. Valid options: '', ['-sm', '-md', '-lg', '-xl', '-xxl', '-xxxl']"
                    }
                }
            },
        },
        404: {
            "description": "Photo not found or file missing",
            "content": {
                "application/json": {"example": {"detail": "Photo file not found"}}
            },
        },
        500: {
            "description": "Image processing error",
            "content": {
                "application/json": {
                    "example": {
                        "detail": "Error processing image: Invalid image format"
                    }
                }
            },
        },
    },
)
async def serve_photo_image_sized(
    photo_id: str,
    request: Request,
    size_suffix: str = "",
    quality: Optional[int] = Query(
        75, ge=1, le=100, description="JPEG quality (1-100)"
    ),
    test: bool = Query(
        False,
        description="When true, embed size-suffix text overlay in image for debugging",
    ),
    db: DB = Depends(get_db),
):
    """
    Serve a photo image scaled to common screen sizes using ImageMagick.

    Provides responsive image serving with automatic scaling and format
    conversion. Supports all image formats including HEIC through ImageMagick.

    Args:
        photo_id: The UUID of the photo to serve
        size_suffix: Size suffix like "-sm", "-md", etc. (empty for original)
        quality: JPEG quality (1-100, default 75)
        test: When true, embed size-suffix text overlay for debugging
        db: Photos database dependency

    Returns:
        Image scaled to the specified dimensions as JPEG.
        No upscaling is performed - smaller originals returned at native size.
        Test mode adds size-suffix text overlay in lower right corner.

    Raises:
        HTTPException: 400 for invalid size suffix, 404 for missing photo/file,
                      500 for processing errors
    """
    # Validate size suffix (empty string is valid for original size)
    if size_suffix != "" and size_suffix not in SCREEN_SIZES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid size suffix '{size_suffix}'. Valid options: '' (original), {list(SCREEN_SIZES.keys())}",
        )

    logger.info(f"Serving photo {photo_id}{size_suffix} - checking database")
    photo = db.photos.get(photo_id)
    if not photo:
        logger.error(f"Photo {photo_id} not found in database")
        raise HTTPException(status_code=404, detail="Photo not found")
    logger.info(
        f"Photo {photo_id} found: realm={photo.realm}, path exists={os.path.exists(photo.path) if photo.path else False}"
    )

    path = photo.path
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Photo file not found")

    # Calculate actual dimensions respecting aspect ratio and no upscaling
    original_aspect = photo.width / photo.height

    # For original size (empty suffix), use original dimensions
    if size_suffix == "":
        width = photo.width
        height = photo.height
    else:
        # Get target dimensions from size configuration
        size_config = SCREEN_SIZES[size_suffix]
        target_width = size_config["width"]

        # Scale based on width only, maintaining aspect ratio
        # Don't upscale - limit to original width
        width = min(target_width, photo.width)
        height = int(width / original_aspect)

    # Process the image
    try:
        logger.debug(
            f"URL: {request.url}  Query params: {dict(request.query_params)} test-enabled: {test}"
        )

        # Check if format conversion is needed (HEIC/TIFF always need conversion to JPEG)
        needs_conversion = photo.uti in ["public.heic", "public.tiff"]

        # Check if scaling is needed (target dimensions are smaller than original)
        needs_scaling = (width > 0 and width < photo.width) or (
            height > 0 and height < photo.height
        )

        logger.debug(
            f"Processing flags: needs_conversion={needs_conversion}, needs_scaling={needs_scaling}, test={test}"
        )

        # Process image if conversion, scaling, or test overlay is needed
        needs_processing = needs_conversion or needs_scaling or test

        if not needs_processing:
            logger.info("No processing needed, returning original file")
            # Return original unscaled image (only if no processing needed at all)
            mime_type = photo.mime_type if not needs_conversion else "image/jpeg"
            return FileResponse(path, media_type=mime_type)

        # Determine test overlay text
        test_overlay = (
            size_suffix if test and size_suffix else ("original" if test else None)
        )

        # Process with ImageMagick service - this is the only processing method available
        logger.debug("Processing image with ImageMagick service")
        image_bytes = process_image_with_imagemagick_service(
            path, width, height, quality, test_overlay
        )

        logger.info(
            f"ImageMagick processed: {photo.width}x{photo.height} -> {width}x{height} (quality: {quality})"
        )

        # Return the processed image
        return StreamingResponse(io.BytesIO(image_bytes), media_type="image/jpeg")

    except Exception as e:
        logger.error(f"Error processing image {path}: {e}")
        raise HTTPException(status_code=500, detail=f"Error processing image: {str(e)}")


@router.get(
    "/api/photos/srcset",
    tags=["photos"],
    summary="Get Responsive Image Sizes",
    description=dedent_and_convert_to_html(
        """
    Get information about available responsive image sizes.
    
    Returns metadata about all supported image size variants that can be
    used with the `/api/photos/{photo_id}/img{size_suffix}` endpoint.
    This information is useful for building responsive image implementations
    with HTML `srcset` attributes.
    
    **Use Cases:**
    - Building responsive image components
    - Generating HTML `srcset` attributes
    - Understanding available size options
    - Performance optimization planning
    
    **Size Information:**
    Each size variant includes:
    - Suffix string for URL construction
    - Target width in pixels
    - Human-readable description
    - Intended use case
    """
    ),
    responses={
        200: {
            "description": "Available image sizes successfully retrieved",
            "content": {
                "application/json": {
                    "example": {
                        "-sm": {"width": 480, "description": "Small mobile"},
                        "-md": {"width": 768, "description": "Tablet"},
                        "-lg": {"width": 1024, "description": "Desktop"},
                        "-xl": {"width": 1440, "description": "Large desktop"},
                        "-xxl": {"width": 1920, "description": "4K desktop"},
                        "-xxxl": {"width": 3860, "description": "8K desktop"},
                    }
                }
            },
        }
    },
)
async def get_photos_srcset():
    """
    Get information about available responsive image sizes.

    Returns metadata for all supported image size variants that can be
    used for responsive image implementations. This endpoint helps clients
    understand what size options are available and their characteristics.

    Returns:
        dict: Dictionary of size variants with width and description info
    """
    return SCREEN_SIZES
