# Hostinger VPS deploy notes

Target domain: `tools.aviroam.com`

## Recommended deployment mode
- New Docker project/container, separate from Hermes
- Traefik / HTTPS routing enabled in the panel
- Do **not** attach this to the existing `hermes-agent-fhcm` project

## What this app expects
- Docker build support in Hostinger Docker Manager
- Public DNS record for `tools.aviroam.com` pointing to this VPS
- Port 3100 exposed publicly as a fallback (`http://SERVER_IP:3100`) unless you later front it with Traefik/Nginx

## Deploy steps
1. Create DNS record for `tools.aviroam.com` -> this VPS IP.
2. In Docker Manager, create a **new project** named `unified-utility-platform`.
3. Use this repo/project folder with the included `docker-compose.yml`.
4. Make sure Traefik is enabled for the project.
5. Deploy the stack.
6. Wait for healthcheck to pass.
7. Open `https://tools.aviroam.com`.

## Revisions later
You can still revise easily after deploy:
1. edit code
2. rebuild / redeploy the container
3. refresh the website

Best workflow later:
- keep this project in GitHub
- update code there
- redeploy from the repo or re-upload updated source

## Notes
- The container installs `yt-dlp` and `ffmpeg` itself.
- Temp files live in `/app/tmp` inside a Docker volume.
- The app is already configured to bind on `0.0.0.0:3000`.
