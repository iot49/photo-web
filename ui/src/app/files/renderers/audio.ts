import { createFileWrapper, setFileContent } from './utils';

export function renderAudio(filePane: HTMLDivElement, path: string, fileName: string, extension: string): void {
  const contentHtml = `
    <div style="flex: 1; padding: 20px; text-align: center; display: flex; flex-direction: column; justify-content: center;">
      <h3>${fileName}</h3>
      <audio controls style="width: 100%; max-width: 500px;">
        <source src="${path}" type="audio/${extension === 'm4a' ? 'mp4' : extension}">
        Your browser does not support the audio element.
      </audio>
    </div>
  `;
  
  setFileContent(filePane, createFileWrapper(contentHtml, path));
}