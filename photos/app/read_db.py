from typing import Dict, Optional

from models import (
    DB,
    AlbumDateRange,
    AlbumLocation,
    AlbumModelWithPhotos,
    PhotoModelWithPath,
)
from osxphotos import PhotosDB


def _uti2mime(uti: str) -> str:
    """Convert a UTI to a MIME type."""
    UTI2MIME = {
        "public.jpeg": "image/jpeg",
        "public.heic": "image/heic",
        "com.adobe.photoshop-image": "image/vnd.adobe.photoshop",
        "com.apple.quicktime-movie": "video/quicktime",
        "public.avi": "video/x-msvideo",
        "com.canon.cr2-raw-image": "image/x-canon-cr2",
        "com.nikon.raw-image": "image/x-nikon-nef",
        "com.sony.arw-raw-image": "image/x-sony-arw",
        "public.avchd-mpeg-2-transport-stream": "video/avchd",
        "public.mpeg-4": "video/mp4",
        "com.adobe.raw-image": "image/x-adobe-dng",
        "public.png": "image/png",
        "public.tiff": "image/tiff",
        "public.jpeg-2000": "image/jp2",
        "com.adobe.pdf": "application/pdf",
        "com.microsoft.bmp": "image/bmp",
    }
    return UTI2MIME.get(uti, "application/octet-stream")


def _date_range(photos: list[PhotoModelWithPath]) -> Optional[AlbumDateRange]:
    """
    Calculates the earliest and latest dates from a list of PhotoModel objects.

    Args:
        photos (list[PhotoModel]): A list of PhotoModel instances.

    Returns:
        AlbumDateRange: An AlbumDateRange object with "start" and "end" dates.
        None: If the input list is empty or dates cannot be determined.
    """
    try:
        dates = [photo["date"] for photo in photos]
        return AlbumDateRange(start=min(dates), end=max(dates))
    except ValueError:
        return None


def _album_location(photos: list[PhotoModelWithPath]) -> Optional[AlbumLocation]:
    """
    Calculates the central location and approximate radius of an album based on the geographic coordinates of photos.

    Args:
        photos (list[PhotoModel]): A list of PhotoModel instances.

    Returns:
        AlbumLocation: An AlbumLocation object with longitude, latitude, and radius.
        None: If no valid coordinates are found.
    """
    longitudes = [
        photo["longitude"] for photo in photos if photo.get("longitude") is not None
    ]
    latitudes = [
        photo["latitude"] for photo in photos if photo.get("latitude") is not None
    ]
    if not longitudes or not latitudes:
        return None
    min_longitude = min(longitudes)
    max_longitude = max(longitudes)
    min_latitude = min(latitudes)
    max_latitude = max(latitudes)
    return AlbumLocation(
        longitude=(min_longitude + max_longitude) / 2,
        latitude=(min_latitude + max_latitude) / 2,
        radius=max(max_longitude - min_longitude, max_latitude - min_latitude),
    )


def read_db(db_path: str, filters: str) -> DB:
    albums: Dict[str, AlbumModelWithPhotos] = {}
    photos: Dict[str, PhotoModelWithPath] = {}

    # Initialize the PhotosDB object
    # For testing purposes, use a mock database if the real one is not available
    try:
        db = PhotosDB(db_path)
    except FileNotFoundError:
        # Return empty database for testing
        print(
            f"Warning: Photos database not found at {db_path}. Using empty database for testing."
        )
        return DB(albums={}, photos={})

    # Fetch all albums from the database
    for album in db.album_info:
        if not album.photos or len(album.folder_names) < 1:
            # Skip albums without photos or empty path
            continue
        realm = album.folder_names[0].lower()
        for filter in filters.split(":"):
            # print(f"TEST {realm} == ? {filter.lower()} = {filter.lower() == realm}")
            if filter.lower() == realm:
                # print(f"PROCESS album {album.title} ({realm}) and filter {filter}")
                break
        else:
            # print(f"SKIP album {album.title} ({realm}) and filter {filter}")
            continue

        # skip first part of path (usually one of public, protected, or private)
        album_path = "/".join(album.folder_names[1:])

        # photo info
        for photo in album.photos:
            if photo.uuid in photos:
                # update the permissions (realm)
                photos[photo.uuid]["realm"] = min(photos[photo.uuid]["realm"], realm)
            else:
                # add the photo
                info = {
                    "date": photo.date_original.isoformat(),
                    "path": photo.path_edited or photo.path,
                    "mime_type": _uti2mime(photo.uti),
                    "realm": realm,
                }
                if (photo.title is not None) and (not photo.title.startswith("A0")):
                    info["title"] = photo.title
                if photo.place is not None:
                    info["place"] = photo.place.name

                persons = set(photo.persons)
                persons.discard("_UNKNOWN_")
                if len(persons) > 0:
                    info["persons"] = list(persons)
                for key in [
                    "uuid",
                    "description",
                    "keywords",
                    "width",
                    "height",
                    "longitude",
                    "latitude",
                    "uti",
                ]:
                    value = getattr(photo, key)
                    if value is not None:
                        info[key] = value
                photos[photo.uuid] = info

        # album info
        albums[album.uuid] = {
            "uuid": album.uuid,
            "title": album.title,
            "path": album_path,
            "realm": realm,
            "photos": [photo.uuid for photo in album.photos],
            "date": _date_range([photos[photo.uuid] for photo in album.photos]),
            "location": _album_location([photos[photo.uuid] for photo in album.photos]),
            "persons": list(
                {p for photo in album.photos for p in photo.persons if p != "_UNKNOWN_"}
            ),
            "keywords": list(
                {k for photo in album.photos for k in photo.keywords if k}
            ),
            "thumbnail": album.photos[0].uuid if album.photos else None,
        }

    return DB(albums=albums, photos=photos)


if __name__ == "__main__":
    data = read_db(
        db_path="/Users/boser/Pictures/Photos Library.photoslibrary",
        filters="Public/Test:Proteced:Private",
    )

    # Save the data to JSON files using Pydantic's built-in JSON serialization using model_dump_json()
    with open("db.json", "w") as f:
        f.write(data.model_dump_json(indent=2))
    print(f"Found {len(data.albums)} albums and {len(data.photos)} photos.")
