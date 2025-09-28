#!/bin/sh
set -e

mkdir -p data
flask --app app init-db

exec gunicorn --bind 0.0.0.0:5000 --workers "${GUNICORN_WORKERS:-4}" app:app
