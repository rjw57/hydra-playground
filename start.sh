#!/usr/bin/env bash
set -xe

source secrets.env

# Bring up services in the right order, database first, then hydra and then the
# various web apps. We need to wait for apps to be available before starting
# because our noddy OAuth clients try to get a token when they first start.

# Start and wait for database
docker-compose up -d db
while ! PGPASSWORD="secret" psql -h localhost -p 9432 -c 'SELECT 1;' hydra hydra; do
	sleep 1
done

# Start database migration
docker-compose run hydra migrate sql postgres://hydra:secret@db:5432/hydra?sslmode=disable

# Launch Hydra and wait for status to be ok
docker-compose up -d hydra
while ! curl -k https://localhost:9000/health/status; do sleep 0.5; done

function hydra() {
	docker run --rm -it \
		-e CLUSTER_URL=https://localhost:9000 \
		-e CLIENT_ID \
		-e CLIENT_SECRET \
		--network host \
		oryd/hydra:v0.10.10 \
		$@
}

export CLIENT_ID=${ROOT_CLIENT_ID}
export CLIENT_SECRET=${ROOT_CLIENT_SECRET}

hydra clients delete --skip-tls-verify ${CONSENT_CLIENT_ID} || true
hydra clients delete --skip-tls-verify ${CONSUMER_CLIENT_ID} || true
hydra clients delete --skip-tls-verify ${API_CLIENT_ID} || true

hydra clients create --skip-tls-verify \
	--id ${CONSENT_CLIENT_ID} --secret ${CONSENT_CLIENT_SECRET} \
	--name "Consent App Client" \
	--grant-types client_credentials \
	--response-types token \
	--allowed-scopes hydra.consent,hydra.clients
hydra policies create --skip-tls-verify \
	--actions get,accept,reject \
	--description "Allow consent-app to manage OAuth2 consent requests." \
	--allow \
	--id consent-app-policy \
	--resources "rn:hydra:oauth2:consent:requests:<.*>" \
	--subjects ${CONSENT_CLIENT_ID}
hydra policies create --skip-tls-verify \
	--actions get \
	--description "Allow consent-app to see clients." \
	--allow \
	--id consent-app-clients-policy \
	--resources "rn:hydra:clients:<.*>" \
	--subjects ${CONSENT_CLIENT_ID}

hydra policies create --skip-tls-verify \
	--actions introspect \
	--description "Allow everyone to read the OpenID Connect ID Token public key" \
	--allow \
	--id introspect-token-policy \
	--resources rn:hydra:oauth2:tokens \
	--subjects "<.*>"

hydra clients create --skip-tls-verify \
	--id ${CONSUMER_CLIENT_ID} --secret ${CONSUMER_CLIENT_SECRET} \
	--name "SampleFrontendApplication" \
	--grant-types authorization_code,implicit \
	--response-types code,token \
	--allowed-scopes https://automation.cam.ac.uk/funky-api,profile,email,openid \
	--callbacks http://localhost:9010/callback,http://localhost:9030/callback.html

hydra clients create --skip-tls-verify \
	--id ${API_CLIENT_ID} --secret ${API_CLIENT_SECRET} \
	--name "Api Client" \
	--grant-types client_credentials \
	--response-types token \
	--allowed-scopes hydra.introspect

export CLIENT_ID=${ROOT_CLIENT_ID}
export CLIENT_SECRET=${ROOT_CLIENT_SECRET}
hydra token client --skip-tls-verify

export CLIENT_ID=${API_CLIENT_ID}
export CLIENT_SECRET=${API_CLIENT_SECRET}
hydra token client --skip-tls-verify --scopes hydra.introspect

# Launch rest of infrastructure now we have clients, etc
docker-compose up --build -d
