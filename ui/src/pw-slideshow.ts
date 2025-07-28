import { html, LitElement, css, PropertyValues, nothing } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';

import { get_json } from './app/api';
import { Albums, PhotoModel, SrcsetInfo } from './app/interfaces';
import { consume } from '@lit/context';
import { albumsContext, srcsetInfoContext } from './app/context';

/*
Themes:
@property theme switches between different versions of css classes .last and .next
to achieve alternate behaviors.

**plain**: No animations when transistioning between slides.
**ken-burns**: Animate transition opacity, translate image position in viewport, scale image
*/

const TRANSITION_MS = 2000; // duration of slide transition in [ms]
const SLIDE_MS = 5000; // time each slide is shown in [ms]; note: extra wide or tall slides take more time
const PANORAMA_TIME = 5; // increase parnorama image animation time by up to this factor
const SCALE_FACTOR = 1.2; // factor by which the image is scaled during translation

@customElement('pw-slideshow')
export class PwSlideshow extends LitElement {
  @consume({ context: albumsContext, subscribe: true })
  private albums!: Albums;

  @consume({ context: srcsetInfoContext, subscribe: true })
  private srcsetInfo!: SrcsetInfo;

  @query('#slideshow') slideshow!: HTMLDivElement;

  // colon-separated uid's of albums to display
  @property({ type: String }) playlist = '';

  // css theme
  @property({ type: String, reflect: true }) theme: 'plain' | 'ken-burns' = 'ken-burns';

  // autoplay status
  @property({ type: Boolean }) autoplay = true;

  // List of arrays of PhotoModels for each album
  @state() private photos!: PhotoModel[][];

  // Index into #slideshow.children: slide-wrapper
  @state() currentIndex = 0;

  // Timeout ID for autoplay scheduling
  private autoplayTimeoutId: number | null = null;

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
        console.error(`Failed to load photos for album: {uid}, trying again`, error);
        setTimeout(() => {
          this.loadPhotos();
        }, 1000);
        return;
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
      setTimeout(() => this.goto(nextIndex), 300);
      return;
    }
    const slides = this.slideshow?.children as unknown as HTMLElement[];

    const N = slides.length;
    if (N === 0) {
      console.log(`Empty playlist ${this.playlist}`);
      return;
    }

    nextIndex = ((nextIndex % N) + N) % N;
    // console.log(`N = ${N} curr = ${this.currentIndex} next = ${nextIndex}`, slides[nextIndex]);

    // hide all slides
    for (let i = 0; i < slides.length; i++) {
      // don't touch current slide for smooth ken-burns transitions
      if (i === this.currentIndex) continue;
      const slide = slides[i] as HTMLElement;
      slide.classList.remove('last');
      slide.classList.remove('next');
    }

    // then show last and next slide with selected theme
    // note: slides[this.currentIndex] retains class .next otherwise ken-burns transition will not be smooth
    slides[this.currentIndex].classList.add('last');
    slides[nextIndex].classList.add('next');

    // Get dynamic slide time from pre-calculated CSS custom property
    const nextSlide = slides[nextIndex];
    const imgElement = nextSlide.querySelector('img') as HTMLElement;
    let dynamicTimeFactor = 1.0; // default fallback

    if (imgElement) {
      const customProperty = getComputedStyle(imgElement).getPropertyValue('--data-dynamic-time-factor');
      if (customProperty) dynamicTimeFactor = parseFloat(customProperty) || 1.0;
    }

    const dynamicSlideMs = SLIDE_MS * dynamicTimeFactor;

    // Set dynamic animation duration for ken-burns theme
    if (this.theme === 'ken-burns' && imgElement) {
      imgElement.style.animationDuration = `${dynamicSlideMs}ms`;
    }

    // Update current index
    this.currentIndex = nextIndex;

    // Only schedule next transition if autoplay is enabled
    if (this.autoplay) {
      if (this.currentIndex + 1 >= N) {
        // We've reached the last slide ("The End"), stop autoplay and navigate away after showing it
        this.autoplay = false;
        this.autoplayTimeoutId = window.setTimeout(() => {
          window.location.href = '/ui/album';
        }, SLIDE_MS);
      } else {
        this.autoplayTimeoutId = window.setTimeout(() => this.goto(nextIndex + 1), dynamicSlideMs - TRANSITION_MS);
      }
    }
  };

  private toggleAutoplay() {
    // Cancel any pending autoplay timeout
    if (this.autoplayTimeoutId !== null) {
      clearTimeout(this.autoplayTimeoutId);
      this.autoplayTimeoutId = null;
    }

    this.autoplay = !this.autoplay;

    if (this.autoplay) {
      // Restart autoplay with ken-burns theme
      this.theme = 'ken-burns';

      // Get the current slide to calculate dynamic timing
      const slides = this.slideshow?.children as unknown as HTMLElement[];
      if (slides && slides.length > 0) {
        const currentSlide = slides[this.currentIndex];
        const imgElement = currentSlide?.querySelector('img') as HTMLElement;
        let dynamicTimeFactor = 1.0;

        if (imgElement) {
          const customProperty = getComputedStyle(imgElement).getPropertyValue('--data-dynamic-time-factor');
          if (customProperty) dynamicTimeFactor = parseFloat(customProperty) || 1.0;
        }

        const dynamicSlideMs = SLIDE_MS * dynamicTimeFactor;

        // Schedule next slide transition
        this.autoplayTimeoutId = window.setTimeout(() => this.goto(this.currentIndex + 1), dynamicSlideMs - TRANSITION_MS);
      }
    } else {
      // Stop autoplay and switch to plain theme for immediate transitions
      this.theme = 'plain';
    }
  }

  private handlePrevClick() {
    // Cancel any pending autoplay timeout
    if (this.autoplayTimeoutId !== null) {
      clearTimeout(this.autoplayTimeoutId);
      this.autoplayTimeoutId = null;
    }
    this.goto(this.currentIndex - 1);
  }

  private handleNextClick() {
    // Cancel any pending autoplay timeout
    if (this.autoplayTimeoutId !== null) {
      clearTimeout(this.autoplayTimeoutId);
      this.autoplayTimeoutId = null;
    }
    this.goto(this.currentIndex + 1);
  }

  private endSlideshow() {
    if (this.autoplayTimeoutId !== null) {
      clearTimeout(this.autoplayTimeoutId);
      this.autoplayTimeoutId = null;
    }
    window.location.href = '/ui/album';
  }

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
            ${albumPhotos.map((photo) => html` <div class="slide-wrapper">${this.photoTemplate(photo)}</div> `)}
          `;
        })}
        <div class="slide-wrapper">
          <div class="title"><p>The End</p></div>
        </div>
      </div>
      <div class="overlay prev-overlay" @click=${() => this.handlePrevClick()}></div>
      <div class="overlay next-overlay" @click=${() => this.handleNextClick()}></div>
      <div class="overlay center-overlay" @click=${() => this.toggleAutoplay()}></div>
      <div class="overlay top-overlay" @click=${() => this.endSlideshow()}></div>
      <div class="overlay bottom-overlay" @click=${() => console.log('implement an action for bottom clicks')}></div>
    `;
  }

  private photoTemplate(photo: PhotoModel) {
    const mime_type = photo.mime_type;
    const uri = `/photos/api/photos/${photo.uuid}/img`;
    if (mime_type.startsWith('image')) {
      if (mime_type === 'image/x-adobe-dng') {
        console.log(`No renderer for MIME type ${mime_type}`);
        return nothing;
      }

      // Detect panoramic images (aspect ratio > 2:1 or < 1:2)
      const isPanoramic = photo.width && photo.height && (photo.width / photo.height > 2 || photo.height / photo.width > 2);

      // Calculate scale factor for sizes attribute to force browser to choose sufficiently high resolution for panoramic images
      let scaleFactor = 1.0;
      if (this.theme === 'ken-burns') {
        scaleFactor = isPanoramic ? 2.0 : SCALE_FACTOR;
      }
      const sizes = `${Math.round(100 * scaleFactor)}vw`;

      // Calculate dynamic slide time factor and store as CSS custom property
      const dynamicTimeFactor = this.calculateDynamicSlideTimeFactorForPhoto(photo);
      const style = `--data-dynamic-time-factor: ${dynamicTimeFactor}`;

      return html` <img
        src=${uri}
        srcset=${this.generateSrcset(photo.uuid)}
        sizes="${sizes}"
        alt="${photo.title || 'Photo'}"
        loading="lazy"
        style="${style}"
      />`;
    } else if (mime_type.startsWith('video')) {
      return html`
        <!-- optionally add muted -->
        <video src=${uri} controls autoplay muted preload="metadata" title="${photo.title || 'Video'}">
          Your browser does not support the video tag.
        </video>
      `;
    } else {
      console.log(`No renderer for MIME type ${mime_type}`);
      return nothing;
    }
  }

  private generateSrcset(photoUuid: string): string {
    if (!this.srcsetInfo || this.srcsetInfo.length === 0) {
      return '';
    }

    // Filter out very small resolutions for ken-burns theme to ensure adequate quality
    const minWidth = this.theme === 'ken-burns' ? 1200 : 400;
    const filteredSizes = this.srcsetInfo.filter((size) => size.width >= minWidth);

    // Include filtered scaled versions from srcsetInfo
    const scaledSources = filteredSizes.map((size) => `/photos/api/photos/${photoUuid}/img${size.suffix} ${size.width}w`);

    // Add the unscaled image endpoint (no suffix) as the highest resolution option
    scaledSources.push(`/photos/api/photos/${photoUuid}/img`);

    return scaledSources.join(', ');
  }

  /**
   * Calculate dynamic slide timing factor for a specific photo
   */
  private calculateDynamicSlideTimeFactorForPhoto(photo: PhotoModel): number {
    if (!photo || !photo.width || !photo.height) {
      return 1.0; // fallback to default timing factor
    }

    // Calculate image aspect ratios
    const widthToHeight = photo.width / photo.height;
    const heightToWidth = photo.height / photo.width;
    const maxAspectRatio = Math.max(widthToHeight, heightToWidth);

    return Math.tanh(maxAspectRatio / PANORAMA_TIME) / Math.tanh(1 / PANORAMA_TIME);
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
        /* BUG: scrollbars show despite overflow hidden */
        overflow: hidden;
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

      /* Plain theme: instant transitions */
      :host([theme='plain']) .next {
        opacity: 1;
        z-index: 2;
      }

      :host([theme='plain']) .last {
        opacity: 0 !important;
        z-index: 1;
      }

      /* Ken Burns theme: opacity, translation, scaling */

      @keyframes ken-burns-fade {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }

      @keyframes ken-burns-pan-1 {
        from {
          object-position: top left;
        }
        to {
          object-position: bottom right;
        }
      }

      @keyframes ken-burns-pan-2 {
        from {
          object-position: bottom right;
        }
        to {
          object-position: top left;
        }
      }

      @keyframes ken-burns-pan-3 {
        from {
          object-position: bottom left;
        }
        to {
          object-position: top right;
        }
      }

      @keyframes ken-burns-pan-4 {
        from {
          object-position: top right;
        }
        to {
          object-position: bottom left;
        }
      }

      @keyframes ken-burns-scale {
        from {
          transform: scale(1);
        }
        to {
          transform: scale(${SCALE_FACTOR});
        }
      }

      /* Ken Burns theme: fade in + slow zoom/pan */
      :host([theme='ken-burns']) .last {
        opacity: 1;
        z-index: 1;
      }

      :host([theme='ken-burns']) .next {
        opacity: 0;
        z-index: 2;
        animation-name: ken-burns-fade;
        animation-duration: ${TRANSITION_MS}ms;
        animation-fill-mode: forwards;
        animation-timing-function: linear;
      }

      :host([theme='ken-burns']) .slide-wrapper img,
      :host([theme='ken-burns']) .slide-wrapper video {
        object-fit: cover;
      }

      /* Position-dependent starting positions and animations */
      :host([theme='ken-burns']) .slide-wrapper:nth-child(4n + 1) img,
      :host([theme='ken-burns']) .slide-wrapper:nth-child(4n + 1) video {
        object-position: top left;
      }

      :host([theme='ken-burns']) .slide-wrapper:nth-child(4n + 2) img,
      :host([theme='ken-burns']) .slide-wrapper:nth-child(4n + 2) video {
        object-position: bottom right;
      }

      :host([theme='ken-burns']) .slide-wrapper:nth-child(4n + 3) img,
      :host([theme='ken-burns']) .slide-wrapper:nth-child(4n + 3) video {
        object-position: bottom left;
      }

      :host([theme='ken-burns']) .slide-wrapper:nth-child(4n + 4) img,
      :host([theme='ken-burns']) .slide-wrapper:nth-child(4n + 4) video {
        object-position: top right;
      }

      /* Position-dependent animations for active slides */
      :host([theme='ken-burns']) .next:nth-child(4n + 1) img,
      :host([theme='ken-burns']) .next:nth-child(4n + 1) video {
        animation-name: ken-burns-pan-1, ken-burns-scale;
        animation-fill-mode: forwards;
        animation-timing-function: linear;
        /* animation-duration set dynamically via JavaScript */
      }

      :host([theme='ken-burns']) .next:nth-child(4n + 2) img,
      :host([theme='ken-burns']) .next:nth-child(4n + 2) video {
        animation-name: ken-burns-pan-2, ken-burns-scale;
        animation-fill-mode: forwards;
        animation-timing-function: linear;
        /* animation-duration set dynamically via JavaScript */
      }

      :host([theme='ken-burns']) .next:nth-child(4n + 3) img,
      :host([theme='ken-burns']) .next:nth-child(4n + 3) video {
        animation-name: ken-burns-pan-3, ken-burns-scale;
        animation-fill-mode: forwards;
        animation-timing-function: linear;
        /* animation-duration set dynamically via JavaScript */
      }

      :host([theme='ken-burns']) .next:nth-child(4n + 4) img,
      :host([theme='ken-burns']) .next:nth-child(4n + 4) video {
        animation-name: ken-burns-pan-4, ken-burns-scale;
        animation-fill-mode: forwards;
        animation-timing-function: linear;
        /* animation-duration set dynamically via JavaScript */
      }

      /* Slideshow controls: prev, next, start/stop animation, ... */

      .overlay {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 25%;
        height: 45%;
        background: transparent;
        z-index: 100;
        cursor: pointer;
        /* border: 1px solid yellow; */
      }

      .prev-overlay {
        left: 1%;
        transform: translateY(-50%);
      }
      .next-overlay {
        left: auto;
        right: 1%;
        transform: translateY(-50%);
      }
      .center-overlay {
        width: 35%;
        transform: translateX(-50%) translateY(-50%);
      }
      .top-overlay {
        top: 1%;
        height: 25%;
        width: 98%;
        transform: translateX(-50%);
      }
      .bottom-overlay {
        top: auto;
        bottom: 1%;
        height: 25%;
        width: 98%;
        transform: translateX(-50%);
      }

      /* Title slide */

      .title {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 2rem;
        text-align: center;
        background: black;
        box-sizing: border-box;
      }
    `,
  ];
}
