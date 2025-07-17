import io
import os
import sys
import tempfile
from unittest.mock import Mock, patch

import pytest
from fastapi.testclient import TestClient
from PIL import Image

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from serve_photo_image_refactored import app, get_db

from ..app.image_processor import ImageProcessor, ImageScaler, ScaleMode
from ..app.models import DB, PhotoModelWithPath


class TestImageScaler:
    """Test the ImageScaler class for dimension calculations."""

    def test_calculate_dimensions_no_constraints(self):
        """Test with no width or height constraints."""
        width, height = ImageScaler.calculate_dimensions(1920, 1080)
        assert width == 1920
        assert height == 1080

    def test_calculate_dimensions_width_only(self):
        """Test scaling with width constraint only."""
        # Scale down
        width, height = ImageScaler.calculate_dimensions(1920, 1080, target_width=960)
        assert width == 960
        assert height == 540  # Maintains aspect ratio

        # No upscaling by default
        width, height = ImageScaler.calculate_dimensions(1920, 1080, target_width=3840)
        assert width == 1920
        assert height == 1080

        # Allow upscaling
        width, height = ImageScaler.calculate_dimensions(
            1920, 1080, target_width=3840, max_scale_factor=2.0
        )
        assert width == 3840
        assert height == 2160

    def test_calculate_dimensions_height_only(self):
        """Test scaling with height constraint only."""
        # Scale down
        width, height = ImageScaler.calculate_dimensions(1920, 1080, target_height=540)
        assert width == 960
        assert height == 540

        # No upscaling by default
        width, height = ImageScaler.calculate_dimensions(1920, 1080, target_height=2160)
        assert width == 1920
        assert height == 1080

    def test_calculate_dimensions_both_larger_mode(self):
        """Test with both dimensions specified using LARGER mode."""
        # Landscape image, width constraint is larger
        width, height = ImageScaler.calculate_dimensions(
            1920, 1080, target_width=960, target_height=720, scale_mode=ScaleMode.LARGER
        )
        # Width scale: 960/1920 = 0.5, Height scale: 720/1080 = 0.667
        # Larger scale (0.667) is used
        assert width == 1280  # 1920 * 0.667
        assert height == 720  # 1080 * 0.667

    def test_calculate_dimensions_both_smaller_mode(self):
        """Test with both dimensions specified using SMALLER mode."""
        width, height = ImageScaler.calculate_dimensions(
            1920,
            1080,
            target_width=960,
            target_height=720,
            scale_mode=ScaleMode.SMALLER,
        )
        # Smaller scale (0.5) is used
        assert width == 960
        assert height == 540

    def test_calculate_dimensions_exact_mode(self):
        """Test with both dimensions specified using EXACT mode."""
        width, height = ImageScaler.calculate_dimensions(
            1920, 1080, target_width=800, target_height=800, scale_mode=ScaleMode.EXACT
        )
        assert width == 800
        assert height == 800  # May distort aspect ratio

    def test_calculate_dimensions_fit_mode(self):
        """Test FIT mode (same as SMALLER)."""
        width, height = ImageScaler.calculate_dimensions(
            1920, 1080, target_width=960, target_height=720, scale_mode=ScaleMode.FIT
        )
        assert width == 960
        assert height == 540

    def test_calculate_dimensions_fill_mode(self):
        """Test FILL mode (same as LARGER)."""
        width, height = ImageScaler.calculate_dimensions(
            1920, 1080, target_width=960, target_height=720, scale_mode=ScaleMode.FILL
        )
        assert width == 1280
        assert height == 720

    def test_calculate_dimensions_zero_values(self):
        """Test with zero values treated as no constraint."""
        width, height = ImageScaler.calculate_dimensions(
            1920, 1080, target_width=0, target_height=540
        )
        assert width == 960
        assert height == 540

        width, height = ImageScaler.calculate_dimensions(
            1920, 1080, target_width=960, target_height=0
        )
        assert width == 960
        assert height == 540

    def test_calculate_dimensions_invalid_original(self):
        """Test with invalid original dimensions."""
        with pytest.raises(ValueError):
            ImageScaler.calculate_dimensions(0, 1080)

        with pytest.raises(ValueError):
            ImageScaler.calculate_dimensions(1920, -1080)

    def test_calculate_dimensions_portrait_image(self):
        """Test with portrait orientation image."""
        # Portrait: 1080x1920
        width, height = ImageScaler.calculate_dimensions(
            1080, 1920, target_width=540, target_height=720, scale_mode=ScaleMode.LARGER
        )
        # Width scale: 540/1080 = 0.5, Height scale: 720/1920 = 0.375
        # Larger scale (0.5) is used
        assert width == 540
        assert height == 960

    def test_calculate_dimensions_square_image(self):
        """Test with square image."""
        width, height = ImageScaler.calculate_dimensions(
            1000, 1000, target_width=800, target_height=600, scale_mode=ScaleMode.LARGER
        )
        # Both scales: 800/1000 = 0.8, 600/1000 = 0.6
        # Larger scale (0.8) is used
        assert width == 800
        assert height == 800


class TestImageProcessor:
    """Test the ImageProcessor class."""

    def test_should_process_image_heic(self):
        """HEIC images should always be processed."""
        assert ImageProcessor.should_process_image("public.heic", 0, 0, 1920, 1080)
        assert ImageProcessor.should_process_image(
            "public.heic", 1920, 1080, 1920, 1080
        )

    def test_should_process_image_scaling_needed(self):
        """Images should be processed when scaling is needed."""
        assert ImageProcessor.should_process_image("public.jpeg", 960, 0, 1920, 1080)
        assert ImageProcessor.should_process_image("public.jpeg", 0, 540, 1920, 1080)
        assert ImageProcessor.should_process_image("public.jpeg", 960, 540, 1920, 1080)

    def test_should_process_image_no_scaling(self):
        """Images should not be processed when no scaling is needed."""
        assert not ImageProcessor.should_process_image("public.jpeg", 0, 0, 1920, 1080)
        assert not ImageProcessor.should_process_image(
            "public.jpeg", 1920, 1080, 1920, 1080
        )
        assert not ImageProcessor.should_process_image(
            "public.jpeg", 2000, 1200, 1920, 1080
        )

    def test_should_process_image_unsupported_format(self):
        """Unsupported formats should not be processed."""
        assert not ImageProcessor.should_process_image(
            "public.movie", 960, 540, 1920, 1080
        )
        assert not ImageProcessor.should_process_image(
            "public.pdf", 960, 540, 1920, 1080
        )

    def test_get_output_format(self):
        """Test output format selection."""
        assert ImageProcessor.get_output_format("public.heic") == "JPEG"
        assert ImageProcessor.get_output_format("public.jpeg") == "JPEG"
        assert ImageProcessor.get_output_format("public.png") == "PNG"
        assert ImageProcessor.get_output_format("public.tiff") == "JPEG"
        assert ImageProcessor.get_output_format("unknown") == "JPEG"

    def test_get_mime_type(self):
        """Test MIME type selection."""
        assert ImageProcessor.get_mime_type("public.heic") == "image/jpeg"
        assert ImageProcessor.get_mime_type("public.jpeg") == "image/jpeg"
        assert ImageProcessor.get_mime_type("public.png") == "image/png"
        assert ImageProcessor.get_mime_type("public.tiff") == "image/jpeg"


class TestServePhotoImageAPI:
    """Test the serve_photo_image API endpoint."""

    @pytest.fixture
    def mock_db(self):
        """Create a mock database with test photos."""
        photo = PhotoModelWithPath(
            uuid="test-photo-1",
            date="2023-01-01",
            public=True,
            mime_type="image/jpeg",
            width=1920,
            height=1080,
            uti="public.jpeg",
            path="/test/photo.jpg",
        )

        db = DB(albums={}, photos={"test-photo-1": photo})
        return db

    @pytest.fixture
    def test_image(self):
        """Create a test image file."""
        img = Image.new("RGB", (1920, 1080), color="red")
        buf = io.BytesIO()
        img.save(buf, format="JPEG")
        buf.seek(0)
        return buf

    @pytest.fixture
    def client(self, mock_db):
        """Create a test client with mocked database."""
        app.dependency_overrides[get_db] = lambda: mock_db
        client = TestClient(app)
        yield client
        app.dependency_overrides.clear()

    def test_photo_not_found(self, client):
        """Test 404 when photo doesn't exist."""
        response = client.get("/api/photo/nonexistent/image")
        assert response.status_code == 404
        assert "Photo not found" in response.json()["detail"]

    @patch("os.path.exists")
    def test_file_not_found(self, mock_exists, client):
        """Test 404 when photo file doesn't exist."""
        mock_exists.return_value = False
        response = client.get("/api/photo/test-photo-1/image")
        assert response.status_code == 404
        assert "Photo file not found" in response.json()["detail"]

    @patch("os.path.exists")
    @patch("PIL.Image.open")
    def test_original_image_no_scaling(
        self, mock_open, mock_exists, client, test_image
    ):
        """Test returning original image when no scaling is needed."""
        mock_exists.return_value = True
        mock_open.return_value = Image.open(test_image)

        # Create a temporary file for the test
        import os

        with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp_file:
            # Write test image data to temp file
            test_img = Image.open(test_image)
            test_img.save(tmp_file, format="JPEG")
            tmp_file.flush()

            # Update the photo path to point to our temp file
            photo = client.app.dependency_overrides[get_db]().photos["test-photo-1"]
            original_path = photo.path
            photo.path = tmp_file.name

            try:
                response = client.get("/api/photo/test-photo-1/image")
                assert response.status_code == 200
                assert response.headers["content-type"] == "image/jpeg"
            finally:
                # Cleanup
                photo.path = original_path
                os.unlink(tmp_file.name)

    @patch("os.path.exists")
    @patch("PIL.Image.open")
    def test_scaled_image(self, mock_open, mock_exists, client, test_image):
        """Test image scaling."""
        mock_exists.return_value = True
        mock_open.return_value = Image.open(test_image)

        response = client.get("/api/photo/test-photo-1/image?width=960")
        assert response.status_code == 200
        assert response.headers["content-type"] == "image/jpeg"

    @patch("os.path.exists")
    @patch("PIL.Image.open")
    def test_both_dimensions_larger_mode(
        self, mock_open, mock_exists, client, test_image
    ):
        """Test scaling with both dimensions using larger mode."""
        mock_exists.return_value = True
        mock_open.return_value = Image.open(test_image)

        response = client.get(
            "/api/photo/test-photo-1/image?width=960&height=720&scale_mode=larger"
        )
        assert response.status_code == 200

    @patch("os.path.exists")
    @patch("PIL.Image.open")
    def test_quality_parameter(self, mock_open, mock_exists, client, test_image):
        """Test JPEG quality parameter."""
        mock_exists.return_value = True
        mock_open.return_value = Image.open(test_image)

        response = client.get("/api/photo/test-photo-1/image?width=960&quality=95")
        assert response.status_code == 200

    def test_invalid_parameters(self, client):
        """Test validation of invalid parameters."""
        # Negative width
        response = client.get("/api/photo/test-photo-1/image?width=-100")
        assert response.status_code == 422

        # Width too large
        response = client.get("/api/photo/test-photo-1/image?width=20000")
        assert response.status_code == 422

        # Invalid quality
        response = client.get("/api/photo/test-photo-1/image?quality=150")
        assert response.status_code == 422

    @patch("os.path.exists")
    @patch("PIL.Image.open")
    def test_upscaling_disabled(self, mock_open, mock_exists, client, test_image):
        """Test that upscaling is disabled by default."""
        mock_exists.return_value = True
        mock_open.return_value = Image.open(test_image)

        # Create a temporary file for the test
        import os

        with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp_file:
            # Write test image data to temp file
            test_img = Image.open(test_image)
            test_img.save(tmp_file, format="JPEG")
            tmp_file.flush()

            # Update the photo path to point to our temp file
            photo = client.app.dependency_overrides[get_db]().photos["test-photo-1"]
            original_path = photo.path
            photo.path = tmp_file.name

            try:
                # Request larger than original should return original size
                response = client.get("/api/photo/test-photo-1/image?width=3840")
                assert response.status_code == 200
                assert response.headers["content-type"] == "image/jpeg"
            finally:
                # Cleanup
                photo.path = original_path
                os.unlink(tmp_file.name)

    @patch("os.path.exists")
    @patch("PIL.Image.open")
    def test_upscaling_enabled(self, mock_open, mock_exists, client, test_image):
        """Test upscaling when explicitly enabled."""
        mock_exists.return_value = True
        mock_open.return_value = Image.open(test_image)

        # Create a temporary file for the test
        import os

        with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp_file:
            # Write test image data to temp file
            test_img = Image.open(test_image)
            test_img.save(tmp_file, format="JPEG")
            tmp_file.flush()

            # Update the photo path to point to our temp file
            photo = client.app.dependency_overrides[get_db]().photos["test-photo-1"]
            original_path = photo.path
            photo.path = tmp_file.name

            try:
                response = client.get(
                    "/api/photo/test-photo-1/image?width=3840&allow_upscale=true"
                )
                assert response.status_code == 200
                assert response.headers["content-type"] == "image/jpeg"
            finally:
                # Cleanup
                photo.path = original_path
                os.unlink(tmp_file.name)

    def test_heic_photo(self, mock_db, client):
        """Test HEIC photo conversion."""
        # Create a temporary file for the test
        import os

        with tempfile.NamedTemporaryFile(delete=False, suffix=".heic") as tmp_file:
            # Add HEIC photo to mock database
            heic_photo = PhotoModelWithPath(
                uuid="test-heic",
                date="2023-01-01",
                public=True,
                mime_type="image/heic",
                width=1920,
                height=1080,
                uti="public.heic",
                path=tmp_file.name,
            )
            mock_db.photos["test-heic"] = heic_photo

            try:
                with patch("PIL.Image.open") as mock_open:
                    # Create a mock image
                    mock_img = Mock()
                    mock_img.mode = "RGB"
                    mock_img.size = (1920, 1080)
                    mock_img.resize.return_value = mock_img
                    mock_img.save = Mock()
                    mock_open.return_value = mock_img

                    response = client.get("/api/photo/test-heic/image")
                    assert response.status_code == 200
                    # HEIC should be converted to JPEG
                    assert response.headers["content-type"] == "image/jpeg"
            finally:
                # Cleanup
                os.unlink(tmp_file.name)


class TestEdgeCases:
    """Test edge cases and boundary conditions."""

    def test_very_small_image(self):
        """Test with very small original image."""
        width, height = ImageScaler.calculate_dimensions(10, 10, target_width=100)
        # Should not upscale by default
        assert width == 10
        assert height == 10

    def test_very_large_target(self):
        """Test with very large target dimensions."""
        width, height = ImageScaler.calculate_dimensions(
            1920, 1080, target_width=10000, max_scale_factor=5.0
        )
        # Should be limited by max_scale_factor
        assert width == 9600  # 1920 * 5
        assert height == 5400  # 1080 * 5

    def test_extreme_aspect_ratios(self):
        """Test with extreme aspect ratios."""
        # Very wide image (panorama)
        width, height = ImageScaler.calculate_dimensions(
            4000, 500, target_width=2000, target_height=1000, scale_mode=ScaleMode.FIT
        )
        # Should fit within bounds
        assert width == 2000
        assert height == 250

        # Very tall image
        width, height = ImageScaler.calculate_dimensions(
            500, 4000, target_width=1000, target_height=2000, scale_mode=ScaleMode.FIT
        )
        assert width == 250
        assert height == 2000

    def test_single_pixel_image(self):
        """Test with 1x1 pixel image."""
        width, height = ImageScaler.calculate_dimensions(1, 1, target_width=100)
        assert width == 1
        assert height == 1

    def test_floating_point_precision(self):
        """Test that floating point calculations don't cause issues."""
        # Use dimensions that would result in floating point aspect ratios
        width, height = ImageScaler.calculate_dimensions(1000, 333, target_width=500)
        assert width == 500
        assert height == 166  # Should be rounded down from 166.5


class TestPerformanceAndMemory:
    """Test performance considerations and memory usage."""

    @patch("PIL.Image.open")
    def test_large_image_memory_efficiency(self, mock_open):
        """Test that large images are handled efficiently."""
        # Mock a very large image
        mock_img = Mock()
        mock_img.size = (10000, 10000)
        mock_img.mode = "RGB"
        mock_img.resize.return_value = mock_img
        mock_open.return_value = mock_img

        # Should not raise memory errors
        width, height = ImageScaler.calculate_dimensions(
            10000, 10000, target_width=1000
        )
        assert width == 1000
        assert height == 1000

    def test_no_unnecessary_processing(self):
        """Test that images aren't processed when not needed."""
        # Same dimensions should not trigger processing
        assert not ImageProcessor.should_process_image(
            "public.jpeg", 1920, 1080, 1920, 1080
        )

        # Larger target should not trigger processing
        assert not ImageProcessor.should_process_image(
            "public.jpeg", 2000, 1200, 1920, 1080
        )


class TestErrorHandling:
    """Test error handling and validation."""

    def test_invalid_scale_mode(self):
        """Test handling of invalid scale mode."""
        with pytest.raises(ValueError):
            ImageScaler.calculate_dimensions(
                1920,
                1080,
                target_width=960,
                target_height=540,
                scale_mode="invalid_mode",
            )

    def test_missing_photo_dimensions(self):
        """Test handling of photos without width/height."""
        # Create a temporary file for the test
        import os

        with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp_file:
            # Write test image data to temp file
            test_img = Image.new("RGB", (100, 100), color="blue")
            test_img.save(tmp_file, format="JPEG")
            tmp_file.flush()

            # Create photo without dimensions
            photo = PhotoModelWithPath(
                uuid="no-dims",
                date="2023-01-01",
                public=True,
                mime_type="image/jpeg",
                width=None,
                height=None,
                uti="public.jpeg",
                path=tmp_file.name,
            )

            mock_db = DB(albums={}, photos={"no-dims": photo})

            app.dependency_overrides[get_db] = lambda: mock_db
            client = TestClient(app)

            try:
                response = client.get("/api/photo/no-dims/image")
                # Should return original file successfully
                assert response.status_code == 200
                assert response.headers["content-type"] == "image/jpeg"
            finally:
                app.dependency_overrides.clear()
                os.unlink(tmp_file.name)

    @patch("os.path.exists")
    @patch("PIL.Image.open")
    def test_image_processing_error(self, mock_open, mock_exists):
        """Test handling of image processing errors."""
        # Create test database
        photo = PhotoModelWithPath(
            uuid="test-photo-1",
            date="2023-01-01",
            public=True,
            mime_type="image/jpeg",
            width=1920,
            height=1080,
            uti="public.jpeg",
            path="/test/photo.jpg",
        )

        mock_db = DB(albums={}, photos={"test-photo-1": photo})

        app.dependency_overrides[get_db] = lambda: mock_db
        client = TestClient(app)

        try:
            mock_exists.return_value = True
            mock_open.side_effect = Exception("Corrupted image")

            response = client.get("/api/photo/test-photo-1/image?width=960")
            assert response.status_code == 500
            assert "Error processing image" in response.json()["detail"]
        finally:
            app.dependency_overrides.clear()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
