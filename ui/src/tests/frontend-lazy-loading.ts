import { get_json } from '../app/api';
import { PwTests } from '../pw-tests';

export async function test_frontend_lazy_loading(msg: PwTests) {
  msg.out('# Testing Frontend Lazy Loading Behavior...');

  // Helper function to simulate the exact lazy loading behavior from pw-files-browser.ts
  async function simulateLazyLoad(path: string, name: string): Promise<{duration: number, success: boolean, error?: string}> {
    const startTime = performance.now();
    
    try {
      // This replicates the exact call from pw-files-browser.ts line 92
      const uri = `/files/api/folder/${path}/${name}`;
      msg.out(`Simulating lazy load call: ${uri}`);
      
      const data = await get_json(uri);
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      msg.out(`✓ Lazy load successful: ${duration.toFixed(2)}ms`);
      msg.out(`  - Response: ${data.folders?.length || 0} folders, ${data.files?.length || 0} files`);
      return { duration, success: true };
    } catch (error) {
      const endTime = performance.now();
      const duration = endTime - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      msg.err(`✗ Lazy load error: ${duration.toFixed(2)}ms - ${errorMsg}`);
      return { duration, success: false, error: errorMsg };
    }
  }

  // Helper function to analyze DOM manipulation performance
  function simulateDOMManipulation(folderCount: number, fileCount: number): number {
    const startTime = performance.now();
    
    // Create a temporary container to simulate the tree manipulation
    const tempContainer = document.createElement('div');
    document.body.appendChild(tempContainer);
    
    try {
      // Simulate creating folder tree items (from pw-files-browser.ts lines 94-101)
      for (let i = 0; i < folderCount; i++) {
        const treeItem = document.createElement('sl-tree-item');
        treeItem.innerText = `folder-${i}`;
        treeItem.className = 'folder-item';
        treeItem.setAttribute('lazy', 'true');
        treeItem.setAttribute('data-path', '/test/path');
        treeItem.setAttribute('data-folder', `folder-${i}`);
        tempContainer.appendChild(treeItem);
      }
      
      // Simulate creating file tree items (from pw-files-browser.ts lines 102-124)
      for (let i = 0; i < fileCount; i++) {
        const treeItem = document.createElement('sl-tree-item');
        const icon = document.createElement('sl-icon');
        icon.setAttribute('name', 'file-text');
        
        treeItem.appendChild(icon);
        treeItem.appendChild(document.createTextNode(`file-${i}.txt`));
        treeItem.className = 'file-item';
        treeItem.setAttribute('data-path', `/test/path/file-${i}.txt`);
        
        // Add click event listener
        treeItem.addEventListener('click', () => {
          // Simulate file renderer call
        });
        
        tempContainer.appendChild(treeItem);
      }
      
      const endTime = performance.now();
      return endTime - startTime;
    } finally {
      // Clean up
      document.body.removeChild(tempContainer);
    }
  }

  // Test 1: Analyze the path construction issue
  msg.out('## Testing Path Construction Issues');
  
  // Test the problematic path construction from the frontend
  // In pw-files-browser.ts, when root folders are clicked:
  // - path = "" (from root)
  // - name = "public" (folder name)
  // - Result: `/files/api/folder//${public}` (double slash)
  
  const pathTests = [
    { path: '', name: 'public', description: 'Root path with public folder (current frontend behavior)' },
    { path: 'public', name: '', description: 'Corrected path construction' },
  ];
  
  for (const test of pathTests) {
    const result = await simulateLazyLoad(test.path, test.name);
    msg.out(`${test.description}: ${result.duration.toFixed(2)}ms ${result.success ? '✓' : '✗'}`);
  }

  // Test 2: DOM Manipulation Performance
  msg.out('## Testing DOM Manipulation Performance');
  
  const domTests = [
    { folders: 10, files: 50, description: 'Small folder (10 folders, 50 files)' },
    { folders: 50, files: 200, description: 'Medium folder (50 folders, 200 files)' },
    { folders: 100, files: 500, description: 'Large folder (100 folders, 500 files)' },
  ];
  
  for (const test of domTests) {
    const duration = simulateDOMManipulation(test.folders, test.files);
    msg.out(`${test.description}: ${duration.toFixed(2)}ms DOM manipulation`);
  }

  // Test 3: Event Handler Performance
  msg.out('## Testing Event Handler Setup Performance');
  
  function testEventHandlerSetup(elementCount: number): number {
    const startTime = performance.now();
    const tempContainer = document.createElement('div');
    document.body.appendChild(tempContainer);
    
    try {
      for (let i = 0; i < elementCount; i++) {
        const element = document.createElement('div');
        element.addEventListener('click', () => {
          // Simulate the file renderer call
          console.log(`File ${i} clicked`);
        });
        tempContainer.appendChild(element);
      }
      
      const endTime = performance.now();
      return endTime - startTime;
    } finally {
      document.body.removeChild(tempContainer);
    }
  }
  
  const eventTests = [50, 200, 500];
  for (const count of eventTests) {
    const duration = testEventHandlerSetup(count);
    msg.out(`Event handlers for ${count} elements: ${duration.toFixed(2)}ms`);
  }

  // Test 4: Analyze the lazy loading flag behavior
  msg.out('## Testing Lazy Loading Flag Behavior');
  
  // Check if the lazy flag is being set correctly
  const tempTreeItem = document.createElement('sl-tree-item');
  tempTreeItem.setAttribute('lazy', 'true');
  const hasLazyAttribute = tempTreeItem.hasAttribute('lazy');
  const lazyValue = tempTreeItem.getAttribute('lazy');
  
  msg.out(`Lazy attribute test: hasAttribute=${hasLazyAttribute}, value="${lazyValue}"`);
  
  // Test the lazy property (Shoelace specific)
  if ('lazy' in tempTreeItem) {
    msg.out(`Lazy property available on sl-tree-item`);
  } else {
    msg.out(`⚠️ Lazy property not available - this might be the issue!`);
  }

  // Test 5: Simulate the exact frontend flow
  msg.out('## Simulating Complete Frontend Flow');
  
  try {
    // Step 1: Get root data (like connectedCallback)
    const rootStart = performance.now();
    const rootData = await get_json('/files/api/root');
    const rootDuration = performance.now() - rootStart;
    msg.out(`Step 1 - Get root: ${rootDuration.toFixed(2)}ms`);
    
    // Step 2: Simulate clicking on first folder (like lazy load event)
    if (rootData.folders && rootData.folders.length > 0) {
      const firstFolder = rootData.folders[0];
      const lazyStart = performance.now();
      
      // This is the exact call pattern from the frontend
      const lazyUri = `/files/api/folder/${rootData.path}/${firstFolder}`;
      const lazyData = await get_json(lazyUri);
      const lazyDuration = performance.now() - lazyStart;
      
      msg.out(`Step 2 - Lazy load ${firstFolder}: ${lazyDuration.toFixed(2)}ms`);
      
      // Step 3: Simulate DOM manipulation
      const domStart = performance.now();
      const folderCount = lazyData.folders?.length || 0;
      const fileCount = lazyData.files?.length || 0;
      simulateDOMManipulation(folderCount, fileCount);
      const domDuration = performance.now() - domStart;
      
      msg.out(`Step 3 - DOM manipulation (${folderCount} folders, ${fileCount} files): ${domDuration.toFixed(2)}ms`);
      
      const totalDuration = rootDuration + lazyDuration + domDuration;
      msg.out(`**Total simulated user interaction time: ${totalDuration.toFixed(2)}ms**`);
      
      if (totalDuration > 3000) {
        msg.out('🚨 **Critical**: Total interaction time > 3 seconds');
      } else if (totalDuration > 1000) {
        msg.out('⚠️ **Warning**: Total interaction time > 1 second');
      } else {
        msg.out('✅ **Good**: Interaction time under 1 second');
      }
    }
  } catch (error) {
    msg.err(`Frontend flow simulation failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  msg.out('## Frontend Analysis Summary');
  msg.out('Based on the tests above, potential issues identified:');
  msg.out('1. **Path Construction**: Double slashes in API calls due to empty root path');
  msg.out('2. **DOM Manipulation**: Creating many tree items with event handlers');
  msg.out('3. **Lazy Loading**: Shoelace lazy loading behavior might not work as expected');
  msg.out('4. **API Response Time**: Backend folder reading performance');
}