import { Controller, Post, Body, Req, BadRequestException } from '@nestjs/common';
import { AskService } from './ask.service.js';
import type { AuthenticatedRequest } from '../../common/interfaces/index.js';

@Controller('ask')
export class AskController {
  constructor(private readonly askService: AskService) {}

  /**
   * POST /api/v1/ask
   * Ask the AI a question with full school context.
   * Supports email sending — if the AI detects an email intent, it will
   * generate and send emails, returning results in the response.
   */
  @Post()
  async ask(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      question: string;
      conversationHistory?: { role: 'user' | 'assistant'; content: string }[];
    },
  ) {
    if (!body.question || typeof body.question !== 'string' || body.question.trim().length === 0) {
      throw new BadRequestException('question is required and must be a non-empty string');
    }
    if (body.question.length > 5000) {
      throw new BadRequestException('question must not exceed 5000 characters');
    }
    if (body.conversationHistory && body.conversationHistory.length > 50) {
      throw new BadRequestException('conversationHistory must not exceed 50 messages');
    }

    const result = await this.askService.ask(req.user.operatorId, {
      question: body.question,
      conversationHistory: body.conversationHistory,
    });
    return { data: result };
  }
}
