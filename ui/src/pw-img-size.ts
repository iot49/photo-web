import { consume } from '@lit/context';
import { css, html, LitElement } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { albumsContext, srcsetInfoContext } from './app/context';
import { Albums, SrcsetInfo, AlbumModel } from './app/interfaces';


@customElement('pw-img-size')
export class PwImgSize extends LitElement {
  static styles = css`
    :host {
      display: block;
      padding: 20px;
      font-family: Arial, sans-serif;
    }
    
    .container {
      border: 2px solid #ccc;
      padding: 20px;
      margin: 20px 0;
      background: #f9f9f9;
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

  private resizeObserver?: ResizeObserver;

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

  override render() {
    const targetAlbum = this.findTargetAlbum();
    
    if (!targetAlbum) {
      return html`
        <div class="error">
          Album not found: Looking for album with path "Test" and title "Image Size"
        </div>
      `;
    }

    if (!targetAlbum.thumbnail) {
      return html`
        <div class="error">
          No thumbnail found in album "${targetAlbum.title}"
        </div>
      `;
    }

    const originalSrcset = this.srcsetInfo.srcsetFor(targetAlbum.thumbnail);
    const srcset = originalSrcset.replace(/(\S+)(\s+\d+w)/g, '$1?test=true$2');
    const { width } = this.extractImageInfo(this.currentImageSrc);

    return html`
      <div class="container">
        <h2>Image Size Test</h2>
        <div class="info">
          <strong>Image Size Test for album:</strong> ${targetAlbum.title} at path ${targetAlbum.path}.
          <strong>Note: </strong>scaling up (small window to big) works, but reducing window size will not load a smaller image.
          Also, it may be necessary to clear the cache and delete browsing data.
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
          The currently selected size is highlighted in the table above.
        </div>
      </div>
    `;
  }
}
