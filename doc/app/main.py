import logging
import os
from fnmatch import fnmatch
from typing import List

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, DirectoryPath, Field

# excludes (may use * and ? wildcards)
EXCLUDE_FILES = [".DS_Store", "*.doc", "*.docx", "*.ppt", "*.pptx"]
EXCLUDE_FOLDERS = []

# set working directory to documents location
os.chdir("/docs")

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)


class FolderModel(BaseModel):
    path: DirectoryPath = Field(description="path relative to /docs")
    folders: List[str] = Field(description="names of sub-folders of path", default=[])
    files: List[str] = Field(description="names of files at path", default=[])

    @property
    def realm(self) -> str:
        os.path.normpath(self.path).split(os.sep)[0]

    @property
    def name(self) -> str:
        os.path.normpath(self.path).split(os.sep)[-1]


app = FastAPI(
    title="Photo Web Docs Service",
    description="Docs service for Photo Web application",
    version="1.0.0",
    root_path="/doc",
)


@app.get("/api/health")
async def health_check(response_model=str):
    return {"status": "Docs service is healthy"}


@app.get("/api/root")
async def get_roots(request: Request, response_model=FolderModel):
    """
    Get folders users has access to based on roles
    """
    roles = [
        role.strip()
        for role in request.headers.get("X-Forwarded-Roles", "public").split(",")
    ]
    roots = [folder for folder in roles if os.path.isdir(folder)]
    return FolderModel(path="", folders=sorted(roots))


@app.get("/api/file/{path:path}")
async def get_file(path: str):
    return FileResponse(os.path.normpath(path))


@app.get("/api/folder/{path:path}")
async def get_folder(path: str, response_model=FolderModel):
    path = os.path.normpath(path)
    folders = [
        folder
        for folder in os.listdir(path)
        if os.path.isdir(os.path.join(path, folder))
        if not any(fnmatch(folder, p) for p in EXCLUDE_FOLDERS)
    ]
    files = [
        file
        for file in os.listdir(path)
        if os.path.isfile(os.path.join(path, file))
        if not any(fnmatch(file, p) for p in EXCLUDE_FILES)
    ]
    return FolderModel(path=path, folders=sorted(folders), files=sorted(files))


@app.get("/authorize")
async def authorize_access(request: Request):
    """
    Authorization endpoint for delegated authorization from auth service.

    Recognized uri's: (access is determined based on realm)
        - /doc/api/folder/{realm}/{path}
        - /doc/api/file/{realm}/{path}

    Returns:
        - 200 (OK) if authorized
        - 403 (Forbidden) if not authorized
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

        realm = os.path.normpath(uri).split(os.sep)[4]

        logger.debug(
            f"uri={uri} realm={realm} roles={roles} authorize={realm in roles}"
        )
        if realm in roles:
            return {"status": f"authorized {uri} {realm} in {roles}"}

        raise HTTPException(
            status_code=403, detail=f"Access denied for {uri} and roles={roles}"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Authorization check failed for {uri}: {e}", e)
        raise HTTPException(
            status_code=500, detail=f"Authorization check failed for {uri}: {e}"
        )
