import { AlbumDateRange, AlbumLocation } from "./interfaces";

export class Utilities {
  public formatDate(dateRange?: AlbumDateRange): string {
    if (!dateRange) return 'N/A';
    if (dateRange.start && dateRange.end) {
      return `${dateRange.start} - ${dateRange.end}`;
    }
    return dateRange.start || dateRange.end || 'N/A';
  }

  public formatLocation(location?: AlbumLocation): string {
    if (!location) return 'N/A';
    return `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`;
  }
}
