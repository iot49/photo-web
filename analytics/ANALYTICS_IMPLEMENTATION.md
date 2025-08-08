# Photo Web Analytics Implementation

This document describes the comprehensive logging and analytics system implemented for the Photo Web application to track album downloads, user usage patterns, and system performance.

## Overview

The analytics system consists of multiple layers that work together to collect, process, and analyze usage data:

1. **Traefik Enhanced Logging** - Captures detailed request information
2. **Request Tracking Middleware** - Adds request metadata and timing
3. **Auth Service Analytics** - Collects user behavior and authorization data
4. **Analytics Processing Service** - Processes logs and generates reports
5. **Analytics API Endpoints** - Provides access to usage statistics

## Architecture

```
User Request → Traefik (Enhanced Logging) → Nginx → Auth Service (Analytics Collection) → Backend Services
                    ↓                                        ↓
            Access Logs (JSON)                    Analytics Data (JSON)
                    ↓                                        ↓
                Analytics Processing Service ← → Analytics API Endpoints
                    ↓
            Reports & Summaries (JSON)
```

## Implementation Details

### 1. Enhanced Traefik Logging

**File**: [`traefik/traefik.yml`](traefik/traefik.yml)

- **Enhanced Access Logs**: JSON format with detailed request metadata
- **Custom Headers**: Captures user roles, user agents, and forwarded headers
- **Metrics Integration**: Prometheus metrics for monitoring
- **Log Rotation**: Automatic log management with buffering

**Key Features**:
- Request timing and response codes
- User agent and IP address tracking
- Security-conscious logging (excludes auth tokens)
- Structured JSON format for easy parsing

### 2. Request Tracking Middleware

**File**: [`traefik/traefik-dynamic.yml`](traefik/traefik-dynamic.yml)

- **Request Tracker**: Adds timing and metadata headers
- **Analytics Chains**: Combines tracking with authorization and rate limiting
- **Response Headers**: Includes request ID and response time

**Middleware Chains**:
- `analytics-chain`: For HTTPS traffic (request-tracker → authorize → local-rate-limit)
- `analytics-cloudflared-chain`: For Cloudflare tunnel traffic

### 3. Auth Service Analytics Collection

**Files**: 
- [`auth/app/analytics.py`](auth/app/analytics.py) - Analytics collection utilities
- [`auth/app/main.py`](auth/app/main.py) - Enhanced authorize endpoint

**Features**:
- **Real-time Collection**: Captures every authorization request
- **Resource Identification**: Automatically detects albums, photos, and files
- **User Behavior Tracking**: Monitors access patterns and preferences
- **Performance Metrics**: Response times and error rates
- **Asynchronous Processing**: Non-blocking analytics collection

**Data Collected**:
- User identification and roles
- Resource access patterns (albums, photos, files)
- Request timing and performance
- Geographic and device information
- Success/failure rates

### 4. Analytics Processing Service

**Files**: [`analytics/`](analytics/) directory
- [`process_logs.py`](analytics/process_logs.py) - Main processing script
- [`Dockerfile`](analytics/Dockerfile) - Container configuration
- [`requirements.txt`](analytics/requirements.txt) - Python dependencies

**Processing Capabilities**:
- **Log Parsing**: Processes Traefik access logs and auth analytics
- **Data Aggregation**: Combines multiple data sources
- **Report Generation**: Daily and weekly analytics reports
- **Trend Analysis**: Long-term usage pattern identification
- **Data Cleanup**: Automatic retention management

### 5. Analytics API Endpoints

**File**: [`auth/app/main.py`](auth/app/main.py)

**Available Endpoints** (Admin access required):

#### Usage Summary
```
GET /auth/api/analytics/usage-summary?days=7
```
Returns comprehensive usage statistics including:
- Total requests and unique users
- Service usage breakdown (photos vs files)
- Popular albums and content
- Temporal usage patterns

#### Album Statistics
```
GET /auth/api/analytics/album-stats?album_id=optional
```
Provides detailed album analytics:
- Access counts and unique users
- Download patterns and trends
- Recent activity logs
- User engagement metrics

#### User Activity
```
GET /auth/api/analytics/user-activity
```
Delivers user behavior insights:
- Active user counts and trends
- Top users by activity
- Service preferences
- Engagement patterns

## Docker Configuration

**File**: [`docker-compose.yml`](docker-compose.yml)

**New Volumes**:
- `traefik-logs`: Stores Traefik access and error logs
- `analytics-data`: Persistent storage for processed analytics

**Service Updates**:
- **Traefik**: Enhanced logging with volume mounts
- **Auth**: Analytics data volume for persistent storage
- **Analytics**: New service for log processing
- **Nginx**: Updated middleware chains for analytics

## Usage Examples

### Starting the System

```bash
# Build and start all services including analytics
docker-compose up -d

# Check analytics service logs
docker logs analytics

# View Traefik logs
docker exec traefik ls -la /var/log/traefik/
```

### Accessing Analytics (Admin Required)

```bash
# Get weekly usage summary
curl -H "Cookie: session=..." \
  "https://your-domain.com/auth/api/analytics/usage-summary?days=7"

# Get album statistics
curl -H "Cookie: session=..." \
  "https://your-domain.com/auth/api/analytics/album-stats"

# Get user activity report
curl -H "Cookie: session=..." \
  "https://your-domain.com/auth/api/analytics/user-activity"
```

### Sample Analytics Output

```json
{
  "period_days": 7,
  "total_requests": 1250,
  "unique_users": 45,
  "services_used": {
    "photos": 800,
    "files": 450
  },
  "popular_albums": {
    "family-vacation-2024": 120,
    "wedding-photos": 85,
    "holiday-memories": 67
  },
  "generated_at": "2024-01-15T10:30:00Z"
}
```

## Data Privacy and Security

- **User Privacy**: Email addresses can be hashed for anonymization
- **Data Retention**: Configurable retention periods (default: 90 days)
- **Access Control**: Analytics endpoints require admin role
- **Secure Storage**: Analytics data stored in protected Docker volumes
- **GDPR Compliance**: Mechanisms for data purging and user consent

## Monitoring and Maintenance

### Log Files Locations
- **Traefik Logs**: `/var/log/traefik/` (in traefik container)
- **Analytics Data**: `/app/analytics/` (in auth container)
- **Processed Reports**: `/app/data/reports/` (in analytics container)

### Maintenance Tasks
- **Daily**: Automatic report generation
- **Weekly**: Summary generation and data cleanup
- **Monthly**: Trend analysis and capacity planning

### Performance Considerations
- **Asynchronous Processing**: Analytics collection doesn't block requests
- **Efficient Storage**: JSON format with compression
- **Resource Limits**: Configurable processing intervals
- **Scalability**: Horizontal scaling support for high-traffic sites

## Troubleshooting

### Common Issues

1. **No Analytics Data**
   - Check if analytics service is running: `docker ps | grep analytics`
   - Verify log volumes are mounted correctly
   - Check auth service logs for analytics errors

2. **Missing Traefik Logs**
   - Ensure log directory is writable: `docker exec traefik ls -la /var/log/traefik/`
   - Check Traefik configuration syntax
   - Verify volume mounts in docker-compose.yml

3. **API Access Denied**
   - Confirm user has admin role
   - Check session cookie validity
   - Verify endpoint URLs and authentication

### Debug Commands

```bash
# Check analytics service status
docker logs analytics --tail 50

# Verify Traefik logging
docker exec traefik cat /var/log/traefik/access.log | tail -5

# Check analytics data structure
docker exec auth ls -la /app/analytics/

# Test analytics API
docker exec auth curl -s http://localhost:8000/api/analytics/usage-summary
```

## Future Enhancements

- **Real-time Dashboard**: Web interface for analytics visualization
- **Alert System**: Notifications for unusual usage patterns
- **Export Features**: CSV/PDF report generation
- **Advanced Analytics**: Machine learning for usage prediction
- **Integration**: External analytics platforms (Google Analytics, etc.)

This comprehensive analytics system provides deep insights into Photo Web usage while maintaining performance and security standards.