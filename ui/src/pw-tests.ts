import { css, html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { Albums } from './app/interfaces.js';
import { consume } from '@lit/context';
import { albumsContext } from './app/context.js';

@customElement('pw-tests')
export class PwTests extends LitElement {
  static styles = css``;
  @consume({ context: albumsContext, subscribe: true })
  @property({ attribute: false })
  private albums!: Albums;

  override render() {
    console.log('Test', this.albums);
    return html`<pw-nav-page>Tests ...</pw-nav-page>`;
  }

}

