import json
import logging
from datetime import datetime, timedelta
from typing import Optional

from database import DatabaseManager, get_database_manager
from doc_utils import dedent_and_convert_to_html
from fastapi import APIRouter, Depends, HTTPException, Request
from firebase_util import verify_user

from analytics import analytics_collector

logger = logging.getLogger(__name__)


def get_db() -> DatabaseManager:
    """Dependency to get database manager."""
    return get_database_manager()


# Create router for analytics endpoints
router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get(
    "/usage-summary",
    summary="Usage Analytics Summary",
    description=dedent_and_convert_to_html(
        """
    Get comprehensive usage analytics summary for the Photo Web application.
    
    Returns aggregated statistics including total requests, unique users,
    popular albums, service usage patterns, and user activity metrics
    for the specified time period.
    
    **Access Control:** Requires admin role for access.
    
    **Time Periods:**
    - 1 day: Recent activity overview
    - 7 days: Weekly usage patterns (default)
    - 30 days: Monthly trends and patterns
    - 90 days: Quarterly analysis
    """
    ),
    responses={
        200: {
            "description": "Usage analytics successfully retrieved",
            "content": {
                "application/json": {
                    "example": {
                        "period_days": 7,
                        "total_requests": 1250,
                        "unique_users": 45,
                        "services_used": {"photos": 800, "files": 450},
                        "popular_albums": {
                            "family-vacation": 120,
                            "wedding-photos": 85,
                        },
                        "generated_at": "2024-01-15T10:30:00Z",
                    }
                }
            },
        },
        403: {
            "description": "Access denied - admin role required",
            "content": {"application/json": {"example": {"detail": "Access denied"}}},
        },
    },
)
async def get_usage_summary(
    days: int = 7, request: Request = None, db: DatabaseManager = Depends(get_db)
):
    """
    Get usage analytics summary for the specified number of days.

    Provides comprehensive analytics including request counts, user activity,
    service usage patterns, and popular content metrics.

    Args:
        days: Number of days to include in the summary (default: 7)
        request: FastAPI request object for user verification
        db: Database manager dependency

    Returns:
        dict: Usage analytics summary with metrics and statistics

    Raises:
        HTTPException: 403 if user lacks admin role, 500 if analytics unavailable
    """
    try:
        # Verify admin access
        user_info = verify_user(request)
        user_roles = [role.strip() for role in (user_info.roles or "").split(",")]

        if "admin" not in user_roles:
            raise HTTPException(status_code=403, detail="Admin role required")

        # Get usage summary from analytics collector
        summary = analytics_collector.get_usage_summary(days)

        if "error" in summary:
            raise HTTPException(status_code=500, detail=summary["error"])

        return summary

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving usage summary: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve analytics")


@router.get(
    "/album-stats",
    summary="Album Access Statistics",
    description=dedent_and_convert_to_html(
        """
    Get detailed statistics for album access patterns and popularity.
    
    Returns comprehensive album analytics including access counts,
    unique user interactions, download patterns, and temporal usage data.
    Can be filtered by specific album or return aggregate statistics.
    
    **Access Control:** Requires admin role for access.
    """
    ),
    responses={
        200: {
            "description": "Album statistics successfully retrieved",
            "content": {
                "application/json": {
                    "example": {
                        "album_stats": {
                            "family-vacation": {
                                "total_accesses": 120,
                                "unique_users": 15,
                                "last_accessed": "2024-01-15T09:30:00Z",
                            }
                        },
                        "generated_at": "2024-01-15T10:30:00Z",
                    }
                }
            },
        },
        403: {
            "description": "Access denied - admin role required",
            "content": {"application/json": {"example": {"detail": "Access denied"}}},
        },
    },
)
async def get_album_statistics(
    album_id: Optional[str] = None,
    request: Request = None,
    db: DatabaseManager = Depends(get_db),
):
    """
    Get detailed album access statistics.

    Provides comprehensive analytics for album usage including access patterns,
    user engagement metrics, and temporal analysis.

    Args:
        album_id: Specific album ID to analyze (optional, returns all if not specified)
        request: FastAPI request object for user verification
        db: Database manager dependency

    Returns:
        dict: Album statistics with access patterns and user engagement data

    Raises:
        HTTPException: 403 if user lacks admin role, 500 if analytics unavailable
    """
    try:
        # Verify admin access
        user_info = verify_user(request)
        user_roles = [role.strip() for role in (user_info.roles or "").split(",")]

        if "admin" not in user_roles:
            raise HTTPException(status_code=403, detail="Admin role required")

        # Get album statistics
        album_stats = {}
        albums_dir = analytics_collector.data_dir / "albums"

        if albums_dir.exists():
            if album_id:
                # Get specific album stats
                album_file = albums_dir / f"{album_id}.json"
                if album_file.exists():
                    with open(album_file, "r") as f:
                        album_data = json.load(f)
                        album_stats[album_id] = {
                            "total_accesses": album_data.get("total_accesses", 0),
                            "unique_users": len(album_data.get("unique_users", [])),
                            "last_accessed": album_data.get("last_accessed"),
                            "recent_activity": album_data.get("access_history", [])[
                                -10:
                            ],
                        }
            else:
                # Get all album stats
                for album_file in albums_dir.glob("*.json"):
                    try:
                        with open(album_file, "r") as f:
                            album_data = json.load(f)
                            album_id_key = album_file.stem
                            album_stats[album_id_key] = {
                                "total_accesses": album_data.get("total_accesses", 0),
                                "unique_users": len(album_data.get("unique_users", [])),
                                "last_accessed": album_data.get("last_accessed"),
                            }
                    except Exception as e:
                        logger.warning(
                            f"Error reading album stats from {album_file}: {e}"
                        )
                        continue

        return {
            "album_stats": album_stats,
            "generated_at": datetime.utcnow().isoformat(),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving album statistics: {e}")
        raise HTTPException(
            status_code=500, detail="Failed to retrieve album statistics"
        )


@router.get(
    "/user-activity",
    summary="User Activity Analytics",
    description=dedent_and_convert_to_html(
        """
    Get detailed user activity and engagement analytics.
    
    Returns comprehensive user behavior analytics including session patterns,
    content preferences, service usage, and engagement metrics.
    
    **Access Control:** Requires admin role for access.
    """
    ),
    responses={
        200: {
            "description": "User activity analytics successfully retrieved",
            "content": {
                "application/json": {
                    "example": {
                        "total_users": 45,
                        "active_users_7d": 32,
                        "top_users": [
                            {"user_id": "user@example.com", "total_requests": 150}
                        ],
                        "generated_at": "2024-01-15T10:30:00Z",
                    }
                }
            },
        },
        403: {
            "description": "Access denied - admin role required",
            "content": {"application/json": {"example": {"detail": "Access denied"}}},
        },
    },
)
async def get_user_activity(
    request: Request = None, db: DatabaseManager = Depends(get_db)
):
    """
    Get comprehensive user activity analytics.

    Provides detailed insights into user behavior, engagement patterns,
    and content preferences across the Photo Web application.

    Args:
        request: FastAPI request object for user verification
        db: Database manager dependency

    Returns:
        dict: User activity analytics with engagement and behavior metrics

    Raises:
        HTTPException: 403 if user lacks admin role, 500 if analytics unavailable
    """
    try:
        # Verify admin access
        user_info = verify_user(request)
        user_roles = [role.strip() for role in (user_info.roles or "").split(",")]

        if "admin" not in user_roles:
            raise HTTPException(status_code=403, detail="Admin role required")

        # Get user activity statistics
        user_stats = {}
        users_dir = analytics_collector.data_dir / "users"

        if users_dir.exists():
            for user_file in users_dir.glob("*.json"):
                try:
                    with open(user_file, "r") as f:
                        user_data = json.load(f)
                        user_id = user_data.get("user_id", "unknown")
                        user_stats[user_id] = {
                            "total_requests": user_data.get("total_requests", 0),
                            "services_used": user_data.get("services_used", []),
                            "albums_accessed": len(
                                user_data.get("albums_accessed", [])
                            ),
                            "files_accessed": len(user_data.get("files_accessed", [])),
                            "first_seen": user_data.get("first_seen"),
                            "last_seen": user_data.get("last_seen"),
                        }
                except Exception as e:
                    logger.warning(f"Error reading user stats from {user_file}: {e}")
                    continue

        # Calculate summary metrics
        total_users = len(user_stats)
        cutoff_7d = (datetime.utcnow() - timedelta(days=7)).isoformat()
        active_users_7d = sum(
            1
            for stats in user_stats.values()
            if stats.get("last_seen", "") >= cutoff_7d
        )

        # Top users by activity
        top_users = sorted(
            [
                {"user_id": uid, "total_requests": stats["total_requests"]}
                for uid, stats in user_stats.items()
            ],
            key=lambda x: x["total_requests"],
            reverse=True,
        )[:10]

        return {
            "total_users": total_users,
            "active_users_7d": active_users_7d,
            "top_users": top_users,
            "user_details": user_stats,
            "generated_at": datetime.utcnow().isoformat(),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving user activity: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve user activity")
