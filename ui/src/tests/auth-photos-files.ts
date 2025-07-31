import { get_json } from '../app/api';
import { logout } from '../app/login';
import { PwTests } from '../pw-tests';

export async function test_photos_files(msg: PwTests) {
  msg.out('# Testing /photos authorization...');

  // Initial user check and roles fetch
  let me = await get_json('/auth/me');

  // Verify user is logged in with admin role
  let userRoles = (me.roles || 'public').split(',').map((r: string) => r.trim());
  msg.out(`Current user roles: ${JSON.stringify(userRoles)}`);

  if (!userRoles.includes('admin')) {
    msg.err('❌ User must be logged in with "admin" role to run this test');
    return;
  }

  // Create array of test uri's
  const test_uri: Array<{uri: string, realm: string}> = [];

  // Photos
  const albums = await get_json('/photos/api/albums');

  // Extract albums with different realms (public, protected, private)
  const albumsByRealm: {[key: string]: any} = {};
  for (const [uuid, album] of Object.entries(albums)) {
    const realm = (album as any).realm;
    if (!albumsByRealm[realm]) {
      albumsByRealm[realm] = {uuid, album};
    }
  }

  msg.out(`Found albums in realms: ${Object.keys(albumsByRealm).join(', ')}`);

  // Add album URIs to test_uri and load album details
  for (const [realm, {uuid}] of Object.entries(albumsByRealm)) {
    const albumUri = `/photos/api/albums/${uuid}`;
    test_uri.push({uri: albumUri, realm});
    

    try {
      // Load album details to get photo IDs
      const albumDetails = await get_json(albumUri);
      
      // Add first photo URI from each album (if any photos exist)
      if (albumDetails && albumDetails.length > 0) {
        const photoId = albumDetails[0].uuid;
        const photoUri = `/photos/api/photos/${photoId}/img`;
        test_uri.push({uri: photoUri, realm});
      }
    } catch (error) {
      msg.err(`Failed to load album details for ${uuid}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Files
  const files_root = await get_json('/files/api/root');
  const files_realms = files_root.folders;



  msg.out(`Found files realms: ${files_realms.join(', ')}`);

  // Drill down through doc folders to find files
  for (const realm of files_realms) {
    let filesFound = 0; // Reset counter for each realm to get 2 files per realm
    try {
      const folderUri = `/files/api/folder/${realm}`;
      test_uri.push({uri: folderUri, realm});

      
      const folderData = await get_json(folderUri);
      
      // Add files from this realm
      if (folderData.files && folderData.files.length > 0) {
        for (const fileName of folderData.files.slice(0, 2 - filesFound)) {
          const fileUri = `/files/api/file/${realm}/${fileName}`;
          test_uri.push({uri: fileUri, realm});
          filesFound++;
          if (filesFound >= 2) break; // Stop after 2 files for this realm
        }
      }
      
      // If no files in root, drill down into subfolders
      if (folderData.folders && folderData.folders.length > 0 && filesFound < 2) {
        for (const subFolder of folderData.folders) {
          if (filesFound >= 2) break;
          
          try {
            const subFolderPath = `${realm}/${subFolder}`;
            const subFolderUri = `/files/api/folder/${subFolderPath}`;
            test_uri.push({uri: subFolderUri, realm});
            
            const subFolderData = await get_json(subFolderUri);
            
            if (subFolderData.files && subFolderData.files.length > 0) {
              for (const fileName of subFolderData.files.slice(0, 2 - filesFound)) {
                const fileUri = `/files/api/file/${subFolderPath}/${fileName}`;
                test_uri.push({uri: fileUri, realm});
                filesFound++;
                if (filesFound >= 2) break; // Stop after 2 files for this realm
              }
            }
          } catch (error) {
            msg.err(`Failed to access subfolder ${subFolder}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
    } catch (error) {
      msg.err(`Failed to access files realm ${realm}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Test authorization for logged-in user
  msg.out('## Testing authorization for logged-in user...');
  let loggedInPassed = 0;
  let loggedInFailed = 0;
  let loggedInTotal = 0;

  for (const {uri, realm} of test_uri) {
    loggedInTotal++;
    const expectedStatus = userRoles.includes(realm) ? 200 : 403;
    
    try {
      const response = await fetch(uri, {
        method: 'GET',
        credentials: 'include'
      });
      
      const actualStatus = response.status;
      
      if (actualStatus === expectedStatus) {
        loggedInPassed++;
        msg.out(`✓ ${uri}: ${actualStatus} (expected ${expectedStatus}) - realm: ${realm}`);
      } else {
        loggedInFailed++;
        msg.err(`✗ ${uri}: ${actualStatus} (expected ${expectedStatus}) - realm: ${realm}`);
      }
    } catch (error) {
      loggedInFailed++;
      msg.err(`✗ ${uri}: Error - ${error instanceof Error ? error.message : String(error)} - realm: ${realm}`);
    }
  }

  msg.out('## Logging out user...');
  try {
    await logout('/');
    msg.out('✓ Successfully logged out');
  } catch (error) {
    msg.err(`⚠ Logout error: ${error instanceof Error ? error.message : String(error)}`);
    // Continue with test even if logout fails - we can still check the current user state
    msg.out('Continuing with test despite logout error...');
  }

  // update userRoles
  me = await get_json('/auth/me');
  userRoles = (me.roles || 'public').split(',').map((r: string) => r.trim());

  // Test authorization for logged-out user
  msg.out('## Testing authorization for logged-out user...');
  let loggedOutPassed = 0;
  let loggedOutFailed = 0;
  let loggedOutTotal = 0;

  for (const {uri, realm} of test_uri) {
    loggedOutTotal++;
    const expectedStatus = userRoles.includes(realm) ? 200 : 403;
    
    try {
      const response = await fetch(uri, {
        method: 'GET',
        credentials: 'include'
      });
      
      const actualStatus = response.status;
      
      if (actualStatus === expectedStatus) {
        loggedOutPassed++;
        msg.out(`✓ ${uri}: ${actualStatus} (expected ${expectedStatus}) - realm: ${realm}`);
      } else {
        loggedOutFailed++;
        msg.err(`✗ ${uri}: ${actualStatus} (expected ${expectedStatus}) - realm: ${realm}`);
      }
    } catch (error) {
      loggedOutFailed++;
      msg.err(`✗ ${uri}: Error - ${error instanceof Error ? error.message : String(error)} - realm: ${realm}`);
    }
  }

  // Summarize results
  msg.out('## Authorization Test Summary');
  msg.out(`**Total URIs tested:** ${test_uri.length}`);
  
  const totalTests = loggedInTotal + loggedOutTotal;
  const totalPassed = loggedInPassed + loggedOutPassed;
  const totalFailed = loggedInFailed + loggedOutFailed;
  
  const summaryTable = `
| User State | Total Tests | Passed | Failed | Success Rate |
|------------|-------------|--------|--------|--------------|
| Logged-in user | ${loggedInTotal} | ${loggedInPassed} | ${loggedInFailed} | ${loggedInTotal > 0 ? Math.round((loggedInPassed / loggedInTotal) * 100) : 0}% |
| Logged-out user | ${loggedOutTotal} | ${loggedOutPassed} | ${loggedOutFailed} | ${loggedOutTotal > 0 ? Math.round((loggedOutPassed / loggedOutTotal) * 100) : 0}% |
| **Overall results** | **${totalTests}** | **${totalPassed}** | **${totalFailed}** | **${totalTests > 0 ? Math.round((totalPassed / totalTests) * 100) : 0}%** |
`;
  msg.out(summaryTable);
}
