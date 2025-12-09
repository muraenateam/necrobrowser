#!/bin/bash
#
# Necrobrowser Installation Script for Debian 13 (Trixie)
# Run as root: sudo bash install-debian.sh
#

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}ERROR: This script must be run as root${NC}"
    echo "Usage: sudo bash install-debian.sh"
    exit 1
fi

echo -e "${GREEN}=== Necrobrowser Installation Script ===${NC}"
echo -e "${YELLOW}Target: Debian 13 (Trixie)${NC}"
echo ""

# Update package lists
echo -e "${GREEN}[1/6] Updating package lists...${NC}"
apt-get update

# Install Node.js 18.x (LTS)
echo -e "${GREEN}[2/6] Installing Node.js 18.x...${NC}"
if ! command -v node &> /dev/null; then
    # Install Node.js from NodeSource repository
    apt-get install -y ca-certificates curl gnupg
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg

    NODE_MAJOR=18
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list

    apt-get update
    apt-get install -y nodejs

    echo -e "${GREEN}Node.js installed: $(node --version)${NC}"
    echo -e "${GREEN}NPM installed: $(npm --version)${NC}"
else
    echo -e "${YELLOW}Node.js already installed: $(node --version)${NC}"
fi

# Install Redis server
echo -e "${GREEN}[3/6] Installing Redis server...${NC}"
apt-get install -y redis-server

# Enable and start Redis
systemctl enable redis-server
systemctl start redis-server
echo -e "${GREEN}Redis installed and started${NC}"

# Install Chromium and all required dependencies for Puppeteer
echo -e "${GREEN}[4/6] Installing Chromium and dependencies...${NC}"
apt-get install -y \
    chromium \
    chromium-sandbox \
    fonts-liberation \
    fonts-noto-color-emoji \
    fonts-noto-cjk \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
    ca-certificates

echo -e "${GREEN}Chromium installed: $(chromium --version)${NC}"

# Install additional useful tools
echo -e "${GREEN}[5/6] Installing additional tools (git, curl, etc.)...${NC}"
apt-get install -y \
    git \
    curl \
    wget \
    vim \
    htop

# Set up Puppeteer environment variables
echo -e "${GREEN}[6/6] Configuring environment...${NC}"

# Add environment variables to /etc/environment for system-wide use
if ! grep -q "PUPPETEER_SKIP_CHROMIUM_DOWNLOAD" /etc/environment; then
    echo "PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true" >> /etc/environment
    echo "PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium" >> /etc/environment
    echo -e "${GREEN}Puppeteer environment variables added to /etc/environment${NC}"
fi

# Export for current session
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
export PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Clean up
echo -e "${GREEN}Cleaning up...${NC}"
apt-get clean
rm -rf /var/lib/apt/lists/*

echo ""
echo -e "${GREEN}=== Installation Complete ===${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Navigate to the Necrobrowser directory"
echo "2. Install Node.js dependencies: npm install"
echo "3. Configure config.toml (set root=true if running as root)"
echo "4. Start Necrobrowser: node necrobrowser.js"
echo ""
echo -e "${YELLOW}Installed versions:${NC}"
echo "  Node.js: $(node --version)"
echo "  NPM: $(npm --version)"
echo "  Chromium: $(chromium --version 2>/dev/null | head -n1)"
echo "  Redis: $(redis-server --version)"
echo ""
echo -e "${YELLOW}Services:${NC}"
echo "  Redis status: $(systemctl is-active redis-server)"
echo ""
echo -e "${GREEN}You may need to log out and log back in for environment variables to take effect${NC}"
echo -e "${GREEN}Or run: source /etc/environment${NC}"
