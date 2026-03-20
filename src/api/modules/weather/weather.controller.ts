import { Controller, Get, Param, Req, NotFoundException, Logger } from '@nestjs/common';
import { WeatherService } from './weather.service.js';
import { getLocationsForOperator } from '../../fsp/mock/mock-data.js';

interface AuthenticatedRequest {
  user: {
    userId: string;
    email: string;
    operatorId: number;
    permissions: string[];
  };
}

@Controller('weather')
export class WeatherController {
  private readonly logger = new Logger(WeatherController.name);

  constructor(
    private readonly weatherService: WeatherService,
  ) {}

  /**
   * GET /api/v1/weather/:locationId
   *
   * Returns current conditions + 24h forecast for a location.
   * Looks up coordinates from mock data, fetches weather, caches, returns.
   */
  @Get(':locationId')
  async getWeather(
    @Param('locationId') locationId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const operatorId = req.user.operatorId;

    // Look up location coordinates from mock data
    const locations = getLocationsForOperator(operatorId);
    const location = locations.find((l) => l.id === locationId);

    if (!location) {
      throw new NotFoundException(`Location ${locationId} not found for operator ${operatorId}`);
    }

    if (location.latitude == null || location.longitude == null) {
      throw new NotFoundException(
        `Location ${locationId} does not have coordinates configured`,
      );
    }

    this.logger.log(
      `Fetching weather for ${location.code} (${location.latitude}, ${location.longitude}) ` +
      `operator ${operatorId}`,
    );

    const weather = await this.weatherService.getWeatherForLocation(
      locationId,
      location.name,
      location.latitude,
      location.longitude,
    );

    return { data: weather };
  }

  /**
   * GET /api/v1/weather
   *
   * Returns current conditions for all locations of the operator.
   */
  @Get()
  async getAllWeather(@Req() req: AuthenticatedRequest) {
    const operatorId = req.user.operatorId;
    const locations = getLocationsForOperator(operatorId);

    const results = await Promise.all(
      locations
        .filter((l) => l.latitude != null && l.longitude != null)
        .map((l) =>
          this.weatherService.getWeatherForLocation(
            l.id,
            l.name,
            l.latitude!,
            l.longitude!,
          ),
        ),
    );

    return { data: results };
  }
}
