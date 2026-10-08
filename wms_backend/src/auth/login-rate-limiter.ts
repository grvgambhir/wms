// Login rate limiter. MFA for OC routes is MfaGuard.

import { Injectable } from '@nestjs/common';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

/**
 * In-process limiter for POST /login. 5 per email per 15 minutes, and 5 per IP.
 * Multi-instance production needs Redis (already on the stack for this). Fine here:
 * this whole module is thrown away when D5 lands.
 */
@Injectable()
export class LoginRateLimiter {
  private readonly hits = new Map<string, number[]>();

  allow(email: string, ip: string): boolean {
    const now = Date.now();
    const emailKey = `email:${email.trim().toLowerCase()}`;
    const ipKey = `ip:${ip}`;
    if (this.count(emailKey, now) >= MAX_ATTEMPTS || this.count(ipKey, now) >= MAX_ATTEMPTS) {
      return false;
    }
    this.record(emailKey, now);
    this.record(ipKey, now);
    return true;
  }

  reset(): void {
    this.hits.clear();
  }

  private count(key: string, now: number): number {
    const kept = (this.hits.get(key) ?? []).filter((at) => now - at < WINDOW_MS);
    this.hits.set(key, kept);
    return kept.length;
  }

  private record(key: string, now: number): void {
    const kept = this.hits.get(key) ?? [];
    kept.push(now);
    this.hits.set(key, kept);
  }
}
