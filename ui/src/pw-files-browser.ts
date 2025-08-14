import { LitElement, PropertyValues, css, html } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { get_json } from './app/api';
import { SlTreeItem } from './shoelace-config';
import { FileRenderer } from './app/files/renderer';
import { iconForFilename } from './app/files/icons';

interface FolderModelInterface {
  path: string;
  folders: string[];
  files: string[];
}

class FolderModel implements FolderModelInterface {
  // from files/app/main.py
  path: string;
  folders: string[];
  files: string[];

  constructor(path: string, folders: string[] = [], files: string[] = []) {
    this.path = path;
    this.folders = folders;
    this.files = files;
  }

  /** Get the first part of the normalized path (realm) */
  get realm(): string {
    const normalizedPath = this.path.replace(/\\/g, '/').replace(/\/+/g, '/');
    return normalizedPath.split('/')[0];
  }

  /** Get the last part of the normalized path (name) */
  get name(): string {
    const normalizedPath = this.path.replace(/\\/g, '/').replace(/\/+/g, '/');
    const parts = normalizedPath.split('/');
    return parts[parts.length - 1];
  }
}

@customElement('pw-files-browser')
export class PwFilesBrowser extends LitElement {
  static styles = css`
    * {
      box-sizing: border-box;
    }

    sl-split-panel {
      height: 100%;
    }

    #treePane {
      overflow: auto;
    }

    #filePane {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }

    #fileContent {
      flex: 1;
      overflow: auto;
      min-height: 0;
    }

    #fileBottomBar {
      height: 1.5em;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: var(--sl-color-neutral-100);
      border-top: 1px solid var(--sl-color-neutral-300);
      font-size: 0.875rem;
      color: var(--sl-color-neutral-700);
    }

    sl-tree-item {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  `;

  @state() root!: FolderModel;
  @property() selectedFilePath?: string;
  @state() private currentFilePath?: string;
  private fileRenderer!: FileRenderer;

  @query('#treePane') treePane!: HTMLDivElement;
  @query('#fileContent') fileContent!: HTMLDivElement;

  async connectedCallback() {
    await super.connectedCallback();
    const rj = await get_json('/files/api/root');
    this.root = new FolderModel(rj.path, rj.folders, rj.files);
    
    // Listen for pw-file-path events
    window.addEventListener('pw-file-path', this.handleFilePathEvent as EventListener);
    
    // Listen for pageshow event to handle back/forward cache restoration
    window.addEventListener('pageshow', this.handlePageShow as EventListener);
    
    // Listen for popstate events to handle back/forward navigation
    window.addEventListener('popstate', this.handlePopState as EventListener);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('pw-file-path', this.handleFilePathEvent as EventListener);
    window.removeEventListener('pageshow', this.handlePageShow as EventListener);
    window.removeEventListener('popstate', this.handlePopState as EventListener);
  }

  private handleFilePathEvent = (event: Event) => {
    const customEvent = event as CustomEvent;
    this.currentFilePath = customEvent.detail.path;
  };

  private handlePageShow = (event: PageTransitionEvent) => {
    console.log('PageShow event in files browser:', {
      persisted: event.persisted,
      currentPath: window.location.pathname,
      selectedFilePath: this.selectedFilePath,
      hasFileRenderer: !!this.fileRenderer
    });
    
    // Handle back/forward cache restoration OR any pageshow event
    // Extract file path from current URL and update display
    const currentPath = window.location.pathname;
    if (currentPath.startsWith('/ui/files/') && this.fileRenderer) {
      const filePath = currentPath.substring('/ui/files'.length);
      if (filePath && filePath !== '/') {
        const selectedFilePath = `/files/api/file${filePath}`;
        console.log('Syncing file display after pageshow:', selectedFilePath);
        this.fileRenderer.showFile(selectedFilePath);
      }
    }
  };

  private handlePopState = (event: PopStateEvent) => {
    // Directly handle URL changes from back/forward navigation
    const currentPath = window.location.pathname;
    if (currentPath.startsWith('/ui/files/') && this.fileRenderer) {
      const filePath = currentPath.substring('/ui/files'.length);
      if (filePath && filePath !== '/') {
        // Use state information if available, otherwise construct from URL
        const selectedFilePath = event.state?.filePath || `/files/api/file${filePath}`;
        console.log('Showing file after popstate:', selectedFilePath);
        this.fileRenderer.showFile(selectedFilePath);
      } else {
        // Back to files root - show default index.md if available
        console.log('Back to files root, showing default index.md');
        this.fileRenderer.showFile(`/files/api/file/public/index.md`);
      }
    }
  };

  protected firstUpdated(_changedProperties: PropertyValues): void {
    super.firstUpdated(_changedProperties);
    this.fileRenderer = new FileRenderer(this.fileContent);

    // If a file path was provided via routing, show it immediately
    if (this.selectedFilePath) {
      this.fileRenderer.showFile(this.selectedFilePath);
    }

    this.treePane.addEventListener('sl-lazy-load', async (event) => {
      const target = event.target as SlTreeItem;
      const path = target.getAttribute('data-path');
      const name = target.getAttribute('data-folder');
      const folder = await get_json(`/files/api/folder/${path}/${name}`);
      for (const folderName of folder.folders) {
        const treeItem = document.createElement('sl-tree-item') as SlTreeItem;
        treeItem.innerText = folderName;
        treeItem.className = 'folder-item';
        treeItem.lazy = true;
        treeItem.setAttribute('data-path', `${path}/${name}`);
        treeItem.setAttribute('data-folder', `${folderName}`);
        target.append(treeItem);
      }
      for (const fileName of folder.files) {
        const treeItem = document.createElement('sl-tree-item') as SlTreeItem;
        const dataPath = `/files/api/file/${path}/${name}/${fileName}`;
        // Create icon element
        const icon = document.createElement('sl-icon');
        icon.setAttribute('name', iconForFilename(fileName));

        // Add icon and filename to tree item
        treeItem.appendChild(icon);
        treeItem.appendChild(document.createTextNode(fileName));

        treeItem.className = 'file-item';
        treeItem.setAttribute('data-path', dataPath);
        treeItem.addEventListener('click', (event) => {
          const target = event.target as HTMLElement;
          const path = target?.getAttribute('data-path');
          if (path) {
            // Extract the file path from the API path (remove /files/api/file prefix)
            const filePath = path.replace('/files/api/file', '');
            // Update the URL to use the UI route format with path parameter
            const newUrl = `/ui/files${filePath}`;
            
            // Push state with proper history entry
            const state = {
              filePath: path,
              uiPath: newUrl
            };
            window.history.pushState(state, '', newUrl);
            this.fileRenderer.showFile(path);
          }
        });
        target.append(treeItem);
        if (fileName === 'index.md') {
          this.fileRenderer.showFile(dataPath);
        }
      }
      target.lazy = false;
    });

    this.fileRenderer.showFile(`/files/api/file/public/index.md`);
  }

  protected updated(changedProperties: PropertyValues): void {
    super.updated(changedProperties);

    // If selectedFilePath changed, show the new file
    if (changedProperties.has('selectedFilePath') && this.selectedFilePath && this.fileRenderer) {
      console.log('Showing file due to selectedFilePath change:', this.selectedFilePath);
      this.fileRenderer.showFile(this.selectedFilePath);
    }
  }

  override render() {
    return html`
      <pw-nav-page parentIsDoc>
        <sl-split-panel position-in-pixels="250">
          <div id="treePane" slot="start">
            ${this.root == null ? html`Loading ... <sl-spinner></sl-spinner>` : html` ${this.treeTemplate(this.root)}`}
          </div>
          <div id="filePane" slot="end">
            <div id="fileContent">Choose file to display ...</div>
            <div id="fileBottomBar">
              ${this.currentFilePath
                ? html`<a href="${this.currentFilePath}" target="_blank" style="color: var(--sl-color-primary-600); text-decoration: none;">Click here to open the file in a new tab</a>`
                : 'Select a file to view'}
            </div>
          </div>
        </sl-split-panel>
      </pw-nav-page>
    `;
  }

  private treeTemplate(folder: FolderModel) {
    return html` <sl-tree>
      ${folder.folders.map(
        (folderName: string) =>
          html` <sl-tree-item class="folder-item" data-path=${folder.path} data-folder=${folderName} lazy> ${folderName} </sl-tree-item>`
      )}
    </sl-tree>`;
  }
}
