/**
 * Agent Gateway
 *
 * Processes server-side commands from Convex (container creation, SSH operations).
 * Containers connect directly to Convex - this gateway handles only operations
 * that require local server access (Docker, SSH).
 *
 * Key responsibilities:
 * - Subscribe to serverCommands for createContainer/stopContainer/deleteContainer
 * - Execute SSH/Docker commands on servers
 * - Handle OAuth flows via Convex subscriptions
 */

import type {
	AuthStatusPayload,
	ConnectPayload,
	CreateContainerRequest,
	CreateContainerResult,
	ExecCompletePayload,
	ExecStartPayload,
	ExecStreamPayload,
	HeartbeatPayload,
	StatusHealthPayload,
	WebSocketMessage,
} from "@agent-manager/agent-shared"
import { isConnectMessage, parseMessage } from "@agent-manager/agent-shared"
import type { ServerWebSocket } from "bun"
import { ClaudeAuth } from "./claude-auth"
import { ConnectionManager, type ContainerContext } from "./connections"
import { ConvexCommandProcessor } from "./convex-commands"
import { ConvexSync } from "./convex-sync"
import type { TaskPhase } from "./phase-prompts"
import { TaskOrchestrator } from "./task-orchestrator"

// 3-letter words for random name generation
const WORDS = [
	"ace",
	"act",
	"add",
	"age",
	"ago",
	"aid",
	"aim",
	"air",
	"all",
	"ant",
	"ape",
	"apt",
	"arc",
	"are",
	"ark",
	"arm",
	"art",
	"ash",
	"ask",
	"ate",
	"awe",
	"axe",
	"bad",
	"bag",
	"ban",
	"bar",
	"bat",
	"bay",
	"bed",
	"bee",
	"beg",
	"bet",
	"bid",
	"big",
	"bin",
	"bit",
	"bog",
	"bow",
	"box",
	"boy",
	"bud",
	"bug",
	"bun",
	"bus",
	"but",
	"buy",
	"cab",
	"can",
	"cap",
	"car",
	"cat",
	"cob",
	"cod",
	"cog",
	"cop",
	"cot",
	"cow",
	"cry",
	"cub",
	"cud",
	"cup",
	"cur",
	"cut",
	"dab",
	"dad",
	"dam",
	"day",
	"den",
	"dew",
	"did",
	"die",
	"dig",
	"dim",
	"dip",
	"doe",
	"dog",
	"dot",
	"dry",
	"dub",
	"dud",
	"due",
	"dug",
	"dye",
	"ear",
	"eat",
	"eel",
	"egg",
	"ego",
	"elf",
	"elk",
	"elm",
	"emu",
	"end",
	"era",
	"eve",
	"ewe",
	"eye",
	"fab",
	"fad",
	"fan",
	"far",
	"fat",
	"fax",
	"fed",
	"fee",
	"few",
	"fig",
	"fin",
	"fir",
	"fit",
	"fix",
	"fly",
	"foe",
	"fog",
	"for",
	"fox",
	"fry",
	"fun",
	"fur",
	"gag",
	"gap",
	"gas",
	"gel",
	"gem",
	"get",
	"gig",
	"gin",
	"god",
	"got",
	"gum",
	"gun",
	"gut",
	"guy",
	"gym",
	"had",
	"ham",
	"has",
	"hat",
	"hay",
	"hem",
	"hen",
	"her",
	"hid",
	"him",
	"hip",
	"his",
	"hit",
	"hob",
	"hog",
	"hop",
	"hot",
	"how",
	"hub",
	"hue",
	"hug",
	"hum",
	"hut",
	"ice",
	"icy",
	"ill",
	"imp",
	"ink",
	"inn",
	"ion",
	"ire",
	"irk",
	"ivy",
	"jab",
	"jag",
	"jam",
	"jar",
	"jaw",
	"jay",
	"jet",
	"jig",
	"job",
	"jog",
	"jot",
	"joy",
	"jug",
	"jut",
	"keg",
	"ken",
	"key",
	"kid",
	"kin",
	"kit",
	"lab",
	"lac",
	"lad",
	"lag",
	"lap",
	"law",
	"lax",
	"lay",
	"lea",
	"led",
	"leg",
	"let",
	"lid",
	"lie",
	"lip",
	"lit",
	"log",
	"lop",
	"lot",
	"low",
	"lug",
	"mad",
	"man",
	"map",
	"mar",
	"mat",
	"maw",
	"max",
	"may",
	"men",
	"met",
	"mid",
	"mix",
	"mob",
	"mod",
	"mom",
	"mop",
	"mow",
	"mud",
	"mug",
	"mum",
	"nab",
	"nag",
	"nap",
	"nay",
	"net",
	"new",
	"nip",
	"nit",
	"nob",
	"nod",
	"nor",
	"not",
	"now",
	"nub",
	"nun",
	"nut",
	"oak",
	"oar",
	"oat",
	"odd",
	"ode",
	"off",
	"oft",
	"oil",
	"old",
	"one",
	"opt",
	"orb",
	"ore",
	"our",
	"out",
	"ova",
	"owe",
	"owl",
	"own",
	"pad",
	"pal",
	"pan",
	"pap",
	"par",
	"pat",
	"paw",
	"pay",
	"pea",
	"peg",
	"pen",
	"pep",
	"per",
	"pet",
	"pew",
	"pie",
	"pig",
	"pin",
	"pit",
	"ply",
	"pod",
	"pop",
	"pot",
	"pow",
	"pox",
	"pro",
	"pry",
	"pub",
	"pug",
	"pun",
	"pup",
	"put",
	"quo",
	"rag",
	"ram",
	"ran",
	"rap",
	"rat",
	"raw",
	"ray",
	"red",
	"ref",
	"rib",
	"rid",
	"rig",
	"rim",
	"rip",
	"rob",
	"rod",
	"roe",
	"rot",
	"row",
	"rub",
	"rug",
	"run",
	"rut",
	"rye",
	"sac",
	"sad",
	"sag",
	"sap",
	"sat",
	"saw",
	"say",
	"sea",
	"set",
	"sew",
	"she",
	"shy",
	"sin",
	"sip",
	"sir",
	"sit",
	"six",
	"ski",
	"sky",
	"sly",
	"sob",
	"sod",
	"son",
	"sop",
	"sot",
	"sow",
	"soy",
	"spa",
	"spy",
	"sty",
	"sub",
	"sue",
	"sum",
	"sun",
	"sup",
	"tab",
	"tad",
	"tag",
	"tan",
	"tap",
	"tar",
	"tat",
	"tax",
	"tea",
	"ten",
	"the",
	"thy",
	"tic",
	"tie",
	"tin",
	"tip",
	"tit",
	"toe",
	"tog",
	"tom",
	"ton",
	"too",
	"top",
	"tot",
	"tow",
	"toy",
	"try",
	"tub",
	"tug",
	"two",
	"urn",
	"use",
	"van",
	"vat",
	"vet",
	"vex",
	"via",
	"vie",
	"vim",
	"vow",
	"wad",
	"wag",
	"war",
	"was",
	"wax",
	"way",
	"web",
	"wed",
	"wee",
	"wet",
	"who",
	"wig",
	"win",
	"wit",
	"woe",
	"wok",
	"won",
	"woo",
	"wow",
	"yak",
	"yam",
	"yap",
	"yaw",
	"yea",
	"yen",
	"yes",
	"yet",
	"yew",
	"yon",
	"you",
	"zap",
	"zed",
	"zen",
	"zip",
	"zit",
	"zoo",
]

/**
 * Generate a random 3-word name (e.g., "tar-bat-sag")
 */
function generateRandomName(): string {
	const pick = () => WORDS[Math.floor(Math.random() * WORDS.length)]
	return `${pick()}-${pick()}-${pick()}`
}

/**
 * Generate a unique WireGuard port from hostname hash (range: 42000-42999)
 */
function generateWgPort(hostname: string): number {
	const hash = new Bun.CryptoHasher("sha1").update(hostname).digest("hex")
	return 42000 + (parseInt(hash.slice(0, 4), 16) % 1000)
}

/**
 * Fetch secrets from Convex
 */
async function fetchSecrets(
	convexUrl: string,
	keys: string[],
): Promise<Record<string, string>> {
	const response = await fetch(`${convexUrl}/api/query`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			path: "secrets:getMultiple",
			args: { keys },
		}),
	})

	if (!response.ok) {
		throw new Error(`Failed to fetch secrets: ${response.statusText}`)
	}

	const result = await response.json()
	return result.value || {}
}

/**
 * Fetch Tailscale credentials from Convex (for generating auth keys)
 */
async function fetchTailscaleConfig(
	convexUrl: string,
): Promise<{ tailnetId?: string; apiKey?: string }> {
	const response = await fetch(`${convexUrl}/api/query`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			path: "settings:getTailscaleCredentials",
			args: {},
		}),
	})

	if (!response.ok) {
		throw new Error(`Failed to fetch Tailscale config: ${response.statusText}`)
	}

	const result = await response.json()
	return result.value || {}
}

/**
 * Generate an ephemeral Tailscale auth key via the API
 * This creates a single-use, ephemeral key for container authentication
 */
async function generateTailscaleAuthKey(
	tailnetId: string,
	apiKey: string,
	tags: string[] = ["tag:code-agent"],
): Promise<string> {
	console.log(`[gateway] Generating ephemeral Tailscale auth key for tailnet: ${tailnetId}`)

	const response = await fetch(
		`https://api.tailscale.com/api/v2/tailnet/${tailnetId}/keys`,
		{
			method: "POST",
			headers: {
				"Authorization": `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				capabilities: {
					devices: {
						create: {
							reusable: false,
							ephemeral: true, // Node will be removed when it goes offline
							preauthorized: true, // No manual approval needed
							tags: tags,
						},
					},
				},
				expirySeconds: 3600, // Key valid for 1 hour (container should use it immediately)
			}),
		},
	)

	if (!response.ok) {
		const errorText = await response.text()
		throw new Error(`Tailscale API error: ${response.status} - ${errorText}`)
	}

	const data = await response.json() as { key: string }
	console.log(`[gateway] Generated ephemeral auth key successfully`)
	return data.key
}

// Paths for binary building
const BINARY_PATH = new URL("../container-daemon-binary", import.meta.url).pathname
const CONTAINER_DAEMON_SRC = new URL("../../container-daemon/src", import.meta.url)
	.pathname
const CONTAINER_DAEMON_PKG = new URL("../../container-daemon", import.meta.url)
	.pathname

/**
 * Get the latest modification time of all source files in a directory
 */
async function getLatestSourceMtime(dir: string): Promise<number> {
	const glob = new Bun.Glob("**/*.ts")
	let latestMtime = 0

	for await (const file of glob.scan({ cwd: dir, absolute: true })) {
		try {
			const stat = await Bun.file(file).stat()
			if (stat && stat.mtime.getTime() > latestMtime) {
				latestMtime = stat.mtime.getTime()
			}
		} catch {
			// Skip files we can't stat
		}
	}

	// Also check package.json for dependency changes
	try {
		const pkgStat = await Bun.file(`${CONTAINER_DAEMON_PKG}/package.json`).stat()
		if (pkgStat && pkgStat.mtime.getTime() > latestMtime) {
			latestMtime = pkgStat.mtime.getTime()
		}
	} catch {
		// Skip if package.json doesn't exist
	}

	return latestMtime
}

/**
 * Check if the container-daemon binary needs to be rebuilt
 */
async function shouldRebuildBinary(): Promise<boolean> {
	const binaryFile = Bun.file(BINARY_PATH)

	// If binary doesn't exist, we need to build it
	if (!(await binaryFile.exists())) {
		return true
	}

	// Get binary modification time
	const binaryStat = await binaryFile.stat()
	if (!binaryStat) {
		return true
	}
	const binaryMtime = binaryStat.mtime.getTime()

	// Get latest source file modification time
	const sourceMtime = await getLatestSourceMtime(CONTAINER_DAEMON_SRC)

	// Rebuild if any source file is newer than the binary
	return sourceMtime > binaryMtime
}

/**
 * Build the container-daemon binary
 */
async function buildContainerApiBinary(): Promise<void> {
	console.log("[gateway] Building container-daemon binary...")

	const entryPoint = `${CONTAINER_DAEMON_PKG}/src/index.ts`
	const proc = Bun.spawn(
		["bun", "build", "--compile", "--outfile", BINARY_PATH, entryPoint],
		{
			cwd: CONTAINER_DAEMON_PKG,
			stdout: "pipe",
			stderr: "pipe",
		},
	)

	const stderr = await new Response(proc.stderr).text()
	const exitCode = await proc.exited

	if (exitCode !== 0) {
		throw new Error(`Failed to build container-daemon binary: ${stderr}`)
	}

	console.log("[gateway] Container-api binary built successfully")
}

/**
 * Ensure the container-daemon binary is up to date
 */
async function _ensureBinaryUpToDate(): Promise<void> {
	if (await shouldRebuildBinary()) {
		await buildContainerApiBinary()
	}
}

/**
 * Create a container on a remote server using inline SSH
 *
 * @param request - Container creation request (repo is optional)
 * @param secrets - Secrets from Convex (GH_USERNAME, GH_TOKEN required for repo cloning)
 * @param buildTracker - Optional build tracker for progress updates
 * @param tailscaleConfig - Tailscale config for generating auth keys
 */
async function createContainerOnServer(
	request: CreateContainerRequest,
	secrets: Record<string, string>,
	buildTracker?: ConvexSync,
	tailscaleConfig?: { tailnetId?: string; apiKey?: string },
): Promise<CreateContainerResult> {
	const {
		repo,
		branch = "main",
		name,
		server = "localhost",
		sshUser = "ubuntu",
	} = request
	const containerName = name || generateRandomName()
	const wgPort = generateWgPort(containerName)

	// Generate ephemeral Tailscale auth key via API
	if (!tailscaleConfig?.tailnetId || !tailscaleConfig?.apiKey) {
		throw new Error("Tailscale not configured - set tailnetId and API key in Settings > Tailscale")
	}

	let tsAuthKey: string
	try {
		tsAuthKey = await generateTailscaleAuthKey(
			tailscaleConfig.tailnetId,
			tailscaleConfig.apiKey,
			["tag:code-agent"], // Tag for containers
		)
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error)
		throw new Error(`Failed to generate Tailscale auth key: ${msg}`)
	}
	// Build SSH target (user@host for remote, just localhost for local)
	const sshTarget =
		server === "localhost" ? "localhost" : `${sshUser}@${server}`

	// Initialize build tracking
	if (buildTracker) {
		await buildTracker.createBuild(containerName, request)
	}

	// Phase 1: Building binary (if needed)
	if (buildTracker)
		await buildTracker.startPhase(containerName, "building_binary")
	try {
		const needsRebuild = await shouldRebuildBinary()
		if (needsRebuild) {
			await buildContainerApiBinary()
			if (buildTracker)
				await buildTracker.completePhase(
					containerName,
					"building_binary",
					"Binary rebuilt successfully",
				)
		} else {
			if (buildTracker)
				await buildTracker.completePhase(
					containerName,
					"building_binary",
					"Binary already up to date",
				)
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		if (buildTracker)
			await buildTracker.failBuild(containerName, "building_binary", message)
		throw error
	}

	// Inline Dockerfile (self-contained, no monorepo needed)
	const dockerfile = `FROM debian:bookworm-slim
ARG TZ=UTC
ARG GH_USERNAME
ARG GH_TOKEN
ENV TZ=$TZ GH_USERNAME=$GH_USERNAME GH_TOKEN=$GH_TOKEN
ENV SHELL=/bin/bash HOME=/root
ENV PATH="/root/.bun/bin:/root/.local/bin:$PATH"

# Base packages
RUN apt-get update && apt-get install -y --no-install-recommends \\
    ca-certificates curl git gnupg iptables openssh-server procps tini tmux unzip \\
    && rm -rf /var/lib/apt/lists/*

# Tailscale
RUN curl -fsSL https://pkgs.tailscale.com/stable/debian/bookworm.noarmor.gpg \\
    | tee /usr/share/keyrings/tailscale-archive-keyring.gpg >/dev/null && \\
    curl -fsSL https://pkgs.tailscale.com/stable/debian/bookworm.tailscale-keyring.list \\
    | tee /etc/apt/sources.list.d/tailscale.list && \\
    apt-get update && apt-get install -y tailscale && rm -rf /var/lib/apt/lists/*

# SSH config
RUN mkdir -p /var/run/sshd /root/.ssh && chsh -s /bin/bash root

# Bun
RUN curl -fsSL https://bun.sh/install | bash && ln -s /root/.bun/bin/bun /usr/local/bin/bun

# Claude CLI
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && \\
    apt-get install -y nodejs && rm -rf /var/lib/apt/lists/* && \\
    npm install -g @anthropic-ai/claude-code

# Prepare container-daemon directory (binary SCP'd after container start)
RUN mkdir -p /opt/container-daemon

RUN mkdir -p /workspace
WORKDIR /workspace`

	// Inline entrypoint script
	const entrypoint = `#!/bin/bash
set -euo pipefail

# Determine auth key - file takes precedence (used for restart with fresh key)
AUTH_KEY="\${TS_AUTHKEY:-}"
FRESH_KEY=false
if [ -f /var/run/tailscale-authkey ]; then
  AUTH_KEY=\$(cat /var/run/tailscale-authkey)
  rm -f /var/run/tailscale-authkey  # Single use, remove after reading
  FRESH_KEY=true
fi

# Start Tailscale (using statedir for persistent state to support TLS certificates)
if [ -n "\$AUTH_KEY" ]; then
  # If using a fresh key (restart), clear old Tailscale state to allow re-registration
  if [ "\$FRESH_KEY" = "true" ]; then
    echo "Fresh auth key detected, clearing old Tailscale state..."
    rm -rf /var/lib/tailscale/*
  fi

  TAILSCALED_ARGS="--statedir=/var/lib/tailscale"
  [ -n "\${TS_WG_PORT:-}" ] && TAILSCALED_ARGS="\$TAILSCALED_ARGS --port=\${TS_WG_PORT}"
  tailscaled \$TAILSCALED_ARGS &
  sleep 2
  tailscale up --authkey="\$AUTH_KEY" --hostname="\${TS_HOSTNAME}" --accept-dns=true --ssh
fi

# Start SSH
/usr/sbin/sshd

# Clone workspace
if [ -n "\${WORKSPACE_REPO:-}" ] && [ ! -d "/workspace/.git" ]; then
  git clone --depth 1 --branch "\${WORKSPACE_BRANCH:-main}" \\
    "https://\${GH_USERNAME}:\${GH_TOKEN}@github.com/\${WORKSPACE_REPO}.git" /workspace || \\
  git clone --depth 1 "https://\${GH_USERNAME}:\${GH_TOKEN}@github.com/\${WORKSPACE_REPO}.git" /workspace
  cd /workspace && [ -f package.json ] && bun install
fi

# Start workspace application on port 3000 (prefer dev for hot reloading)
WORKSPACE_STARTED=false
if [ -f /workspace/package.json ]; then
  cd /workspace
  if [ -n "\${WORKSPACE_START_CMD:-}" ]; then
    echo "Starting workspace with custom command: \${WORKSPACE_START_CMD}"
    PORT=3000 eval "\${WORKSPACE_START_CMD}" &
    WORKSPACE_STARTED=true
  elif grep -q '"dev"' package.json 2>/dev/null; then
    echo "Starting workspace with 'bun run dev'..."
    PORT=3000 bun run dev &
    WORKSPACE_STARTED=true
  elif grep -q '"start"' package.json 2>/dev/null; then
    echo "Starting workspace with 'bun run start'..."
    PORT=3000 bun run start &
    WORKSPACE_STARTED=true
  fi

  if [ "\$WORKSPACE_STARTED" = "true" ]; then
    # Wait for dev server to start (check if port 3000 is listening)
    echo "Waiting for dev server to start on port 3000..."
    for i in 1 2 3 4 5 6 7 8 9 10; do
      if ss -tln | grep -q ':3000 '; then
        echo "Dev server is listening on port 3000"
        break
      fi
      sleep 1
    done
  fi
fi

# Start container-daemon if binary exists (survives container restarts)
if [ -x /opt/container-daemon/container-daemon ]; then
  echo "Starting container-daemon..."
  PORT=4096 /opt/container-daemon/container-daemon &
  sleep 2
fi

# Expose workspace via Tailscale serve (if workspace is running on port 3000)
if [ "\$WORKSPACE_STARTED" = "true" ] && ss -tln | grep -q ':3000 '; then
  echo "Setting up Tailscale serve to proxy port 3000..."
  tailscale serve --bg --https=443 http://localhost:3000 2>/dev/null || true
  echo "Tailscale serve configured - workspace accessible via https://\${TS_HOSTNAME}.tail-scale.ts.net"
fi

# Keep container alive - wait for any background process or sleep forever
# This prevents restart loops with single-use Tailscale auth keys
if [ \$# -gt 0 ]; then
  exec "\$@"
else
  exec sleep infinity
fi`

	// Build environment variables (conditionally include repo/branch if specified)
	const envVars = [
		`TS_AUTHKEY=${tsAuthKey}`,
		`TS_HOSTNAME=${containerName}`,
		`TS_WG_PORT=${wgPort}`,
	]

	// Only include workspace repo if specified
	if (repo) {
		envVars.push(`WORKSPACE_REPO=${repo}`)
		envVars.push(`WORKSPACE_BRANCH=${branch}`)
	}

	// Include GitHub creds if available (for repo cloning)
	if (secrets.GH_USERNAME) {
		envVars.push(`GH_USERNAME=${secrets.GH_USERNAME}`)
	}
	if (secrets.GH_TOKEN) {
		envVars.push(`GH_TOKEN=${secrets.GH_TOKEN}`)
	}

	const composeYml = `services:
  server:
    build:
      context: /tmp/agent-build
      args:
        GH_USERNAME: ${secrets.GH_USERNAME || ""}
        GH_TOKEN: ${secrets.GH_TOKEN || ""}
    hostname: ${containerName}
    container_name: ${containerName}
    environment:
${envVars.map(v => `      - ${v}`).join("\n")}
    devices:
      - /dev/net/tun:/dev/net/tun
    cap_add:
      - net_admin
    ports:
      - "${wgPort}:${wgPort}/udp"
    restart: unless-stopped
    mem_limit: 4096m
    labels:
      - "agent-manager.tailscale-hostname=${containerName}"`

	// Step 1: Build and start container (without binary)
	const buildScript = `set -e
BUILD_DIR="/tmp/agent-build"
rm -rf "$BUILD_DIR" && mkdir -p "$BUILD_DIR"

cat > "$BUILD_DIR/Dockerfile" << 'DOCKERFILE'
${dockerfile}
DOCKERFILE

cat > "$BUILD_DIR/entrypoint.sh" << 'ENTRYPOINT'
${entrypoint}
ENTRYPOINT
chmod +x "$BUILD_DIR/entrypoint.sh"

echo 'COPY entrypoint.sh /entrypoint.sh' >> "$BUILD_DIR/Dockerfile"
echo 'ENTRYPOINT ["/usr/bin/tini", "--", "/entrypoint.sh"]' >> "$BUILD_DIR/Dockerfile"

cat > /tmp/compose-${containerName}.yml << 'COMPOSE'
${composeYml}
COMPOSE

docker compose -f /tmp/compose-${containerName}.yml --project-name ${containerName} up --build -d
rm -rf "$BUILD_DIR" /tmp/compose-${containerName}.yml`

	console.log(`[gateway] Creating container ${containerName} on ${server}...`)

	// Phase 2: Building image
	if (buildTracker)
		await buildTracker.startPhase(containerName, "building_image")
	let buildLogs = ""
	try {
		// Execute build script on server
		const buildProc =
			server === "localhost"
				? Bun.spawn(["bash", "-c", buildScript], {
						stdout: "pipe",
						stderr: "pipe",
					})
				: Bun.spawn(["ssh", sshTarget, "bash", "-s"], {
						stdin: new Blob([buildScript]),
						stdout: "pipe",
						stderr: "pipe",
					})

		const buildStdout = await new Response(buildProc.stdout).text()
		const buildStderr = await new Response(buildProc.stderr).text()
		buildLogs = buildStdout + buildStderr
		const buildExit = await buildProc.exited

		if (buildExit !== 0) {
			throw new Error(`Container build failed: ${buildStderr}`)
		}
		if (buildTracker)
			await buildTracker.completePhase(
				containerName,
				"building_image",
				buildLogs,
			)
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		if (buildTracker)
			await buildTracker.failBuild(
				containerName,
				"building_image",
				message,
				buildLogs,
			)
		throw error
	}

	console.log(
		`[gateway] Container ${containerName} started, waiting for Tailscale...`,
	)

	// Phase 3: Starting container (waiting for Tailscale)
	if (buildTracker)
		await buildTracker.startPhase(containerName, "starting_container")
	try {
		// Wait for container to be running
		await new Promise((resolve) => setTimeout(resolve, 5000))
		if (buildTracker)
			await buildTracker.completePhase(
				containerName,
				"starting_container",
				"Container started, Tailscale connecting...",
			)
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		if (buildTracker)
			await buildTracker.failBuild(containerName, "starting_container", message)
		throw error
	}

	// Phase 4: Deploying binary
	if (buildTracker)
		await buildTracker.startPhase(containerName, "deploying_binary")
	console.log(`[gateway] Copying container-daemon binary...`)

	// Check if binary exists
	let deployLogs = ""
	const binaryFile = Bun.file(BINARY_PATH)
	if (!(await binaryFile.exists())) {
		console.warn(`[gateway] Binary not found at ${BINARY_PATH}, skipping SCP`)
		if (buildTracker)
			await buildTracker.skipPhase(containerName, "deploying_binary")
		if (buildTracker)
			await buildTracker.skipPhase(containerName, "starting_daemon")
	} else {
		try {
			if (server === "localhost") {
				// Direct docker cp for localhost
				const copyProc = Bun.spawn(
					[
						"bash",
						"-c",
						`docker cp "${BINARY_PATH}" ${containerName}:/opt/container-daemon/container-daemon && \
           docker exec ${containerName} chmod +x /opt/container-daemon/container-daemon`,
					],
					{ stdout: "pipe", stderr: "pipe" },
				)
				const copyStdout = await new Response(copyProc.stdout).text()
				const copyStderr = await new Response(copyProc.stderr).text()
				deployLogs = copyStdout + copyStderr
				const copyExit = await copyProc.exited
				if (copyExit !== 0) {
					throw new Error(`Failed to copy binary: ${copyStderr}`)
				}
			} else {
				// SCP to server, then docker cp
				const scpProc = Bun.spawn(
					["scp", BINARY_PATH, `${sshTarget}:/tmp/container-daemon-binary`],
					{
						stdout: "pipe",
						stderr: "pipe",
					},
				)
				const scpStderr = await new Response(scpProc.stderr).text()
				const scpExit = await scpProc.exited
				if (scpExit !== 0) {
					throw new Error(`SCP failed: ${scpStderr}`)
				}

				const copyScript = `set -e
docker cp /tmp/container-daemon-binary ${containerName}:/opt/container-daemon/container-daemon
docker exec ${containerName} chmod +x /opt/container-daemon/container-daemon
rm /tmp/container-daemon-binary`

				const copyProc = Bun.spawn(["ssh", sshTarget, "bash", "-s"], {
					stdin: new Blob([copyScript]),
					stdout: "pipe",
					stderr: "pipe",
				})
				const copyStdout = await new Response(copyProc.stdout).text()
				const copyStderr = await new Response(copyProc.stderr).text()
				deployLogs = copyStdout + copyStderr
				const copyExit = await copyProc.exited
				if (copyExit !== 0) {
					throw new Error(`Failed to copy binary: ${copyStderr}`)
				}
			}
			if (buildTracker)
				await buildTracker.completePhase(
					containerName,
					"deploying_binary",
					deployLogs || "Binary deployed successfully",
				)
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			if (buildTracker)
				await buildTracker.failBuild(
					containerName,
					"deploying_binary",
					message,
					deployLogs,
				)
			throw error
		}

		// Phase 5: Starting API
		if (buildTracker)
			await buildTracker.startPhase(containerName, "starting_daemon")
		console.log(`[gateway] Starting container-daemon...`)

		// Get the Convex URL for the container to connect to
		const convexUrl = process.env.CONVEX_URL
		if (!convexUrl) {
			console.warn("[gateway] CONVEX_URL not set - container will run in REST-only mode")
		}

		let startLogs = ""
		try {
			// Pass CONVEX_URL so container can connect directly to Convex
			const envVars = convexUrl
				? `PORT=4096 CONVEX_URL=${convexUrl} CONTAINER_ID=${containerName}`
				: `PORT=4096 CONTAINER_ID=${containerName}`

			const startCommand = `docker exec -d ${containerName} bash -c '${envVars} /opt/container-daemon/container-daemon &'
sleep 2
docker exec ${containerName} tailscale serve --bg --https=443 http://localhost:3000 2>/dev/null || true`

			const startProc =
				server === "localhost"
					? Bun.spawn(["bash", "-c", startCommand], {
							stdout: "pipe",
							stderr: "pipe",
						})
					: Bun.spawn(["ssh", sshTarget, "bash", "-s"], {
							stdin: new Blob([startCommand]),
							stdout: "pipe",
							stderr: "pipe",
						})

			const startStdout = await new Response(startProc.stdout).text()
			const startStderr = await new Response(startProc.stderr).text()
			startLogs = startStdout + startStderr
			await startProc.exited

			if (buildTracker)
				await buildTracker.completePhase(
					containerName,
					"starting_daemon",
					startLogs || "API started successfully",
				)
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			if (buildTracker)
				await buildTracker.failBuild(
					containerName,
					"starting_daemon",
					message,
					startLogs,
				)
			throw error
		}
	}

	// Phase 6: Ready
	if (buildTracker) await buildTracker.startPhase(containerName, "ready")
	if (buildTracker)
		await buildTracker.completePhase(
			containerName,
			"ready",
			"Container is fully operational",
		)
	console.log(`[gateway] Container ${containerName} ready!`)

	return {
		name: containerName,
		containerId: containerName,
		hostname: containerName,
		repo: repo || "",
		branch,
		server,
		network: "bridge",
		wgPort,
	}
}

/**
 * Stop a container on a server via SSH/Docker
 * Returns { stopped: true, notFound: false } on success
 * Returns { stopped: false, notFound: true } if container doesn't exist
 */
async function stopContainerOnServer(
	containerName: string,
	server: string,
	sshUser?: string,
): Promise<{ stopped: boolean; notFound: boolean }> {
	console.log(`[gateway] Stopping container ${containerName} on ${server}...`)

	const sshTarget =
		server === "localhost" ? "localhost" : `${sshUser || "ubuntu"}@${server}`

	// Find container by label first, fallback to direct name
	// Check if container exists before stopping
	const stopScript = `
CONTAINER_ID=$(docker ps -aq --filter "label=agent-manager.tailscale-hostname=${containerName}" | head -1)
if [ -z "$CONTAINER_ID" ]; then
  CONTAINER_ID="${containerName}"
fi

# Check if container exists
if ! docker inspect "$CONTAINER_ID" >/dev/null 2>&1; then
  echo "NOT_FOUND"
  exit 0
fi

docker stop "$CONTAINER_ID"
`

	const stopProc =
		server === "localhost"
			? Bun.spawn(["bash", "-c", stopScript], {
					stdout: "pipe",
					stderr: "pipe",
				})
			: Bun.spawn(["ssh", sshTarget, "bash", "-s"], {
					stdin: new Blob([stopScript]),
					stdout: "pipe",
					stderr: "pipe",
				})

	const stdout = (await new Response(stopProc.stdout).text()).trim()
	const stderr = await new Response(stopProc.stderr).text()
	const exitCode = await stopProc.exited

	if (stdout === "NOT_FOUND") {
		console.log(
			`[gateway] Container ${containerName} not found on host - marking as orphaned`,
		)
		return { stopped: false, notFound: true }
	}

	if (exitCode !== 0) {
		throw new Error(`Failed to stop container: ${stderr}`)
	}

	console.log(`[gateway] Container ${containerName} stopped successfully`)
	return { stopped: true, notFound: false }
}

/**
 * Delete a container on a server via SSH/Docker
 * Container must be stopped first
 */
async function deleteContainerOnServer(
	containerName: string,
	server: string,
	sshUser?: string,
): Promise<void> {
	console.log(`[gateway] Deleting container ${containerName} on ${server}...`)

	const sshTarget =
		server === "localhost" ? "localhost" : `${sshUser || "ubuntu"}@${server}`

	// Find container by label first, check if running, then delete
	const deleteScript = `
CONTAINER_ID=$(docker ps -aq --filter "label=agent-manager.tailscale-hostname=${containerName}" | head -1)
if [ -z "$CONTAINER_ID" ]; then
  CONTAINER_ID="${containerName}"
fi

# Check if container exists
if ! docker inspect "$CONTAINER_ID" >/dev/null 2>&1; then
  echo "NOT_FOUND"
  exit 0
fi

# Check if container is running
RUNNING=$(docker inspect --format='{{.State.Running}}' "$CONTAINER_ID" 2>/dev/null || echo "false")
if [ "$RUNNING" = "true" ]; then
  echo "STILL_RUNNING"
  exit 1
fi

# Delete the container
docker rm "$CONTAINER_ID"
`

	const deleteProc =
		server === "localhost"
			? Bun.spawn(["bash", "-c", deleteScript], {
					stdout: "pipe",
					stderr: "pipe",
				})
			: Bun.spawn(["ssh", sshTarget, "bash", "-s"], {
					stdin: new Blob([deleteScript]),
					stdout: "pipe",
					stderr: "pipe",
				})

	const stdout = (await new Response(deleteProc.stdout).text()).trim()
	const stderr = await new Response(deleteProc.stderr).text()
	const exitCode = await deleteProc.exited

	if (stdout === "STILL_RUNNING") {
		throw new Error("Container is still running - stop it first")
	}

	if (exitCode !== 0 && stdout !== "NOT_FOUND") {
		throw new Error(`Failed to delete container: ${stderr}`)
	}

	console.log(`[gateway] Container ${containerName} deleted successfully`)
}

/**
 * Restart a stopped container with a fresh Tailscale auth key
 * The new key is injected via a file that the entrypoint reads on startup
 */
async function restartContainerOnServer(
	containerName: string,
	server: string,
	sshUser?: string,
	tailscaleConfig?: { tailnetId?: string; apiKey?: string },
): Promise<{ restarted: boolean; notFound: boolean }> {
	console.log(`[gateway] Restarting container ${containerName} on ${server}...`)

	const sshTarget =
		server === "localhost" ? "localhost" : `${sshUser || "ubuntu"}@${server}`

	// Generate a fresh Tailscale auth key for the restart
	if (!tailscaleConfig?.tailnetId || !tailscaleConfig?.apiKey) {
		throw new Error("Tailscale config required for container restart")
	}

	const newAuthKey = await generateTailscaleAuthKey(
		tailscaleConfig.tailnetId,
		tailscaleConfig.apiKey,
	)

	// Script to inject auth key and start the container
	// Note: docker cp works on stopped containers, docker exec does not
	const restartScript = `
CONTAINER_ID=$(docker ps -aq --filter "label=agent-manager.tailscale-hostname=${containerName}" | head -1)
if [ -z "$CONTAINER_ID" ]; then
  CONTAINER_ID="${containerName}"
fi

# Check if container exists
if ! docker inspect "$CONTAINER_ID" >/dev/null 2>&1; then
  echo "NOT_FOUND"
  exit 0
fi

# Check if container is already running
RUNNING=$(docker inspect --format='{{.State.Running}}' "$CONTAINER_ID" 2>/dev/null || echo "false")
if [ "$RUNNING" = "true" ]; then
  echo "ALREADY_RUNNING"
  exit 0
fi

# Create temp file with new auth key and copy into stopped container
TEMP_KEY_FILE=$(mktemp)
echo '${newAuthKey}' > "$TEMP_KEY_FILE"
docker cp "$TEMP_KEY_FILE" "$CONTAINER_ID:/var/run/tailscale-authkey"
rm -f "$TEMP_KEY_FILE"

# Start the container (entrypoint will read the auth key file and clear old TS state)
docker start "$CONTAINER_ID"
`

	const restartProc =
		server === "localhost"
			? Bun.spawn(["bash", "-c", restartScript], {
					stdout: "pipe",
					stderr: "pipe",
				})
			: Bun.spawn(["ssh", sshTarget, "bash", "-s"], {
					stdin: new Blob([restartScript]),
					stdout: "pipe",
					stderr: "pipe",
				})

	const stdout = (await new Response(restartProc.stdout).text()).trim()
	const stderr = await new Response(restartProc.stderr).text()
	const exitCode = await restartProc.exited

	if (stdout === "NOT_FOUND") {
		console.log(`[gateway] Container ${containerName} not found on host`)
		return { restarted: false, notFound: true }
	}

	if (stdout === "ALREADY_RUNNING") {
		console.log(`[gateway] Container ${containerName} is already running`)
		return { restarted: true, notFound: false }
	}

	if (exitCode !== 0) {
		throw new Error(`Failed to restart container: ${stderr}`)
	}

	console.log(`[gateway] Container ${containerName} restarted successfully`)
	return { restarted: true, notFound: false }
}

/**
 * List all agent-manager containers on a server via SSH/Docker
 * Returns container names and their running status
 */
async function listContainersOnServer(
	server: string,
	sshUser?: string,
): Promise<Array<{ name: string; containerId: string; running: boolean }>> {
	console.log(`[gateway] Listing containers on ${server}...`)

	const sshTarget =
		server === "localhost" ? "localhost" : `${sshUser || "ubuntu"}@${server}`

	// List all containers with agent-manager labels, output JSON format
	const listScript = `
docker ps -a --filter "label=agent-manager.tailscale-hostname" --format '{"name":"{{.Names}}","containerId":"{{.ID}}","running":{{if eq .State "running"}}true{{else}}false{{end}}}'
`

	const listProc =
		server === "localhost"
			? Bun.spawn(["bash", "-c", listScript], {
					stdout: "pipe",
					stderr: "pipe",
				})
			: Bun.spawn(["ssh", sshTarget, "bash", "-s"], {
					stdin: new Blob([listScript]),
					stdout: "pipe",
					stderr: "pipe",
				})

	const stdout = await new Response(listProc.stdout).text()
	const stderr = await new Response(listProc.stderr).text()
	const exitCode = await listProc.exited

	if (exitCode !== 0) {
		throw new Error(`Failed to list containers: ${stderr}`)
	}

	// Parse JSON lines output
	const containers: Array<{ name: string; containerId: string; running: boolean }> = []
	for (const line of stdout.trim().split("\n")) {
		if (line) {
			try {
				containers.push(JSON.parse(line))
			} catch {
				console.warn(`[gateway] Failed to parse container line: ${line}`)
			}
		}
	}

	console.log(`[gateway] Found ${containers.length} containers on ${server}`)
	return containers
}

// Configuration from environment
// Note: No HTTP/WebSocket server - containers connect directly to Convex
const CONVEX_URL = process.env.CONVEX_URL || ""
const SERVER_ID =
	process.env.SERVER_ID || `gateway-${crypto.randomUUID().slice(0, 8)}`
const PING_INTERVAL = 30000 // 30 seconds
const PRUNE_INTERVAL = 60000 // 60 seconds

const connections = new ConnectionManager(SERVER_ID)
const convexSync = CONVEX_URL ? new ConvexSync(CONVEX_URL) : null
const claudeAuth = CONVEX_URL ? new ClaudeAuth(CONVEX_URL) : null
const taskOrchestrator = CONVEX_URL
	? new TaskOrchestrator(CONVEX_URL, connections)
	: null

// Command processor for Convex-driven server operations
const commandProcessor = CONVEX_URL
	? new ConvexCommandProcessor(CONVEX_URL, {
			convexSync,
			createContainerOnServer,
			stopContainerOnServer,
			restartContainerOnServer,
			deleteContainerOnServer,
			listContainersOnServer,
			fetchSecrets,
			fetchTailscaleConfig,
		})
	: null

// Active executions tracking (correlationId -> { containerId, taskId, projectId })
const activeExecutions = new Map<
	string,
	{
		containerId: string
		taskId?: string
		projectId?: string
		startedAt: number
	}
>()

/**
 * Push stored auth token to a container
 */
async function pushTokenToContainer(containerId: string): Promise<boolean> {
	if (!claudeAuth) return false

	const token = await claudeAuth.getStoredToken()
	if (!token) {
		console.log(`[gateway] No stored token to push to ${containerId}`)
		return false
	}

	const sent = connections.sendToContainer(containerId, "auth:request", {
		token,
	})

	if (sent) {
		console.log(`[gateway] Pushed auth token to ${containerId}`)
	}
	return sent
}

/**
 * Handle incoming WebSocket messages from containers
 */
function handleContainerMessage(
	ws: ServerWebSocket<ContainerContext>,
	message: WebSocketMessage,
): void {
	// Handle connect (registration)
	if (isConnectMessage(message)) {
		const payload = message.payload as ConnectPayload
		connections.registerContainer(ws, payload)

		// Update Convex with container status
		if (convexSync) {
			convexSync.updateContainerConnection(
				payload.containerId,
				payload.hostname,
				true,
			)
		}

		// Auto-push auth token to newly connected container
		pushTokenToContainer(payload.containerId)

		return
	}

	// All other messages require registration
	if (!ws.data.registered || !ws.data.containerId) {
		console.warn("[gateway] Received message from unregistered container")
		return
	}

	const containerId = ws.data.containerId

	switch (message.type) {
		case "heartbeat": {
			const payload = message.payload as HeartbeatPayload
			connections.updateHeartbeat(containerId)
			// Echo heartbeat back
			connections.send(ws, "heartbeat", {
				seq: payload.seq,
				sentAt: Date.now(),
			})
			break
		}

		case "status:health": {
			const payload = message.payload as StatusHealthPayload
			connections.updateHealth(containerId, payload)
			break
		}

		case "auth:status": {
			const payload = message.payload as AuthStatusPayload
			console.log(`[gateway] Auth status from ${containerId}:`, payload)
			// Forward to ClaudeAuth for OAuth flow handling
			if (claudeAuth) {
				claudeAuth.handleContainerAuthStatus(containerId, payload)
			}
			break
		}

		case "auth:flow:url": {
			// Container started OAuth flow and returned the URL
			const payload = message.payload as {
				flowId: string
				url: string
				expiresIn: number
			}
			console.log(`[gateway] OAuth URL from ${containerId}:`, payload.url)
			if (claudeAuth) {
				claudeAuth.handleContainerAuthFlowUrl(containerId, payload)
			}
			break
		}

		case "error": {
			const payload = message.payload as { code: string; message: string }
			console.log(`[gateway] Error from ${containerId}:`, payload)
			// Forward to ClaudeAuth for error handling
			if (claudeAuth) {
				claudeAuth.handleContainerError(
					containerId,
					payload,
					message.correlationId,
				)
			}
			break
		}

		case "exec:stream": {
			const payload = message.payload as ExecStreamPayload
			handleExecStream(containerId, payload, message.correlationId)
			break
		}

		case "exec:complete": {
			const payload = message.payload as ExecCompletePayload
			handleExecComplete(containerId, payload, message.correlationId)
			break
		}

		default:
			console.log(`[gateway] Unhandled message type: ${message.type}`)
	}
}

/**
 * Handle streaming execution output
 */
function handleExecStream(
	containerId: string,
	payload: ExecStreamPayload,
	correlationId?: string,
): void {
	// Check local execution tracking (for REST API initiated executions)
	const execution = correlationId
		? activeExecutions.get(correlationId)
		: null

	// Log stream events
	console.log(
		`[gateway] Stream from ${containerId}:`,
		payload.streamType,
		payload.data.type,
	)

	// Sync to Convex
	if (convexSync && execution && correlationId) {
		convexSync.recordStreamEvent(
			correlationId,
			containerId,
			payload,
			execution.taskId,
			execution.projectId,
		)
	}
}

/**
 * Handle execution completion
 */
function handleExecComplete(
	containerId: string,
	payload: ExecCompletePayload,
	correlationId?: string,
): void {
	// Check local execution tracking (for REST API initiated executions)
	const execution = correlationId
		? activeExecutions.get(correlationId)
		: null

	console.log(
		`[gateway] Execution complete from ${containerId}:`,
		payload.result,
		payload.sessionId ? `session=${payload.sessionId}` : "",
	)

	// Sync to Convex
	if (convexSync && execution && correlationId) {
		convexSync.recordExecComplete(
			correlationId,
			containerId,
			payload,
			execution.taskId,
			execution.projectId,
		)
	}

	// Notify orchestrator to update phase status
	if (taskOrchestrator && correlationId) {
		taskOrchestrator.handleExecutionComplete(correlationId, payload.result, {
			totalCostUsd: payload.totalCostUsd,
			numTurns: payload.numTurns,
			error: payload.error,
		})
	}

	// Clean up from local tracking
	if (correlationId) {
		activeExecutions.delete(correlationId)
	}
}

/**
 * Start an execution on a container
 */
function startExecution(
	containerId: string,
	options: ExecStartPayload,
): { correlationId: string; success: boolean; error?: string } {
	const container = connections.getContainer(containerId)
	if (!container) {
		return { correlationId: "", success: false, error: "Container not found" }
	}

	const correlationId = crypto.randomUUID()

	// Track the execution
	activeExecutions.set(correlationId, {
		containerId,
		taskId: options.taskId,
		projectId: options.projectId,
		startedAt: Date.now(),
	})

	// Send exec:start to container
	const sent = connections.sendToContainer(
		containerId,
		"exec:start",
		options,
		correlationId,
	)

	if (!sent) {
		activeExecutions.delete(correlationId)
		return {
			correlationId,
			success: false,
			error: "Failed to send to container",
		}
	}

	// Record in Convex
	if (convexSync) {
		convexSync.recordExecStart(
			correlationId,
			containerId,
			options,
			options.taskId,
			options.projectId,
		)
	}

	return { correlationId, success: true }
}

/**
 * HTTP API handler
 */
async function handleHttpRequest(req: Request): Promise<Response> {
	const url = new URL(req.url)

	// CORS headers
	const corsHeaders = {
		"Access-Control-Allow-Origin": "*",
		"Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type",
	}

	if (req.method === "OPTIONS") {
		return new Response(null, { headers: corsHeaders })
	}

	// Health check
	if (url.pathname === "/health") {
		const stats = connections.getStats()
		const hasToken = claudeAuth ? await claudeAuth.hasValidToken() : false
		return Response.json(
			{ status: "ok", serverId: SERVER_ID, hasAuthToken: hasToken, ...stats },
			{ headers: corsHeaders },
		)
	}

	// Auth status - check if we have a stored token
	if (url.pathname === "/auth/status" && req.method === "GET") {
		if (!claudeAuth) {
			return Response.json(
				{ error: "Auth not configured (CONVEX_URL not set)" },
				{ status: 500, headers: corsHeaders },
			)
		}
		const hasToken = await claudeAuth.hasValidToken()
		return Response.json({ hasToken }, { headers: corsHeaders })
	}

	// Start OAuth flow to get a token
	if (url.pathname === "/auth/setup/start" && req.method === "POST") {
		if (!claudeAuth) {
			return Response.json(
				{ error: "Auth not configured (CONVEX_URL not set)" },
				{ status: 500, headers: corsHeaders },
			)
		}

		try {
			const result = await claudeAuth.startOAuthFlow()
			return Response.json(result, { headers: corsHeaders })
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			return Response.json(
				{ error: message },
				{ status: 500, headers: corsHeaders },
			)
		}
	}

	// Complete OAuth flow with authorization code
	if (url.pathname === "/auth/setup/complete" && req.method === "POST") {
		if (!claudeAuth) {
			return Response.json(
				{ error: "Auth not configured (CONVEX_URL not set)" },
				{ status: 500, headers: corsHeaders },
			)
		}

		try {
			const { flowId, code } = (await req.json()) as {
				flowId: string
				code: string
			}

			if (!flowId || !code) {
				return Response.json(
					{ error: "flowId and code are required" },
					{ status: 400, headers: corsHeaders },
				)
			}

			const result = await claudeAuth.completeOAuthFlow(flowId, code)

			if (result.success) {
				// Push the new token to all connected containers
				const containers = connections.getAllContainers()
				for (const container of containers) {
					pushTokenToContainer(container.info.containerId)
				}
			}

			return Response.json(result, { headers: corsHeaders })
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			return Response.json(
				{ error: message },
				{ status: 500, headers: corsHeaders },
			)
		}
	}

	// Manually set auth token (for testing or importing existing token)
	if (url.pathname === "/auth/token" && req.method === "POST") {
		if (!claudeAuth) {
			return Response.json(
				{ error: "Auth not configured (CONVEX_URL not set)" },
				{ status: 500, headers: corsHeaders },
			)
		}

		try {
			const { token } = (await req.json()) as { token: string }

			if (!token) {
				return Response.json(
					{ error: "token is required" },
					{ status: 400, headers: corsHeaders },
				)
			}

			const stored = await claudeAuth.storeToken(token)

			if (stored) {
				// Push the token to all connected containers
				const containers = connections.getAllContainers()
				for (const container of containers) {
					pushTokenToContainer(container.info.containerId)
				}
			}

			return Response.json({ success: stored }, { headers: corsHeaders })
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			return Response.json(
				{ error: message },
				{ status: 500, headers: corsHeaders },
			)
		}
	}

	// List connected containers
	if (url.pathname === "/containers" && req.method === "GET") {
		const containers = connections.getAllContainers().map((c) => ({
			containerId: c.info.containerId,
			hostname: c.info.hostname,
			version: c.info.version,
			capabilities: c.info.capabilities,
			health: c.health,
			connectedAt: c.connectedAt,
			lastHeartbeat: c.lastHeartbeat,
		}))
		return Response.json({ containers }, { headers: corsHeaders })
	}

	// Get specific container
	if (url.pathname.match(/^\/containers\/[^/]+$/) && req.method === "GET") {
		const containerId = url.pathname.split("/")[2]
		if (!containerId) {
			return Response.json(
				{ error: "Container ID required" },
				{ status: 400, headers: corsHeaders },
			)
		}
		const container = connections.getContainer(containerId)
		if (!container) {
			return Response.json(
				{ error: "Container not found" },
				{ status: 404, headers: corsHeaders },
			)
		}
		return Response.json(
			{
				containerId: container.info.containerId,
				hostname: container.info.hostname,
				version: container.info.version,
				capabilities: container.info.capabilities,
				health: container.health,
				connectedAt: container.connectedAt,
				lastHeartbeat: container.lastHeartbeat,
			},
			{ headers: corsHeaders },
		)
	}

	// Start execution on a container
	if (url.pathname === "/exec" && req.method === "POST") {
		try {
			const body = (await req.json()) as ExecStartPayload & {
				containerId?: string
			}
			const { containerId, ...options } = body

			// Find container (specific or available)
			let targetContainerId = containerId
			if (!targetContainerId) {
				const available = connections.findAvailableContainer()
				if (!available) {
					return Response.json(
						{ error: "No available containers" },
						{ status: 503, headers: corsHeaders },
					)
				}
				targetContainerId = available.info.containerId
			}

			const result = startExecution(targetContainerId, options)

			if (!result.success) {
				return Response.json(
					{ error: result.error },
					{ status: 400, headers: corsHeaders },
				)
			}

			return Response.json(
				{
					correlationId: result.correlationId,
					containerId: targetContainerId,
					status: "started",
				},
				{ status: 201, headers: corsHeaders },
			)
		} catch (error) {
			console.error("[gateway] Failed to start execution:", error)
			return Response.json(
				{ error: "Invalid request body" },
				{ status: 400, headers: corsHeaders },
			)
		}
	}

	// Abort execution
	if (url.pathname.match(/^\/exec\/[^/]+\/abort$/) && req.method === "POST") {
		const correlationId = url.pathname.split("/")[2]
		if (!correlationId) {
			return Response.json(
				{ error: "Correlation ID required" },
				{ status: 400, headers: corsHeaders },
			)
		}
		const execution = activeExecutions.get(correlationId)

		if (!execution) {
			return Response.json(
				{ error: "Execution not found" },
				{ status: 404, headers: corsHeaders },
			)
		}

		// TODO: Send abort message to container
		// connections.sendToContainer(execution.containerId, "exec:abort", { processId: ? });

		return Response.json(
			{ status: "abort_requested" },
			{ headers: corsHeaders },
		)
	}

	// Start task phase execution
	if (
		url.pathname.match(/^\/tasks\/[^/]+\/phases\/[^/]+\/start$/) &&
		req.method === "POST"
	) {
		if (!taskOrchestrator) {
			return Response.json(
				{ error: "Task orchestrator not configured (CONVEX_URL not set)" },
				{ status: 500, headers: corsHeaders },
			)
		}

		const parts = url.pathname.split("/")
		const taskId = parts[2]
		const phase = parts[4] as TaskPhase

		if (!taskId || !phase) {
			return Response.json(
				{ error: "Task ID and phase are required" },
				{ status: 400, headers: corsHeaders },
			)
		}

		try {
			const body = (await req.json().catch(() => ({}))) as {
				containerId?: string
				customPrompt?: string
				configOverrides?: Record<string, unknown>
			}

			const result = await taskOrchestrator.startPhaseExecution({
				taskId,
				phase,
				containerId: body.containerId,
				customPrompt: body.customPrompt,
				configOverrides: body.configOverrides,
			})

			if (!result.success) {
				return Response.json(
					{ error: result.error },
					{ status: 400, headers: corsHeaders },
				)
			}

			return Response.json(
				{
					correlationId: result.correlationId,
					containerId: result.containerId,
					taskId,
					phase,
					status: "started",
				},
				{ status: 201, headers: corsHeaders },
			)
		} catch (error) {
			console.error("[gateway] Failed to start phase execution:", error)
			const message = error instanceof Error ? error.message : String(error)
			return Response.json(
				{ error: message },
				{ status: 500, headers: corsHeaders },
			)
		}
	}

	// Get active task executions
	if (url.pathname === "/tasks/executions" && req.method === "GET") {
		if (!taskOrchestrator) {
			return Response.json(
				{ error: "Task orchestrator not configured" },
				{ status: 500, headers: corsHeaders },
			)
		}

		const executions = taskOrchestrator.getActiveExecutions()
		return Response.json({ executions }, { headers: corsHeaders })
	}

	// Push auth token to container
	if (
		url.pathname.match(/^\/containers\/[^/]+\/auth$/) &&
		req.method === "POST"
	) {
		const containerId = url.pathname.split("/")[2]
		if (!containerId) {
			return Response.json(
				{ error: "Container ID required" },
				{ status: 400, headers: corsHeaders },
			)
		}
		try {
			const { token } = (await req.json()) as { token: string }

			const sent = connections.sendToContainer(containerId, "auth:request", {
				token,
			})

			if (!sent) {
				return Response.json(
					{ error: "Container not found or not connected" },
					{ status: 404, headers: corsHeaders },
				)
			}

			return Response.json({ status: "token_sent" }, { headers: corsHeaders })
		} catch {
			return Response.json(
				{ error: "Invalid request" },
				{ status: 400, headers: corsHeaders },
			)
		}
	}

	// Create container (inline SSH with secrets from Convex)
	if (url.pathname === "/containers/create" && req.method === "POST") {
		try {
			const body = (await req.json()) as CreateContainerRequest

			// Repo is now optional - management containers don't need one
			console.log(`[gateway] Creating container${body.repo ? ` for repo: ${body.repo}` : " (no repo)"}`)

			// Fetch config from Convex
			if (!CONVEX_URL) {
				return Response.json(
					{ error: "CONVEX_URL not configured - cannot fetch config" },
					{ status: 500, headers: corsHeaders },
				)
			}

			// Fetch secrets (GH creds only needed if cloning a repo)
			const secrets = await fetchSecrets(CONVEX_URL, [
				"GH_USERNAME",
				"GH_TOKEN",
			])

			// Validate required secrets only if repo is specified
			if (body.repo) {
				const requiredSecrets = ["GH_USERNAME", "GH_TOKEN"]
				const missingSecrets = requiredSecrets.filter((key) => !secrets[key])
				if (missingSecrets.length > 0) {
					return Response.json(
						{ error: `Missing required secrets for repo cloning: ${missingSecrets.join(", ")}` },
						{ status: 500, headers: corsHeaders },
					)
				}
			}

			// Fetch Tailscale config (required for generating auth keys)
			const tailscaleConfig = await fetchTailscaleConfig(CONVEX_URL)

			const result = await createContainerOnServer(
				body,
				secrets,
				convexSync ?? undefined,
				tailscaleConfig,
			)

			// Record in Convex
			if (convexSync) {
				convexSync.recordContainerCreated(result, body.taskId, body.projectId)
			}

			return Response.json(result, { status: 201, headers: corsHeaders })
		} catch (error) {
			console.error("[gateway] Failed to create container:", error)
			const message = error instanceof Error ? error.message : "Unknown error"
			return Response.json(
				{ error: "Failed to create container", details: message },
				{ status: 500, headers: corsHeaders },
			)
		}
	}

	// Stop container (SSH docker stop)
	if (
		url.pathname.match(/^\/containers\/[^/]+\/stop$/) &&
		req.method === "POST"
	) {
		const containerName = url.pathname.split("/")[2]
		try {
			const body = (await req.json()) as { server: string; sshUser?: string }

			if (!body.server) {
				return Response.json(
					{ error: "server is required" },
					{ status: 400, headers: corsHeaders },
				)
			}

			console.log(
				`[gateway] Stopping container ${containerName} on ${body.server}...`,
			)

			const sshTarget =
				body.server === "localhost"
					? "localhost"
					: `${body.sshUser || "ubuntu"}@${body.server}`

			// Find container by label first, fallback to direct name
			const stopScript = `
CONTAINER_ID=$(docker ps -aq --filter "label=agent-manager.tailscale-hostname=${containerName}" | head -1)
if [ -z "$CONTAINER_ID" ]; then
  CONTAINER_ID="${containerName}"
fi
docker stop "$CONTAINER_ID"
`

			const stopProc =
				body.server === "localhost"
					? Bun.spawn(["bash", "-c", stopScript], {
							stdout: "pipe",
							stderr: "pipe",
						})
					: Bun.spawn(["ssh", sshTarget, "bash", "-s"], {
							stdin: new Blob([stopScript]),
							stdout: "pipe",
							stderr: "pipe",
						})

			const stdout = await new Response(stopProc.stdout).text()
			const stderr = await new Response(stopProc.stderr).text()
			const exitCode = await stopProc.exited

			if (exitCode !== 0) {
				console.error(`[gateway] Failed to stop container: ${stderr}`)
				return Response.json(
					{ error: "Failed to stop container", details: stderr },
					{ status: 500, headers: corsHeaders },
				)
			}

			console.log(
				`[gateway] Container ${containerName} stopped successfully (ID: ${stdout.trim()})`,
			)
			return Response.json(
				{ status: "stopped", containerName, output: stdout.trim() },
				{ headers: corsHeaders },
			)
		} catch (error) {
			console.error("[gateway] Failed to stop container:", error)
			const message = error instanceof Error ? error.message : "Unknown error"
			return Response.json(
				{ error: "Failed to stop container", details: message },
				{ status: 500, headers: corsHeaders },
			)
		}
	}

	// Delete container (SSH docker rm - only works on stopped containers)
	if (url.pathname.match(/^\/containers\/[^/]+$/) && req.method === "DELETE") {
		const containerName = url.pathname.split("/")[2]
		try {
			const body = (await req.json()) as { server: string; sshUser?: string }

			if (!body.server) {
				return Response.json(
					{ error: "server is required" },
					{ status: 400, headers: corsHeaders },
				)
			}

			console.log(
				`[gateway] Deleting container ${containerName} on ${body.server}...`,
			)

			const sshTarget =
				body.server === "localhost"
					? "localhost"
					: `${body.sshUser || "ubuntu"}@${body.server}`

			// Find container by label first, check if running, then delete
			const deleteScript = `
CONTAINER_ID=$(docker ps -aq --filter "label=agent-manager.tailscale-hostname=${containerName}" | head -1)
if [ -z "$CONTAINER_ID" ]; then
  CONTAINER_ID="${containerName}"
fi

# Check if container exists
if ! docker inspect "$CONTAINER_ID" >/dev/null 2>&1; then
  echo "NOT_FOUND"
  exit 0
fi

# Check if container is running
RUNNING=$(docker inspect --format='{{.State.Running}}' "$CONTAINER_ID" 2>/dev/null || echo "false")
if [ "$RUNNING" = "true" ]; then
  echo "STILL_RUNNING"
  exit 1
fi

# Delete the container
docker rm "$CONTAINER_ID"
`

			const deleteProc =
				body.server === "localhost"
					? Bun.spawn(["bash", "-c", deleteScript], {
							stdout: "pipe",
							stderr: "pipe",
						})
					: Bun.spawn(["ssh", sshTarget, "bash", "-s"], {
							stdin: new Blob([deleteScript]),
							stdout: "pipe",
							stderr: "pipe",
						})

			const stdout = (await new Response(deleteProc.stdout).text()).trim()
			const stderr = await new Response(deleteProc.stderr).text()
			const exitCode = await deleteProc.exited

			if (stdout === "NOT_FOUND") {
				return Response.json(
					{ error: "Container not found" },
					{ status: 404, headers: corsHeaders },
				)
			}

			if (stdout === "STILL_RUNNING" || exitCode !== 0) {
				if (stdout === "STILL_RUNNING") {
					return Response.json(
						{ error: "Container is running. Stop it first before deleting." },
						{ status: 400, headers: corsHeaders },
					)
				}
				console.error(`[gateway] Failed to delete container: ${stderr}`)
				return Response.json(
					{ error: "Failed to delete container", details: stderr },
					{ status: 500, headers: corsHeaders },
				)
			}

			console.log(
				`[gateway] Container ${containerName} deleted successfully (ID: ${stdout})`,
			)
			return Response.json(
				{ status: "deleted", containerName, output: stdout.trim() },
				{ headers: corsHeaders },
			)
		} catch (error) {
			console.error("[gateway] Failed to delete container:", error)
			const message = error instanceof Error ? error.message : "Unknown error"
			return Response.json(
				{ error: "Failed to delete container", details: message },
				{ status: 500, headers: corsHeaders },
			)
		}
	}

	return Response.json(
		{ error: "Not found" },
		{ status: 404, headers: corsHeaders },
	)
}

// Start Convex subscriptions for OAuth flows if claudeAuth is available
if (claudeAuth) {
	claudeAuth.startConvexSubscriptions()

	// Token updates are now handled via Convex secrets
	// Containers subscribe directly to secrets for auth token changes
	claudeAuth.on("auth:token-acquired", () => {
		console.log("[gateway] Token acquired and stored in Convex secrets")
	})
}

// Start Convex command processor for real-time command handling
if (commandProcessor) {
	commandProcessor.start()
}

console.log(`[gateway] Agent Gateway started`)
console.log(`[gateway]   Server ID: ${SERVER_ID}`)
if (convexSync) {
	console.log(`[gateway]   Convex:    enabled`)
} else {
	console.log(`[gateway]   Convex:    disabled (set CONVEX_URL to enable)`)
}
if (claudeAuth) {
	console.log(`[gateway]   OAuth:     Convex real-time subscriptions enabled`)
}
if (commandProcessor) {
	console.log(`[gateway]   Commands:  Convex-driven command processing enabled`)
}

// Keep process running (no HTTP server, just Convex subscriptions)
console.log(`[gateway] Gateway is running. Press Ctrl+C to stop.`)

// Keep the event loop alive - Convex client handles reconnection
// The process stays running due to active Convex subscriptions
setInterval(() => {
	// Heartbeat - Convex subscriptions keep the connection alive
}, 60000)
