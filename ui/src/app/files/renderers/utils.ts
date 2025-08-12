export function getLanguageForExtension(extension: string): string {
  const languageMap: { [key: string]: string } = {
    js: 'javascript',
    ts: 'typescript',
    jsx: 'javascript', // highlight.js doesn't have jsx, use javascript
    tsx: 'typescript', // highlight.js doesn't have tsx, use typescript
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

export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function emitFilePathEvent(path: string): void {
  // Emit custom event with file path information
  const event = new CustomEvent('pw-file-path', {
    detail: { path },
    bubbles: true,
    composed: true
  });
  window.dispatchEvent(event);
}

export function createFileWrapper(contentHtml: string, path: string, additionalStyles?: string): string {
  const containerStyle = additionalStyles
    ? `display: flex; flex-direction: column; height: 100%; ${additionalStyles}`
    : 'display: flex; flex-direction: column; height: 100%;';
    
  // Emit the file path event instead of including the link in the content
  emitFilePathEvent(path);
    
  return `
    <div style="${containerStyle}">
      ${contentHtml}
    </div>
  `;
}

export function setFileContent(filePane: HTMLDivElement, content: string): void {
  filePane.innerHTML = content;
}