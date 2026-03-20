import { Controller, Get, Post, Param, Req } from '@nestjs/common';
import { FlightAlertsService } from './flight-alerts.service.js';

interface AuthenticatedRequest {
  user: {
    userId: string;
    email: string;
    operatorId: number;
    permissions: string[];
  };
}

@Controller('flight-alerts')
export class FlightAlertsController {
  constructor(private readonly alertsService: FlightAlertsService) {}

  /**
   * GET /api/v1/flight-alerts
   * Returns all active (unresolved) flight alerts for the authenticated operator.
   */
  @Get()
  async getActiveAlerts(@Req() req: AuthenticatedRequest) {
    const alerts = await this.alertsService.getActiveAlerts(req.user.operatorId);
    return { data: alerts };
  }

  /**
   * POST /api/v1/flight-alerts/:id/resolve
   * Resolves a specific flight alert.
   */
  @Post(':id/resolve')
  async resolveAlert(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const alert = await this.alertsService.resolveAlert(id, req.user.userId);
    return { data: alert };
  }

  /**
   * GET /api/v1/flight-alerts/count
   * Returns the count of active alerts (for badge display).
   */
  @Get('count')
  async getAlertCount(@Req() req: AuthenticatedRequest) {
    const count = await this.alertsService.getActiveAlertCount(req.user.operatorId);
    return { data: { count } };
  }
}
