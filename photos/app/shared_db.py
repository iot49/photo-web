import logging
import os
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from models import DB
from read_db import read_db

logger = logging.getLogger(__name__)

# Global variables for shared database and scheduler
_shared_db: Optional[DB] = None
_shared_scheduler: Optional[AsyncIOScheduler] = None


def initialize_shared_db() -> None:
    """Initialize the shared database if not already loaded."""
    global _shared_db

    if _shared_db is not None:
        logger.debug("Database already loaded, skipping initialization")
        return

    photos_db_path = os.getenv("PHOTOS_LIBRARY_MOUNT", "/photo_db")
    photos_db_filters = os.getenv("PHOTOS_DB_FILTERS", "Public:Protected:Private")

    logger.info(
        f"Loading shared photos database from {photos_db_path} with filters {photos_db_filters}..."
    )

    try:
        _shared_db = read_db(photos_db_path, photos_db_filters)
        logger.info(
            f"Shared database with {len(_shared_db.albums)} albums and {len(_shared_db.photos)} photos loaded successfully."
        )
    except Exception as e:
        logger.error(f"Failed to load shared photos database: {e}")
        raise


def initialize_shared_scheduler() -> None:
    """Initialize the shared scheduler and schedule database reload."""
    global _shared_scheduler

    if _shared_scheduler is not None:
        logger.debug("Scheduler already initialized, skipping")
        return

    # Create scheduler but don't start it yet (no event loop during preload)
    _shared_scheduler = AsyncIOScheduler()
    logger.info(
        "Shared scheduler created (will be started when event loop is available)"
    )


def start_shared_scheduler() -> None:
    """Start the shared scheduler and schedule jobs (only in worker 0)."""
    global _shared_scheduler

    # Use a simple file-based approach to ensure only one worker starts scheduler
    lock_file = "/tmp/photos_scheduler_started"

    try:
        # Try to create the lock file exclusively
        with open(lock_file, "x") as f:
            f.write(str(os.getpid()))

        # This worker got the lock, start the scheduler
        logger.info(f"PID {os.getpid()}: Starting scheduler (first worker)")

    except FileExistsError:
        # Another worker already started the scheduler
        logger.info(
            f"PID {os.getpid()}: Scheduler already started by another worker, skipping"
        )
        return

    if _shared_scheduler is None:
        initialize_shared_scheduler()

    if not _shared_scheduler.running:
        _shared_scheduler.start()

        # Schedule daily database reload at 2am
        _shared_scheduler.add_job(
            reload_shared_db,
            "cron",
            hour=2,
            minute=0,
            id="daily_db_reload",
            name="Daily database reload at 2am",
            replace_existing=True,
        )

        logger.info("Shared scheduler started with daily database reload at 2am")
    else:
        logger.debug("Scheduler already running, skipping start")


def get_shared_db() -> DB:
    """Get the shared database instance."""
    global _shared_db

    if _shared_db is None:
        initialize_shared_db()

    return _shared_db


def get_shared_scheduler() -> AsyncIOScheduler:
    """Get the shared scheduler instance."""
    global _shared_scheduler

    if _shared_scheduler is None:
        initialize_shared_scheduler()

    return _shared_scheduler


def reload_shared_db() -> DB:
    """Reload the shared database."""
    global _shared_db

    logger.info("Reloading shared database...")
    _shared_db = None
    initialize_shared_db()

    return _shared_db


def shutdown_shared_scheduler() -> None:
    """Shutdown the shared scheduler."""
    global _shared_scheduler

    if _shared_scheduler is not None:
        _shared_scheduler.shutdown()
        logger.info("Shared scheduler shutdown")
