/**
 * T086: Template CRUD controller.
 *
 * GET  /templates      — list operator's notification templates
 * PUT  /templates/:id  — update template subject + body
 */

import {
  Controller,
  Get,
  Put,
  Param,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { NotificationService } from './notification.service.js';
import type { AuthenticatedRequest } from '../../common/interfaces/index.js';

interface UpdateTemplateBody {
  subject?: string;
  bodyTemplate?: string;
}

@Controller('templates')
export class TemplatesController {
  constructor(private readonly notificationService: NotificationService) {}

  /**
   * GET /api/v1/templates
   * List all notification templates for the authenticated operator.
   */
  @Get()
  async listTemplates(@Req() req: AuthenticatedRequest) {
    const templates = await this.notificationService.getTemplates(req.user.operatorId);

    return { data: templates };
  }

  /**
   * PUT /api/v1/templates/:id
   * Update a notification template's subject and/or body.
   */
  @Put(':id')
  @HttpCode(HttpStatus.OK)
  async updateTemplate(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateTemplateBody,
  ) {
    if (body.subject !== undefined && body.subject.length > 500) {
      throw new BadRequestException('subject must not exceed 500 characters');
    }
    if (body.bodyTemplate !== undefined && body.bodyTemplate.length > 10000) {
      throw new BadRequestException('bodyTemplate must not exceed 10000 characters');
    }

    const updated = await this.notificationService.updateTemplate(req.user.operatorId, id, {
      subject: body.subject,
      bodyTemplate: body.bodyTemplate,
    });

    return { data: updated };
  }
}
