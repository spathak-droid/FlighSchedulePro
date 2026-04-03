import { Controller, Get, Post, Req, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { DirectoryService } from './directory.service.js';
import type { AuthenticatedRequest } from '../../common/interfaces/index.js';

@Controller('directory')
export class DirectoryController {
  constructor(private readonly directoryService: DirectoryService) {}

  /**
   * GET /api/v1/directory/students
   * Returns enriched student directory for the authenticated operator.
   */
  @Get('students')
  async getStudents(@Req() req: AuthenticatedRequest) {
    const data = await this.directoryService.getStudents(req.user.operatorId);
    return { data };
  }

  /**
   * GET /api/v1/directory/instructors
   * Returns enriched instructor directory for the authenticated operator.
   */
  @Get('instructors')
  async getInstructors(@Req() req: AuthenticatedRequest) {
    const data = await this.directoryService.getInstructors(req.user.operatorId);
    return { data };
  }

  /**
   * GET /api/v1/directory/aircraft
   * Returns enriched aircraft directory for the authenticated operator.
   */
  @Get('aircraft')
  async getAircraft(@Req() req: AuthenticatedRequest) {
    const data = await this.directoryService.getAircraft(req.user.operatorId);
    return { data };
  }

  /**
   * GET /api/v1/directory/locations
   * Returns locations for the authenticated operator.
   */
  @Get('locations')
  async getLocations(@Req() req: AuthenticatedRequest) {
    const data = await this.directoryService.getLocations(req.user.operatorId);
    return { data };
  }

  /**
   * POST /api/v1/directory/send-email
   * Sends an ad-hoc email to a recipient.
   */
  @Post('send-email')
  @HttpCode(HttpStatus.OK)
  async sendEmail(
    @Req() req: AuthenticatedRequest,
    @Body() body: { recipientEmail: string; recipientName: string; subject: string; body: string },
  ) {
    const result = await this.directoryService.sendEmail(
      req.user.operatorId,
      body.recipientEmail,
      body.recipientName,
      body.subject,
      body.body,
    );
    return { data: result };
  }
}
