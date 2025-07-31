import logging
import os
from contextlib import asynccontextmanager

# Import API modules
from api import albums, authorize, cache, photos
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI, HTTPException
from models import DB
from pillow_heif import register_heif_opener
from read_db import read_db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Register the HEIF opener to allow Pillow to read HEIC files
register_heif_opener()

# Initialize the scheduler
scheduler = AsyncIOScheduler()

# In-memory database (populated from Apple Photos library)
db: DB = DB(albums={}, photos={})


async def get_db() -> DB:
    """Photos database."""
    return db


async def load_db() -> DB:
    """Load the database from the in-memory store."""
    global db
    photos_db_path = os.getenv("PHOTOS_LIBRARY_MOUNT", "/photo_db")
    photos_db_filters = os.getenv("PHOTOS_DB_FILTERS", "Public:Protected:Private")

    try:
        logger.debug(
            f"Loading photos database from {photos_db_path} with filters {photos_db_filters} ..."
        )
        db = read_db(photos_db_path, photos_db_filters)
        logger.info(
            f"Database with {len(db.albums)} albums and {len(db.photos)} photos loaded successfully."
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load photos database from {photos_db_path}: {e}",
        )
    return db


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load database on startup
    await load_db()

    # Start the scheduler
    scheduler.start()

    # Schedule daily database reload at 2am
    scheduler.add_job(
        load_db,
        "cron",
        hour=2,
        minute=0,
        id="daily_db_reload",
        name="Daily database reload at 2am",
        replace_existing=True,
    )

    logger.info("Starting server with scheduled daily database reload at 2am...")
    yield

    # Shutdown the scheduler
    scheduler.shutdown()


app = FastAPI(
    title="Photo Web Photos Service",
    description="Photos service for Photo Web application",
    version="1.0.0",
    lifespan=lifespan,
    root_path="/photos",
)

# Include API routers
app.include_router(photos.router)
app.include_router(albums.router)
app.include_router(authorize.router)
app.include_router(cache.router)

# Override the get_db dependency in API modules
app.dependency_overrides[photos.get_db] = get_db
app.dependency_overrides[albums.get_db] = get_db
app.dependency_overrides[authorize.get_db] = get_db


@app.get("/api/health")
async def health_check():
    return {"status": "Photos service is healthy"}


@app.get("/api/reload-db")
async def reload_db():
    """Reload the database from the Apple Photos library."""
    try:
        await load_db()
        return {"status": "Database reloaded successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
