#!/bin/bash
set -e

echo "==============================================="
echo " CLSL AI - AWS EC2 Deployment Script"
echo "==============================================="
echo "This script prepares an Ubuntu EC2 instance for"
echo "Crop Life AI using Docker Compose."

# 1. Update system
echo "--> Updating system packages..."
sudo apt-get update -y
sudo apt-get upgrade -y

# 2. Install Docker
if ! command -v docker &> /dev/null
then
    echo "--> Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker ubuntu
    echo "Docker installed successfully."
else
    echo "--> Docker is already installed."
fi

# 3. Enable Docker on boot
sudo systemctl enable docker
sudo systemctl start docker

# 4. Check for .env file
if [ ! -f ".env" ]; then
    echo "--> WARNING: .env file is missing!"
    echo "Copying .env.example to .env..."
    cp .env.example .env
    echo "PLEASE EDIT .env WITH YOUR SECRETS BEFORE PROCEEDING."
    exit 1
fi

# 5. Build and deploy
echo "--> Building Docker containers and starting services..."
sudo docker compose build
sudo docker compose up -d

echo "--> Running database migrations..."
sudo docker compose exec -T api python -m app.migrate

echo "==============================================="
echo " Deployment Complete!"
echo " The CLSL AI API and Next.js frontend are now running."
echo " Access Next.js on port 3000."
echo " Verify API logs with: docker compose logs -f api"
echo "==============================================="
