#!/bin/bash

# Script to run tests in Docker container
# This script builds and runs the test Docker container

set -e  # Exit on any error

echo "Building test Docker image..."
docker build -f Dockerfile.tests -t auth-tests .

echo "Running tests in Docker container..."
docker run --rm auth-tests

echo "Tests completed!"