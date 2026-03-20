import { Controller, Post, Body, Req } from '@nestjs/common';
import { AskService } from './ask.service.js';

interface AuthenticatedRequest {
  user: {
    userId: string;
    email: string;
    operatorId: number;
    permissions: string[];
  };
}

@Controller('ask')
export class AskController {
  constructor(private readonly askService: AskService) {}

  /**
   * POST /api/v1/ask
   * Ask the AI a question with full school context.
   */
  @Post()
  async ask(
    @Req() req: AuthenticatedRequest,
    @Body() body: { question: string; conversationHistory?: { role: 'user' | 'assistant'; content: string }[] },
  ) {
    const result = await this.askService.ask(req.user.operatorId, {
      question: body.question,
      conversationHistory: body.conversationHistory,
    });
    return { data: result };
  }
}
