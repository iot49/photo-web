import { consume } from '@lit/context';
import { css, html, LitElement } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { albumsContext, srcsetInfoContext } from './app/context';
import { Albums, SrcsetInfo, AlbumModel } from './app/interfaces';

// BUG: after the speedtest finished, view switches to https://dev49.org/ui/album instead of staying.
@customElement('pw-img-size')
export class PwImgSize extends LitElement {
  private static readonly SPEED_TEST_COUNT = 10;
  static styles = css`
    :host {
      display: block;
      height: 100%;
      font-family: Arial, sans-serif;
    }

    .container {
      border: 2px solid #ccc;
      padding: 20px;
      margin: 20px;
      background: #f9f9f9;
      height: calc(100vh - 100px);
      overflow-y: auto;
    }

    .info {
      margin: 10px 0;
      font-size: 14px;
    }

    .dimensions {
      background: #e8f4f8;
      padding: 10px;
      border-radius: 4px;
      margin: 10px 0;
    }

    img {
      max-width: 100%;
      height: auto;
      border: 1px solid #ddd;
    }

    .sizes-table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      background: white;
    }

    .sizes-table th,
    .sizes-table td {
      border: 1px solid #ddd;
      padding: 8px;
      text-align: left;
    }

    .sizes-table th {
      background-color: #f2f2f2;
      font-weight: bold;
    }

    .sizes-table tr:nth-child(even) {
      background-color: #f9f9f9;
    }

    .current-size {
      background-color: #e8f4f8 !important;
      font-weight: bold;
    }

    .error {
      color: red;
      font-weight: bold;
    }
  `;

  @consume({ context: albumsContext, subscribe: true })
  private albums!: Albums;

  @consume({ context: srcsetInfoContext, subscribe: true })
  private srcsetInfo!: SrcsetInfo;

  @state()
  private containerWidth = 0;

  @state()
  private containerHeight = 0;

  @state()
  private currentImageSrc = '';

  @state()
  private currentImageWidth = 0;

  @state()
  private imageDimensions = new Map<number, { src: string; width: number; height: number }>();

  @state()
  private downloadStats = new Map<
    string,
    {
      suffix: string;
      size: number;
      times: number[];
      min: number;
      max: number;
      mean: number;
      completed: number;
      total: number;
    }
  >();

  @state()
  private isTestingDownloads = false;

  private resizeObserver?: ResizeObserver;
  private originalUrl?: string;

  override connectedCallback() {
    super.connectedCallback();
    this.setupResizeObserver();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.resizeObserver?.disconnect();
  }

  private setupResizeObserver() {
    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // Get hardware pixel dimensions
        this.containerWidth = Math.round(entry.contentRect.width * window.devicePixelRatio);
        this.containerHeight = Math.round(entry.contentRect.height * window.devicePixelRatio);
      }
    });
    this.resizeObserver.observe(this);
  }

  private findTargetAlbum(): AlbumModel | null {
    for (const album of Object.values(this.albums)) {
      if (album.path === 'Test' && album.title === 'Image Size') {
        return album;
      }
    }
    return null;
  }

  private handleImageLoad(event: Event) {
    const img = event.target as HTMLImageElement;
    this.currentImageSrc = img.currentSrc || img.src;
    this.currentImageWidth = img.naturalWidth;
  }

  private handleTestImageLoad(event: Event, targetWidth: number) {
    const img = event.target as HTMLImageElement;
    const currentSrc = img.currentSrc || img.src;
    const { suffix } = this.extractImageInfo(currentSrc);

    // Get the actual served image dimensions from srcset info
    let actualWidth: number;
    let actualHeight: number;

    if (suffix && this.srcsetInfo) {
      const sizes = (this.srcsetInfo as any).sizes;
      if (sizes && sizes[suffix]) {
        actualWidth = sizes[suffix].width;
        actualHeight = sizes[suffix].height;
      } else {
        // Fallback to natural dimensions if we can't find the size info
        actualWidth = img.naturalWidth;
        actualHeight = img.naturalHeight;
      }
    } else {
      // Original image (no suffix)
      const targetAlbum = this.findTargetAlbum();
      if (targetAlbum?.thumbnail) {
        actualWidth = targetAlbum.thumbnail.width || img.naturalWidth;
        actualHeight = targetAlbum.thumbnail.height || img.naturalHeight;
      } else {
        actualWidth = img.naturalWidth;
        actualHeight = img.naturalHeight;
      }
    }

    this.imageDimensions.set(targetWidth, {
      src: currentSrc,
      width: actualWidth,
      height: actualHeight,
    });
    this.requestUpdate();
  }

  private extractImageInfo(src: string): { suffix: string; width: string } {
    // Extract suffix and width from the current image source
    const match = src.match(/\/img([^?\s]*)/);
    const suffix = match ? match[1] : '';

    // Get width from srcset info based on the suffix
    let width: string;
    if (suffix && this.srcsetInfo) {
      const sizes = (this.srcsetInfo as any).sizes;
      if (sizes && sizes[suffix]) {
        width = sizes[suffix].width.toString();
      } else if (suffix === '') {
        // Original image (no suffix)
        const targetAlbum = this.findTargetAlbum();
        width = targetAlbum?.thumbnail?.width?.toString() || this.currentImageWidth.toString();
      } else {
        width = this.currentImageWidth.toString();
      }
    } else {
      width = this.currentImageWidth.toString();
    }

    return { suffix, width };
  }

  private renderSizesTable(targetAlbum: AlbumModel): any {
    if (!targetAlbum.thumbnail) return '';

    const sizes = (this.srcsetInfo as any).sizes;
    if (!sizes) return '';

    const currentSuffix = this.extractImageInfo(this.currentImageSrc).suffix;

    return html`
      <table class="sizes-table">
        <thead>
          <tr>
            <th>Image Suffix</th>
            <th>Width (pixels)</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(sizes).map(([suffix, sizeInfo]: [string, any]) => {
            const isCurrentSize = suffix === currentSuffix;
            return html`
              <tr class="${isCurrentSize ? 'current-size' : ''}">
                <td>img${suffix}</td>
                <td>${sizeInfo.width}</td>
                <td>${sizeInfo.description}</td>
              </tr>
            `;
          })}
          <tr class="${!currentSuffix ? 'current-size' : ''}">
            <td>img (original)</td>
            <td>${targetAlbum.thumbnail.width}</td>
            <td>Original image size</td>
          </tr>
        </tbody>
      </table>
    `;
  }

  private renderTestImages(targetAlbum: AlbumModel): any {
    if (!targetAlbum.thumbnail) {
      return html`<div class="error">No thumbnail available for test images</div>`;
    }

    const testWidths = [200, 400, 800, 1600, 3200];
    const originalSrcset = this.srcsetInfo.srcsetFor(targetAlbum.thumbnail);
    const srcset = originalSrcset.replace(/(\S+)(\s+\d+w)/g, '$1?test=true$2');

    return html`
      <div class="test-images">
        <h3>Test Images (4:3 Aspect Ratio)</h3>
        ${testWidths.map((width) => {
          const height = Math.round((width * 3) / 4); // 4:3 aspect ratio
          const dimensions = this.imageDimensions.get(width);

          return html`
            <div class="test-image-container" style="margin: 20px 0; border: 1px solid #ddd; padding: 10px;">
              <h4>Target: ${width} × ${height} pixels</h4>
              <div style="width: ${width}px; height: ${height}px; border: 2px solid #007bff; margin: 10px 0;">
                <img
                  style="width: 100%; height: 100%; object-fit: cover;"
                  src="/photos/api/photos/${targetAlbum.thumbnail!.uuid}/img-sm?test=true"
                  srcset="${srcset}"
                  sizes="${width}px"
                  alt="${targetAlbum.thumbnail!.title || 'Test image'} - ${width}px"
                  @load=${(e: Event) => this.handleTestImageLoad(e, width)}
                />
              </div>
              <div class="image-info" style="background: #f0f0f0; padding: 8px; font-size: 12px;">
                <div><strong>Target size:</strong> ${width} × ${height} pixels</div>
                ${dimensions
                  ? html`
                      <div><strong>Server returned:</strong> ${dimensions.width} pixels wide image</div>
                      <div><strong>Source file:</strong> ${dimensions.src.split('/').pop() || dimensions.src}</div>
                    `
                  : html`<div><em>Loading...</em></div>`}
              </div>
            </div>
          `;
        })}
      </div>
    `;
  }

  private async testDownloadSpeed(suffix: string, imageUrl: string, _size: number): Promise<number> {
    const startTime = performance.now();

    try {
      const response = await fetch(imageUrl + '&cache-bust=' + Math.random());
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      // Read the entire response to ensure complete download
      await response.blob();
      const endTime = performance.now();

      return endTime - startTime;
    } catch (error) {
      console.error(`Download test failed for ${suffix}:`, error);
      return -1; // Indicate failure
    }
  }

  private async runDownloadTests(targetAlbum: AlbumModel) {
    if (!targetAlbum.thumbnail || this.isTestingDownloads) return;

    // BUG FIX: Store original URL to prevent navigation during speed test
    this.originalUrl = window.location.href;

    this.isTestingDownloads = true;
    this.downloadStats.clear();

    const sizes = (this.srcsetInfo as any).sizes;
    const testCount = PwImgSize.SPEED_TEST_COUNT;

    // Test all suffixes including original (no suffix)
    const suffixesToTest = [
      { suffix: '', description: 'Original image', size: targetAlbum.thumbnail.width || 0 },
      ...Object.entries(sizes || {}).map(([suffix, sizeInfo]: [string, any]) => ({
        suffix,
        description: sizeInfo.description,
        size: sizeInfo.width,
      })),
    ];

    for (const { suffix, size } of suffixesToTest) {
      const imageUrl = `/photos/api/photos/${targetAlbum.thumbnail.uuid}/img${suffix}?test=false`;
      const times: number[] = [];

      // Initialize stats for this suffix
      this.downloadStats.set(suffix, {
        suffix,
        size,
        times: [],
        min: 0,
        max: 0,
        mean: 0,
        completed: 0,
        total: testCount,
      });
      this.requestUpdate();

      // Run multiple download tests
      for (let i = 0; i < testCount; i++) {
        const downloadTime = await this.testDownloadSpeed(suffix, imageUrl, size);

        if (downloadTime > 0) {
          times.push(downloadTime);
        }

        // Update progress
        const stats = this.downloadStats.get(suffix)!;
        stats.completed = i + 1;
        stats.times = [...times];

        if (times.length > 0) {
          stats.min = Math.min(...times);
          stats.max = Math.max(...times);
          stats.mean = times.reduce((sum, time) => sum + time, 0) / times.length;
        }

        this.requestUpdate();

        // Small delay between requests to avoid overwhelming the server
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    this.isTestingDownloads = false;
    this.requestUpdate();

    // BUG FIX: Prevent potential navigation after speed test completion
    // Ensure we stay on the current page by preventing any default navigation behavior
    if (typeof window !== 'undefined' && window.history && this.originalUrl) {
      // Force the current URL to remain stable
      setTimeout(() => {
        if (window.location.href !== this.originalUrl) {
          console.warn('Detected unwanted navigation after speed test, restoring original URL');
          window.history.replaceState(null, '', this.originalUrl);
        }
      }, 100);
    }
  }

  private renderDownloadStatsTable(): any {
    if (this.downloadStats.size === 0) {
      return '';
    }

    return html`
      <div style="margin: 20px 0;">
        <h3>Download Speed Test Results</h3>
        <p style="font-size: 14px; color: #666;">
          Each suffix tested with ${PwImgSize.SPEED_TEST_COUNT} downloads. Times shown in milliseconds.
          ${this.isTestingDownloads ? html`<strong style="color: #007bff;">Testing in progress...</strong>` : ''}
        </p>
        <table class="sizes-table">
          <thead>
            <tr>
              <th>Image Suffix</th>
              <th>Size (pixels)</th>
              <th>Progress</th>
              <th>Min Time (ms)</th>
              <th>Max Time (ms)</th>
              <th>Mean Time (ms)</th>
              <th>Download Rate (MB/s)</th>
            </tr>
          </thead>
          <tbody>
            ${Array.from(this.downloadStats.entries()).map(([suffix, stats]) => {
              const displaySuffix = suffix === '' ? 'img (original)' : `img${suffix}`;
              const progressPercent = (stats.completed / stats.total) * 100;
              const estimatedSizeKB = (stats.size * stats.size * 3) / 1024; // Rough estimate for JPEG
              const downloadRateMBps = stats.mean > 0 ? estimatedSizeKB / 1024 / (stats.mean / 1000) : 0;

              return html`
                <tr>
                  <td>${displaySuffix}</td>
                  <td>${stats.size}</td>
                  <td>
                    <div style="background: #f0f0f0; border-radius: 4px; overflow: hidden;">
                      <div style="background: #007bff; height: 20px; width: ${progressPercent}%; transition: width 0.3s;"></div>
                    </div>
                    ${stats.completed}/${stats.total}
                  </td>
                  <td>${stats.times.length > 0 ? stats.min.toFixed(1) : '-'}</td>
                  <td>${stats.times.length > 0 ? stats.max.toFixed(1) : '-'}</td>
                  <td>${stats.times.length > 0 ? stats.mean.toFixed(1) : '-'}</td>
                  <td>${downloadRateMBps > 0 ? downloadRateMBps.toFixed(2) : '-'}</td>
                </tr>
              `;
            })}
          </tbody>
        </table>
      </div>
    `;
  }

  override render() {
    const targetAlbum = this.findTargetAlbum();

    if (!targetAlbum) {
      return html` <div class="error">Album not found: Looking for album with path "Test" and title "Image Size"</div> `;
    }

    if (!targetAlbum.thumbnail) {
      return html` <div class="error">No thumbnail found in album "${targetAlbum.title}"</div> `;
    }

    const originalSrcset = this.srcsetInfo.srcsetFor(targetAlbum.thumbnail);
    const srcset = originalSrcset.replace(/(\S+)(\s+\d+w)/g, '$1?test=true$2');
    const { width } = this.extractImageInfo(this.currentImageSrc);

    return html`
      <pw-nav-page>
        <div class="container">
          <h2>Image Size Test</h2>

          <div style="margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 4px;">
            <h3>Download Speed Test</h3>
            <p style="margin: 10px 0; font-size: 14px;">
              Test download speeds for all available image sizes. Each size will be downloaded multiple times
              to calculate min, max, and average download times.
            </p>
            <button
              style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;"
              ?disabled=${this.isTestingDownloads}
              @click=${() => this.runDownloadTests(targetAlbum)}
            >
              ${this.isTestingDownloads ? 'Testing in Progress...' : 'Start Download Speed Test'}
            </button>
          </div>

          ${this.renderDownloadStatsTable()}

          ${this.renderTestImages(targetAlbum)}

          <div class="info">
            <strong>Image Size Test for album:</strong> ${targetAlbum.title} at path ${targetAlbum.path}. </br>
            <strong>Note: </strong>scaling up (small window to big) works, but reducing window size will not load 
            a smaller image unless the view is refreshed.
          </div>
          
          <div class="dimensions">
            <div><strong>Container (hardware pixels):</strong> ${this.containerWidth} × ${this.containerHeight}</div>
            <div><strong>Current image width:</strong> ${width} pixels</div>
            <div><strong>Current source:</strong> ${this.currentImageSrc.split('/').pop() || this.currentImageSrc}</div>
          </div>
          
          <img
            src="/photos/api/photos/${targetAlbum.thumbnail.uuid}/img-sm?test=true"
            srcset="${srcset}"
            sizes="100vw"
            alt="${targetAlbum.thumbnail.title || 'Test image'}"
            @load=${this.handleImageLoad}
          />
          
          <h3>Available Image Sizes</h3>
          ${this.renderSizesTable(targetAlbum)}
          
          <div class="info">
            <strong>Resize the window to see the browser choose different image sizes.</strong>
            The currently selected size is highlighted in the table above. Also seems to prefer largest size -
            perhaps it's available anyway from one of the images below this test. 
            Should split test over two different pages.
          </div>

        </div>
      </pw-nav-page>
    `;
  }
}
