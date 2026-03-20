import { Module } from '@nestjs/common';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { OnboardingService } from './onboarding.service.js';
import { FspModule } from '../../fsp/fsp.module.js';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module.js';

@Module({
  imports: [
    FspModule,
    FeatureFlagsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService): JwtModuleOptions => {
        const expiresIn = configService.get<string>('JWT_EXPIRES_IN', '8h');
        return {
          secret: configService.getOrThrow<string>('JWT_SECRET'),
          signOptions: {
            expiresIn: expiresIn as unknown as number,
            issuer: 'flighschedulepro',
          },
          verifyOptions: {
            issuer: 'flighschedulepro',
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, OnboardingService],
  exports: [AuthService, OnboardingService, JwtModule],
})
export class AuthModule {}
