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
