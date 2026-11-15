import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { GoogleVerifierService } from './google-verifier.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, TokenService, GoogleVerifierService],
})
export class AuthModule {}
