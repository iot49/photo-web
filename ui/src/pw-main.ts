import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import { Albums, Me, SrcsetInfo } from './app/interfaces';
import { provide } from '@lit/context';
import { albumsContext, meContext, srcsetInfoContext } from './app/context';
import { get_json } from './app/api';

const DEBUG_NAV = false;
const DEBUG = false;

// Type declarations for Navigation API
declare global {
  interface Window {
    navigation?: any; // Using any for simplicity since Navigation API is experimental
  }
}

// Interface for navigate event
interface NavigateEvent extends Event {
  readonly canIntercept: boolean;
  readonly destination: { url: string };
  readonly navigationType: string;
  readonly userInitiated: boolean;
  intercept(options?: { handler?: () => Promise<void> }): void;
}

/**
 * Main application component for Photo Web.
 * Routes requests and exports albums.
 */
@customElement('pw-main')
export class PwMain extends LitElement {
  // Cache for lazily loaded components
  private componentCache = new Map<string, HTMLElement>();
  static styles = css`
    .fallback-message {
      position: absolute;
      z-index: -1;
    }

    main *[display='block'] {
      position: relative;
      z-index: 1;
    }

    main *[display='none'] {
      display: none !important;
    }
  `;

  // Albums and me data automatically reload on login/logout via handleLoginLogoutEvents()
  @provide({ context: albumsContext })
  @state()
  albums: Albums = {};
  @provide({ context: meContext })
  @state()
  me: Me = {} as Me;
  @provide({ context: srcsetInfoContext })
  @state()
  srcsetInfo: SrcsetInfo = [] as SrcsetInfo;

  private uri = '';
  private playlist = '';

  async connectedCallback() {
    super.connectedCallback();

    // Load contexts
    this.albums = await get_json('/photos/api/albums');
    this.me = await get_json('/auth/me');
    this.srcsetInfo = await get_json('/photos/api/photos/srcset');

    // Add event listeners for login/logout events
    this.handleLoginLogoutEvents();

    // Intercept navigation events using the modern Navigation API
    this.setupNavigationInterception();
  }

  private handleLoginLogoutEvents() {
    const refreshData = async () => {
      if (DEBUG) console.log('Auth state changed, refreshing albums and me');
      this.albums = await get_json('/photos/api/albums');
      this.me = await get_json('/auth/me');
      
      // NOTE: this is probably not required. Components check out state.
      // Clear component cache on auth state change to ensure components
      // are recreated with the new authentication context
      // this.clearComponentCache();
      
      this.requestUpdate(); // Force a re-render to ensure context consumers update
    };

    // Listen for both login and logout events with the same handler
    window.addEventListener('pw-login', refreshData);
    window.addEventListener('pw-logout', refreshData);
  }

  private setupNavigationInterception() {
    // Track current URL to detect changes
    let currentUrl = window.location.href;

    // Method to handle URL changes from any source
    const handleUrlChange = (source: string, newUrl?: string) => {
      const url = newUrl || window.location.href;
      if (url !== currentUrl) {
        if (DEBUG_NAV)
          console.log(`URL changed via ${source}:`, {
            from: currentUrl,
            to: url,
            pathname: window.location.pathname,
            search: window.location.search,
            hash: window.location.hash,
          });

        currentUrl = url;

        // Handle the navigation if it's within our app
        if (this.shouldInterceptNavigation(url)) {
          if (DEBUG_NAV) console.log('Processing navigation to:', url);

          // Update URI and playlist from the new URL
          const urlObj = new URL(url);
          this.uri = urlObj.pathname;

          // Parse playlist from URL search parameters
          const urlParams = new URLSearchParams(urlObj.search);
          const playlistParam = urlParams.get('playlist');
          if (playlistParam) {
            this.playlist = playlistParam;
            if (DEBUG_NAV) console.log('playlist updated', this.playlist);
          }

          this.requestUpdate(); // Force re-render for URL changes
        }
      }
    };

    // 1. Navigation API for modern browsers (programmatic navigation)
    if ('navigation' in window && window.navigation) {
      window.navigation.addEventListener('navigate', (event: NavigateEvent) => {
        if (DEBUG_NAV)
          console.log('Navigation API event:', {
            url: event.destination.url,
            canIntercept: event.canIntercept,
            navigationType: event.navigationType,
            userInitiated: event.userInitiated,
          });

        // Handle the URL change
        handleUrlChange('Navigation API', event.destination.url);

        // Only intercept navigations that can be intercepted and are within our app
        if (event.canIntercept && this.shouldInterceptNavigation(event.destination.url)) {
          if (DEBUG_NAV) console.log('Intercepting navigation to:', event.destination.url);

          // Let the router handle the navigation
          event.intercept({
            handler: () => {
              // The router will handle the actual navigation
              // This ensures state is properly managed
              return Promise.resolve();
            },
          });
        }
      });
    }

    // 2. Popstate event for back/forward navigation
    window.addEventListener('popstate', (_event) => {
      handleUrlChange('popstate');
    });

    // 3. Polling mechanism to catch address bar changes that other methods miss
    // This is necessary because direct address bar typing doesn't always trigger events
    const pollInterval = 100; // Check every 100ms
    setInterval(() => {
      handleUrlChange('polling');
    }, pollInterval);

    // 4. Focus event as additional trigger (when user returns to tab after typing URL)
    window.addEventListener('focus', () => {
      handleUrlChange('focus');
    });

    // 5. Hashchange event for hash-only changes
    window.addEventListener('hashchange', (event) => {
      if (DEBUG_NAV) console.log('Hashchange event:', { oldURL: event.oldURL, newURL: event.newURL });
      handleUrlChange('hashchange');
    });

    if (DEBUG_NAV) console.log('Navigation interception', window.location.pathname, window.location.search);
    this.uri = window.location.pathname;

    // Parse playlist from URL search parameters
    const urlParams = new URLSearchParams(window.location.search);
    const playlistParam = urlParams.get('playlist');
    if (playlistParam) {
      this.playlist = playlistParam;
    }
  }

  private shouldInterceptNavigation(url: string): boolean {
    const urlObj = new URL(url);
    // Only intercept navigations within our app's UI routes
    return urlObj.pathname.startsWith('/ui/') || urlObj.pathname.startsWith('/doc/api/file/');
  }

  private getFilePathFromUri(): string | null {
    // Check if URI matches the pattern /doc/api/file/*
    const filePathPrefix = '/doc/api/file/';
    if (this.uri.startsWith(filePathPrefix)) {
      // Extract the file path portion after /doc/api/file/
      return this.uri.substring(filePathPrefix.length);
    }
    return null;
  }

  public render() {
    /*
    Implement lazy loading of components to avoid creating them all at startup.
    Components are only created when their route is first accessed, then reused on subsequent visits.
    This prevents issues like pw-users trying to fetch data when user lacks admin permissions.
    */
    const { hasActiveRoute, routeDefinitions } = this.getRouteInfo();

    return html`
      <main>
        <div class="fallback-message" style="display: ${hasActiveRoute ? 'none' : 'block'}">
          <p>no route to ${this.uri} (playlist = ${this.playlist})</p>
        </div>
        ${routeDefinitions.map(route =>
          this.renderLazyComponent(
            route.key,
            {
              isActive: route.isActive,
              display: route.isActive ? 'block' : 'none',
              ...(route.selectedFilePath !== undefined && { selectedFilePath: route.selectedFilePath })
            },
            route.componentFactory
          )
        )}
      </main>
    `;
  }

  /**
   * Renders a component lazily - only creates it when first needed, then reuses the instance.
   * @param componentKey - Unique key for the component in the cache
   * @param route - Route information including isActive and display properties
   * @param componentFactory - Function that returns the component template when called
   * @returns The component template with proper display styling, or empty template if not active
   */
  private renderLazyComponent(
    componentKey: string,
    route: { isActive: boolean; display: string; selectedFilePath?: string },
    componentFactory: () => any
  ) {
    // If the route is not active, don't render anything
    if (!route.isActive) {
      return html``;
    }

    // For components that depend on dynamic properties (playlist), always re-render
    // to ensure they get the latest values
    const routeDefinitions = this.getRouteDefinitions();
    const routeDefinition = routeDefinitions.find(r => r.key === componentKey);
    if (routeDefinition?.isDynamic) {
      if (DEBUG) console.log(`Re-rendering dynamic component for route: ${componentKey}`);
      const component = componentFactory();
      return html`<div style="display: ${route.display}">${component}</div>`;
    }

    // If component hasn't been created yet, create it and cache it
    if (!this.componentCache.has(componentKey)) {
      if (DEBUG) console.log(`Creating component for route: ${componentKey}`);
      // Create the component and store it in cache
      // Note: We'll render it with display block since it's active
      const component = componentFactory();
      this.componentCache.set(componentKey, component);
      return html`<div style="display: ${route.display}">${component}</div>`;
    }

    // Component exists in cache, reuse it
    if (DEBUG) console.log(`Reusing cached component for route: ${componentKey}`);
    const cachedComponent = this.componentCache.get(componentKey);
    return html`<div style="display: ${route.display}">${cachedComponent}</div>`;
  }

  private getRouteDefinitions() {
    const filePath = this.getFilePathFromUri();
    const selectedFilePath = filePath ? `/doc/api/file/${filePath}` : undefined;

    return [
      {
        key: 'album',
        isActive: this.uri === '/ui/album' || this.uri === '/ui' || this.uri === '/ui/',
        componentFactory: () => html`<pw-album-browser></pw-album-browser>`,
        isDynamic: false
      },
      {
        key: 'doc',
        isActive: this.uri === '/ui/doc' || this.getFilePathFromUri() !== null,
        componentFactory: () => html`<pw-doc-browser .selectedFilePath=${selectedFilePath}></pw-doc-browser>`,
        isDynamic: false,
        selectedFilePath
      },
      {
        key: 'users',
        isActive: this.uri === '/ui/users',
        componentFactory: () => html`<pw-users></pw-users>`,
        isDynamic: false
      },
      {
        key: 'tests',
        isActive: this.uri === '/ui/tests',
        componentFactory: () => html`<pw-tests></pw-tests>`,
        isDynamic: false
      },
      
      {
        key: 'traefik-dashboard',
        isActive: this.uri === '/ui/traefik-dashboard',
        componentFactory: () => html`<pw-nav-page><iframe src="https://traefik.${location.host}" style="width: 100%; height: 100%; border: none;"></iframe></pw-nav-page>`,
        isDynamic: false
      },
      {
        key: 'auth-api',
        isActive: this.uri === '/ui/auth-api',
        componentFactory: () => html`<pw-nav-page><iframe src="/auth/docs" style="width: 100%; height: 100%; border: none;"></iframe></pw-nav-page>`,
        isDynamic: false
      },
      {
        key: 'photos-api',
        isActive: this.uri === '/ui/photos-api',
        componentFactory: () => html`<pw-nav-page><iframe src="/photos/docs" style="width: 100%; height: 100%; border: none;"></iframe></pw-nav-page>`,
        isDynamic: false
      },
      {
        key: 'doc-api',
        isActive: this.uri === '/ui/doc-api',
        componentFactory: () => html`<pw-nav-page><iframe src="/doc/docs" style="width: 100%; height: 100%; border: none;"></iframe></pw-nav-page>`,
        isDynamic: false
      },
      {
        key: 'slideshow',
        isActive: this.uri === '/ui/slideshow',
        componentFactory: () => html`<pw-ken-burns uuid=${this.playlist}></pw-ken-burns>`,
        isDynamic: true
      },
      {
        key: 'carousel',
        isActive: this.uri === '/ui/carousel',
        componentFactory: () => html`<pw-carousel uuid=${this.playlist}></pw-carousel>`,
        isDynamic: true
      }
    ];
  }

  private getRouteInfo() {
    const routeDefinitions = this.getRouteDefinitions();
    
    // Convert route definitions to the legacy format for backward compatibility
    const routes: Record<string, any> = {};
    routeDefinitions.forEach(route => {
      routes[route.key.replace('-', '_')] = {
        isActive: route.isActive,
        display: route.isActive ? 'block' : 'none',
        ...(route.selectedFilePath !== undefined && { selectedFilePath: route.selectedFilePath })
      };
    });

    // Check if any route is active
    const hasActiveRoute = routeDefinitions.some(route => route.isActive);

    return { routes, hasActiveRoute, routeDefinitions };
  }

  /**
   * Clears the component cache. Useful for memory management or when you want to force
   * components to be recreated (e.g., after a major state change).
   * @param componentKey - Optional specific component to clear, or clear all if not provided
   */
  public clearComponentCache(componentKey?: string) {
    if (componentKey) {
      if (this.componentCache.has(componentKey)) {
        if (DEBUG) console.log(`Clearing cached component: ${componentKey}`);
        this.componentCache.delete(componentKey);
      }
    } else {
      if (DEBUG) console.log('Clearing all cached components');
      this.componentCache.clear();
    }
  }
}
