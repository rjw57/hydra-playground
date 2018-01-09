#!/usr/bin/env bash
set -x

docker-compose run hydra migrate sql postgres://hydra:secret@db:5432/hydra?sslmode=disable
docker-compose up -d
