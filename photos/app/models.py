from enum import Enum
from typing import Annotated, Dict, List, Optional

from pydantic import BaseModel, Field


class Realm(int, Enum):
    """
    Access levels for photos and albums.
    PUBLIC = 1
    PROTECTED = 2
    PRIVATE = 3
    """

    PUBLIC = 1
    PROTECTED = 2
    PRIVATE = 3

    @classmethod
    def _missing_(cls, value: object):
        if isinstance(value, str):
            value = value.upper()
            if value == "PUBLIC":
                return cls.PUBLIC
            elif value == "PROTECTED":
                return cls.PROTECTED
            elif value == "PRIVATE":
                return cls.PRIVATE
        # Fallback for integer values or if string doesn't match
        for member in cls:
            if member.value == value:
                return member
        return super()._missing_(value)


class PhotoModel(BaseModel):
    uuid: str
    date: str
    realm: Annotated[
        Realm, Field(description="Access level for the photo", default=Realm.PRIVATE)
    ]
    mime_type: str
    title: Optional[str] = None
    description: Optional[str] = None
    persons: Optional[List[str]] = None
    keywords: Optional[List[str]] = None
    width: Optional[int] = None
    height: Optional[int] = None
    place: Optional[str] = None
    longitude: Optional[float] = None
    latitude: Optional[float] = None
    uti: Optional[str] = None


class PhotoModelWithPath(PhotoModel):
    path: Annotated[str, Field(description="Path to the image file")]


class AlbumDateRange(BaseModel):
    start: Optional[str]
    end: Optional[str]


class AlbumLocation(BaseModel):
    longitude: float
    latitude: float
    radius: float


class AlbumModel(BaseModel):
    uuid: str
    title: str
    path: Annotated[
        str,
        Field(
            description="Location in the Apple Photos Albums Hierarchy, e.g. 'Public/Test'"
        ),
    ]
    realm: Annotated[
        Realm, Field(description="Access level for the album", default=Realm.PRIVATE)
    ]
    date: Optional[AlbumDateRange] = None
    location: Optional[AlbumLocation] = None
    persons: List[str]
    keywords: List[str]
    thumbnail: Optional[str] = None  # UUID of the thumbnail photo, if available


class AlbumModelWithPhotos(AlbumModel):
    photos: List[str] = Field(description="Ordered list of photo UUIDs in the album")


class DB(BaseModel):
    albums: Dict[str, AlbumModelWithPhotos]
    photos: Dict[str, PhotoModelWithPath]
