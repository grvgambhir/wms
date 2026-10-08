// TEMPORARY AUTH — placeholder until decision D5 selects an identity provider.
// Not production: no MFA (PLT-04 is a mandatory gate item), no password reset,
// passwords stored locally. Replace LocalIdentityProvider, keep the interface.

import { IsString, MinLength } from 'class-validator';

export class RefreshDto {
  @IsString()
  @MinLength(1)
  refreshToken!: string;
}
