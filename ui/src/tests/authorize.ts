import { get_json, get_text } from '../app/api';
import { PwTests } from '../pw-tests';

export async function test_authorize(msg: PwTests) {
  /* TODO:
  verify (with me.roles) that the user is logged in with role "admin".
  Then 
  1) run the test a first time, 
  2) log out (keep the values of variable roles downloaded before) and fetch me again to get the new user roles.
  3) run the test again.
  */
  msg.header('Testing /authorize endpoint...');
  const me = await get_json('/auth/me');
  const roles = await get_text('/auth/roles-csv');

  const services = [ 'auth', 'doc', 'photos' ];
  let openapi: { [key: string]: any } = {};
  for (const service of services) {
    openapi[service] = await get_json(`/${service}/openapi.json`);
  }

  // Helper function to extract GET routes from OpenAPI spec
  function extractGetRoutesFromOpenAPI(spec: any): Array<{path: string}> {
    const routes: Array<{path: string}> = [];
    if (spec && spec.paths) {
      for (const path in spec.paths) {
        const pathObj = spec.paths[path];
        // Convert OpenAPI path parameters to actual paths for testing
        const testPath = path.replace(/{[^}]+}/g, import.meta.env.VITE_SUPER_USER_EMAIL || 'test-param');
        
        // Only extract GET methods
        if (pathObj.get) {
          routes.push({
            path: testPath
          });
        }
      }
    }
    return routes;
  }

  // Helper function to determine expected status based on roles and authorization rules
  function getExpectedStatus(uri: string, userRoles: string[], rolesData: string): number {
    const lines = rolesData.split('\n');
    const userRolesList = userRoles.map(r => r.trim()).filter(r => r);
    
    for (const line of lines) {
      if (line.trim().startsWith('#') || !line.trim()) continue;
      
      const parts = line.split(',').map(p => p.trim());
      if (parts.length < 2) continue;
      
      const [action, pattern, role] = parts;
      
      // Simple pattern matching (could be enhanced with fnmatch-like logic)
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      if (regex.test(uri)) {
        if (!role || role === 'public' || userRolesList.includes(role)) {
          return action === 'allow' ? 200 : 403;
        }
      }
    }
    
    // Default deny
    return 403;
  }
  
  const userRoles = (me.roles || 'public').split(',').map((r: string) => r.trim());
  msg.out(`Current user roles: ${JSON.stringify(userRoles)}`);
  
  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;

  for (const service of services) {
    const spec = openapi[service];
    const routes = extractGetRoutesFromOpenAPI(spec);
    
    msg.header(`Testing "${service}" service GET endpoints (${routes.length} routes)...`);
    
    for (const route of routes) {
      const fullUri = `/${service}${route.path}`;
      
      // Skip endpoints that are handled by delegation (role starts with !)
      const lines = (roles || '').split('\n');
      let isDelegated = false;
      for (const line of lines) {
        if (line.trim().startsWith('#') || !line.trim()) continue;
        const parts = line.split(',').map(p => p.trim());
        if (parts.length >= 3) {
          const [_action, pattern, role] = parts;
          const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
          if (regex.test(fullUri) && role.startsWith('!')) {
            isDelegated = true;
            break;
          }
        }
      }
      
      if (isDelegated) {
        msg.out(`⏭ GET ${fullUri}: Skipped (handled by delegation)`);
        continue;
      }
      
      const expectedStatus = getExpectedStatus(fullUri, userRoles, roles || '');
      
      try {
        // Test the GET endpoint
        const response = await fetch(fullUri, {
          method: 'GET',
          credentials: 'include'
        });
        
        console.log(`Testing GET ${fullUri} returns ${response.status} expected ${expectedStatus} `);
        const actualStatus = response.status;
        totalTests++;
        
        if (actualStatus === expectedStatus) {
          passedTests++;
          msg.out(`✓ GET ${fullUri}: ${actualStatus} (expected ${expectedStatus})`);
        } else {
          failedTests++;
          msg.err(`✗ GET ${fullUri}: ${actualStatus} (expected ${expectedStatus})`);
        }
        
      } catch (error) {
        failedTests++;
        totalTests++;
        msg.err(`✗ GET ${fullUri}: Error - ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  
  // Summary
  msg.header(`Authorization Test Summary:`);
  msg.out(`Total tests: ${totalTests}`);
  msg.out(`Passed: ${passedTests}`);
  msg.out(`Failed: ${failedTests}`);
  msg.out(`Success rate: ${totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0}%`);
  

}

