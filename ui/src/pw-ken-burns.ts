import { html, LitElement, css } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { srcsetInfoContext } from './app/context';
import { consume } from '@lit/context';
import { PhotoModel, SrcsetInfo, ImageSize } from './app/interfaces';
import { get_json } from './app/api';

const TITLE_MS = 1000; // time the title is shown in [ms]
const TRANSITION_MS = 1500; // duration of slide transition in [ms]
const SLIDE_MS = 6000; // time each slide is shown in [ms]; note: extra wide or tall slides take more time
const PANORAMA_TIME = 3; // increase parnorama image animation time by up to this factor
const SCALE_FACTOR = 1.2; // factor by which the image is scaled during translation

@customElement('pw-ken-burns')
export class PwKenBurns extends LitElement {
  @property({ type: String }) uuid = '';

  @property({ type: Boolean }) autoPlay = true;

  @consume({ context: srcsetInfoContext, subscribe: true })
  private srcsetInfo!: SrcsetInfo;

  @query('#slideshow') slideshow!: HTMLDivElement;
  @state() private photos: PhotoModel[] = [];
  @state() currentIndex = 0;
  private autoplayTimeout?: ReturnType<typeof setTimeout>;

  override async connectedCallback(): Promise<void> {
    await super.connectedCallback();
    this.photos = await get_json(`/photos/api/albums/${this.uuid}`);
  }

  private start = () => {
    if (this.photos.length <= 0) {
      // wait for resources to load ...
      setTimeout(() => {
        this.start();
      }, 200);
    }
    // prefetch first image
    this.fetchSlide(1);
    if (this.autoPlay) {
      setTimeout(() => {
        this.goto(1); // Transition to first photo
      }, TITLE_MS);
    }
  };

  override firstUpdated() {
    // Add click event listener to slideshow
    this.slideshow.addEventListener('click', this.handleClick);
    this.start();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.slideshow?.removeEventListener('click', this.handleClick);
    if (this.autoplayTimeout) {
      clearTimeout(this.autoplayTimeout);
    }
  }

  private handleClick = (event: MouseEvent) => {
    const rect = this.slideshow.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const width = rect.width;

    // Divide screen into three regions: left (0-33%), center (33-67%), right (67-100%)
    const leftBoundary = width * 0.33;
    const rightBoundary = width * 0.67;

    if (clickX < leftBoundary) {
      // Left click: go to previous slide
      this.stopAutoplay();
      this.goto(this.currentIndex - 1);
    } else if (clickX > rightBoundary) {
      // Right click: go to next slide
      this.stopAutoplay();
      this.goto(this.currentIndex + 1);
    } else {
      // Center click: toggle play/pause
      if (this.autoPlay) {
        this.stopAutoplay();
      } else {
        this.autoPlay = true;
        this.goto(this.currentIndex + 1);
      }
    }
  };

  private stopAutoplay() {
    this.autoPlay = false;
    if (this.autoplayTimeout) {
      clearTimeout(this.autoplayTimeout);
      this.autoplayTimeout = undefined;
    }
    // Also stop any ongoing CSS animations
    const activeSlide = this.slideshow.children[this.currentIndex];
    if (activeSlide) {
      const img = activeSlide.querySelector('img');
      if (img) {
        // Pause the CSS animation by setting animation-play-state
        img.style.animationPlayState = 'paused';
      }
    }
  }

  override render() {
    // console.log("ken burns render", this.uuid, this.photos)
    /*
    TODO:
    - move "fetchSlide" to render: will "<img lazy ..." have the same effect?
    - support for video, error for unsupported formats
    */
    return html`
      <div id="slideshow">
        <div class="slide-wrapper active">
          <div class="title"><p>Title Slide</p></div>
        </div>
        ${this.photos.map(
          (_, index) => html`
            <div class="slide-wrapper">
              <!-- no src: delayed image loading by fetchImage -->
              <img alt="${index}"></img>
            </div>
        `
        )}
      </div>
    `;
  }

  private isImageLoaded(img: HTMLImageElement): boolean {
    if (img == null) return false;
    return img.complete && img.naturalWidth !== 0;
  }

  private goto = (nextIndex: number, transition_ms = TRANSITION_MS, slide_ms = SLIDE_MS) => {
    /* transition from showing slide at `this.currentIndex` to at `nextIndex` as follows:
        1) apply a transition of duration transition_ms [ms] during which time slide at `nextIndex`'s
          opacity slowly increases from 0 to 1, ultimately obsuring the slide at this.currentIndex. 
        2) If autoPlay is enabled, schedule a new transition to slide `nextIndex+1` after `slide_ms - transition_ms` [ms].
    */
    const slides = this.slideshow.children;
    const N = slides.length;
    nextIndex = ((nextIndex % N) + N) % N;
    const nextSlide = slides[nextIndex] as HTMLElement;
    if (nextIndex < this.currentIndex) {
      // for backwards moves, the current slide hides nextSlide (z-order)
      // setting opacity=0 for the current slide fixes this (but not transition)
      slides[this.currentIndex].classList.remove('active');
    }
    // increase duration for images that are larger than the container
    const img = nextSlide.querySelector('img') as HTMLImageElement;

    if (img != null) {
      // make sure image is loaded
      this.fetchSlide(nextIndex);
      if (!this.isImageLoaded(img)) {
        // Image not yet available, try again later
        // BUG: this occurs for every image, is preloading not working?
        // console.log(`goto ${nextIndex}: waiting for image to load`);
        if (this.autoplayTimeout) {
          clearTimeout(this.autoplayTimeout);
        }
        this.autoplayTimeout = setTimeout(() => this.goto(nextIndex), 300);
        return;
      }

      // CHECK: can this be moved to render?
      // Get container dimensions
      const containerRect = this.slideshow.getBoundingClientRect();
      const containerWidth = containerRect.width;
      const containerHeight = containerRect.height;

      // Get image natural dimensions
      const imageWidth = img.naturalWidth;
      const imageHeight = img.naturalHeight;

      // Calculate scaling based on requirements
      const imageAspectRatio = imageWidth / imageHeight;
      const containerAspectRatio = containerWidth / containerHeight;

      let scaledImageWidth: number;
      let scaledImageHeight: number;

      if (imageAspectRatio > containerAspectRatio) {
        // Image is wider relative to container, scale to fit height
        img.style.height = `${containerHeight}px`;
        scaledImageHeight = containerHeight;
        scaledImageWidth = (imageWidth * containerHeight) / imageHeight;
        // Slow down animation for panoramas
        slide_ms *= PANORAMA_TIME * Math.tanh(scaledImageWidth / containerWidth / PANORAMA_TIME);
      } else {
        // Image is taller relative to container, scale to fit width
        img.style.width = `${containerWidth}px`;
        scaledImageWidth = containerWidth;
        scaledImageHeight = (imageHeight * containerWidth) / imageWidth;
        // Slow down animation for panoramas
        slide_ms *= PANORAMA_TIME * Math.tanh(scaledImageHeight / containerHeight / PANORAMA_TIME);
      }

      // Calculate initial position and translation based on animation direction (cycle through 4 options)

      let initialX: number;
      let initialY: number;
      let translateX: number;
      let translateY: number;

      switch (nextIndex % 4) {
        case 0: // upper left corner to lower right corner (original behavior)
          initialX = 0;
          initialY = 0;
          translateX = containerWidth - scaledImageWidth;
          translateY = containerHeight - scaledImageHeight;
          break;
        case 1: // upper right corner to lower left corner
          initialX = containerWidth - scaledImageWidth;
          initialY = 0;
          translateX = 0;
          translateY = containerHeight - scaledImageHeight;
          break;
        case 2: // lower left corner to upper right corner
          initialX = 0;
          initialY = containerHeight - scaledImageHeight;
          translateX = containerWidth - scaledImageWidth;
          translateY = 0;
          break;
        case 3: // lower right corner to upper left corner
          initialX = containerWidth - scaledImageWidth;
          initialY = containerHeight - scaledImageHeight;
          translateX = 0;
          translateY = 0;
          break;
        default:
          // Fallback to original behavior
          initialX = 0;
          initialY = 0;
          translateX = containerWidth - scaledImageWidth;
          translateY = containerHeight - scaledImageHeight;
      }

      // CHECK: can we set style when creating <img> in render?
      // Set initial position
      img.style.setProperty('--slide-initial-x', `${initialX}px`);
      img.style.setProperty('--slide-initial-y', `${initialY}px`);

      // Set CSS custom properties for the animation
      img.style.setProperty('--slide-translate-x', `${translateX}px`);
      img.style.setProperty('--slide-translate-y', `${translateY}px`);
      img.style.setProperty('--slide-duration', `${slide_ms}ms`);
      img.style.setProperty('--scale-factor', `${SCALE_FACTOR}`);
      img.style.animationPlayState = 'running'; // in case we paused it

      // Set transition duration on the slide wrapper since that's where the CSS rule is applied
      nextSlide.style.setProperty('--transition-duration', `${transition_ms}ms`);
      nextSlide.classList.add('slide-left');
    }

    nextSlide.classList.add('active');

    // Remove active class from all slides except the target slide
    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i] as HTMLElement;
      if (i !== nextIndex && i !== this.currentIndex) {
        slide.classList.remove('active');
        slide.classList.remove('slide-left');
      }
    }
    this.currentIndex = nextIndex;

    if (this.autoPlay) {
      if (this.autoplayTimeout) {
        clearTimeout(this.autoplayTimeout);
      }
      // Start next slide `TRANSITION_MS` before current animation ends.
      // This way the transform of slide currentIndex continues through the transition.
      // Ensure timeout value is never negative.
      const timeoutDuration = Math.round(Math.max(1000, slide_ms - TRANSITION_MS));
      this.autoplayTimeout = setTimeout(() => {
        if (this.currentIndex + 1 >= N) {
          this.autoPlay = false;
          // Navigate back to main album browser
          window.location.href = '/ui/album';
        } else {
          this.fetchSlide(this.currentIndex + 1);
          // Show next slide
          this.goto(this.currentIndex + 1);
        }
      }, timeoutDuration);
    }
  };

  /*
    Load slide[index].
    Incremental image loading improves initial response time, reduces unnecessary downloads and server overload. 
    ALSO: can this be moved to render with "<img lazy ..."?
  */
  private fetchSlide(index: number) {
    const slides = this.slideshow.children;
    const N = slides.length;
    index = ((index % N) + N) % N;
    const nextSlide = slides[index] as HTMLElement;
    const img = nextSlide.querySelector('img') as HTMLImageElement;
    if (img != null && img.getAttribute('src') == null) {
      // photo for slide index = 1 is at photos[0]
      const photo = this.photos[index - 1];

      // determine size variant based on physical pixel resolution of screen
      const containerRect = this.slideshow.getBoundingClientRect();
      const devicePixelRatio = window.devicePixelRatio || 1;
      const containerWidth = containerRect.width * devicePixelRatio;
      const containerHeight = containerRect.height * devicePixelRatio;

      // Calculate scaling based on requirements
      const imageAspectRatio = photo.width / photo.height;
      const containerAspectRatio = containerWidth / containerHeight;

      let bestVariant: ImageSize | null = null;
      if (imageAspectRatio > containerAspectRatio) {
        // Image is wider relative to container, scale to fit height
        // Find the variant with smallest height where width > containerWidth
        for (const variant of this.srcsetInfo) {
          if (variant.height > containerHeight) {
            if (bestVariant === null || variant.width < bestVariant.width) {
              bestVariant = variant;
            }
          }
        }
      } else {
        // Image is taller relative to container, scale to fit width
        // Find the variant with smallest height where height > containerHeight
        for (const variant of this.srcsetInfo) {
          if (variant.width > containerWidth) {
            if (bestVariant === null || variant.height < bestVariant.height) {
              bestVariant = variant;
            }
          }
        }
      }
      const suffix = bestVariant?.suffix || '';
      img.src = `/photos/api/photos/${photo.uuid}/img${suffix}`;
    }
  }

  static styles = [
    css`
      :host {
        display: block;
        width: 100vw;
        height: 100vh;
        overflow: hidden;
        position: relative;
        font-family: var(--font-family, Inter, system-ui, Avenir, Helvetica, Arial, sans-serif);
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
        transition: opacity var(--transition-duration, ${TRANSITION_MS}ms) linear;
      }

      .slide-wrapper.active {
        opacity: 1;
      }

      /* Slide (and scale) image left & up. */
      .slide-wrapper.slide-left img {
        animation: slideLeft var(--slide-duration, ${SLIDE_MS}ms) linear forwards;
      }

      /* Opacity transition is specified in .slide-wrapper */
      @keyframes slideLeft {
        from {
          transform: translate(var(--slide-initial-x, 0), var(--slide-initial-y, 0)) scale(1);
        }
        to {
          transform: translate(var(--slide-translate-x, 0), var(--slide-translate-y, 0)) scale(var(--scale-factor, 1));
        }
      }

      /**
      * We change the point of origin using four corners so images do not move in the same direction.
      * This technique allows us to create various paths while applying the same scale() values to
      * all images.
      */

      /* Cycle through 4 different transform origins to create varied animation paths */
      .slide-wrapper:nth-child(4n + 1) img {
        transform-origin: left bottom;
      }

      .slide-wrapper:nth-child(4n + 2) img {
        transform-origin: right top;
      }

      .slide-wrapper:nth-child(4n + 3) img {
        transform-origin: left top;
      }

      .slide-wrapper:nth-child(4n + 4) img {
        transform-origin: right bottom;
      }

      .title {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        color: white;
        font-size: 50px;
      }
    `,
  ];
}
