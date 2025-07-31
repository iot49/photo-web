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


@router.get("/api/photos/{photo_id}/img")
@router.get("/api/photos/{photo_id}/img{size_suffix}")
async def serve_photo_image_sized(
    photo_id: str,
    request: Request,
    size_suffix: str = "",
    quality: Optional[int] = Query(75, ge=1, le=100),
    test: bool = Query(
        False, description="When true, embed size-suffix text overlay in image"
    ),
    db: DB = Depends(get_db),
):
    """
    Serve a photo image scaled to common screen sizes.

    Access rules handled by /authorize

    Size suffixes:
    - "" (empty): Original full-size image
    - "-sm": Small mobile (480px width)
    - "-md": Tablet (768px width)
    - "-lg": Desktop (1024px width)
    - "-xl": Large desktop (1440px width)
    - "-xxl": 4K desktop (1920px width)
    - "-xxxl": 8K desktop (3860px width)

    Access rules same as /api/photo/{photo_uuid}/image endpoint.

    Args:
        photo_id (str): The UUID of the photo
        size_suffix (str): Size suffix like "-sm", "-md", etc.
        quality (int): JPEG quality (1-100, default 75)
        test (bool): When true, embed size-suffix text overlay in image

    Returns:
        Image scaled to the number of width pixels specified by the suffix with correct MIME type.
        No up-scaling: if the original image width is smaller than the specified width, the unscaled original is returned.
        Without suffix, returns the unscaled original (may be huge).
        When test=True, adds size-suffix text overlay in lower right corner.
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


@router.get("/api/photos/srcset")
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
                "suffix": "-xxl",
                "width": 1920,
                "description": "4K desktop"
            }
        ]
        ```
    """
    return SCREEN_SIZES
