import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { Me } from './app/interfaces.js';
import { consume } from '@lit/context';
import { meContext } from './app/context.js';
import { login, logout } from './app/login.js';
import { ThemeManager } from './shoelace-config.js';

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
  `;

  @property({ type: Boolean }) parentIsDoc = false;

  @consume({ context: meContext, subscribe: true })
  @property({ attribute: false })
  private me!: Me;

  private themeManager = ThemeManager.getInstance();

  override render() {
    return html`
      <div class="app-container">
        <!-- Navigation Bar -->
        <nav class="navbar">
          <div class="nav-title" @click="${this.handleTitleClick}">${import.meta.env.VITE_TITLE || 'Photo Web'}</div>
          <slot name="nav-controls"></slot>
          <div class="nav-user">
            ${this.parentIsDoc
              ? html`<sl-button
                  variant="text"
                  size="medium"
                  @click="${this.handleAlbumClick}"
                  title="Go to Albums"
                  class="theme-toggle"
                >
                  <sl-icon name="images"></sl-icon>
                </sl-button>`
              : html`<sl-button
                  variant="text"
                  size="medium"
                  @click="${this.handleDocClick}"
                  title="Go to Documents"
                  class="theme-toggle"
                >
                  <sl-icon name="file-text"></sl-icon>
                </sl-button>`}
            <sl-button
              variant="text"
              size="medium"
              @click="${this.toggleTheme}"
              title="Toggle theme"
              class="theme-toggle"
            >
              <sl-icon name="${this.themeManager.getCurrentTheme() === 'dark' ? 'sun' : 'moon'}"></sl-icon>
            </sl-button>
            ${this.isAdmin() ? this.renderPulldown() : ''} 
            ${this.me?.email ? this.renderUserAvatar() : this.renderLoginButton()}
          </div>
        </nav>

        <!-- Main Content Area -->
        <main>
          <slot></slot>
        </main>
      </div>
    `;
  }

  private renderPulldown() {
    return html`
      <sl-dropdown close-on-select>
        <sl-button slot="trigger" variant="text" size="medium">
          <sl-icon name="three-dots-vertical"></sl-icon>
        </sl-button>
        <sl-menu>
          <sl-menu-item @click=${this.toggleTheme}> 🌙 Toggle Theme (${this.themeManager.getCurrentTheme()}) </sl-menu-item>
          <sl-menu-item>
            <a href="users" style="text-decoration: none; color: inherit;">Users ...</a>
          </sl-menu-item>
          <sl-menu-item>
            <a href="tests" style="text-decoration: none; color: inherit;">Tests ...</a>
          </sl-menu-item>
          <sl-menu-item>
            <a href="https://traefik.${location.host}" style="text-decoration: none; color: inherit;">Traefik Dashboard ...</a>
          </sl-menu-item>
          <sl-menu-item>
            <a href="${location.origin}/auth/docs" style="text-decoration: none; color: inherit;">Auth API ...</a>
          </sl-menu-item>
          <sl-menu-item>
            <a href="${location.origin}/photos/docs" style="text-decoration: none; color: inherit;">Photos API ...</a>
          </sl-menu-item>
          <sl-menu-item>
            <a href="${location.origin}/doc/docs" style="text-decoration: none; color: inherit;">Doc API ...</a>
          </sl-menu-item>
          <sl-menu-item @click=${this.reloadDb}>Reload DB</sl-menu-item>
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

  private async reloadDb() {
    console.log('reloading db');
    try {
      const resp = await fetch('/photos/api/reload-db');
      const text = await resp.text();
      console.log(text);
    } catch (e) {
      if (e instanceof Error) {
        console.log(`failed to reload db: ${e.message}`);
      }
    }
  }

  private handleLogin() {
    login('/ui');
  }

  private async handleLogout() {
    await logout('/ui');
  }

  private handleTitleClick() {
    window.location.href = '/';
  }

  private handleAlbumClick() {
    window.location.href = '/ui/album';
  }

  private handleDocClick() {
    window.location.href = '/ui/doc';
  }
}
