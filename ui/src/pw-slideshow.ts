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
**ken-burns**:
1) Transition opacity of .next from 0 to 1 over TRANSITION_MS,
2) Render slide initially with
        object-fit: cover;
        object-position: change depending on slide position, e.g.
              .slide-wrapper:nth-child(4n + 1) img {
                object-position: top left;
              }

              .slide-wrapper:nth-child(4n + 2) img {
                object-position: bottom right;
              }

              .slide-wrapper:nth-child(4n + 3) img {
                object-position: bottom left;
              }

              .slide-wrapper:nth-child(4n + 4) img {
                object-position: top right;
              }
3) Then over SLIDE_MS seconds transition to 
        object-position: move to align diagonally oposite corner of slide, e.g.
              .slide-wrapper:nth-child(4n + 1) img {
                object-position: bottom right;
              }

              .slide-wrapper:nth-child(4n + 2) img {
                object-position: top left;
              }

              .slide-wrapper:nth-child(4n + 3) img {
                object-position: top right;
              }

              .slide-wrapper:nth-child(4n + 4) img {
                object-position: bottom left;
              }

        scale slide by SCALE_FACTOR;
*/

const TRANSITION_MS = 1500; // duration of slide transition in [ms]
const SLIDE_MS = 3000; // time each slide is shown in [ms]; note: extra wide or tall slides take more time
// const PANORAMA_TIME = 3; // increase parnorama image animation time by up to this factor
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
  @property({ type: Boolean }) autoplay = false;

  // List of arrays of PhotoModels for each album
  @state() private photos!: PhotoModel[][];

  // Index into #slideshow.children: slide-wrapper
  @state() currentIndex = 0;

  private useSrcSet = true;

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
    // console.log(`N = ${N} curr = ${this.currentIndex} next = ${nextIndex}`, slides[nextIndex])

    // hide all slides
    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i] as HTMLElement;
      slide.classList.remove('last');
      slide.classList.remove('next');
    }
    
    // then show last and next slide with selected theme
    slides[this.currentIndex].classList.add('last');
    slides[nextIndex].classList.add('next');


    // Update current index
    this.currentIndex = nextIndex;
    
    // Only schedule next transition if autoplay is enabled
    if (this.autoplay) {
      setTimeout(() => this.goto(nextIndex+1), SLIDE_MS);
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
      <div class="overlay prev-overlay" @click=${() => this.goto(this.currentIndex-1)}></div>
      <div class="overlay next-overlay" @click=${() => this.goto(this.currentIndex+1)}></div>
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
      if (this.useSrcSet)
          // BUG: browser chooses too low a resolution for panoramic images (e.g. that undergo big translations with ken-burns theme)
          return html` <img src=${uri} srcset=${this.generateSrcset(photo.uuid)} sizes="100vw" alt="${photo.title || 'Photo'}" loading="lazy" />`;
      else
          return html` <img src=${uri} alt="${photo.title || 'Photo'}" loading="lazy" />`;
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
      :host([theme="plain"]) .last {
        opacity: 0;
        z-index: 1;
      }

      :host([theme="plain"]) .next {
        opacity: 1;
        z-index: 2;
      }

      /* Ken Burns theme: opacity, translation, scaling */

      @keyframes ken-burns-fade {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      @keyframes ken-burns-pan-1 {
        from { object-position: top left; }
        to { object-position: bottom right; }
      }

      @keyframes ken-burns-pan-2 {
        from { object-position: bottom right; }
        to { object-position: top left; }
      }

      @keyframes ken-burns-pan-3 {
        from { object-position: bottom left; }
        to { object-position: top right; }
      }

      @keyframes ken-burns-pan-4 {
        from { object-position: top right; }
        to { object-position: bottom left; }
      }

      @keyframes ken-burns-scale {
        from { transform: scale(1); }
        to { transform: scale(${SCALE_FACTOR}); }
      }

      /* Ken Burns theme: fade in + slow zoom/pan */
      :host([theme="ken-burns"]) .last {
        opacity: 1;
        z-index: 1;
      }

      :host([theme="ken-burns"]) .next {
        opacity: 0;
        z-index: 2;
        animation-name: ken-burns-fade;
        animation-duration: ${TRANSITION_MS}ms;
        animation-fill-mode: forwards;
        animation-timing-function: linear;
      }

      :host([theme="ken-burns"]) .slide-wrapper img,
      :host([theme="ken-burns"]) .slide-wrapper video {
        object-fit: cover;
      }

      /* Position-dependent starting positions and animations */
      :host([theme="ken-burns"]) .slide-wrapper:nth-child(4n + 1) img,
      :host([theme="ken-burns"]) .slide-wrapper:nth-child(4n + 1) video {
        object-position: top left;
      }

      :host([theme="ken-burns"]) .slide-wrapper:nth-child(4n + 2) img,
      :host([theme="ken-burns"]) .slide-wrapper:nth-child(4n + 2) video {
        object-position: bottom right;
      }

      :host([theme="ken-burns"]) .slide-wrapper:nth-child(4n + 3) img,
      :host([theme="ken-burns"]) .slide-wrapper:nth-child(4n + 3) video {
        object-position: bottom left;
      }

      :host([theme="ken-burns"]) .slide-wrapper:nth-child(4n + 4) img,
      :host([theme="ken-burns"]) .slide-wrapper:nth-child(4n + 4) video {
        object-position: top right;
      }

      /* Position-dependent animations for active slides */
      :host([theme="ken-burns"]) .next:nth-child(4n + 1) img,
      :host([theme="ken-burns"]) .next:nth-child(4n + 1) video {
        animation-name: ken-burns-pan-1, ken-burns-scale;
        animation-duration: ${SLIDE_MS}ms;
        animation-fill-mode: forwards;
        animation-timing-function: linear;
      }

      :host([theme="ken-burns"]) .next:nth-child(4n + 2) img,
      :host([theme="ken-burns"]) .next:nth-child(4n + 2) video {
        animation-name: ken-burns-pan-2, ken-burns-scale;
        animation-duration: ${SLIDE_MS}ms;
        animation-fill-mode: forwards;
        animation-timing-function: linear;
      }

      :host([theme="ken-burns"]) .next:nth-child(4n + 3) img,
      :host([theme="ken-burns"]) .next:nth-child(4n + 3) video {
        animation-name: ken-burns-pan-3, ken-burns-scale;
        animation-duration: ${SLIDE_MS}ms;
        animation-fill-mode: forwards;
        animation-timing-function: linear;
      }

      :host([theme="ken-burns"]) .next:nth-child(4n + 4) img,
      :host([theme="ken-burns"]) .next:nth-child(4n + 4) video {
        animation-name: ken-burns-pan-4, ken-burns-scale;
        animation-duration: ${SLIDE_MS}ms;
        animation-fill-mode: forwards;
        animation-timing-function: linear;
      }

      /* Slideshow controls: prev, next, start/stop animation, ... */

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

      .prev-overlay {
        left: 0%;
      }
      .next-overlay {
        right: 0%;
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
