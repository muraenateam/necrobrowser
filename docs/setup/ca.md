---
layout: default
title: Local certificates
permalink: /setup/ca
parent: Setup
nav_order: 1
---

# Local certificates with `mkcert`

Use this only for local development or controlled test fixtures. Do not reuse development keys in production and do not trust a generated CA on machines outside your test boundary.

## Install `mkcert`

Follow the [official installation guide](https://mkcert.dev/). On Linux x64, one example is:

```bash
curl -JLO "https://dl.filippo.io/mkcert/latest?for=linux/amd64"
chmod +x mkcert-v*-linux-amd64
sudo mv mkcert-v*-linux-amd64 /usr/local/bin/mkcert
```

## Create local CA and certificate

```bash
mkdir -p ~/tools/muraena/config
cd ~/tools/muraena/config

mkcert -install
cp "$(mkcert -CAROOT)/rootCA.pem" fullchain.pem
mkcert phishing.click '*.phishing.click'
mv phishing.click+1-key.pem privkey.pem
mv phishing.click+1.pem cert.pem
```

Keep `privkey.pem`, `rootCA.pem`, and generated certificates private. Configure the consuming local service with paths expected by that service. Necrobrowser itself does not automatically configure TLS termination; place HTTPS behind a local reverse proxy or fixture server when required.
