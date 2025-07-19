import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { Router } from '@lit-labs/router';
import { Albums, Me, SrcsetInfo } from './app/interfaces';
import { provide } from '@lit/context';
import { albumsContext, meContext, srcsetInfoContext } from './app/context';
import { get_json } from './app/api';

/**
 * Main application component for Photo Web.
 * Routes requests and exports albums.
 */
@customElement('pw-main')
export class PwMain extends LitElement {
  // TODO: verify reload of albums, me after user login/logout
  @provide({ context: albumsContext })
  @state()
  albums: Albums = {};
  @provide({ context: meContext })
  @state()
  me: Me = {} as Me;
  @provide({ context: srcsetInfoContext })
  @state()
  srcsetInfo: SrcsetInfo = [] as SrcsetInfo;

  async connectedCallback() {
    super.connectedCallback();
    this.albums = await get_json('/photos/api/albums');
    this.me = await get_json('/auth/me');
    this.srcsetInfo = await get_json('/photos/api/photos/srcset');

    // Add event listeners for login/logout events
    this.handleLoginLogoutEvents();
  }

  private handleLoginLogoutEvents() {
    const refreshData = async () => {
      console.log('Auth state changed, refreshing albums and me');
      this.albums = await get_json('/photos/api/albums');
      this.me = await get_json('/auth/me');     
      this.requestUpdate();  // Force a re-render to ensure context consumers update
    };

    // Listen for both login and logout events with the same handler
    window.addEventListener('pw-login', refreshData);
    window.addEventListener('pw-logout', refreshData);
  }

  private router = new Router(this, [
    { path: `/ui/doc`, render: () => html`<pw-doc-browser></pw-doc-browser>` },
    { path: `/ui/album`, render: () => html`<pw-album-browser></pw-album-browser>` },
    { path: `/ui/users`, render: () => html`<pw-users></pw-users>` },
    { path: `/ui/login`, render: () => html`<pw-login></pw-login>` },
    { path: `/ui/tests`, render: () => html`<pw-tests></pw-tests>` },
    { path: `/ui/logged-in`, render: () => html`<p>Logged in: ${JSON.stringify(this.me)}</p>` },
    { path: `/ui/logged-out`, render: () => html`<p>Logged out: ${JSON.stringify(this.me)}</p>` },
    { path: `/ui/ken-burns`, render: () => html`<pw-ken-burns></pw-ken-burns>` },
    {
      path: `/ui/slideshow/:uuid`,
      render: ({ uuid }) => html`<pw-ken-burns .uuid=${uuid ?? ''}></pw-ken-burns>`,
    },
    { path: `/ui/`, render: () => html`<pw-album-browser></pw-album-browser>` },
    { path: '*', render: () => html`<p>Catchall path</p>` },
  ]);

  public render() {
    return html` <main>${this.router.outlet()}</main> `;
  }
}
