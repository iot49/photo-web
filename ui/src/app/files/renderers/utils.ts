export function getLanguageForExtension(extension: string): string {
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

export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function createFileLink(path: string): string {
  return `
    <p style="flex-shrink: 0; margin: 0; padding: 8px 0; text-align: center; font-size: 0.9em; background-color: var(--sl-color-neutral-100); color: var(--sl-color-neutral-700);">
      <a href="${path}" target="_blank" style="color: var(--sl-color-primary-600);">Click here to open the file in a new tab</a>
    </p>
  `;
}

export function createFileWrapper(contentHtml: string, path: string, additionalStyles?: string): string {
  const containerStyle = additionalStyles
    ? `display: flex; flex-direction: column; height: 100%; ${additionalStyles}`
    : 'display: flex; flex-direction: column; height: 100%;';
    
  return `
    <div style="${containerStyle}">
      ${contentHtml}
      ${createFileLink(path)}
    </div>
  `;
}

export function setFileContent(filePane: HTMLDivElement, content: string): void {
  filePane.innerHTML = content;
}