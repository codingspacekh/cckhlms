#!/bin/sh
# One-time set-up of a fresh Ubuntu LTS VPS (architecture §9.4). Run as root:
#   ssh root@SERVER 'DISK_PING_URL=https://hc-ping.com/… sh -s' < infra/server/provision.sh
# Afterwards root can no longer log in over SSH; use the `deploy` user (same SSH key).
set -eu
export DEBIAN_FRONTEND=noninteractive
DEPLOY_USER=deploy
APP_DIR=/opt/cckhlms

[ -s /root/.ssh/authorized_keys ] || { echo "Add your SSH key to root first (Hetzner does this when you pick a key)."; exit 1; }

apt-get update -q
apt-get upgrade -yq
apt-get install -yq ca-certificates curl ufw fail2ban unattended-upgrades

# Docker Engine + Compose plugin from Docker's own repository
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
# shellcheck source=/dev/null
. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list
apt-get update -q
apt-get install -yq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
# Rotate container logs so they can't fill the disk
cat > /etc/docker/daemon.json <<'JSON'
{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "5" } }
JSON
systemctl restart docker

# Deploy user: same SSH key as root, may run Docker, no password
id "$DEPLOY_USER" >/dev/null 2>&1 || adduser --disabled-password --gecos "" "$DEPLOY_USER"
usermod -aG docker "$DEPLOY_USER"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
install -m 600 -o "$DEPLOY_USER" -g "$DEPLOY_USER" /root/.ssh/authorized_keys "/home/$DEPLOY_USER/.ssh/authorized_keys"
install -d -m 750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR"

# The deploy user may update the system and reboot, nothing else, without a password
cat > /etc/sudoers.d/cckhlms-deploy <<'SUDO'
deploy ALL=(root) NOPASSWD: /usr/bin/apt-get update, /usr/bin/apt-get upgrade -y, /usr/sbin/reboot
SUDO
chmod 440 /etc/sudoers.d/cckhlms-deploy
visudo -cf /etc/sudoers.d/cckhlms-deploy

# SSH: keys only, no root login
cat > /etc/ssh/sshd_config.d/10-cckhlms.conf <<'CONF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
CONF
sshd -t
systemctl reload ssh

# Firewall: SSH only. Web traffic arrives through the Cloudflare Tunnel (outbound), so 80/443 stay closed.
# Docker-published ports would bypass ufw; compose.prod.yaml publishes none (tested in CI).
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw --force enable

# Automatic security updates; fail2ban protects SSH with its default jail
dpkg-reconfigure -f noninteractive unattended-upgrades
systemctl enable --now fail2ban

# Disk alert every 30 minutes: pings DISK_PING_URL (healthchecks.io), or /fail when the disk is > 80 % full
[ -n "${DISK_PING_URL:-}" ] && printf '%s\n' "$DISK_PING_URL" > /etc/cckhlms-alert-url
install -m 755 /dev/stdin /usr/local/bin/cckhlms-disk-alert <<'SH'
#!/bin/sh
url=$(cat /etc/cckhlms-alert-url 2>/dev/null || true)
used=$(df --output=pcent / | tail -1 | tr -dc '0-9')
if [ "$used" -gt 80 ] && [ -n "$url" ]; then curl -fsS -m 10 -o /dev/null "$url/fail" || true; elif [ -n "$url" ]; then curl -fsS -m 10 -o /dev/null "$url" || true; fi
SH
echo '*/30 * * * * root /usr/local/bin/cckhlms-disk-alert' > /etc/cron.d/cckhlms-disk-alert

echo "Done. Next: log in as '$DEPLOY_USER', put .env in $APP_DIR (see infra/server/env.example), then run the first deploy."
