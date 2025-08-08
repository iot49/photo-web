# Photo Web Analytics Service

This service processes Traefik access logs and application analytics data to generate comprehensive usage reports and statistics for the Photo Web application.

## Features

- **Real-time Log Processing**: Continuously processes Traefik access logs
- **Usage Analytics**: Tracks album downloads, file access, and user behavior
- **Automated Reporting**: Generates daily and weekly analytics reports
- **Data Retention**: Automatic cleanup of old analytics data
- **Performance Metrics**: Response time analysis and system performance tracking

## Architecture

The analytics service runs as a separate Docker container that:

1. Reads Traefik access logs from shared volume
2. Processes auth service analytics data
3. Generates structured reports and summaries
4. Stores processed data for API consumption

## Data Flow

```
Traefik Access Logs → Analytics Processor → Structured Reports
Auth Service Analytics → Analytics Processor → Usage Statistics
```

## Generated Reports

### Daily Reports
- Total requests and unique visitors
- Popular albums and files
- Response time metrics
- Service usage breakdown

### Weekly Summaries
- Aggregated weekly statistics
- Trending content analysis
- User engagement patterns
- Performance trends

## File Structure

```
/app/data/
├── reports/           # Daily analytics reports
├── summaries/         # Weekly and monthly summaries
└── trends/           # Long-term trend analysis
```

## Configuration

The service is configured through environment variables and Docker volumes:

- **Log Input**: `/logs/traefik` (read-only access to Traefik logs)
- **Data Output**: `/app/data` (persistent analytics storage)
- **Processing Interval**: 1 hour for regular processing, daily for summaries

## Usage

The analytics service runs automatically as part of the Photo Web stack. Reports are accessible through the auth service analytics API endpoints:

- `GET /auth/api/analytics/usage-summary` - Overall usage statistics
- `GET /auth/api/analytics/album-stats` - Album access analytics
- `GET /auth/api/analytics/user-activity` - User behavior analysis

## Monitoring

The service logs its processing status and any errors to stdout, which can be monitored using:

```bash
docker logs analytics
```

## Data Retention

- Daily reports: 90 days (configurable)
- Weekly summaries: 1 year
- Raw analytics logs: 30 days
- Automatic cleanup runs weekly