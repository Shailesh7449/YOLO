#!/usr/bin/env bash
set -e

if [ -z "$1" ]; then
  echo "=========================================================="
  echo " VisionSense GitHub Push Helper"
  echo "=========================================================="
  echo "Usage: ./push_to_github.sh <GITHUB_REPO_URL>"
  echo ""
  echo "Examples:"
  echo "  HTTPS: ./push_to_github.sh https://github.com/USERNAME/NEW-REPO.git"
  echo "  SSH:   ./push_to_github.sh git@github.com:USERNAME/NEW-REPO.git"
  echo "=========================================================="
  exit 1
fi

REPO_URL="$1"

# Remove existing remote if already set
git remote remove origin 2>/dev/null || true

# Add new origin
git remote add origin "$REPO_URL"
git branch -M main

echo "Pushing to $REPO_URL on branch main..."
git push -u origin main

echo ""
echo "=========================================================="
echo "Successfully pushed VisionSense to GitHub!"
echo "Repository: $REPO_URL"
echo "=========================================================="
