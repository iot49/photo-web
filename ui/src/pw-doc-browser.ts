import { LitElement, PropertyValues, css, html } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { get_json } from './app/api';
import { SlTreeItem } from '@shoelace-style/shoelace';
import { FileRenderer } from './file-renderer';

interface FolderModelInterface {
  path: string;
  folders: string[];
  files: string[];
}

class FolderModel implements FolderModelInterface {
  // from doc/app/main.py
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

@customElement('pw-doc-browser')
export class PwDocBrowser extends LitElement {
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
      background-color: white;
    }

    .folder-item {
      --sl-color-neutral-700: red;
      --sl-color-neutral-800: red;
      --sl-color-neutral-900: red;
    .file-item {
      --sl-color-neutral-700: blue;
      --sl-color-neutral-800: blue;
      --sl-color-neutral-900: blue;
    }

  `;

  @state() root!: FolderModel;
  @property() selectedFilePath?: string;
  private fileRenderer!: FileRenderer;

  @query('#treePane') treePane!: HTMLDivElement;
  @query('#filePane') filePane!: HTMLDivElement;

  async connectedCallback() {
    await super.connectedCallback();
    const rj = await get_json('/doc/api/root');
    this.root = new FolderModel(rj.path, rj.folders, rj.files);
    // console.log(`root = ${this.root}`, rj);
  }

  protected firstUpdated(_changedProperties: PropertyValues): void {
    super.firstUpdated(_changedProperties);
    this.fileRenderer = new FileRenderer(this.filePane);
    
    // If a file path was provided via routing, show it immediately
    if (this.selectedFilePath) {
      this.fileRenderer.showFile(this.selectedFilePath);
    }
    
    this.treePane.addEventListener('sl-lazy-load', async (event) => {
      // console.log('sl-lazy-load', event.target);
      const target = event.target as SlTreeItem;
      const path = target.getAttribute('data-path');
      const name = target.getAttribute('data-folder');
      const folder = await get_json(`/doc/api/folder/${path}/${name}`);
      for (const folderName of folder.folders) {
        const treeItem = document.createElement('sl-tree-item') as SlTreeItem;
        treeItem.innerText = folderName;
        treeItem.className = 'folder-item';
        treeItem.lazy = true;
        treeItem.setAttribute('data-path', `${path}/${name}`);
        treeItem.setAttribute('data-folder', `${folderName}`);
        target.append(treeItem);
        // console.log('add', treeItem, 'name', folderName);
      }
      for (const fileName of folder.files) {
        const treeItem = document.createElement('sl-tree-item') as SlTreeItem;
        treeItem.innerText = fileName; // TODO: add css to set text color: blue: note it's in a shadow root
        treeItem.className = 'file-item';
        treeItem.setAttribute('data-path', `/doc/api/file/${path}/${name}/${fileName}`);
        treeItem.addEventListener('click', (event) => {
          const target = event.target as HTMLElement;
          const path = target?.getAttribute('data-path');
          this.fileRenderer.showFile(path);
        });
        target.append(treeItem);
      }
      target.lazy = false;
    });
  }

  protected updated(changedProperties: PropertyValues): void {
    super.updated(changedProperties);
    
    // If selectedFilePath changed, show the new file
    if (changedProperties.has('selectedFilePath') && this.selectedFilePath && this.fileRenderer) {
      this.fileRenderer.showFile(this.selectedFilePath);
    }
  }

  override render() {
    return html`
      <pw-nav-page>
        <sl-split-panel position-in-pixels="250">
          <div id="treePane" slot="start">
            ${this.root == null
              ? html`Loading ... <sl-spinner></sl-spinner>`
              : html` <sl-tree class="tree-with-icons"> ${this.folderTemplate(this.root)}</sl-tree>`}
          </div>
          <div id="filePane" slot="end">file ...</div>
        </sl-split-panel>
      </pw-nav-page>
    `;
  }

  private folderTemplate(folder: FolderModel) {
    return html`
      ${folder.folders.map(
        (folderName: string) =>
          html` <sl-tree-item class="folder-item" data-path=${folder.path} data-folder=${folderName} lazy>
            <sl-icon name="folder"> </sl-icon>
            ${folderName}
          </sl-tree-item>`
      )}
    `;
  }

}
