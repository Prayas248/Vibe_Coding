#!/bin/bash

echo "🚀 Starting Acquisition App in Development Mode"
echo "================================================"

if [ ! -f .env.development ]; then
    echo "❌ Error: .env.development file not found!"
    exit 1
fi

if ! docker info >/dev/null 2>&1; then
    echo "❌ Error: Docker is not running!"
    exit 1
fi

echo "📦 Building and starting development containers..."
docker compose -f docker-compose.dev.yml up --build -d

echo "⏳ Waiting for PostgreSQL to be ready..."

# Loop until postgres is ready
while true; do
  docker compose -f docker-compose.dev.yml exec -T postgres \
    pg_isready -U postgres >/dev/null 2>&1

  if [ $? -eq 0 ]; then
    break
  fi

  sleep 2
done

echo "🎉 PostgreSQL is ready!"
echo "Application: http://localhost:3000"
echo "Database: postgres://postgres:password@localhost:5432/postgres"
