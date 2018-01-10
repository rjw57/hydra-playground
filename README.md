# Hydra playground

This is my little experiment playing with [Hydra](https://github.com/ory/hydra),
the OAuth2 token server.

Bring infrastructure up with `./start.sh` and visit http://localhost:9030/. You
will get SSL errors when trying to log in. That is because OAuth2 providers must
be served over HTTPS.

Tear everything down with `./kill.sh`

Services running:

* Hydra: https://localhost:9000
* Consent app: http://localhost:9020
* Consumer app: http://localhost:9030
* API: http://localhost:9040
