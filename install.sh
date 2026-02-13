#!/bin/bash

REPO="realozk/ARKENAR"

OS=$(uname -s | tr '[:upper:]' '[:lower:]')
if [ "$OS" == "darwin" ]; then
    OS="macos"
fi

ARCH_RAW=$(uname -m)
if [ "$ARCH_RAW" == "x86_64" ]; then
    ARCH="amd64"
elif [ "$ARCH_RAW" == "arm64" ] || [ "$ARCH_RAW" == "aarch64" ]; then
    ARCH="arm64"
else
    echo "[!] Unsupported architecture: $ARCH_RAW"
    exit 1
fi

FILENAME="arkenar-$OS-$ARCH.tar.gz"
URL="https://github.com/$REPO/releases/latest/download/$FILENAME"

echo "[*] Detected: $OS on $ARCH_RAW"
echo "[*] Downloading $FILENAME..."

curl -L -o arkenar.tar.gz "$URL"

if [ $? -ne 0 ]; then
    echo "[!] Download failed. File not found: $FILENAME"
    echo "[!] Ensure you have released an ARM version on GitHub."
    exit 1
fi

echo "[*] Extracting..."
tar -xzf arkenar.tar.gz

echo "[*] Installing to /usr/local/bin..."
if [ -f "arkenar" ]; then
    sudo mv arkenar /usr/local/bin/arkenar
elif [ -f "ARKENAR" ]; then
    sudo mv ARKENAR /usr/local/bin/arkenar
else
    sudo mv arkenar* /usr/local/bin/arkenar 2>/dev/null
fi

sudo chmod +x /usr/local/bin/arkenar
rm arkenar.tar.gz

echo "Installation complete!"