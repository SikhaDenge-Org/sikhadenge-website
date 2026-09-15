#!/usr/bin/env bash
set -Eeuo pipefail
# Marker script only. Its path intentionally matches the guarded production
# workflow trigger; the production batch deploys the exact branch HEAD.
echo "Inbox V22 root-grid production trigger"
