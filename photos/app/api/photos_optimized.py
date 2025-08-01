"""
Optimized version of photos.py with faster image scaling.
"""

import io
import logging
import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse, StreamingResponse

# Import our optimized scaler
from image_scaling_optimized import FastImageScaler
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
async def serve_photo_image_sized_optimized(
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
    backend: str = Query(
        "auto", description="Image processing backend: auto, opencv, pillow, wand"
    ),
    db: DB = Depends(get_db),
):
    """
    Optimized version of serve_photo_image_sized with faster image scaling.

    Performance improvements:
    - Uses OpenCV for fastest basic operations
    - Falls back to Wand or optimized Pillow
    - Smarter resampling algorithm selection
    - Optional backend selection for testing
    """
    # Validate size suffix
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

    # Calculate dimensions
    original_aspect = photo.width / photo.height

    if size_suffix == "":
        width = photo.width
        height = photo.height
    else:
        size_config = SCREEN_SIZES[size_suffix]
        target_width = size_config["width"]
        width = min(target_width, photo.width)
        height = int(width / original_aspect)

    try:
        logger.debug(f"Processing with backend: {backend}")

        # Check if any processing is needed
        needs_conversion = photo.uti in ["public.heic", "public.tiff"]
        needs_scaling = width < photo.width or height < photo.height
        needs_processing = needs_conversion or needs_scaling or test

        if not needs_processing:
            logger.info("No processing needed, returning original file")
            mime_type = "image/jpeg" if needs_conversion else photo.mime_type
            return FileResponse(path, media_type=mime_type)

        # Use fast scaling if no test overlay needed
        if not test:
            logger.info(
                f"Fast scaling with {backend} backend: {photo.width}x{photo.height} -> {width}x{height}"
            )

            try:
                # Use our optimized scaler
                image_bytes = FastImageScaler.resize_auto(
                    path, width, height, quality, backend
                )

                return StreamingResponse(
                    io.BytesIO(image_bytes), media_type="image/jpeg"
                )

            except Exception as e:
                logger.warning(f"Fast scaling failed ({e}), falling back to PIL")
                # Fall through to PIL processing below

        # Fallback to PIL for test overlay or if fast scaling failed
        logger.debug("Using PIL for processing (test overlay or fallback)")

        img = Image.open(path)

        # Resize if needed with optimized resampling
        if needs_scaling:
            # Choose resampling based on scale factor for better performance
            scale_factor = min(width / photo.width, height / photo.height)
            if scale_factor < 0.5:
                # Large downscaling - BILINEAR is much faster and sufficient
                resampling = Image.Resampling.BILINEAR
                logger.debug("Using BILINEAR resampling for large downscaling")
            elif scale_factor < 0.8:
                # Medium downscaling - BICUBIC for balanced speed/quality
                resampling = Image.Resampling.BICUBIC
                logger.debug("Using BICUBIC resampling for medium downscaling")
            else:
                # Small scaling - use LANCZOS for best quality
                resampling = Image.Resampling.LANCZOS
                logger.debug("Using LANCZOS resampling for small scaling")

            img = img.resize((width, height), resampling)
            logger.info(
                f"Resized image from {photo.width}x{photo.height} to {width}x{height}"
            )

        # Add test overlay if requested
        if test:
            img = img.copy()
            draw = ImageDraw.Draw(img)
            text = size_suffix if size_suffix else "original"

            # Optimized font loading
            font_size = max(20, min(100, int(0.05 * img.width)))
            font = None

            # Try to load system fonts
            font_paths = [
                "/System/Library/Fonts/Arial.ttf",
                "/System/Library/Fonts/Helvetica.ttc",
                "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            ]

            for font_path in font_paths:
                try:
                    font = ImageFont.truetype(font_path, font_size)
                    break
                except (OSError, IOError):
                    continue

            if not font:
                try:
                    font = ImageFont.load_default(size=font_size)
                except:
                    font = ImageFont.load_default()

            # Position text in lower right corner
            if font:
                bbox = draw.textbbox((0, 0), text, font=font)
                text_width = bbox[2] - bbox[0]
                text_height = bbox[3] - bbox[1]
            else:
                text_width = len(text) * font_size * 0.6
                text_height = font_size

            padding_x = max(50, int(text_width * 0.1))
            padding_y = max(50, int(text_height * 1.5))
            x = max(0, img.width - text_width - padding_x)
            y = max(0, img.height - text_height - padding_y)

            # Draw text with outline
            outline_width = 2
            for dx in range(-outline_width, outline_width + 1):
                for dy in range(-outline_width, outline_width + 1):
                    if dx != 0 or dy != 0:
                        draw.text((x + dx, y + dy), text, fill=(0, 0, 0), font=font)

            draw.text((x, y), text, fill=(255, 255, 255), font=font)
            logger.info(f"Added test overlay '{text}' at position ({x}, {y})")

        # Convert to JPEG and return
        buf = io.BytesIO()

        # Convert to RGB if necessary
        if img.mode in ("RGBA", "LA", "P"):
            rgb_img = Image.new("RGB", img.size, (255, 255, 255))
            if img.mode == "P":
                img = img.convert("RGBA")
            rgb_img.paste(img, mask=img.split()[-1] if img.mode == "RGBA" else None)
            img = rgb_img

        # Save with optimization
        img.save(buf, format="JPEG", quality=quality, optimize=True)
        buf.seek(0)

        return StreamingResponse(buf, media_type="image/jpeg")

    except Exception as e:
        logger.error(f"Error processing image {path}: {e}")
        raise HTTPException(status_code=500, detail=f"Error processing image: {str(e)}")


@router.get("/api/photos/srcset")
async def get_photos_srcset():
    """Get information about available responsive image sizes."""
    return SCREEN_SIZES


@router.get("/api/photos/benchmark/{photo_id}")
async def benchmark_photo_scaling(
    photo_id: str,
    size_suffix: str = Query("-md", description="Size suffix to benchmark"),
    iterations: int = Query(3, ge=1, le=10, description="Number of iterations"),
    db: DB = Depends(get_db),
):
    """
    Benchmark different scaling methods for a specific photo.
    Useful for determining the fastest method for your specific image types and sizes.
    """
    photo = db.photos.get(photo_id)
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    path = photo.path
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Photo file not found")

    if size_suffix not in SCREEN_SIZES:
        raise HTTPException(
            status_code=400, detail=f"Invalid size suffix: {size_suffix}"
        )

    # Calculate target dimensions
    size_config = SCREEN_SIZES[size_suffix]
    target_width = size_config["width"]
    original_aspect = photo.width / photo.height
    width = min(target_width, photo.width)
    height = int(width / original_aspect)

    try:
        # Import the benchmark function
        from image_scaling_optimized import benchmark_resize_methods

        results = benchmark_resize_methods(path, width, height, iterations)

        return {
            "photo_id": photo_id,
            "original_size": {"width": photo.width, "height": photo.height},
            "target_size": {"width": width, "height": height},
            "size_suffix": size_suffix,
            "iterations": iterations,
            "results": results,
            "fastest_method": min(results, key=results.get),
        }

    except Exception as e:
        logger.error(f"Benchmark failed: {e}")
        raise HTTPException(status_code=500, detail=f"Benchmark failed: {str(e)}")
