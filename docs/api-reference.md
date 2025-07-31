# API Reference

The Photo Web application provides comprehensive REST APIs for all services. Instead of maintaining duplicate documentation, we now serve the complete API documentation directly from the FastAPI services themselves.

## Live API Documentation

Each service provides interactive API documentation with the following features:

- **Complete endpoint documentation** with request/response examples
- **Interactive testing** - try API calls directly from the browser
- **Schema definitions** for all data models
- **Authentication requirements** clearly marked
- **Real-time validation** of request parameters

## Authentication Service API

**Swagger UI (Recommended):** [https://${ROOT_DOMAIN}/auth/docs](https://${ROOT_DOMAIN}/auth/docs)

**ReDoc Alternative:** [https://${ROOT_DOMAIN}/auth/redoc](https://${ROOT_DOMAIN}/auth/redoc)

### Key Endpoints:
- `POST /login` - User authentication with Firebase tokens
- `POST /logout` - Session termination
- `GET /me` - Current user information
- `GET /authorize` - Internal authorization for Traefik
- `GET /users` - User management (admin only)

## Photos Service API

**Swagger UI (Recommended):** [https://${ROOT_DOMAIN}/photos/docs](https://${ROOT_DOMAIN}/photos/docs)

**ReDoc Alternative:** [https://${ROOT_DOMAIN}/photos/redoc](https://${ROOT_DOMAIN}/photos/redoc)

### Key Endpoints:
- `GET /api/albums` - List accessible albums
- `GET /api/albums/{album_uuid}` - Album photos and metadata
- `GET /api/photos/{photo_id}/img{size}` - Responsive image serving
- `GET /api/photos/srcset` - Available image sizes
- `POST /api/reload-db` - Refresh photo database (admin only)

## Documents Service API

**Swagger UI (Recommended):** [https://${ROOT_DOMAIN}/files/docs](https://${ROOT_DOMAIN}/files/docs)

**ReDoc Alternative:** [https://${ROOT_DOMAIN}/files/redoc](https://${ROOT_DOMAIN}/files/redoc)

### Key Endpoints:
- `GET /api/health` - Service health check
- `GET /api/root` - Get accessible document realms based on user roles
- `GET /api/folder/{path:path}` - Browse folder contents within a realm
- `GET /api/file/{path:path}` - Download or view files from document repository
- `GET /authorize` - Internal authorization check (used by auth service)

## Why Use FastAPI Docs?

### Advantages over Static Documentation:

1. **Always Up-to-Date**: Documentation is generated directly from the code, ensuring it never gets out of sync
2. **Interactive Testing**: Test API endpoints directly from the documentation interface
3. **Complete Examples**: Real request/response examples with proper data types
4. **Schema Validation**: See exactly what data structures are expected
5. **Authentication Context**: Test with your actual session cookies
6. **Error Responses**: Complete documentation of all possible error conditions

### Getting Started:

1. **Authentication Required**: Most endpoints require authentication. Log in through the main application first.
2. **Session Cookies**: The interactive docs will use your browser's session cookies automatically.
3. **Try It Out**: Use the "Try it out" button on any endpoint to test with real data.
4. **Response Inspection**: View actual API responses including headers and status codes.

## Development and Testing

For development and testing purposes, you can also access the APIs directly:

```bash
# Get current user info
curl https://${ROOT_DOMAIN}/auth/me \
  -H "Cookie: session=your-session-cookie"

# List accessible albums
curl https://${ROOT_DOMAIN}/photos/api/albums \
  -H "Cookie: session=your-session-cookie"

# Get a scaled image
curl https://${ROOT_DOMAIN}/photos/api/photos/{photo-uuid}/img-md \
  -H "Cookie: session=your-session-cookie" \
  -o photo-medium.jpg

# Get accessible document realms
curl https://${ROOT_DOMAIN}/files/api/root \
  -H "Cookie: session=your-session-cookie"

# Browse documents in a realm
curl https://${ROOT_DOMAIN}/files/api/folder/admin/reports \
  -H "Cookie: session=your-session-cookie"

# Download a document
curl https://${ROOT_DOMAIN}/files/api/file/admin/reports/summary.pdf \
  -H "Cookie: session=your-session-cookie" \
  -o summary.pdf
```

## API Versioning

All APIs are currently at version 1.0.0. Breaking changes will be communicated through:
- Version number updates in the OpenAPI specifications
- Migration guides in the development documentation
- Deprecation notices for endpoints being removed

## Support and Issues

If you encounter issues with the APIs:

1. Check the interactive documentation for correct usage
2. Verify your authentication and permissions
3. Review the service logs for detailed error information
4. Consult the troubleshooting guides in the deployment documentation