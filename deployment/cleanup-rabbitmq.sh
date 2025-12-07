#!/bin/bash

#############################################
# RabbitMQ Cleanup Script
# Use this to resolve RabbitMQ conflicts
#############################################

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════╗"
echo "║   RabbitMQ Cleanup & Conflict Resolution ║"
echo "╚═══════════════════════════════════════════╝"
echo -e "${NC}"

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check what's running on port 5672
echo -e "\n${BLUE}Checking port 5672...${NC}"
if command_exists lsof; then
    if sudo lsof -i :5672 >/dev/null 2>&1; then
        echo -e "${YELLOW}Port 5672 is in use:${NC}"
        sudo lsof -i :5672
    else
        echo -e "${GREEN}✓${NC} Port 5672 is free"
    fi
else
    echo -e "${YELLOW}⚠${NC}  lsof not available, trying netstat..."
    if command_exists netstat; then
        sudo netstat -tlnp | grep 5672 || echo -e "${GREEN}✓${NC} Port 5672 is free"
    fi
fi

# Check Docker containers
echo -e "\n${BLUE}Checking Docker containers...${NC}"
if command_exists docker; then
    RABBITMQ_CONTAINERS=$(docker ps -a --filter "ancestor=rabbitmq" --format "{{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null)
    if [ -n "$RABBITMQ_CONTAINERS" ]; then
        echo -e "${YELLOW}Found RabbitMQ containers:${NC}"
        echo "$RABBITMQ_CONTAINERS"
    else
        # Check by port mapping
        PORT_CONTAINERS=$(docker ps --format "{{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null | grep "5672")
        if [ -n "$PORT_CONTAINERS" ]; then
            echo -e "${YELLOW}Found containers using port 5672:${NC}"
            echo "$PORT_CONTAINERS"
        else
            echo -e "${GREEN}✓${NC} No Docker RabbitMQ containers found"
        fi
    fi
else
    echo -e "${YELLOW}⚠${NC}  Docker not installed"
fi

# Check system service
echo -e "\n${BLUE}Checking system service...${NC}"
if command_exists systemctl; then
    if systemctl list-unit-files | grep -q rabbitmq-server; then
        STATUS=$(sudo systemctl is-active rabbitmq-server 2>/dev/null || echo "inactive")
        ENABLED=$(sudo systemctl is-enabled rabbitmq-server 2>/dev/null || echo "disabled")
        echo -e "RabbitMQ service: ${YELLOW}$STATUS${NC} (${YELLOW}$ENABLED${NC})"

        if [ "$STATUS" = "failed" ]; then
            echo -e "${RED}✗${NC} Service is in failed state"
        fi
    else
        echo -e "${GREEN}✓${NC} No system RabbitMQ service installed"
    fi
else
    echo -e "${YELLOW}⚠${NC}  systemctl not available"
fi

# Check package installation
echo -e "\n${BLUE}Checking installed packages...${NC}"
if command_exists dpkg; then
    if dpkg -l | grep -q rabbitmq-server; then
        PACKAGE_STATUS=$(dpkg -l | grep rabbitmq-server | awk '{print $1, $2, $3}')
        echo -e "Package status: ${YELLOW}$PACKAGE_STATUS${NC}"

        if echo "$PACKAGE_STATUS" | grep -q "^iF"; then
            echo -e "${RED}✗${NC} Package is in failed state (needs --configure)"
        fi
    else
        echo -e "${GREEN}✓${NC} No system package installed"
    fi
elif command_exists rpm; then
    if rpm -qa | grep -q rabbitmq-server; then
        echo -e "${YELLOW}RabbitMQ package installed (RPM)${NC}"
    else
        echo -e "${GREEN}✓${NC} No system package installed"
    fi
fi

# Offer cleanup options
echo -e "\n${BLUE}═══════════════════════════════════════════${NC}"
echo -e "${BLUE}Cleanup Options:${NC}"
echo -e "${BLUE}═══════════════════════════════════════════${NC}"
echo "1. Stop Docker RabbitMQ containers"
echo "2. Stop and disable system RabbitMQ service"
echo "3. Fix failed system RabbitMQ installation"
echo "4. Completely remove system RabbitMQ"
echo "5. Kill all processes on port 5672"
echo "6. Full cleanup (all of the above)"
echo "7. Exit (no changes)"
echo ""

read -p "Choose option [1-7]: " choice

case $choice in
    1)
        echo -e "\n${YELLOW}Stopping Docker RabbitMQ containers...${NC}"
        if command_exists docker; then
            docker ps -a --filter "ancestor=rabbitmq" --format "{{.Names}}" | xargs -r docker stop
            docker ps -a --filter "ancestor=rabbitmq" --format "{{.Names}}" | xargs -r docker rm
            # Also stop any container using port 5672
            for container in $(docker ps --format "{{.Names}}\t{{.Ports}}" | grep "5672" | awk '{print $1}'); do
                echo "Stopping container: $container"
                docker stop "$container"
                docker rm "$container"
            done
            echo -e "${GREEN}✓${NC} Docker containers stopped"
        else
            echo -e "${RED}✗${NC} Docker not available"
        fi
        ;;

    2)
        echo -e "\n${YELLOW}Stopping system RabbitMQ service...${NC}"
        sudo systemctl stop rabbitmq-server || true
        sudo systemctl disable rabbitmq-server || true
        echo -e "${GREEN}✓${NC} Service stopped and disabled"
        ;;

    3)
        echo -e "\n${YELLOW}Fixing failed installation...${NC}"
        sudo systemctl stop rabbitmq-server || true
        sudo dpkg --configure -a || true
        sudo apt-get install -f -y || true
        echo -e "${GREEN}✓${NC} Installation fixed"
        ;;

    4)
        echo -e "\n${YELLOW}Removing system RabbitMQ...${NC}"
        sudo systemctl stop rabbitmq-server || true
        sudo systemctl disable rabbitmq-server || true

        if command_exists apt-get; then
            sudo apt-get remove --purge -y rabbitmq-server erlang-* || true
            sudo apt-get autoremove -y || true
        elif command_exists yum; then
            sudo yum remove -y rabbitmq-server erlang-* || true
        fi

        sudo rm -rf /var/lib/rabbitmq /etc/rabbitmq || true
        echo -e "${GREEN}✓${NC} RabbitMQ removed"
        ;;

    5)
        echo -e "\n${YELLOW}Killing processes on port 5672...${NC}"
        if command_exists lsof; then
            sudo lsof -ti :5672 | xargs -r sudo kill -9
            echo -e "${GREEN}✓${NC} Processes killed"
        else
            echo -e "${RED}✗${NC} lsof not available"
        fi
        ;;

    6)
        echo -e "\n${YELLOW}Performing full cleanup...${NC}"

        # Stop Docker containers
        if command_exists docker; then
            echo "Stopping Docker containers..."
            docker ps -a --filter "ancestor=rabbitmq" --format "{{.Names}}" | xargs -r docker stop
            docker ps -a --filter "ancestor=rabbitmq" --format "{{.Names}}" | xargs -r docker rm
            for container in $(docker ps --format "{{.Names}}\t{{.Ports}}" | grep "5672" | awk '{print $1}'); do
                docker stop "$container" 2>/dev/null || true
                docker rm "$container" 2>/dev/null || true
            done
        fi

        # Stop system service
        echo "Stopping system service..."
        sudo systemctl stop rabbitmq-server 2>/dev/null || true
        sudo systemctl disable rabbitmq-server 2>/dev/null || true

        # Remove package
        echo "Removing packages..."
        if command_exists apt-get; then
            sudo apt-get remove --purge -y rabbitmq-server 2>/dev/null || true
            sudo apt-get autoremove -y || true
        elif command_exists yum; then
            sudo yum remove -y rabbitmq-server 2>/dev/null || true
        fi

        # Kill remaining processes
        echo "Killing remaining processes..."
        if command_exists lsof; then
            sudo lsof -ti :5672 | xargs -r sudo kill -9 2>/dev/null || true
        fi

        # Clean up files
        echo "Cleaning up files..."
        sudo rm -rf /var/lib/rabbitmq /etc/rabbitmq 2>/dev/null || true

        echo -e "${GREEN}✓${NC} Full cleanup complete"
        ;;

    7)
        echo -e "${GREEN}Exiting without changes${NC}"
        exit 0
        ;;

    *)
        echo -e "${RED}Invalid option${NC}"
        exit 1
        ;;
esac

# Verify port is now free
echo -e "\n${BLUE}Verifying port 5672...${NC}"
sleep 2
if command_exists lsof; then
    if sudo lsof -i :5672 >/dev/null 2>&1; then
        echo -e "${RED}✗${NC} Port 5672 is still in use:"
        sudo lsof -i :5672
    else
        echo -e "${GREEN}✓${NC} Port 5672 is now free"
    fi
fi

echo -e "\n${GREEN}Done!${NC}"
echo -e "You can now run: ${YELLOW}./deployment/install.sh${NC}"
