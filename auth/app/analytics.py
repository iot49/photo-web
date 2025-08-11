"""
Analytics utilities for Photo Web Authentication Service

This module provides analytics collection and processing capabilities for tracking
user behavior, request patterns, and system usage across the Photo Web application.
"""

import json
import logging
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict
from urllib.parse import urlparse

logger = logging.getLogger(__name__)


class AnalyticsCollector:
    """Collects and stores analytics data for Photo Web usage tracking"""

    def __init__(self, data_dir: str = "/app/analytics"):
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(exist_ok=True)

        # Create subdirectories for different types of analytics
        (self.data_dir / "requests").mkdir(exist_ok=True)
        (self.data_dir / "users").mkdir(exist_ok=True)
        (self.data_dir / "albums").mkdir(exist_ok=True)
        (self.data_dir / "files").mkdir(exist_ok=True)

        self.analytics_logger = logging.getLogger("analytics")
        handler = logging.FileHandler(self.data_dir / "analytics.log")
        handler.setFormatter(logging.Formatter("%(message)s"))
        self.analytics_logger.addHandler(handler)
        self.analytics_logger.setLevel(logging.INFO)

    def extract_resource_info(self, uri: str) -> Dict[str, Any]:
        """Extract resource information from URI for analytics"""
        parsed = urlparse(uri)
        path_parts = [p for p in parsed.path.split("/") if p]

        resource_info = {
            "service": None,
            "resource_type": None,
            "resource_id": None,
            "action": None,
        }

        if len(path_parts) >= 2:
            if path_parts[0] == "photos":
                resource_info["service"] = "photos"
                if len(path_parts) >= 4 and path_parts[1] == "api":
                    if path_parts[2] == "albums":
                        resource_info["resource_type"] = "album"
                        if len(path_parts) >= 4:
                            resource_info["resource_id"] = path_parts[3]
                            resource_info["action"] = (
                                "view" if len(path_parts) == 4 else "download"
                            )
                    elif path_parts[2] == "photos":
                        resource_info["resource_type"] = "photo"
                        if len(path_parts) >= 4:
                            resource_info["resource_id"] = path_parts[3]
                            # Check for image size suffix
                            if len(path_parts) >= 5 and path_parts[4].startswith("img"):
                                resource_info["action"] = "image_request"
                                resource_info["image_size"] = path_parts[4]

            elif path_parts[0] == "files":
                resource_info["service"] = "files"
                if len(path_parts) >= 4 and path_parts[1] == "api":
                    if path_parts[2] == "folder":
                        resource_info["resource_type"] = "folder"
                        resource_info["resource_id"] = "/".join(path_parts[3:])
                        resource_info["action"] = "browse"
                    elif path_parts[2] == "file":
                        resource_info["resource_type"] = "file"
                        resource_info["resource_id"] = "/".join(path_parts[3:])
                        resource_info["action"] = "download"

        return resource_info

    async def log_request(
        self,
        user_info: Any,
        request_data: Dict[str, Any],
        response_data: Dict[str, Any],
    ) -> None:
        """Log a request for analytics tracking"""

        try:
            timestamp = datetime.utcnow()
            original_uri = request_data.get("original_uri", "/")

            # Extract resource information
            resource_info = self.extract_resource_info(original_uri)

            # Build analytics record
            analytics_record = {
                "timestamp": timestamp.isoformat(),
                "request_id": str(uuid.uuid4()),
                "user_id": user_info.email if user_info.email else "anonymous",
                "user_roles": user_info.roles.split(",")
                if user_info.roles
                else ["public"],
                "uri": original_uri,
                "method": request_data.get("method", "GET"),
                "user_agent": request_data.get("user_agent", ""),
                "ip_address": request_data.get("ip_address", ""),
                "referer": request_data.get("referer", ""),
                "status_code": response_data.get("status_code", 200),
                "response_time_ms": response_data.get("response_time_ms", 0),
                "service": resource_info["service"],
                "resource_type": resource_info["resource_type"],
                "resource_id": resource_info["resource_id"],
                "action": resource_info["action"],
                "authorized": response_data.get("authorized", True),
            }

            # Log to analytics file
            self.analytics_logger.info(json.dumps(analytics_record))

            # Store specific analytics based on resource type
            if (
                resource_info["service"] == "photos"
                and resource_info["resource_type"] == "album"
            ):
                await self._log_album_access(analytics_record)
            elif resource_info["service"] == "files":
                await self._log_file_access(analytics_record)

            await self._log_user_activity(analytics_record)

        except Exception as e:
            logger.error(f"Error logging analytics: {e}")

    async def _log_album_access(self, record: Dict[str, Any]) -> None:
        """Log album-specific analytics"""
        if not record["resource_id"]:
            return

        album_file = self.data_dir / "albums" / f"{record['resource_id']}.json"

        # Load existing album data or create new
        album_data = {}
        if album_file.exists():
            try:
                with open(album_file, "r") as f:
                    album_data = json.load(f)
                    # DEBUG: Log the type of unique_users after loading from JSON
                    if "unique_users" in album_data:
                        logger.warning(
                            f"DEBUG: unique_users type after JSON load: {type(album_data['unique_users'])}, value: {album_data['unique_users']}"
                        )
            except:
                album_data = {}

        # Initialize album data structure
        if "album_id" not in album_data:
            album_data.update(
                {
                    "album_id": record["resource_id"],
                    "total_accesses": 0,
                    "unique_users": set(),
                    "access_history": [],
                    "last_accessed": None,
                }
            )

        # Update album statistics
        album_data["total_accesses"] += 1
        # DEBUG: Log type before calling .add()
        logger.warning(
            f"DEBUG: About to call .add() on unique_users, type: {type(album_data['unique_users'])}"
        )
        album_data["unique_users"].add(record["user_id"])
        album_data["last_accessed"] = record["timestamp"]
        album_data["access_history"].append(
            {
                "timestamp": record["timestamp"],
                "user_id": record["user_id"],
                "action": record["action"],
                "ip_address": record["ip_address"],
            }
        )

        # Keep only last 100 access records
        album_data["access_history"] = album_data["access_history"][-100:]

        # Convert set to list for JSON serialization
        album_data["unique_users"] = list(album_data["unique_users"])

        # Save updated album data
        with open(album_file, "w") as f:
            json.dump(album_data, f, indent=2)

    async def _log_file_access(self, record: Dict[str, Any]) -> None:
        """Log file-specific analytics"""
        if not record["resource_id"]:
            return

        # Create safe filename from resource path
        safe_filename = record["resource_id"].replace("/", "_").replace("\\", "_")
        file_analytics = self.data_dir / "files" / f"{safe_filename}.json"

        # Similar to album analytics but for files
        file_data = {}
        if file_analytics.exists():
            try:
                with open(file_analytics, "r") as f:
                    file_data = json.load(f)
                    # DEBUG: Log the type of unique_users after loading from JSON
                    if "unique_users" in file_data:
                        logger.warning(
                            f"DEBUG: file unique_users type after JSON load: {type(file_data['unique_users'])}"
                        )
            except:
                file_data = {}

        if "file_path" not in file_data:
            file_data.update(
                {
                    "file_path": record["resource_id"],
                    "total_accesses": 0,
                    "unique_users": set(),
                    "access_history": [],
                    "last_accessed": None,
                }
            )

        file_data["total_accesses"] += 1
        file_data["unique_users"].add(record["user_id"])
        file_data["last_accessed"] = record["timestamp"]
        file_data["access_history"].append(
            {
                "timestamp": record["timestamp"],
                "user_id": record["user_id"],
                "action": record["action"],
                "ip_address": record["ip_address"],
            }
        )

        file_data["access_history"] = file_data["access_history"][-50:]
        file_data["unique_users"] = list(file_data["unique_users"])

        with open(file_analytics, "w") as f:
            json.dump(file_data, f, indent=2)

    async def _log_user_activity(self, record: Dict[str, Any]) -> None:
        """Log user-specific analytics"""
        if record["user_id"] == "anonymous":
            return

        # Create safe filename from user email
        safe_user = record["user_id"].replace("@", "_at_").replace(".", "_")
        user_file = self.data_dir / "users" / f"{safe_user}.json"

        user_data = {}
        if user_file.exists():
            try:
                with open(user_file, "r") as f:
                    user_data = json.load(f)
                    # Convert set fields back to sets if they exist (JSON loads them as lists)
                    for field in ["services_used", "albums_accessed", "files_accessed"]:
                        if field in user_data and isinstance(user_data[field], list):
                            user_data[field] = set(user_data[field])
            except:
                user_data = {}

        if "user_id" not in user_data:
            user_data.update(
                {
                    "user_id": record["user_id"],
                    "total_requests": 0,
                    "services_used": set(),
                    "albums_accessed": set(),
                    "files_accessed": set(),
                    "first_seen": record["timestamp"],
                    "last_seen": None,
                    "session_count": 0,
                }
            )

        user_data["total_requests"] += 1
        user_data["last_seen"] = record["timestamp"]

        if record["service"]:
            user_data["services_used"].add(record["service"])

        if record["resource_type"] == "album" and record["resource_id"]:
            user_data["albums_accessed"].add(record["resource_id"])
        elif record["resource_type"] == "file" and record["resource_id"]:
            user_data["files_accessed"].add(record["resource_id"])

        # Convert sets to lists for JSON serialization
        for key in ["services_used", "albums_accessed", "files_accessed"]:
            user_data[key] = list(user_data[key])

        with open(user_file, "w") as f:
            json.dump(user_data, f, indent=2)

    def get_usage_summary(self, days: int = 7) -> Dict[str, Any]:
        """Get usage summary for the specified number of days"""
        try:
            cutoff_date = datetime.utcnow() - timedelta(days=days)

            # Read analytics log
            analytics_file = self.data_dir / "analytics.log"
            if not analytics_file.exists():
                return {"error": "No analytics data available"}

            total_requests = 0
            unique_users = set()
            services_used = {}
            popular_albums = {}

            with open(analytics_file, "r") as f:
                for line in f:
                    try:
                        record = json.loads(line.strip())
                        record_time = datetime.fromisoformat(record["timestamp"])

                        if record_time >= cutoff_date:
                            total_requests += 1
                            unique_users.add(record["user_id"])

                            service = record.get("service")
                            if service:
                                services_used[service] = (
                                    services_used.get(service, 0) + 1
                                )

                            if record.get("resource_type") == "album" and record.get(
                                "resource_id"
                            ):
                                album_id = record["resource_id"]
                                popular_albums[album_id] = (
                                    popular_albums.get(album_id, 0) + 1
                                )

                    except (json.JSONDecodeError, ValueError):
                        continue

            return {
                "period_days": days,
                "total_requests": total_requests,
                "unique_users": len(unique_users),
                "services_used": services_used,
                "popular_albums": dict(
                    sorted(popular_albums.items(), key=lambda x: x[1], reverse=True)[
                        :10
                    ]
                ),
                "generated_at": datetime.utcnow().isoformat(),
            }

        except Exception as e:
            logger.error(f"Error generating usage summary: {e}")
            return {"error": str(e)}


# Global analytics collector instance
analytics_collector = AnalyticsCollector()
