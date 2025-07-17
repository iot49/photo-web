// https://github.com/firebase/firebaseui-web

import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';

// Firebase configuration fetched from server
let firebaseConfig: any = null;
let app: any = null;
let auth: any = null;

// Function to fetch Firebase configuration from server
async function initializeFirebase() {
  if (firebaseConfig) {
    return; // Already initialized
  }

  try {
    // Fetch Firebase config from server
    const response = await fetch(`/auth/firebase-config`, {
      method: 'GET',
      credentials: 'include',
      mode: 'cors',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Firebase config: ${response.status} ${response.statusText}`);
    }

    firebaseConfig = await response.json();
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);

    console.log('Firebase initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Firebase:', error);
    throw error;
  }
}

// TODO: the redirect: 'follow' in login and logout result in "Mixed Content: The page at 'https://dev49.org/ui/' was loaded over HTTPS, but requested an insecure resource 'http://dev49.org/ui'. This request has been blocked; the content must be served over HTTPS."
// remove the follow for testing and examine the redirect url received. Does it redirect to http?
export async function login(redirect: string) {
  // logs user in & redirects to uri

  // Ensure Firebase is initialized before attempting login
  await initializeFirebase();

  const provider = new GoogleAuthProvider();
  signInWithPopup(auth, provider)
    .then((result) => {
      result.user.getIdToken().then(async function (idToken) {
        fetch(`/auth/login?id_token=${idToken}&redirect_uri=${redirect}`, {
          method: 'POST',
          // redirect: 'follow',
          redirect: 'manual',
          credentials: 'include',
          mode: 'cors',
        })
          .then(async (response) => {
            if (response.redirected) {
              console.log('1 LOGIN redirect', response.url);
              // Emit pw-login event before redirect
              window.dispatchEvent(new CustomEvent('pw-login'));
              window.location.href = response.url;
            } else if (!response.ok) {
              // Handle error responses
              const errorText = await response.text();
              console.error(`2 Login failed with status ${response.status}: ${errorText}`);
              throw new Error(`2 Login failed: ${response.status} ${response.statusText}`);
            } else {
              console.log('3 Login successful but no redirect');
            }
          })
          .catch(function (err) {
            console.error('4 Login fetch ERROR', err);
          })
          .finally(function () {
            window.dispatchEvent(new CustomEvent('pw-login'));
          });
      })
    })
    .catch((error) => {
      console.error(`login ${redirect}`, error);
    });
}

export function logout(redirect: string) {
  fetch(`/auth/logout?redirect_uri=${redirect}`, {
    method: 'POST',
    redirect: 'follow',
    credentials: 'include',
    mode: 'cors',
  })
    .then(async (response) => {
      if (response.redirected) {
        console.log('LOGOUT redirect', response.url);
        // Emit pw-logout event before redirect
        window.dispatchEvent(new CustomEvent('pw-logout'));
        window.location.href = response.url;
      } else if (!response.ok) {
        // Handle error responses
        const errorText = await response.text();
        console.error(`Logout failed with status ${response.status}: ${errorText}`);
        throw new Error(`Logout failed: ${response.status} ${response.statusText}`);
      } else {
        console.log('Logout successful but no redirect');
        // Emit pw-logout event for successful logout without redirect
        window.dispatchEvent(new CustomEvent('pw-logout'));
      }
    })
    .catch(function (err) {
      console.error('Lougout fetch ERROR', err);
    })
    .finally(function () {
      window.dispatchEvent(new CustomEvent('pw-logout'));
    });
}
