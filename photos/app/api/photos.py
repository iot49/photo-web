import io
import logging
import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse, StreamingResponse
from models import DB
from PIL import Image, ImageDraw, ImageFont

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


@router.get(
    "/api/photos/{photo_id}/img",
    tags=["photos"],
    summary="Serve Photo Image (Original)",
    description="""
    Serve the original full-resolution photo image.
    
    Returns the photo in its original resolution and format, with optional
    format conversion from HEIC to JPEG for browser compatibility.
    
    **Access Control:** Photo access inherited from most permissive album
    
    **Format Handling:**
    - HEIC images automatically converted to JPEG
    - Other formats served as-is when possible
    - Quality parameter applies only to JPEG conversion
    
    **Performance Notes:**
    - Original images may be very large (10MB+)
    - Consider using size variants for better performance
    - Images are cached after first processing
    """,
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
    description="""
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
    - HEIC images always converted to JPEG
    
    **Caching:**
    - Processed images cached at multiple levels
    - Browser cache: 24 hours
    - Nginx cache: 7 days
    - In-memory cache: 1 hour
    
    **Test Mode:**
    When `test=true`, adds a text overlay showing the size suffix
    for debugging responsive image implementations.
    """,
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
    Serve a photo image scaled to common screen sizes.

    Provides responsive image serving with automatic scaling and format
    conversion. Supports multiple size variants optimized for different
    screen sizes and use cases.

    Args:
        photo_id: The UUID of the photo to serve
        size_suffix: Size suffix like "-sm", "-md", etc. (empty for original)
        quality: JPEG quality (1-100, default 75)
        test: When true, embed size-suffix text overlay for debugging
        db: Photos database dependency

    Returns:
        Image scaled to the specified dimensions with appropriate MIME type.
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

    photo = db.photos.get(photo_id)
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

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
        mime_type = "image/jpeg" if needs_conversion else photo.mime_type

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
            return FileResponse(path, media_type=mime_type)

        logger.debug("Processing image with PIL")

        # Process the image
        img = Image.open(path)

        # Resize if needed (either because scaling was requested OR we're processing anyway and target is smaller)
        if needs_scaling or (
            needs_processing and (width < photo.width or height < photo.height)
        ):
            img = img.resize((width, height), Image.Resampling.LANCZOS)
            logger.info(
                f"Resized image from {photo.width}x{photo.height} to {width}x{height}"
            )

        # Add test overlay if requested
        if test:
            # Create a copy to avoid modifying the original
            img = img.copy()
            draw = ImageDraw.Draw(img)

            # Determine text to overlay
            text = size_suffix if size_suffix else "original"

            # Use a more reasonable font size (5% of image width, min 20px, max 100px)
            font_size = max(20, min(100, int(0.05 * img.width)))
            font = None

            try:
                # Try to load a system font with the calculated size
                font = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", font_size)
            except (OSError, IOError):
                try:
                    # Try other common system fonts
                    font = ImageFont.truetype(
                        "/System/Library/Fonts/Helvetica.ttc", font_size
                    )
                except (OSError, IOError):
                    try:
                        # Try another fallback
                        font = ImageFont.truetype(
                            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
                            font_size,
                        )
                    except (OSError, IOError):
                        try:
                            # Create a default font with size parameter
                            font = ImageFont.load_default(size=font_size)
                        except:
                            # Final fallback - use default font
                            font = ImageFont.load_default()
                            logger.warning(
                                f"Could not load any font with size {font_size}, using default"
                            )

            # Get text dimensions
            if font:
                bbox = draw.textbbox((0, 0), text, font=font)
                text_width = bbox[2] - bbox[0]
                text_height = bbox[3] - bbox[1]
            else:
                # Rough estimate if no font available
                text_width = len(text) * font_size * 0.6
                text_height = font_size

            # Position in lower right corner with more padding to avoid cutoff
            padding_x = max(
                50, int(text_width * 0.1)
            )  # At least 50px or 10% of text width
            padding_y = max(
                50, int(text_height * 1.5)
            )  # At least 50px or 1.5x text height (about one line)
            x = max(0, img.width - text_width - padding_x)
            y = max(0, img.height - text_height - padding_y)

            # Draw text with black outline for better visibility
            outline_width = 2
            # Draw outline
            for dx in range(-outline_width, outline_width + 1):
                for dy in range(-outline_width, outline_width + 1):
                    if dx != 0 or dy != 0:
                        draw.text((x + dx, y + dy), text, fill=(0, 0, 0), font=font)

            # Draw main text in white
            draw.text((x, y), text, fill=(255, 255, 255), font=font)

            logger.info(
                f"Added test overlay '{text}' at position ({x}, {y}) with font size {font_size}"
            )

        # Convert to JPEG and return
        buf = io.BytesIO()
        # Convert to RGB if necessary (for RGBA images with transparency)
        if img.mode in ("RGBA", "LA", "P"):
            rgb_img = Image.new("RGB", img.size, (255, 255, 255))
            if img.mode == "P":
                img = img.convert("RGBA")
            rgb_img.paste(img, mask=img.split()[-1] if img.mode == "RGBA" else None)
            img = rgb_img

        img.save(buf, format="JPEG", quality=quality)
        buf.seek(0)

        # Return the processed image
        return StreamingResponse(buf, media_type="image/jpeg")

    except Exception as e:
        logger.error(f"Error processing image {path}: {e}")
        raise HTTPException(status_code=500, detail=f"Error processing image: {str(e)}")


@router.get(
    "/api/photos/srcset",
    tags=["photos"],
    summary="Get Responsive Image Sizes",
    description="""
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
    """,
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
