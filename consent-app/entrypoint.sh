#!/usr/bin/env bash
python ./manage.py migrate
exec python ./manage.py $@
