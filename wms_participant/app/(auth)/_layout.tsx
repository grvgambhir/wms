import { Stack } from 'expo-router';

/** Auth route group — A01 Login, A02 OTP. */
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
