import { css, html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { test_authorize } from './tests/authorize.js';
import { test_photos_files } from './tests/auth-photos-files.js';
import { nginx_cache } from './tests/nginx-cache.js';

@customElement('pw-tests')
export class PwTests extends LitElement {
  static styles = css`
    .messages-container {
      padding: 10px;
      font-family: monospace;
      max-height: calc(100vh - 120px);
      overflow-y: auto;
    }

    zero-md {
      margin: 0;
      padding: 5px 10px;
      display: block;
    }

    zero-md.out {
      border-left: 6px solid #22c55e;
    }

    zero-md.err {
      border-left: 6px solid #ef4444;
    }

    /* Test controls styling - matching pw-nav-page.ts hover effects */
    .test-controls {
      margin-left: auto;
    }

    .test-controls sl-button[slot='trigger']::part(base) {
      color: white;
      border: none;
      background: transparent;
      padding: 12px;
      border-radius: 4px;
      transition: background-color 0.3s;
    }

    .test-controls sl-button[slot='trigger']:hover::part(base) {
      background: rgba(255, 255, 255, 0.1);
    }

    .test-controls sl-icon {
      color: white;
    }

    .nav-controls-container {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      width: 100%;
      gap: 1rem;
    }

    .nav-control-item,
    .nav-controls-container sl-icon {
      color: white;
      cursor: pointer;
      padding: 22px;
      border-radius: 4px;
      transition: background-color 0.3s;
      text-decoration: none;
    }

    .nav-control-item {
      flex: 1;
      display: flex;
      justify-content: center;
      align-items: center;
      font-size: 1rem;
      font-weight: 500;
      text-align: center;
    }

    .nav-control-item:hover,
    .nav-controls-container sl-icon:hover {
      background: rgba(255, 255, 255, 0.1);
    }
  `;

  @property({ type: Array })
  private allMessages: { type: 'out' | 'err'; message: string }[] = [{ type: 'out', message: '**Choose the test to run from the navbar**' }];

  public out(msg: string) {
    this.allMessages = [...this.allMessages, { type: 'out', message: msg }];
    this.requestUpdate();
  }

  public err(msg: string) {
    this.allMessages = [...this.allMessages, { type: 'err', message: msg }];
    this.requestUpdate();
  }

  private async runAuthorizeTest() {
    try {
      await test_authorize(this);
    } catch (error) {
      this.err(`Error running authorization test: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async runPhotosDocTest() {
    try {
      await test_photos_files(this);
    } catch (error) {
      this.err(`Error running photos/files authorization test: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async runNginxCacheTest() {
    try {
      await nginx_cache(this);
    } catch (error) {
      this.err(`Error running nginx cache test: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private navTemplate() {
    return html`
      <div class="nav-controls-container" slot="nav-controls">
        <sl-tooltip content="Run Authorization Test">
          <div class="nav-control-item" @click=${this.runAuthorizeTest}>Auth</div>
        </sl-tooltip>
        <sl-tooltip content="Run Photos/Files delegated Authorization Test">
          <div class="nav-control-item" @click=${this.runPhotosDocTest}>Delegation</div>
        </sl-tooltip>
        <sl-tooltip content="Run Nginx Cache Test">
          <div class="nav-control-item" @click=${this.runNginxCacheTest}>Cache</div>
        </sl-tooltip>
      </div>
    `;
  }

  override render() {
    return html`
      <pw-nav-page>
        ${this.navTemplate()}
        <div class="messages-container">
          ${this.allMessages.map(
            (msg) => html`
              <div class="message">
                <!-- next line must stay together! -->
                <!-- prettier-ignore -->
                <zero-md class="${msg.type}"><script type="text/markdown">${msg.message}</script></zero-md>
              </div>
            `
          )}
        </div>
      </pw-nav-page>
    `;
  }
}
