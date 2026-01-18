FROM tailscale/tailscale:latest

# Install OpenSSH client for proxying to server container
RUN apk add --no-cache openssh-client

# Generate SSH keypair for internal sidecar->server communication
RUN mkdir -p /root/.ssh && \
    ssh-keygen -t ed25519 -f /root/.ssh/id_ed25519 -N "" -C "tailscale-sidecar" && \
    chmod 700 /root/.ssh && \
    chmod 600 /root/.ssh/id_ed25519

# Create wrapper script that proxies SSH to the server container
# This handles both interactive shells and command execution
# Uses keys from /sidecar-ssh if available (shared volume), falls back to built-in keys
RUN printf '%s\n' \
    '#!/bin/sh' \
    'KEY_FILE="/root/.ssh/id_ed25519"' \
    'if [ -f "/sidecar-ssh/id_ed25519" ]; then' \
    '  KEY_FILE="/sidecar-ssh/id_ed25519"' \
    'fi' \
    'if [ $# -eq 0 ]; then' \
    '  exec ssh -tt -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null root@127.0.0.1' \
    'else' \
    '  exec ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null root@127.0.0.1 "$@"' \
    'fi' \
    > /usr/local/bin/proxy-shell && \
    chmod +x /usr/local/bin/proxy-shell

# Set root's login shell to proxy-shell so Tailscale SSH uses it
RUN sed -i 's|/bin/sh|/usr/local/bin/proxy-shell|' /etc/passwd

# Embed Tailscale Serve config inside the image
RUN mkdir -p /config
COPY serve-config.json /config/serve.json

# Default location for the serve config (can still be overridden at runtime)
ENV TS_SERVE_CONFIG=/config/serve.json
