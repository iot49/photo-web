import { createFileWrapper, setFileContent } from './utils';

export function renderImage(filePane: HTMLDivElement, path: string, fileName: string): void {
  const contentHtml = `
    <div style="flex: 1; display: flex; align-items: center; justify-content: center;">
      <img src="${path}" alt="${fileName}" style="max-width: 100%; height: auto;">
    </div>
  `;
  
  setFileContent(filePane, createFileWrapper(contentHtml, path));
}