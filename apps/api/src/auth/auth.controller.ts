import { Body, Controller, HttpCode, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  googleLoginSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  type AuthResponse,
  type GoogleLoginInput,
  type LoginInput,
  type RefreshInput,
  type RegisterInput,
} from '@myfinances/shared';
import { Public } from '../common/public.decorator';
import { AuthService, type SessionResult } from './auth.service';
import type { Env } from '../config/env';

export const REFRESH_COOKIE = 'mf_rt';
export const REFRESH_COOKIE_PATH = '/api/auth';
/** Mobile apps send this header and receive the refresh token in the body instead of a cookie. */
const CLIENT_HEADER = 'x-client-type';

@ApiTags('auth')
@Public()
@Throttle({ default: { limit: 10, ttl: 60_000 } })
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Post('register')
  async register(
    @Body({ schema: registerSchema }) body: RegisterInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.respond(req, res, await this.auth.register(body, req.get('user-agent')));
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body({ schema: loginSchema }) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.respond(req, res, await this.auth.login(body, req.get('user-agent')));
  }

  @Post('google')
  @HttpCode(200)
  async google(
    @Body({ schema: googleLoginSchema }) body: GoogleLoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.respond(req, res, await this.auth.loginWithGoogle(body.idToken, req.get('user-agent')));
  }

  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async refresh(
    @Body({ schema: refreshSchema }) body: RefreshInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const token = body?.refreshToken ?? req.cookies?.[REFRESH_COOKIE];
    if (!token) throw new UnauthorizedException('Missing refresh token');
    try {
      return this.respond(req, res, await this.auth.refresh(token, req.get('user-agent')));
    } catch (e) {
      this.clearCookie(res);
      throw e;
    }
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Body({ schema: refreshSchema }) body: RefreshInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const token = body?.refreshToken ?? req.cookies?.[REFRESH_COOKIE];
    if (token) await this.auth.logout(token);
    this.clearCookie(res);
  }

  private respond(req: Request, res: Response, session: SessionResult): AuthResponse {
    const { accessToken, refreshToken, refreshExpiresAt } = session.tokens;
    if (req.get(CLIENT_HEADER) === 'mobile') {
      return { accessToken, refreshToken, user: session.user };
    }
    res.cookie(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure: this.config.get('NODE_ENV', { infer: true }) === 'production',
      sameSite: 'lax',
      path: REFRESH_COOKIE_PATH,
      expires: refreshExpiresAt,
    });
    return { accessToken, user: session.user };
  }

  private clearCookie(res: Response) {
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
  }
}
