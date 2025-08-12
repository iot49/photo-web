import { createFileWrapper, setFileContent } from './utils';

export function renderHtml(filePane: HTMLDivElement, path: string): void {
  const contentHtml = `
    <iframe src="${path}" width="100%" style="flex: 1; min-height: 0;" frameborder="0"></iframe>
  `;
  
  setFileContent(filePane, createFileWrapper(contentHtml, path));
}