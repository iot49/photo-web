import { html, LitElement, css, PropertyValues } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { consume } from '@lit/context';
import { meContext } from './app/context';
import { Me } from './app/me';

@customElement('pw-slideshow-overlay')
export class PwSlideshowOverlay extends LitElement {
  @consume({ context: meContext, subscribe: true })
  private me!: Me;  // always defined: render waits until me is available

  @query('#overlays') overlays!: HTMLDivElement;

  // Autoplay status from parent
  @property({ type: Boolean }) autoplay = false;

  // Overlay visibility state
  @state() private overlaysVisible = false;

  // Timeout ID for overlay auto-hide
  private overlayTimeoutId: number | null = null;

  protected firstUpdated(_changedProperties: PropertyValues): void {
    super.firstUpdated(_changedProperties);
    this.setupOverlayHandlers();
  }

  private setupOverlayHandlers() {
    if (!this.overlays) {
      setTimeout(() => this.setupOverlayHandlers(), 300);
      return;
    }

    // Add event listeners for mouse movement and clicks
    this.overlays.addEventListener('mousemove', this.handleOverlayActivity);
    this.overlays.addEventListener('click', this.handleOverlayActivity);
    this.overlays.addEventListener('mouseleave', this.handleOverlayMouseLeave);
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
          <label>Theme: ${config.theme === 'ken-burns' ? 'Ken Burns' : 'Carousel'}</label>
          <sl-switch
            ?checked=${config.theme === 'ken-burns'}
            @sl-change=${this.handleThemeChange}
          >
            ${config.theme === 'ken-burns' ? 'Ken Burns' : 'Carousel'}
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

  disconnectedCallback() {
    super.disconnectedCallback();
    // Clean up timeout when component is removed
    if (this.overlayTimeoutId !== null) {
      clearTimeout(this.overlayTimeoutId);
      this.overlayTimeoutId = null;
    }
  }

  override render() {
    return html`
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
    }, 1200);
  };

  private handleOverlayMouseLeave = () => {
    // Hide overlays immediately when mouse leaves the overlay area
    this.overlaysVisible = false;
    
    // Clear existing timeout
    if (this.overlayTimeoutId !== null) {
      clearTimeout(this.overlayTimeoutId);
      this.overlayTimeoutId = null;
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
    
    // Dispatch custom event to parent
    this.dispatchEvent(new CustomEvent('pw-prev-slide', {
      bubbles: true,
      composed: true
    }));
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
    
    // Dispatch custom event to parent
    this.dispatchEvent(new CustomEvent('pw-next-slide', {
      bubbles: true,
      composed: true
    }));
  }

  private toggleAutoplay() {
    // Dispatch custom event to parent
    this.dispatchEvent(new CustomEvent('pw-toggle-autoplay', {
      bubbles: true,
      composed: true
    }));
  }

  private endSlideshow() {
    // Dispatch custom event to parent
    this.dispatchEvent(new CustomEvent('pw-end-slideshow', {
      bubbles: true,
      composed: true
    }));
  }

  private handleThemeChange = (e: CustomEvent) => {
    const isKenBurns = (e.target as any).checked;
    const newTheme = isKenBurns ? 'ken-burns' : 'carousel';
    
    // Dispatch config change event
    this.dispatchConfigChange({
      slideshow: {
        theme: newTheme
      }
    });
  };

  private handleDurationChange = (e: CustomEvent) => {
    const value = parseFloat((e.target as any).value);
    this.dispatchConfigChange({
      slideshow: {
        duration: value
      }
    });
  };

  private handleTransitionChange = (e: CustomEvent) => {
    const value = parseFloat((e.target as any).value);
    this.dispatchConfigChange({
      slideshow: {
        transition: value
      }
    });
  };

  private handlePanoramaChange = (e: CustomEvent) => {
    const value = parseFloat((e.target as any).value);
    this.dispatchConfigChange({
      slideshow: {
        panorama: value
      }
    });
  };

  private handleScaleFactorChange = (e: CustomEvent) => {
    const value = parseFloat((e.target as any).value);
    this.dispatchConfigChange({
      slideshow: {
        scale_factor: value
      }
    });
  };

  private dispatchConfigChange(changes: any) {
    const event = new CustomEvent('pw-config-changed', {
      detail: changes,
      bubbles: true,
      composed: true
    });
    window.dispatchEvent(event);
  }

  static styles = [
    css`
      :host {
        position: absolute;
        top: 20px;
        right: 20px;
        bottom: 50px;
        left: 20px;
        z-index: 10;
        pointer-events: none;
      }

      #overlays {
        position: relative;
        width: 100%;
        height: 100%;
        pointer-events: auto;
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