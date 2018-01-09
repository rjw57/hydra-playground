import logging
from urllib.parse import urljoin

from django.http import (
    HttpResponseBadRequest, HttpResponseForbidden,
    HttpResponseRedirect
)
from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from requests_oauthlib import OAuth2Session
from oauthlib.oauth2 import BackendApplicationClient

LOG = logging.getLogger('ucamconsent')

CLIENT_ID = 'consent-app'
CLIENT_SECRET = 'consent-secret'

# OAuth2 token provider endpoints
PROVIDER_BASE_URL = 'https://hydra:4444/'
TOKEN_URL = urljoin(PROVIDER_BASE_URL, 'oauth2/token')
CONSENT_REQUESTS_URL = urljoin(PROVIDER_BASE_URL, 'oauth2/consent/requests/')
CLIENTS_URL = urljoin(PROVIDER_BASE_URL, 'clients/')

# Scopes we request
SCOPES = ['hydra.consent', 'hydra.clients']

# Initialise OAuth2 client
client = OAuth2Session(
    client=BackendApplicationClient(client_id=CLIENT_ID))
client_token = client.fetch_token(
    token_url=TOKEN_URL, client_id=CLIENT_ID,
    auto_refresh_url=TOKEN_URL,
    client_secret=CLIENT_SECRET,
    scope=SCOPES, verify=False)

LOG.warning('Client token: %r', client_token)


@login_required
def consent(request):
    if request.user.is_anonymous:
        return HttpResponseForbidden('No auth')

    LOG.warning('Logged in as: %r', request.user)

    consent = request.GET.get('consent')
    if consent is None:
        return HttpResponseBadRequest('no consent provided')

    # Get consent info from hydra
    r = client.get(urljoin(CONSENT_REQUESTS_URL, consent))
    r.raise_for_status()
    consent_request = r.json()
    LOG.warning('request: %r', consent_request)

    # Get client info from hydra
    r = client.get(urljoin(CLIENTS_URL, consent_request['clientId']))
    r.raise_for_status()
    client_info = r.json()
    LOG.warning('client: %r', client_info)

    grant_scopes = consent_request['requestedScopes']
    return resolve_consent_request(
        request, consent_request=consent_request, accept=True,
        grant_scopes=grant_scopes)


def resolve_consent_request(request, consent_request, accept, grant_scopes):
    redirect_url = consent_request['redirectUrl']
    consent_id = consent_request['id']
    id_extra = {}
    subject = 'subject:cam.ac.uk:{}'.format(request.user.username)

    # Are "profile" or "email" scopes requested?
    if 'email' in grant_scopes:
        id_extra.update({
            'email': '{}@cam.ac.uk'.format(request.user.username),
            'email_verified': True,
        })

    if 'profile' in grant_scopes:
        id_extra.update({
            'name': request.user.get_full_name(),
        })

    if accept:
        r = client.patch(
            urljoin(CONSENT_REQUESTS_URL, consent_id + '/accept'),
            json={
                'subject': subject, 'grantScopes': grant_scopes,
                'idTokenExtra': id_extra
            }
        )
    else:
        r = client.patch(
            urljoin(CONSENT_REQUESTS_URL, consent_id + '/reject'),
            json={'reason': 'user rejected request'}
        )
    r.raise_for_status()

    return HttpResponseRedirect(redirect_url)
#    context = {
#        'consent_request': consent_request,
#        'grant_scopes': grant_scopes,
#        'accept': accept,
#    }
#
#    return render(request, 'ucamconsent/consent.html', context)
