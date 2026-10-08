// Login/refresh. MFA for OC routes is MfaGuard (GetUser on the caller token).

import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentIdentity } from './decorators/current-identity.decorator';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { AuthService, type MeResponse } from './auth.service';
import type { AuthenticatedIdentity, TokenPair } from './identity/identity-provider';

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() body: LoginDto, @Req() req: Request): Promise<TokenPair> {
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    return this.authService.login(body.email, body.password, ip);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() body: RefreshDto): Promise<TokenPair> {
    return this.authService.refresh(body.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() body: RefreshDto): Promise<void> {
    await this.authService.logout(body.refreshToken);
  }

  @Get('me')
  me(@CurrentIdentity() identity: AuthenticatedIdentity): Promise<MeResponse> {
    return this.authService.me(identity);
  }
}
