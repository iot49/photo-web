import { get_text } from '../../api';
import { emitFilePathEvent, setFileContent } from './utils';

// Import our local browser-compatible notebookjs
// @ts-ignore - local JS file without TypeScript declarations
import nb from './notebookjs.js';


/*
COMPLETED:
✓ render markdown with zero-md
✓ remove unneeded markdown css from notebook.css

BUG: the code cells are not formatted. 
Is notebook.css ignored?

Part of rendered output:
<div class="nb-cell nb-code-cell"><div class="nb-input" data-prompt-number="3"><pre class=""><code class="lang-python" data-language="python">5-9</code></pre></div><div class="nb-output" data-prompt-number="3"><pre class="nb-text-output">-4</pre></div></div>
*/

export async function renderJupyterNotebook(filePane: HTMLDivElement, path: string): Promise<void> {
  try {
    const content = await get_text(path);
    if (!content) {
      setFileContent(filePane, '<p>Notebook file not found or empty</p>');
      return;
    }

    const ipynb = JSON.parse(content);
    
    // Parse and render the notebook using notebookjs
    const notebook = nb.parse(ipynb);
    const notebookElement = notebook.render();
    
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
    
    // Create notebook content container with notebookjs styling
    const notebookContent = document.createElement('div');
    notebookContent.className = 'notebook-content nb-notebook';
    notebookContent.style.cssText = `
      font-family: Helvetica Neue, Helvetica, sans-serif;
      font-size: 14px;
      width: 99%;
      max-width: 750px;
      margin: 0 auto;
    `;
    
    // Add the rendered notebook HTML
    notebookContent.appendChild(notebookElement);
    
    // Ensure CSS styles are applied by adding critical styles inline as fallback
    const style = document.createElement('style');
    style.textContent = `
      .nb-cell {
        margin-bottom: 1em;
        border: 1px solid var(--sl-color-neutral-200);
        border-radius: 6px;
        overflow: hidden;
        background: var(--sl-color-neutral-0);
      }
      
      .nb-code-cell {
        border: 1px solid var(--sl-color-neutral-300);
      }
      
      .nb-code-cell .nb-input {
        background: var(--sl-color-neutral-50);
        border-bottom: 1px solid var(--sl-color-neutral-200);
      }
      
      .nb-code-cell .nb-input pre {
        margin: 0;
        padding: 12px 16px;
        background: transparent;
        border: none;
        font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
        font-size: 13px;
        line-height: 1.4;
        overflow-x: auto;
      }
      
      .nb-code-cell .nb-input code {
        background: transparent;
        padding: 0;
        border: none;
        font-family: inherit;
      }
      
      .nb-output {
        padding: 12px 16px;
        background: var(--sl-color-neutral-0);
      }
      
      .nb-text-output {
        background: var(--sl-color-neutral-50);
        padding: 12px 16px;
        border-radius: 4px;
        margin: 8px 0;
        font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
        font-size: 13px;
        line-height: 1.4;
        white-space: pre-wrap;
        overflow-x: auto;
      }
      
      .nb-input[data-prompt-number]::before {
        content: "In [" attr(data-prompt-number) "]:";
        display: block;
        font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
        font-size: 11px;
        color: var(--sl-color-neutral-500);
        margin-bottom: 4px;
        font-weight: bold;
      }
      
      .nb-output[data-prompt-number]::before {
        content: "Out[" attr(data-prompt-number) "]:";
        display: block;
        font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
        font-size: 11px;
        color: var(--sl-color-neutral-500);
        margin-bottom: 4px;
        font-weight: bold;
      }
    `;
    container.appendChild(style);
    
    // Assemble the final structure
    container.appendChild(header);
    container.appendChild(notebookContent);
    
    // Emit the file path event for the bottom bar
    emitFilePathEvent(path);
    
    filePane.appendChild(container);
    
  } catch (error) {
    console.error('Error rendering Jupyter notebook:', error);
    setFileContent(filePane, `<p>Error rendering notebook: ${error instanceof Error ? error.message : String(error)}</p>`);
  }
}