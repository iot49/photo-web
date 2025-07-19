import { get_text } from './app/api';

export class FileRenderer {
  private filePane: HTMLDivElement;

  constructor(filePane: HTMLDivElement) {
    this.filePane = filePane;
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
          /* BUG:
          @/ui/src/file-renderer.ts is used by @/ui/src/pw-doc-browser.ts to render markdown 
          content into this.filePane. 
          Markdown links are rendered as html anchors with href e.g. https://dev49.org/doc/api/file/public/b.md. 
          These fail in the lit router @/ui/src/pw-main.ts  in catchall path.
          What's the best way to fix this issue? Could the /doc/api/file/* path be intercepted in the lit router
          and used to update the filePane in @/ui/src/pw-doc-browser.ts? What's a clean way to accomplish this?
          */
          this.filePane.innerHTML = `<zero-md src=${path}></zero-md>`;
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
          this.filePane.innerHTML = `<img src="${path}" alt="${fileName}" style="max-width: 100%; height: auto;">`;
          return;

        case 'pdf':
          // Render PDF using iframe instead of embed to avoid fullscreen permissions policy violations
          this.filePane.innerHTML = `
            <div style="display: flex; flex-direction: column; height: 100%;">
              <iframe src="${path}" type="application/pdf" width="100%" style="flex: 1; min-height: 0; border: none;"></iframe>
              <p style="flex-shrink: 0; margin: 0; padding: 8px 0; text-align: center; font-size: 0.9em; background-color: lightgray;">
                If PDF doesn't display, <a href="${path}" target="_blank">click here to open in new tab</a>
              </p>
            </div>
          `;
          return;

        case 'html':
        case 'htm':
          // Render HTML in iframe for security
          this.filePane.innerHTML = `<iframe src="${path}" width="100%" height="100%" frameborder="0"></iframe>`;
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
            <div style="padding: 20px; text-align: center;">
              <h3>${fileName}</h3>
              <audio controls style="width: 100%; max-width: 500px;">
                <source src="${path}" type="audio/${extension === 'm4a' ? 'mp4' : extension}">
                Your browser does not support the audio element.
              </audio>
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
            <zero-md>
              <script type="text/markdown">
\`\`\`${language}
${escapedContent}
\`\`\`
              </script>
            </zero-md>
          `;
          return;

      }

      // Fallback for unhandled file types - render as plain text
      const content = await get_text(path);

      if (!content) {
        this.filePane.innerHTML = '<p>File not found or empty</p>';
        return;
      }

      // Render as plain text for any unhandled file types
      this.filePane.innerHTML = `<pre style="white-space: pre-wrap; font-family: monospace;">${this.escapeHtml(content)}</pre>`;
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
}
