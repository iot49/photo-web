import { get_json } from '../app/api';
import { PwTests } from '../pw-tests';

export async function test_files_performance(msg: PwTests) {
  msg.out('# Testing Files API Performance...');

  // Helper function to measure API call time
  async function measureApiCall(uri: string, description: string): Promise<number> {
    const startTime = performance.now();
    try {
      await get_json(uri);
      const endTime = performance.now();
      const duration = endTime - startTime;
      msg.out(`✓ ${description}: ${duration.toFixed(2)}ms`);
      return duration;
    } catch (error) {
      const endTime = performance.now();
      const duration = endTime - startTime;
      msg.err(`✗ ${description}: ${duration.toFixed(2)}ms - Error: ${error instanceof Error ? error.message : String(error)}`);
      return duration;
    }
  }

  // Helper function to measure fetch call time with more details
  async function measureFetchCall(uri: string, description: string): Promise<{duration: number, status: number, size?: number}> {
    const startTime = performance.now();
    try {
      const data = await get_json(uri);
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      msg.out(`✓ ${description}: ${duration.toFixed(2)}ms (Status: 200)`);
      if (data.folders) {
        msg.out(`  - Folders: ${data.folders.length}, Files: ${data.files ? data.files.length : 0}`);
      }
      
      return { duration, status: 200 };
    } catch (error) {
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Extract status from error message if possible
      const errorMessage = error instanceof Error ? error.message : String(error);
      const statusMatch = errorMessage.match(/HTTP error! status: (\d+)/);
      const status = statusMatch ? parseInt(statusMatch[1]) : 500;
      
      msg.err(`✗ ${description}: ${duration.toFixed(2)}ms (Status: ${status})`);
      return { duration, status };
    }
  }

  const measurements: Array<{name: string, duration: number}> = [];

  // Test 1: Root API call
  msg.out('## Testing Root API Performance');
  const rootDuration = await measureApiCall('/files/api/root', 'Get root folders');
  measurements.push({name: 'Root API', duration: rootDuration});

  // Get the root data to test specific folders
  let rootData;
  try {
    rootData = await get_json('/files/api/root');
    msg.out(`Root folders found: ${rootData.folders.join(', ')}`);
  } catch (error) {
    msg.err(`Failed to get root data: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  // Test 2: Test each root folder (this is where the delay likely occurs)
  msg.out('## Testing Individual Folder Performance');
  for (const folder of rootData.folders) {
    const folderUri = `/files/api/folder/${folder}`;
    const result = await measureFetchCall(folderUri, `Get folder: ${folder}`);
    measurements.push({name: `Folder: ${folder}`, duration: result.duration});
    
    // If this is the 'public' folder and it's slow, let's investigate further
    if (folder === 'public' && result.duration > 1000) {
      msg.out(`⚠️  Public folder is slow (${result.duration.toFixed(2)}ms) - investigating...`);
      
      // Test the exact same call that the frontend makes
      try {
        const publicData = await get_json(folderUri);
        if (publicData.folders && publicData.folders.length > 0) {
          msg.out(`Public folder contains ${publicData.folders.length} subfolders and ${publicData.files ? publicData.files.length : 0} files`);
          
          // Test a subfolder to see if the issue is recursive
          const firstSubfolder = publicData.folders[0];
          const subfolderUri = `/files/api/folder/public/${firstSubfolder}`;
          const subResult = await measureFetchCall(subfolderUri, `Get subfolder: public/${firstSubfolder}`);
          measurements.push({name: `Subfolder: public/${firstSubfolder}`, duration: subResult.duration});
        }
      } catch (error) {
        msg.err(`Failed to investigate public folder: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  // Test 3: Test the exact API calls that the frontend lazy loading makes
  msg.out('## Testing Frontend Lazy Loading API Calls');
  
  // Simulate the exact call pattern from pw-files-browser.ts line 92
  // The frontend calls: `/files/api/folder/${path}/${name}`
  // Where path="" (root) and name="public" for the public folder
  const lazyLoadUri = '/files/api/folder//public'; // Note the double slash
  const lazyResult = await measureFetchCall(lazyLoadUri, 'Lazy load call (with double slash)');
  measurements.push({name: 'Lazy Load (double slash)', duration: lazyResult.duration});

  // Test the corrected version
  const correctedUri = '/files/api/folder/public';
  const correctedResult = await measureFetchCall(correctedUri, 'Corrected lazy load call');
  measurements.push({name: 'Lazy Load (corrected)', duration: correctedResult.duration});

  // Test 4: Multiple rapid calls to simulate user interaction
  msg.out('## Testing Rapid Sequential Calls');
  const rapidCalls = [];
  const rapidStartTime = performance.now();
  
  for (let i = 0; i < 3; i++) {
    const callStart = performance.now();
    try {
      await get_json('/files/api/folder/public');
      const callEnd = performance.now();
      rapidCalls.push(callEnd - callStart);
    } catch (error) {
      const callEnd = performance.now();
      rapidCalls.push(callEnd - callStart);
    }
  }
  
  const rapidTotalTime = performance.now() - rapidStartTime;
  msg.out(`Rapid calls: ${rapidCalls.map(t => t.toFixed(2)).join('ms, ')}ms (Total: ${rapidTotalTime.toFixed(2)}ms)`);

  // Summary
  msg.out('## Performance Summary');
  const summaryTable = `
| API Call | Duration (ms) | Status |
|----------|---------------|--------|
${measurements.map(m => `| ${m.name} | ${m.duration.toFixed(2)} | ${m.duration > 1000 ? '🐌 Slow' : m.duration > 500 ? '⚠️ Moderate' : '✅ Fast'} |`).join('\n')}
`;
  msg.out(summaryTable);

  // Identify the slowest calls
  const slowCalls = measurements.filter(m => m.duration > 1000);
  if (slowCalls.length > 0) {
    msg.out('### Slow API Calls (>1000ms):');
    slowCalls.forEach(call => {
      msg.out(`- ${call.name}: ${call.duration.toFixed(2)}ms`);
    });
  }

  // Performance recommendations
  msg.out('## Performance Analysis');
  const avgDuration = measurements.reduce((sum, m) => sum + m.duration, 0) / measurements.length;
  msg.out(`Average API call duration: ${avgDuration.toFixed(2)}ms`);
  
  if (avgDuration > 1000) {
    msg.out('🚨 **Critical Performance Issue Detected**');
    msg.out('- API calls are taking over 1 second on average');
    msg.out('- This suggests a backend performance problem');
  } else if (avgDuration > 500) {
    msg.out('⚠️ **Moderate Performance Issue Detected**');
    msg.out('- API calls are slower than expected');
  } else {
    msg.out('✅ **API Performance Looks Good**');
    msg.out('- The delay might be in the frontend rendering');
  }
}