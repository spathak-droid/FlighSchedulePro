/**
 * T080: Discovery Flight controller.
 *
 * POST /discovery-flights — creates a prospect and generates daylight-only suggestions.
 */

import {
  Controller,
  Post,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { DiscoveryService } from './discovery.service.js';
import type { CreateDiscoveryRequestDto } from './discovery.service.js';

interface AuthenticatedRequest {
  user: {
    userId: string;
    email: string;
    operatorId: number;
    permissions: string[];
  };
}

interface CreateDiscoveryBody {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  preferredDates?: Array<{
    date: string;
    timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'anytime';
  }>;
  timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'anytime';
  notes?: string;
}

@Controller('discovery-flights')
export class DiscoveryController {
  constructor(private readonly discoveryService: DiscoveryService) {}

  /**
   * POST /api/v1/discovery-flights
   *
   * Create a prospect and generate daylight-only discovery flight suggestions.
   *
   * Body: { firstName, lastName, email?, phone?, preferredDates?, timeOfDay?, notes? }
   * Response: { prospect: { id, firstName, lastName }, suggestions: [...] }
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createDiscoveryFlight(@Req() req: AuthenticatedRequest, @Body() body: CreateDiscoveryBody) {
    // Validate required fields
    if (!body.firstName || !body.lastName) {
      throw new BadRequestException('firstName and lastName are required');
    }

    // TODO: FSP token storage per operator — currently we don't persist the FSP
    // bearer token after login. When operator-level FSP token storage is
    // implemented, replace this placeholder with the real token.
    const fspToken = '';

    const dto: CreateDiscoveryRequestDto = {
      firstName: body.firstName.trim(),
      lastName: body.lastName.trim(),
      email: body.email?.trim(),
      phone: body.phone?.trim(),
      preferredDates: body.preferredDates,
      timeOfDay: body.timeOfDay,
      notes: body.notes?.trim(),
    };

    const result = await this.discoveryService.createDiscoveryRequest(
      req.user.operatorId,
      dto,
      fspToken,
    );

    return { data: result };
  }

  /**
   * POST /api/v1/discovery-flights/:suggestionId/book
   *
   * Scheduler confirms a discovery flight slot. This:
   * 1. Creates the reservation in reservation_history
   * 2. Updates prospect status to 'booked'
   * 3. Expires all other suggestions in the same group
   * 4. Sends confirmation email to the prospect
   * 5. Returns booking confirmation details
   */
  @Post(':suggestionId/book')
  @HttpCode(HttpStatus.OK)
  async bookDiscoveryFlight(
    @Req() req: AuthenticatedRequest,
    @Param('suggestionId', ParseUUIDPipe) suggestionId: string,
    @Body() _body: Record<string, unknown>,
  ) {
    const result = await this.discoveryService.bookSlot(
      req.user.operatorId,
      suggestionId,
      req.user.userId,
    );

    return { data: result };
  }
}
