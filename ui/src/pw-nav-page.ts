import { LitElement, css, html } from 'lit';
import { customElement, property, query } from 'lit/decorators.js';
import { Me } from './app/interfaces.js';
import { consume } from '@lit/context';
import { meContext } from './app/context.js';
import { login, logout } from './app/login.js';
import { ThemeManager } from './shoelace-config.js';
import { SlDialog } from '@shoelace-style/shoelace';
import { get_json } from './app/api.js';

/**
 * Album browser component that shows available photo albums.
 */
@customElement('pw-nav-page')
export class PwNavPage extends LitElement {
  static styles = css`
    :host {
      display: block;
      height: 100vh;
      overflow: hidden;
      font-family: sans-serif;
    }

    .app-container {
      display: flex;
      flex-direction: column;
      height: 100vh;
    }

    /* Navigation Bar */
    .navbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0 20px;
      height: 60px;
      background: #2c3e50;
      color: white;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      z-index: 1000;
    }

    .navbar-right {
      display: flex;
      align-items: center;
      gap: 0;
    }

    .nav-title {
      font-size: 1.5rem;
      font-weight: bold;
      cursor: pointer;
      transition: color 0.3s;
    }

    .nav-title:hover {
      color: #3498db;
    }

    .nav-user {
      position: relative;
      display: flex;
      align-items: center;
      gap: 1px;
    }

    /* Shoelace component overrides for navbar */
    .navbar sl-button[slot='trigger'] {
      color: white;
    }

    .navbar sl-button[slot='trigger']::part(base) {
      color: white;
      border: none;
      background: transparent;
    }

    .navbar sl-button[slot='trigger']:hover::part(base) {
      background: rgba(255, 255, 255, 0.1);
    }

    .navbar sl-icon {
      color: white;
    }

    /* Theme toggle button */
    .theme-toggle::part(base) {
      color: white;
      border: none;
      background: transparent;
      padding: 12px;
      border-radius: 4px;
      transition: background-color 0.3s;
    }

    .theme-toggle:hover::part(base) {
      background: rgba(255, 255, 255, 0.1);
    }

    /* Icon hover effects */
    .nav-user a {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 12px;
      border-radius: 4px;
      transition: background-color 0.3s;
      text-decoration: none;
    }

    .nav-user a:hover {
      background: rgba(255, 255, 255, 0.1);
    }

    /* Main Content Area */
    main {
      flex: 1;
      height: calc(100vh - 60px);
      overflow: hidden;
    }

    /* Common styles for dropdown menu items */
    sl-menu sl-menu-item {
      --sl-spacing-medium: 8px;
    }

    sl-menu sl-menu-item::part(base) {
      padding: 8px 16px;
      min-height: auto;
    }

    sl-menu sl-menu-item a {
      text-decoration: none;
      color: inherit;
    }
  `;

  @property({ type: Boolean }) parentIsDoc = false;

  @consume({ context: meContext, subscribe: true })
  @property({ attribute: false })
  private me!: Me;

  @query('#reload-dialog')
  private reload_dialog!: SlDialog;

  @query('#cache-dialog')
  private cache_dialog!: SlDialog;

  private themeManager = ThemeManager.getInstance();

  override render() {
    return html`
      <div class="app-container">
        <!-- Navigation Bar -->
        <nav class="navbar">
          <div class="nav-title" @click="${this.handleAlbumClick}">${import.meta.env.VITE_TITLE || 'Photo Web'}</div>
          <div class="navbar-right">
            <slot name="nav-controls"></slot>
            <div class="nav-user">
              <sl-tooltip content="Toggle between Photo Albums and Documents">
                ${this.parentIsDoc
                  ? html`<sl-button variant="text" size="medium" @click="${this.handleAlbumClick}" class="theme-toggle">
                      <sl-icon name="images"></sl-icon>
                    </sl-button>`
                  : html`<sl-button variant="text" size="medium" @click="${this.handleDocClick}" class="theme-toggle">
                      <sl-icon name="file-text"></sl-icon>
                    </sl-button>`}
              </sl-tooltip>
              <sl-tooltip content="Toggle between dark and light mode">
                <sl-button variant="text" size="medium" @click="${this.toggleTheme}" class="theme-toggle">
                  <sl-icon name="${this.themeManager.getCurrentTheme() === 'dark' ? 'sun' : 'moon'}"></sl-icon>
                </sl-button>
              </sl-tooltip>
              ${this.isAdmin() ? this.renderPulldown() : ''} 
              ${this.me?.email ? this.renderUserAvatar() : this.renderLoginButton()}
            </div>
          </div>
        </nav>

        <!-- Main Content Area -->
        <main>
          <slot></slot>
        </main>
      </div>

      <!-- Reload DB Dialog -->
      <sl-dialog id="reload-dialog" label="Database Reload" no-header contained>
        <div style="display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 20px;" role="status" aria-live="polite">
          <sl-spinner style="font-size: 2rem;" aria-label="Loading"></sl-spinner>
          <div>Reloading album information from Apple Photo DB ...<br />This takes about a minute!</div>
        </div>
      </sl-dialog>

      <!-- Clear Cache Dialog -->
      <sl-dialog id="cache-dialog" label="Clear Cache Result">
        <div id="cache-result" style="padding: 20px; white-space: pre-wrap; font-family: monospace;"></div>
        <sl-button slot="footer" variant="primary" @click="${() => this.cache_dialog.hide()}">Close</sl-button>
      </sl-dialog>
    `;
  }

  private renderPulldown() {
    return html`
      <sl-dropdown close-on-select>
        <sl-button slot="trigger" variant="text" size="medium">
          <sl-icon name="three-dots-vertical"></sl-icon>
        </sl-button>
        <sl-menu>
          <sl-menu-item @click=${() => this.handleNavigation('users')}>Users ...</sl-menu-item>
          <sl-menu-item @click=${() => this.handleNavigation('tests')}>Tests ...</sl-menu-item>
          <sl-menu-item @click=${() => this.handleNavigation('/ui/traefik-dashboard')}>Traefik Dashboard ...</sl-menu-item>
          <sl-menu-item @click=${() => this.handleNavigation('/ui/auth-api')}>Auth API ...</sl-menu-item>
          <sl-menu-item @click=${() => this.handleNavigation('/ui/photos-api')}>Photos API ...</sl-menu-item>
          <sl-menu-item @click=${() => this.handleNavigation('/ui/doc-api')}>Doc API ...</sl-menu-item>
          <sl-menu-item @click=${() => this.handleNavigation('/ui/img-size-test')}>Image Size Test ...</sl-menu-item>
          <sl-menu-item @click=${this.clearCacheDialog}>Clear Photo Cache</sl-menu-item>
          <sl-menu-item @click=${this.reloadDialog}>Reload DB</sl-menu-item>
        </sl-menu>
      </sl-dropdown>
    `;
  }

  private renderUserAvatar() {
    return html`
      <sl-dropdown close-on-select>
        <sl-avatar
          slot="trigger"
          image="${this.me?.picture || '/default-avatar.png'}"
          label="${this.me?.name || 'User Avatar'}"
          style="cursor: pointer; --size: 40px;"
        >
        </sl-avatar>
        <sl-menu>
          <sl-menu-item style="pointer-events: none;">
            <div style="padding: 8px 0;">
              <div style="font-weight: bold; margin-bottom: 4px;">${this.me?.name || 'Unknown User'}</div>
              <div style="font-size: 0.9rem; color: var(--sl-color-neutral-600);">${this.me?.email || ''}</div>
            </div>
          </sl-menu-item>
          <sl-menu-item>
            <sl-button variant="danger" size="small" @click="${this.handleLogout}" style="width: 100%;"> Logout </sl-button>
          </sl-menu-item>
        </sl-menu>
      </sl-dropdown>
    `;
  }

  private renderLoginButton() {
    return html`
      <sl-button variant="primary" @click="${this.handleLogin}">
        <sl-icon name="person-circle" slot="prefix"></sl-icon>
        Login
      </sl-button>
    `;
  }

  private isAdmin(): boolean {
    return this.me?.roles?.includes('admin') || false;
  }

  private toggleTheme() {
    this.themeManager.toggleTheme();
    // Force a re-render to update the theme display in the menu
    this.requestUpdate();
  }

  private async reloadDialog() {
    // Show the dialog and wait for it to be fully rendered
    this.reload_dialog.show();
    await this.reloadDb();
  }

  private async clearCacheDialog() {
    try {
      const resp = await get_json('/photos/api/clear-nginx-cache');
      const cacheResult = this.shadowRoot?.querySelector('#cache-result');
      if (cacheResult) {
        cacheResult.textContent = JSON.stringify(resp, null, 2);
      }
      this.cache_dialog.show();
    } catch (error) {
      const cacheResult = this.shadowRoot?.querySelector('#cache-result');
      if (cacheResult) {
        cacheResult.textContent = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
      this.cache_dialog.show();
    }
  }

  private async reloadDb() {
    try {
      const resp = await get_json('/photos/api/reload-db');
      console.log('reload-db', resp);
    } catch (e) {
      if (e instanceof Error) {
        console.log(`failed to reload db: ${e.message}`);
      }
    } finally {
      this.reload_dialog.focus();
      this.reload_dialog.hide();
    }
  }

  private handleLogin() {
    login('/ui');
  }

  private async handleLogout() {
    await logout('/ui');
  }

  private handleAlbumClick() {
    window.location.href = '/ui/album';
  }

  private handleDocClick() {
    window.location.href = '/ui/doc';
  }

  private handleNavigation(url: string) {
    window.location.href = url;
  }
}
