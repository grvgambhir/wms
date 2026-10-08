import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  CALLER_MFA_SOURCE,
  MFA_ENFORCEMENT_THRESHOLD,
  countEnrolledOcAdmins,
  type CallerMfaSource,
} from '../../people/caller-mfa';
import { isOcRole } from '../../people/profile.schema';
import { refuse } from '../../people/refuse';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthenticatedRequest } from './auth.guard';

/**
 * Beside the role check, not per-controller.
 *
 * This proves MFA is enrolled and every session minted since enrolment
 * completed it. That is not the same sentence as "this request came from an
 * MFA session".
 */
@Injectable()
export class MfaGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(CALLER_MFA_SOURCE) private readonly mfa: CallerMfaSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest & { method?: string; originalUrl?: string; url?: string }>();
    const roles = request.identity?.roles ?? [];
    if (!roles.some((role) => isOcRole(role))) return true;
    if (isMfaExempt(request.method ?? 'GET', request.originalUrl ?? request.url ?? '')) return true;

    const enrolledAdmins = await countEnrolledOcAdmins();
    if (enrolledAdmins < MFA_ENFORCEMENT_THRESHOLD) return true;

    const token = request.accessToken ?? '';
    const state = await this.mfa.inspect(token);
    if (!state.enrolled) {
      refuse('MFA_REQUIRED', 'auth.mfa.required');
    }
    return true;
  }
}

function isMfaExempt(method: string, url: string): boolean {
  const path = (url.split('?')[0] ?? '').replace(/\/$/, '') || '/';
  const verb = method.toUpperCase();
  if (verb === 'GET' && path === '/v1/me') return true;
  if (verb === 'PATCH' && path === '/v1/me/profile') return true;
  if (verb === 'POST' && (path === '/v1/me/mfa/complete' || path === '/v1/me/mfa/disable')) {
    return true;
  }
  return false;
}
