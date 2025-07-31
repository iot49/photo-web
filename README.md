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

#### Clone the Repository

Go to the folder where you want to install photo-web and clone the source from github:

```{bash}
git clone https://github.com/iot49/photo-web.git
cd photo-web
cp .env.example .env
```

#### Get a Domain Name

Login to [Cloudflare](https://www.cloudflare.com/) and purchase a domain name. Update `ROOT_DOMAIN` in the `.env` file.

> [!NOTE]
> All access to photo web is encrypted (i.e. https). Because of this a domain name is required even for local access.

> [!TIP]
> Modify the `traefik` configuration if you prefer a different registar.

Create an [API Token](https://dash.cloudflare.com/profile/api-tokens)

#### Create a Cloudflare API Token (CF_API_TOKEN)

1. Go to [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click "Create Token"
3. Use the "Custom token" template
4. Configure the token with these permissions:
   - **Zone:DNS:Edit** - for DNS challenge during SSL certificate generation
   - **Zone:Zone:Read** - to read zone information
5. Set **Zone Resources** to:
   - Include: Zone - `your-domain.com` (replace with your actual domain)
6. Optionally set **Client IP Address Filtering** to restrict token usage to your server's IP
7. Click "Continue to summary" and then "Create Token"
8. Copy the generated token and update `CF_API_TOKEN` in your `.env` file

#### Create a Cloudflare Tunnel Token (CF_TUNNEL_TOKEN)

1. Go to [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/)
2. Navigate to **Networks** → **Tunnels**
3. Click "Create a tunnel"
4. Choose "Cloudflared" as the connector type
5. Give your tunnel a name (e.g., "photo-web-tunnel")
6. Click "Save tunnel"
7. In the "Install and run a connector" section, copy the token from the command shown (it's the long string after `--token`)
8. Update `CF_TUNNEL_TOKEN` in your `.env` file with this token
9. In the "Route tunnel" section, configure:
   - **Public hostname**: your domain (e.g., `example.com`)
   - **Service**: `http://traefik:81` (note: port 81, not 80)
10. Add any additional subdomains you want to route (e.g., `traefik.example.com`)
11. Click "Save tunnel"

> [!NOTE]
> The tunnel token enables secure external access to your photo-web instance without opening ports on your firewall.

## Architecture

The [Project Brief](./projectBrief.md) provides a concise overview. The AI generated documentation in the `./docs` (render with `mkdocs build`) a rather *extensive* AI generated discussion.
