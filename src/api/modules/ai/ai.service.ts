import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface AiRationaleInput {
  suggestionType: 'waitlist' | 'reschedule' | 'discovery' | 'next_lesson';
  studentName?: string;
  totalFlightHours?: number;
  timeSinceLastFlight?: number | null;
  enrollmentProgress?: string; // e.g. "38/40 lessons (95%)"
  proposedStart: string;
  proposedEnd: string;
  activityType?: string;
  instructorName?: string;
  aircraftRegistration?: string;
  rankingScore?: number;
  rankingBreakdown?: Record<string, number>;
  constraintsPassed: string[];
  constraintsFailed: string[];
  policyNotes: string[];
  // Student insight fields — added when insights are available
  isInactive?: boolean;
  isCheckrideReady?: boolean;
  isAtRisk?: boolean;
  daysSinceLastFlight?: number;
}

export interface AiRationaleResult {
  aiSummary: string;
  riskLevel: 'low' | 'medium' | 'high';
  riskReason: string;
  aiModel: string;
  aiEnriched: true;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private openRouterClient: OpenAI | null = null;
  private openAiClient: OpenAI | null = null;
  private openRouterModel: string;
  private openAiModel: string;

  constructor(@Optional() private readonly config?: ConfigService) {
    const orKey =
      this.config?.get<string>('OPEN_ROUTER_API_KEY') ?? process.env.OPEN_ROUTER_API_KEY;
    const oaiKey = this.config?.get<string>('OPENAI_API_KEY') ?? process.env.OPENAI_API_KEY;

    this.openRouterModel =
      this.config?.get<string>('OPEN_ROUTER_MODEL') ??
      process.env.OPEN_ROUTER_MODEL ??
      'anthropic/claude-haiku-4.5';
    this.openAiModel =
      this.config?.get<string>('OPEN_AI_MODEL') ?? process.env.OPEN_AI_MODEL ?? 'gpt-4.1-nano';

    if (orKey) {
      this.openRouterClient = new OpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: orKey,
      });
      this.logger.log(`AI service initialized with OpenRouter (${this.openRouterModel})`);
    }

    if (oaiKey) {
      this.openAiClient = new OpenAI({ apiKey: oaiKey });
      this.logger.log(`AI service initialized with OpenAI fallback (${this.openAiModel})`);
    }

    if (!orKey && !oaiKey) {
      this.logger.warn('No AI API keys configured — AI features disabled');
    }
  }

  get isAvailable(): boolean {
    return !!(this.openRouterClient || this.openAiClient);
  }

  /**
   * Generate an AI-powered rationale and risk assessment for a suggestion.
   * Returns null if AI is unavailable or fails (caller should use deterministic fallback).
   */
  async generateRationale(input: AiRationaleInput): Promise<AiRationaleResult | null> {
    if (!this.isAvailable) return null;

    const prompt = this.buildPrompt(input);

    // Try OpenRouter first (Claude Haiku), fall back to OpenAI
    const result = await this.callWithFallback(prompt);
    if (!result) return null;

    return this.parseResponse(result.content, result.model);
  }

  private buildPrompt(input: AiRationaleInput): string {
    const lines: string[] = [
      'You are a scheduling assistant for a flight school. Generate a brief, helpful rationale for a scheduling suggestion and assess its risk level.',
      '',
      `Suggestion type: ${input.suggestionType}`,
    ];

    if (input.studentName) lines.push(`Student: ${input.studentName}`);
    if (input.totalFlightHours !== undefined)
      lines.push(`Total flight hours: ${input.totalFlightHours}h`);
    if (input.timeSinceLastFlight !== null && input.timeSinceLastFlight !== undefined) {
      lines.push(`Time since last flight: ${Math.round(input.timeSinceLastFlight)}h`);
    }
    if (input.enrollmentProgress) lines.push(`Enrollment progress: ${input.enrollmentProgress}`);

    lines.push(`Proposed slot: ${input.proposedStart} to ${input.proposedEnd}`);
    if (input.activityType) lines.push(`Activity: ${input.activityType}`);
    if (input.instructorName) lines.push(`Instructor: ${input.instructorName}`);
    if (input.aircraftRegistration) lines.push(`Aircraft: ${input.aircraftRegistration}`);
    if (input.rankingScore !== undefined) lines.push(`Match score: ${input.rankingScore}%`);

    if (input.constraintsPassed.length > 0) {
      lines.push(`Constraints passed: ${input.constraintsPassed.join(', ')}`);
    }
    if (input.constraintsFailed.length > 0) {
      lines.push(`Constraints failed: ${input.constraintsFailed.join(', ')}`);
    }
    if (input.policyNotes.length > 0) {
      lines.push(`Policies: ${input.policyNotes.join(', ')}`);
    }

    // Student insight context — helps AI generate more specific rationale
    if (
      input.isInactive ||
      input.isCheckrideReady ||
      input.isAtRisk ||
      input.daysSinceLastFlight !== undefined
    ) {
      lines.push('');
      lines.push('Student insights:');
      if (input.isInactive && input.daysSinceLastFlight !== undefined) {
        lines.push(
          `- INACTIVE: Student has not flown in ${input.daysSinceLastFlight} days — risk of losing training momentum`,
        );
      }
      if (input.isCheckrideReady) {
        lines.push(
          '- CHECKRIDE READY: Student is at 90%+ enrollment completion — prioritize scheduling to maintain checkride readiness',
        );
      }
      if (input.isAtRisk) {
        lines.push(
          '- AT RISK: Flight gaps are increasing — student may be disengaging from training',
        );
      }
      if (input.daysSinceLastFlight !== undefined && !input.isInactive) {
        lines.push(`- Days since last flight: ${input.daysSinceLastFlight}`);
      }
    }

    lines.push('');
    lines.push('Respond in EXACTLY this JSON format, no markdown:');
    lines.push('{');
    lines.push(
      '  "summary": "2-3 sentence natural language explanation of why this suggestion was made and why it is a good fit. Be specific about the student context.",',
    );
    lines.push('  "riskLevel": "low|medium|high",');
    lines.push('  "riskReason": "1 sentence explaining the risk classification"');
    lines.push('}');

    return lines.join('\n');
  }

  private async callWithFallback(
    prompt: string,
  ): Promise<{ content: string; model: string } | null> {
    // Try OpenRouter first
    if (this.openRouterClient) {
      try {
        const res = await this.openRouterClient.chat.completions.create({
          model: this.openRouterModel,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 300,
          temperature: 0.3,
        });

        const content = res.choices[0]?.message?.content;
        if (content) {
          return { content, model: `openrouter/${this.openRouterModel}` };
        }
      } catch (err) {
        this.logger.warn(
          `OpenRouter call failed: ${err instanceof Error ? err.message : err}. Trying OpenAI fallback.`,
        );
      }
    }

    // Fallback to OpenAI
    if (this.openAiClient) {
      try {
        const res = await this.openAiClient.chat.completions.create({
          model: this.openAiModel,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 300,
          temperature: 0.3,
        });

        const content = res.choices[0]?.message?.content;
        if (content) {
          return { content, model: `openai/${this.openAiModel}` };
        }
      } catch (err) {
        this.logger.warn(
          `OpenAI fallback also failed: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    return null;
  }

  private parseResponse(content: string, model: string): AiRationaleResult | null {
    try {
      // Strip markdown code fences if present
      const cleaned = content
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();
      const parsed = JSON.parse(cleaned);

      const riskLevel = ['low', 'medium', 'high'].includes(parsed.riskLevel)
        ? (parsed.riskLevel as 'low' | 'medium' | 'high')
        : 'medium';

      return {
        aiSummary: String(parsed.summary || '').slice(0, 1000),
        riskLevel,
        riskReason: String(parsed.riskReason || '').slice(0, 500),
        aiModel: model,
        aiEnriched: true,
      };
    } catch (err) {
      this.logger.warn(`Failed to parse AI response: ${err instanceof Error ? err.message : err}`);
      return null;
    }
  }
}
