/**
 * Streamlined Shoelace configuration
 * Only imports the components that are actually used in the application
 */

// Import both light and dark theme CSS
import '@shoelace-style/shoelace/dist/themes/light.css';
import '@shoelace-style/shoelace/dist/themes/dark.css';

// Import only the components we actually use
import '@shoelace-style/shoelace/dist/components/icon/icon.js';
import '@shoelace-style/shoelace/dist/components/spinner/spinner.js';
import '@shoelace-style/shoelace/dist/components/tree/tree.js';
import '@shoelace-style/shoelace/dist/components/tree-item/tree-item.js';
import '@shoelace-style/shoelace/dist/components/split-panel/split-panel.js';
import '@shoelace-style/shoelace/dist/components/dropdown/dropdown.js';
import '@shoelace-style/shoelace/dist/components/menu/menu.js';
import '@shoelace-style/shoelace/dist/components/menu-item/menu-item.js';
import '@shoelace-style/shoelace/dist/components/avatar/avatar.js';
import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/carousel/carousel.js';
import '@shoelace-style/shoelace/dist/components/carousel-item/carousel-item.js';

// Set the base path for Shoelace assets
import { setBasePath } from '@shoelace-style/shoelace/dist/utilities/base-path.js';

// Configure the base path for icons and other assets
// This points to the CDN for icons since we're not bundling them
setBasePath('https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.20.1/cdn/');

// Theme management
export class ThemeManager {
  private static instance: ThemeManager;
  private currentTheme: 'light' | 'dark' = 'light';

  private constructor() {
    this.initializeTheme();
  }

  public static getInstance(): ThemeManager {
    if (!ThemeManager.instance) {
      ThemeManager.instance = new ThemeManager();
    }
    return ThemeManager.instance;
  }

  private initializeTheme(): void {
    // Check for saved theme preference or default to system preference
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    
    if (savedTheme) {
      this.currentTheme = savedTheme;
    } else {
      // Use system preference
      this.currentTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    
    this.applyTheme();
    
    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem('theme')) {
        this.currentTheme = e.matches ? 'dark' : 'light';
        this.applyTheme();
      }
    });
  }

  private applyTheme(): void {
    document.documentElement.setAttribute('theme', this.currentTheme);
    document.documentElement.classList.toggle('sl-theme-dark', this.currentTheme === 'dark');
    document.documentElement.classList.toggle('sl-theme-light', this.currentTheme === 'light');
    
    // Dispatch custom event for components that need to react to theme changes
    window.dispatchEvent(new CustomEvent('theme-changed', {
      detail: { theme: this.currentTheme }
    }));
  }

  public setTheme(theme: 'light' | 'dark'): void {
    this.currentTheme = theme;
    localStorage.setItem('theme', theme);
    this.applyTheme();
  }

  public toggleTheme(): void {
    this.setTheme(this.currentTheme === 'light' ? 'dark' : 'light');
  }

  public getCurrentTheme(): 'light' | 'dark' {
    return this.currentTheme;
  }
}

// Initialize theme manager
ThemeManager.getInstance();

// Export types for components we use
export type { SlTreeItem } from '@shoelace-style/shoelace';