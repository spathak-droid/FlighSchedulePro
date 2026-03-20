import {
  Controller,
  Post,
  Get,
  HttpCode,
  HttpStatus,
  Req,
  Body,
} from '@nestjs/common';
import { SimulationService } from './simulation.service.js';

interface AuthenticatedRequest {
  user: {
    userId: string;
    email: string;
    operatorId: number;
    permissions: string[];
  };
}

interface StartBody {
  /** Event interval in seconds (default 20). */
  intervalSeconds?: number;
}

@Controller('simulation')
export class SimulationController {
  constructor(private readonly simulationService: SimulationService) {}

  /**
   * POST /api/v1/simulation/start
   * Start the flight school simulation for this operator.
   */
  @Post('start')
  @HttpCode(HttpStatus.OK)
  async start(@Req() req: AuthenticatedRequest, @Body() body: StartBody) {
    const intervalMs = Math.max(5, Math.min(body.intervalSeconds ?? 20, 120)) * 1000;
    const result = await this.simulationService.start(req.user.operatorId, intervalMs);
    return { data: result };
  }

  /**
   * POST /api/v1/simulation/stop
   * Stop the running simulation.
   */
  @Post('stop')
  @HttpCode(HttpStatus.OK)
  stop(@Req() req: AuthenticatedRequest) {
    const result = this.simulationService.stop(req.user.operatorId);
    return { data: result };
  }

  /**
   * GET /api/v1/simulation/status
   * Check if simulation is running and event stats.
   */
  @Get('status')
  status(@Req() req: AuthenticatedRequest) {
    const result = this.simulationService.getStatus(req.user.operatorId);
    return { data: result };
  }
}
