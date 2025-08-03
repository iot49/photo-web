"""
ImageMagick service integration for HEIC and other image processing.
Uses the official ImageMagick Docker container for reliable image processing.
"""

import logging
import os
import shutil
import subprocess
import tempfile
import time
from typing import Optional

from fastapi import HTTPException

logger = logging.getLogger(__name__)


def process_image_with_imagemagick_service(
    input_path: str,
    width: int,
    height: int,
    quality: int = 85,
    test_overlay: Optional[str] = None,
) -> bytes:
    """
    Process any image format including HEIC using the ImageMagick Docker service.

    Args:
        input_path: Path to the input image file
        width: Target width in pixels
        height: Target height in pixels
        quality: JPEG quality (1-100)
        test_overlay: Optional text to overlay for testing

    Returns:
        bytes: Processed image as JPEG bytes

    Raises:
        HTTPException: If image processing fails
    """
    try:
        # Create unique temporary directory for this operation
        with tempfile.TemporaryDirectory(prefix="imagemagick_") as temp_dir:
            # Copy input file to temp directory with a clean name
            input_ext = os.path.splitext(input_path)[1].lower()
            temp_input = os.path.join(temp_dir, f"input{input_ext}")
            temp_output = os.path.join(temp_dir, "output.jpg")

            shutil.copy2(input_path, temp_input)

            # Build ImageMagick command
            magick_cmd = [
                "magick",
                f"/images/{os.path.basename(temp_input)}",
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
                magick_cmd.extend(
                    [
                        "-gravity",
                        "SouthEast",
                        "-pointsize",
                        str(font_size),
                        "-fill",
                        "white",
                        "-stroke",
                        "black",
                        "-strokewidth",
                        "2",
                        "-annotate",
                        "+50+50",
                        test_overlay,
                    ]
                )

            # Output file
            magick_cmd.append(f"/images/{os.path.basename(temp_output)}")

            # Since both containers now have access to the same photo library,
            # we can process the file directly without copying to shared volume
            # Convert the input path to the ImageMagick container's perspective
            if input_path.startswith("/photo_db"):
                # Already in the correct format for ImageMagick container
                container_input_path = input_path
            else:
                # This shouldn't happen with the new setup, but handle it gracefully
                container_input_path = input_path

            # Create output file in shared volume for result
            shared_dir = "/tmp/imagemagick"
            os.makedirs(shared_dir, exist_ok=True)

            # Generate unique filename to avoid conflicts
            timestamp = str(int(time.time() * 1000000))
            shared_output = os.path.join(shared_dir, f"output_{timestamp}.jpg")

            # Update magick command to use direct input path and shared output
            magick_cmd[1] = container_input_path
            magick_cmd[-1] = f"/images/{os.path.basename(shared_output)}"

            # Execute command in ImageMagick container
            docker_cmd = ["docker", "exec", "imagemagick"] + magick_cmd

            logger.debug(f"Running ImageMagick service command: {' '.join(docker_cmd)}")

            # Execute the command
            result = subprocess.run(
                docker_cmd,
                capture_output=True,
                text=True,
                timeout=60,  # 60 second timeout
            )

            if result.returncode != 0:
                error_msg = result.stderr or result.stdout or "Unknown error"
                logger.error(f"ImageMagick service command failed: {error_msg}")

                # Check for specific HEIC-related errors and provide more helpful messages
                if (
                    "no decode delegate" in error_msg.lower()
                    or "heic" in error_msg.lower()
                ):
                    raise HTTPException(
                        status_code=500,
                        detail=f"HEIC format processing failed: {error_msg}. This may indicate libheif compatibility issues with this HEIC variant.",
                    )
                elif "IsHEIFSuccess" in error_msg:
                    raise HTTPException(
                        status_code=500,
                        detail=f"HEIC metadata error: {error_msg}. This HEIC file variant may not be compatible with the current libheif version.",
                    )
                else:
                    raise HTTPException(
                        status_code=500, detail=f"Image processing failed: {error_msg}"
                    )

            # Read the processed image from shared volume
            if not os.path.exists(shared_output):
                raise HTTPException(
                    status_code=500,
                    detail="ImageMagick processing completed but output file not found",
                )

            with open(shared_output, "rb") as f:
                image_bytes = f.read()

            # Clean up shared files
            try:
                os.remove(shared_output)
            except OSError:
                pass  # Ignore cleanup errors

            logger.info(
                f"ImageMagick service processed image: {input_path} -> {width}x{height} (quality: {quality})"
            )
            return image_bytes

    except subprocess.TimeoutExpired:
        logger.error(f"ImageMagick service command timed out for image: {input_path}")
        raise HTTPException(status_code=500, detail="Image processing timed out")
    except FileNotFoundError:
        logger.error(
            "Docker command not found - ensure Docker is installed and running"
        )
        raise HTTPException(
            status_code=500,
            detail="Docker not available - image processing service unavailable",
        )
    except Exception as e:
        logger.error(f"Unexpected error in ImageMagick service processing: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Image processing error: {str(e)}")


def check_imagemagick_service() -> bool:
    """
    Check if the ImageMagick service is available and has HEIC support.

    Returns:
        bool: True if service is available with HEIC support
    """
    try:
        # Check if ImageMagick container is running
        result = subprocess.run(
            ["docker", "exec", "imagemagick", "magick", "-version"],
            capture_output=True,
            text=True,
            timeout=10,
        )

        if result.returncode != 0:
            logger.error("ImageMagick service not responding")
            return False

        # Check for HEIC support
        result = subprocess.run(
            ["docker", "exec", "imagemagick", "magick", "-list", "format"],
            capture_output=True,
            text=True,
            timeout=10,
        )

        if result.returncode == 0 and "HEIC" in result.stdout:
            logger.info("ImageMagick service is available with HEIC support")
            return True
        else:
            logger.warning(
                "ImageMagick service available but HEIC support not confirmed"
            )
            return False

    except Exception as e:
        logger.error(f"Failed to check ImageMagick service: {str(e)}")
        return False
