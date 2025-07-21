import { css, html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { test_authorize } from './tests/authorize.js';
import { test_photos_doc } from './tests/auth-photos-doc.js';

@customElement('pw-tests')
export class PwTests extends LitElement {
  static styles = css`
    .messages-container {
      padding: 10px;
      font-family: monospace;
      max-height: calc(100vh - 120px);
      overflow-y: auto;
    }

    .message {
      border-radius: 4px;
      white-space: pre-wrap;
      word-wrap: break-word;
    }

    .header-message {
      font-weight: bold;
      font-size: 1.2rem;
      color: #2563eb;
      background-color: rgba(37, 99, 235, 0.1);
      border-left: 3px solid #2563eb;
      margin: 2px 0;
      padding: 4px 8px;
    }

    .out-message {
      color: #1d5e39;
      background-color: rgba(29, 94, 57, 0.1);
      border-left: 3px solid #1d5e39;
      margin: 2px 0;
      padding: 4px 8px;
    }

    .err-message {
      color: #dc2626;
      background-color: rgba(220, 38, 38, 0.1);
      border-left: 3px solid #dc2626;
      margin: 2px 0;
      padding: 4px 8px;
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
  private allMessages: { type: 'out' | 'err' | 'header'; message: string }[] = [];

  public header(msg: string) {
    this.allMessages = [...this.allMessages, { type: 'header', message: msg }];
    this.requestUpdate();
  }

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

  override render() {
    return html`
      <pw-nav-page>
        <sl-dropdown slot="nav-controls" close-on-select class="test-controls">
          <sl-button slot="trigger" variant="text" size="medium" title="Test Controls">
            <sl-icon name="play-circle"></sl-icon>
          </sl-button>
          <sl-menu>
            <sl-menu-item @click=${this.runAuthorizeTest}>
              Run Authorization Test
            </sl-menu-item>
            <sl-menu-item @click=${this.runPhotosDocTest}>
              Run Photos/Doc Authorization Test
            </sl-menu-item>
          </sl-menu>
        </sl-dropdown>
        <div class="messages-container">
          ${this.allMessages.map(
            (msg) => html`
              <div class="message ${msg.type === 'out' ? 'out-message' : msg.type === 'header' ? 'header-message' : 'err-message'}">${msg.message}</div>
            `
          )}
        </div>
      </pw-nav-page>
    `;
  }
}
