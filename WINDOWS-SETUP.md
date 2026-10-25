# Deploy Dhaari on DRUNIX (Windows)

DRUNIX's test network runs on Linux, so on Windows it runs inside WSL (Ubuntu) with Docker Desktop. Total time: about 30–45 minutes the first time, mostly downloads and builds.

## 1. Install WSL with Ubuntu (one time, needs admin, then a restart)

Open **PowerShell as Administrator** and run:

```powershell
wsl --install -d Ubuntu
```

Restart Windows when asked. After the restart, Ubuntu opens and asks you to create a Linux username and password.

## 2. Install Docker Desktop (one time)

1. Download and install Docker Desktop from docker.com.
2. Open Docker Desktop → **Settings → General**: make sure "Use the WSL 2 based engine" is on.
3. **Settings → Resources → WSL integration**: turn on **Ubuntu**. Click **Apply & restart**.

## 3. Install the build tools inside Ubuntu (one time)

Open the **Ubuntu** app and paste:

```bash
sudo apt update && sudo apt install -y git jq make build-essential curl
curl -LO https://go.dev/dl/go1.26.1.linux-amd64.tar.gz
sudo rm -rf /usr/local/go && sudo tar -C /usr/local -xzf go1.26.1.linux-amd64.tar.gz
echo 'export PATH=/usr/local/go/bin:$HOME/go/bin:$PATH' >> ~/.bashrc && source ~/.bashrc
go version
```

`go version` should print go1.26.1 or newer.

## 4. Deploy (every time)

Still in Ubuntu:

```bash
cd /mnt/c/Users/rajva/Downloads/workspace-01a171d8-d503-7be6-b064-2a5838e0156f/dhaari-prototype
bash scripts/deploy-drunix.sh
```

The script checks your tools, builds DRUNIX, gets its images, starts the network (2 organisations, channel `mychannel`), deploys the `dhaari` chaincode, then issues and verifies a credential on the ledger. The last lines should show the query result `VALID`.

## If something fails

- **"Docker is not reachable"**: start Docker Desktop and check WSL integration for Ubuntu (step 2).
- **A step fails partway**: run the script again; it is safe to re-run.
- **Stop the network**: `cd ~/drunix/drunix-network/test-network && ./network.sh down`
