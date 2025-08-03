# Photos Service

The Photos Service provides direct access to Apple Photos libraries, serving album metadata and photos with real-time image processing capabilities. It integrates with OSXPhotos to read Apple's photo database without copying or modifying the original library, and uses ImageMagick for professional-grade image processing.

## Overview

- **Technology**: FastAPI with OSXPhotos integration and ImageMagick processing
- **Port**: 8000 (internal Docker network)
- **External Access**: `https://${ROOT_DOMAIN}/photos/*`
- **API Documentation**: Available at `/photos/docs` and `/photos/redoc`
- **Image Processing**: Dedicated ImageMagick Docker container for HEIC and format conversion

## Architecture

```mermaid
graph TB
    subgraph "Photos Service"
        API[FastAPI Application]
        AUTH[Authorization Module]
        CACHE[In-Memory Cache]
    end
    
    subgraph "Image Processing"
        IMAGEMAGICK[ImageMagick Container<br/>dpokidov/imagemagick:latest]
        SHARED[Shared Volume<br/>/tmp/imagemagick]
    end
    
    subgraph "Data Sources"
        APPLE[Apple Photos Library<br/>Read-Only Mount]
        OSX[OSXPhotos Database]
    end
    
    subgraph "External Services"
        NGINX[Nginx Cache]
        AUTHSVC[Auth Service]
    end
    
    API --> IMAGEMAGICK
    API --> AUTH
    API --> CACHE
    IMAGEMAGICK --> SHARED
    IMAGEMAGICK --> APPLE
    API --> OSX
    
    AUTH -.->|Delegation| AUTHSVC
    API --> NGINX
```

## Core Components

### ImageMagick Integration

The Photos Service uses a dedicated ImageMagick Docker container for professional-grade image processing:

- **Native HEIC Support**: Built-in HEIC to JPEG conversion using libheif
- **Format Conversion**: Supports all major image formats including HEIC, JPEG, PNG, TIFF
- **Responsive Scaling**: Multiple size variants with aspect ratio preservation
- **Quality Optimization**: Advanced JPEG compression with sampling factor optimization
- **Metadata Handling**: Automatic EXIF orientation correction and metadata stripping
- **Performance**: Containerized processing with shared volume for efficient file handling

### Album Access Control

Albums are classified based on their folder structure:

```python
def get_album_access_level(album_title: str, folder_path: str) -> str:
    """Determine access level based on album folder"""
    if folder_path.lower().startswith('public'):
        return 'public'
    elif folder_path.lower().startswith('protected'):
        return 'protected'
    elif folder_path.lower().startswith('private'):
        return 'private'
    else:
        return 'protected'  # Default for unclassified albums
```

### Database Reader (`read_db.py`)

Interfaces with OSXPhotos database:

```python
class PhotosDatabase:
    def get_albums(self) -> List[Album]:
        """Get all albums with metadata"""
        
    def get_album_photos(self, album_uuid: str) -> List[Photo]:
        """Get photos in specific album"""
        
    def get_photo_metadata(self, photo_uuid: str) -> Photo:
        """Get detailed photo metadata"""
```

## API Documentation

The Photos Service provides a comprehensive REST API for album browsing, photo serving, and image processing with real-time scaling and format conversion.

**📖 Complete API Documentation:** [https://${ROOT_DOMAIN}/photos/docs](https://${ROOT_DOMAIN}/photos/docs)

The interactive API documentation includes:

- **Complete endpoint reference** with request/response examples
- **Image processing pipeline** documentation
- **Responsive image sizing** with all available variants
- **Access control rules** for album-based permissions
- **Interactive testing** with real photo data
- **Performance optimization** guidelines

### Key API Endpoints

| Endpoint | Method | Purpose | Access |
|----------|--------|---------|---------|
| `/api/albums` | GET | List accessible albums | Role-based |
| `/api/albums/{uuid}` | GET | Album photos and metadata | Role-based |
| `/api/photos/{id}/img` | GET | Original photo image | Role-based |
| `/api/photos/{id}/img{size}` | GET | Responsive image variants | Role-based |
| `/api/photos/srcset` | GET | Available image sizes | Public |
| `/api/reload-db` | POST | Refresh photo database | Admin |
| `/api/health` | GET | Service health check | Public |

### Image Size Variants

The service provides multiple responsive image sizes optimized for different use cases:

| Size | Width | Quality | Use Case |
|------|-------|---------|----------|
| `-sm` | 480px | 75% | Mobile phones |
| `-md` | 768px | 75% | Tablets |
| `-lg` | 1024px | 80% | Desktop |
| `-xl` | 1440px | 85% | Large desktop |
| `-xxl` | 1920px | 90% | 4K displays |
| `-xxxl` | 3860px | 95% | 8K displays |

### Quick Start

1. **List Albums**: Get accessible albums from `/api/albums`
2. **Browse Photos**: Get album contents from `/api/albums/{uuid}`
3. **Display Images**: Use responsive variants like `/api/photos/{id}/img-md`
4. **Optimize Performance**: Implement srcset for responsive images

For detailed examples, testing, and complete schema documentation, visit the [interactive API documentation](https://${ROOT_DOMAIN}/photos/docs).

## Image Processing Pipeline

```mermaid
graph LR
    subgraph "Request Processing"
        REQ[Image Request] --> CACHE{Cache Check}
        CACHE -->|Hit| RETURN[Return Cached]
        CACHE -->|Miss| PROCESS[Process with ImageMagick]
    end
    
    subgraph "ImageMagick Processing"
        PROCESS --> DOCKER[Docker Exec to ImageMagick]
        DOCKER --> LOAD[Load from Shared Photo Library]
        LOAD --> ORIENT[Auto-Orient via EXIF]
        ORIENT --> SCALE[Scale to Size]
        SCALE --> CONVERT[Convert HEIC→JPEG]
        CONVERT --> OPTIMIZE[Optimize Quality & Sampling]
        OPTIMIZE --> STRIP[Strip Metadata]
        STRIP --> SHARED[Write to Shared Volume]
        SHARED --> CACHE_STORE[Store in Cache]
        CACHE_STORE --> RETURN
    end
```

### Processing Steps

1. **Cache Check**: Check Nginx cache for existing processed image
2. **ImageMagick Execution**: Execute `magick` command in dedicated container
3. **Load Original**: Read image from shared Apple Photos library mount
4. **Auto-Orient**: Apply EXIF orientation correction for proper display
5. **Scale Image**: Resize to requested dimensions with `>` flag (no upscaling)
6. **Format Conversion**: Convert HEIC to JPEG using native libheif support
7. **Quality Optimization**: Apply JPEG compression with 4:2:0 sampling factor
8. **Metadata Stripping**: Remove EXIF data for smaller file sizes
9. **Shared Volume**: Write processed image to shared temporary directory
10. **Cache Storage**: Store processed image in Nginx cache
11. **Response**: Return processed image with appropriate headers

### Image Quality Settings

ImageMagick processing uses optimized quality settings for each size variant:

| Size Variant | Max Dimension | JPEG Quality | Sampling Factor | Use Case |
|--------------|---------------|--------------|-----------------|----------|
| `img10` | 100px | 85% | 4:2:0 | Thumbnails, grid previews |
| `img30` | 300px | 85% | 4:2:0 | Album covers, small previews |
| `img50` | 500px | 85% | 4:2:0 | Medium previews, mobile view |
| `img85` | 850px | 90% | 4:2:0 | Desktop view, detail mode |
| `img100` | Original | 95% | 4:2:0 | Full resolution, download |

**ImageMagick Features:**
- **Auto-Orient**: Automatically applies EXIF orientation data
- **No Upscaling**: `>` resize flag prevents quality degradation
- **Metadata Stripping**: `-strip` removes EXIF data for smaller files
- **Optimized Sampling**: 4:2:0 chroma subsampling for efficient compression

## Authorization Integration

### Access Control Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant T as Traefik
    participant A as Auth Service
    participant P as Photos Service
    
    C->>T: GET /photos/api/albums/private-album
    T->>A: Check authorization
    A->>A: Parse roles.csv: !photos:8000
    A->>P: POST /auth/check-access
    P->>P: Check album access level
    P->>P: Verify user roles
    P->>A: Access decision
    A->>T: Forward decision
    
    alt Authorized
        T->>P: Forward original request
        P->>T: Album data
        T->>C: Response
    else Unauthorized
        T->>C: 403 Forbidden
    end
```

### Album Access Rules

```python
def check_album_access(album_uuid: str, user_roles: List[str]) -> bool:
    """Check if user can access specific album"""
    album = get_album(album_uuid)
    access_level = album.access_level
    
    if access_level == 'public':
        return 'public' in user_roles
    elif access_level == 'protected':
        return 'protected' in user_roles or 'private' in user_roles
    elif access_level == 'private':
        return 'private' in user_roles
    
    return False
```

### Photo Access Rules

Individual photos inherit access from their most permissive album:

```python
def get_photo_access_level(photo_uuid: str) -> str:
    """Get the most permissive access level for a photo"""
    albums = get_photo_albums(photo_uuid)
    access_levels = [album.access_level for album in albums]
    
    if 'public' in access_levels:
        return 'public'
    elif 'protected' in access_levels:
        return 'protected'
    else:
        return 'private'
```

## Configuration

### Environment Variables

```bash
# Apple Photos Library
PHOTOS_LIBRARY_PATH=/path/to/Photos Library.photoslibrary

# Image Processing
MAX_IMAGE_SIZE=10485760  # 10MB max file size
JPEG_QUALITY_DEFAULT=85
CACHE_EXPIRY_DAYS=7

# Performance
WORKER_PROCESSES=4
MAX_CONCURRENT_REQUESTS=100
```

### Docker Configuration

The service requires specific Docker setup for ImageMagick integration:

```yaml
# docker-compose.yml
services:
  photos:
    build: ./photos/app
    volumes:
      - ${PHOTOS_LIBRARY}:/photo_db:ro
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - /tmp/imagemagick:/tmp/imagemagick
    depends_on:
      - imagemagick

  imagemagick:
    image: dpokidov/imagemagick:latest
    container_name: imagemagick
    volumes:
      - /tmp/imagemagick:/images
      - ${PHOTOS_LIBRARY}:/photo_db:ro
    entrypoint: ["tail", "-f", "/dev/null"]
```

### OSXPhotos Configuration

```python
# OSXPhotos database connection
OSXPHOTOS_CONFIG = {
    'library_path': os.getenv('PHOTOS_LIBRARY_PATH'),
    'read_only': True,
    'cache_size': 1000,
    'timeout': 30
}
```

### ImageMagick Service Configuration

```python
# ImageMagick processing settings
IMAGEMAGICK_CONFIG = {
    'container_name': 'imagemagick',
    'shared_volume': '/tmp/imagemagick',
    'timeout': 60,  # Processing timeout in seconds
    'quality_default': 85,
    'sampling_factor': '4:2:0'
}
```

## Performance Optimization

### Caching Strategy

```mermaid
graph TB
    subgraph "Cache Layers"
        BROWSER[Browser Cache<br/>24 hours]
        NGINX[Nginx Cache<br/>7 days]
        MEMORY[In-Memory Cache<br/>1 hour]
    end
    
    subgraph "Processing Layer"
        IMAGEMAGICK[ImageMagick Container]
        SHARED[Shared Volume<br/>/tmp/imagemagick]
    end
    
    subgraph "Data Sources"
        APPLE[Apple Photos Library]
        OSXDB[OSXPhotos Database]
    end
    
    BROWSER --> NGINX
    NGINX --> MEMORY
    MEMORY --> IMAGEMAGICK
    IMAGEMAGICK --> SHARED
    IMAGEMAGICK --> APPLE
    MEMORY --> OSXDB
```

### Database Optimization

- **Connection Pooling**: Reuse database connections
- **Query Caching**: Cache frequent album/photo queries
- **Lazy Loading**: Load photo metadata on demand
- **ImageMagick Optimization**: Containerized processing reduces memory overhead

### ImageMagick Performance

- **Dedicated Container**: Isolated processing environment prevents memory leaks
- **Shared Volume**: Efficient file transfer via `/tmp/imagemagick` mount
- **Native HEIC**: libheif integration for optimal HEIC processing
- **Timeout Management**: 60-second processing timeout prevents hanging operations

## Monitoring

### Health Checks

```python
@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "library_accessible": check_library_access(),
        "database_responsive": check_database(),
        "cache_status": get_cache_stats()
    }
```

### Metrics

- **Image Processing Time**: Average time per image size
- **Cache Hit Rate**: Percentage of cached vs. processed images
- **Album Access Patterns**: Most accessed albums and photos
- **Error Rates**: Failed image processing attempts

### Logging

```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "level": "INFO",
  "event": "image_processed",
  "photo_uuid": "photo-uuid-456",
  "size": "img50",
  "processing_time": "0.25s",
  "cache_hit": false
}
```

## Troubleshooting

### Common Issues

1. **Apple Photos Library Not Accessible**
   - Check mount path and permissions
   - Verify OSXPhotos installation
   - Ensure library is not corrupted

2. **ImageMagick Service Issues**
   - Verify ImageMagick container is running: `docker ps | grep imagemagick`
   - Check HEIC support: `docker exec imagemagick magick -list format | grep HEIC`
   - Monitor shared volume permissions: `/tmp/imagemagick`
   - Check Docker socket access for photos container

3. **HEIC Processing Failures**
   - Verify libheif is available in ImageMagick container
   - Check for specific HEIC variant compatibility issues
   - Monitor ImageMagick error logs for "no decode delegate" errors

4. **Image Processing Timeouts**
   - Check ImageMagick container resource limits
   - Monitor shared volume disk space
   - Verify network connectivity between containers

5. **Slow Performance**
   - Check cache hit rates
   - Monitor database query times
   - Verify shared volume performance (SSD recommended)
   - Check ImageMagick container CPU/memory usage

### Debug Commands

```bash
# Check ImageMagick service availability
docker exec imagemagick magick -version

# Test HEIC support
docker exec imagemagick magick -list format | grep HEIC

# Check library access
docker-compose exec photos python -c "from app.read_db import check_library; check_library()"

# Test ImageMagick processing
docker exec imagemagick magick /photo_db/path/to/test.heic -resize 500x500> /images/test_output.jpg

# View cache statistics
docker-compose exec photos curl http://localhost:8000/health

# Monitor ImageMagick container logs
docker logs imagemagick

# Check shared volume contents
ls -la /tmp/imagemagick/