import { LitElement, PropertyValues, css, html } from 'lit';
import { customElement, query, state } from 'lit/decorators.js';
import { get_json, get_text } from './app/api';
import { SlTreeItem } from '@shoelace-style/shoelace';

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

    #tree {
      overflow: scroll
    }
  `;

  @state() root!: FolderModel;

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
    this.treePane.addEventListener('sl-lazy-load', async (event) => {
      // console.log('sl-lazy-load', event.target);
      const target = event.target as SlTreeItem;
      const path = target.getAttribute('data-path');
      const name = target.getAttribute('data-folder');
      const folder = await get_json(`/doc/api/folder/${path}/${name}`);
      for (const folderName of folder.folders) {
        const treeItem = document.createElement('sl-tree-item') as SlTreeItem;
        treeItem.innerText = folderName;
        treeItem.lazy = true;
        treeItem.setAttribute('data-path', `${path}/${name}`);
        treeItem.setAttribute('data-folder', `${folderName}`);
        target.append(treeItem);
        // console.log('add', treeItem, 'name', folderName);
      }
      for (const fileName of folder.files) {
        const treeItem = document.createElement('sl-tree-item') as SlTreeItem;
        treeItem.innerText = fileName;
        treeItem.setAttribute('data-path', `/doc/api/file/${path}/${name}/${fileName}`);
        treeItem.addEventListener('click', (event) => {
          const target = event.target as HTMLElement;
          const path = target?.getAttribute('data-path');
          this.showFile(path);
        });
        target.append(treeItem);
      }
      target.lazy = false;
    });
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
        (folderName: string) => html`<sl-tree-item data-path=${folder.path} data-folder=${folderName} lazy>${folderName}</sl-tree-item>`
      )}
    `;
  }

  private async showFile(path: string | null) {
    if (!path) {
      this.filePane.innerHTML = '<p>No file selected</p>';
      return;
    }

    try {
      // Extract file extension to determine how to render
      const fileName = path.split('/').pop() || '';
      const extension = fileName.split('.').pop()?.toLowerCase() || '';
      
      // Show loading indicator
      this.filePane.innerHTML = '<sl-spinner></sl-spinner> Loading...';
      
      // Download content
      const content = await get_text(path);

      // TODO: add support for audio files, including m4a
      
      if (!content) {
        this.filePane.innerHTML = '<p>File not found or empty</p>';
        return;
      }

      // TODO: add support for audio files
      // Render based on file type
      if (extension === 'md' || extension === 'qmd' || extension === 'markdown') {
        // Render markdown using zero-md
        this.filePane.innerHTML = `<zero-md><script type="text/markdown">${this.escapeHtml(content)}</script></zero-md>`;
      } else if (this.isCodeFile(extension)) {
        // Render code files with syntax highlighting using zero-md
        const language = this.getLanguageForExtension(extension);
        const escapedContent = this.escapeHtml(content);
        this.filePane.innerHTML = `
          <zero-md>
            <script type="text/markdown">
\`\`\`${language}
${escapedContent}
\`\`\`
            </script>
          </zero-md>
        `;
      } else if (extension === 'pdf') {
        // Render PDF using embed or iframe
        this.filePane.innerHTML = `
          <embed src="${path}" type="application/pdf" width="100%" height="100%">
          <p>If PDF doesn't display, <a href="${path}" target="_blank">click here to open in new tab</a></p>
        `;
      } else if (this.isImageFile(extension)) {
        // Render images
        this.filePane.innerHTML = `<img src="${path}" alt="${fileName}" style="max-width: 100%; height: auto;">`;
      } else if (extension === 'html' || extension === 'htm') {
        // Render HTML in iframe for security
        this.filePane.innerHTML = `<iframe src="${path}" width="100%" height="100%" frameborder="0"></iframe>`;
      } else {
        // Render as plain text
        this.filePane.innerHTML = `<pre style="white-space: pre-wrap; font-family: monospace;">${this.escapeHtml(content)}</pre>`;
      }
    } catch (error) {
      console.error('Error loading file:', error);
      this.filePane.innerHTML = `<p>Error loading file: ${error}</p>`;
    }
  }

  private isCodeFile(extension: string): boolean {
    const codeExtensions = [
      'js', 'ts', 'jsx', 'tsx', 'py', 'cpp', 'c', 'h', 'hpp', 'java', 'cs', 'php',
      'rb', 'go', 'rs', 'swift', 'kt', 'scala', 'sh', 'bash', 'zsh', 'fish',
      'sql', 'css', 'scss', 'sass', 'less', 'json', 'xml', 'yaml', 'yml',
      'toml', 'ini', 'cfg', 'conf', 'dockerfile', 'makefile', 'cmake'
    ];
    return codeExtensions.includes(extension);
  }

  private getLanguageForExtension(extension: string): string {
    const languageMap: { [key: string]: string } = {
      'js': 'javascript',
      'ts': 'typescript',
      'jsx': 'jsx',
      'tsx': 'tsx',
      'py': 'python',
      'cpp': 'cpp',
      'c': 'c',
      'h': 'c',
      'hpp': 'cpp',
      'java': 'java',
      'cs': 'csharp',
      'php': 'php',
      'rb': 'ruby',
      'go': 'go',
      'rs': 'rust',
      'swift': 'swift',
      'kt': 'kotlin',
      'scala': 'scala',
      'sh': 'bash',
      'bash': 'bash',
      'zsh': 'bash',
      'fish': 'bash',
      'sql': 'sql',
      'css': 'css',
      'scss': 'scss',
      'sass': 'sass',
      'less': 'less',
      'json': 'json',
      'xml': 'xml',
      'yaml': 'yaml',
      'yml': 'yaml',
      'toml': 'toml',
      'ini': 'ini',
      'cfg': 'ini',
      'conf': 'ini',
      'dockerfile': 'dockerfile',
      'makefile': 'makefile',
      'cmake': 'cmake'
    };
    return languageMap[extension] || extension;
  }

  private isImageFile(extension: string): boolean {
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico'];
    return imageExtensions.includes(extension);
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
