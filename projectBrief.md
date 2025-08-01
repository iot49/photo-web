# Photo Web

Photo Web is a web application for playing Apple Photo Albums and viewing documents (markdown, pdf, etc.) in a web browser.

## Features

The application comprises a backend and web client. Acccess to the backend  is exclusively via https to `${ROOT_DOMAIN}` with a valid certificate. The web client is a single page application (SPA) that can be accessed via http (redirected to https) or https.

> [!TIP]
> Encrypted access applies even to testing and development (ingress to `localhost` fails). Hence it is imperative to set up a DNS server for `${ROOT_DOMAIN}` (e.g. adding `127.0.0.1 dev49.org` to `/etc/hosts` on Linux or macOS). Testing strategies include
>
> * access via docker exec
> * adding testing code to the application and accessing it e.g. with curl or the web client
> * creating special `test` containers

## Implementation

### Backend

The backend is a docker stack orchestrated by `docker-compose`. It comprises the following services:

#### Traefik

* The only ingress to the application via
  * port 443
  * port 80 (redirects to port 443)
  * cloudflare tunnel
* Delegates authetication and authorization to the `auth` service
* Rate limiting for ingress via cloudflare tunnel (TODO)

#### Auth

The `auth` service uses [firebase](https://firebase.google.com/) for authentication and a custom implementation of role-based access to specific URIs and authorization.
It is implemented at a [FastAPI](https://fastapi.tiangolo.com/) server. Endpoint documentation is available at `https://${ROOT_DOMAIN}/auth/openapi.json` or formatted at `https://${ROOT_DOMAIN}/auth/redoc` and `https://${ROOT_DOMAIN}/auth/docs`.

##### Authentication

The `/auth/login` endpoint verifies the user with firebase (currently only login with Google is suppoorted). It automatically adds new users to and SQLite database and stores the login credential in a secure cookie valid for ${AUTH_COOKIE_EXPIRATION_DAYS}. The `/auth/logout` endpoint deletes the login and session cookies. `/auth/me` returns the current user information including name, email, and roles.

##### Authorization

Authorization is based on the user's roles and routes defined in `auth/app/roles.csv`. The file has four columns:

* action: allow or deny
* route pattern (wildards supported, e.g. `*/redoc`)
* role (e.g. `public`, `private`). Alternatively this field may delegate to a different authorization service identified by its uri on the internal docker network (e.g. `!photos:8000`).
* a comment

Sample `roles.csv`:

```csv
allow, /, public, main entry point
allow, /ui*, public, user interface

allow, /auth/firebase-config, public
allow, /auth/login*, public, Login page

allow, /photos/api/albums, public, Public album list
allow, /photos/api/photos/srcset, public, Srcset for images
allow, /photos/api/albums/*, !photos:8000, Delegate album access to photos service
allow, /photos/api/photos/*, !photos:8000, Delegate photo access to photos service
allow, /photos/api/reload-db, admin, Reload photos database

...
```

Routes that match are accepted or denied based on the first matching rule. If no rule matches, access is denied.

The application uses the following roles:

* `public`: All visitors to the website (regardless of loging) are assigned this role. It gives access to the user interface and public albums and documents.
* `protected`: Authenticated users are assigned the `public` and `protected` roles by default.
* `private`: Must be explicitly assigned to users by the administrator. It gives access to private albums and documents.
* `admin`: Gives permission to view and edit users (especially roles) and to reload the photos database.
* additional roles specify access to documents as expllained below.

Access to photo albums and individual photos works as follows: Albums in folder `Public` of the Apple Photos App are available to all users (based on the `public` role). Matching is case insensitive. Access to albums in folder `Protected` requires the `protected` role for access, and albums in folder `Private` require the `private` role. Individual photos are accessible based on the album's access rights. If a photo is included in more than one album, it is accessible based on the least restrictive album's access rights.

> [!CAUTION]
> The public/protected/private access rights are deeply ingrained in the way the `photos` service works. Modification would require a major refactoring of the service.

Access to documents is based on the name of folders in the `${FILES}` directory. Only users with roles that match the folder name can access the documents in that folder. Matching is case insensitive. For example, a user with the `private` role can access documents in the `Private` folder, but not in the `Public` or `Protected` folders. The `public` role gives access to documents in the `Public` folder.

> [!TIP]
> Create a folder `family` in the `${FILES}` directory and add to it information you want to share with family members only. Then add the role `family` to users that should have access. To edit users and roles, login to an account with the `admin` role (e.g. the `SUPER_USER_EMAIL` specified in the `.env` file). Click on the three dots to the left of your avatar and choose `Users ...` from the menu.

#### Nginx

The `nginx` service serves static files from the `ui` directory and proxies requests to the `auth`, `files` and `photos` services. It is also used to cache images served by the `photos` service. The configuration is in `nginx/nginx-proxy.conf`.

Processing photos (conversion from `heic` to `jpeg` and scaling) is quite compute intensive. To partially mitigate this issue (short of getting a more powerful server), nginx caches images:

```nginx
# Cache settings for photos - optimized for slow server performance
proxy_cache_path  /var/cache/nginx/photos
                  levels=1:2
                  keys_zone=photos_cache:50m
                  max_size=4g
                  inactive=720h
                  use_temp_path=off
                  manager_files=100
                  manager_threshold=200
                  manager_sleep=300;
```

#### Photos

The `photos` service serves album indices and photos directly from the Apple Photos library (mounted into the service with read-only access) extracted with [OSXPhotos](https://github.com/RhetTbull/osxphotos). It is implemented at a [FastAPI](https://fastapi.tiangolo.com/) server. Endpoint documentation is available at `https://${ROOT_DOMAIN}/photos/openapi.json` or formatted at `https://${ROOT_DOMAIN}/photos/redoc` and `https://${ROOT_DOMAIN}/photos/docs`.

The service does not copy the photo library or its contents, but the `/api/photos/{photo_id}/img{size_suffix}` scales images to common sizes and converts `heic` images to `jpg` on the fly. Nginx caching can be used to speed up access to frequently accessed images.

#### Files

The `files` service gives read-only access to the `${FILES}` folder. It is implemented at a [FastAPI](https://fastapi.tiangolo.com/) server. Endpoint documentation is available at `https://${ROOT_DOMAIN}/auth/openapi.json` or formatted at `https://${ROOT_DOMAIN}/auth/redoc` and `https://${ROOT_DOMAIN}/auth/docs`.

#### Cloudflare Tunnel

The `cloudflared` service sets up a secure tunnel to `traefik` to provide world-wide access to the application.

### Frontend

The frontend is a single page application (SPA) based on [LitElement](https://lit.dev/) and scaffolded with [Vite](https://vitejs.dev/). It is written in TypeScript and uses [Shoelace](https://shoelace.style/) for UI components. The frontend is served by the backend and can be accessed at `https://${ROOT_DOMAIN}`. Main components are:

* `pw-main`: Sets up the routing and provides contexts for `me` (user information) and other information used by several components.
* `pw-nav-page`: Main look-and feel of the application. It contains the header with navigation and main content area.
* `pw-photo-browser`: Interface for browsing and viewing albums in the Apple Photos library.
* `pw-slideshow`: Shows photo albums.
* `pw-files-browser`: The files browser that allows users to browse and view documents in the `${FILES}` folder. Renders common formats like markdown, pdf, and images.
