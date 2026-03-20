import {
  Controller,
  Get,
  Post,
  Param,
  Req,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { DisruptionDetectorService } from './disruption-detector.service.js';

interface AuthenticatedRequest {
  user: {
    userId: string;
    email: string;
    operatorId: number;
    permissions: string[];
  };
}

@Controller('disruptions')
export class DisruptionsController {
  private readonly logger = new Logger(DisruptionsController.name);

  constructor(private readonly disruptionDetectorService: DisruptionDetectorService) {}

  /**
   * GET /api/v1/disruptions
   * Returns all active disruptions for the operator.
   */
  @Get()
  async getActiveDisruptions(@Req() req: AuthenticatedRequest) {
    const operatorId = req.user.operatorId;
    const disruptions = await this.disruptionDetectorService.getActiveDisruptions(operatorId);

    return {
      data: disruptions,
      summary: {
        total: disruptions.length,
        critical: disruptions.filter((d) => d.severity === 'critical' || d.severity === 'grounded').length,
        warning: disruptions.filter((d) => d.severity === 'warning').length,
        byType: {
          weather: disruptions.filter((d) => d.type === 'weather').length,
          maintenance: disruptions.filter((d) => d.type === 'maintenance').length,
          instructor: disruptions.filter((d) => d.type === 'instructor').length,
        },
      },
    };
  }

  /**
   * POST /api/v1/disruptions/scan
   * Triggers a manual disruption scan for all types.
   */
  @Post('scan')
  @HttpCode(HttpStatus.OK)
  async triggerScan(@Req() req: AuthenticatedRequest) {
    const operatorId = req.user.operatorId;
    // Use a mock token for FSP API calls in scan context
    const token = 'scan-context-token';

    this.logger.log(`Manual disruption scan triggered by ${req.user.email} for operator ${operatorId}`);

    const results = await this.disruptionDetectorService.runAllChecks(operatorId, token);

    const totalFound =
      results.weather.length + results.maintenance.length + results.instructor.length;

    return {
      data: results,
      message: `Scan complete. ${totalFound} active disruption(s) found.`,
      summary: {
        weather: results.weather.length,
        maintenance: results.maintenance.length,
        instructor: results.instructor.length,
      },
    };
  }

  /**
   * POST /api/v1/disruptions/:id/resolve
   * Marks a specific disruption as resolved.
   */
  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  async resolveDisruption(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const operatorId = req.user.operatorId;

    const resolved = await this.disruptionDetectorService.resolveDisruption(operatorId, id);

    if (!resolved) {
      throw new NotFoundException(
        `Active disruption ${id} not found for operator ${operatorId}`,
      );
    }

    this.logger.log(
      `Disruption ${id} resolved by ${req.user.email} (type: ${resolved.type}, severity: ${resolved.severity})`,
    );

    return {
      data: resolved,
      message: 'Disruption resolved successfully.',
    };
  }
}
