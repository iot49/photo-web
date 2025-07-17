import concurrent.futures
import io
import os
import sys
import time
from unittest.mock import Mock, patch

import pytest
from fastapi.testclient import TestClient
from PIL import Image

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from serve_photo_image_refactored import ImageProcessor, ImageScaler, app, get_db

from ..app.models import DB, PhotoModelWithPath


class TestPerformanceScenarios:
    """Test performance under various real-world scenarios."""

    @pytest.fixture
    def mock_db_with_various_images(self):
        """Create a mock database with various image types and sizes."""
        photos = {}

        # Common screen resolutions and image types
        test_images = [
            # Mobile portrait
            {
                "uuid": "mobile-portrait",
                "width": 1080,
                "height": 1920,
                "uti": "public.jpeg",
            },
            # Mobile landscape
            {
                "uuid": "mobile-landscape",
                "width": 1920,
                "height": 1080,
                "uti": "public.jpeg",
            },
            # Tablet
            {"uuid": "tablet", "width": 2048, "height": 1536, "uti": "public.jpeg"},
            # Desktop HD
            {"uuid": "desktop-hd", "width": 1920, "height": 1080, "uti": "public.jpeg"},
            # Desktop 4K
            {"uuid": "desktop-4k", "width": 3840, "height": 2160, "uti": "public.jpeg"},
            # Ultra-wide
            {"uuid": "ultrawide", "width": 3440, "height": 1440, "uti": "public.jpeg"},
            # Square (Instagram style)
            {"uuid": "square", "width": 1080, "height": 1080, "uti": "public.jpeg"},
            # Panorama
            {"uuid": "panorama", "width": 8000, "height": 2000, "uti": "public.jpeg"},
            # Tall portrait
            {
                "uuid": "tall-portrait",
                "width": 1080,
                "height": 3000,
                "uti": "public.jpeg",
            },
            # HEIC image
            {"uuid": "heic-image", "width": 4032, "height": 3024, "uti": "public.heic"},
            # Very large image
            {
                "uuid": "very-large",
                "width": 10000,
                "height": 8000,
                "uti": "public.jpeg",
            },
            # Small image
            {"uuid": "small", "width": 200, "height": 150, "uti": "public.jpeg"},
        ]

        for img_data in test_images:
            photo = PhotoModelWithPath(
                uuid=img_data["uuid"],
                date="2023-01-01",
                public=True,
                mime_type="image/jpeg",
                width=img_data["width"],
                height=img_data["height"],
                uti=img_data["uti"],
                path=f"/test/{img_data['uuid']}.jpg",
            )
            photos[img_data["uuid"]] = photo

        return DB(albums={}, photos=photos)

    @pytest.fixture
    def client(self, mock_db_with_various_images):
        """Create a test client with mocked database."""
        app.dependency_overrides[get_db] = lambda: mock_db_with_various_images
        client = TestClient(app)
        yield client
        app.dependency_overrides.clear()

    def create_test_image(self, width: int, height: int) -> io.BytesIO:
        """Create a test image of specified dimensions."""
        img = Image.new("RGB", (width, height), color="blue")
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        buf.seek(0)
        return buf


class TestScreenSizeAdaptation:
    """Test adaptation to various screen sizes and resolutions."""

    def test_mobile_portrait_scaling(self):
        """Test scaling for mobile portrait screens."""
        # iPhone 13 Pro: 390x844 logical pixels
        mobile_width, mobile_height = 390, 844

        # Large desktop image scaled for mobile
        scaled_w, scaled_h = ImageScaler.calculate_dimensions(
            3840,
            2160,  # 4K source
            target_width=mobile_width,
            target_height=mobile_height,
            scale_mode="fit",
        )

        # Should fit within mobile screen
        assert scaled_w <= mobile_width
        assert scaled_h <= mobile_height
        # Should maintain aspect ratio
        assert abs((scaled_w / scaled_h) - (3840 / 2160)) < 0.01

    def test_mobile_landscape_scaling(self):
        """Test scaling for mobile landscape screens."""
        mobile_width, mobile_height = 844, 390

        scaled_w, scaled_h = ImageScaler.calculate_dimensions(
            1080,
            1920,  # Portrait source
            target_width=mobile_width,
            target_height=mobile_height,
            scale_mode="fit",
        )

        assert scaled_w <= mobile_width
        assert scaled_h <= mobile_height

    def test_tablet_scaling(self):
        """Test scaling for tablet screens."""
        # iPad Pro 12.9": 1024x1366 logical pixels
        tablet_width, tablet_height = 1024, 1366

        scaled_w, scaled_h = ImageScaler.calculate_dimensions(
            8000,
            2000,  # Panorama source
            target_width=tablet_width,
            target_height=tablet_height,
            scale_mode="fit",
        )

        assert scaled_w <= tablet_width
        assert scaled_h <= tablet_height

    def test_desktop_scaling(self):
        """Test scaling for desktop screens."""
        # Common desktop resolutions
        desktop_resolutions = [
            (1920, 1080),  # Full HD
            (2560, 1440),  # QHD
            (3840, 2160),  # 4K
            (3440, 1440),  # Ultra-wide
        ]

        for desktop_w, desktop_h in desktop_resolutions:
            scaled_w, scaled_h = ImageScaler.calculate_dimensions(
                10000,
                8000,  # Very large source
                target_width=desktop_w,
                target_height=desktop_h,
                scale_mode="fit",
            )

            assert scaled_w <= desktop_w
            assert scaled_h <= desktop_h

    def test_retina_display_scaling(self):
        """Test scaling for high-DPI (Retina) displays."""
        # Retina displays typically request 2x resolution
        logical_width, logical_height = 800, 600
        retina_width, retina_height = logical_width * 2, logical_height * 2

        scaled_w, scaled_h = ImageScaler.calculate_dimensions(
            4032,
            3024,  # High-res camera image
            target_width=retina_width,
            target_height=retina_height,
            scale_mode="fit",
        )

        # Should provide high-quality image for Retina
        assert scaled_w >= logical_width
        assert scaled_h >= logical_height


class TestOrientationChanges:
    """Test handling of orientation changes and rotations."""

    def test_portrait_to_landscape_adaptation(self):
        """Test adapting portrait images for landscape viewing."""
        # Portrait image: 1080x1920
        # Landscape viewport: 1920x1080

        scaled_w, scaled_h = ImageScaler.calculate_dimensions(
            1080,
            1920,  # Portrait source
            target_width=1920,
            target_height=1080,
            scale_mode="fit",
        )

        # Should fit within landscape viewport
        assert scaled_w <= 1920
        assert scaled_h <= 1080
        # Should be limited by height
        assert scaled_h == 1080
        assert scaled_w == 607  # 1080 * (1080/1920)

    def test_landscape_to_portrait_adaptation(self):
        """Test adapting landscape images for portrait viewing."""
        # Landscape image: 1920x1080
        # Portrait viewport: 1080x1920

        scaled_w, scaled_h = ImageScaler.calculate_dimensions(
            1920,
            1080,  # Landscape source
            target_width=1080,
            target_height=1920,
            scale_mode="fit",
        )

        # Should fit within portrait viewport
        assert scaled_w <= 1080
        assert scaled_h <= 1920
        # Should be limited by width
        assert scaled_w == 1080
        assert scaled_h == 607  # 1080 * (1080/1920)

    def test_square_image_adaptation(self):
        """Test square images in various orientations."""
        # Square image: 1080x1080

        # Portrait viewport
        scaled_w, scaled_h = ImageScaler.calculate_dimensions(
            1080, 1080, target_width=800, target_height=1200, scale_mode="fit"
        )
        assert scaled_w == 800
        assert scaled_h == 800

        # Landscape viewport
        scaled_w, scaled_h = ImageScaler.calculate_dimensions(
            1080, 1080, target_width=1200, target_height=800, scale_mode="fit"
        )
        assert scaled_w == 800
        assert scaled_h == 800


class TestPerformanceBenchmarks:
    """Test performance characteristics and benchmarks."""

    def test_scaling_calculation_performance(self):
        """Test performance of dimension calculations."""
        start_time = time.time()

        # Perform many calculations
        for _ in range(10000):
            ImageScaler.calculate_dimensions(
                1920, 1080, target_width=800, target_height=600, scale_mode="fit"
            )

        end_time = time.time()
        duration = end_time - start_time

        # Should complete 10k calculations in reasonable time
        assert duration < 1.0  # Less than 1 second
        print(f"10k calculations took {duration:.3f} seconds")

    def test_should_process_decision_performance(self):
        """Test performance of processing decision logic."""
        start_time = time.time()

        # Test many processing decisions
        for _ in range(10000):
            ImageProcessor.should_process_image("public.jpeg", 800, 600, 1920, 1080)
            ImageProcessor.should_process_image("public.heic", 800, 600, 1920, 1080)
            ImageProcessor.should_process_image("public.png", 1920, 1080, 1920, 1080)

        end_time = time.time()
        duration = end_time - start_time

        # Should be very fast
        assert duration < 0.1  # Less than 100ms
        print(f"30k processing decisions took {duration:.3f} seconds")

    @patch("os.path.exists")
    @patch("PIL.Image.open")
    def test_concurrent_requests_performance(self, mock_open, mock_exists):
        """Test performance under concurrent load."""
        # Create test database
        photo = PhotoModelWithPath(
            uuid="desktop-hd",
            date="2023-01-01",
            public=True,
            mime_type="image/jpeg",
            width=1920,
            height=1080,
            uti="public.jpeg",
            path="/test/desktop-hd.jpg",
        )

        mock_db = DB(albums={}, photos={"desktop-hd": photo})

        app.dependency_overrides[get_db] = lambda: mock_db
        client = TestClient(app)

        try:
            mock_exists.return_value = True

            # Mock image processing
            mock_img = Mock()
            mock_img.mode = "RGB"
            mock_img.size = (1920, 1080)
            mock_img.resize.return_value = mock_img
            mock_img.save = Mock()
            mock_open.return_value = mock_img

            def make_request():
                response = client.get("/api/photo/desktop-hd/image?width=800")
                return response.status_code

            # Test concurrent requests
            start_time = time.time()
            with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
                futures = [executor.submit(make_request) for _ in range(50)]
                results = [future.result() for future in futures]

            end_time = time.time()
            duration = end_time - start_time

            # All requests should succeed
            assert all(status == 200 for status in results)
            # Should handle concurrent load reasonably
            assert duration < 5.0  # Less than 5 seconds for 50 requests
            print(f"50 concurrent requests took {duration:.3f} seconds")
        finally:
            app.dependency_overrides.clear()

    def test_memory_usage_large_images(self):
        """Test memory efficiency with large images."""
        # Test that large dimension calculations don't use excessive memory
        import tracemalloc

        tracemalloc.start()

        # Process very large images
        for _ in range(1000):
            ImageScaler.calculate_dimensions(
                10000,
                8000,  # Very large image
                target_width=1920,
                target_height=1080,
                scale_mode="fit",
            )

        current, peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()

        # Memory usage should be reasonable (less than 10MB)
        assert peak < 10 * 1024 * 1024  # 10MB
        print(f"Peak memory usage: {peak / 1024 / 1024:.2f} MB")


class TestEdgePerformanceCases:
    """Test performance with edge cases and extreme scenarios."""

    def test_extreme_aspect_ratios_performance(self):
        """Test performance with extreme aspect ratios."""
        extreme_cases = [
            (10000, 100),  # Very wide panorama
            (100, 10000),  # Very tall image
            (50000, 1000),  # Extremely wide
            (1000, 50000),  # Extremely tall
        ]

        start_time = time.time()

        for width, height in extreme_cases:
            for _ in range(100):
                ImageScaler.calculate_dimensions(
                    width,
                    height,
                    target_width=1920,
                    target_height=1080,
                    scale_mode="fit",
                )

        end_time = time.time()
        duration = end_time - start_time

        # Should handle extreme cases efficiently
        assert duration < 1.0
        print(f"Extreme aspect ratio tests took {duration:.3f} seconds")

    def test_many_small_requests_performance(self):
        """Test performance with many small image requests."""
        start_time = time.time()

        # Simulate many thumbnail requests
        for _ in range(1000):
            ImageScaler.calculate_dimensions(
                4032,
                3024,  # Large source
                target_width=150,
                target_height=150,
                scale_mode="exact",
            )

        end_time = time.time()
        duration = end_time - start_time

        # Should be very fast for small thumbnails
        assert duration < 0.5
        print(f"1000 thumbnail calculations took {duration:.3f} seconds")

    def test_no_scaling_needed_performance(self):
        """Test performance when no scaling is needed."""
        start_time = time.time()

        # Test cases where no processing should occur
        for _ in range(10000):
            should_process = ImageProcessor.should_process_image(
                "public.jpeg", 1920, 1080, 1920, 1080
            )
            assert not should_process

        end_time = time.time()
        duration = end_time - start_time

        # Should be extremely fast when no processing needed
        assert duration < 0.05
        print(f"10k no-processing checks took {duration:.3f} seconds")


class TestRealWorldScenarios:
    """Test real-world usage scenarios."""

    def test_responsive_image_sizes(self):
        """Test common responsive image size requests."""
        # Common responsive breakpoints
        breakpoints = [
            (320, 568),  # iPhone SE
            (375, 667),  # iPhone 8
            (414, 896),  # iPhone 11 Pro Max
            (768, 1024),  # iPad
            (1024, 1366),  # iPad Pro
            (1280, 720),  # HD
            (1920, 1080),  # Full HD
            (2560, 1440),  # QHD
        ]

        source_image = (4032, 3024)  # Typical camera image

        for target_w, target_h in breakpoints:
            scaled_w, scaled_h = ImageScaler.calculate_dimensions(
                source_image[0],
                source_image[1],
                target_width=target_w,
                target_height=target_h,
                scale_mode="fit",
            )

            # Should fit within target dimensions
            assert scaled_w <= target_w
            assert scaled_h <= target_h

            # Should maintain reasonable quality (not too small)
            scale_factor = min(scaled_w / source_image[0], scaled_h / source_image[1])
            assert scale_factor > 0.01  # At least 1% of original size

    def test_social_media_formats(self):
        """Test scaling for social media platform requirements."""
        social_formats = {
            "instagram_square": (1080, 1080),
            "instagram_portrait": (1080, 1350),
            "instagram_landscape": (1080, 566),
            "facebook_cover": (820, 312),
            "twitter_header": (1500, 500),
            "linkedin_banner": (1584, 396),
        }

        source_image = (3024, 4032)  # Portrait camera image

        for platform, (target_w, target_h) in social_formats.items():
            # Test exact mode for social media (may crop/distort)
            scaled_w, scaled_h = ImageScaler.calculate_dimensions(
                source_image[0],
                source_image[1],
                target_width=target_w,
                target_height=target_h,
                scale_mode="exact",
            )

            assert scaled_w == target_w
            assert scaled_h == target_h

    def test_print_quality_scaling(self):
        """Test scaling for print quality requirements."""
        # Print typically needs 300 DPI
        # 8x10 inch print at 300 DPI = 2400x3000 pixels
        print_sizes = [
            (1200, 1800),  # 4x6 at 300 DPI
            (2100, 1500),  # 7x5 at 300 DPI
            (2400, 3000),  # 8x10 at 300 DPI
            (3000, 3600),  # 10x12 at 300 DPI
        ]

        source_image = (6000, 4000)  # High-res camera

        for print_w, print_h in print_sizes:
            scaled_w, scaled_h = ImageScaler.calculate_dimensions(
                source_image[0],
                source_image[1],
                target_width=print_w,
                target_height=print_h,
                scale_mode="fit",
            )

            # Should provide good quality for print
            # For fit mode, one dimension will match exactly, the other will be smaller
            # So we check that at least one dimension meets the 80% threshold
            width_ratio = scaled_w / print_w
            height_ratio = scaled_h / print_h
            assert width_ratio >= 0.8 or height_ratio >= 0.8

            # And that we maintain aspect ratio
            source_ratio = source_image[0] / source_image[1]
            scaled_ratio = scaled_w / scaled_h
            assert abs(source_ratio - scaled_ratio) < 0.01


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
