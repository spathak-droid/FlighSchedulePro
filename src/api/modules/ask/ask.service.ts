import { Injectable, Logger } from '@nestjs/common';
import { AiService } from '../ai/ai.service.js';
import { db } from '../../../db/index.js';
import {
  students,
  instructors,
  aircraft,
  suggestions,
  studentInsights,
} from '../../../db/schema/index.js';
import { eq, desc } from 'drizzle-orm';
import {
  MOCK_STUDENTS_BY_OPERATOR,
  MOCK_AIRCRAFT_BY_OPERATOR,
  MOCK_INSTRUCTORS_BY_OPERATOR,
  MOCK_ENROLLMENTS_BY_OPERATOR,
  MOCK_ENROLLMENT_PROGRESS,
  MOCK_LOCATIONS_BY_OPERATOR,
  MOCK_ACTIVITY_TYPES,
  generateScheduleEvents,
  generateSchedulableEvents,
} from '../../fsp/mock/mock-data.js';

export interface AskRequest {
  question: string;
  conversationHistory?: { role: 'user' | 'assistant'; content: string }[];
}

export interface AskResponse {
  answer: string;
  model: string;
}

@Injectable()
export class AskService {
  private readonly logger = new Logger(AskService.name);

  constructor(private readonly aiService: AiService) {}

  async ask(operatorId: number, request: AskRequest): Promise<AskResponse> {
    const context = await this.gatherContext(operatorId);
    const systemPrompt = this.buildSystemPrompt(context);

    const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: systemPrompt },
    ];

    // Add conversation history for multi-turn
    if (request.conversationHistory?.length) {
      for (const msg of request.conversationHistory.slice(-10)) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    messages.push({ role: 'user', content: request.question });

    const result = await this.callAi(messages);

    return {
      answer: result?.content ?? 'Sorry, I was unable to process your question. Please try again.',
      model: result?.model ?? 'unavailable',
    };
  }

  private async gatherContext(operatorId: number): Promise<string> {
    const sections: string[] = [];

    // 1. Students (from mock data, keyed by operator)
    const opStudents = MOCK_STUDENTS_BY_OPERATOR[operatorId] ?? [];
    if (opStudents.length > 0) {
      sections.push('## Students');
      for (const s of opStudents) {
        sections.push(`- ${s.fullName} (ID: ${s.id}, email: ${s.email})`);
      }
    }

    // 2. Enrollments + progress
    const opEnrollments = MOCK_ENROLLMENTS_BY_OPERATOR[operatorId] ?? {};
    if (Object.keys(opEnrollments).length > 0) {
      sections.push('\n## Enrollments & Progress');
      for (const [studentId, enrollments] of Object.entries(opEnrollments)) {
        const student = opStudents.find((s) => s.id === studentId);
        for (const enr of enrollments) {
          const progress = MOCK_ENROLLMENT_PROGRESS[enr.id];
          const progressStr = progress
            ? ` — ${progress.completedLessons}/${progress.totalLessons} lessons (${Math.round((progress.completedLessons / progress.totalLessons) * 100)}%)`
            : '';
          sections.push(
            `- ${student?.fullName ?? studentId}: ${enr.courseName} (${enr.status})${progressStr}`,
          );
        }
      }
    }

    // 3. Aircraft
    const opAircraft = MOCK_AIRCRAFT_BY_OPERATOR[operatorId] ?? [];
    if (opAircraft.length > 0) {
      sections.push('\n## Aircraft Fleet');
      for (const a of opAircraft) {
        sections.push(
          `- ${a.registration} — ${a.makeModel}${a.isSimulator ? ' (SIMULATOR)' : ''}${a.isActive ? '' : ' [INACTIVE]'}`,
        );
      }
    }

    // 4. Instructors
    const opInstructors = MOCK_INSTRUCTORS_BY_OPERATOR[operatorId] ?? [];
    if (opInstructors.length > 0) {
      sections.push('\n## Instructors');
      for (const i of opInstructors) {
        sections.push(
          `- ${i.fullName} (${i.instructorType})${i.isActive ? '' : ' [INACTIVE]'}`,
        );
      }
    }

    // 5. Locations
    const opLocations = MOCK_LOCATIONS_BY_OPERATOR[operatorId] ?? [];
    if (opLocations.length > 0) {
      sections.push('\n## Locations');
      for (const loc of opLocations) {
        sections.push(`- ${loc.name} (${loc.code})`);
      }
    }

    // 6. Activity types
    sections.push('\n## Activity Types');
    for (const at of MOCK_ACTIVITY_TYPES) {
      sections.push(`- ${at.name}`);
    }

    // 7. Current schedule (next 7 days)
    const scheduleEvents = generateScheduleEvents();
    if (scheduleEvents.length > 0) {
      sections.push('\n## Schedule (Next 7 Days)');
      for (const ev of scheduleEvents) {
        const startDate = new Date(ev.Start);
        const dayLabel = startDate.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        });
        const startTime = startDate.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
        });
        const endTime = new Date(ev.End).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
        });
        sections.push(
          `- ${dayLabel} ${startTime}-${endTime}: ${ev.Title} | Student: ${ev.CustomerName} | Instructor: ${ev.InstructorName || 'N/A'} | Aircraft: ${ev.AircraftName}`,
        );
      }
    }

    // 8. Upcoming lessons to schedule
    const schedulable = generateSchedulableEvents();
    if (schedulable.length > 0) {
      sections.push('\n## Upcoming Lessons Needing Scheduling');
      for (const se of schedulable) {
        sections.push(
          `- ${se.studentFirstName} ${se.studentLastName}: ${se.lessonName} (${se.courseName}, ${se.durationTotal}min)${se.isStageCheck ? ' [STAGE CHECK]' : ''}${se.instructorRequired ? '' : ' [NO INSTRUCTOR REQUIRED]'}`,
        );
      }
    }

    // 9. DB: pending suggestions
    try {
      const pendingSuggestions = await db
        .select()
        .from(suggestions)
        .where(eq(suggestions.operatorId, operatorId))
        .orderBy(desc(suggestions.createdAt))
        .limit(20);

      if (pendingSuggestions.length > 0) {
        sections.push('\n## Recent Suggestions');
        for (const s of pendingSuggestions) {
          const rationale = s.rationale as Record<string, unknown> | null;
          sections.push(
            `- [${s.status.toUpperCase()}] ${s.type}: Student ${s.studentId ?? 'N/A'} | ${s.proposedStart?.toISOString() ?? 'N/A'} — ${s.proposedEnd?.toISOString() ?? 'N/A'} | Score: ${s.rankingScore ?? 'N/A'}${rationale?.aiSummary ? ` | AI: ${rationale.aiSummary}` : ''}`,
          );
        }
      }
    } catch {
      // DB may not be seeded yet, skip
    }

    // 10. DB: student insights
    try {
      const insights = await db
        .select()
        .from(studentInsights)
        .where(eq(studentInsights.operatorId, operatorId))
        .limit(20);

      if (insights.length > 0) {
        sections.push('\n## Student Insights');
        for (const ins of insights) {
          const flags: string[] = [];
          if (ins.isInactive) flags.push('INACTIVE');
          if (ins.isCheckrideReady) flags.push('CHECKRIDE READY');
          if (ins.isAtRisk) flags.push(`AT RISK: ${ins.riskReason ?? ''}`);
          sections.push(
            `- ${ins.studentName}: ${ins.totalFlightHours ?? 0}h total, last flight ${ins.daysSinceLastFlight ?? '?'} days ago, progress ${ins.enrollmentProgress ?? '?'}%${flags.length ? ` [${flags.join(', ')}]` : ''}`,
          );
        }
      }
    } catch {
      // skip
    }

    return sections.join('\n');
  }

  private buildSystemPrompt(context: string): string {
    return `You are an AI scheduling assistant for FlightSchedule Pro, a flight school management system. You have full access to the school's data and help schedulers make informed decisions.

You know everything about:
- Students: who they are, their training progress, enrollment status
- Aircraft: the fleet, what's available, simulators vs real planes
- Instructors: who's available, their certifications (CFI, CFII)
- Schedule: what's booked, where there are gaps
- Suggestions: pending scheduling suggestions and their status
- Student insights: who's at risk, inactive, or checkride ready

When answering questions:
- Be specific and reference actual data (names, dates, aircraft registrations)
- If asked about scheduling, consider instructor availability, aircraft availability, and student progress
- If asked about students, include their enrollment progress and any risk flags
- Keep answers concise but thorough
- Use markdown formatting for readability
- If you don't have enough information to answer precisely, say so

Here is the current school data:

${context}`;
  }

  private async callAi(
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  ): Promise<{ content: string; model: string } | null> {
    // Access the AI clients through the service's internals
    // We need to use the OpenAI-compatible API directly for chat with system prompts
    const orKey = process.env.OPEN_ROUTER_API_KEY;
    const oaiKey = process.env.OPENAI_API_KEY;
    const orModel = process.env.OPEN_ROUTER_MODEL ?? 'anthropic/claude-haiku-4.5';
    const oaiModel = process.env.OPEN_AI_MODEL ?? 'gpt-4.1-nano';

    // Try OpenRouter first
    if (orKey) {
      try {
        const { default: OpenAI } = await import('openai');
        const client = new OpenAI({
          baseURL: 'https://openrouter.ai/api/v1',
          apiKey: orKey,
        });
        const res = await client.chat.completions.create({
          model: orModel,
          messages,
          max_tokens: 1500,
          temperature: 0.4,
        });
        const content = res.choices[0]?.message?.content;
        if (content) return { content, model: `openrouter/${orModel}` };
      } catch (err) {
        this.logger.warn(`OpenRouter ask failed: ${err instanceof Error ? err.message : err}`);
      }
    }

    // Fallback to OpenAI
    if (oaiKey) {
      try {
        const { default: OpenAI } = await import('openai');
        const client = new OpenAI({ apiKey: oaiKey });
        const res = await client.chat.completions.create({
          model: oaiModel,
          messages,
          max_tokens: 1500,
          temperature: 0.4,
        });
        const content = res.choices[0]?.message?.content;
        if (content) return { content, model: `openai/${oaiModel}` };
      } catch (err) {
        this.logger.warn(`OpenAI ask fallback failed: ${err instanceof Error ? err.message : err}`);
      }
    }

    return null;
  }
}
