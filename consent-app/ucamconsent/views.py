import logging
from urllib.parse import urljoin

from django.contrib.auth import logout as logout_request
from django.http import (
    HttpResponseBadRequest, HttpResponseForbidden,
    HttpResponseRedirect, HttpResponseNotAllowed
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

# Scope descriptions
SCOPE_DESCS = {
    'offline': 'Offline access to your account',
    'profile': 'Your name',
    'email': 'Your email address',
}


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


@login_required
def consent(request):
    if request.user.is_anonymous:
        return HttpResponseForbidden('No auth')

    LOG.info('Logged in as: %r', request.user)

    # In production, this would be cached.
    client = get_session()

    consent = request.GET.get('consent')
    if consent is None:
        return HttpResponseBadRequest('no consent provided')

    # Get consent info from hydra
    r = client.get(urljoin(CONSENT_REQUESTS_URL, consent))
    r.raise_for_status()
    consent_request = r.json()
    LOG.info('request: %r', consent_request)

    # Get client info from hydra
    r = client.get(urljoin(CLIENTS_URL, consent_request['clientId']))
    r.raise_for_status()
    client_info = r.json()
    LOG.info('client: %r', client_info)

    requested_scopes = [
        {'scope': scope, 'description': SCOPE_DESCS.get(scope, scope)}
        for scope in consent_request.get('requestedScopes', [])
    ]

    context = {
        'consent_request': consent_request, 'client': client_info,
        'requested_scopes': requested_scopes,
    }
    return render(request, 'ucamconsent/consent.html', context)


@login_required
def decide(request):
    if request.method != 'POST':
        return HttpResponseNotAllowed(['POST'])

    if request.user.is_anonymous:
        return HttpResponseForbidden('No auth')

    LOG.info('Logged in as: %r', request.user)

    # In production, this would be cached.
    client = get_session()

    consent = request.POST.get('consent')
    if consent is None:
        return HttpResponseBadRequest('no consent provided')

    # Get consent info from hydra
    r = client.get(urljoin(CONSENT_REQUESTS_URL, consent))
    r.raise_for_status()
    consent_request = r.json()
    LOG.info('request: %r', consent_request)

    LOG.info('POST data: %r', request.POST)

    # Granted scopes are intersection of the scopes we got from the POST and the scopes which were
    # actually requested.
    requested_scopes = set(consent_request.get('requestedScopes', []))
    granted_scopes = set(request.POST.getlist('granted_scopes'))
    LOG.info('requested scopes: %r', requested_scopes)
    LOG.info('granted scopes: %r', granted_scopes)

    granted_scopes &= requested_scopes
    LOG.info('final list of granted scopes: %r', granted_scopes)

    return resolve_consent_request(
        request, consent_request=consent_request,
        accept=request.POST.get('decision') == 'Accept',
        grant_scopes=list(granted_scopes))


def resolve_consent_request(request, consent_request, accept, grant_scopes):
    # In production, this would be cached.
    client = get_session()

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
            # If we had lookup integration, we'd use it but I want the server to not depend on
            # CUDN.
            'name': '{0}y Mc{0}face'.format(request.user.username),
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


@login_required
def logout(request):
    logout_request(request)
    redirect_url = request.GET.get('redirect_url')
    if redirect_url is not None:
        return HttpResponseRedirect(redirect_url)
    return render(request, 'ucamconsent/logout.html')
