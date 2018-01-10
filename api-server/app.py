import logging

from flask import Flask, abort, request, jsonify
from flask_cors import cross_origin
from requests_oauthlib import OAuth2Session
from oauthlib.oauth2 import BackendApplicationClient

LOG = logging.getLogger('apiserver')
logging.basicConfig(level=logging.DEBUG)

CLIENT_ID = 'api-server'
CLIENT_SECRET = 'api-secret'

# OAuth2 token provider endpoints
PROVIDER_BASE_URL = 'https://hydra:4444/oauth2/'
TOKEN_URL = PROVIDER_BASE_URL + 'token'
INTROSPECT_URL = PROVIDER_BASE_URL + 'introspect'
REFRESH_URL = TOKEN_URL

# Scopes we request
SCOPES = ['hydra.introspect']

app = Flask(__name__)


def get_session():
    LOG.info('Fetching initial token')
    client = BackendApplicationClient(client_id=CLIENT_ID)
    session = OAuth2Session(client=client)
    access_token = session.fetch_token(
        timeout=1, token_url=TOKEN_URL,
        client_id=CLIENT_ID,
        client_secret=CLIENT_SECRET,
        scope=SCOPES,
        verify=False)
    LOG.info('Got access token: %r', access_token)

    return session


@app.route('/')
@cross_origin()
def index():
    # In production, this would be cached.
    client = get_session()

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
