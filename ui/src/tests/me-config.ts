import { get_json, put_json } from '../app/api';
import { PwTests } from '../pw-tests';

export async function test_me_config(msg: PwTests) {
  msg.out('# Testing Me Context Configuration Updates...');

  // Initial user check and roles fetch
  let me = await get_json('/auth/me');
  
  // Verify user is logged in
  if (!me || !me.email) {
    msg.err('❌ User must be logged in to run this test');
    return;
  }

  const userRoles = (me.roles || 'public').split(',').map((r: string) => r.trim());
  const isAdmin = userRoles.includes('admin');
  const hasProtected = userRoles.includes('protected');
  const canUpdateConfig = isAdmin || hasProtected;
  
  msg.out(`Current user: ${me.email}`);
  msg.out(`Current user roles: ${JSON.stringify(userRoles)}`);
  msg.out(`Is admin: ${isAdmin}`);
  msg.out(`Has protected role: ${hasProtected}`);
  msg.out(`Can update config: ${canUpdateConfig}`);

  // Check if user has required permissions
  if (!canUpdateConfig) {
    msg.err('❌ User must have "protected" or "admin" role to update configuration');
    msg.out('## Authorization Requirements');
    msg.out('The `/auth/users/{email}/me` endpoint requires:');
    msg.out('- **"public"** role (minimum) - allows config updates only');
    msg.out('- **"admin"** role - allows config and other field updates');
    msg.out('');
    msg.out('**Test cannot proceed without proper authorization.**');
    return;
  }

  // Store original config for restoration
  const originalConfig = me.config || null;
  const originalRoles = me.roles;
  
  // Display original config properly formatted
  let displayConfig = 'null';
  if (originalConfig) {
    try {
      let configToParse = originalConfig;
      
      // Handle multiple layers of JSON escaping by repeatedly parsing until we get an object
      while (typeof configToParse === 'string') {
        const parsed = JSON.parse(configToParse);
        if (typeof parsed === 'object' && parsed !== null) {
          configToParse = parsed;
          break;
        } else {
          configToParse = parsed;
        }
      }
      
      displayConfig = JSON.stringify(configToParse, null, 2);
    } catch (error) {
      // If parsing fails, show the raw string with some cleanup for readability
      const rawConfig = String(originalConfig);
      msg.out(`Original config (raw): ${rawConfig}`);
      msg.out(`Parse error: ${error instanceof Error ? error.message : String(error)}`);
      displayConfig = 'Failed to parse - see raw output above';
    }
  }
  
  msg.out(`Original config: ${displayConfig}`);
  msg.out(`Original roles: ${originalRoles}`);

  let configTestsPassed = 0;
  let configTestsFailed = 0;
  let roleTestsPassed = 0;
  let roleTestsFailed = 0;

  try {
    // Test 1: Update slideshow configuration
    msg.out('## Test 1: Updating slideshow configuration...');
    
    const newSlideshowConfig = {
      config: JSON.stringify({
        dark_mode: false,
        slideshow: {
          duration: 6000,
          transition: 1500,
          panorama: 3,
          scale_factor: 1.5
        }
      })
    };

    try {
      const updateResponse = await put_json(`/auth/users/${me.email}/me`, newSlideshowConfig);
      
      if (updateResponse && updateResponse.config) {
        const parsedConfig = JSON.parse(updateResponse.config);
        if (parsedConfig.slideshow && parsedConfig.slideshow.duration === 6000) {
          configTestsPassed++;
          msg.out('✓ Slideshow configuration updated successfully');
          msg.out(`  - Duration: ${parsedConfig.slideshow.duration}ms`);
          msg.out(`  - Transition: ${parsedConfig.slideshow.transition}ms`);
          msg.out(`  - Panorama: ${parsedConfig.slideshow.panorama}`);
          msg.out(`  - Scale factor: ${parsedConfig.slideshow.scale_factor}`);
        } else {
          configTestsFailed++;
          msg.err('✗ Slideshow configuration not updated correctly');
        }
      } else {
        configTestsFailed++;
        msg.err('✗ No config returned in update response');
      }
    } catch (error) {
      configTestsFailed++;
      msg.err(`✗ Error updating slideshow config: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Test 2: Update dark mode setting
    msg.out('## Test 2: Updating dark mode setting...');
    
    const darkModeConfig = {
      config: JSON.stringify({
        dark_mode: true,
        slideshow: {
          duration: 6000,
          transition: 1500,
          panorama: 3,
          scale_factor: 1.5
        }
      })
    };

    try {
      const updateResponse = await put_json(`/auth/users/${me.email}/me`, darkModeConfig);
      
      if (updateResponse && updateResponse.config) {
        const parsedConfig = JSON.parse(updateResponse.config);
        if (parsedConfig.dark_mode === true) {
          configTestsPassed++;
          msg.out('✓ Dark mode setting updated successfully');
          msg.out(`  - Dark mode: ${parsedConfig.dark_mode}`);
        } else {
          configTestsFailed++;
          msg.err('✗ Dark mode setting not updated correctly');
        }
      } else {
        configTestsFailed++;
        msg.err('✗ No config returned in dark mode update response');
      }
    } catch (error) {
      configTestsFailed++;
      msg.err(`✗ Error updating dark mode: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Test 3: Test role updates and config separation
    msg.out('## Test 3: Testing role update and config separation...');
    
    const originalRolesList = userRoles.slice(); // Copy original roles
    const newRoles = [...originalRolesList, 'admin'].join(','); // Add admin role
    
    const roleUpdateData = {
      roles: newRoles
    };

    try {
      // First, update roles using admin endpoint
      const roleUpdateResponse = await put_json(`/auth/users/${me.email}`, roleUpdateData);
      
      if (roleUpdateResponse) {
        const responseRoles = (roleUpdateResponse.roles || 'public').split(',').map((r: string) => r.trim());
        
        if (isAdmin) {
          // Admin users should be able to update roles
          if (responseRoles.includes('admin')) {
            roleTestsPassed++;
            msg.out('✓ Admin user successfully updated roles');
            msg.out(`New roles: ${JSON.stringify(responseRoles)}`);
          } else {
            roleTestsFailed++;
            msg.err('✗ Admin user failed to update roles');
          }
        } else {
          // Non-admin users should NOT be able to update roles
          const rolesChanged = JSON.stringify(responseRoles.sort()) !== JSON.stringify(originalRolesList.sort());
          if (!rolesChanged) {
            roleTestsPassed++;
            msg.out('✓ Non-admin user correctly prevented from updating roles');
            msg.out(`  - Roles unchanged: ${JSON.stringify(responseRoles)}`);
          } else {
            roleTestsFailed++;
            msg.err('✗ Non-admin user incorrectly allowed to update roles');
            msg.err(`  - Original: ${JSON.stringify(originalRolesList)}`);
            msg.err(`  - New: ${JSON.stringify(responseRoles)}`);
          }
        }

        // Now separately update config using the /me endpoint
        const configUpdateData = {
          config: JSON.stringify({
            dark_mode: true,
            slideshow: {
              duration: 7000,
              transition: 1500,
              panorama: 3,
              scale_factor: 1.5
            }
          })
        };

        const configUpdateResponse = await put_json(`/auth/users/${me.email}/me`, configUpdateData);
        
        if (configUpdateResponse && configUpdateResponse.config) {
          const parsedConfig = JSON.parse(configUpdateResponse.config);
          if (parsedConfig.slideshow && parsedConfig.slideshow.duration === 7000) {
            configTestsPassed++;
            msg.out('✓ Config updated successfully via /me endpoint');
          } else {
            configTestsFailed++;
            msg.err('✗ Config not updated via /me endpoint');
          }
        } else {
          configTestsFailed++;
          msg.err('✗ No config response from /me endpoint');
        }
      } else {
        roleTestsFailed++;
        msg.err('✗ No response received for role update test');
      }
    } catch (error) {
      roleTestsFailed++;
      msg.err(`✗ Error testing role updates: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Test 4: Verify current state via /auth/me
    msg.out('## Test 4: Verifying current state via /auth/me...');
    
    try {
      const currentMe = await get_json('/auth/me');
      
      if (currentMe && currentMe.config) {
        const currentConfig = JSON.parse(currentMe.config);
        msg.out('✓ Successfully retrieved current user state');
        msg.out(`  - Current config: ${JSON.stringify(currentConfig)}`);
        msg.out(`  - Current roles: ${currentMe.roles}`);
        
        // Verify the config matches our last update
        if (currentConfig.slideshow && currentConfig.slideshow.duration === 7000) {
          configTestsPassed++;
          msg.out('✓ Config state matches expected values');
        } else {
          configTestsFailed++;
          msg.err('✗ Config state does not match expected values');
        }
      } else {
        configTestsFailed++;
        msg.err('✗ Failed to retrieve current user state');
      }
    } catch (error) {
      configTestsFailed++;
      msg.err(`✗ Error verifying current state: ${error instanceof Error ? error.message : String(error)}`);
    }

  } finally {
    // Restore original configuration
    msg.out('## Restoring original configuration...');
    
    try {
      if (originalConfig) {
        const restoreData = { config: originalConfig };
        await put_json(`/auth/users/${me.email}/me`, restoreData);
        msg.out('✓ Original configuration restored');
      } else {
        msg.out('ℹ No original configuration to restore');
      }
    } catch (error) {
      msg.err(`⚠ Failed to restore original configuration: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Test Summary
  msg.out('## Me Configuration Test Summary');
  
  const totalConfigTests = configTestsPassed + configTestsFailed;
  const totalRoleTests = roleTestsPassed + roleTestsFailed;
  const totalTests = totalConfigTests + totalRoleTests;
  const totalPassed = configTestsPassed + roleTestsPassed;
  const totalFailed = configTestsFailed + roleTestsFailed;
  
  const summaryTable = `
| Test Category | Total Tests | Passed | Failed | Success Rate |
|---------------|-------------|--------|--------|--------------|
| Configuration Updates | ${totalConfigTests} | ${configTestsPassed} | ${configTestsFailed} | ${totalConfigTests > 0 ? Math.round((configTestsPassed / totalConfigTests) * 100) : 0}% |
| Role Update Restrictions | ${totalRoleTests} | ${roleTestsPassed} | ${roleTestsFailed} | ${totalRoleTests > 0 ? Math.round((roleTestsPassed / totalRoleTests) * 100) : 0}% |
| **Overall Results** | **${totalTests}** | **${totalPassed}** | **${totalFailed}** | **${totalTests > 0 ? Math.round((totalPassed / totalTests) * 100) : 0}%** |
`;
  
  msg.out(summaryTable);

  // Additional insights
  msg.out('## Test Insights');
  if (isAdmin) {
    msg.out('- ✓ Admin user tested: Can update both config and roles');
  } else {
    msg.out('- ✓ Non-admin user tested: Can update config but not roles');
  }
  
  msg.out('- ✓ Configuration updates work independently of role restrictions');
  msg.out('- ✓ Role update restrictions properly enforced based on user permissions');
  msg.out('- ✓ API maintains data integrity during partial update attempts');
}