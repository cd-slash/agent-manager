# ======================
# Base image (slim for fast builds)
# ======================
FROM debian:bookworm-slim

# ======================
# Build args / environment
# ======================
ARG TZ=UTC
ARG GH_USERNAME
ARG GH_TOKEN

ENV TZ=$TZ
ENV GH_USERNAME=$GH_USERNAME
ENV GH_TOKEN=$GH_TOKEN
ENV SHELL=/bin/bash
ENV HOME=/root
ENV EDITOR=nano
ENV VISUAL=nano
ENV LANG=en_US.UTF-8
ENV LC_ALL=en_US.UTF-8
ENV PATH="/root/.bun/install/global/node_modules/.bin:/root/.bun/bin:/root/.local/bin:$PATH"

# ======================
# Validate required args early
# ======================
RUN if [ -z "$GH_USERNAME" ] || [ -z "$GH_TOKEN" ]; then \
    echo "ERROR: GH_USERNAME and GH_TOKEN are required" >&2 && exit 1; \
    fi

# ======================
# Install base packages (minimal set for fast build)
# ======================
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gawk \
    git \
    gnupg \
    iptables \
    jq \
    locales \
    lsof \
    make \
    nano \
    ncurses-term \
    openssh-server \
    procps \
    unzip \
    tini \
    tmux \
    stow \
    inotify-tools \
    && rm -rf /var/lib/apt/lists/*

# ======================
# Install Tailscale
# ======================
RUN curl -fsSL https://pkgs.tailscale.com/stable/debian/bookworm.noarmor.gpg \
    | tee /usr/share/keyrings/tailscale-archive-keyring.gpg >/dev/null && \
    curl -fsSL https://pkgs.tailscale.com/stable/debian/bookworm.tailscale-keyring.list \
    | tee /etc/apt/sources.list.d/tailscale.list && \
    apt-get update && apt-get install -y tailscale && \
    rm -rf /var/lib/apt/lists/*

# ======================
# Configure locale (generate common locales to avoid SSH client warnings)
# ======================
RUN sed -i 's/^# *\(en_US.UTF-8 UTF-8\)/\1/' /etc/locale.gen && \
    sed -i 's/^# *\(en_GB.UTF-8 UTF-8\)/\1/' /etc/locale.gen && \
    locale-gen

# ======================
# Configure SSH (Tailscale SSH handles authentication)
# ======================
RUN mkdir -p /var/run/sshd /root/.ssh && \
    # Ensure root's login shell is bash (SSH uses /etc/passwd, not $SHELL)
    chsh -s /bin/bash root && \
    # Disable pam_systemd session tracking - it kills user processes on SSH logout
    # This allows tmux sessions to persist when SSH disconnects
    sed -i 's/^\(session.*pam_systemd.so\)/#\1/' /etc/pam.d/sshd 2>/dev/null || true && \
    # Also disable loginctl session tracking if logind is present
    mkdir -p /etc/systemd/logind.conf.d && \
    echo '[Login]\nKillUserProcesses=no' > /etc/systemd/logind.conf.d/nokill.conf 2>/dev/null || true

# Set PATH for SSH sessions via PAM environment
RUN echo 'PATH=/root/.bun/install/global/node_modules/.bin:/root/.bun/bin:/root/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin' >> /etc/environment && \
    # Also set SSH-specific environment for root user
    echo 'BASH_ENV=/root/.bashrc' >> /root/.ssh/environment

# ======================
# Install GitHub CLI
# ======================
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    > /etc/apt/sources.list.d/github-cli.list && \
    apt-get update && apt-get install -y gh && \
    rm -rf /var/lib/apt/lists/*

# ======================
# Install Node.js v24
# ======================
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# ======================
# Install Bun
# ======================
RUN curl -fsSL https://bun.sh/install | bash && \
    ln -s /root/.bun/bin/bun /usr/local/bin/bun

# ======================
# Install starship and ble.sh
# ======================
RUN set -eux; \
    echo "Installing starship..."; \
    curl -sS https://starship.rs/install.sh | sh -s -- --yes; \
    echo "Creating .bashrc and .config..."; \
    mkdir -p /root/.config; \
    touch /root/.bashrc; \
    chmod 644 /root/.bashrc; \
    printf '%s\n' \
    '# Set COLORTERM for proper color support' \
    'if [ -z "${COLORTERM:-}" ]; then' \
    '  export COLORTERM=truecolor' \
    'fi' \
    '' \
    '# Initialize starship prompt for interactive shells' \
    'if [[ $- == *i* ]] && command -v starship >/dev/null 2>&1; then' \
    '  export USER=$(id -un)' \
    '  eval "$(starship init bash)"' \
    'fi' \
    '' >> /root/.bashrc

RUN set -eux; \
    if [ "$(id -u)" -ne 0 ]; then \
    echo "ble.sh installation requires root" >&2; \
    exit 1; \
    fi; \
    echo "Installing ble.sh..."; \
    git clone --recursive --depth 1 --shallow-submodules https://github.com/akinomyoga/ble.sh.git; \
    make -C ble.sh install INSDIR=/root/.blesh; \
    chmod 755 /root/.blesh/ble.sh; \
    chown -R root:root /root/.blesh; \
    rm -rf ble.sh; \
    # ble.sh must be sourced at end of .bashrc for proper initialization
    printf '%s\n' \
    '[[ $- == *i* ]] && [ -f /root/.blesh/ble.sh ] && source /root/.blesh/ble.sh' \
    '' >> /root/.bashrc; \
    # Create .bash_profile that sources .bashrc for login shells (SSH sessions)
    printf '%s\n' \
    '# Source .bashrc for interactive login shells' \
    'if [ -f ~/.bashrc ]; then' \
    '  . ~/.bashrc' \
    'fi' \
    '' > /root/.bash_profile

RUN echo "source ~/.bashrc" >> /root/.profile

# ======================
# Install terminal definitions
# ======================
RUN set -eux; \
    curl -fsSL https://raw.githubusercontent.com/alacritty/alacritty/master/extra/alacritty.info -o /tmp/alacritty.info; \
    tic -xe alacritty,alacritty-direct /tmp/alacritty.info; \
    rm /tmp/alacritty.info

RUN echo 'export IS_SANDBOX=1' >> /root/.bashrc && \
    echo 'cd /workspace 2>/dev/null || true' >> /root/.bashrc

# ======================
# Configure tmux for proper colors and Unicode
# ======================
RUN printf '%s\n' \
    '# Enable true color support' \
    'set -g default-terminal "tmux-256color"' \
    'set -ga terminal-overrides ",*256col*:Tc"' \
    'set -ga terminal-overrides ",alacritty:Tc"' \
    'set -ga terminal-overrides ",xterm-256color:Tc"' \
    '' \
    '# Enable UTF-8' \
    'set -q -g status-utf8 on' \
    'setw -q -g utf8 on' \
    '' \
    '# Fix escape key delay for vim/neovim' \
    'set -sg escape-time 10' \
    '' \
    '# Enable mouse support' \
    'set -g mouse on' \
    '' \
    '# Increase scrollback buffer' \
    'set -g history-limit 50000' \
    > /root/.tmux.conf

# ======================
# Install Claude CLI (native binary)
# ======================
RUN npm install -g @anthropic-ai/claude-code && \
    # Verify installation
    claude --version || echo "Claude CLI installed"

# ======================
# Install container-api (local)
# ======================
# Copy the local container API that wraps the Claude CLI
COPY api/ /opt/container-api/
RUN cd /opt/container-api && \
    bun install --frozen-lockfile 2>/dev/null || bun install

# ======================
# Create workspace directory
# ======================
RUN mkdir -p /workspace
WORKDIR /workspace

# ======================
# Setup entrypoint with tini
# ======================
# Path is relative to build context (. directory containing server/ and api/)
COPY server/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["bash"]
