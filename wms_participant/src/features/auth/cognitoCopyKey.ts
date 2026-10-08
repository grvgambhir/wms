/** Map Amplify error names to copy keys. Never pass the raw error (it can carry tokens). */

export function cognitoCopyKey(
  err: unknown,
  fallback: 'cognitoSignInFailed' | 'cognitoSignUpFailed' | 'cognitoResetFailed' | 'cognitoInvalidCode' | 'cognitoTotpInvalid',
): typeof fallback | 'loginAccountExists' | 'cognitoUnconfigured' {
  const name =
    err && typeof err === 'object' && 'name' in err ? String((err as { name: unknown }).name) : '';
  const message =
    err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : '';
  if (name === 'UsernameExistsException') return 'loginAccountExists';
  if (name === 'CodeMismatchException' || name === 'ExpiredCodeException') return 'cognitoInvalidCode';
  if (message === 'auth.cognito.unconfigured' || name === 'auth.cognito.unconfigured') {
    return 'cognitoUnconfigured';
  }
  return fallback;
}
