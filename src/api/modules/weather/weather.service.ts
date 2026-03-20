import { Injectable, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { db } from '../../../db/index.js';
import { weatherObservations } from '../../../db/schema/index.js';

// ─── Open-Meteo Response Types ──────────────────────────────────────────────

interface OpenMeteoCurrentUnits {
  temperature_2m: string;
  wind_speed_10m: string;
  wind_direction_10m: string;
  wind_gusts_10m: string;
  cloud_cover: string;
  visibility: string;
  weather_code: string;
}

interface OpenMeteoCurrent {
  time: string;
  temperature_2m: number;
  wind_speed_10m: number;
  wind_direction_10m: number;
  wind_gusts_10m: number;
  cloud_cover: number;
  visibility: number; // meters from API
  weather_code: number;
}

interface OpenMeteoHourly {
  time: string[];
  temperature_2m: number[];
  wind_speed_10m: number[];
  wind_direction_10m: number[];
  wind_gusts_10m: number[];
  cloud_cover: number[];
  visibility: number[];
  weather_code: number[];
}

interface OpenMeteoResponse {
  latitude: number;
  longitude: number;
  timezone: string;
  current_units: OpenMeteoCurrentUnits;
  current: OpenMeteoCurrent;
  hourly?: OpenMeteoHourly;
}

// ─── Domain Types ───────────────────────────────────────────────────────────

export type FlightCategory = 'VFR' | 'MVFR' | 'IFR' | 'LIFR';

export interface CurrentWeather {
  observedAt: string;
  temperature: number; // Celsius
  windSpeed: number; // km/h
  windGust: number; // km/h
  windDirection: number; // degrees
  visibility: number; // statute miles
  cloudCover: number; // percentage 0-100
  weatherCode: number;
  flightCategory: FlightCategory;
}

export interface HourlyForecast {
  time: string;
  temperature: number;
  windSpeed: number;
  windGust: number;
  windDirection: number;
  visibility: number; // statute miles
  cloudCover: number;
  weatherCode: number;
  flightCategory: FlightCategory;
}

export interface WeatherResponse {
  locationId: string;
  locationName: string;
  latitude: number;
  longitude: number;
  current: CurrentWeather;
  forecast: HourlyForecast[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

const OPEN_METEO_BASE_URL = 'https://api.open-meteo.com/v1/forecast';
const CACHE_TTL_SECONDS = 900; // 15 minutes
const METERS_PER_STATUTE_MILE = 1609.344;

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);
  private readonly redis: Redis;

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST ?? 'localhost',
      port: Number(process.env.REDIS_PORT ?? 6379),
      ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
      lazyConnect: true,
    });

    this.redis.on('error', (err: Error) => {
      this.logger.warn(`Redis connection error (weather cache will be skipped): ${err.message}`);
    });

    // Attempt connection but don't block startup
    this.redis.connect().catch(() => {
      this.logger.warn('Redis not available — weather caching disabled');
    });
  }

  /**
   * Fetch current weather from Open-Meteo API.
   */
  async fetchCurrentWeather(lat: number, lon: number): Promise<CurrentWeather> {
    const params = new URLSearchParams({
      latitude: lat.toString(),
      longitude: lon.toString(),
      current: 'temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,visibility,weather_code',
    });

    const url = `${OPEN_METEO_BASE_URL}?${params.toString()}`;
    this.logger.debug(`Fetching current weather: ${url}`);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Open-Meteo API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as OpenMeteoResponse;
    const current = data.current;

    const visibilityMiles = current.visibility / METERS_PER_STATUTE_MILE;

    return {
      observedAt: current.time,
      temperature: current.temperature_2m,
      windSpeed: current.wind_speed_10m,
      windGust: current.wind_gusts_10m,
      windDirection: current.wind_direction_10m,
      visibility: Math.round(visibilityMiles * 100) / 100,
      cloudCover: current.cloud_cover,
      weatherCode: current.weather_code,
      flightCategory: this.assessFlightConditions({
        visibility: visibilityMiles,
        cloudCover: current.cloud_cover,
      }),
    };
  }

  /**
   * Fetch hourly forecast from Open-Meteo API.
   */
  async fetchForecast(lat: number, lon: number, hours = 24): Promise<HourlyForecast[]> {
    const params = new URLSearchParams({
      latitude: lat.toString(),
      longitude: lon.toString(),
      hourly: 'temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,visibility,weather_code',
      forecast_hours: hours.toString(),
    });

    const url = `${OPEN_METEO_BASE_URL}?${params.toString()}`;
    this.logger.debug(`Fetching forecast: ${url}`);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Open-Meteo API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as OpenMeteoResponse;
    const hourly = data.hourly;

    if (!hourly) {
      return [];
    }

    const forecasts: HourlyForecast[] = [];
    const count = Math.min(hourly.time.length, hours);

    for (let i = 0; i < count; i++) {
      const visibilityMiles = hourly.visibility[i]! / METERS_PER_STATUTE_MILE;

      forecasts.push({
        time: hourly.time[i]!,
        temperature: hourly.temperature_2m[i]!,
        windSpeed: hourly.wind_speed_10m[i]!,
        windGust: hourly.wind_gusts_10m[i]!,
        windDirection: hourly.wind_direction_10m[i]!,
        visibility: Math.round(visibilityMiles * 100) / 100,
        cloudCover: hourly.cloud_cover[i]!,
        weatherCode: hourly.weather_code[i]!,
        flightCategory: this.assessFlightConditions({
          visibility: visibilityMiles,
          cloudCover: hourly.cloud_cover[i]!,
        }),
      });
    }

    return forecasts;
  }

  /**
   * Assess flight category based on visibility and cloud cover.
   *
   * Flight Categories:
   * - VFR:  visibility > 5sm AND ceiling > 3000ft
   * - MVFR: visibility 3-5sm OR ceiling 1000-3000ft
   * - IFR:  visibility 1-3sm OR ceiling 500-1000ft
   * - LIFR: visibility < 1sm OR ceiling < 500ft
   *
   * Note: Open-Meteo provides cloud_cover as a percentage, not ceiling height.
   * We estimate ceiling from cloud cover:
   * - cloud_cover < 25%  → clear / few → ceiling > 3000ft (VFR)
   * - cloud_cover 25-50% → scattered   → ceiling ~2000ft (MVFR)
   * - cloud_cover 50-87% → broken      → ceiling ~1000ft (IFR)
   * - cloud_cover > 87%  → overcast    → ceiling ~500ft (LIFR)
   */
  assessFlightConditions(weather: { visibility: number; cloudCover: number }): FlightCategory {
    const { visibility, cloudCover } = weather;

    // Estimate ceiling height from cloud cover percentage
    const estimatedCeiling = this.estimateCeiling(cloudCover);

    // LIFR: visibility < 1sm OR ceiling < 500ft
    if (visibility < 1 || estimatedCeiling < 500) {
      return 'LIFR';
    }

    // IFR: visibility 1-3sm OR ceiling 500-1000ft
    if (visibility < 3 || estimatedCeiling < 1000) {
      return 'IFR';
    }

    // MVFR: visibility 3-5sm OR ceiling 1000-3000ft
    if (visibility <= 5 || estimatedCeiling <= 3000) {
      return 'MVFR';
    }

    // VFR: visibility > 5sm AND ceiling > 3000ft
    return 'VFR';
  }

  /**
   * Estimate ceiling height from cloud cover percentage.
   * This is an approximation since Open-Meteo doesn't provide ceiling data directly.
   */
  private estimateCeiling(cloudCoverPercent: number): number {
    if (cloudCoverPercent < 25) {
      // Few or clear — high ceiling
      return 12000;
    }
    if (cloudCoverPercent < 50) {
      // Scattered — moderate ceiling
      return 2500;
    }
    if (cloudCoverPercent < 75) {
      // Broken — lower ceiling
      return 1500;
    }
    if (cloudCoverPercent < 88) {
      // Mostly overcast
      return 800;
    }
    // Overcast
    return 400;
  }

  /**
   * Get weather for a location, using Redis cache with 15min TTL.
   * Falls back to direct API call if Redis is unavailable.
   */
  async getWeatherForLocation(
    locationId: string,
    locationName: string,
    lat: number,
    lon: number,
  ): Promise<WeatherResponse> {
    const cacheKey = `weather:${locationId}`;

    // Try cache first
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        this.logger.debug(`Weather cache hit for ${locationId}`);
        return JSON.parse(cached) as WeatherResponse;
      }
    } catch {
      this.logger.debug(`Redis unavailable for cache read, fetching fresh weather for ${locationId}`);
    }

    // Fetch from Open-Meteo
    const [current, forecast] = await Promise.all([
      this.fetchCurrentWeather(lat, lon),
      this.fetchForecast(lat, lon, 24),
    ]);

    const weatherResponse: WeatherResponse = {
      locationId,
      locationName,
      latitude: lat,
      longitude: lon,
      current,
      forecast,
    };

    // Cache result
    try {
      await this.redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(weatherResponse));
    } catch {
      this.logger.debug(`Redis unavailable for cache write for ${locationId}`);
    }

    // Persist observation to DB (fire-and-forget)
    this.persistObservation(locationId, lat, lon, current).catch((err) => {
      this.logger.warn(`Failed to persist weather observation: ${(err as Error).message}`);
    });

    return weatherResponse;
  }

  /**
   * Persist a weather observation to the database.
   */
  private async persistObservation(
    locationId: string,
    lat: number,
    lon: number,
    current: CurrentWeather,
  ): Promise<void> {
    await db.insert(weatherObservations).values({
      locationId,
      latitude: lat.toString(),
      longitude: lon.toString(),
      observedAt: new Date(current.observedAt),
      temperature: current.temperature.toString(),
      windSpeed: current.windSpeed.toString(),
      windGust: current.windGust.toString(),
      windDirection: current.windDirection,
      visibility: current.visibility.toString(),
      cloudCover: current.cloudCover,
      weatherCode: current.weatherCode,
      flightCategory: current.flightCategory,
      rawData: current,
    });
  }
}
