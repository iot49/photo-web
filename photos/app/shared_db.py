"""
This module manages a shared database instance and a scheduler for the photo application.

It provides a singleton `SharedDB` class that:
- Initializes and manages a database instance loaded from a specified path with filters.
- Initializes and manages an `AsyncIOScheduler` instance for background tasks.
- Ensures the scheduler is started by only one worker process using a robust, PID-aware file lock.
- Schedules a daily reload of the photo database at 2 AM.
"""

import logging
import os
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from models import DB
from read_db import read_db

logger = logging.getLogger(__name__)


class SharedDB:
    """
    A singleton class to manage a shared database and scheduler instance.

    This class ensures that the database and scheduler are initialized only once
    and provides a robust mechanism for starting the scheduler in a multi-worker
    environment.
    """

    _instance: Optional["SharedDB"] = None
    _db: Optional[DB] = None
    _scheduler: Optional[AsyncIOScheduler] = None

    _lock_file = "/tmp/photos_scheduler.lock"

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if self._db is None:
            self.reload_db()  # Initial load
        if self._scheduler is None:
            self._scheduler = AsyncIOScheduler()
            logger.info("Shared scheduler created.")

    def get_db(self) -> DB:
        """Returns the shared database instance, loading it if necessary."""
        return self._db

    def get_scheduler(self) -> AsyncIOScheduler:
        """Returns the shared scheduler instance."""
        return self._scheduler

    def reload_db(self) -> None:
        """Loads or reloads the shared database from the configured path."""
        photos_db_path = "/photo_db"
        photos_db_filters = "Public:Protected:Private"

        logger.info(
            f"Loading photos database from {photos_db_path} with filters {photos_db_filters}..."
        )
        try:
            self._db = read_db(photos_db_path, photos_db_filters)
            logger.info(
                f"Database with {len(self._db.albums)} albums and {len(self._db.photos)} photos loaded."
            )
        except Exception as e:
            logger.error(f"Failed to load photos database: {e}")
            raise

    def start_scheduler(self) -> None:
        """
        Starts the scheduler if this worker acquires the lock.

        Uses a file-based lock that checks the PID to prevent stale locks
        from a crashed worker.
        """
        if self._is_lock_held_by_other():
            return

        try:
            with open(self._lock_file, "x") as f:
                f.write(str(os.getpid()))

            if not self._scheduler.running:
                self._scheduler.start()
                self._scheduler.add_job(
                    self.reload_db,
                    "cron",
                    hour=2,
                    minute=0,
                    id="daily_db_reload",
                    name="Daily database reload at 2am",
                    replace_existing=True,
                )
                logger.info("Scheduler started with daily database reload job.")
        except FileExistsError:
            logger.debug("Another worker acquired the lock just now.")
        except Exception as e:
            logger.error(f"Failed to start scheduler: {e}")
            self._release_lock()

    def _is_lock_held_by_other(self) -> bool:
        """Checks if a valid, non-stale lock is held by another process."""
        try:
            with open(self._lock_file, "r") as f:
                pid_str = f.read().strip()

            if not pid_str:
                return False

            pid = int(pid_str)
            os.kill(pid, 0)  # Check if process exists

            if pid != os.getpid():
                logger.info(f"Scheduler lock held by running process {pid}.")
                return True

        except (FileNotFoundError, ValueError):
            return False  # No lock or invalid PID
        except OSError:
            logger.warning(
                f"Stale lock file found (process {pid_str} not running). Removing lock."
            )
            self._release_lock()
            return False

        return False

    def _release_lock(self):
        """Removes the lock file if it exists."""
        if os.path.exists(self._lock_file):
            os.remove(self._lock_file)

    def shutdown_scheduler(self) -> None:
        """Shuts down the scheduler and releases the lock if this process held it."""
        if self._scheduler and self._scheduler.running:
            # Only the process that holds the lock should shut down and release
            try:
                with open(self._lock_file, "r") as f:
                    pid = int(f.read().strip())
                if pid == os.getpid():
                    self._scheduler.shutdown()
                    self._release_lock()
                    logger.info("Scheduler shut down and lock released.")
            except (FileNotFoundError, ValueError):
                pass  # Lock already gone


# Singleton instance
shared_db_manager = SharedDB()
