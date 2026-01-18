#!/usr/bin/env bash
set -euo pipefail

log() { echo "[entrypoint] $*" >&2; }

# ======================
# Export runtime environment for SSH sessions
# ======================
# Docker environment variables are only available to PID 1 (entrypoint).
# SSH sessions don't inherit them, so we write key variables to /etc/environment
# which PAM reads for all login sessions.
{
    echo "GH_TOKEN=${GH_TOKEN:-}"
    echo "GH_USERNAME=${GH_USERNAME:-}"
    echo "WORKSPACE_REPO=${WORKSPACE_REPO:-}"
    echo "WORKSPACE_BRANCH=${WORKSPACE_BRANCH:-main}"
} >> /etc/environment
log "Exported runtime environment to /etc/environment"

# ======================
# Clear stale GitHub CLI credentials
# ======================
# The gh CLI config may persist in volumes with stale/invalid tokens.
# Clear it so gh uses the GH_TOKEN environment variable instead.
rm -rf ~/.config/gh 2>/dev/null || true

# ======================
# Start Tailscale
# ======================
if [ -n "${TS_AUTHKEY:-}" ]; then
    log "Starting Tailscale daemon..."

    # Build tailscaled arguments
    # TS_WG_PORT: Fixed WireGuard port for predictable NAT traversal (enables direct connections)
    # TS_TUN_NAME: Custom TUN interface name (must be ≤15 chars for Linux)
    TAILSCALED_ARGS="--state=/var/lib/tailscale/tailscaled.state --socket=/var/run/tailscale/tailscaled.sock"
    if [ -n "${TS_WG_PORT:-}" ]; then
        TAILSCALED_ARGS="$TAILSCALED_ARGS --port=${TS_WG_PORT}"
        log "Using fixed WireGuard port: ${TS_WG_PORT}"
    fi
    if [ -n "${TS_TUN_NAME:-}" ]; then
        TAILSCALED_ARGS="$TAILSCALED_ARGS --tun=${TS_TUN_NAME}"
    fi

    # Start tailscaled in the background
    tailscaled $TAILSCALED_ARGS &
    
    # Wait for socket to be ready
    for i in {1..30}; do
        if [ -S /var/run/tailscale/tailscaled.sock ]; then
            break
        fi
        sleep 0.1
    done
    
    # Build tailscale up arguments
    TS_EXTRA_ARGS="${TS_EXTRA_ARGS:---ssh}"
    TS_HOSTNAME="${TS_HOSTNAME:-${HOSTNAME:-agent}}"
    
    log "Connecting to Tailscale as ${TS_HOSTNAME}..."
    # --accept-dns=true: Enable MagicDNS so containers can resolve each other's FQDNs
    # Required for manager-app to connect to agent containers via hostname
    # --advertise-tags: Apply tags for filtering in Tailscale API
    # Note: Ephemeral behavior is controlled by the auth key type, not a flag
    tailscale up --authkey="${TS_AUTHKEY}" --hostname="${TS_HOSTNAME}" --accept-dns=true ${TS_EXTRA_ARGS}
    
    # Configure Tailscale serve to proxy dev server (port 5173) over HTTPS
    # This makes the dev server accessible at https://<hostname>.<tailnet>/
    if [ "${TS_SERVE_DEV:-true}" = "true" ]; then
        log "Configuring Tailscale serve for dev server on port 5173..."
        tailscale serve --bg 5173 2>/dev/null || true
    fi
    
    log "Tailscale connected"
else
    log "WARNING: TS_AUTHKEY not set, skipping Tailscale"
fi

# Start SSH daemon (required for coordinator communication via regular SSH)
if command -v /usr/sbin/sshd >/dev/null 2>&1; then
    /usr/sbin/sshd
    log "SSH daemon started"
else
    log "WARNING: sshd not found"
fi

# GitHub CLI authentication is handled via GH_TOKEN environment variable
# which takes precedence over stored credentials (no gh auth login needed)

# Stow dotfiles from shared volume (mounted at ~/.config/dotfiles)
# The volume is populated externally; this just applies the dotfiles
DOTFILES_DIR="${DOTFILES_DIR:-$HOME/.config/dotfiles}"
if [ -d "$DOTFILES_DIR" ] && [ "$(ls -A "$DOTFILES_DIR" 2>/dev/null)" ]; then
    log "Stowing dotfiles from $DOTFILES_DIR..."
    cd "$DOTFILES_DIR" && stow . --adopt
    log "Dotfiles stowed"
elif [ -n "${DOTFILES_REPO:-}" ]; then
    # Fallback: clone dotfiles if volume is empty and DOTFILES_REPO is set
    log "Dotfiles volume empty, cloning from $DOTFILES_REPO..."
    dotfiles_url="https://${GH_USERNAME}:${GH_TOKEN}@github.com/${DOTFILES_REPO}.git"
    git clone --depth 1 "$dotfiles_url" "$DOTFILES_DIR"
    cd "$DOTFILES_DIR" && stow . --adopt
    log "Dotfiles cloned and stowed"
fi

# Clone workspace if WORKSPACE_REPO is set and /workspace is empty
if [ -n "${WORKSPACE_REPO:-}" ]; then
    if [ ! -d "/workspace/.git" ]; then
        log "Cloning $WORKSPACE_REPO (branch: ${WORKSPACE_BRANCH:-main})"

        # Check if repo exists, create if not
        if ! gh repo view "$WORKSPACE_REPO" &>/dev/null; then
            log "Repository $WORKSPACE_REPO does not exist, creating..."
            gh repo create "$WORKSPACE_REPO" --private --clone=false
            log "Repository created"
            REPO_JUST_CREATED=true
        else
            REPO_JUST_CREATED=false
        fi

        # Build clone URL with auth
        clone_url="https://${GH_USERNAME}:${GH_TOKEN}@github.com/${WORKSPACE_REPO}.git"

        # Clone repository
        if [ "$REPO_JUST_CREATED" = true ]; then
            # For newly created repos, clone without branch spec (repo is empty)
            git clone "$clone_url" /workspace
            cd /workspace

            # Create the requested branch if it's not the default
            if [ "${WORKSPACE_BRANCH:-main}" != "main" ]; then
                git checkout -b "${WORKSPACE_BRANCH}"
            fi
        else
            # For existing repos, try fast shallow clone with branch
            if git clone \
                --depth 1 \
                --single-branch \
                --branch "${WORKSPACE_BRANCH:-main}" \
                "$clone_url" \
                /workspace 2>/dev/null; then
                : # Clone succeeded
            else
                # Branch doesn't exist, clone default branch and create new branch
                log "Branch ${WORKSPACE_BRANCH:-main} not found, creating it..."
                git clone --depth 1 "$clone_url" /workspace
                cd /workspace
                git checkout -b "${WORKSPACE_BRANCH:-main}"
            fi
        fi

        cd /workspace

        # Configure git for this repo
        git config user.email "${GIT_EMAIL:-agent@coordinator.local}"
        git config user.name "${GIT_NAME:-Agent}"

        # Set remote URL for push (without exposing token in git config)
        git remote set-url origin "$clone_url"

        log "Repository cloned successfully"
    else
        log "Workspace already exists, checking branch..."
        cd /workspace
        
        CURRENT_BRANCH=$(git branch --show-current)
        TARGET_BRANCH="${WORKSPACE_BRANCH:-main}"
        
        if [ "$CURRENT_BRANCH" = "$TARGET_BRANCH" ]; then
            log "Already on branch $TARGET_BRANCH"
            # Try to fetch and update if branch exists on remote
            if git fetch origin "$TARGET_BRANCH" --depth 1 2>/dev/null; then
                git reset --hard "origin/$TARGET_BRANCH"
                log "Updated to latest from origin/$TARGET_BRANCH"
            else
                log "Branch $TARGET_BRANCH not on remote yet (local only)"
            fi
        else
            log "Need to switch from $CURRENT_BRANCH to $TARGET_BRANCH"
            # Check if target branch exists locally
            if git show-ref --verify --quiet "refs/heads/$TARGET_BRANCH"; then
                git checkout "$TARGET_BRANCH"
                log "Switched to existing local branch $TARGET_BRANCH"
            elif git ls-remote --exit-code --heads origin "$TARGET_BRANCH" >/dev/null 2>&1; then
                # Branch exists on remote, fetch and checkout
                git fetch origin "$TARGET_BRANCH" --depth 1
                git checkout -b "$TARGET_BRANCH" "origin/$TARGET_BRANCH"
                log "Checked out remote branch $TARGET_BRANCH"
            else
                # Branch doesn't exist anywhere, create it from current HEAD
                git checkout -b "$TARGET_BRANCH"
                log "Created new branch $TARGET_BRANCH"
            fi
        fi
    fi

    # Install dependencies (blocking for dev server)
    if [ -f "package.json" ]; then
        log "Installing dependencies..."
        bun install --frozen-lockfile 2>/dev/null || bun install
    fi

    # Start dev server
    dev_dir="${DEV_WORKDIR:-.}"
    if [ -f "$dev_dir/package.json" ]; then
        cd "$dev_dir"
        log "Starting dev server (bun dev) in $dev_dir on port 3000..."
        PORT=3000 bun dev &
    else
        # Try to find package.json with a "dev" script
        for pkg_json in $(find . -name "package.json" | sort); do
            if grep -q '"dev"' "$pkg_json" 2>/dev/null; then
                pkg_dir=$(dirname "$pkg_json")
                cd "$pkg_dir"
                log "Installing dependencies in $pkg_dir..."
                bun install --frozen-lockfile 2>/dev/null || bun install
                log "Starting dev server (bun dev) in $pkg_dir on port 3000..."
                PORT=3000 bun dev &
                break
            fi
        done
        if [ -z "$(jobs -p)" ]; then
            log "No package.json with 'dev' script found, skipping dev server"
        fi
    fi
else
    log "No WORKSPACE_REPO set, skipping clone"
fi

cd /workspace 2>/dev/null || cd /root

# Start tmux server owned by init (PID 1) so sessions persist across SSH disconnects
# Without this, tmux sessions started from SSH are killed when the SSH session ends
# Using a dedicated socket ensures the server is independent of any user session
log "Starting persistent tmux server..."
tmux -L default new-session -d -s init 2>/dev/null || true

# ======================
# Start container-api Server
# ======================
# The container-api server provides HTTP access for remote command execution
# It wraps the native Claude CLI and runs on port 4096 internally,
# proxied via Tailscale serve on port 80
log "Starting container-api server on port 4096..."
cd /opt/container-api
PORT=4096 bun run src/index.ts &
API_PID=$!

# Wait for API server to be ready (max 30 seconds)
API_READY=false
for i in {1..60}; do
    if curl -s http://localhost:4096/health >/dev/null 2>&1; then
        API_READY=true
        break
    fi
    sleep 0.5
done

if [ "$API_READY" = true ]; then
    log "container-api server ready (PID: $API_PID)"

    # Configure Tailscale serve to proxy API on port 80 (HTTP, no SSL)
    # This allows the coordinator to reach the API via http://<hostname>:80/
    if [ -n "${TS_AUTHKEY:-}" ]; then
        log "Configuring Tailscale serve for container-api on port 80..."
        tailscale serve --bg --http 80 http://localhost:4096 2>/dev/null || true
    fi

    # Authentication will be configured by the coordinator via the API
    # POST /auth/anthropic/oauth with the OAuth token string
    log "container-api available - authentication will be configured by coordinator"
else
    log "WARNING: container-api server failed to start within 30 seconds"
    if ! kill -0 $API_PID 2>/dev/null; then
        log "container-api process died unexpectedly"
    fi
fi

# Return to workspace for default shell
cd /workspace 2>/dev/null || cd /root

log "Container ready"
exec "$@"
