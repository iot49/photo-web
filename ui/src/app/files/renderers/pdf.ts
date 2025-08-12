import { createFileWrapper, setFileContent } from './utils';

export function renderPdf(filePane: HTMLDivElement, path: string): void {
  const contentHtml = `
    <iframe src="${path}" type="application/pdf" width="100%" style="flex: 1; min-height: 0; border: none; background-color: var(--sl-color-neutral-0);"></iframe>
  `;
  
  setFileContent(filePane, createFileWrapper(contentHtml, path, 'background-color: var(--sl-color-neutral-0);'));
}