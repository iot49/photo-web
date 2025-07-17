import { LitElement, html } from 'lit';
import { customElement } from 'lit/decorators.js';
import { login } from './app/login';


/**
 * App login
 */
@customElement('pw-login')
export class PwLogin extends LitElement {

  public render() {
    return html`
        <h1>dev49 Login</h1>

        <button @click=${() => login('/')}>Login</button>
    `;
  }

}
