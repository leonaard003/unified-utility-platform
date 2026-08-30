# Auto-deploy setup for unified-utility-platform

This repo is ready for GitHub Actions deployment to the VPS.

## VPS details
- Host: `187.127.206.192`
- Username: `root`
- SSH port: `22`

## 1) Generate a dedicated SSH key on the VPS
Run on the VPS:

```bash
mkdir -p /root/.ssh
ssh-keygen -t ed25519 -C "github-actions-unified-utility-platform" -f /root/.ssh/github_actions_uup -N ""
cat /root/.ssh/github_actions_uup.pub >> /root/.ssh/authorized_keys
chmod 700 /root/.ssh
chmod 600 /root/.ssh/authorized_keys /root/.ssh/github_actions_uup
cat /root/.ssh/github_actions_uup
```

The last command prints the **private key**. Copy the full block including:
- `-----BEGIN OPENSSH PRIVATE KEY-----`
- `-----END OPENSSH PRIVATE KEY-----`

## 2) Add GitHub repo secrets
In GitHub repo `leonaard003/unified-utility-platform`:
- Go to **Settings** -> **Secrets and variables** -> **Actions**
- Add these repository secrets:

### `VPS_HOST`
```text
187.127.206.192
```

### `VPS_USERNAME`
```text
root
```

### `VPS_PORT`
```text
22
```

### `VPS_SSH_KEY`
Paste the private key from `/root/.ssh/github_actions_uup`

## 3) Push this workflow to GitHub
After the workflow file is committed and pushed, every push to `main` auto-deploys.

## 4) Test deployment
Make a tiny commit, push to `main`, then check:
- GitHub Actions tab for workflow status
- VPS app URL: `http://tools.aviroam.com:3100`

## Future deploy flow
After this is set up, your flow becomes:
1. revise code
2. push to GitHub `main`
3. GitHub Actions SSH into VPS and redeploy automatically

## Enabling the external provider layer (APIFY_TOKEN)

YouTube refuses requests from datacenter IPs, so `yt-dlp` running on the VPS
gets `Sign in to confirm you're not a bot`. Routing the request through an
external provider makes it come from that provider's address pool instead.

The code path already exists — it only needs a token in the container's
environment. `docker-compose.yml` passes these through from a `.env` file that
sits next to it on the server. That file is untracked, so the token never
reaches the repository.

### On the VPS

```bash
cd /root/unified-utility-platform
cat > .env <<'EOF'
APIFY_TOKEN=paste-your-token-here
EOF
chmod 600 .env
docker compose up -d --build
```

### Verify it took effect

```bash
curl -s http://127.0.0.1:3100/api/transcript
```

`providers.apifyConfigured` should now read `true`, and each feature should
report `enabled: true`. While the token is missing it reads `false` with the
reason spelled out — the app never pretends the provider is available.

### Notes

- The token is read from `process.env` on every request, so no rebuild is
  needed to rotate it — recreate the container and it takes effect.
- `.env` survives `git pull`, so deployments do not overwrite it.
- Set `UUP_PROVIDER_MODE=local-only` to switch the layer off again without
  removing the token.
