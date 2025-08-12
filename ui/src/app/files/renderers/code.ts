import { get_text } from '../../api';
import { createFileWrapper, setFileContent, getLanguageForExtension } from './utils';
import hljs from 'highlight.js';

export interface CodeRenderer {
  setupLinkClickHandler: () => void;
}

export async function renderCode(filePane: HTMLDivElement, path: string, extension: string, _renderer: CodeRenderer): Promise<void> {
  const content = await get_text(path);
  if (!content) {
    setFileContent(filePane, '<p>File not found or empty</p>');
    return;
  }

  // Render code files with syntax highlighting using highlight.js
  const language = getLanguageForExtension(extension);

  // Use highlight.js with the detected language and pass the HTML string to createFileWrapper
  const highlighted = language ? hljs.highlight(content, { language }) : hljs.highlightAuto(content);

  // TODO: find a better way to include the styles. Check assumptions, do not guess! 
  // Note: Claude only breaks this.
  setFileContent(
    filePane,
    createFileWrapper(
      '<link rel="stylesheet" href="https://unpkg.com/@highlightjs/cdn-assets@11.7.0/styles/default.min.css" />' +
        `<pre><code>${highlighted.value}</code></pre>`,
      path
    )
  );

  // Add link click handler after highlighting is applied
  // renderer.setupLinkClickHandler();
}
