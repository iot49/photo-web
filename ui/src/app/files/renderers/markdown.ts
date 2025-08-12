import { createFileWrapper, setFileContent } from './utils';

export interface MarkdownRenderer {
  setupLinkClickHandler: () => void;
}

export function renderMarkdown(
  filePane: HTMLDivElement,
  path: string,
  renderer: MarkdownRenderer
): void {
  const contentHtml = `
    <div style="flex: 1; min-height: 0; overflow: auto;">
      <zero-md src=${path}>

      </zero-md>
    </div>
  `;
  
  setFileContent(filePane, createFileWrapper(contentHtml, path));
  // Add link click handler after zero-md is rendered
  renderer.setupLinkClickHandler();
}