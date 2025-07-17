#!/bin/bash

# Test runner script for serve_photo_image refactor
# This script runs tests from the main photos directory

echo "=== Running serve_photo_image Tests ==="

# Change to test directory and run tests
cd test && ./run_tests.sh

echo "=== Tests Complete ==="