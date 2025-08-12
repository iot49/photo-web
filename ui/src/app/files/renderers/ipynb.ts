import { get_text } from '../../api';
import { createRenderer } from 'ipynb2html';
import { createFileLink, setFileContent } from './utils';

export async function renderJupyterNotebook(filePane: HTMLDivElement, path: string): Promise<void> {
  try {
    const content = await get_text(path);
    if (!content) {
      setFileContent(filePane, '<p>Notebook file not found or empty</p>');
      return;
    }

    const notebook = JSON.parse(content);
    
    // Create the renderer using the browser's document
    const renderer = createRenderer(document);
    
    // Render the notebook to a DOM element
    const notebookElement = renderer.render(notebook);
    
    // Clear the file pane
    filePane.innerHTML = '';
    
    // Create wrapper container
    const container = document.createElement('div');
    container.className = 'jupyter-notebook-container';
    container.style.cssText = `
      max-width: 100%;
      background: var(--sl-color-neutral-0);
      color: var(--sl-color-neutral-900);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      line-height: 1.6;
      padding: 20px;
    `;
    
    // Create header
    const header = document.createElement('div');
    header.className = 'notebook-header';
    header.style.cssText = `
      border-bottom: 1px solid var(--sl-color-neutral-200);
      padding-bottom: 10px;
      margin-bottom: 20px;
    `;
    
    const title = document.createElement('h2');
    title.style.cssText = 'margin: 0; color: var(--sl-color-primary-600);';
    title.textContent = '📓 Jupyter Notebook';
    header.appendChild(title);
    
    // Assemble the final structure
    container.appendChild(header);
    container.appendChild(notebookElement);
    
    // Create the file link element
    const fileLinkDiv = document.createElement('div');
    fileLinkDiv.innerHTML = createFileLink(path);
    
    filePane.appendChild(container);
    filePane.appendChild(fileLinkDiv);
    
  } catch (error) {
    console.error('Error rendering Jupyter notebook:', error);
    setFileContent(filePane, `<p>Error rendering notebook: ${error instanceof Error ? error.message : String(error)}</p>`);
  }
}