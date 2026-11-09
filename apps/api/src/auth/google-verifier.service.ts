import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import type { Env } from '../config/env';

export interface GoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

/** Verifies Google ID tokens from the web (Google Identity Services) or mobile (native sign-in). */
@Injectable()
export class GoogleVerifierService {
  private readonly client = new OAuth2Client();

  constructor(private readonly config: ConfigService<Env, true>) {}

  async verify(idToken: string): Promise<GoogleProfile> {
    const audience = this.config.get('GOOGLE_CLIENT_IDS', { infer: true });
    if (audience.length === 0) {
      throw new UnauthorizedException('Google sign-in is not configured on the server');
    }
    try {
      const ticket = await this.client.verifyIdToken({ idToken, audience });
      const p = ticket.getPayload();
      if (!p?.sub || !p.email) throw new Error('missing claims');
      return {
        sub: p.sub,
        email: p.email.toLowerCase(),
        emailVerified: p.email_verified === true,
        name: p.name,
        picture: p.picture,
      };
    } catch {
      throw new UnauthorizedException('Invalid Google token');
    }
  }
}
