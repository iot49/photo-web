import { get_text } from '../../api';
import { createFileWrapper, setFileContent, getLanguageForExtension, escapeHtml } from './utils';

export interface CodeRenderer {
  setupLinkClickHandler: () => void;
}

export async function renderCode(
  filePane: HTMLDivElement, 
  path: string, 
  extension: string,
  renderer: CodeRenderer
): Promise<void> {
  // Download content first for code files
  const content = await get_text(path);
  if (!content) {
    setFileContent(filePane, '<p>File not found or empty</p>');
    return;
  }
  
  // Render code files with syntax highlighting using zero-md
  const language = getLanguageForExtension(extension);
  const escapedContent = escapeHtml(content);
  
  const contentHtml = `
    <div style="flex: 1; min-height: 0; overflow: auto;">
      <zero-md>

        <script type="text/markdown">
\`\`\`${language}
${escapedContent}
\`\`\`
        </script>
      </zero-md>
    </div>
  `;
  
  setFileContent(filePane, createFileWrapper(contentHtml, path));
  // Add link click handler after zero-md is rendered
  renderer.setupLinkClickHandler();
}