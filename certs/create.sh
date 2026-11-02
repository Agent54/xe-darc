#!/usr/bin/env bash

set -e

# openssl req -x509 -newkey rsa:2048 -nodes -subj '/CN=localhost' \
#   -keyout private-key.pem -out certificate.pem -config v3.ext
# security add-trusted-cert -d -r trustRoot -k ~/Library/Keychains/login.keychain-db ./certificate.pem

# if [ -z "$1" ]
# then
#   echo "Please supply a subdomain to create a certificate for";
#   echo "e.g. www.mysite.com"
#   exit;
# fi

if [ ! -f rootCA.pem ]; then
  openssl genrsa -out rootCA.key 2048
  openssl req -x509 -new -nodes -key rootCA.key -sha256 -days 1024 -out rootCA.pem \
    -subj "/CN=Darc local development root CA"
fi

# Create a new private key if one doesnt exist, or use the xeisting one if it does
if [ -f device.key ]; then
  KEY_OPT="-key"
else
  KEY_OPT="-keyout"
fi

DOMAIN=localhost
ROUTED_DOMAIN=darc_darc.localhost
#$1
COMMON_NAME=localhost
#${2:-*.$1}
SUBJECT="/C=CA/ST=None/L=NB/O=None/CN=$COMMON_NAME"
NUM_OF_DAYS=825
openssl req -new -newkey rsa:2048 -sha256 -nodes $KEY_OPT device.key -subj "$SUBJECT" -out device.csr
EXT_FILE="$(mktemp "${TMPDIR:-/tmp}/darc-v3.XXXXXX")"
trap 'rm -f "$EXT_FILE" device.crt' EXIT
sed -e "s/%%DOMAIN%%/$COMMON_NAME/g" -e "s/%%ROUTED_DOMAIN%%/$ROUTED_DOMAIN/g" v3.ext > "$EXT_FILE"
openssl x509 -req -in device.csr -CA rootCA.pem -CAkey rootCA.key -CAcreateserial -out device.crt -days $NUM_OF_DAYS -sha256 -extfile "$EXT_FILE"

# move output files to final filenames
mv device.csr "$DOMAIN.csr"
cp device.crt "$DOMAIN.crt"

# remove temp file
rm -f device.crt
rm -f "$EXT_FILE"
trap - EXIT

echo 
echo "###########################################################################"
echo Done! 
echo "###########################################################################"
echo "To use these files on your server, simply copy both $DOMAIN.csr and"
echo "device.key to your webserver, and use like so (if Apache, for example)"
echo 
echo "    SSLCertificateFile    /path_to_your_files/$DOMAIN.crt"
echo "    SSLCertificateKeyFile /path_to_your_files/device.key"
echo "The certificate is valid for $DOMAIN and $ROUTED_DOMAIN."
echo "Trust rootCA.pem once so regenerated server certificates remain trusted."
