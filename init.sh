#!/usr/bin/env bash
set -x

source secrets.env

function hydra() {
	docker run --rm -it \
		-e CLUSTER_URL=https://localhost:9000 \
		-e CLIENT_ID \
		-e CLIENT_SECRET \
		--network host \
		oryd/hydra:v0.10.10 \
		$@
	#docker-compose run --rm hydra-client $@
}

export CLIENT_ID=${ROOT_CLIENT_ID}
export CLIENT_SECRET=${ROOT_CLIENT_SECRET}

hydra clients create --skip-tls-verify \
	--id ${CONSENT_CLIENT_ID} --secret ${CONSENT_CLIENT_SECRET} \
	--name "Consent App Client" \
	--grant-types client_credentials \
	--response-types token \
	--allowed-scopes hydra.consent
hydra policies create --skip-tls-verify \
	--actions get,accept,reject \
	--description "Allow consent-app to manage OAuth2 consent requests." \
	--allow \
	--id consent-app-policy \
	--resources "rn:hydra:oauth2:consent:requests:<.*>" \
	--subjects ${CONSENT_CLIENT_ID}

hydra clients create --skip-tls-verify \
	--id ${CONSUMER_CLIENT_ID} --secret ${CONSUMER_CLIENT_SECRET} \
	--name "Consumer Client" \
	--grant-types authorization_code,refresh_token,client_credentials,implicit \
	--response-types token,code,id_token \
	--allowed-scopes openid,offline,hydra.clients \
	--callbacks http://localhost:9010/callback,http://localhost:9030/callback.html
hydra policies create --skip-tls-verify \
	--actions introspect \
	--description "Allow everyone to read the OpenID Connect ID Token public key" \
	--allow \
	--id introspect-token-policy \
	--resources rn:hydra:oauth2:tokens \
	--subjects "<.*>"

hydra clients create --skip-tls-verify \
	--id ${API_CLIENT_ID} --secret ${API_CLIENT_SECRET} \
	--name "Api Client" \
	--grant-types client_credentials \
	--response-types token \
	--allowed-scopes openid,offline,hydra.clients,hydra.introspect \
	--callbacks http://localhost:9010/callback,http://localhost:9030/callback.html

export CLIENT_ID=${ROOT_CLIENT_ID}
export CLIENT_SECRET=${ROOT_CLIENT_SECRET}

hydra token client --skip-tls-verify
