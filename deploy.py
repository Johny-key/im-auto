#!/usr/bin/env python3
"""
Deploy: landing (Next.js standalone) + parser (Docker) → VPS
Usage: python3 deploy.py
"""
import os, sys, tarfile, io, subprocess, time, tempfile
import paramiko

PROJECT = os.path.dirname(os.path.abspath(__file__))


def _load_env_file(path: str):
    """Load key=value pairs from file into os.environ (does not override existing vars)."""
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, _, v = line.partition("=")
                    os.environ.setdefault(k.strip(), v.strip())
    except FileNotFoundError:
        pass


_load_env_file(os.path.join(PROJECT, ".env.deploy"))

HOST            = os.environ.get("DEPLOY_HOST") or sys.exit("DEPLOY_HOST not set in .env.deploy")
USER            = os.environ.get("DEPLOY_USER", "root")
PASS            = os.environ.get("DEPLOY_PASS") or sys.exit("DEPLOY_PASS not set in .env.deploy")
PARSER_API_KEY    = os.environ.get("PARSER_API_KEY") or sys.exit("PARSER_API_KEY not set in .env.deploy")
POSTGRES_PASSWORD = os.environ.get("POSTGRES_PASSWORD", "encar")
CORS_ORIGINS      = os.environ.get("CORS_ORIGINS", f"http://{os.environ.get('DEPLOY_HOST', 'localhost')}")

NGINX_CONF = """\
server {
    listen 80 default_server;
    server_name _;
    client_max_body_size 50M;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
"""

PM2_CONFIG = """\
module.exports = {
  apps: [{
    name: 'landing',
    script: '/opt/landing/server.js',
    env: {
      NODE_ENV: 'production',
      PORT: '3000',
      HOSTNAME: '127.0.0.1',
    }
  }]
};
"""

INSTALL_SCRIPT = """\
set -e
export DEBIAN_FRONTEND=noninteractive

echo "--- update ---"
apt-get update -qq 2>&1 | tail -1

echo "--- nginx, curl ---"
apt-get install -y -qq nginx curl ca-certificates gnupg 2>&1 | tail -2

echo "--- docker ---"
if ! command -v docker &>/dev/null; then
    curl -fsSL https://get.docker.com | sh 2>&1 | tail -5
else
    echo "docker: $(docker --version)"
fi
systemctl enable docker --now 2>&1 | head -1 || true

echo "--- docker-compose plugin ---"
if ! docker compose version &>/dev/null 2>&1; then
    apt-get install -y -qq docker-compose-plugin 2>&1 | tail -2
else
    echo "$(docker compose version)"
fi

echo "--- node 20 ---"
if ! node --version 2>/dev/null | grep -qE 'v2[0-9]'; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - 2>&1 | tail -2
    apt-get install -y nodejs 2>&1 | tail -2
else
    echo "node: $(node --version)"
fi

echo "--- pm2 ---"
npm install -g pm2 --silent 2>&1 | tail -1 || true
echo "pm2: $(pm2 --version 2>/dev/null || echo 'installed')"

echo "--- done ---"
"""

# ── helpers ───────────────────────────────────────────────────────────────────

def ok(msg): print(f"\033[32m  ✓ {msg}\033[0m")
def step(msg): print(f"\n\033[1;36m=== {msg} ===\033[0m")
def info(msg): print(f"  {msg}")

def run_remote(ssh, cmd, timeout=300, check=True):
    """Run command on remote, print output line by line."""
    _, stdout, _ = ssh.exec_command(cmd, timeout=timeout)
    stdout.channel.set_combine_stderr(True)
    for line in iter(stdout.readline, ""):
        line = line.rstrip()
        if line:
            info(line)
    code = stdout.channel.recv_exit_status()
    if check and code != 0:
        raise RuntimeError(f"Exit {code}: {cmd[:80]}")
    return code

def upload_dir_as_tar(ssh, sftp, local_dir, remote_dir):
    """Pack local_dir → tar.gz → upload → extract into remote_dir."""
    info(f"packing {os.path.relpath(local_dir, PROJECT)} ...")
    tmp = tempfile.mktemp(suffix=".tar.gz")
    try:
        with tarfile.open(tmp, "w:gz") as tar:
            tar.add(local_dir, arcname=".")
        size_mb = os.path.getsize(tmp) / 1024 / 1024
        info(f"uploading {size_mb:.1f} MB ...")
        remote_tmp = f"/tmp/deploy_{os.path.basename(local_dir)}.tar.gz"
        sftp.put(tmp, remote_tmp)
        run_remote(ssh, f"mkdir -p {remote_dir} && tar -xzf {remote_tmp} -C {remote_dir} && rm {remote_tmp}")
        ok(f"{os.path.basename(local_dir)} uploaded")
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)

def write_remote_file(sftp, remote_path, content):
    """Write text content to a remote file."""
    with sftp.open(remote_path, "w") as f:
        f.write(content)
    ok(f"written {remote_path}")

# ── main ──────────────────────────────────────────────────────────────────────

def main():
    # 1. Build Next.js locally
    step("Building Next.js (standalone)")
    result = subprocess.run(["npm", "run", "build"], cwd=PROJECT)
    if result.returncode != 0:
        sys.exit("Build failed!")
    ok("build complete")

    standalone = os.path.join(PROJECT, ".next/standalone")
    static_dir  = os.path.join(PROJECT, ".next/static")
    public_dir  = os.path.join(PROJECT, "public")
    parser_dir  = os.path.join(PROJECT, "parser")

    for d, name in [(standalone, "standalone"), (static_dir, "static"), (public_dir, "public")]:
        if not os.path.isdir(d):
            sys.exit(f"Missing: {name} — build may have failed")

    # 2. Connect
    step("Connecting to VPS")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        ssh.connect(HOST, username=USER, password=PASS, timeout=30)
    except paramiko.ssh_exception.SSHException as e:
        sys.exit(
            f"SSH error: {e}\n"
            f"Host key not in known_hosts. Run once: ssh {USER}@{HOST} exit"
        )
    ssh.get_transport().set_keepalive(20)
    ok(f"connected to {HOST}")
    run_remote(ssh, "uname -a")

    sftp = ssh.open_sftp()

    # 3. Install system packages
    step("Installing packages")
    write_remote_file(sftp, "/tmp/install.sh", INSTALL_SCRIPT)
    run_remote(ssh, "bash /tmp/install.sh && rm /tmp/install.sh", timeout=600)

    # 4. Upload landing
    step("Uploading landing")
    run_remote(ssh, "rm -rf /opt/landing && mkdir -p /opt/landing")
    upload_dir_as_tar(ssh, sftp, standalone, "/opt/landing")

    run_remote(ssh, "mkdir -p /opt/landing/.next/static /opt/landing/public")
    upload_dir_as_tar(ssh, sftp, static_dir, "/opt/landing/.next/static")
    upload_dir_as_tar(ssh, sftp, public_dir, "/opt/landing/public")

    # Write .env.production.local
    env_path = os.path.join(PROJECT, ".env.local")
    with open(env_path) as f:
        env_content = f.read()
    lines = []
    for line in env_content.splitlines():
        if line.startswith("PARSER_API_KEY="):
            lines.append(f"PARSER_API_KEY={PARSER_API_KEY}")
        else:
            lines.append(line)
    write_remote_file(sftp, "/opt/landing/.env.production.local", "\n".join(lines) + "\n")

    # PM2 ecosystem
    write_remote_file(sftp, "/opt/landing/ecosystem.config.js", PM2_CONFIG)

    # 5. Persistent data dir + rate update script
    step("Setting up data dir and rate script")
    run_remote(ssh, "mkdir -p /opt/data /opt/scripts")
    sftp.put(os.path.join(PROJECT, "scripts/update-rate.js"), "/opt/scripts/update-rate.js")
    ok("update-rate.js uploaded")
    # Cron: 05:00 UTC = 08:00 MSK, run rate update script
    cron_line = "0 5 * * * /usr/bin/node /opt/scripts/update-rate.js >> /var/log/rate-update.log 2>&1"
    run_remote(ssh, f'(crontab -l 2>/dev/null | grep -v update-rate.js; echo "{cron_line}") | crontab -')
    ok("cron configured (08:00 MSK daily)")

    # 6. Upload parser
    step("Uploading parser")
    run_remote(ssh, "rm -rf /opt/parser && mkdir -p /opt/parser")
    upload_dir_as_tar(ssh, sftp, parser_dir, "/opt/parser")
    write_remote_file(
        sftp, "/opt/parser/.env",
        f"API_KEY={PARSER_API_KEY}\nPOSTGRES_PASSWORD={POSTGRES_PASSWORD}\nCORS_ORIGINS={CORS_ORIGINS}\n"
    )

    # 6. Start parser
    step("Starting parser (Docker Compose)")
    run_remote(ssh, "cd /opt/parser && docker compose up -d --build db api 2>&1", timeout=300)
    time.sleep(5)
    run_remote(ssh, "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'")

    # 7. Configure Nginx
    step("Configuring Nginx")
    write_remote_file(sftp, "/etc/nginx/sites-available/landing", NGINX_CONF)
    run_remote(ssh, (
        "ln -sf /etc/nginx/sites-available/landing /etc/nginx/sites-enabled/landing && "
        "rm -f /etc/nginx/sites-enabled/default && "
        "nginx -t && systemctl restart nginx"
    ))
    ok("nginx configured")

    # 8. Start landing
    step("Starting landing (PM2)")
    run_remote(ssh, "pm2 delete landing 2>/dev/null || true")
    run_remote(ssh, "cd /opt/landing && pm2 start ecosystem.config.js --update-env")
    run_remote(ssh, "pm2 save")
    # Enable pm2 on boot
    run_remote(ssh, "pm2 startup systemd -u root --hp /root 2>&1 | grep -v '^\\[' | tail -3 || true")
    run_remote(ssh, "pm2 list")

    # 9. Health checks
    step("Health check")
    time.sleep(4)
    run_remote(ssh, f"curl -s -o /dev/null -w 'landing: HTTP %{{http_code}}' http://localhost:3000/ && echo")
    run_remote(ssh, f"curl -s -o /dev/null -w 'parser:  HTTP %{{http_code}}' http://localhost:8000/ && echo")
    run_remote(ssh, "systemctl is-active nginx && echo 'nginx: active'")

    sftp.close()
    ssh.close()

    print(f"\n\033[1;32m{'='*50}\033[0m")
    print(f"\033[1;32m  Deploy complete!\033[0m")
    print(f"  Landing: \033[4mhttp://{HOST}/\033[0m")
    print(f"  Admin:   \033[4mhttp://{HOST}/admin\033[0m")
    print(f"\033[1;32m{'='*50}\033[0m\n")

if __name__ == "__main__":
    main()
