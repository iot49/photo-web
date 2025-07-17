from enum import Enum
from typing import Optional, Tuple


class ScaleMode(str, Enum):
    """Scaling behavior when both width and height are specified."""

    LARGER = "larger"  # Use dimension that results in larger image (default)
    SMALLER = "smaller"  # Use dimension that results in smaller image
    EXACT = "exact"  # Stretch to exact dimensions (may distort aspect ratio)
    FIT = "fit"  # Fit within bounds while preserving aspect ratio
    FILL = "fill"  # Fill bounds while preserving aspect ratio (may crop)


class ImageScaler:
    """Handles image scaling logic with proper aspect ratio preservation."""

    @staticmethod
    def calculate_dimensions(
        original_width: int,
        original_height: int,
        target_width: Optional[int] = None,
        target_height: Optional[int] = None,
        scale_mode: ScaleMode = ScaleMode.LARGER,
        max_scale_factor: float = 1.0,
    ) -> Tuple[int, int]:
        """
        Calculate the optimal dimensions for scaling an image.

        Args:
            original_width: Original image width
            original_height: Original image height
            target_width: Desired width (None or <=0 means no constraint)
            target_height: Desired height (None or <=0 means no constraint)
            scale_mode: How to handle scaling when both dimensions are specified
            max_scale_factor: Maximum scale factor (1.0 = no upscaling)

        Returns:
            Tuple of (width, height) for the scaled image

        Raises:
            ValueError: If original dimensions are invalid
        """
        if original_width <= 0 or original_height <= 0:
            raise ValueError(
                f"Invalid original dimensions: {original_width}x{original_height}"
            )

        # Normalize inputs - treat None or <=0 as no constraint
        target_width = target_width if target_width and target_width > 0 else None
        target_height = target_height if target_height and target_height > 0 else None

        # If no constraints, return original dimensions
        if not target_width and not target_height:
            return original_width, original_height

        # Single dimension constraint
        if target_width and not target_height:
            # Scale by width only
            scale_factor = min(target_width / original_width, max_scale_factor)
            return (
                int(original_width * scale_factor),
                int(original_height * scale_factor),
            )

        if target_height and not target_width:
            # Scale by height only
            scale_factor = min(target_height / original_height, max_scale_factor)
            return (
                int(original_width * scale_factor),
                int(original_height * scale_factor),
            )

        # Both dimensions specified
        if target_width and target_height:
            width_scale = target_width / original_width
            height_scale = target_height / original_height

            if scale_mode == ScaleMode.LARGER:
                # Use the scale factor that results in the larger image
                scale_factor = max(width_scale, height_scale)
            elif scale_mode == ScaleMode.SMALLER:
                # Use the scale factor that results in the smaller image
                scale_factor = min(width_scale, height_scale)
            elif scale_mode == ScaleMode.EXACT:
                # Return exact dimensions (may distort)
                return (
                    min(target_width, int(original_width * max_scale_factor)),
                    min(target_height, int(original_height * max_scale_factor)),
                )
            elif scale_mode == ScaleMode.FIT:
                # Fit within bounds (same as SMALLER)
                scale_factor = min(width_scale, height_scale)
            elif scale_mode == ScaleMode.FILL:
                # Fill bounds (same as LARGER)
                scale_factor = max(width_scale, height_scale)
            else:
                raise ValueError(f"Unknown scale mode: {scale_mode}")

            # Apply max scale factor constraint
            scale_factor = min(scale_factor, max_scale_factor)

            return (
                int(original_width * scale_factor),
                int(original_height * scale_factor),
            )

        # Should never reach here
        return original_width, original_height


class ImageProcessor:
    """Handles image processing operations."""

    SUPPORTED_FORMATS = {
        "public.jpeg",
        "public.jpeg-2000",
        "public.tiff",
        "public.heic",
        "public.png",
    }

    @staticmethod
    def should_process_image(
        uti: str,
        target_width: int,
        target_height: int,
        original_width: int,
        original_height: int,
    ) -> bool:
        """Determine if image should be processed/scaled."""
        if uti not in ImageProcessor.SUPPORTED_FORMATS:
            return False

        # Always process HEIC for web compatibility
        if uti == "public.heic":
            return True

        # Process if scaling is needed
        if target_width > 0 and target_width < original_width:
            return True
        if target_height > 0 and target_height < original_height:
            return True

        return False

    @staticmethod
    def get_output_format(uti: str) -> str:
        """Get the output format for web compatibility."""
        if uti == "public.heic":
            return "JPEG"
        elif uti in ["public.jpeg", "public.jpeg-2000"]:
            return "JPEG"
        elif uti == "public.png":
            return "PNG"
        elif uti == "public.tiff":
            return "JPEG"  # Convert TIFF to JPEG for web
        else:
            return "JPEG"  # Default fallback

    @staticmethod
    def get_mime_type(uti: str) -> str:
        """Get the MIME type for the output format."""
        output_format = ImageProcessor.get_output_format(uti)
        if output_format == "JPEG":
            return "image/jpeg"
        elif output_format == "PNG":
            return "image/png"
        else:
            return "image/jpeg"  # Default fallback
