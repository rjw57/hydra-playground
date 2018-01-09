#!/bin/bash
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
    CREATE USER consent WITH PASSWORD 'dbPassword';
    CREATE DATABASE consent;
    GRANT ALL PRIVILEGES ON DATABASE consent TO consent;
EOSQL
