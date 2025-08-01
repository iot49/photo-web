import { LitElement, PropertyValues, css, html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { Albums, Me, SrcsetInfo } from './app/interfaces.js';
import { consume } from '@lit/context';
import { albumsContext, meContext, srcsetInfoContext } from './app/context.js';
import { album_tree, TreeNode } from './app/album_tree.js';

/**
 * Album browser component that shows available photo albums.
 */
@customElement('pw-album-browser')
export class PwAlbumBrowser extends LitElement {
  static styles = css`
    :host {
      display: block;
      height: 100%;
      font-family: sans-serif;
    }

    sl-split-panel {
      height: 100%;
    }

    sl-icon {
      font-size: 1rem;
      width: 1rem;
      height: 1rem;
      display: inline-block;
      vertical-align: middle;
      flex-shrink: 0;
    }

    .left-pane {
      overflow: auto;
    }

    .right-pane {
      overflow: auto;
    }

    sl-tree-item {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: flex;
      align-items: center;
      cursor: pointer;
    }

    .folder-name {
      cursor: pointer;
      display: inline-block;
    }

    .folder-name:hover {
      color: var(--sl-color-primary-600);
    }

    .album-link {
      text-decoration: none;
      color: inherit;
      display: inline-block;
      vertical-align: middle;
      margin-left: 0.5rem;
    }

    .album-link:hover {
      color: var(--sl-color-primary-600);
    }

    .album-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 20px;
      padding: 10px;
    }

    .album-card {
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 8px var(--sl-color-neutral-300);
      overflow: hidden;
      transition: transform 0.3s, box-shadow 0.3s;
    }

    .album-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 4px 16px var(--sl-color-neutral-400);
    }

    .album-card-link {
      display: block;
      text-decoration: none;
      color: inherit;
    }

    .album-thumbnail {
      width: 100%;
      height: 150px;
      overflow: hidden;
      background: var(--sl-color-neutral-50);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .album-thumbnail img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.3s;
    }

    .album-card:hover .album-thumbnail img {
      transform: scale(1.05);
    }

    .no-thumbnail {
      font-size: 3rem;
      color: var(--sl-color-sky-400);
    }

    .album-card .album-info {
      padding: 1px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .album-card .album-title {
      color: var(--sl-color-neutral-700);
      text-align: left;
      flex: 1;
      margin-left: 3px;
      margin-right: 10px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: var(--sl-font-size-small);
    }

    .album-icons {
      display: flex;
      gap: 8px;
    }

    .album-icon-link {
      color: var(--sl-color-neutral-700);
      text-decoration: none;
      padding: 4px;
      border-radius: 4px;
      transition: color 0.2s, background-color 0.2s;
    }

    .album-icon-link:hover {
      color: var(--sl-color-primary-600);
    }

    .nav-play-icon {
      color: white;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 60px;
      width: 60px;
      border-radius: 4px;
      transition: background-color 0.3s;
    }

    .nav-play-icon:hover {
      background: rgba(255, 255, 255, 0.1);
    }

    .nav-play-icon sl-icon {
      font-size: 1.2rem;
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

    .nav-control-item.disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `;

  @consume({ context: meContext, subscribe: true })
  @property({ attribute: false })
  private me!: Me;

  @consume({ context: albumsContext, subscribe: true })
  private albums!: Albums;

  @consume({ context: srcsetInfoContext, subscribe: true })
  private srcsetInfo!: SrcsetInfo;

  get albumTree() {
    // Check if 'admin' role is present in the roles string
    return album_tree(this.albums, this.me.roles.includes('admin'));
  }

  // list of album uid's shown in right panel
  @property({ type: Object }) playList = new Set<string>();

  override connectedCallback(): void {
    super.connectedCallback();
    // Listen for logout events to reset playlist
    document.addEventListener('pw-logout', this.handleLogout);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    // Clean up event listener
    document.removeEventListener('pw-logout', this.handleLogout);
  }

  protected override firstUpdated(_changedProperties: PropertyValues): void {
    super.firstUpdated(_changedProperties);
    // Load recent albums initially
    this.recentFilter(12);
  }

  private handleLogout = (_event: Event): void => {
    // Clear the playlist immediately
    this.playList = new Set<string>();
    // Wait for albums data to be available, then load recent albums
    this.waitForAlbumsAndLoadRecent();
    this.requestUpdate();
  };

  private waitForAlbumsAndLoadRecent(): void {
    const checkAlbums = () => {
      if (this.albums && Object.keys(this.albums).length > 0) {
        this.recentFilter(12);
      } else {
        setTimeout(checkAlbums, 100);
      }
    };
    checkAlbums();
  }

  private navTemplate() {
    const isPlayDisabled = this.playList.size <= 0;
    return html`
      <div class="nav-controls-container" slot="nav-controls">
        <sl-tooltip content="${isPlayDisabled ? 'Select at least one album from the browser on the left' : 'Play selected albums'}">
          ${isPlayDisabled
            ? html`<div class="nav-control-item disabled">Play</div>`
            : html`<a class="nav-control-item" href="/ui/slideshow?playlist=${Array.from(this.playList).join(':')}">Play</a>`}
        </sl-tooltip>
        <sl-tooltip content="Clear playlist">
          <div class="nav-control-item" @click=${(_: Event) => (this.playList = new Set<string>())}>Clear</div>
        </sl-tooltip>
        <sl-tooltip content="Show recent albums">
          <div class="nav-control-item" @click=${(_: Event) => this.recentFilter(6)}>Recent</div>
        </sl-tooltip>
      </div>
    `;
  }

  override render() {
    return html`
      <pw-nav-page>
        ${this.navTemplate()}
        <sl-split-panel position-in-pixels="250">
          <!-- Left Pane: Album Tree -->
          <div class="left-pane" slot="start">
            <sl-tree> ${this.renderAlbumTree(this.albumTree, 0)} </sl-tree>
          </div>

          <!-- Right Pane: Album Grid -->
          <div class="right-pane" slot="end">
            <div class="album-grid">${this.renderAlbumGrid()}</div>
          </div>
        </sl-split-panel>
      </pw-nav-page>
    `;
  }

  private addAlbumToPlaylist(uid: string) {
    const newPlaylist = new Set(this.playList);
    newPlaylist.add(uid);
    this.playList = newPlaylist;
  }

  private removeAlbumFromPlaylist(uid: string) {
    const newPlaylist = new Set(this.playList);
    newPlaylist.delete(uid);
    this.playList = newPlaylist;
  }

  private pathFilter(folderPath: string) {
    // add albums matchhing path to playlist
    const newPlaylist = new Set(this.playList);
    Object.values(this.albums).forEach((album) => {
      if (album.path.includes(folderPath)) newPlaylist.add(album.uuid);
    });
    // make it reactive
    this.playList = newPlaylist;
  }

  private recentFilter(count: number) {
    // add up to "count" most recently created albums to playlist
    const newPlaylist = new Set(this.playList);

    // FIX: call "global" recentAlbums defined at bottom of this file
    recentAlbums(this.albums, count).forEach((albumUid) => {
      newPlaylist.add(albumUid);
    });

    // make it reactive
    this.playList = newPlaylist;
  }

  private buildNodePath(node: TreeNode, parentPath: string = ''): string {
    if (!node.name) return parentPath;
    return parentPath ? `${parentPath}/${node.name}` : node.name;
  }

  private renderAlbumTree(node: TreeNode, level: number, parentPath: string = ''): any {
    if (!node) return '';

    // For root level, just render children
    if (level === 0) {
      return html`
        ${node.nodes?.map((childNode: any) => this.renderAlbumTree(childNode, level + 1, ''))}
        ${node.albums?.map(
          (album: any) => html`
            <sl-tree-item>
              <sl-icon name="image"></sl-icon>
              <span class="album-link" @click=${(_: Event) => this.addAlbumToPlaylist(album.uuid)}>${album.title}</span>
            </sl-tree-item>
          `
        )}
      `;
    }

    // For folder nodes
    if (node.nodes?.length > 0 || node.albums?.length > 0) {
      const currentPath = this.buildNodePath(node, parentPath);
      return html`
        <sl-tree-item>
          <span class="folder-name" @click=${(_: Event) => this.pathFilter(currentPath)}>${node.name}</span>

          <!-- Child nodes -->
          ${node.nodes?.map((childNode: any) => this.renderAlbumTree(childNode, level + 1, currentPath))}

          <!-- Albums in this node -->
          ${node.albums?.map(
            (album: any) => html`
              <sl-tree-item>
                <sl-icon name="image"></sl-icon>
                <span class="album-link" @click=${(_: Event) => this.addAlbumToPlaylist(album.uuid)}>${album.title}</span>
              </sl-tree-item>
            `
          )}
        </sl-tree-item>
      `;
    }
  }

  private renderAlbumGrid() {
    // Safety check: don't render if albums data is not available
    if (!this.albums) {
      return nothing;
    }

    return html`
      ${Array.from(this.playList).map((albumUid) => {
        const album = this.albums[albumUid];
        // Safety check: skip if album is not found
        if (!album) {
          return nothing;
        }
        const srcset = album.thumbnail ? this.srcsetInfo.srcsetFor(album.thumbnail) : '';
        return html`
          <div class="album-card">
            <sl-tooltip content="Play Animated Slideshow">
              <a href="/ui/slideshow?playlist=${album.uuid}" class="album-card-link">
                <div class="album-thumbnail">
                  ${album.thumbnail
                    ? html`
                        <img
                          src="/photos/api/photos/${album.thumbnail.uuid}/img-sm"
                          srcset="${srcset}"
                          sizes="(max-width: 300px) 200px, 400px"
                          alt="${album.title}"
                          loading="lazy"
                        />
                      `
                    : html` <div class="no-thumbnail">📷</div> `}
                </div>
              </a>
            </sl-tooltip>
            <div class="album-info">
              <div class="album-title">${album.title}</div>
              <div class="album-icons">
                <sl-tooltip content="Remove album from playlist">
                  <span class="album-icon-link" @click="${(_: Event) => this.removeAlbumFromPlaylist(album.uuid)}">
                    <sl-icon name="x"></sl-icon>
                  </span>
                </sl-tooltip>
              </div>
            </div>
          </div>
        `;
      })}
    `;
  }
}

export function recentAlbums(albums: Albums, count: number): string[] {
  // Return UIDs of count most recently created albums
  const recentAlbums = Object.values(albums)
    .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime())
    .slice(0, count);

  const albumUids: string[] = [];
  recentAlbums.forEach((album) => {
    albumUids.push(album.uuid);
  });

  return albumUids;
}
