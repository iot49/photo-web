import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import { Albums, Me, SrcsetInfo } from './app/interfaces';
import { provide } from '@lit/context';
import { albumsContext, meContext, srcsetInfoContext } from './app/context';
import { get_json } from './app/api';

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
    .loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 400px;
      gap: 1rem;
    }

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

    /* Iframe styles for embedded API documentation and dashboard pages */
    iframe {
      width: 100%;
      height: 100%;
      border: none;
    }
  `;

  // Albums and me data automatically reload on login/logout via handleLoginLogoutEvents()
  @provide({ context: albumsContext })
  @state()
  albums!: Albums;

  @provide({ context: meContext })
  @state()
  me!: Me;

  @provide({ context: srcsetInfoContext })
  @state()
  srcsetInfo!: SrcsetInfo;

  @state() private isLoading = true;

  private uri = '';
  private queryParams = new URLSearchParams();

  async connectedCallback() {
    super.connectedCallback();

    // Load contexts
    this.albums = await get_json('/photos/api/albums');
    this.me = await get_json('/auth/me');
    this.srcsetInfo = new SrcsetInfo(await get_json('/photos/api/photos/srcset'));

    // Add event listeners for login/logout events
    this.handleLoginLogoutEvents();

    // Intercept navigation events using the modern Navigation API
    this.setupNavigationInterception();

    this.isLoading = false;
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
        if (DEBUG)
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
          // Update URI and query parameters from the new URL
          const urlObj = new URL(url);
          this.uri = urlObj.pathname;
          this.queryParams = urlObj.searchParams;

          this.requestUpdate(); // Force re-render for URL changes
        }
      }
    };

    // 1. Navigation API for modern browsers (programmatic navigation)
    if ('navigation' in window && window.navigation) {
      window.navigation.addEventListener('navigate', (event: NavigateEvent) => {
        // Handle the URL change
        handleUrlChange('Navigation API', event.destination.url);

        // Only intercept navigations that can be intercepted and are within our app
        if (event.canIntercept && this.shouldInterceptNavigation(event.destination.url)) {
          // console.log('Intercepting navigation to:', event.destination.url);

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
    window.addEventListener('hashchange', (_event) => {
      handleUrlChange('hashchange');
    });

    this.uri = window.location.pathname;
    this.queryParams = new URLSearchParams(window.location.search);
  }

  private shouldInterceptNavigation(url: string): boolean {
    const urlObj = new URL(url);
    // Only intercept navigations within our app's UI routes
    return urlObj.pathname.startsWith('/ui/') || urlObj.pathname.startsWith('/doc/api/file/');
  }

  /**
   * Helper method to check if current URI matches any of the provided URI patterns
   * @param uris Array of URI patterns to match against
   * @returns true if current URI matches any pattern
   */
  private matchesAnyUri(uris: string[]): boolean {
    return uris.some((uri) => this.uri === uri);
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
    if (this.isLoading) {
      return html`
        <div class="loading">
          <sl-spinner></sl-spinner>
          <p>Main loading contexts ...</p>
        </div>
      `;
    }
    /*
    Implement lazy loading of components to avoid creating them all at startup.
    Components are only created when their route is first accessed, then reused on subsequent visits.
    This prevents issues like pw-users trying to fetch data when user lacks admin permissions.
    */
    const { hasActiveRoute, routeDefinitions } = this.getRouteInfo();

    return html`
      <main>
        <div class="fallback-message" style="display: ${hasActiveRoute ? 'none' : 'block'}">
          <p>no route to ${this.uri}</p>
        </div>
        ${routeDefinitions.map((route) =>
          this.renderLazyComponent(
            route.routeId,
            {
              isActive: route.isActive,
              display: route.isActive ? 'block' : 'none',
              ...(route.selectedFilePath !== undefined && { selectedFilePath: route.selectedFilePath }),
            },
            route.componentFactory
          )
        )}
      </main>
    `;
  }

  /**
   * Renders a component lazily - only creates it when first needed, then reuses the instance.
   * @param routeId - Unique identifier for the route/component in the cache
   * @param route - Route information including isActive and display properties
   * @param componentFactory - Function that returns the component template when called
   * @returns The component template with proper display styling, or empty template if not active
   */
  private renderLazyComponent(
    routeId: string,
    route: { isActive: boolean; display: string; selectedFilePath?: string },
    componentFactory: () => any
  ) {
    // For components that depend on dynamic properties (playlist), always re-render
    // to ensure they get the latest values, and only show when active
    const routeDefinitions = this.getRouteDefinitions();
    const routeDefinition = routeDefinitions.find((r) => r.routeId === routeId);
    if (routeDefinition?.isDynamic) {
      if (!route.isActive) {
        return html``;
      }
      if (DEBUG) console.log(`Re-rendering dynamic component for route: ${routeId}`);
      const component = componentFactory();
      return html`<div style="display: ${route.display}">${component}</div>`;
    }

    // For non-dynamic components, keep them in the DOM to preserve state
    // If component hasn't been created yet, create it and cache it
    if (!this.componentCache.has(routeId)) {
      if (DEBUG) console.log(`Creating component for route: ${routeId}`);
      const component = componentFactory();
      this.componentCache.set(routeId, component);
    }

    // Always render non-dynamic components, but control visibility with display style
    if (DEBUG && route.isActive) console.log(`Showing cached component for route: ${routeId}`);
    const cachedComponent = this.componentCache.get(routeId);
    return html`<div style="display: ${route.display}">${cachedComponent}</div>`;
  }

  private getRouteDefinitions() {
    const filePath = this.getFilePathFromUri();
    const selectedFilePath = filePath ? `/doc/api/file/${filePath}` : undefined;

    /**
     * Route definition structure:
     * - routeId: Unique identifier for component caching and debugging (replaces 'key')
     * - matchUris: Array of URI patterns this route should match (replaces hardcoded isActive logic)
     * - componentFactory: Function that creates the component
     * - isDynamic: Whether component should be re-rendered on each activation
     * - description: Human-readable description of what this route does
     */
    return [
      {
        routeId: 'album',
        description: 'Photo album browser - main landing page',
        matchUris: ['/ui/album', '/ui', '/ui/'],
        isActive: this.matchesAnyUri(['/ui/album', '/ui', '/ui/']),
        componentFactory: () => html`<pw-album-browser></pw-album-browser>`,
        isDynamic: false,
      },
      {
        routeId: 'doc',
        description: 'Documentation browser with file viewer',
        matchUris: ['/ui/doc'],
        isActive: this.uri === '/ui/doc' || this.getFilePathFromUri() !== null,
        componentFactory: () => html`<pw-doc-browser .selectedFilePath=${selectedFilePath}></pw-doc-browser>`,
        isDynamic: false,
        selectedFilePath,
      },
      {
        routeId: 'users',
        description: 'User management interface (admin only)',
        matchUris: ['/ui/users'],
        isActive: this.matchesAnyUri(['/ui/users']),
        componentFactory: () => html`<pw-users></pw-users>`,
        isDynamic: true,
      },
      {
        routeId: 'tests',
        description: 'Test runner and results viewer',
        matchUris: ['/ui/tests'],
        isActive: this.matchesAnyUri(['/ui/tests']),
        componentFactory: () => html`<pw-tests></pw-tests>`,
        isDynamic: true,
      },
      {
        routeId: 'img-size-test',
        description: 'Responsive image size',
        matchUris: ['/ui/img-size-test'],
        isActive: this.matchesAnyUri(['/ui/img-size-test']),
        componentFactory: () => html`<pw-img-size></pw-img-size>`,
        isDynamic: true,
      },
      {
        routeId: 'traefik-dashboard',
        description: 'Traefik reverse proxy dashboard',
        matchUris: ['/ui/traefik-dashboard'],
        isActive: this.matchesAnyUri(['/ui/traefik-dashboard']),
        componentFactory: () => html`<pw-nav-page><iframe src="https://traefik.${location.host}"></iframe></pw-nav-page>`,
        isDynamic: true,
      },
      {
        routeId: 'auth-api',
        description: 'Authentication API documentation',
        matchUris: ['/ui/auth-api'],
        isActive: this.matchesAnyUri(['/ui/auth-api']),
        componentFactory: () => html`<pw-nav-page><iframe src="/auth/docs"></iframe></pw-nav-page>`,
        isDynamic: true,
      },
      {
        routeId: 'photos-api',
        description: 'Photos API documentation',
        matchUris: ['/ui/photos-api'],
        isActive: this.matchesAnyUri(['/ui/photos-api']),
        componentFactory: () => html`<pw-nav-page><iframe src="/photos/docs"></iframe></pw-nav-page>`,
        isDynamic: true,
      },
      {
        routeId: 'doc-api',
        description: 'Documentation API documentation',
        matchUris: ['/ui/doc-api'],
        isActive: this.matchesAnyUri(['/ui/doc-api']),
        componentFactory: () => html`<pw-nav-page><iframe src="/doc/docs"></iframe></pw-nav-page>`,
        isDynamic: true,
      },
      {
        routeId: 'slideshow',
        description: 'Photo slideshow with themes and playlists',
        matchUris: ['/ui/slideshow'],
        isActive: this.matchesAnyUri(['/ui/slideshow']),
        componentFactory: () => {
          // Use the preserved query parameters from the router state
          // This ensures we get the correct parameters even during navigation timing issues
          const urlParams = this.queryParams;
          const playlist = urlParams.get('playlist') || '';
          const theme = urlParams.get('theme') || 'ken-burns';
          // Handle autoplay parameter correctly - default to true, false only when explicitly set to 'false'
          const autoplayParam = urlParams.get('autoplay');
          const autoplay = autoplayParam === null ? true : autoplayParam !== 'false';

          return html`<pw-slideshow playlist=${playlist} theme=${theme} .autoplay=${autoplay}></pw-slideshow>`;
        },
        isDynamic: true,
      },
    ];
  }

  private getRouteInfo() {
    const routeDefinitions = this.getRouteDefinitions();

    // Convert route definitions to the legacy format for backward compatibility
    const routes: Record<string, any> = {};
    routeDefinitions.forEach((route) => {
      routes[route.routeId.replace('-', '_')] = {
        isActive: route.isActive,
        display: route.isActive ? 'block' : 'none',
        ...(route.selectedFilePath !== undefined && { selectedFilePath: route.selectedFilePath }),
      };
    });

    // Check if any route is active
    const hasActiveRoute = routeDefinitions.some((route) => route.isActive);

    return { routes, hasActiveRoute, routeDefinitions };
  }

  /**
   * Clears the component cache. Useful for memory management or when you want to force
   * components to be recreated (e.g., after a major state change).
   * @param routeId - Optional specific route/component to clear, or clear all if not provided
   */
  public clearComponentCache(routeId?: string) {
    if (routeId) {
      if (this.componentCache.has(routeId)) {
        if (DEBUG) console.log(`Clearing cached component: ${routeId}`);
        this.componentCache.delete(routeId);
      }
    } else {
      if (DEBUG) console.log('Clearing all cached components');
      this.componentCache.clear();
    }
  }
}
