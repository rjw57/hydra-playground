var ClientOAuth2 = require('client-oauth2');

window.App = {
  indexLoaded: () => {
    const state = 'some-nonce-which-really-should-be-random-' + Math.random();
    const auth = new ClientOAuth2({
      clientId: 'some-consumer',
      authorizationUri: 'https://localhost:9000/oauth2/auth',
      redirectUri: 'http://localhost:9030/callback.html',
      scopes: ['profile', 'email', 'https://automation.cam.ac.uk/funky-api'],
      state: state,
    });
    console.log('auth:', auth);
    const userInfoUri = 'https://localhost:9000/userinfo';
    const apiExampleUri = 'http://localhost:9040/';

    function showMessage(message) {
      document.getElementById('messages').textContent = message;
    }

    function logout() {
      const nonce = 'another-nonce-which-really-should-be-random-'
        + Math.random();
      const redirect_url = new URL(
        'http://localhost:9030/loggedout.html?nonce='
        + encodeURIComponent(nonce));
      const eventListener = event => {
        if(event.data.type === 'logout') {
          const info = event.data.info;
          event.source.close();
          if(info.pathname === redirect_url.pathname
             && info.search === redirect_url.search) {
            console.log('Logout succeeded');
            showMessage('You were successfully logged out.');
          }
          window.removeEventListener('message', eventListener);
        }
      };
      window.addEventListener('message', eventListener, true);

      openAuthWindow('http://localhost:9020/logout?redirect_url='
        + encodeURIComponent(redirect_url.toString()));
      document.body.classList.remove('user-logged-in');
      document.body.classList.add('user-logged-out');
    }

    function login() {
      const token = new Promise((resolve, reject) => {
        const eventListener = event => {
          if(event.data.type === 'oauthCallback') {
            event.source.close();
            auth.token.getToken(event.source.location)
              .then(resolve).catch(reject);
            window.removeEventListener('message', eventListener);
          }
        };
        window.addEventListener('message', eventListener, true);
      });

      token.catch(reason => {
        showMessage('Fetching token failed: ' + JSON.stringify(reason));
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

      openAuthWindow(auth.token.getUri());
    }

    function openAuthWindow(url) {
      const w = 450, h = 600;
      let left = window.screenX + 0.5 * window.outerWidth - 0.5 * w;
      let top = window.screenY + 0.5 * window.outerHeight - 0.5 * h;
      let features = 'left=' + left + ',top=' + top + ',width=' + w + ',height=' + h;
      window.open(url, 'AuthWindow-' + Math.random(), features);
    }

    document.getElementById('login').addEventListener('click', () => {login();});
    document.getElementById('logout').addEventListener('click', () => {logout();});
    login();
  },

  callbackLoaded: () => {
    window.opener.postMessage({
      type: 'oauthCallback',
      info: {
        pathname: location.pathname, search: location.search, hash: location.hash,
      },
    }, '*');
  },

  loggedoutLoaded: () => {
    window.opener.postMessage({
      type: 'logout',
      info: {
        pathname: location.pathname, search: location.search,
      },
    }, '*');
  },
};
