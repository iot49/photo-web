# Photo Web

Photo Web provides a secure, web-based interface for accessing your Apple Photos library and static files.

![alt text](images/README/image.png)

## Installation

### Requirements

**Note:** all accounts are **free**, except for the need to purchase a domain name (about \$10/year, depending on name).

1. Server with access to Apple Photos library. On MacOS the library is usually at `/Users/<user-name>/Pictures/Photos Library.photoslibrary` and synchronized automatically via [iCloud](https://www.icloud.com/). Serving from e.g. Linux should be possible, but I have not tried it (iCloud is a bit special :smile:). A (recycled) Mac Mini works well.

2. Docker and docker compose (installed on the server). E.g. [Docker Desktop](https://docs.docker.com/desktop/) on the Mac.

3. A [Cloudflare Account](https://www.cloudflare.com/). Used for domain name registration and global access to the app (if desired).

4. A [Firebase Account](https://firebase.google.com/). Used for user authentication (with Google).

5. [Mkdocs](https://www.mkdocs.org/user-guide/installation/) installation (to create the documentation, if desired).

### Steps

Go to the folder where you want to install photo-web and clone the source from github:

```{bash}
git clone https://github.com/iot49/photo-web.git
cd photo-web
cp .env.example .env
```

Login to [Cloudflare](https://www.cloudflare.com/) and purchase a domain name. Update `ROOT_DOMAIN` in the `.env` file.

Modify the `traefik` configuration if you prefer a different registar.

## Architecture

The [Project Brief](./projectBrief.md) provides a concise overview. The AI generated documentation in the `./docs` (render with `mkdocs build`) a rather *extensive* AI generated discussion.
