import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { Router } from '@lit-labs/router';
import { Albums, Me, SrcsetInfo } from './app/interfaces';
import { provide } from '@lit/context';
import { albumsContext, meContext, srcsetInfoContext } from './app/context';

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
    await this.fetchAlbums();
    await this.fetchMe();
    await this.fetchSrcsetInfo();

    // Add event listeners for login/logout events
    this.handleLoginLogoutEvents();
  }

  private async fetchAlbums() {
    try {
      let response: Response;
      try {
        response = await fetch(`/photos/api/albums`);
      } catch (error) {
        throw new Error('Failed loading list of albums', { cause: error });
      }
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      this.albums = await response.json();
      // console.log('fetch albums', this.albums);
    } catch (error) {
      console.error('Error fetching albums', { cause: error });
    }
  }

  private async fetchMe() {
    fetch(`/auth/me`, { method: 'GET', credentials: 'include', mode: 'cors' })
      .then((response) => {
        return response.json();
      })
      .then((me) => {
        this.me = me;
        // console.log('fetch me =', me);
      })
      .catch((err) => {
        console.error(`me fetch error: ${err}`);
      });
  }

  private async fetchSrcsetInfo() {
    fetch(`/photos/api/photos/srcset`, { method: 'GET', credentials: 'include', mode: 'cors' })
      .then((response) => {
        return response.json();
      })
      .then((srcset) => {
        this.srcsetInfo = srcset;
        // console.log('fetch srcset =', srcset);
      })
      .catch((err) => {
        console.error(`srcset fetch error: ${err}`);
      });
  }

  private handleLoginLogoutEvents() {
    const refreshData = async () => {
      console.log('Auth state changed, refreshing albums and me');
      await this.fetchAlbums();
      await this.fetchMe();
      // Force a re-render to ensure context consumers update
      this.requestUpdate();
    };

    // Listen for both login and logout events with the same handler
    window.addEventListener('pw-login', refreshData);
    window.addEventListener('pw-logout', refreshData);
  }

  private router = new Router(this, [
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
