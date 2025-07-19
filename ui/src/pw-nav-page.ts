import { LitElement, css, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
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
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
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
      gap: 15px;
    }

    /* User Avatar */
    .user-avatar-container {
      position: relative;
    }

    .user-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      cursor: pointer;
      border: 2px solid #ecf0f1;
      transition: border-color 0.3s;
    }

    .user-avatar:hover {
      border-color: #3498db;
    }

    .user-menu {
      position: absolute;
      top: 50px;
      right: 0;
      background: white;
      color: #2c3e50;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      padding: 15px;
      min-width: 200px;
      opacity: 0;
      visibility: hidden;
      transform: translateY(-10px);
      transition: all 0.3s ease;
      z-index: 1001;
    }

    .user-menu.show {
      opacity: 1;
      visibility: visible;
      transform: translateY(0);
    }

    .user-info {
      margin-bottom: 10px;
      padding-bottom: 10px;
      border-bottom: 1px solid #ecf0f1;
    }

    .user-name {
      font-weight: bold;
      margin-bottom: 5px;
    }

    .user-email {
      font-size: 0.9rem;
      color: #7f8c8d;
    }

    .logout-btn {
      width: 100%;
      padding: 8px 16px;
      background: #e74c3c;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.9rem;
      transition: background-color 0.3s;
    }

    .logout-btn:hover {
      background: #c0392b;
    }

    .pulldown-container {
      position: relative;
    }

    .pulldown-icon {
      cursor: pointer;
      width: 24px;
      height: 24px;
      fill: white;
    }

    .pulldown-menu {
      position: absolute;
      top: 40px;
      right: 0;
      background: white;
      color: #2c3e50;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      padding: 10px 0;
      min-width: 160px;
      opacity: 0;
      visibility: hidden;
      transform: translateY(-10px);
      transition: all 0.3s ease;
      z-index: 1001;
    }

    .pulldown-menu.show {
      opacity: 1;
      visibility: visible;
      transform: translateY(0);
    }

    .pulldown-menu-item {
      display: block;
      padding: 10px 20px;
      text-decoration: none;
      color: #2c3e50;
      cursor: pointer;
    }

    .pulldown-menu-item:hover {
      background-color: #f0f0f0;
    }

    /* Login Button */
    .login-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      background: #3498db;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.9rem;
      transition: background-color 0.3s;
    }

    .login-btn:hover {
      background: #2980b9;
    }

    /* Main Content Area */
    main {
      flex: 1;
      height: calc(100vh - 60px);
      overflow: hidden;
    }

  `;


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
          <div class="nav-user">
            ${this.renderPulldown()}
            ${this.me?.email
              ? this.renderUserAvatar()
              : this.renderLoginButton()}
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
      <div
        class="pulldown-container"
      >
        <svg class="pulldown-icon" @click=${this.togglePulldownMenu} viewBox="0 0 24 24">
          <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"></path>
        </svg>
        <div class="pulldown-menu ${this.showPulldownMenu ? 'show' : ''}">
          <div class="pulldown-menu-item" @click=${this.toggleTheme}>
            🌙 Toggle Theme (${this.themeManager.getCurrentTheme()})
          </div>
          <a href="users" class="pulldown-menu-item">Users ...</a>
          <a href="tests" class="pulldown-menu-item">Tests ...</a>
          <a href="https://traefik.${location.host}" class="pulldown-menu-item">Traefik Dashboard ...</a>
          <a href="${location.origin}/auth/docs" class="pulldown-menu-item">Auth API ...</a>
          <a href="${location.origin}/photos/docs" class="pulldown-menu-item">Photos API ...</a>
          <a href="${location.origin}/doc/docs" class="pulldown-menu-item">Doc API ...</a>
          <div class="pulldown-menu-item" @click=${this.reloadDb}>Reload DB</div>
        </div>
      </div>
    `;
  }

  private renderUserAvatar() {
    return html`
      <div class="user-avatar-container"
           @mouseenter="${this.showUserMenuOnHover}"
           @mouseleave="${this.hideUserMenuOnHover}">
        <img
          class="user-avatar"
          src="${this.me?.picture || '/default-avatar.png'}"
          alt="User Avatar"
        />
        <div class="user-menu ${this.showUserMenu ? 'show' : ''}">
          <div class="user-info">
            <div class="user-name">${this.me?.name || 'Unknown User'}</div>
            <div class="user-email">${this.me?.email || ''}</div>
          </div>
          <button class="logout-btn" @click="${this.handleLogout}">Logout</button>
        </div>
      </div>
    `;
  }

  private renderLoginButton() {
    return html`
      <button class="login-btn" @click="${this.handleLogin}">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2ZM21 9V7L15 1H5C3.89 1 3 1.89 3 3V21C3 22.11 3.89 23 5 23H19C20.11 23 21 22.11 21 21V9M19 21H5V3H13V9H19Z"/>
        </svg>
        Login
      </button>
    `;
  }

  @state() private showUserMenu = false;
  @state() private showPulldownMenu = false;

  private showUserMenuOnHover() {
    this.showUserMenu = true;
  }

  private hideUserMenuOnHover() {
    this.showUserMenu = false;
  }

  private togglePulldownMenu() {
    this.showPulldownMenu = !this.showPulldownMenu;
  }

  private hidePulldownMenu() {
    if (this.showPulldownMenu) {
      this.showPulldownMenu = false;
    }
  }

  private toggleTheme() {
    this.themeManager.toggleTheme();
    this.hidePulldownMenu();
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
    this.hidePulldownMenu();
  }

  private handleLogin() {
    login('/ui');
  }

  private handleLogout() {
    logout('/ui');
  }

  private handleTitleClick() {
    window.location.href = '/';
  }

}

