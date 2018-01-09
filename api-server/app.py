from flask import Flask, abort, request, jsonify
from flask_cors import cross_origin
from requests_oauthlib import OAuth2Session
from oauthlib.oauth2 import BackendApplicationClient

API_CLIENT_ID = 'api-server'
API_CLIENT_SECRET = 'api-secret'

# OAuth2 token provider endpoints
PROVIDER_BASE_URL = 'https://hydra:4444/oauth2/'
TOKEN_URL = PROVIDER_BASE_URL + 'token'
INTROSPECT_URL = PROVIDER_BASE_URL + 'introspect'
REFRESH_URL = TOKEN_URL

# Scopes we request
SCOPES = ['offline', 'hydra.introspect']

app = Flask(__name__)

# Initialise OAuth2 client
client = OAuth2Session(
    client=BackendApplicationClient(client_id=API_CLIENT_ID))
client.fetch_token(token_url=TOKEN_URL, client_id=API_CLIENT_ID,
                   client_secret=API_CLIENT_SECRET,
                   auto_refresh_url=TOKEN_URL,
                   scope=SCOPES, verify=False),


@app.route('/')
@cross_origin()
def index():
    authorization = request.headers.get('Authorization', '')
    if not authorization.startswith('Bearer '):
        abort(403)

    token = authorization.split()[1]

    r = client.post(INTROSPECT_URL, data={'token': token})
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
        'tokenInfo': token_info,
    })
