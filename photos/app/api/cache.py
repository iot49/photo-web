import logging
import os
from datetime import datetime

from fastapi import APIRouter

logger = logging.getLogger(__name__)

router = APIRouter()


def format_bytes(bytes_value: int) -> str:
    """Format bytes into human readable format."""
    if bytes_value == 0:
        return "0 B"

    units = ["B", "kB", "MB", "GB", "TB"]
    unit_index = 0
    size = float(bytes_value)

    while size >= 1024 and unit_index < len(units) - 1:
        size /= 1024
        unit_index += 1

    if unit_index == 0:
        return f"{int(size)} {units[unit_index]}"
    else:
        return f"{size:.1f} {units[unit_index]}"


@router.get("/api/nginx-cache")
async def inspect_nginx_cache():
    """
    Inspect nginx cache directory and return cache statistics.

    Returns information about cached files including:
    - Total cache size
    - Individual file sizes
    - Cache file metadata
    - Access statistics if available
    """
    cache_dir = "/var/cache/nginx/photos"

    try:
        # Check if cache directory exists and is accessible
        if not os.path.exists(cache_dir):
            return {
                "error": "Cache directory not found",
                "cache_dir": cache_dir,
                "total_files": 0,
                "total_size": 0,
                "files": [],
            }

        cache_files = []
        total_size = 0

        # Walk through cache directory structure (levels=1:2)
        for root, dirs, files in os.walk(cache_dir):
            for file in files:
                file_path = os.path.join(root, file)
                try:
                    stat = os.stat(file_path)
                    file_size = stat.st_size
                    total_size += file_size

                    # Try to read cache metadata if available
                    cache_info = {
                        "filename": file,
                        "path": file_path.replace(cache_dir, ""),
                        "size": file_size,
                        "size_human": format_bytes(file_size),
                        "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                        "accessed": datetime.fromtimestamp(stat.st_atime).isoformat(),
                    }

                    # Try to extract cache key information
                    try:
                        with open(file_path, "rb") as f:
                            # Read first few bytes to check for nginx cache header
                            header = f.read(1024)
                            if header:
                                # Look for KEY: marker in cache file
                                header_str = header.decode("utf-8", errors="ignore")
                                if "KEY:" in header_str:
                                    key_start = header_str.find("KEY:") + 4
                                    key_end = header_str.find("\n", key_start)
                                    if key_end > key_start:
                                        cache_key = header_str[
                                            key_start:key_end
                                        ].strip()
                                        cache_info["cache_key"] = cache_key

                                        # Try to parse the original URL from cache key
                                        if cache_key.startswith("http"):
                                            cache_info["original_url"] = cache_key
                    except:  # noqa: E722
                        # If we can't read the cache file, that's okay
                        pass

                    cache_files.append(cache_info)

                except OSError:
                    # Skip files we can't stat
                    continue

        # Sort files by size (largest first)
        cache_files.sort(key=lambda x: x["size"], reverse=True)

        return {
            "cache_dir": cache_dir,
            "total_files": len(cache_files),
            "total_size": total_size,
            "total_size_human": format_bytes(total_size),
            "files": cache_files,
            "timestamp": datetime.now().isoformat(),
        }

    except Exception as e:
        logger.error(f"Error inspecting nginx cache: {e}")
        return {
            "error": f"Failed to inspect cache: {str(e)}",
            "cache_dir": cache_dir,
            "total_files": 0,
            "total_size": 0,
            "files": [],
        }


@router.get("/api/clear-nginx-cache")
async def clear_nginx_cache():
    """
    Clear nginx cache directory by removing all cached files.

    Returns information about the clearing operation including:
    - Number of files removed
    - Total size freed
    - Any errors encountered during the process
    """
    cache_dir = "/var/cache/nginx/photos"

    try:
        # Check if cache directory exists and is accessible
        if not os.path.exists(cache_dir):
            return {
                "status": "success",
                "message": "Cache directory not found - nothing to clear",
                "cache_dir": cache_dir,
                "files_removed": 0,
                "size_freed": 0,
                "size_freed_human": "0 B",
            }

        files_removed = 0
        size_freed = 0
        errors = []

        # Walk through cache directory structure and remove files
        for root, dirs, files in os.walk(cache_dir, topdown=False):
            for file in files:
                file_path = os.path.join(root, file)
                try:
                    # Get file size before removing
                    stat = os.stat(file_path)
                    file_size = stat.st_size

                    # Remove the file
                    os.remove(file_path)
                    files_removed += 1
                    size_freed += file_size

                except OSError as e:
                    errors.append(f"Failed to remove {file_path}: {str(e)}")
                    continue

            # Remove empty directories
            for dir_name in dirs:
                dir_path = os.path.join(root, dir_name)
                try:
                    if not os.listdir(dir_path):  # Only remove if empty
                        os.rmdir(dir_path)
                except OSError:
                    # Don't report errors for directory removal
                    pass

        result = {
            "status": "success" if not errors else "partial_success",
            "message": f"Cache cleared successfully. Removed {files_removed} files, freed {format_bytes(size_freed)}",
            "cache_dir": cache_dir,
            "files_removed": files_removed,
            "size_freed": size_freed,
            "size_freed_human": format_bytes(size_freed),
            "timestamp": datetime.now().isoformat(),
        }

        if errors:
            result["errors"] = errors
            result["error_count"] = len(errors)

        logger.info(
            f"Nginx cache cleared: {files_removed} files removed, {format_bytes(size_freed)} freed"
        )
        return result

    except Exception as e:
        logger.error(f"Error clearing nginx cache: {e}")
        return {
            "status": "error",
            "message": f"Failed to clear cache: {str(e)}",
            "cache_dir": cache_dir,
            "files_removed": 0,
            "size_freed": 0,
            "size_freed_human": "0 B",
            "timestamp": datetime.now().isoformat(),
        }
