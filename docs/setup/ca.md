



## Installing mkcert

The first step is to install `mkcert` on your system. `mkcert` is a simple tool that allows you to create a local CA and 
generate locally-trusted certificates. This is useful for development and testing purposes, as it allows you to create 
SSL certificates that are trusted by your browser, without having to pay for a certificate from a public CA.

To install `mkcert`, follow the instructions on the [official website](https://mkcert.dev/). 
The installation process is straightforward and should only take a few minutes.


```bash
curl -JLO "https://dl.filippo.io/mkcert/latest?for=linux/amd64"
chmod +x mkcert-v*-linux-amd64
sudo mv mkcert-v*-linux-amd64 /usr/local/bin/mkcert
```

Once `mkcert` is installed, you can use it to create a local CA and generate locally-trusted certificates.

```bash
mkdir -p ~/tools/muraena/config 
cd ~/tools/muraena/config

mkcert -install
cp `mkcert -CAROOT`/rootCA.pem fullchain.pem

mkcert phishing.click *.phishing.click
mv phishing.click+1-key.pem privkey.pem
mv phishing.click+1.pem cert.pem
```