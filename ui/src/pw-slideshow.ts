import { html, LitElement, css, PropertyValues } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';

import { get_json } from './app/api';
import { Albums, PhotoModel, SrcsetInfo } from './app/interfaces';
import { consume } from '@lit/context';
import { albumsContext, srcsetInfoContext, meContext } from './app/context';
import { MeImple } from './app/me';
import { SwipeHandler } from './app/swipe';

/* Lazy loading
The browser mediated lazy loading configured in photoTemplate does not work: all images are downloaded on page load.

Instead, we use "manual" lazy loading for img and video html elements. 
1) photoTemplate sets --data-uid and class="lazy" but does not set src, srcset, size. 
2) on-loaded handler sets class 'loaded'. on-error handler on img/video sets class="load-failed". Css for this class shows an appropriate error instead of the img/video.
3) a new function "loadPhoto(index: number)" sets those attributes and removes the lazy class. It does nothing if lazy class is not defined.
4) goto(index) calls loadPhoto(index) with index, index+1, index+2, index-1. It then checks the .loaded class. If not present, it reschedules goto in 500ms and returns. Also write a message to the log.

*/

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


@customElement('pw-slideshow')
export class PwSlideshow extends LitElement {
  @consume({ context: albumsContext, subscribe: true })
  private albums!: Albums;

  @consume({ context: srcsetInfoContext, subscribe: true })
  private srcsetInfo!: SrcsetInfo;

  @consume({ context: meContext, subscribe: true })
  private me?: MeImple;

  @query('#slideshow') slideshow!: HTMLDivElement;
  @query('#overlays') overlays!: HTMLDivElement;

  // colon-separated uid's of albums to display
  @property({ type: String }) playlist = '';

  // css theme
  @property({ type: String, reflect: true }) theme: 'carousel' | 'ken-burns' = 'ken-burns';

  // autoplay status
  @property({ type: Boolean }) autoplay = false;

  // List of arrays of PhotoModels for each album
  @state() private photos!: PhotoModel[][];

  // Index into #slideshow.children: slide-wrapper
  @state() currentIndex = 0;

  // Timeout ID for autoplay scheduling
  private autoplayTimeoutId: number | null = null;

  // Timeout ID for loadPhotos retry
  private loadPhotosTimeoutId: number | null = null;

  // Timeout ID for goto retries
  private gotoTimeoutId: number | null = null;

  // Timeout ID for overlay auto-hide
  private overlayTimeoutId: number | null = null;

  // Swipe handler instance
  private swipeHandler: SwipeHandler | null = null;

  // Overlay visibility state
  @state() private overlaysVisible = false;

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
      const albumPhotos = await get_json(`/photos/api/albums/${uid}`);
      if (albumPhotos) {
        photos.push(albumPhotos);
      } else {
        console.error(`Failed to load photos for album: ${uid}, trying again`);
        // Clear any existing loadPhotos timeout before setting a new one
        if (this.loadPhotosTimeoutId !== null) {
          clearTimeout(this.loadPhotosTimeoutId);
        }
        this.loadPhotosTimeoutId = window.setTimeout(() => {
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
    this.updateCSSProperties();
    // Initialize theme from database if available
    if (this.me?.config.slideshow.theme !== undefined) {
      this.theme = this.me.config.slideshow.theme;
    }
    this.goto(0);
    this.setupSwipeHandlers();
    this.setupOverlayHandlers();
  }

  protected updated(_changedProperties: PropertyValues): void {
    super.updated(_changedProperties);
    // Update CSS properties when me context changes
    if (_changedProperties.has('me')) {
      this.updateCSSProperties();
      // Initialize theme from database when me context is available
      if (this.me?.config.slideshow.theme !== undefined) {
        this.theme = this.me.config.slideshow.theme;
      }
    }
  }

  private updateCSSProperties(): void {
    const scaleFactor = this.me?.config.slideshow.scale_factor || 1.2;
    const transitionMs = (this.me?.config.slideshow.transition || 1.1) * 1000;
    
    this.style.setProperty('--scale-factor', scaleFactor.toString());
    this.style.setProperty('--transition-ms', `${transitionMs}ms`);
  }

  private goto = (nextIndex: number) => {
    /* transition from showing slide at `this.currentIndex` to at `nextIndex`.
     */
    if (this.slideshow == null) {
      // Clear any existing goto timeout before setting a new one
      if (this.gotoTimeoutId !== null) {
        clearTimeout(this.gotoTimeoutId);
      }
      this.gotoTimeoutId = window.setTimeout(() => this.goto(nextIndex), 300);
      return;
    }
    const slides = this.slideshow?.children as unknown as HTMLElement[];

    const N = slides.length;
    if (N === 0) {
      console.log(`Empty playlist ${this.playlist}`);
      return;
    }

    nextIndex = ((nextIndex % N) + N) % N;
    console.log(`GOTO from ${this.currentIndex} -> ${nextIndex} of ${N} slides`, slides[nextIndex]);

    // Load photos for current and adjacent slides (index, index+1, index+2, index-1)
    this.loadPhoto(nextIndex);
    this.loadPhoto(nextIndex + 1);
    this.loadPhoto(nextIndex + 2);
    this.loadPhoto(nextIndex - 1);

    // Check if the current slide has loaded content
    const currentSlide = slides[nextIndex];
    const hasLazyElements = currentSlide?.querySelectorAll('.lazy').length > 0;
    const hasLoadedElements = currentSlide?.querySelectorAll('.loaded').length > 0;

    // If slide has lazy elements but no loaded elements, reschedule goto
    if (hasLazyElements && !hasLoadedElements) {
      console.log(`Slide ${nextIndex} not loaded yet, rescheduling goto in 500ms`);
      // Clear any existing goto timeout before setting a new one
      if (this.gotoTimeoutId !== null) {
        clearTimeout(this.gotoTimeoutId);
      }
      this.gotoTimeoutId = window.setTimeout(() => this.goto(nextIndex), 500);
      return;
    }

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

    // Calculate slide duration for both images and videos
    const nextSlide = slides[nextIndex];
    const dynamicSlideMs = this.calculateSlideDuration(nextSlide);

    // Set dynamic animation duration for ken-burns theme
    const imgElement = nextSlide.querySelector('img') as HTMLElement;
    const videoElement = nextSlide.querySelector('video') as HTMLVideoElement;

    if (this.theme === 'ken-burns') {
      if (imgElement) {
        imgElement.style.animationDuration = `${dynamicSlideMs}ms`;
      }
      // Videos in ken-burns mode don't get animations, but still need to be played
      if (videoElement) {
        // Attempt to play video if it's ready
        if (videoElement.readyState >= 2) {
          // HAVE_CURRENT_DATA or higher
          videoElement.play().catch((error) => {
            console.warn('Failed to play video:', error);
          });
        }
      }
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
        }, (this.me?.config.slideshow.duration || 3.1) * 1000);
      } else {
        const timeoutMs = dynamicSlideMs - ((this.me?.config.slideshow.transition || 1.1) * 1000);

        this.autoplayTimeoutId = window.setTimeout(() => this.goto(nextIndex + 1), timeoutMs);
      }
    }
  };

  /**
   * Calculate slide duration for both images and videos
   */
  private calculateSlideDuration(slide: HTMLElement): number {
    const videoElement = slide.querySelector('video') as HTMLVideoElement;
    const imgElement = slide.querySelector('img') as HTMLElement;

    if (videoElement) {
      // For videos: use max of SLIDE_MS, video duration, or HTML data attribute (no dynamic factor)
      const slideMs = (this.me?.config.slideshow.duration || 3.1) * 1000;
      const videoDurationMs = videoElement.duration ? videoElement.duration * 1000 : slideMs;
      const htmlDuration = videoElement.dataset.duration ? parseInt(videoElement.dataset.duration) : 0;
      const baseDuration = Math.max(slideMs, videoDurationMs, htmlDuration);

      // Set up video looping for short videos
      const shouldLoop = videoDurationMs < slideMs;
      videoElement.loop = shouldLoop;

      return baseDuration;
    } else if (imgElement) {
      // For images: get dynamic time factor from CSS custom property
      let dynamicTimeFactor = 1.0;
      const customProperty = getComputedStyle(imgElement).getPropertyValue('--data-dynamic-time-factor');
      if (customProperty) dynamicTimeFactor = parseFloat(customProperty) || 1.0;

      return ((this.me?.config.slideshow.duration || 3.1) * 1000) * dynamicTimeFactor;
    }

    // Fallback for other content types
    return (this.me?.config.slideshow.duration || 3.1) * 1000;
  }

  private toggleAutoplay() {
    // Cancel any pending autoplay timeout
    if (this.autoplayTimeoutId !== null) {
      clearTimeout(this.autoplayTimeoutId);
      this.autoplayTimeoutId = null;
    }

    this.autoplay = !this.autoplay;

    if (this.autoplay) {
      // Restart autoplay - keep current theme
      // Get the current slide to calculate dynamic timing
      const slides = this.slideshow?.children as unknown as HTMLElement[];
      if (slides && slides.length > 0) {
        const currentSlide = slides[this.currentIndex];
        const imgElement = currentSlide?.querySelector('img') as HTMLElement;
        const videoElement = currentSlide?.querySelector('video') as HTMLVideoElement;

        // Resume ken-burns animation if in ken-burns mode (images only)
        if (this.theme === 'ken-burns' && imgElement) {
          imgElement.style.animationPlayState = 'running';
        }

        // Resume video playback if it's a video
        if (videoElement) {
          videoElement.play().catch((error) => {
            console.warn('Failed to resume video playback:', error);
          });
        }

        const dynamicSlideMs = this.calculateSlideDuration(currentSlide);

        // Schedule next slide transition
        this.autoplayTimeoutId = window.setTimeout(() => this.goto(this.currentIndex + 1), dynamicSlideMs - ((this.me?.config.slideshow.transition || 1.1) * 1000));
      }
    } else {
      // Pause ken-burns animation and videos when autoplay is stopped
      const slides = this.slideshow?.children as unknown as HTMLElement[];
      if (slides && slides.length > 0) {
        const currentSlide = slides[this.currentIndex];
        const imgElement = currentSlide?.querySelector('img') as HTMLElement;
        const videoElement = currentSlide?.querySelector('video') as HTMLVideoElement;

        if (this.theme === 'ken-burns' && imgElement) {
          imgElement.style.animationPlayState = 'paused';
        }

        if (videoElement) {
          videoElement.pause();
        }
      }
    }
    // Note: Theme is now only controlled by the dedicated theme toggle button
  }


  private renderSlideshowControls() {
    // Show controls for all users - the PUT endpoint handles credential validation
    if (!this.me) {
      return html`<p>Loading settings...</p>`;
    }

    const config = this.me.config.slideshow;
    
    return html`
      <div class="slideshow-controls">
        <div class="control-group">
          <label>Theme: ${this.theme === 'ken-burns' ? 'Ken Burns' : 'Carousel'}</label>
          <sl-switch
            ?checked=${this.theme === 'ken-burns'}
            @sl-change=${this.handleThemeChange}
          >
            ${this.theme === 'ken-burns' ? 'Ken Burns' : 'Carousel'}
          </sl-switch>
        </div>
        
        <div class="control-group">
          <label>Duration: ${config.duration.toFixed(1)}s</label>
          <sl-range
            min="1"
            max="10"
            step="0.1"
            .value=${config.duration}
            @sl-input=${this.handleDurationChange}
            @sl-change=${this.handleDurationChange}
            tooltip="top"
          ></sl-range>
        </div>
        
        <div class="control-group">
          <label>Transition: ${config.transition.toFixed(1)}s</label>
          <sl-range
            min="0"
            max="3"
            step="0.1"
            .value=${config.transition}
            @sl-input=${this.handleTransitionChange}
            @sl-change=${this.handleTransitionChange}
            tooltip="top"
          ></sl-range>
        </div>
        
        <div class="control-group">
          <label>Panorama: ${config.panorama.toFixed(1)}</label>
          <sl-range
            min="1"
            max="6"
            step="0.1"
            .value=${config.panorama}
            @sl-input=${this.handlePanoramaChange}
            @sl-change=${this.handlePanoramaChange}
            tooltip="top"
          ></sl-range>
        </div>
        
        <div class="control-group">
          <label>Scale: ${config.scale_factor.toFixed(1)}</label>
          <sl-range
            min="0.5"
            max="2"
            step="0.1"
            .value=${config.scale_factor}
            @sl-input=${this.handleScaleFactorChange}
            @sl-change=${this.handleScaleFactorChange}
            tooltip="top"
          ></sl-range>
        </div>
      </div>
    `;
  }

  private handleThemeChange = (e: CustomEvent) => {
    const isKenBurns = (e.target as any).checked;
    this.theme = isKenBurns ? 'ken-burns' : 'carousel';
    
    // Persist theme to database
    if (this.me) {
      this.me.updateConfig({
        slideshow: {
          ...this.me.config.slideshow,
          theme: this.theme
        }
      });
    }
  };

  private handleDurationChange = (e: CustomEvent) => {
    const value = parseFloat((e.target as any).value);
    if (this.me) {
      this.me.updateConfig({
        slideshow: {
          ...this.me.config.slideshow,
          duration: value
        }
      });
    }
  };

  private handleTransitionChange = (e: CustomEvent) => {
    const value = parseFloat((e.target as any).value);
    if (this.me) {
      this.me.updateConfig({
        slideshow: {
          ...this.me.config.slideshow,
          transition: value
        }
      });
    }
  };

  private handlePanoramaChange = (e: CustomEvent) => {
    const value = parseFloat((e.target as any).value);
    if (this.me) {
      this.me.updateConfig({
        slideshow: {
          ...this.me.config.slideshow,
          panorama: value
        }
      });
    }
  };

  private handleScaleFactorChange = (e: CustomEvent) => {
    const value = parseFloat((e.target as any).value);
    if (this.me) {
      this.me.updateConfig({
        slideshow: {
          ...this.me.config.slideshow,
          scale_factor: value
        }
      });
    }
  };

  private handlePrevClick(event?: Event) {
    // Prevent event bubbling to avoid triggering handleOverlayActivity
    if (event) {
      event.stopPropagation();
    }
    
    // Hide overlays immediately
    this.overlaysVisible = false;
    if (this.overlayTimeoutId !== null) {
      clearTimeout(this.overlayTimeoutId);
      this.overlayTimeoutId = null;
    }
    
    if (this.autoplayTimeoutId !== null) {
      clearTimeout(this.autoplayTimeoutId);
      this.autoplayTimeoutId = null;
    }
    // Also clear goto timeout to prevent conflicts
    if (this.gotoTimeoutId !== null) {
      clearTimeout(this.gotoTimeoutId);
      this.gotoTimeoutId = null;
    }
    this.goto(this.currentIndex - 1);
  }

  private handleNextClick(event?: Event) {
    // Prevent event bubbling to avoid triggering handleOverlayActivity
    if (event) {
      event.stopPropagation();
    }
    
    // Hide overlays immediately
    this.overlaysVisible = false;
    if (this.overlayTimeoutId !== null) {
      clearTimeout(this.overlayTimeoutId);
      this.overlayTimeoutId = null;
    }
    
    if (this.autoplayTimeoutId !== null) {
      clearTimeout(this.autoplayTimeoutId);
      this.autoplayTimeoutId = null;
    }
    // Also clear goto timeout to prevent conflicts
    if (this.gotoTimeoutId !== null) {
      clearTimeout(this.gotoTimeoutId);
      this.gotoTimeoutId = null;
    }
    this.goto(this.currentIndex + 1);
  }

  private endSlideshow() {
    if (this.autoplayTimeoutId !== null) {
      clearTimeout(this.autoplayTimeoutId);
      this.autoplayTimeoutId = null;
    }
    // Also clear goto timeout to prevent conflicts
    if (this.gotoTimeoutId !== null) {
      clearTimeout(this.gotoTimeoutId);
      this.gotoTimeoutId = null;
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

  private handleVideoCanPlay(e: Event) {
    const video = e.target as HTMLVideoElement;

    // Try to play video immediately when it can play in ken-burns mode
    if (this.theme === 'ken-burns') {
      const slideWrapper = video.closest('.slide-wrapper') as HTMLElement;
      if (slideWrapper && slideWrapper.classList.contains('next')) {
        video.play().catch((error) => {
          console.warn('Failed to play video on canplay:', error);
        });
      }
    }
  }

  private handleVideoEnded(e: Event) {
    const video = e.target as HTMLVideoElement;

    // If autoplay is enabled and this video is not set to loop, advance to next slide
    if (this.autoplay && !video.loop) {
      const slideWrapper = video.closest('.slide-wrapper') as HTMLElement;
      if (slideWrapper && slideWrapper.classList.contains('next')) {
        // Clear any existing autoplay timeout to prevent double-advancement
        if (this.autoplayTimeoutId !== null) {
          clearTimeout(this.autoplayTimeoutId);
          this.autoplayTimeoutId = null;
        }

        // Advance to next slide immediately
        this.goto(this.currentIndex + 1);
      }
    }
  }

  private handleVideoError(e: Event) {
    const video = e.target as HTMLVideoElement;
    console.error('Video error:', video.error);
    video.classList.add('load-failed');
  }

  private handleLoad(e: Event) {
    const img = e.target as HTMLElement;
    img.classList.add('loaded');
  }

  private handleImageError(e: Event) {
    const img = e.target as HTMLImageElement;
    console.error('Image load error:', img.src);
    img.classList.add('load-failed');
  }

  /**
   * Load photo at specified index by setting src attributes and removing lazy class
   */
  private loadPhoto(index: number) {
    const slides = this.slideshow?.children as unknown as HTMLElement[];

    const N = slides.length;
    index = ((index % N) + N) % N;
    if (this.slideshow == null) return;

    const slide = slides[index];
    const lazyElements = slide.querySelectorAll('.lazy');

    lazyElements.forEach((element) => {
      if (element.classList.contains('lazy')) {
        if (element.tagName === 'IMG') {
          const img = element as HTMLImageElement;
          const dataSrc = img.getAttribute('data-src');
          const dataSrcset = img.getAttribute('data-srcset');
          const dataSizes = img.getAttribute('data-sizes');

          if (dataSrc) img.src = dataSrc;
          if (dataSrcset) img.srcset = dataSrcset;
          if (dataSizes) img.sizes = dataSizes;

          img.classList.remove('lazy');
        } else if (element.tagName === 'VIDEO') {
          const video = element as HTMLVideoElement;
          const dataSrc = video.getAttribute('data-src');

          if (dataSrc) video.src = dataSrc;
          video.classList.remove('lazy');
        }
      }
    });
  }

  private setupSwipeHandlers() {
    // Clean up existing handler if any
    if (this.swipeHandler) {
      this.swipeHandler.destroy();
    }

    // Create new swipe handler
    this.swipeHandler = new SwipeHandler(this, {
      minSwipeDistance: 50,
      onSwipeLeft: () => this.handleNextClick(),
      onSwipeRight: () => this.handlePrevClick(),
      preventDefaultOnSwipe: true,
    });
  }

  private setupOverlayHandlers() {
    if (!this.overlays) {
      setTimeout(() => this.setupOverlayHandlers(), 300);
      return;
    }

    // Add event listeners for mouse movement and clicks
    this.overlays.addEventListener('mousemove', this.handleOverlayActivity);
    this.overlays.addEventListener('click', this.handleOverlayActivity);
    console.log('Overlay handlers set up successfully');
  }

  private handleOverlayActivity = () => {
    // Show overlays
    this.overlaysVisible = true;

    // Clear existing timeout
    if (this.overlayTimeoutId !== null) {
      clearTimeout(this.overlayTimeoutId);
    }

    // Set new timeout to hide overlays
    this.overlayTimeoutId = window.setTimeout(() => {
      this.overlaysVisible = false;
      this.overlayTimeoutId = null;
    }, 2000);
  };

  disconnectedCallback() {
    super.disconnectedCallback();
    // Clean up all timeouts when component is removed
    if (this.autoplayTimeoutId !== null) {
      clearTimeout(this.autoplayTimeoutId);
      this.autoplayTimeoutId = null;
    }
    if (this.loadPhotosTimeoutId !== null) {
      clearTimeout(this.loadPhotosTimeoutId);
      this.loadPhotosTimeoutId = null;
    }
    if (this.gotoTimeoutId !== null) {
      clearTimeout(this.gotoTimeoutId);
      this.gotoTimeoutId = null;
    }
    if (this.overlayTimeoutId !== null) {
      clearTimeout(this.overlayTimeoutId);
      this.overlayTimeoutId = null;
    }
    // Clean up swipe handler when component is removed
    if (this.swipeHandler) {
      this.swipeHandler.destroy();
      this.swipeHandler = null;
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

    // Swipe gestures are handled by the SwipeHandler module

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
      <div id="overlays" class="${this.overlaysVisible ? 'visible' : ''}">
        <div class="overlay prev-overlay" @click=${(e: Event) => this.handlePrevClick(e)}>
          <sl-icon name="caret-left"></sl-icon>
        </div>
        <div class="overlay next-overlay" @click=${(e: Event) => this.handleNextClick(e)}>
          <sl-icon name="caret-right"></sl-icon>
        </div>
        <div class="overlay center-overlay" @click=${() => this.toggleAutoplay()}>
          <sl-icon name="${this.autoplay ? 'pause' : 'play-btn'}"></sl-icon>
        </div>
        <div class="overlay top-overlay" @click=${() => this.endSlideshow()}>
          <sl-icon name="x-lg"></sl-icon>
        </div>
        <div class="overlay bottom-overlay">
          ${this.renderSlideshowControls()}
        </div>
      </div>
    `;
  }

  private photoTemplate(photo: PhotoModel) {
    // lazy loading of images and videos (goto/loadPhoto)
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
        data-src="${uri}"
        data-srcset="${this.srcsetInfo.srcsetFor(photo)}"
        data-sizes="100vw"
        class="lazy"
        alt="${photo.title || 'Photo'}"
        style="${style}"
        @load=${(e: Event) => this.handleLoad(e)}
        @error=${(e: Event) => this.handleImageError(e)}
      />`;
    } else if (mime_type.startsWith('video')) {
      return html`
        <video
          data-src="${uri}"
          class="lazy"
          controls
          autoplay
          preload="metadata"
          title="${photo.title || 'Video'}"
          @canplay=${(e: Event) => this.handleVideoCanPlay(e)}
          @ended=${(e: Event) => this.handleVideoEnded(e)}
          @error=${(e: Event) => this.handleVideoError(e)}
          @loadeddata=${(e: Event) => this.handleLoad(e)}
        >
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

    const panoramaTime = this.me?.config.slideshow.panorama || 2.4;
    return Math.tanh(maxAspectRatio / panoramaTime) / Math.tanh(1 / panoramaTime);
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
        background: black;
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
          transform: scale(var(--scale-factor, 1.2));
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
        animation-duration: var(--transition-ms, 1100ms);
        animation-fill-mode: forwards;
        animation-timing-function: linear;
      }

      /* Ken burns mode: images get cover + animations, videos get contain (like carousel) */
      :host([theme='ken-burns']) .slide-wrapper img {
        object-fit: cover;
      }

      :host([theme='ken-burns']) .slide-wrapper video {
        object-fit: contain;
        object-position: 50% 50%;
      }

      /* Position-dependent starting positions for images only */
      :host([theme='ken-burns']) .slide-wrapper:nth-child(4n + 1) img {
        object-position: top left;
      }

      :host([theme='ken-burns']) .slide-wrapper:nth-child(4n + 2) img {
        object-position: bottom right;
      }

      :host([theme='ken-burns']) .slide-wrapper:nth-child(4n + 3) img {
        object-position: bottom left;
      }

      :host([theme='ken-burns']) .slide-wrapper:nth-child(4n + 4) img {
        object-position: top right;
      }

      /* Position-dependent animations for images only (videos excluded) */
      :host([theme='ken-burns']) .next:nth-child(4n + 1) img {
        animation-name: ken-burns-pan-1, ken-burns-scale;
        animation-fill-mode: forwards;
        animation-timing-function: linear;
        /* animation-duration set dynamically via JavaScript */
      }

      :host([theme='ken-burns']) .next:nth-child(4n + 2) img {
        animation-name: ken-burns-pan-2, ken-burns-scale;
        animation-fill-mode: forwards;
        animation-timing-function: linear;
        /* animation-duration set dynamically via JavaScript */
      }

      :host([theme='ken-burns']) .next:nth-child(4n + 3) img {
        animation-name: ken-burns-pan-3, ken-burns-scale;
        animation-fill-mode: forwards;
        animation-timing-function: linear;
        /* animation-duration set dynamically via JavaScript */
      }

      :host([theme='ken-burns']) .next:nth-child(4n + 4) img {
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
        bottom: 50px;
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

      /* Show transparent background when overlays are visible */
      #overlays.visible .overlay {
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
        transition: opacity 0.5s ease;
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

      /* Show overlay content when overlays are visible */
      #overlays.visible sl-icon,
      #overlays.visible p {
        opacity: 0.9;
      }

      /* Fade out overlay backgrounds */
      .overlay {
        transition: background-color 0.5s ease;
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

      /* Load failed state */
      .load-failed {
        position: relative;
        background: #333;
      }

      .load-failed::after {
        content: "Failed to load image";
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        color: #ccc;
        font-size: 1.5rem;
        text-align: center;
        pointer-events: none;
      }

      video.load-failed::after {
        content: "Failed to load video";
      }

      /* Slideshow controls styling */
      .slideshow-controls {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        padding: 1rem;
        background: transparent;
        border-radius: 8px;
        min-width: 280px;
        max-width: 320px;
      }

      .control-group {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }

      .control-group label {
        color: rgba(255, 255, 255, 0.9);
        font-size: 0.875rem;
        font-weight: 500;
        margin: 0;
        text-align: left;
      }

      .slideshow-controls sl-switch {
        --width: 3rem;
        --height: 1.5rem;
        --thumb-size: 1.25rem;
        --sl-color-primary-600: rgba(255, 255, 255, 0.4);
        --sl-color-neutral-400: rgba(255, 255, 255, 0.2);
      }

      .slideshow-controls sl-switch::part(label) {
        color: rgba(255, 255, 255, 0.9);
        font-size: 0.875rem;
      }

      .slideshow-controls sl-range {
        --sl-color-primary-600: rgba(255, 255, 255, 0.4);
        --sl-color-neutral-300: rgba(255, 255, 255, 0.2);
        --track-height: 4px;
        --thumb-size: 16px;
        --tooltip-background-color: rgba(0, 0, 0, 0.7);
        --tooltip-color: white;
      }

      .slideshow-controls sl-range::part(base) {
        padding: 0.5rem 0;
      }

      /* Adjust bottom overlay positioning for controls */
      .bottom-overlay {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        cursor: default;
      }

      /* Hide controls content by default, show when overlay is visible */
      .slideshow-controls {
        opacity: 0;
        transition: opacity 0.5s ease;
        pointer-events: none;
      }

      #overlays.visible .slideshow-controls {
        opacity: 1;
        pointer-events: auto;
      }

      /* Override the general p styling for controls */
      .slideshow-controls p {
        position: static;
        transform: none;
        opacity: 1;
        font-size: 0.875rem;
        color: rgba(255, 255, 255, 0.9);
        text-align: center;
        margin: 0;
      }

    `,
  ];
}
