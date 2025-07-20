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

  override async connectedCallback(): Promise<void> {
    await super.connectedCallback();
    this.photos = await get_json(`/photos/api/albums/${this.uuid}`);
    console.log('Loaded photos:', this.photos);
  }

  private generateSrcset(photoUuid: string): string {
    if (!this.srcsetInfo || this.srcsetInfo.length === 0) {
      return '';
    }
    
    // Include all scaled versions from srcsetInfo
    const scaledSources = this.srcsetInfo
      .map(size => `/photos/api/photos/${photoUuid}/img${size.suffix} ${size.width}w`);
    
    // Add the unscaled image endpoint (no suffix) as the highest resolution option
    scaledSources.push(`/photos/api/photos/${photoUuid}/img`);
    
    return scaledSources.join(', ');
  }

  override render() {
    if (this.photos.length == null) {
      return html`
        <div class="loading">
          <sl-spinner></sl-spinner>
          <p>Loading photos...</p>
        </div>
      `;
    }

    return html`
      <sl-carousel pagination navigation mouse-dragging loop>
        ${this.photos.map(
          (photo) => html`
            <sl-carousel-item>
              <img
                src=${`/photos/api/photos/${photo.uuid}/img`}
                srcset=${this.generateSrcset(photo.uuid)}
                sizes="100vw"
                alt="${photo.title || 'Photo'}"
                loading="lazy"
              />
              ${photo.title || photo.description
                ? html`
                    <div class="photo-info">
                      ${photo.title ? html`<h3>${photo.title}</h3>` : ''} ${photo.description ? html`<p>${photo.description}</p>` : ''}
                    </div>
                  `
                : ''}
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
        height: 100vh;
        min-height: 100vh;
        padding: 2rem;
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
        width: min(90vw, calc((100vh - 4rem) * 4/3));
        height: min(90vh - 4rem, calc(90vw * 3/4));
        max-height: calc(100vh - 4rem);
        max-width: calc(100vw - 4rem);
        display: block;
        flex-shrink: 0;
      }

      .photo-info {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
        color: white;
        padding: 2rem 1rem 1rem;
        border-radius: 0 0 var(--sl-border-radius-medium) var(--sl-border-radius-medium);
      }

      .photo-info h3 {
        margin: 0 0 0.5rem 0;
        font-size: 1.2rem;
        font-weight: 600;
      }

      .photo-info p {
        margin: 0;
        font-size: 0.9rem;
        opacity: 0.9;
      }

      /* Dark theme adjustments */
      :host([theme='dark']) sl-carousel-item {
        background: var(--sl-color-neutral-900);
      }
    `,
  ];
}

/*
<img 
    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 70vw" 
    loading="lazy" 
    src="/photos/api/photos/AB5676CD-20B6-4D22-A8D0-B8FD5A71244F/img" 
    srcset="
        /photos/api/photos/AB5676CD-20B6-4D22-A8D0-B8FD5A71244F/img-thumb 200w, 
        /photos/api/photos/AB5676CD-20B6-4D22-A8D0-B8FD5A71244F/img-sm 480w, 
        /photos/api/photos/AB5676CD-20B6-4D22-A8D0-B8FD5A71244F/img-md 768w, 
        /photos/api/photos/AB5676CD-20B6-4D22-A8D0-B8FD5A71244F/img-lg 1024w, 
        /photos/api/photos/AB5676CD-20B6-4D22-A8D0-B8FD5A71244F/img-xl 1440w, 
        /photos/api/photos/AB5676CD-20B6-4D22-A8D0-B8FD5A71244F/img-xxl 1920w" 
alt="Photo">
*/