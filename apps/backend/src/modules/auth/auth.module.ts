import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { OtpService } from './otp.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AuditLog, Company, RefreshToken, User } from '../../database/entities';
import { RedisModule } from '../../realtime/redis.module';
import { SmsModule } from '../../sms/sms.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Company, RefreshToken, AuditLog]),
    PassportModule,
    JwtModule.register({}),
    RedisModule,
    SmsModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, OtpService],
  exports: [AuthService],
})
export class AuthModule {}
