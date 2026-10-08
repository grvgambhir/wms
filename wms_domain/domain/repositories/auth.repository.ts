import type { AuthSession } from '../models/auth';

export type SignUpInput = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
};

export interface AuthRepository {
  signInWithPassword(identifier: string, password: string): Promise<AuthSession>;
  signUp(input: SignUpInput): Promise<AuthSession>;
  requestOtp(identifier: string): Promise<void>;
  verifyOtp(identifier: string, code: string): Promise<AuthSession>;
  getSession(): Promise<AuthSession | null>;
  signOut(): Promise<void>;
}
