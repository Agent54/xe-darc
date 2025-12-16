#!/bin/bash
# Generate Ed25519 signing key for IWA bundles
# This key is used to sign .swbn files and determines your app's Web Bundle ID

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

KEY_FILE="iwa_signing_key.pem"

if [ -f "$KEY_FILE" ]; then
    echo "Warning: Key file already exists. Delete it first if you want to regenerate."
    echo "  $KEY_FILE"
    exit 1
fi

echo "Generating Ed25519 signing key for IWA..."

openssl genpkey -algorithm Ed25519 -out "$KEY_FILE"

echo "Key generated: $KEY_FILE"
echo ""
echo "IMPORTANT: This is your IWA identity. Keep this key safe!"
echo "  - The Web Bundle ID is derived from this key"
echo "  - Losing this key means you cannot update your IWA"
echo "  - Compromising this key allows malicious updates"
echo ""
echo "For CI/CD: Store this key as a secret and write to ./certs/iwa_signing_key.pem"
echo ""
echo "Next steps:"
echo "  1. Run 'pnpm build:swbn' to create a signed bundle"
echo "  2. The Web Bundle ID will be printed during build"
