import { get_text } from '../../api';
import { createFileWrapper, setFileContent, escapeHtml } from './utils';

export async function renderFallback(filePane: HTMLDivElement, path: string): Promise<void> {
  const content = await get_text(path);

  if (!content) {
    setFileContent(filePane, `<p>File not found or empty: ${path}</p>`);
    return;
  }

  // Render as plain text for any unhandled file types
  const contentHtml = `
    <div style="flex: 1; min-height: 0; overflow: auto;">
      <pre style="white-space: pre-wrap; font-family: monospace;">${escapeHtml(content)}</pre>
    </div>
  `;
  
  setFileContent(filePane, createFileWrapper(contentHtml, path));
}