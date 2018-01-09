#!/usr/bin/env bash
set -x

docker-compose run --rm -p 9010:4445 hydra-client token user --skip-tls-verify \
	--auth-url https://localhost:9000/oauth2/auth \
	--token-url https://hydra:4444/oauth2/token \
	--id some-consumer \
	--secret consumer-secret \
	--scopes openid,offline,hydra.clients \
	--redirect http://localhost:9010/callback
