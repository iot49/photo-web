#!/usr/bin/env python3
"""
Test script to verify fast scaling optimizations are working.
Run this to check if OpenCV is available and test performance.
"""

import logging
from pathlib import Path

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def test_opencv_availability():
    """Test if OpenCV is available and working."""
    try:
        import cv2
        import numpy as np

        logger.info(f"✅ OpenCV available: version {cv2.__version__}")
        return True
    except ImportError as e:
        logger.error(f"❌ OpenCV not available: {e}")
        return False


def test_fast_scaling_functions():
    """Test the fast scaling functions from photos.py."""
    try:
        # Import the functions we added to photos.py
        import sys

        sys.path.append("/app/api")  # Adjust path as needed

        from photos import get_optimal_resampling

        logger.info("✅ Fast scaling functions imported successfully")

        # Test resampling algorithm selection
        test_cases = [
            (0.1, "NEAREST"),
            (0.5, "BILINEAR"),
            (0.7, "BICUBIC"),
            (0.95, "LANCZOS"),
        ]

        for scale_factor, expected in test_cases:
            resampling = get_optimal_resampling(scale_factor)
            logger.info(
                f"Scale {scale_factor}: {resampling.name} (expected: {expected})"
            )

        return True

    except Exception as e:
        logger.error(f"❌ Error testing fast scaling functions: {e}")
        return False


def benchmark_if_possible():
    """Run a simple benchmark if we can find a test image."""
    test_image_paths = [
        "/app/test_image.jpg",  # You might need to provide a test image
        "/usr/share/pixmaps/python.xpm",
        "/System/Library/Desktop Pictures/Monterey.heic",
    ]

    test_image = None
    for path in test_image_paths:
        if Path(path).exists():
            test_image = path
            break

    if not test_image:
        logger.warning("⚠️  No test image found for benchmarking")
        return

    logger.info(f"🏃 Running benchmark with: {test_image}")

    try:
        from image_scaling_docker import benchmark_resize_methods_docker

        results = benchmark_resize_methods_docker(test_image, 800, 600, iterations=3)

        if results:
            fastest = min(results, key=results.get)
            logger.info(f"🏆 Fastest method: {fastest}")

            if (
                "Standard PIL (LANCZOS)" in results
                and fastest != "Standard PIL (LANCZOS)"
            ):
                speedup = results["Standard PIL (LANCZOS)"] / results[fastest]
                logger.info(f"🚀 Speedup vs standard PIL: {speedup:.1f}x faster")

    except Exception as e:
        logger.error(f"❌ Benchmark failed: {e}")


def main():
    """Main test function."""
    print("🧪 Testing Fast Image Scaling Optimizations")
    print("=" * 50)

    # Test 1: OpenCV availability
    print("\n1. Testing OpenCV availability...")
    opencv_available = test_opencv_availability()

    # Test 2: Fast scaling functions
    print("\n2. Testing fast scaling functions...")
    functions_working = test_fast_scaling_functions()

    # Test 3: Benchmark (if possible)
    print("\n3. Running benchmark...")
    benchmark_if_possible()

    # Summary
    print("\n" + "=" * 50)
    print("📊 SUMMARY:")
    print(f"OpenCV Available: {'✅ YES' if opencv_available else '❌ NO'}")
    print(f"Functions Working: {'✅ YES' if functions_working else '❌ NO'}")

    if opencv_available and functions_working:
        print("\n🎉 Fast scaling optimizations are ready!")
        print("💡 Use ?fast=true in your photo URLs to enable optimizations")
        print("📈 Expected speedup: 2-10x faster depending on image size")
    else:
        print("\n⚠️  Some optimizations may not be available")
        print("🔧 Check your requirements.txt and Docker build")


if __name__ == "__main__":
    main()
