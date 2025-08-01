"""
Docker-compatible optimized image scaling implementations.
Focuses on OpenCV-headless and optimized PIL settings that work in containerized environments.
"""

import io
import logging

from PIL import Image

logger = logging.getLogger(__name__)

# Try to import optional fast libraries with graceful fallbacks
try:
    import cv2
    import numpy as np

    HAS_OPENCV = True
    logger.info("OpenCV available for fast image processing")
except ImportError:
    HAS_OPENCV = False
    logger.info("OpenCV not available, using PIL fallback")


class DockerFastImageScaler:
    """Docker-compatible fast image scaling with automatic fallbacks."""

    @staticmethod
    def resize_with_opencv(
        image_path: str, width: int, height: int, quality: int = 75
    ) -> bytes:
        """
        Resize image using OpenCV (fastest for basic operations).

        Performance: ~2-10x faster than PIL for basic resize operations.
        Works with opencv-python-headless in Docker environments.
        """
        if not HAS_OPENCV:
            raise ImportError("OpenCV not available")

        try:
            # Read image
            img = cv2.imread(image_path)
            if img is None:
                raise ValueError(f"Could not read image: {image_path}")

            # Resize using OpenCV with high-quality interpolation
            resized = cv2.resize(img, (width, height), interpolation=cv2.INTER_LANCZOS4)

            # Encode to JPEG with quality settings
            encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), quality]
            success, encoded_img = cv2.imencode(".jpg", resized, encode_param)

            if not success:
                raise ValueError("Failed to encode image")

            return encoded_img.tobytes()

        except Exception as e:
            logger.error(f"OpenCV resize failed: {e}")
            raise

    @staticmethod
    def resize_with_pillow_optimized(
        image_path: str, width: int, height: int, quality: int = 75
    ) -> bytes:
        """
        Resize image using optimized Pillow settings.

        Uses smart resampling algorithm selection and optimized settings.
        Compatible with all Docker environments.
        """
        try:
            with Image.open(image_path) as img:
                # Calculate scale factor to choose optimal resampling
                original_size = img.size
                scale_factor = min(width / original_size[0], height / original_size[1])

                # Smart resampling selection for performance vs quality
                if scale_factor < 0.3:
                    # Very large downscaling - NEAREST is fastest for thumbnails
                    resampling = Image.Resampling.NEAREST
                    logger.debug("Using NEAREST resampling for very large downscaling")
                elif scale_factor < 0.6:
                    # Large downscaling - BILINEAR is much faster and good quality
                    resampling = Image.Resampling.BILINEAR
                    logger.debug("Using BILINEAR resampling for large downscaling")
                elif scale_factor < 0.9:
                    # Medium scaling - BICUBIC for balanced speed/quality
                    resampling = Image.Resampling.BICUBIC
                    logger.debug("Using BICUBIC resampling for medium scaling")
                else:
                    # Small scaling or upscaling - LANCZOS for best quality
                    resampling = Image.Resampling.LANCZOS
                    logger.debug("Using LANCZOS resampling for small scaling")

                # Resize the image
                resized = img.resize((width, height), resampling)

                # Convert to RGB if necessary (handle transparency)
                if resized.mode in ("RGBA", "LA", "P"):
                    rgb_img = Image.new("RGB", resized.size, (255, 255, 255))
                    if resized.mode == "P":
                        resized = resized.convert("RGBA")
                    rgb_img.paste(
                        resized,
                        mask=resized.split()[-1] if resized.mode == "RGBA" else None,
                    )
                    resized = rgb_img

                # Save to bytes with optimization
                buf = io.BytesIO()
                resized.save(buf, format="JPEG", quality=quality, optimize=True)
                buf.seek(0)
                return buf.getvalue()

        except Exception as e:
            logger.error(f"Pillow optimized resize failed: {e}")
            raise

    @classmethod
    def resize_auto(
        cls,
        image_path: str,
        width: int,
        height: int,
        quality: int = 75,
        prefer_opencv: bool = True,
    ) -> bytes:
        """
        Automatically choose the best resize method based on available libraries.

        Args:
            image_path: Path to source image
            width: Target width
            height: Target height
            quality: JPEG quality (1-100)
            prefer_opencv: Try OpenCV first if available

        Returns:
            Resized image as bytes
        """
        if prefer_opencv and HAS_OPENCV:
            try:
                return cls.resize_with_opencv(image_path, width, height, quality)
            except Exception as e:
                logger.warning(f"OpenCV resize failed ({e}), falling back to PIL")

        # Fallback to optimized Pillow
        return cls.resize_with_pillow_optimized(image_path, width, height, quality)


def get_optimal_resampling_for_scale(scale_factor: float) -> Image.Resampling:
    """
    Get the optimal PIL resampling algorithm based on scale factor.

    This function provides a performance-optimized approach to choosing
    resampling algorithms based on how much the image is being scaled.

    Args:
        scale_factor: Ratio of target size to original size (0.5 = half size)

    Returns:
        PIL resampling algorithm enum
    """
    if scale_factor < 0.3:
        # Very large downscaling - NEAREST is fastest for thumbnails
        return Image.Resampling.NEAREST
    elif scale_factor < 0.6:
        # Large downscaling - BILINEAR is much faster and good quality
        return Image.Resampling.BILINEAR
    elif scale_factor < 0.9:
        # Medium scaling - BICUBIC for balanced speed/quality
        return Image.Resampling.BICUBIC
    else:
        # Small scaling or upscaling - LANCZOS for best quality
        return Image.Resampling.LANCZOS


def benchmark_resize_methods_docker(
    image_path: str, width: int, height: int, iterations: int = 3
):
    """
    Benchmark different resize methods available in Docker environment.
    """
    import time

    scaler = DockerFastImageScaler()
    methods = []

    # Add OpenCV if available
    if HAS_OPENCV:
        methods.append(
            ("OpenCV", lambda: scaler.resize_with_opencv(image_path, width, height))
        )

    # Always add optimized Pillow
    methods.append(
        (
            "Pillow Optimized",
            lambda: scaler.resize_with_pillow_optimized(image_path, width, height),
        )
    )

    # Add standard PIL for comparison
    def resize_with_standard_pil():
        with Image.open(image_path) as img:
            resized = img.resize((width, height), Image.Resampling.LANCZOS)
            buf = io.BytesIO()
            if resized.mode in ("RGBA", "LA", "P"):
                rgb_img = Image.new("RGB", resized.size, (255, 255, 255))
                if resized.mode == "P":
                    resized = resized.convert("RGBA")
                rgb_img.paste(
                    resized,
                    mask=resized.split()[-1] if resized.mode == "RGBA" else None,
                )
                resized = rgb_img
            resized.save(buf, format="JPEG", quality=75)
            return buf.getvalue()

    methods.append(("Standard PIL (LANCZOS)", resize_with_standard_pil))

    results = {}

    print(
        f"Benchmarking resize from original to {width}x{height} ({iterations} iterations)"
    )
    print("-" * 60)

    for name, method in methods:
        times = []
        for i in range(iterations):
            start = time.time()
            try:
                result = method()
                end = time.time()
                times.append(end - start)
                if i == 0:  # Log size of first result
                    print(f"{name}: {len(result)} bytes output")
            except Exception as e:
                logger.error(f"{name} failed: {e}")
                times.append(float("inf"))

        if times and min(times) != float("inf"):
            avg_time = sum(times) / len(times)
            min_time = min(times)
            results[name] = avg_time
            print(f"{name}: {avg_time:.4f}s avg, {min_time:.4f}s min")
        else:
            print(f"{name}: FAILED")

    if results:
        fastest = min(results, key=results.get)
        print(f"\nFastest method: {fastest} ({results[fastest]:.4f}s)")

        # Calculate speedup vs standard PIL
        if "Standard PIL (LANCZOS)" in results and fastest != "Standard PIL (LANCZOS)":
            speedup = results["Standard PIL (LANCZOS)"] / results[fastest]
            print(f"Speedup vs standard PIL: {speedup:.1f}x faster")

    return results
