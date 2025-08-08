#!/usr/bin/env python3
"""
Photo Web Analytics Log Processor

This script processes Traefik access logs and auth service analytics logs
to generate comprehensive usage reports and statistics for the Photo Web application.
"""

import json
import logging
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict

import pandas as pd

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


class LogProcessor:
    """Processes Traefik and application logs for analytics"""

    def __init__(
        self,
        traefik_logs_dir: str = "/logs/traefik",
        analytics_data_dir: str = "/app/data",
    ):
        self.traefik_logs_dir = Path(traefik_logs_dir)
        self.analytics_data_dir = Path(analytics_data_dir)
        self.analytics_data_dir.mkdir(exist_ok=True)

        # Create subdirectories for processed data
        (self.analytics_data_dir / "reports").mkdir(exist_ok=True)
        (self.analytics_data_dir / "summaries").mkdir(exist_ok=True)
        (self.analytics_data_dir / "trends").mkdir(exist_ok=True)

    def process_traefik_logs(self) -> Dict[str, Any]:
        """Process Traefik access logs for request analytics"""
        access_log_file = self.traefik_logs_dir / "access.log"

        if not access_log_file.exists():
            logger.warning(f"Traefik access log not found: {access_log_file}")
            return {}

        try:
            # Read and parse access logs
            logs = []
            with open(access_log_file, "r") as f:
                for line in f:
                    try:
                        log_entry = json.loads(line.strip())
                        logs.append(log_entry)
                    except json.JSONDecodeError:
                        continue

            if not logs:
                logger.info("No valid log entries found")
                return {}

            # Convert to DataFrame for analysis
            df = pd.DataFrame(logs)

            # Parse timestamps
            if "time" in df.columns:
                df["timestamp"] = pd.to_datetime(df["time"])
            else:
                logger.warning("No timestamp column found in logs")
                return {}

            # Extract request information
            df["path"] = df.get("RequestPath", "/")
            df["method"] = df.get("RequestMethod", "GET")
            df["status"] = df.get("DownstreamStatus", 200)
            df["duration"] = df.get("Duration", 0)
            df["user_agent"] = df.get("request_User-Agent", "")
            df["client_ip"] = df.get("ClientAddr", "")

            # Filter recent data (last 30 days)
            cutoff_date = datetime.now() - timedelta(days=30)
            recent_df = df[df["timestamp"] >= cutoff_date]

            # Generate analytics
            analytics = {
                "total_requests": len(recent_df),
                "unique_ips": recent_df["client_ip"].nunique(),
                "status_distribution": recent_df["status"].value_counts().to_dict(),
                "top_paths": recent_df["path"].value_counts().head(20).to_dict(),
                "hourly_distribution": recent_df.groupby(recent_df["timestamp"].dt.hour)
                .size()
                .to_dict(),
                "daily_requests": recent_df.groupby(recent_df["timestamp"].dt.date)
                .size()
                .to_dict(),
                "avg_response_time": recent_df["duration"].mean()
                if "duration" in recent_df.columns
                else 0,
                "generated_at": datetime.now().isoformat(),
            }

            # Identify photo and file requests
            photo_requests = recent_df[
                recent_df["path"].str.contains("/photos/", na=False)
            ]
            file_requests = recent_df[
                recent_df["path"].str.contains("/files/", na=False)
            ]

            analytics.update(
                {
                    "photo_requests": len(photo_requests),
                    "file_requests": len(file_requests),
                    "popular_albums": self._extract_album_stats(photo_requests),
                    "popular_files": self._extract_file_stats(file_requests),
                }
            )

            return analytics

        except Exception as e:
            logger.error(f"Error processing Traefik logs: {e}")
            return {}

    def _extract_album_stats(self, photo_df: pd.DataFrame) -> Dict[str, int]:
        """Extract album access statistics from photo requests"""
        album_requests = photo_df[
            photo_df["path"].str.contains("/photos/api/albums/", na=False)
        ]

        album_counts = {}
        for path in album_requests["path"]:
            try:
                # Extract album ID from path like /photos/api/albums/{album_id}
                parts = path.split("/")
                if len(parts) >= 5 and parts[3] == "albums":
                    album_id = parts[4]
                    album_counts[album_id] = album_counts.get(album_id, 0) + 1
            except:
                continue

        # Return top 10 albums
        return dict(sorted(album_counts.items(), key=lambda x: x[1], reverse=True)[:10])

    def _extract_file_stats(self, file_df: pd.DataFrame) -> Dict[str, int]:
        """Extract file access statistics from file requests"""
        file_requests = file_df[file_df["path"].str.contains("/files/api/", na=False)]

        file_counts = {}
        for path in file_requests["path"]:
            try:
                # Extract file path from /files/api/file/{path}
                if "/files/api/file/" in path:
                    file_path = path.split("/files/api/file/", 1)[1]
                    file_counts[file_path] = file_counts.get(file_path, 0) + 1
            except:
                continue

        # Return top 10 files
        return dict(sorted(file_counts.items(), key=lambda x: x[1], reverse=True)[:10])

    def generate_daily_report(self) -> Dict[str, Any]:
        """Generate daily analytics report"""
        try:
            traefik_analytics = self.process_traefik_logs()

            # Calculate daily metrics
            today = datetime.now().date()
            yesterday = today - timedelta(days=1)

            report = {
                "date": today.isoformat(),
                "period": "daily",
                "traefik_analytics": traefik_analytics,
                "summary": {
                    "total_requests_today": traefik_analytics.get("total_requests", 0),
                    "unique_visitors_today": traefik_analytics.get("unique_ips", 0),
                    "photo_requests_today": traefik_analytics.get("photo_requests", 0),
                    "file_requests_today": traefik_analytics.get("file_requests", 0),
                    "avg_response_time_ms": traefik_analytics.get(
                        "avg_response_time", 0
                    ),
                },
                "top_content": {
                    "popular_albums": traefik_analytics.get("popular_albums", {}),
                    "popular_files": traefik_analytics.get("popular_files", {}),
                    "top_paths": traefik_analytics.get("top_paths", {}),
                },
                "generated_at": datetime.now().isoformat(),
            }

            # Save daily report
            report_file = (
                self.analytics_data_dir / "reports" / f"daily_{today.isoformat()}.json"
            )
            with open(report_file, "w") as f:
                json.dump(report, f, indent=2, default=str)

            logger.info(f"Daily report generated: {report_file}")
            return report

        except Exception as e:
            logger.error(f"Error generating daily report: {e}")
            return {}

    def generate_weekly_summary(self) -> Dict[str, Any]:
        """Generate weekly analytics summary"""
        try:
            # Read daily reports from the last 7 days
            weekly_data = []
            for i in range(7):
                date = datetime.now().date() - timedelta(days=i)
                report_file = (
                    self.analytics_data_dir
                    / "reports"
                    / f"daily_{date.isoformat()}.json"
                )

                if report_file.exists():
                    with open(report_file, "r") as f:
                        daily_data = json.load(f)
                        weekly_data.append(daily_data)

            if not weekly_data:
                logger.warning("No daily reports found for weekly summary")
                return {}

            # Aggregate weekly metrics
            total_requests = sum(
                data["summary"].get("total_requests_today", 0) for data in weekly_data
            )
            total_unique_visitors = sum(
                data["summary"].get("unique_visitors_today", 0) for data in weekly_data
            )
            total_photo_requests = sum(
                data["summary"].get("photo_requests_today", 0) for data in weekly_data
            )
            total_file_requests = sum(
                data["summary"].get("file_requests_today", 0) for data in weekly_data
            )

            # Aggregate popular content
            all_albums = {}
            all_files = {}
            for data in weekly_data:
                for album, count in (
                    data["top_content"].get("popular_albums", {}).items()
                ):
                    all_albums[album] = all_albums.get(album, 0) + count
                for file, count in data["top_content"].get("popular_files", {}).items():
                    all_files[file] = all_files.get(file, 0) + count

            weekly_summary = {
                "week_ending": datetime.now().date().isoformat(),
                "period": "weekly",
                "summary": {
                    "total_requests_week": total_requests,
                    "avg_requests_per_day": total_requests / len(weekly_data),
                    "total_unique_visitors_week": total_unique_visitors,
                    "total_photo_requests_week": total_photo_requests,
                    "total_file_requests_week": total_file_requests,
                    "days_with_data": len(weekly_data),
                },
                "top_content_week": {
                    "popular_albums": dict(
                        sorted(all_albums.items(), key=lambda x: x[1], reverse=True)[
                            :10
                        ]
                    ),
                    "popular_files": dict(
                        sorted(all_files.items(), key=lambda x: x[1], reverse=True)[:10]
                    ),
                },
                "daily_breakdown": [
                    {
                        "date": data["date"],
                        "requests": data["summary"].get("total_requests_today", 0),
                        "unique_visitors": data["summary"].get(
                            "unique_visitors_today", 0
                        ),
                    }
                    for data in weekly_data
                ],
                "generated_at": datetime.now().isoformat(),
            }

            # Save weekly summary
            summary_file = (
                self.analytics_data_dir
                / "summaries"
                / f"weekly_{datetime.now().date().isoformat()}.json"
            )
            with open(summary_file, "w") as f:
                json.dump(weekly_summary, f, indent=2, default=str)

            logger.info(f"Weekly summary generated: {summary_file}")
            return weekly_summary

        except Exception as e:
            logger.error(f"Error generating weekly summary: {e}")
            return {}

    def cleanup_old_data(self, days_to_keep: int = 90):
        """Clean up old analytics data"""
        try:
            cutoff_date = datetime.now() - timedelta(days=days_to_keep)

            # Clean up old daily reports
            reports_dir = self.analytics_data_dir / "reports"
            if reports_dir.exists():
                for report_file in reports_dir.glob("daily_*.json"):
                    try:
                        # Extract date from filename
                        date_str = report_file.stem.replace("daily_", "")
                        file_date = datetime.fromisoformat(date_str)

                        if file_date < cutoff_date:
                            report_file.unlink()
                            logger.info(f"Deleted old report: {report_file}")
                    except:
                        continue

            logger.info(f"Cleanup completed, kept data from last {days_to_keep} days")

        except Exception as e:
            logger.error(f"Error during cleanup: {e}")


def main():
    """Main processing loop"""
    processor = LogProcessor()

    logger.info("Starting Photo Web Analytics Processor")

    while True:
        try:
            # Generate daily report
            daily_report = processor.generate_daily_report()

            # Generate weekly summary (once per day)
            current_hour = datetime.now().hour
            if current_hour == 1:  # Run at 1 AM
                weekly_summary = processor.generate_weekly_summary()

                # Cleanup old data weekly
                processor.cleanup_old_data()

            # Log current status
            if daily_report:
                logger.info(
                    f"Processed {daily_report['summary'].get('total_requests_today', 0)} requests today"
                )

            # Wait 1 hour before next processing
            time.sleep(3600)

        except KeyboardInterrupt:
            logger.info("Analytics processor stopped by user")
            break
        except Exception as e:
            logger.error(f"Error in main processing loop: {e}")
            time.sleep(300)  # Wait 5 minutes before retrying


if __name__ == "__main__":
    main()
