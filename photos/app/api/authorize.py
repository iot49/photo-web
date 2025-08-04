import logging
import os

from fastapi import APIRouter, Depends, HTTPException, Request
from models import DB

logger = logging.getLogger(__name__)

router = APIRouter()


async def get_db() -> DB:
    """Photos database dependency - will be overridden by main.py."""
    raise NotImplementedError("Database dependency not configured")


@router.get("/authorize")
async def authorize_access(request: Request, db: DB = Depends(get_db)):
    """
    Authorization endpoint for delegated authorization from auth service.

    Recognized uri's: (access is determined based on realm)
        - /photos/api/photos/{photo_id}...
        - /photos/api/albums/{album_id}...


    The endpoint extracts the original URI from X-Forwarded-Uri header,
    parses the resource ID (album_id or photo_id), and checks if the user
    has permission to access that specific resource based on its realm.

    Returns:
        - 200 (OK) if authorized
        - 403 (Forbidden) if not authorized
        - 404 (Not Found) if resource doesn't exist
        - 400 (Bad Request) if URI format is invalid
    """
    try:
        uri = request.headers.get("X-Forwarded-Uri", "")
        if not uri:
            raise HTTPException(
                status_code=400, detail="X-Forwarded-Uri header required"
            )

        roles = [
            role.strip().lower()
            for role in request.headers.get("X-Forwarded-Roles", "public").split(",")
        ]

        path = os.path.normpath(uri).split(os.sep)
        kind = path[3]
        uuid = path[4]

        logger.debug(f"uri={uri} path={path} roles={roles}")

        if kind == "photos":
            item = db.photos.get(uuid)
            logger.info(
                f"Photo lookup: uuid={uuid}, item={'found' if item else 'NOT_FOUND'}"
            )
            if not item:
                logger.error(
                    f"Photo {uuid} not found in database - possible DB connection issue"
                )
                raise HTTPException(status_code=404, detail=f"Photo {uuid} not found")
            logger.info(f"Photo {uuid}: realm={item.realm}, user_roles={roles}")
            if item.realm in roles:
                logger.info(
                    f"Access GRANTED for photo {uuid}: realm '{item.realm}' in roles {roles}"
                )
                return {"status": "authorized"}
            else:
                logger.warning(
                    f"Access DENIED for photo {uuid}: realm '{item.realm}' not in roles {roles}"
                )
        if kind == "albums":
            item = db.albums.get(uuid)
            if item.realm in roles:
                return {"status": "authorized"}

        raise HTTPException(
            status_code=403,
            detail=f"Access denied for {uri} roles {roles}",
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Authorization check failed for {uri}: {e}", e)
        raise HTTPException(
            status_code=500, detail=f"Authorization check failed for {uri}: {e}"
        )
