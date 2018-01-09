from flask import Flask, abort, request, jsonify
from flask_cors import CORS
import requests
from requests.auth import HTTPBasicAuth

API_CLIENT_ID = 'api-server'
API_CLIENT_SECRET = 'api-secret'

# In production, the client should really just get a token from Hydra using the
# usual client credentials flow. Basic Auth does work too though.
AUTH = HTTPBasicAuth(API_CLIENT_ID, API_CLIENT_SECRET)

# Hydra introspection endpoint
INTROSPECT_URL = 'https://hydra:4444/oauth2/introspect'

app = Flask(__name__)
CORS(app)

@app.route('/')
def index():
    authorization = request.headers.get('Authorization', '')
    if not authorization.startswith('Bearer '):
        abort(403)

    token = authorization.split()[1]

    r = requests.post(INTROSPECT_URL, auth=AUTH, verify=False,
                      data={'token': token})
    r.raise_for_status()
    token_info = r.json()

    # user must be "active"
    if not token_info.get('active', False):
        abort(403)

    # extract client id, scopes and user URN. The client id represents the
    # client application making the request to the API. The user URN represents
    # the user this application is acting on behalf of and the scopes are those
    # granted to the application by the user.
    client_id = token_info.get('client_id', '')
    user_urn = token_info.get('sub', '')
    scopes = token_info.get('scope', '').split()

    # A real application would make some decision here...

    return jsonify({
        'clientId': client_id, 'user': user_urn, 'scopes': scopes,
    })
