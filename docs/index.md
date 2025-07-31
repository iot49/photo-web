# Photo Web Documentation

Welcome to the Photo Web documentation. Photo Web is a web application for playing Apple Photo Albums and viewing documents (markdown, pdf, etc.) in a web browser.

## Overview

Photo Web provides a secure, web-based interface for accessing your Apple Photos library and document collections. The application features role-based access control, real-time image processing, and a modern single-page application interface.

### Key Features

- **Secure Access**: HTTPS-only access with certificate validation
- **Apple Photos Integration**: Direct access to Apple Photos library without copying
- **Document Viewing**: Support for markdown, PDF, and other document formats
- **Role-Based Security**: Granular access control with public, protected, and private content
- **Real-Time Processing**: On-the-fly image scaling and HEIC to JPEG conversion
- **Modern UI**: Single-page application built with LitElement and TypeScript

### Architecture

The application consists of:

- **Backend Services**: Microservices architecture with Docker orchestration
- **Frontend**: Modern TypeScript SPA with Shoelace UI components
- **Security**: Firebase authentication with custom authorization
- **Infrastructure**: Traefik reverse proxy with Cloudflare tunnel support

## Quick Start

1. **Prerequisites**: Docker and Docker Compose installed
2. **Configuration**: Set up environment variables in `.env`
3. **Launch**: Run `docker-compose up -d`
4. **Access**: Navigate to `https://${ROOT_DOMAIN}`

!!! tip "Development Setup"
    For development and testing, you must set up DNS resolution for `${ROOT_DOMAIN}` since the application requires HTTPS with valid certificates. Add `127.0.0.1 dev49.org` to your `/etc/hosts` file.

## Navigation

- **[Architecture](architecture/overview.md)**: System design and component overview
- **[Services](services/auth.md)**: Detailed service documentation
- **[API Reference](api/auth.md)**: Complete API documentation
- **[Development](development/getting-started.md)**: Development setup and guidelines
- **[Deployment](deployment/docker.md)**: Production deployment guide

## Support

For issues and questions:

- Check the [Troubleshooting](deployment/troubleshooting.md) guide
- Review the [Development Guidelines](development/guidelines.md)
- Examine service logs with `docker-compose logs [service-name]`