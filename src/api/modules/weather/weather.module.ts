import { Module } from '@nestjs/common';
import { WeatherService } from './weather.service.js';
import { WeatherController } from './weather.controller.js';

@Module({
  controllers: [WeatherController],
  providers: [WeatherService],
  exports: [WeatherService],
})
export class WeatherModule {}
