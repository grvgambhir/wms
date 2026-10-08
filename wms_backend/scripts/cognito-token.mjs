/**
 * Get a Cognito access token for local testing, without the AWS CLI or an SDK.
 *
 *   npm run token -- <email> <password> [participant|admin]
 *
 * Cognito's InitiateAuth is a plain HTTPS POST, so this needs nothing installed.
 *
 * USER_PASSWORD_AUTH sends the password to Cognito over TLS. That is fine for local
 * testing and is NOT how the apps should authenticate: they use the authorization-code
 * flow with PKCE against the same public clients, so a password never transits their code.
 * Enable this flow on the app client for development, and be deliberate about leaving it
 * enabled in production.
 */
const [email, password, which = 'participant'] = process.argv.slice(2);
if (!email || !password) {
  console.error('usage: npm run token -- <email> <password> [participant|admin]');
  process.exit(1);
}

const region = process.env.COGNITO_REGION;
const clientId =
  which === 'admin' ? process.env.COGNITO_CLIENT_ID_ADMIN : process.env.COGNITO_CLIENT_ID_PARTICIPANT;
if (!region || !clientId) {
  console.error('COGNITO_REGION and the client id must be set in .env');
  process.exit(1);
}

const res = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-amz-json-1.1',
    'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
  },
  body: JSON.stringify({
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: clientId,
    AuthParameters: { USERNAME: email, PASSWORD: password },
  }),
});

const body = await res.json();

if (!res.ok) {
  console.error(`\n${body.__type ?? 'Error'}: ${body.message ?? JSON.stringify(body)}\n`);
  if (String(body.__type).includes('InvalidParameter') || String(body.message).includes('USER_PASSWORD_AUTH')) {
    console.error(
      'Enable ALLOW_USER_PASSWORD_AUTH on this app client:\n' +
        '  Cognito → User pools → gmpev2 → App clients → <client> → Edit\n' +
        '  → Authentication flows → tick "Sign in with username and password: ALLOW_USER_PASSWORD_AUTH"\n',
    );
  }
  if (body.ChallengeName || String(body.__type).includes('NotAuthorized')) {
    console.error(
      'If the user was created in the console with a temporary password, its status is\n' +
        'FORCE_CHANGE_PASSWORD. Set a permanent one:\n' +
        '  Cognito → Users → <user> → Actions → Set password (mark as permanent)\n',
    );
  }
  process.exit(1);
}

// A console-created user starts on a temporary password, so the first sign-in returns
// NEW_PASSWORD_REQUIRED. Answer it here rather than sending someone to the console:
// pass a third argument as the new permanent password.
if (body.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
  const newPassword = process.argv[5];
  if (!newPassword) {
    console.error('\nThis user still has a TEMPORARY password (NEW_PASSWORD_REQUIRED).');
    console.error('Set a permanent one by passing it as a fourth argument:\n');
    console.error('  npm run token -- <email> <temp-password> participant <new-permanent-password>\n');
    process.exit(1);
  }
  const answer = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.RespondToAuthChallenge',
    },
    body: JSON.stringify({
      ChallengeName: 'NEW_PASSWORD_REQUIRED',
      ClientId: clientId,
      Session: body.Session,
      ChallengeResponses: { USERNAME: email, NEW_PASSWORD: newPassword },
    }),
  });
  const answered = await answer.json();
  if (!answer.ok || !answered.AuthenticationResult) {
    console.error(`\n${answered.__type ?? 'Error'}: ${answered.message ?? JSON.stringify(answered)}\n`);
    process.exit(1);
  }
  console.log('\nPermanent password set.');
  body.AuthenticationResult = answered.AuthenticationResult;
} else if (body.ChallengeName) {
  console.error(`\nCognito returned a challenge this script does not handle: ${body.ChallengeName}\n`);
  process.exit(1);
}

const token = body.AuthenticationResult.AccessToken;
const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));

console.log('\nAccess token (paste as Bearer):\n');
console.log(token);
console.log('\nClaims:');
console.log(`  sub        ${claims.sub}`);
console.log(`  token_use  ${claims.token_use}`);
console.log(`  client_id  ${claims.client_id}`);
console.log(`  expires    ${new Date(claims.exp * 1000).toISOString()}`);
console.log('\nTry it:');
console.log(`  curl -s http://localhost:3050/v1/auth/me -H "Authorization: Bearer $TOKEN"\n`);
