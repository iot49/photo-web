import { LitElement, PropertyValues, css, html } from 'lit';
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
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      overflow: hidden;
      transition: transform 0.3s, box-shadow 0.3s;
    }

    .album-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
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
      background: #f8f9fa;
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
      color: lightblue;
    }

    .album-card .album-info {
      padding: 1px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .album-card .album-title {
      color: #3f4245;
      text-align: left;
      flex: 1;
      margin-left: 3px;
      margin-right: 10px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .album-title {
      font-size: var(--sl-font-size-small);
    }

    .album-icons {
      display: flex;
      gap: 8px;
    }

    .album-icon-link {
      color: #3f4245;
      text-decoration: none;
      padding: 4px;
      border-radius: 4px;
      transition: color 0.2s, background-color 0.2s;
    }

    .album-icon-link:hover {
      color: var(--sl-color-primary-600);
      //background-color: #f8f9fa;
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
      gap: 1rem;
      justify-content: space-between;
      width: 100%;
    }

    .nav-controls-container sl-icon {
      color: white;
      cursor: pointer;
      padding: 22px;
      border-radius: 4px;
      transition: background-color 0.3s;
    }

    .nav-controls-container sl-icon:hover {
      background: rgba(255, 255, 255, 0.1);
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

  protected override firstUpdated(_changedProperties: PropertyValues): void {
    super.firstUpdated(_changedProperties);
    const since = new Date(new Date().setFullYear(new Date().getFullYear() - 1));
    this.createdFilter(since);
  }

  override render() {
    return html`
      <pw-nav-page>
        <div class="nav-controls-container" slot="nav-controls">
          <sl-tooltip content="Play selected albums with Ken Burns style animation">
            <a href="/ui/slideshow?playlist=${Array.from(this.playList).join(':')}&theme=ken-burns&autoplay=true" class="nav-play-icon">
              <sl-icon name="arrow-right-circle"></sl-icon>
            </a>
          </sl-tooltip>
          <sl-tooltip content="Play selected albums without animations">
            <a href="/ui/slideshow?playlist=${Array.from(this.playList).join(':')}&theme=carousel&autoplay=true" class="nav-play-icon">
              <sl-icon name="play"></sl-icon>
            </a>
          </sl-tooltip>
          <sl-tooltip content="Select recently added albums">
            <sl-icon name="calendar-range" @click="${(_: Event) => this.createdFilter(new Date(new Date().setMonth(new Date().getMonth() - 1)))}"></sl-icon>
          </sl-tooltip>
          <sl-tooltip content="Clear selected albums">
            <sl-icon name="x-lg" @click="${(_: Event) => (this.playList = new Set<string>())}"></sl-icon>
          </sl-tooltip>
        </div>

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

  private createdFilter(since: Date) {
    // add albums created since to playlist
    const newPlaylist = new Set(this.playList);
    Object.values(this.albums).forEach((album) => {
      if (new Date(album.created) > since) newPlaylist.add(album.uuid);
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
    return html`
      ${Array.from(this.playList).map((albumUid) => {
        const album = this.albums[albumUid];
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
                    <sl-icon name="trash"></sl-icon>
                  </span>
                </sl-tooltip>
                <sl-tooltip content="Play album without animations">
                  <a href="/ui/slideshow?playlist=${album.uuid}&theme=carousel&autoplay=true" class="album-icon-link">
                    <sl-icon name="play"></sl-icon>
                  </a>
                </sl-tooltip>
              </div>
            </div>
          </div>
        `;
      })}
    `;
  }
}
