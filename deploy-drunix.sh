#!/usr/bin/env bash
# Deploy Dhaari's chaincode to the DRUNIX test network and run one end-to-end check.
# Run inside WSL Ubuntu (Docker Desktop with WSL integration turned on), from the dhaari-prototype folder:
#   bash scripts/deploy-drunix.sh
# Re-running is safe: it reuses the DRUNIX checkout and brings the network down and up again.
set -euo pipefail

DHAARI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DRUNIX_DIR="${DRUNIX_DIR:-$HOME/drunix}"
BUILD_DIR="$HOME/dhaari-cc-build"
GO_MIN="1.26"

step() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*"; exit 1; }

step "1/7 Checking tools"
for t in git docker jq make go; do command -v "$t" >/dev/null || fail "$t is not installed. See scripts/WINDOWS-SETUP.md."; done
docker info >/dev/null 2>&1 || fail "Docker is not reachable. Start Docker Desktop and turn on WSL integration for Ubuntu."
GO_HAVE="$(go env GOVERSION | sed 's/^go//')"
printf '%s\n%s\n' "$GO_MIN" "$GO_HAVE" | sort -V -C || fail "Go $GO_HAVE found; DRUNIX needs Go $GO_MIN or newer."
echo "git, docker, jq, make and Go $GO_HAVE are ready."

step "2/7 Getting DRUNIX source"
if [ -d "$DRUNIX_DIR/.git" ]; then echo "Using existing checkout at $DRUNIX_DIR"
else git clone --depth 1 https://github.com/npci/drunix.git "$DRUNIX_DIR"; fi

step "3/7 Building DRUNIX tools (first run takes several minutes)"
cd "$DRUNIX_DIR"
make peer orderer configtxgen configtxlator osnadmin cryptogen discover ledgerutil
export PATH="$DRUNIX_DIR/build/bin:$PATH"
peer version | head -3

step "4/7 Getting DRUNIX images (pull if published, otherwise build locally)"
# Not using ./network.sh prereq: it installs vanilla Fabric binaries, which would clash with DRUNIX's.
ensure_image() { # name tag
  local ref="npcioss/drunix-$1:$2"
  if docker image inspect "$ref" >/dev/null 2>&1; then echo "have $ref"; return; fi
  if docker pull "$ref" >/dev/null 2>&1; then echo "pulled $ref"; return; fi
  echo "building $ref locally"
  (cd "$DRUNIX_DIR" && make "$1-docker")
  docker tag "npcioss/drunix-$1:latest" "$ref"
}
for img in peer orderer vscc; do ensure_image "$img" 1.0.0; done
for img in baseos ccenv; do ensure_image "$img" 1.0; done
cd "$DRUNIX_DIR/drunix-network/test-network"

step "5/7 Preparing Dhaari chaincode"
rm -rf "$BUILD_DIR" && mkdir -p "$BUILD_DIR"
cp -r "$DHAARI_DIR/chaincode/dhaari/core" "$BUILD_DIR/core"
rm -f "$BUILD_DIR/core/"*_test.go
cp "$DHAARI_DIR/chaincode/dhaari/cmd/chaincode/main.go" "$BUILD_DIR/main.go"
cat > "$BUILD_DIR/go.mod" <<EOF
module github.com/dhaari/chaincode

go $GO_MIN
EOF
(cd "$BUILD_DIR" && go get github.com/hyperledger/fabric-contract-api-go/v2@v2.2.0 && go mod tidy && go build -o /dev/null .)
echo "Chaincode builds."

step "6/7 Starting network, creating channel, deploying chaincode"
./network.sh down >/dev/null 2>&1 || true
./network.sh up createChannel
./network.sh deployCC -ccn dhaari -ccp "$BUILD_DIR" -ccl go

step "7/7 End-to-end check on the ledger"
HASH="$(printf 'Class 10 marks record' | sha256sum | cut -d' ' -f1)"
./network.sh cc invoke -org 1 -ccn dhaari -ccic "{\"Args\":[\"IssueCredential\",\"CRED-AP-0001\",\"STU-AP-02418\",\"$HASH\"]}"
sleep 3
./network.sh cc query -org 1 -ccn dhaari -ccqc "{\"Args\":[\"VerifyCredential\",\"CRED-AP-0001\",\"$HASH\"]}"

step "Done. Dhaari chaincode is running on the DRUNIX test network (channel: mychannel, chaincode: dhaari)."
echo "Stop it later with: cd $DRUNIX_DIR/drunix-network/test-network && ./network.sh down"
