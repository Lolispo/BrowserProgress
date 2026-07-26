#!/usr/bin/env bash
# Stage the deployable static site into dist/ for the CI deploy workflow.
#
# BrowserProgress is a no-build, root-served static site (index.html plus JS/CSS
# and lib/ data/ images/ at the repo root). This mirrors what the local
# scripts/deploy.sh did — publish the repo root minus VCS/tooling/docs — into a
# clean dist/ so the shared reusable deploy workflow (which syncs dist-dir raw
# with --delete) can upload it as-is.
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf dist
mkdir -p dist
rsync -a \
  --exclude '.git' --exclude '.github' \
  --exclude '.omc' --exclude '.gstack' --exclude '.claude' --exclude '.superpowers' --exclude '.DS_Store' \
  --exclude 'node_modules' --exclude 'dist' \
  --exclude 'scripts' --exclude 'docs' \
  --exclude '.gitignore' \
  --exclude 'package.json' --exclude 'package-lock.json' \
  --exclude 'README.md' --exclude 'TODO.md' \
  ./ dist/

echo "staged $(find dist -type f | wc -l | tr -d ' ') files into dist/"
