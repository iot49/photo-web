# Photo Web

Photo Web is a web application for playing Apple Photo Albums and viewing documents (markdown, pdf, etc.) in a web browser.

## Coding Guidelines

* All project files are in folder `/Users/boser/Documents/iot/photo-web`
* Secrets and configuration are declared in
  * `.env`: environment variables
  * `auth/firebase_secrets`: firebase setup
  * `auth/app/roles.csv`: role-based authorization rules
  * Code always refer to the source. Never copy this information into code files!
* Document work with **concise** descriptions.
* Adhere to DRY (Don't Repeat Yourself) principle. When adding features, refactor code to keep it DRY.
* Keep the length of code files to less than 120 lines. Create new files as needed.


## App Organization

The application comprises a backend and web client. Acccess to the backend  is exclusively via **https** to `${ROOT_DOMAIN}` (defined in `.env`) with a valid certificate. Access via `localhost` or IP address fails (certificate error). The web client is a single page application (SPA) that can be accessed via http (redirected to https) or https.

**Note:** * Note: some features are available only when logged in with role `admin`. Ask the user for assistance to access these features.

* use `docker-compose` to build, start, stop the application and access logs
* `cd ui && npm run build` rebuilds the front-end and makes it available at https://${ROOT_DOMAIN}/ui

File `./projectBrief.md` describes the architecture of the application.
