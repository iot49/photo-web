import { css, html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { test_authorize } from './tests/authorize.js';
import { test_photos_doc } from './tests/auth-photos-doc.js';
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
      margin: 2px 0;
      padding: 0;
      display: block;
    }

    zero-md.out {
      border: 2px solid #22c55e;
    }

    zero-md.err {
      border: 2px solid #ef4444;
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
  `;

  @property({ type: Array })
  private allMessages: { type: 'out' | 'err'; message: string }[] = [
    { type: 'out', message: '**Choose the test to run from the navbar**' }
  ];

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
      await test_photos_doc(this);
    } catch (error) {
      this.err(`Error running photos/doc authorization test: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async runNginxCacheTest() {
    try {
      await nginx_cache(this);
    } catch (error) {
      this.err(`Error running nginx cache test: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  override render() {
    return html`
      <pw-nav-page>
        <sl-dropdown slot="nav-controls" close-on-select class="test-controls">
          <sl-button slot="trigger" variant="text" size="medium" title="Test Controls">
            Test
            <sl-icon name="play-circle"></sl-icon>
          </sl-button>
          <sl-menu>
            <sl-menu-item @click=${this.runAuthorizeTest}>
              Run Authorization Test
            </sl-menu-item>
            <sl-menu-item @click=${this.runPhotosDocTest}>
              Run Photos/Doc Authorization Test
            </sl-menu-item>
            <sl-menu-item @click=${this.runNginxCacheTest}>
              Run Nginx Cache Test
            </sl-menu-item>
          </sl-menu>
        </sl-dropdown>
        <div class="messages-container">
          ${this.allMessages.map(
            (msg) => html`
              <div class="message">
                <zero-md class="${msg.type}"><script type="text/markdown">${msg.message}</script></zero-md>
              </div>
            `
          )}
        </div>
      </pw-nav-page>
    `;
  }
}
