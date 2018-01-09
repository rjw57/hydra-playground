var ClientOAuth2 = require('client-oauth2');

window.App = {
  indexLoaded: () => {
    const state = 'some-nonce-which-really-should-be-random-' + Math.random();
    const auth = new ClientOAuth2({
      clientId: 'some-consumer',
      authorizationUri: 'https://localhost:9000/oauth2/auth',
      redirectUri: 'http://localhost:9030/callback.html',
      scopes: ['openid', 'hydra.clients', 'profile', 'offline'],
      state: state,
    });
    console.log('auth:', auth);
    const userInfoUri = 'https://localhost:9000/userinfo';
    const apiExampleUri = 'http://localhost:9040/';

    function login() {
      const token = new Promise((resolve, reject) => {
        window.addEventListener('message', event => {
          if(event.data.type === 'oauthCallback') {
            event.source.close();
            auth.token.getToken(event.source.location)
              .then(resolve).catch(reject);
          }
        }, false);
      });

      token.then(token => {
        document.body.classList.remove('user-logged-out');
        document.body.classList.add('user-logged-in');
      });

      token.then(token => {
        document.getElementById('token').textContent = token.accessToken;
      });

      token.then(token => {
        console.log('token:', token);
      });

      token
        .then(token => fetch(
          userInfoUri, token.sign({url: userInfoUri, mode: 'cors'})))
        .then(response => response.json())
        .then(response => {
          console.log(response);
          document.getElementById('user-info').textContent =
            JSON.stringify(response);
        })
        .catch(console.error);

      token
        .then(token => fetch(
          apiExampleUri, token.sign({url: apiExampleUri, mode: 'cors'})))
        .then(response => response.json())
        .then(response => {
          console.log(response);
          document.getElementById('my-client-id').textContent = response.clientId;
          document.getElementById('my-user').textContent = response.user;
          document.getElementById('my-scopes').textContent = response.scopes.join(', ');
        })
        .catch(console.error);

      window.open(
        auth.token.getUri(), 'OAuthImplicitGrant',
        'width=450,height=800'
      );
    }

    document.getElementById('login').addEventListener('click', () => {login();});
    login();
  },

  callbackLoaded: () => {
    window.opener.postMessage({
      type: 'oauthCallback',
      info: {
        pathname: location.pathname, query: location.query, hash: location.hash,
      },
    }, '*');
  },
};
