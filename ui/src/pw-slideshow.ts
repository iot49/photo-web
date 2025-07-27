import { html, LitElement, css, PropertyValues } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';

import { get_json } from './app/api';
import { Albums, PhotoModel, SrcsetInfo } from './app/interfaces';
import { consume } from '@lit/context';
import { albumsContext, srcsetInfoContext } from './app/context';

@customElement('pw-slideshow')
export class PwSlideshow extends LitElement {
  @consume({ context: albumsContext, subscribe: true })
  private albums!: Albums;

  @consume({ context: srcsetInfoContext, subscribe: true })
  private srcsetInfo!: SrcsetInfo;

  @query('#slideshow') slideshow!: HTMLDivElement;

  // colon-separated uid's of albums to display
  @property({ type: String }) playlist = '';

  // autoplay status
  @property({ type: Boolean }) autoplay = false;

  // List of arrays of PhotoModels for each album
  @state() private photos!: PhotoModel[][];

  // Index into #slideshow.children: slide-wrapper
  @state() currentIndex = 0;

  // playlist to array of album uid's
  private get uids(): string[] {
    return this.playlist.split(':');
  }

  // load descriptions of all photos in all albums in the playlist
  private async loadPhotos(): Promise<void> {
    const photos: PhotoModel[][] = [];
    for (const uid of this.uids) {
      try {
        photos.push(await get_json(`/photos/api/albums/${uid}`));
      } catch (error) {
        console.error('Failed to load photos for album:', uid, error);
        this.photos = [];
      }
    }
    this.photos = photos;
  }

  async connectedCallback() {
    super.connectedCallback();
    await this.loadPhotos();
  }

  protected firstUpdated(_changedProperties: PropertyValues): void {
    super.firstUpdated(_changedProperties);
    this.goto(0);
  }

  private goto = (nextIndex: number) => {
    /* transition from showing slide at `this.currentIndex` to at `nextIndex`.
    */
    if (this.slideshow == null) {
      console.log('slides array not yet rendered');
      setTimeout(() => this.goto(nextIndex), 300);
      return;
    }
    const slides = this.slideshow?.children as unknown as HTMLElement[];

    const N = slides.length;
    if (N === 0) return;
    
    nextIndex = ((nextIndex % N) + N) % N;
    
    // Special case: when going backwards from first slide (currentIndex=0),
    // go to the second-to-last slide (N-2) instead of last slide (N-1)
    // This avoids the problematic last slide that appears black
    if (this.currentIndex === 0 && nextIndex === N - 1) {
      nextIndex = N - 2;
    }
    
    // First, hide all slides
    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i] as HTMLElement;
      slide.style.setProperty('opacity', '0', 'important');
      slide.style.setProperty('z-index', '1', 'important');
    }
    
    // Then show only the target slide
    const targetSlide = slides[nextIndex] as HTMLElement;
    if (targetSlide) {
      targetSlide.style.setProperty('opacity', '1', 'important');
      targetSlide.style.setProperty('z-index', '2', 'important');
      targetSlide.style.setProperty('display', 'flex', 'important');
    }
    
    // Update current index
    this.currentIndex = nextIndex;
    
    
    // Only schedule next transition if autoplay is enabled
    if (this.autoplay) {
      setTimeout(() => this.goto(nextIndex+1), 2000);
    }
  };

  override render() {
    // wait for photo info to load
    if (this.photos == null) {
      return html`
        <div class="loading">
          <sl-spinner></sl-spinner>
          <p>Loading photos...</p>
        </div>
      `;
    }

    // render each album with a title followed by the photos
    return html`
      <div id="slideshow">
        ${this.uids.map((uid, albumIndex) => {
          const albumPhotos = this.photos[albumIndex] || [];
          return html`
            <div class="slide-wrapper">
              <div class="title"><p>${this.albums[uid]?.title || `Album ${uid}`}</p></div>
            </div>
            ${albumPhotos.map((photo) => html`
              <div class="slide-wrapper">
                ${this.photoTemplate(photo)}
              </div>
            `)}
          `;
        })}
      </div>
      <div class="overlay prev-slide" @click=${() => this.goto(this.currentIndex-1)}></div>
      <div class="overlay next-slide" @click=${() => this.goto(this.currentIndex+1)}></div>
    `;
  }

  private photoTemplate(photo: PhotoModel) {
    const mime_type = photo.mime_type;
    const uri = `/photos/api/photos/${photo.uuid}/img`;
    if (mime_type.startsWith('image')) {
      return html` <img src=${uri} srcset=${this.generateSrcset(photo.uuid)} sizes="100vw" alt="${photo.title || 'Photo'}" loading="lazy" />`;
    } else if (mime_type.startsWith('video')) {
      return html`
        <!-- optionally add muted -->
        <video src=${uri} controls autoplay muted preload="metadata" title="${photo.title || 'Video'}">
          Your browser does not support the video tag.
        </video>
      `;
    } else {
      return html`No renderer for MIME type ${mime_type}`;
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

  static styles = [
    css`
      :host {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100vw;
        height: 100vh;
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

      #slideshow {
        position: relative;
        width: 100%;
        height: 100%;
        background: black;
      }
      
      .slide-wrapper {
        position: absolute;
        width: 100%;
        height: 100%;
        opacity: 0;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .slide-wrapper img,
      .slide-wrapper video {
        width: 100%;
        height: 100%;
        object-fit: contain;
        object-position: 50% 50%;
        z-index: 0;
      }

      .overlay {
        position: absolute;
        transform: translateY(-50%);
        top: 50%;
        width: 25%;
        height: 30%;
        background: transparent;
        z-index: 100;
        cursor: pointer;
        border: 2px solid yellow;
      }

      .prev-slide {
        left: 0%;
      }
      .next-slide {
        right: 0%;
      }

      .title {
        color: white;
        font-size: 2rem;
        text-align: center;
        background: rgba(0, 0, 0, 0.7);
        padding: 1rem 2rem;
        border-radius: 8px;
      }

    `,
  ];
}
