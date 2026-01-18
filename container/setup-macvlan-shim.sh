#!/usr/bin/env bash
# Setup macvlan shim interface to allow host communication with macvlan containers

set -euo pipefail

PARENT_INTERFACE="enp7s0"
SHIM_INTERFACE="lan-shim"
SHIM_IP="192.168.50.250/32"
CONTAINER_RANGE="192.168.50.0/24"

echo "Setting up macvlan shim interface..."

# Remove existing shim if present
if ip link show "$SHIM_INTERFACE" &>/dev/null; then
    echo "Removing existing $SHIM_INTERFACE"
    ip link delete "$SHIM_INTERFACE" || true
fi

# Create macvlan shim interface
echo "Creating $SHIM_INTERFACE on $PARENT_INTERFACE"
ip link add "$SHIM_INTERFACE" link "$PARENT_INTERFACE" type macvlan mode bridge

# Assign IP address
echo "Assigning IP $SHIM_IP to $SHIM_INTERFACE"
ip addr add "$SHIM_IP" dev "$SHIM_INTERFACE"

# Bring interface up
echo "Bringing up $SHIM_INTERFACE"
ip link set "$SHIM_INTERFACE" up

# Add route to container range
echo "Adding route to $CONTAINER_RANGE via $SHIM_INTERFACE"

# First, remove any existing routes to this range
if ip route show | grep -q "^$CONTAINER_RANGE"; then
    echo "Removing existing route to $CONTAINER_RANGE"
    ip route del "$CONTAINER_RANGE" 2>/dev/null || true
fi

# Now add the route through the shim
if ip route add "$CONTAINER_RANGE" dev "$SHIM_INTERFACE"; then
    echo "Route added successfully"
else
    echo "Failed to add route" >&2
    exit 1
fi

echo "✓ Macvlan shim setup complete"
echo "  Shim interface: $SHIM_INTERFACE ($SHIM_IP)"
echo "  Container range: $CONTAINER_RANGE"
