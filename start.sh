#!/bin/sh
# Builds FraiTube and opens it.
cd "$(dirname "$0")" || exit 1
exec pnpm start
