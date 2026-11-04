import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordSetupService } from './password-setup.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, PasswordSetupService],
  exports: [AuthService],
})
export class AuthModule {}
