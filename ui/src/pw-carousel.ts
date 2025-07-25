import { html, LitElement, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { get_json } from './app/api';
import { PhotoModel, SrcsetInfo } from './app/interfaces';
import { consume } from '@lit/context';
import { srcsetInfoContext } from './app/context';

@customElement('pw-carousel')
export class PwCarousel extends LitElement {
  // uid of album to display
  @property({ type: String }) uuid = '';

  @consume({ context: srcsetInfoContext, subscribe: true })
  private srcsetInfo!: SrcsetInfo;

  @state() private photos!: PhotoModel[];


  override async updated(changedProperties: Map<string | number | symbol, unknown>) {
    super.updated(changedProperties);

    // Reload photos when uuid changes
    if (changedProperties.has('uuid') && this.uuid) {
      await this.loadPhotos();
    }
  }

  private async loadPhotos(): Promise<void> {
    if (!this.uuid) {
      this.photos = [];
      return;
    }

    try {
      this.photos = await get_json(`/photos/api/albums/${this.uuid}`);
      // console.log('Loaded photos for album:', this.uuid, this.photos);
    } catch (error) {
      console.error('Failed to load photos for album:', this.uuid, error);
      this.photos = [];
    }
  }

  private generateSrcset(photoUuid: string): string {
    if (!this.srcsetInfo || this.srcsetInfo.length === 0) {
      return '';
    }

    // Include all scaled versions from srcsetInfo
    const scaledSources = this.srcsetInfo.map((size) => `/photos/api/photos/${photoUuid}/img${size.suffix} ${size.width}w`);

    // Add the unscaled image endpoint (no suffix) as the highest resolution option
    scaledSources.push(`/photos/api/photos/${photoUuid}/img`);

    return scaledSources.join(', ');
  }

  private isVideo(mimeType: string): boolean {
    return mimeType.startsWith('video/');
  }

  override render() {
    if (this.photos?.length == null) {
      return html`
        <div class="loading">
          <sl-spinner></sl-spinner>
          <p>Loading photos...</p>
        </div>
      `;
    }

    return html`
      <sl-carousel navigation mouse-dragging loop ?pagination=${this.photos.length<20}>
        ${this.photos.map(
          (photo) => html`
            <sl-carousel-item>
              ${this.isVideo(photo.mime_type)
                ? html`
                    <!-- optionally add muted -->
                    <video src=${`/photos/api/photos/${photo.uuid}/img`} controls autoplay muted preload="metadata" title="${photo.title || 'Video'}">
                      Your browser does not support the video tag.
                    </video>
                  `
                : html`
                    <img
                      src=${`/photos/api/photos/${photo.uuid}/img`}
                      srcset=${this.generateSrcset(photo.uuid)}
                      sizes="100vw"
                      alt="${photo.title || 'Photo'}"
                      loading="lazy"
                    />
                  `}
            </sl-carousel-item>
          `
        )}
      </sl-carousel>
    `;
  }



  static styles = [
    css`
      :host {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: calc(100vh - 20px);
        box-sizing: border-box;
      }

      .loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 400px;
        gap: 1rem;
      }

      sl-carousel {
        --aspect-ratio: 4/3;
        aspect-ratio: 4/3;
        width: min(90vw, calc((100vh - 4rem) * 4 / 3));
        height: min(90vh - 4rem, calc(90vw * 3 / 4));
        max-height: calc(100vh - 4rem);
        max-width: calc(100vw - 4rem);
        display: block;
        flex-shrink: 0;
      }

      sl-carousel-item img,
      sl-carousel-item video {
        width: 100%;
        height: 100%;
        object-fit: contain;
        display: block;
      }

      /* Dark theme adjustments */
      :host([theme='dark']) sl-carousel-item {
        background: var(--sl-color-neutral-900);
      }
    `,
  ];
}
