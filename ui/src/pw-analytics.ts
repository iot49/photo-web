import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { get_json } from './app/api.js';
import { consume } from '@lit/context';
import { Albums } from './app/interfaces.js';
import { albumsContext } from './app/context.js';

interface UsageSummary {
  period_days: number;
  total_requests: number;
  unique_users: number;
  services_used: Record<string, number>;
  popular_albums: Record<string, number>;
  generated_at: string;
}

interface AlbumStats {
  album_stats: Record<string, {
    total_accesses: number;
    unique_users: number;
    last_accessed: string;
    recent_activity?: Array<{
      timestamp: string;
      user_id: string;
      action: string;
      ip_address: string;
    }>;
  }>;
  generated_at: string;
}

interface UserActivity {
  total_users: number;
  active_users_7d: number;
  top_users: Array<{
    user_id: string;
    total_requests: number;
  }>;
  user_details: Record<string, {
    total_requests: number;
    services_used: string[];
    albums_accessed: number;
    files_accessed: number;
    first_seen: string;
    last_seen: string;
  }>;
  generated_at: string;
}

/**
 * Analytics dashboard component that displays usage statistics and analytics data.
 */
@customElement('pw-analytics')
export class PwAnalytics extends LitElement {
  static styles = css`
    :host {
      display: block;
      padding: 20px;
      font-family: sans-serif;
    }

    .analytics-container {
      max-width: 1200px;
      margin: 0 auto;
    }

    .analytics-header {
      margin-bottom: 30px;
      text-align: center;
    }

    .analytics-header h1 {
      color: var(--sl-color-primary-600);
      margin-bottom: 10px;
    }

    .analytics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }

    .analytics-card {
      background: var(--sl-color-neutral-0);
      border: 1px solid var(--sl-color-neutral-200);
      border-radius: 8px;
      padding: 20px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }

    .analytics-card h2 {
      color: var(--sl-color-neutral-700);
      margin-top: 0;
      margin-bottom: 15px;
      font-size: 1.2rem;
      border-bottom: 2px solid var(--sl-color-primary-200);
      padding-bottom: 8px;
    }

    .loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 200px;
      gap: 1rem;
    }

    .error {
      color: var(--sl-color-danger-600);
      background: var(--sl-color-danger-50);
      border: 1px solid var(--sl-color-danger-200);
      border-radius: 4px;
      padding: 15px;
      margin: 10px 0;
    }

    .metric-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0;
      border-bottom: 1px solid var(--sl-color-neutral-100);
    }

    .metric-row:last-child {
      border-bottom: none;
    }

    .metric-label {
      font-weight: 500;
      color: var(--sl-color-neutral-600);
    }

    .metric-value {
      font-weight: bold;
      color: var(--sl-color-primary-600);
    }

    .refresh-controls {
      display: flex;
      gap: 10px;
      align-items: center;
      margin-bottom: 20px;
      justify-content: center;
    }

    .markdown-content {
      background: var(--sl-color-neutral-50);
      border-radius: 4px;
      padding: 15px;
      margin-top: 10px;
    }

    zero-md {
      --zero-md-code-background: var(--sl-color-neutral-100);
    }

    .top-items-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .top-items-list li {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid var(--sl-color-neutral-100);
    }

    .top-items-list li:last-child {
      border-bottom: none;
    }

    .item-name {
      font-weight: 500;
      color: var(--sl-color-neutral-700);
    }

    .item-count {
      color: var(--sl-color-primary-600);
      font-weight: bold;
    }
  `;

  @consume({ context: albumsContext, subscribe: true })
  private albums!: Albums;

  @state() private usageSummary: UsageSummary | null = null;
  @state() private albumStats: AlbumStats | null = null;
  @state() private userActivity: UserActivity | null = null;
  @state() private loading = true;
  @state() private error: string | null = null;
  @state() private selectedDays = 7;

  async connectedCallback() {
    super.connectedCallback();
    await this.loadAnalyticsData();
  }

  private async loadAnalyticsData() {
    this.loading = true;
    this.error = null;

    try {
      // Load all analytics data in parallel
      const [usageSummary, albumStats, userActivity] = await Promise.all([
        get_json(`/auth/api/analytics/usage-summary?days=${this.selectedDays}`),
        get_json('/auth/api/analytics/album-stats'),
        get_json('/auth/api/analytics/user-activity')
      ]);

      this.usageSummary = usageSummary;
      this.albumStats = albumStats;
      this.userActivity = userActivity;
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Failed to load analytics data';
      console.error('Analytics loading error:', error);
    } finally {
      this.loading = false;
    }
  }

  private async handleDaysChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    this.selectedDays = parseInt(select.value);
    await this.loadAnalyticsData();
  }

  private async handleRefresh() {
    await this.loadAnalyticsData();
  }

  private getAlbumDisplayName(albumUuid: string): string {
    const album = this.albums?.[albumUuid];
    if (album) {
      return album.title || album.path || albumUuid;
    }
    return albumUuid;
  }

  private generateUsageSummaryMarkdown(): string {
    if (!this.usageSummary) return '';

    const { period_days, total_requests, unique_users, services_used, popular_albums, generated_at } = this.usageSummary;

    return `
# Usage Summary (${period_days} days)

**Generated:** ${new Date(generated_at).toLocaleString()}

## Overview
- **Total Requests:** ${total_requests.toLocaleString()}
- **Unique Users:** ${unique_users.toLocaleString()}

## Service Usage
${Object.entries(services_used).map(([service, count]) => 
  `- **${service}:** ${count.toLocaleString()} requests`
).join('\n')}

## Popular Albums
${Object.entries(popular_albums).slice(0, 10).map(([album, count]) =>
  `- **${this.getAlbumDisplayName(album)}:** ${count.toLocaleString()} accesses`
).join('\n')}
    `.trim();
  }

  private generateAlbumStatsMarkdown(): string {
    if (!this.albumStats) return '';

    const { album_stats, generated_at } = this.albumStats;
    const sortedAlbums = Object.entries(album_stats)
      .sort(([,a], [,b]) => b.total_accesses - a.total_accesses)
      .slice(0, 20);

    return `
# Album Statistics

**Generated:** ${new Date(generated_at).toLocaleString()}

## Top Albums by Access Count

${sortedAlbums.map(([albumId, stats]) => `
### ${this.getAlbumDisplayName(albumId)}
- **Total Accesses:** ${stats.total_accesses.toLocaleString()}
- **Unique Users:** ${stats.unique_users.toLocaleString()}
- **Last Accessed:** ${stats.last_accessed ? new Date(stats.last_accessed).toLocaleString() : 'Never'}
`).join('\n')}
    `.trim();
  }

  private generateUserActivityMarkdown(): string {
    if (!this.userActivity) return '';

    const { total_users, active_users_7d, top_users, generated_at } = this.userActivity;

    return `
# User Activity Analysis

**Generated:** ${new Date(generated_at).toLocaleString()}

## User Statistics
- **Total Users:** ${total_users.toLocaleString()}
- **Active Users (7 days):** ${active_users_7d.toLocaleString()}
- **Activity Rate:** ${total_users > 0 ? ((active_users_7d / total_users) * 100).toFixed(1) : 0}%

## Top Users by Activity

${top_users.slice(0, 10).map((user, index) => 
  `${index + 1}. **${user.user_id}** - ${user.total_requests.toLocaleString()} requests`
).join('\n')}
    `.trim();
  }

  render() {
    const analyticsContent = () => {
      if (this.loading) {
        return html`
          <div class="analytics-container">
            <div class="loading">
              <sl-spinner style="font-size: 2rem;"></sl-spinner>
              <p>Loading analytics data...</p>
            </div>
          </div>
        `;
      }

      if (this.error) {
        return html`
          <div class="analytics-container">
            <div class="error">
              <strong>Error loading analytics:</strong> ${this.error}
              <br><br>
              <sl-button variant="primary" @click=${this.handleRefresh}>
                <sl-icon name="arrow-clockwise" slot="prefix"></sl-icon>
                Retry
              </sl-button>
            </div>
          </div>
        `;
      }

      return html`
        <div class="analytics-container">
          <div class="analytics-header">
            <h1>Analytics Dashboard</h1>
            <p>Comprehensive usage statistics and insights for Photo Web</p>
          </div>

          <div class="refresh-controls">
            <sl-select
              value=${this.selectedDays}
              @sl-change=${this.handleDaysChange}
              size="small"
            >
              <sl-option value="1">Last 24 hours</sl-option>
              <sl-option value="7">Last 7 days</sl-option>
              <sl-option value="30">Last 30 days</sl-option>
              <sl-option value="90">Last 90 days</sl-option>
            </sl-select>
            
            <sl-button variant="default" size="small" @click=${this.handleRefresh}>
              <sl-icon name="arrow-clockwise" slot="prefix"></sl-icon>
              Refresh
            </sl-button>
          </div>

          <div class="analytics-grid">
            <!-- Usage Summary Card -->
            <div class="analytics-card">
              <h2>Usage Summary</h2>
              ${this.usageSummary ? html`
                <div class="metric-row">
                  <span class="metric-label">Total Requests</span>
                  <span class="metric-value">${this.usageSummary.total_requests.toLocaleString()}</span>
                </div>
                <div class="metric-row">
                  <span class="metric-label">Unique Users</span>
                  <span class="metric-value">${this.usageSummary.unique_users.toLocaleString()}</span>
                </div>
                <div class="metric-row">
                  <span class="metric-label">Period</span>
                  <span class="metric-value">${this.usageSummary.period_days} days</span>
                </div>
                <div class="markdown-content">
                  <zero-md>
                    <script type="text/markdown">${this.generateUsageSummaryMarkdown()}</script>
                  </zero-md>
                </div>
              ` : html`<p>No usage data available</p>`}
            </div>

            <!-- User Activity Card -->
            <div class="analytics-card">
              <h2>User Activity</h2>
              ${this.userActivity ? html`
                <div class="metric-row">
                  <span class="metric-label">Total Users</span>
                  <span class="metric-value">${this.userActivity.total_users.toLocaleString()}</span>
                </div>
                <div class="metric-row">
                  <span class="metric-label">Active Users (7d)</span>
                  <span class="metric-value">${this.userActivity.active_users_7d.toLocaleString()}</span>
                </div>
                <div class="metric-row">
                  <span class="metric-label">Activity Rate</span>
                  <span class="metric-value">
                    ${this.userActivity.total_users > 0 ?
                      ((this.userActivity.active_users_7d / this.userActivity.total_users) * 100).toFixed(1) : 0}%
                  </span>
                </div>
                <div class="markdown-content">
                  <zero-md>
                    <script type="text/markdown">${this.generateUserActivityMarkdown()}</script>
                  </zero-md>
                </div>
              ` : html`<p>No user activity data available</p>`}
            </div>
          </div>

          <!-- Album Statistics - Full Width -->
          <div class="analytics-card">
            <h2>Album Access Statistics</h2>
            ${this.albumStats ? html`
              <div class="markdown-content">
                <zero-md>
                  <script type="text/markdown">${this.generateAlbumStatsMarkdown()}</script>
                </zero-md>
              </div>
            ` : html`<p>No album statistics available</p>`}
          </div>
        </div>
      `;
    };

    return html`
      <pw-nav-page>
        ${analyticsContent()}
      </pw-nav-page>
    `;
  }
}