import { get_text } from '../api';
import { createRenderer } from 'ipynb2html';

export class FileRenderer {
  private filePane: HTMLDivElement;

  constructor(filePane: HTMLDivElement) {
    this.filePane = filePane;

    // Listen for theme changes to update markdown rendering
    window.addEventListener('theme-changed', () => {
      this.updateMarkdownTheme();
    });
  }

  async showFile(path: string | null) {
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

      // Render file content
      switch (extension) {
        case 'md':
        case 'qmd':
          this.filePane.innerHTML = `
            <div style="display: flex; flex-direction: column; height: 100%;">
              <div style="flex: 1; min-height: 0; overflow: auto;">
                <zero-md src=${path}>

                </zero-md>
              </div>
              ${this.createFileLink(path)}
            </div>
          `;
          // Add link click handler after zero-md is rendered
          this.setupLinkClickHandler();
          return;

        // Image file cases
        case 'jpg':
        case 'jpeg':
        case 'png':
        case 'gif':
        case 'bmp':
        case 'svg':
        case 'webp':
        case 'ico':
          this.filePane.innerHTML = `
            <div style="display: flex; flex-direction: column; height: 100%;">
              <div style="flex: 1; display: flex; align-items: center; justify-content: center;">
                <img src="${path}" alt="${fileName}" style="max-width: 100%; height: auto;">
              </div>
              ${this.createFileLink(path)}
            </div>
          `;
          return;

        case 'pdf':
          // Render PDF using iframe instead of embed to avoid fullscreen permissions policy violations
          this.filePane.innerHTML = `
            <div style="display: flex; flex-direction: column; height: 100%; background-color: var(--sl-color-neutral-0);">
              <iframe src="${path}" type="application/pdf" width="100%" style="flex: 1; min-height: 0; border: none; background-color: var(--sl-color-neutral-0);"></iframe>
              ${this.createFileLink(path)}
            </div>
          `;
          return;

        case 'ipynb':
          // Render Jupyter notebook
          await this.renderJupyterNotebook(path);
          return;

        case 'html':
        case 'htm':
          // Render HTML in iframe for security
          this.filePane.innerHTML = `
            <div style="display: flex; flex-direction: column; height: 100%;">
              <iframe src="${path}" width="100%" style="flex: 1; min-height: 0;" frameborder="0"></iframe>
              ${this.createFileLink(path)}
            </div>
          `;
          return;

        // Audio file cases
        case 'mp3':
        case 'wav':
        case 'ogg':
        case 'aac':
        case 'm4a':
        case 'flac':
        case 'wma':
        case 'opus':
          this.filePane.innerHTML = `
            <div style="display: flex; flex-direction: column; height: 100%;">
              <div style="flex: 1; padding: 20px; text-align: center; display: flex; flex-direction: column; justify-content: center;">
                <h3>${fileName}</h3>
                <audio controls style="width: 100%; max-width: 500px;">
                  <source src="${path}" type="audio/${extension === 'm4a' ? 'mp4' : extension}">
                  Your browser does not support the audio element.
                </audio>
              </div>
              ${this.createFileLink(path)}
            </div>
          `;
          return;

        // Code file cases
        case 'js':
        case 'ts':
        case 'jsx':
        case 'tsx':
        case 'py':
        case 'cpp':
        case 'c':
        case 'h':
        case 'hpp':
        case 'java':
        case 'cs':
        case 'php':
        case 'rb':
        case 'go':
        case 'rs':
        case 'swift':
        case 'kt':
        case 'scala':
        case 'sh':
        case 'bash':
        case 'zsh':
        case 'fish':
        case 'sql':
        case 'css':
        case 'scss':
        case 'sass':
        case 'less':
        case 'json':
        case 'xml':
        case 'yaml':
        case 'yml':
        case 'toml':
        case 'ini':
        case 'cfg':
        case 'conf':
        case 'dockerfile':
        case 'makefile':
        case 'cmake':
          // Download content first for code files
          const content = await get_text(path);
          if (!content) {
            this.filePane.innerHTML = '<p>File not found or empty</p>';
            return;
          }
          // Render code files with syntax highlighting using zero-md
          const language = this.getLanguageForExtension(extension);
          const escapedContent = this.escapeHtml(content);
          this.filePane.innerHTML = `
            <div style="display: flex; flex-direction: column; height: 100%;">
              <div style="flex: 1; min-height: 0; overflow: auto;">
                <zero-md>

                  <script type="text/markdown">
\`\`\`${language}
${escapedContent}
\`\`\`
                  </script>
                </zero-md>
              </div>
              ${this.createFileLink(path)}
            </div>
          `;
          // Add link click handler after zero-md is rendered
          this.setupLinkClickHandler();
          return;
      }

      // Fallback for unhandled file types - render as plain text
      const content = await get_text(path);

      if (!content) {
        this.filePane.innerHTML = '<p>File not found or empty</p>';
        return;
      }

      // Render as plain text for any unhandled file types
      this.filePane.innerHTML = `
        <div style="display: flex; flex-direction: column; height: 100%;">
          <div style="flex: 1; min-height: 0; overflow: auto;">
            <pre style="white-space: pre-wrap; font-family: monospace;">${this.escapeHtml(content)}</pre>
          </div>
          ${this.createFileLink(path)}
        </div>
      `;
    } catch (error) {
      console.error('Error loading file:', error);
      this.filePane.innerHTML = `<p>Error loading file: ${error}</p>`;
    }
  }

  private getLanguageForExtension(extension: string): string {
    const languageMap: { [key: string]: string } = {
      js: 'javascript',
      ts: 'typescript',
      jsx: 'jsx',
      tsx: 'tsx',
      py: 'python',
      cpp: 'cpp',
      c: 'c',
      h: 'c',
      hpp: 'cpp',
      java: 'java',
      cs: 'csharp',
      php: 'php',
      rb: 'ruby',
      go: 'go',
      rs: 'rust',
      swift: 'swift',
      kt: 'kotlin',
      scala: 'scala',
      sh: 'bash',
      bash: 'bash',
      zsh: 'bash',
      fish: 'bash',
      sql: 'sql',
      css: 'css',
      scss: 'scss',
      sass: 'sass',
      less: 'less',
      json: 'json',
      xml: 'xml',
      yaml: 'yaml',
      yml: 'yaml',
      toml: 'toml',
      ini: 'ini',
      cfg: 'ini',
      conf: 'ini',
      dockerfile: 'dockerfile',
      makefile: 'makefile',
      cmake: 'cmake',
    };
    return languageMap[extension] || extension;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private updateMarkdownTheme(): void {
    // Find all zero-md elements in the file pane and update their theme
    const zeroMdElements = this.filePane.querySelectorAll('zero-md');
    zeroMdElements.forEach((element) => {
      // Remove existing theme template
      const existingTemplate = element.querySelector('template');
      if (existingTemplate) {
        existingTemplate.remove();
      }
    });
  }

  private setupLinkClickHandler(): void {
    const zeroMdElements = this.filePane.querySelectorAll('zero-md');
    zeroMdElements.forEach((zeroMd) => {
      // Listen for the zero-md-rendered event to ensure content is loaded
      zeroMd.addEventListener('zero-md-rendered', () => {
        this.attachLinkListeners(zeroMd);
      });
      
      // Also check if it's already rendered
      if (zeroMd.shadowRoot) {
        this.attachLinkListeners(zeroMd);
      }
      
      // Add a mutation observer to watch for changes in the shadow DOM
      this.observeShadowDOMChanges(zeroMd);
    });
  }

  private attachLinkListeners(zeroMd: Element): void {
    const shadowRoot = zeroMd.shadowRoot;
    if (!shadowRoot) return;

    // Find all links in the shadow DOM
    const links = shadowRoot.querySelectorAll('a[href]');
    console.log(`Found ${links.length} links in zero-md shadow DOM`);
    
    links.forEach((link) => {
      const anchorLink = link as HTMLAnchorElement;
      // Remove existing listeners to avoid duplicates
      anchorLink.removeEventListener('click', this.handleLinkClick);
      // Add click listener
      anchorLink.addEventListener('click', this.handleLinkClick);
      console.log('Attached click listener to link:', anchorLink.href);
    });
  }

  private observeShadowDOMChanges(zeroMd: Element): void {
    const shadowRoot = zeroMd.shadowRoot;
    if (!shadowRoot) return;

    // Create a mutation observer to watch for changes in the shadow DOM
    const observer = new MutationObserver((mutations) => {
      let shouldReattach = false;
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          // Check if any added nodes contain links
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              if (element.tagName === 'A' || element.querySelectorAll('a[href]').length > 0) {
                shouldReattach = true;
              }
            }
          });
        }
      });
      
      if (shouldReattach) {
        console.log('Shadow DOM changed, reattaching link listeners');
        this.attachLinkListeners(zeroMd);
      }
    });

    // Start observing
    observer.observe(shadowRoot, {
      childList: true,
      subtree: true
    });
  }

  private handleLinkClick = (event: Event): void => {
    const link = event.target as HTMLAnchorElement;
    if (link && link.href) {
      console.log('Link clicked:', {
        href: link.href,
        text: link.textContent?.trim(),
        target: link.target,
        element: link
      });
      
      // Check if this is a link to a document file that we should handle internally
      const url = new URL(link.href);
      if (url.pathname.startsWith('/files/api/file/')) {
        // Prevent default navigation
        event.preventDefault();
        
        // Extract the file path from the API path (remove /files/api/file prefix)
        const filePath = url.pathname.replace('/files/api/file', '');
        // Update the browser URL to use the UI route format with path parameter
        const newUrl = `/ui/files${filePath}`;
        window.history.pushState(null, '', newUrl);
        
        // Show the linked file in the current file pane
        console.log("SHOW", url.pathname);
        this.showFile(url.pathname);
      }
    }
  };

  private async renderJupyterNotebook(path: string): Promise<void> {
    try {
      const content = await get_text(path);
      if (!content) {
        this.filePane.innerHTML = '<p>Notebook file not found or empty</p>';
        return;
      }

      const notebook = JSON.parse(content);
      
      // Create the renderer using the browser's document
      const renderer = createRenderer(document);
      
      // Render the notebook to a DOM element
      const notebookElement = renderer.render(notebook);
      
      // Clear the file pane
      this.filePane.innerHTML = '';
      
      // Create wrapper container
      const container = document.createElement('div');
      container.className = 'jupyter-notebook-container';
      container.style.cssText = `
        max-width: 100%;
        background: var(--sl-color-neutral-0);
        color: var(--sl-color-neutral-900);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
        line-height: 1.6;
        padding: 20px;
      `;
      
      // Create header
      const header = document.createElement('div');
      header.className = 'notebook-header';
      header.style.cssText = `
        border-bottom: 1px solid var(--sl-color-neutral-200);
        padding-bottom: 10px;
        margin-bottom: 20px;
      `;
      
      const title = document.createElement('h2');
      title.style.cssText = 'margin: 0; color: var(--sl-color-primary-600);';
      title.textContent = '📓 Jupyter Notebook';
      header.appendChild(title);
      
      // Assemble the final structure
      container.appendChild(header);
      container.appendChild(notebookElement);
      this.filePane.appendChild(container);
      
    } catch (error) {
      console.error('Error rendering Jupyter notebook:', error);
      this.filePane.innerHTML = `<p>Error rendering notebook: ${error instanceof Error ? error.message : String(error)}</p>`;
    }
  }

  private createFileLink(path: string): string {
    return `
      <p style="flex-shrink: 0; margin: 0; padding: 8px 0; text-align: center; font-size: 0.9em; background-color: var(--sl-color-neutral-100); color: var(--sl-color-neutral-700);">
        <a href="${path}" target="_blank" style="color: var(--sl-color-primary-600);">Click here to open the file in a new tab</a>
      </p>
    `;
  }
}