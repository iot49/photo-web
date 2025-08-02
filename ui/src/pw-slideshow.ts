import { html, LitElement, css, PropertyValues } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';

import { get_json } from './app/api';
import { Albums, PhotoModel, SrcsetInfo } from './app/interfaces';
import { consume } from '@lit/context';
import { albumsContext, srcsetInfoContext } from './app/context';

/*
Themes:
@property theme switches between different versions of css classes .last and .next
to achieve alternate behaviors.

**carousel**:  Scales images to fit viewport. 
    Black borders if image aspect ratio differs from that of the viewport.
    No animations.
**ken-burns**: Images fill entire viewport (no black borders).
    Pans over image (left/right or up/down) to show entire image.
    In addition to panning also scales image (by SCALE_FACOR) to get a dynamic "Ken Burns" like effect.
    Uses dissolve to transition between images.
*/

const TRANSITION_MS = 1100; // duration of slide transition in [ms]
const SLIDE_MS = 3100; // time each slide is shown in [ms]; note: extra wide or tall slides take more time
const PANORAMA_TIME = 2.4; // increase parnorama image animation time by up to this factor
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
  @property({ type: String, reflect: true }) theme: 'carousel' | 'ken-burns' = 'ken-burns';

  // autoplay status
  @property({ type: Boolean }) autoplay = true;

  // List of arrays of PhotoModels for each album
  @state() private photos!: PhotoModel[][];

  // Index into #slideshow.children: slide-wrapper
  @state() currentIndex = 0;

  // Timeout ID for autoplay scheduling
  private autoplayTimeoutId: number | null = null;

  // Touch/swipe handling
  private touch = {
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
    minSwipeDistance: 50 // minimum distance for a swipe
  };

  // playlist to array of album uid's
  private get uids(): string[] {
    return this.playlist.split(':');
  }

  // load descriptions of all photos in all albums in the playlist
  private async loadPhotos(): Promise<void> {
    if (this.playlist === '') {
      this.photos = [];
      return;
    }
    const photos: PhotoModel[][] = [];
    for (const uid of this.uids) {
      try {
        photos.push(await get_json(`/photos/api/albums/${uid}`));
      } catch (error) {
        console.error(`Failed to load photos for album: ${uid}, trying again`, error);
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
    // Setup swipe handlers after a short delay to ensure slideshow element is ready
    setTimeout(() => this.setupSwipeHandlers(), 100);
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
      // don't touch current slide for smooth ken-burns transitions, unless we're going to the same slide
      if (i === this.currentIndex && nextIndex !== this.currentIndex) continue;
      const slide = slides[i] as HTMLElement;
      slide.classList.remove('last');
      slide.classList.remove('next');
    }

    // then show last and next slide with selected theme
    // note: slides[this.currentIndex] retains class .next otherwise ken-burns transition will not be smooth
    if (nextIndex !== this.currentIndex) {
      slides[this.currentIndex].classList.add('last');
    }
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
          // Use Navigation API or history.pushState to preserve component state
          if ('navigation' in window && window.navigation) {
            window.navigation.navigate('/ui/album');
          } else {
            // Fallback for browsers without Navigation API
            history.pushState(null, '', '/ui/album');
            // Dispatch a popstate event to trigger the router's navigation handling
            window.dispatchEvent(new PopStateEvent('popstate'));
          }
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
      // Stop autoplay and switch to carousel theme for immediate transitions
      this.theme = 'carousel';
    }
  }

  private toggleTheme() {
    this.theme = this.theme === 'ken-burns' ? 'carousel' : 'ken-burns';
  }

  private handlePrevClick() {
    if (this.autoplayTimeoutId !== null) {
      clearTimeout(this.autoplayTimeoutId);
      this.autoplayTimeoutId = null;
    }
    this.goto(this.currentIndex - 1);
  }

  private handleNextClick() {
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
    // Use Navigation API or history.pushState to preserve component state
    // This allows pw-main's router to handle navigation and preserve pw-album-browser state
    if ('navigation' in window && window.navigation) {
      window.navigation.navigate('/ui/album');
    } else {
      // Fallback for browsers without Navigation API
      history.pushState(null, '', '/ui/album');
      // Dispatch a popstate event to trigger the router's navigation handling
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  }

  private setupSwipeHandlers() {
    if (!this.slideshow) return;

    this.slideshow.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: true });
    this.slideshow.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: true });
  }

  private handleTouchStart(event: TouchEvent) {
    if (event.touches.length === 1) {
      this.touch.startX = event.touches[0].clientX;
      this.touch.startY = event.touches[0].clientY;
    }
  }

  private handleTouchEnd(event: TouchEvent) {
    if (event.changedTouches.length === 1) {
      this.touch.endX = event.changedTouches[0].clientX;
      this.touch.endY = event.changedTouches[0].clientY;
      this.handleSwipe();
    }
  }

  private handleSwipe() {
    const deltaX = this.touch.endX - this.touch.startX;
    const deltaY = this.touch.endY - this.touch.startY;
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);

    // Only process horizontal swipes that are longer than vertical movement
    if (absDeltaX > this.touch.minSwipeDistance && absDeltaX > absDeltaY) {
      if (deltaX > 0) {
        // Swipe right - go to previous slide
        this.handlePrevClick();
      } else {
        // Swipe left - go to next slide
        this.handleNextClick();
      }
    }
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

    if (this.photos.length < 1) {
      return html`
        <div id="slideshow">
          <div class="slide-wrapper">
            <div class="title"><p>No albums selected</p></div>
          </div>
        </div>
      `;
    }

    // Swipe gestures are now implemented using native touch events

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
          <div class="title"><p>...</p></div>
        </div>
      </div>
      <div id="overlays">
        <div class="overlay prev-overlay" @click=${() => this.handlePrevClick()}>
          <sl-icon name="caret-left"></sl-icon>
        </div>
        <div class="overlay next-overlay" @click=${() => this.handleNextClick()}>
          <sl-icon name="caret-right"></sl-icon>
        </div>
        <div class="overlay center-overlay" @click=${() => this.toggleAutoplay()}>
          <sl-icon name="${this.autoplay ? 'pause' : 'play-btn'}"></sl-icon>
        </div>
        <div class="overlay top-overlay" @click=${() => this.endSlideshow()}>
          <sl-icon name="x-lg"></sl-icon>
        </div>
        <div class="overlay bottom-overlay" @click=${() => this.toggleTheme()}>
          <p>${this.theme === 'carousel' ? 'ken burns' : 'carousel'}</p>
        </div>
      </div>
    `;
  }

  private photoTemplate(photo: PhotoModel) {
    const mime_type = photo.mime_type;
    const uri = `/photos/api/photos/${photo.uuid}/img`;
    if (mime_type.startsWith('image')) {
      if (mime_type === 'image/x-adobe-dng') {
        return html`<div class="title">
          <p>No render for MIME type<br />${mime_type}</p>
        </div>`;
      }

      // Calculate dynamic slide time factor and store as CSS custom property
      const dynamicTimeFactor = this.calculateDynamicSlideTimeFactorForPhoto(photo);
      const style = `--data-dynamic-time-factor: ${dynamicTimeFactor}`;

      return html` <img
        src=${uri}
        srcset=${this.srcsetInfo.srcsetFor(photo)}
        sizes="100vw"
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
      return html`<div class="title">
        <p>No render for MIME type<br />${mime_type}</p>
      </div>`;
    }
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
        width: 100vw;
        height: 100vh;
        background: black;
      }

      .slide-wrapper {
        position: absolute;
        width: 100vw;
        height: 100vh;
        opacity: 0;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .slide-wrapper img,
      .slide-wrapper video {
        width: 100vw;
        height: 100vh;
        object-fit: contain;
        object-position: 50% 50%;
        z-index: 0;
      }

      /* carousel theme: instant transitions */
      :host([theme='carousel']) .next {
        opacity: 1;
        z-index: 2;
      }

      :host([theme='carousel']) .last {
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

      #overlays {
        position: absolute;
        top: 20px;
        right: 20px;
        bottom: 20px;
        left: 20px;
        z-index: 10;
      }

      /* Base overlay styles - common properties inherited by all overlays */
      .overlay {
        position: absolute;
        background: transparent;
        cursor: pointer;
        width: 31%;
        height: 31%;
        transition: background-color 0.3s ease;
      }

      /* Show transparent background when hovering over #overlays (when sl-icon elements become visible) */
      #overlays:hover .overlay {
        background: rgba(255, 255, 255, 0.2);
      }

      /* Side overlays - share common positioning pattern */
      .prev-overlay,
      .next-overlay {
        top: 0;
        height: 100%;
      }

      .prev-overlay {
        left: 0;
      }

      .next-overlay {
        right: 0;
      }

      /* Centered overlays - share common horizontal centering */
      .center-overlay,
      .top-overlay,
      .bottom-overlay {
        left: 50%;
        transform: translateX(-50%);
      }

      .center-overlay {
        top: 50%;
        transform: translate(-50%, -50%);
      }

      .top-overlay {
        top: 0;
      }

      .bottom-overlay {
        bottom: 0;
      }

      /* sl-icon sizing is now handled by the more specific #overlays sl-icon selector below */

      /* Hide overlay content by default and center it */
      #overlays sl-icon,
      #overlays p {
        opacity: 0;
        transition: opacity 0.3s ease;
        color: rgba(255, 255, 255, 0.8);
        pointer-events: none;
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 4rem;
        margin: 0;
        text-align: center;
      }

      /* Show overlay content when hovering over #overlays with auto-fade */
      #overlays:hover sl-icon,
      #overlays:hover p,
      #overlays:hover  {
        opacity: 0.9;
        animation: overlay-auto-fade 2.5s ease-out forwards;
      }

      @keyframes overlay-auto-fade {
        0% {
          opacity: 0.8;
        }
        70% {
          opacity: 0.8;
        }
        100% {
          opacity: 0;
        }
      }

      /* Title slide */

      .title {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 4rem;
        text-align: center;
        background: black;
        box-sizing: border-box;
      }
    `,
  ];
}
