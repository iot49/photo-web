/**
 * Swipe gesture handler for touch devices
 * Provides clean swipe detection with configurable callbacks
 */

export interface SwipeConfig {
  minSwipeDistance?: number;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  preventDefaultOnSwipe?: boolean;
}

export interface TouchState {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  isActive: boolean;
}

export class SwipeHandler {
  private element: HTMLElement;
  private config: Required<SwipeConfig>;
  private touch: TouchState = {
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
    isActive: false
  };

  constructor(element: HTMLElement, config: SwipeConfig) {
    this.element = element;
    this.config = {
      minSwipeDistance: config.minSwipeDistance ?? 50,
      onSwipeLeft: config.onSwipeLeft ?? (() => {}),
      onSwipeRight: config.onSwipeRight ?? (() => {}),
      onSwipeUp: config.onSwipeUp ?? (() => {}),
      onSwipeDown: config.onSwipeDown ?? (() => {}),
      preventDefaultOnSwipe: config.preventDefaultOnSwipe ?? true
    };

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Use capture=true to intercept events before they reach child elements
    this.element.addEventListener('touchstart', this.handleTouchStart.bind(this), { 
      passive: false, 
      capture: true 
    });
    this.element.addEventListener('touchend', this.handleTouchEnd.bind(this), { 
      passive: false, 
      capture: true 
    });
    this.element.addEventListener('touchmove', this.handleTouchMove.bind(this), { 
      passive: false, 
      capture: true 
    });
  }

  private handleTouchStart(event: TouchEvent): void {
    if (event.touches.length === 1) {
      this.touch.startX = event.touches[0].clientX;
      this.touch.startY = event.touches[0].clientY;
      this.touch.isActive = true;
    }
  }

  private handleTouchMove(event: TouchEvent): void {
    if (!this.touch.isActive || event.touches.length !== 1) return;
    
    const currentX = event.touches[0].clientX;
    const currentY = event.touches[0].clientY;
    const deltaX = Math.abs(currentX - this.touch.startX);
    const deltaY = Math.abs(currentY - this.touch.startY);
    
    // If horizontal movement is greater than vertical, prevent default scrolling
    if (deltaX > deltaY && deltaX > 10) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  private handleTouchEnd(event: TouchEvent): void {
    if (!this.touch.isActive || event.changedTouches.length !== 1) return;
    
    this.touch.endX = event.changedTouches[0].clientX;
    this.touch.endY = event.changedTouches[0].clientY;
    this.touch.isActive = false;
    
    const wasSwipe = this.detectAndHandleSwipe();
    
    // Only prevent default behavior if it was actually a swipe
    if (wasSwipe && this.config.preventDefaultOnSwipe) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  private detectAndHandleSwipe(): boolean {
    const deltaX = this.touch.endX - this.touch.startX;
    const deltaY = this.touch.endY - this.touch.startY;
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);

    // Check if movement meets minimum distance threshold
    if (Math.max(absDeltaX, absDeltaY) < this.config.minSwipeDistance) {
      return false;
    }

    // Determine swipe direction based on the larger movement
    if (absDeltaX > absDeltaY) {
      // Horizontal swipe
      if (deltaX > 0) {
        this.config.onSwipeRight();
      } else {
        this.config.onSwipeLeft();
      }
    } else {
      // Vertical swipe
      if (deltaY > 0) {
        this.config.onSwipeDown();
      } else {
        this.config.onSwipeUp();
      }
    }

    return true;
  }

  /**
   * Remove event listeners and clean up
   */
  public destroy(): void {
    this.element.removeEventListener('touchstart', this.handleTouchStart.bind(this));
    this.element.removeEventListener('touchend', this.handleTouchEnd.bind(this));
    this.element.removeEventListener('touchmove', this.handleTouchMove.bind(this));
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<SwipeConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}

/**
 * Utility function to create a swipe handler with a simpler API
 */
export function createSwipeHandler(element: HTMLElement, config: SwipeConfig): SwipeHandler {
  return new SwipeHandler(element, config);
}