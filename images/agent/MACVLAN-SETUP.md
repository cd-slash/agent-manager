# Macvlan Networking Setup for Tailscale Containers

## What Is This?

This setup uses **macvlan networking** to give Docker containers real IP addresses on your LAN (192.168.1.x), which allows Tailscale to advertise these IPs for direct, high-speed connections instead of routing through Docker's bridge or DERP relays.

## The Problem We Solved

**Before (Bridge Networking):**
- Containers used Docker bridge IPs (172.x.x.x)
- Tailscale advertised these internal IPs
- Connections from the host went through Docker NAT
- Speed: ~4 Mbps with massive packet loss
- Forced to use DERP relays

**After (Macvlan Networking):**
- Containers get real LAN IPs (192.168.1.224-239)
- Tailscale advertises these LAN IPs
- Direct connections with no NAT overhead
- Speed: **9.7 Gbps** (2,425x faster!)
- Zero packet retransmissions

## Network Architecture

```
┌────────────────────────────────────────────────────────────┐
│ Physical Network (192.168.1.0/24)                          │
│                                                            │
│  Router: 192.168.1.254                                     │
│  Host (Omarchy): 192.168.1.193                             │
│  Shim Interface: 192.168.1.223  ←───┐                      │
│  Container Range: 192.168.1.224-239 │                      │
│                                     │                      │
│  ┌──────────────────────────────────┼─────────────┐        │
│  │ Docker Macvlan Network           │             │        │
│  │ (lan-macvlan)                    │             │        │
│  │                                  │             │        │
│  │  Container 1: 192.168.1.224 ─────┘             │        │
│  │  Container 2: 192.168.1.225                    │        │
│  │  Container 3: 192.168.1.226                    │        │
│  │  Container 4: 192.168.1.227                    │        │
│  │  ...                                           │        │
│  └────────────────────────────────────────────────┘        │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

## The Macvlan Shim Interface

### What Is It?

A **shim interface** is a special network interface that bridges the gap between the host and macvlan containers. Due to a Linux kernel limitation, the Docker host cannot directly communicate with containers on a macvlan network—they're on the same physical network but isolated at Layer 2.

### How It Works

1. **Creates a macvlan interface on the host** (`lan-shim`)
2. **Assigns it an IP** (192.168.1.223) in the same subnet but outside the container range
3. **Adds a route** directing traffic for 192.168.1.224-239 through this interface
4. **Enables bidirectional communication** between host and containers

### What It Does

```bash
# 1. Create macvlan interface in bridge mode
ip link add lan-shim link enp7s0 type macvlan mode bridge
   └─> Creates a virtual interface attached to physical enp7s0
       Mode: bridge allows host-to-container communication

# 2. Assign IP address to shim
ip addr add 192.168.1.223/32 dev lan-shim
   └─> /32 means single IP (no subnet)
       Uses an IP just before the container range

# 3. Bring interface up
ip link set lan-shim up
   └─> Activates the interface

# 4. Add routing rule
ip route add 192.168.1.224/28 dev lan-shim
   └─> Routes container IPs through the shim
       /28 = 16 IPs (192.168.1.224-239)
```

### Why Is This Needed?

**Without the shim:**
```
Host (192.168.1.193) → Container (192.168.1.224)
     ❌ BLOCKED by kernel (macvlan limitation)
```

**With the shim:**
```
Host (192.168.1.193) → Shim (192.168.1.223) → Container (192.168.1.224)
                          ✅ Works!
```

## Current Configuration

### Macvlan Network
- **Name:** `lan-macvlan`
- **Subnet:** 192.168.1.0/24
- **Gateway:** 192.168.1.254 (your router)
- **IP Range:** 192.168.1.224/28 (16 IPs: .224-.239)
- **Parent Interface:** enp7s0 (physical ethernet)

### DNS Configuration
Containers use these DNS servers (in order):
1. **100.100.100.100** - Tailscale's MagicDNS
2. **192.168.1.254** - Your router
3. **1.1.1.1** - Cloudflare public DNS

### Shim Interface
- **Name:** `lan-shim`
- **IP:** 192.168.1.223/32
- **Purpose:** Enable host-to-container communication
- **Routes:** 192.168.1.224/28 (container range)

## Systemd Service

The systemd service automatically creates the shim interface on boot.

### Install the Service

```bash
# Copy service file to systemd directory
sudo cp /home/cd-slash/devel/containers/dev-bun/macvlan-shim.service \
        /etc/systemd/system/

# Reload systemd to recognize the new service
sudo systemctl daemon-reload

# Enable service to start on boot
sudo systemctl enable macvlan-shim.service

# Start service now
sudo systemctl start macvlan-shim.service

# Check status
sudo systemctl status macvlan-shim.service
```

### Service Behavior

- **Starts:** After network is online, before Docker
- **Creates:** The lan-shim interface and routing rules
- **Cleans up:** Removes the interface on stop/shutdown
- **Logs:** Output available via `journalctl -u macvlan-shim.service`

## Limitations

### 1. IP Range Limit
- **Current:** 16 IPs (192.168.1.224-239)
- **Max containers:** ~15 (one IP might be reserved by Docker)
- **Solution:** Expand to /27 (32 IPs) or /26 (64 IPs) if needed

### 2. Host Communication
- **Limitation:** Requires the shim interface
- **Impact:** Without shim, host cannot reach containers directly
- **Workaround:** Systemd service ensures shim is always available

### 3. Other Devices
- **Good news:** No limitations!
- All other devices on your LAN can reach containers directly
- Perfect for Tailscale connections from other machines

## Expanding the IP Range

If you need more than 15 containers:

```bash
# Stop all containers using the network
docker compose --project-name <container-name> down

# Remove old network
docker network rm lan-macvlan

# Create new network with more IPs (e.g., /26 = 64 IPs)
docker network create -d macvlan \
  --subnet=192.168.1.0/24 \
  --gateway=192.168.1.254 \
  --ip-range=192.168.1.192/26 \
  -o parent=enp7s0 \
  lan-macvlan

# Update shim script with new range
# Edit setup-macvlan-shim.sh:
#   SHIM_IP="192.168.1.191/32"
#   CONTAINER_RANGE="192.168.1.192/26"

# Restart shim service
sudo systemctl restart macvlan-shim.service

# Restart containers
/home/cd-slash/devel/containers/dev-bun/bin/create-service --hostname <name>
```

## Troubleshooting

### Can't reach containers from host
```bash
# Check if shim exists
ip addr show lan-shim

# Check routing
ip route | grep 192.168.1.224

# Recreate shim
sudo systemctl restart macvlan-shim.service
```

### Containers can't resolve DNS
```bash
# Check container DNS config
docker exec <container> cat /etc/resolv.conf

# Should show: 100.100.100.100, 192.168.1.254, 1.1.1.1
# If not, recreate container
```

### Network conflicts
```bash
# Check what's using the IP range
nmap -sn 192.168.1.224-239

# Reserve range in router DHCP settings
# Most routers: DHCP → Address Reservation
```

## Performance Verification

Test Tailscale connection speed:

```bash
# Start iperf3 server in container
docker exec <container> iperf3 -s -1 -D

# Test from another Tailscale machine
iperf3 -c <container-tailscale-ip> -t 10

# Expected: 500+ Mbps on good WiFi, 1-10 Gbps on wired
```

Check connection type:

```bash
# Should show "direct" with LAN IP
tailscale status | grep <container-name>

# Example output:
# 100.71.173.22  container-name  active; direct 192.168.1.224:42828
#                                        ^^^^^^ ^^^^^^^^^^^^^^^^
#                                        Direct  LAN IP!
```

## Files Modified

- **docker-compose.yml** - Added DNS servers and macvlan network reference
- **bin/create-service** - Added TUN interface name shortening
- **setup-macvlan-shim.sh** - Script to create shim interface
- **macvlan-shim.service** - Systemd service for automatic shim creation

## Further Reading

- [Docker Macvlan Documentation](https://docs.docker.com/network/macvlan/)
- [Tailscale Direct Connections](https://tailscale.com/kb/1082/firewall-ports)
- [Linux Kernel Macvlan Driver](https://www.kernel.org/doc/Documentation/networking/macvlan.txt)
