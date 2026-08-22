import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConsoleSmsSender, EskizSmsSender, SMS_SENDER } from './sms.service';

@Module({
  providers: [
    EskizSmsSender,
    ConsoleSmsSender,
    {
      provide: SMS_SENDER,
      inject: [ConfigService, EskizSmsSender, ConsoleSmsSender],
      useFactory: (config: ConfigService, eskiz: EskizSmsSender, fallback: ConsoleSmsSender) =>
        config.get('sms.eskizEmail') && config.get('sms.eskizPassword') ? eskiz : fallback,
    },
  ],
  exports: [SMS_SENDER],
})
export class SmsModule {}
