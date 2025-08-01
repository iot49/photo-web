"""
Migration script to integrate fast image scaling into existing photos API.

This script helps you transition from the current PIL-only implementation
to the optimized multi-backend scaling system.
"""

import logging
import os
import shutil
from pathlib import Path

logger = logging.getLogger(__name__)


def backup_original_photos_api():
    """Create a backup of the original photos.py file."""
    original_path = Path("api/photos.py")
    backup_path = Path("api/photos_original_backup.py")

    if original_path.exists():
        shutil.copy2(original_path, backup_path)
        logger.info(f"Backed up original photos.py to {backup_path}")
        return True
    else:
        logger.error("Original photos.py not found")
        return False


def integrate_fast_scaling():
    """
    Integrate fast scaling into the existing photos.py file.

    This modifies the existing serve_photo_image_sized function to use
    the optimized scaling methods while maintaining backward compatibility.
    """
    original_path = Path("api/photos.py")
    optimized_path = Path("api/photos_optimized.py")

    if not original_path.exists():
        logger.error("Original photos.py not found")
        return False

    if not optimized_path.exists():
        logger.error("Optimized photos.py not found")
        return False

    # Read the original file
    with open(original_path, "r") as f:
        original_content = f.read()

    # Add import for FastImageScaler at the top
    import_line = "from image_scaling_optimized import FastImageScaler\n"

    if import_line not in original_content:
        # Find the last import line and add our import after it
        lines = original_content.split("\n")
        last_import_idx = -1

        for i, line in enumerate(lines):
            if line.startswith("from ") or line.startswith("import "):
                last_import_idx = i

        if last_import_idx >= 0:
            lines.insert(last_import_idx + 1, import_line.strip())
            original_content = "\n".join(lines)
            logger.info("Added FastImageScaler import")

    # Add backend parameter to the function signature
    if "backend: str = Query(" not in original_content:
        # This is a more complex replacement - for now, suggest manual integration
        logger.warning("Manual integration required for backend parameter")

    # Write the modified content back
    with open(original_path, "w") as f:
        f.write(original_content)

    logger.info("Integration completed - manual review recommended")
    return True


def install_dependencies():
    """Install the required dependencies for fast scaling."""
    import subprocess
    import sys

    dependencies = [
        "Pillow-SIMD",  # Will replace regular Pillow
        "opencv-python",
        "Wand",
        "numpy",
    ]

    logger.info("Installing optimized dependencies...")

    # First uninstall regular Pillow
    try:
        subprocess.check_call(
            [sys.executable, "-m", "pip", "uninstall", "-y", "Pillow"]
        )
        logger.info("Uninstalled regular Pillow")
    except subprocess.CalledProcessError:
        logger.warning("Could not uninstall regular Pillow (may not be installed)")

    # Install new dependencies
    for dep in dependencies:
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", dep])
            logger.info(f"Installed {dep}")
        except subprocess.CalledProcessError as e:
            logger.error(f"Failed to install {dep}: {e}")
            return False

    return True


def run_benchmark_test():
    """Run a benchmark test to verify the installation and performance."""
    try:
        from image_scaling_optimized import benchmark_resize_methods

        # Find a test image
        test_image_paths = [
            "/System/Library/Desktop Pictures/Monterey.heic",
            "/System/Library/Desktop Pictures/Big Sur.heic",
            "/usr/share/pixmaps/python.xpm",
        ]

        test_image = None
        for path in test_image_paths:
            if os.path.exists(path):
                test_image = path
                break

        if not test_image:
            logger.warning("No test image found for benchmark")
            return False

        logger.info(f"Running benchmark with test image: {test_image}")
        results = benchmark_resize_methods(test_image, 800, 600, iterations=3)

        logger.info("Benchmark completed successfully")
        return True

    except Exception as e:
        logger.error(f"Benchmark test failed: {e}")
        return False


def main():
    """Main migration function."""
    logging.basicConfig(level=logging.INFO)

    print("🚀 Fast Image Scaling Migration")
    print("=" * 40)

    # Step 1: Backup original
    print("\n1. Backing up original photos.py...")
    if backup_original_photos_api():
        print("✅ Backup created")
    else:
        print("❌ Backup failed")
        return

    # Step 2: Install dependencies
    print("\n2. Installing optimized dependencies...")
    if install_dependencies():
        print("✅ Dependencies installed")
    else:
        print("❌ Dependency installation failed")
        return

    # Step 3: Run benchmark test
    print("\n3. Running benchmark test...")
    if run_benchmark_test():
        print("✅ Benchmark test passed")
    else:
        print("⚠️  Benchmark test failed (but installation may still work)")

    # Step 4: Integration guidance
    print("\n4. Integration Steps:")
    print("   📝 Manual steps required:")
    print(
        "   1. Add 'from image_scaling_optimized import FastImageScaler' to photos.py"
    )
    print(
        "   2. Add 'backend: str = Query(\"auto\", ...)' parameter to serve_photo_image_sized"
    )
    print(
        "   3. Replace the PIL resize section with FastImageScaler.resize_auto() call"
    )
    print("   4. See photos_optimized.py for complete example")

    print("\n🎉 Migration preparation complete!")
    print("📖 Review photos_optimized.py for the complete optimized implementation")


if __name__ == "__main__":
    main()
