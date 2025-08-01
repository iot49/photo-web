"""
Optimized image scaling implementations for faster performance.
"""

import io
import logging

import cv2
from PIL import Image

logger = logging.getLogger(__name__)


class FastImageScaler:
    """Fast image scaling with multiple backend options."""

    @staticmethod
    def resize_with_opencv(
        image_path: str, width: int, height: int, quality: int = 75
    ) -> bytes:
        """
        Resize image using OpenCV (fastest for basic operations).

        Performance: ~2-10x faster than PIL for basic resize operations.
        Best for: Simple downscaling operations.
        """
        try:
            # Read image
            img = cv2.imread(image_path)
            if img is None:
                raise ValueError(f"Could not read image: {image_path}")

            # Resize using OpenCV
            resized = cv2.resize(img, (width, height), interpolation=cv2.INTER_LANCZOS4)

            # Encode to JPEG
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

        Uses faster resampling algorithm and optimized settings.
        """
        try:
            with Image.open(image_path) as img:
                # Use BILINEAR for faster processing (good quality for downscaling)
                # LANCZOS is slower but higher quality - use based on size difference
                original_size = img.size
                scale_factor = min(width / original_size[0], height / original_size[1])

                if scale_factor < 0.5:
                    # Large downscaling - BILINEAR is sufficient and much faster
                    resampling = Image.Resampling.BILINEAR
                else:
                    # Small scaling - use higher quality
                    resampling = Image.Resampling.BICUBIC

                resized = img.resize((width, height), resampling)

                # Convert to RGB if necessary
                if resized.mode in ("RGBA", "LA", "P"):
                    rgb_img = Image.new("RGB", resized.size, (255, 255, 255))
                    if resized.mode == "P":
                        resized = resized.convert("RGBA")
                    rgb_img.paste(
                        resized,
                        mask=resized.split()[-1] if resized.mode == "RGBA" else None,
                    )
                    resized = rgb_img

                # Save to bytes
                buf = io.BytesIO()
                resized.save(buf, format="JPEG", quality=quality, optimize=True)
                buf.seek(0)
                return buf.getvalue()

        except Exception as e:
            logger.error(f"Pillow optimized resize failed: {e}")
            raise

    @staticmethod
    def resize_with_wand(
        image_path: str, width: int, height: int, quality: int = 75
    ) -> bytes:
        """
        Resize image using Wand (ImageMagick).

        Performance: ~3-8x faster than PIL for complex operations.
        Best for: Format conversion, color space operations.
        """
        try:
            from wand.image import Image as WandImage

            with WandImage(filename=image_path) as img:
                img.resize(width, height, filter="lanczos")
                img.format = "jpeg"
                img.compression_quality = quality
                return img.make_blob()

        except ImportError:
            logger.error("Wand not installed. Install with: pip install Wand")
            raise
        except Exception as e:
            logger.error(f"Wand resize failed: {e}")
            raise

    @classmethod
    def resize_auto(
        cls,
        image_path: str,
        width: int,
        height: int,
        quality: int = 75,
        backend: str = "auto",
    ) -> bytes:
        """
        Automatically choose the best resize method based on available libraries and image characteristics.

        Args:
            image_path: Path to source image
            width: Target width
            height: Target height
            quality: JPEG quality (1-100)
            backend: "auto", "opencv", "pillow", or "wand"

        Returns:
            Resized image as bytes
        """
        if backend == "opencv":
            return cls.resize_with_opencv(image_path, width, height, quality)
        elif backend == "wand":
            return cls.resize_with_wand(image_path, width, height, quality)
        elif backend == "pillow":
            return cls.resize_with_pillow_optimized(image_path, width, height, quality)
        else:
            # Auto-select best backend
            try:
                # Try OpenCV first (fastest for basic operations)
                return cls.resize_with_opencv(image_path, width, height, quality)
            except:
                try:
                    # Fallback to Wand
                    return cls.resize_with_wand(image_path, width, height, quality)
                except:
                    # Final fallback to optimized Pillow
                    return cls.resize_with_pillow_optimized(
                        image_path, width, height, quality
                    )


def benchmark_resize_methods(
    image_path: str, width: int, height: int, iterations: int = 5
):
    """
    Benchmark different resize methods to find the fastest for your specific use case.
    """
    import time

    scaler = FastImageScaler()
    methods = [
        ("OpenCV", lambda: scaler.resize_with_opencv(image_path, width, height)),
        (
            "Pillow Optimized",
            lambda: scaler.resize_with_pillow_optimized(image_path, width, height),
        ),
    ]

    # Add Wand if available
    try:
        from wand.image import Image as WandImage

        methods.append(
            ("Wand", lambda: scaler.resize_with_wand(image_path, width, height))
        )
    except ImportError:
        pass

    results = {}

    for name, method in methods:
        times = []
        for i in range(iterations):
            start = time.time()
            try:
                method()
                end = time.time()
                times.append(end - start)
            except Exception as e:
                logger.error(f"{name} failed: {e}")
                times.append(float("inf"))

        avg_time = sum(times) / len(times)
        results[name] = avg_time
        print(f"{name}: {avg_time:.4f}s average")

    fastest = min(results, key=results.get)
    print(f"\nFastest method: {fastest} ({results[fastest]:.4f}s)")

    return results
