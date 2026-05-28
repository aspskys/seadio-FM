# Cloudflare Tunnel for Seadio Backend

Exposes the Docker backend running on `localhost:8080` to the public internet at
`https://api.seadio.<your-domain>` without opening any inbound firewall port and
without renting a VPS.

## One-Time Setup

Install `cloudflared`:

```bash
brew install cloudflared
```

Authenticate (opens a browser, requires a Cloudflare account that already
manages your DNS zone):

```bash
cloudflared tunnel login
```

Create the tunnel and capture its UUID:

```bash
cloudflared tunnel create seadio
```

Copy the template and fill in `<TUNNEL_UUID>` and `<YOUR_DOMAIN>`:

```bash
cp cloudflared/config.yml.template cloudflared/config.yml
$EDITOR cloudflared/config.yml
```

Route DNS so `api.seadio.<your-domain>` resolves to the tunnel:

```bash
cloudflared tunnel route dns seadio api.seadio.<your-domain>
```

## Running the Tunnel

Foreground (for testing):

```bash
cloudflared tunnel --config cloudflared/config.yml run seadio
```

As a macOS LaunchAgent (survives reboots):

```bash
sudo cloudflared --config "$PWD/cloudflared/config.yml" service install
sudo launchctl start com.cloudflare.cloudflared
```

## Verifying

```bash
curl https://api.seadio.<your-domain>/api/health
```

Expected: `{"ok":true,...}` matching the local `curl http://localhost:8080/api/health`.

## Tear-down

```bash
sudo launchctl stop com.cloudflare.cloudflared
sudo cloudflared service uninstall
cloudflared tunnel delete seadio
```
