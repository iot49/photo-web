import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { Albums } from './app/interfaces.js';
import { consume } from '@lit/context';
import { albumsContext } from './app/context.js';
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

    /* Main Content */
    .main-content {
      display: flex;
      height: 100%;
      flex: 1;
      overflow: hidden;
    }

    .left-pane {
      width: 30%;
      height: 100%;
      background: #f8f9fa;
      border-right: 1px solid #dee2e6;
      overflow-y: auto;
      padding: 20px;
    }

    .resizer {
      width: 4px;
      height: 100%;
      background: #dee2e6;
      cursor: col-resize;
      transition: background-color 0.3s;
    }

    .resizer:hover {
      background: #3498db;
    }

    .right-pane {
      width: 70%;
      height: 100%;
      overflow-y: auto;
      padding: 20px;
    }

    .tree-node-header {
      display: flex;
      align-items: center;
      padding: 4px 0;
      cursor: pointer;
      border-radius: 4px;
      transition: background-color 0.2s;
    }

    .tree-node-header:hover {
      background: #e9ecef;
    }

    .tree-icon {
      margin-right: 8px;
      font-size: 16px;
    }

    .tree-label {
      font-weight: 500;
      color: #3498db;
    }

    .tree-album {
      padding: 2px 0;
    }

    .album-link {
      display: flex;
      align-items: center;
      text-decoration: none;
      color: #6c757d;
      padding: 4px 0;
      border-radius: 4px;
      transition: all 0.2s;
    }

    .album-link:hover {
      background: #e9ecef;
      color: #495057;
    }

    .album-title {
      font-size: 0.9rem;
    }

    /* Album Grid */
    .album-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 20px;
      padding: 10px;
    }

    .album-card {
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      overflow: hidden;
      transition: transform 0.3s, box-shadow 0.3s;
    }

    .album-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 4px 16px rgba(0,0,0,0.15);
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
      color: #dee2e6;
    }

    .album-card .album-title {
      padding: 15px;
      font-weight: 500;
      color: #495057;
      text-align: center;
      border-top: 1px solid #f8f9fa;
    }

    /* Responsive Design */
    @media (max-width: 768px) {
      .main-content {
        flex-direction: column;
      }

      .left-pane, .right-pane {
        width: 100%;
      }

      .resizer {
        display: none;
      }

      .album-grid {
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        gap: 15px;
      }

    }
  `;
  @consume({ context: albumsContext, subscribe: true })
  private albums!: Albums;


  // Fixed: albumTree now updates when this.albums changes
  get albumTree() {
    return album_tree(this.albums);
  }

  override render() {
    return html`
      <pw-nav-page>
        <div class="main-content">
          <!-- Left Pane: Album Tree -->
          <div class="left-pane" id="leftPane">
            <div class="tree-container">
              ${this.renderAlbumTree(this.albumTree, 0)}
            </div>
          </div>

          <!-- Resizer -->
          <div class="resizer" id="resizer"></div>

          <!-- Right Pane: Album Grid -->
          <div class="right-pane" id="rightPane">
            <div class="album-grid">
              ${this.renderAlbumGrid()}
            </div>
          </div>
        </div>
      </pw-nav-page>
    `;
  }


  private renderAlbumTree(node: TreeNode, level: number): any {
    /* Render TreeNode as collapsible element. Display a 'folder open icon' (Feather folder-open icon)
    when the node is open, or a 'folder closed icon' (Feather folder icon) when the folder is closed.
    Clicking on the node name opens/closes the node using the expandedNodes state.
    Show albums with a picture icon (Feather image icon) followed by the title. Clicking on the
    title redirects to href="${import.meta.env.BASE_URL}slideshow/${album.uuid}".

    The tree uses proper state management with expandedNodes Set to track which nodes are expanded.
    Root level (level 0) and first level (level 1) nodes are expanded by default.
    */
    if (!node) return '';
    
    // Don't show the root node title (it's undefined)
    const showTitle = level > 0;
    const nodeKey = node.name || 'root';
    
    // Check if this node is expanded
    const isExpanded = this.expandedNodes.has(nodeKey);
    
    return html`
      ${showTitle ? html`
        <div class="tree-node" style="margin-left: ${level * 20}px">
          <div class="tree-node-header" @click="${() => this.toggleNode(node)}">
            <span class="tree-icon">
              ${node.nodes?.length > 0 || node.albums?.length > 0 ? (isExpanded ? html`
                <!-- Feather folder-open icon -->
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"/>
                </svg>
              ` : html`
                <!-- Feather folder icon -->
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
              `) : html`
                <!-- Empty folder icon for leaf nodes -->
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
              `}
            </span>
            <span class="tree-label">${node.name}</span>
          </div>
        </div>
      ` : ''}
      
      ${(isExpanded || level === 0) ? html`
        <!-- Child nodes -->
        ${node.nodes?.map((childNode: any) => this.renderAlbumTree(childNode, level + 1))}
        
        <!-- Albums in this node -->
        ${node.albums?.map((album: any) => html`
          <div class="tree-album" style="margin-left: ${(level + 1) * 20}px">
            <a href="${import.meta.env.BASE_URL}slideshow/${album.uuid}" class="album-link">
              <span class="tree-icon">
                <!-- Feather image icon -->
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21,15 16,10 5,21"/>
                </svg>
              </span>
              <span class="album-title">${album.title}</span>
            </a>
          </div>
        `)}
      ` : ''}
    `;
  }

  private renderAlbumGrid() {
    const allAlbums = this.getAllAlbums(this.albumTree);
    
    // Sort albums alphabetically by title
    const sortedAlbums = allAlbums.sort((a, b) => a.title.localeCompare(b.title));
    
    return html`
      ${sortedAlbums.map(album => html`
        <div class="album-card">
          <a href="${import.meta.env.BASE_URL}slideshow/${album.uuid}" class="album-card-link">
            <div class="album-thumbnail">
              ${album.thumbnail ? html`
                <img
                  src="/photos/api/photos/${album.thumbnail}/img-sm"
                  alt="${album.title}"
                  loading="lazy"
                />
              ` : html`
                <div class="no-thumbnail">📷</div>
              `}
            </div>
            <div class="album-title">${album.title}</div>
          </a>
        </div>
      `)}
    `;
  }

  private getAllAlbums(node: any): any[] {
    if (!node) return [];
    
    let albums = [...(node.albums || [])];
    
    if (node.nodes) {
      for (const childNode of node.nodes) {
        albums = albums.concat(this.getAllAlbums(childNode));
      }
    }
    
    return albums;
  }

  @state() private expandedNodes = new Set<string>();

  private toggleNode(node: any) {
    // Only toggle nodes that have children (nodes or albums)
    if (!node.nodes?.length && !node.albums?.length) {
      return;
    }
    
    const nodeKey = node.name || 'root';
    if (this.expandedNodes.has(nodeKey)) {
      this.expandedNodes.delete(nodeKey);
    } else {
      this.expandedNodes.add(nodeKey);
    }
    this.requestUpdate();
  }

  override firstUpdated() {
    // Initialize first level nodes as expanded by default
    this.initializeDefaultExpandedNodes(this.albumTree, 0);
    
    this.initializeResizer();
    
    // Listen for pw-finished events from slideshow components on document level
    console.log('pw-album-browser: Adding event listener for pw-finished');
    document.addEventListener('pw-finished', this.handleSlideshowFinished);
  }

  private initializeDefaultExpandedNodes(node: TreeNode, level: number) {
    if (!node) return;
    
    // Expand first level nodes by default (level 1)
    if (level === 1 && node.name) {
      this.expandedNodes.add(node.name);
    }
    
    // Recursively process child nodes
    if (node.nodes) {
      for (const childNode of node.nodes) {
        this.initializeDefaultExpandedNodes(childNode, level + 1);
      }
    }
  }

  private initializeResizer() {
    const resizer = this.shadowRoot?.getElementById('resizer');
    const leftPane = this.shadowRoot?.getElementById('leftPane');
    const rightPane = this.shadowRoot?.getElementById('rightPane');
    
    if (!resizer || !leftPane || !rightPane) return;

    let isResizing = false;

    resizer.addEventListener('mousedown', () => {
      isResizing = true;
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    });

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      
      const container = this.shadowRoot?.querySelector('.main-content') as HTMLElement;
      if (!container) return;
      
      const containerRect = container.getBoundingClientRect();
      const newLeftWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;
      
      if (newLeftWidth > 10 && newLeftWidth < 90) {
        leftPane.style.width = `${newLeftWidth}%`;
        rightPane.style.width = `${100 - newLeftWidth}%`;
      }
    };

    const handleMouseUp = () => {
      isResizing = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }

  private handleSlideshowFinished = (event: Event) => {
    console.log('pw-album-browser: Event handler called!');
    const customEvent = event as CustomEvent;
    console.log('pw-album-browser: Slideshow finished:', customEvent.detail?.message || 'No additional details');
  };

  override disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('pw-finished', this.handleSlideshowFinished);
  }
}

