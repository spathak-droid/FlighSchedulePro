import { Injectable, Logger } from '@nestjs/common';
import { AiService } from '../ai/ai.service.js';
import { EmailService } from '../notifications/email.service.js';
import { NotificationService } from '../notifications/notification.service.js';
import { db } from '../../../db/index.js';
import { suggestions, studentInsights, notificationRecords } from '../../../db/schema/index.js';
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
import type { NotificationContent } from '../../../core/types/domain.js';

export interface AskRequest {
  question: string;
  conversationHistory?: { role: 'user' | 'assistant'; content: string }[];
}

export interface EmailSendResult {
  recipientName: string;
  recipientEmail: string;
  subject: string;
  success: boolean;
  error?: string;
}

export interface AskResponse {
  answer: string;
  model: string;
  emailsSent?: EmailSendResult[];
}

/** Parsed email action from AI response. */
interface EmailAction {
  recipients: { studentId: string; name: string; email: string }[];
  subject: string;
  body: string;
  intent: string;
}

/** Maximum number of previous conversation messages to include for context. */
const MAX_CONVERSATION_HISTORY = 10;
/** Maximum number of recent suggestions to include in context. */
const MAX_RECENT_SUGGESTIONS = 20;
/** Maximum number of student insights to include in context. */
const MAX_STUDENT_INSIGHTS = 20;
/** Maximum tokens for AI response. */
const AI_MAX_TOKENS = 2000;
/** Temperature for AI response (lower = more deterministic). */
const AI_TEMPERATURE = 0.4;

/** Regex to extract EMAIL_ACTION blocks from AI response. */
const EMAIL_ACTION_REGEX = /\[EMAIL_ACTION\]([\s\S]*?)\[\/EMAIL_ACTION\]/g;

@Injectable()
export class AskService {
  private readonly logger = new Logger(AskService.name);

  constructor(
    private readonly aiService: AiService,
    private readonly emailService: EmailService,
    private readonly notificationService: NotificationService,
  ) {}

  async ask(operatorId: number, request: AskRequest): Promise<AskResponse> {
    const context = await this.gatherContext(operatorId);
    const systemPrompt = this.buildSystemPrompt(context);

    const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: systemPrompt },
    ];

    // Add conversation history for multi-turn
    if (request.conversationHistory?.length) {
      for (const msg of request.conversationHistory.slice(-MAX_CONVERSATION_HISTORY)) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    messages.push({ role: 'user', content: request.question });

    const result = await this.callAi(messages);

    if (!result) {
      return {
        answer: 'Sorry, I was unable to process your question. Please try again.',
        model: 'unavailable',
      };
    }

    // Parse email actions from AI response
    const { textContent, emailActions } = this.parseEmailActions(result.content);

    let emailsSent: EmailSendResult[] | undefined;

    if (emailActions.length > 0) {
      emailsSent = await this.executeEmailActions(operatorId, emailActions);
    }

    return {
      answer: textContent,
      model: result.model,
      emailsSent,
    };
  }

  /**
   * Parse AI response for [EMAIL_ACTION]...[/EMAIL_ACTION] blocks.
   * Returns the text content (with action blocks removed) and parsed actions.
   */
  private parseEmailActions(content: string): {
    textContent: string;
    emailActions: EmailAction[];
  } {
    const emailActions: EmailAction[] = [];
    let match: RegExpExecArray | null;

    while ((match = EMAIL_ACTION_REGEX.exec(content)) !== null) {
      try {
        const jsonStr = match[1]!
          .replace(/```json\s*/g, '')
          .replace(/```\s*/g, '')
          .trim();
        const parsed = JSON.parse(jsonStr) as EmailAction;

        if (parsed.recipients?.length && parsed.subject && parsed.body) {
          emailActions.push(parsed);
        }
      } catch (err) {
        this.logger.warn(`Failed to parse EMAIL_ACTION block: ${err instanceof Error ? err.message : err}`);
      }
    }

    // Remove action blocks from the visible text
    const textContent = content.replace(EMAIL_ACTION_REGEX, '').trim();

    return { textContent, emailActions };
  }

  /**
   * Execute parsed email actions: look for templates, generate HTML, send via Resend, record.
   */
  private async executeEmailActions(
    operatorId: number,
    actions: EmailAction[],
  ): Promise<EmailSendResult[]> {
    const results: EmailSendResult[] = [];

    for (const action of actions) {
      // Try to find a matching template for the intent
      const template = await this.notificationService.getTemplate(
        operatorId,
        action.intent || 'outreach',
        'email',
      );

      for (const recipient of action.recipients) {
        try {
          let subject = action.subject;
          let htmlBody: string;

          if (template) {
            // Use existing template, render with variables
            const variables: Record<string, string> = {
              studentName: recipient.name,
              email: recipient.email,
            };
            const rendered = this.notificationService.renderTemplate(
              template.subject ?? action.subject,
              template.bodyTemplate,
              variables,
            );
            subject = rendered.subject;
            htmlBody = this.wrapInEmailLayout(
              rendered.body
                .split('\n')
                .map((line: string) =>
                  line.trim()
                    ? `<p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 12px 0;">${line}</p>`
                    : '',
                )
                .join('\n'),
            );
          } else {
            // Use AI-generated content, personalize per recipient
            const personalizedBody = action.body
              .replace(/\{\{studentName\}\}/g, recipient.name)
              .replace(/\{\{name\}\}/g, recipient.name);
            subject = action.subject
              .replace(/\{\{studentName\}\}/g, recipient.name)
              .replace(/\{\{name\}\}/g, recipient.name);

            htmlBody = this.wrapInEmailLayout(
              personalizedBody
                .split('\n')
                .map((line: string) =>
                  line.trim()
                    ? `<p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 12px 0;">${line}</p>`
                    : '',
                )
                .join('\n'),
            );
          }

          const emailResult = await this.emailService.sendEmail({
            to: recipient.email,
            subject,
            html: htmlBody,
          });

          // Record in notification_records
          try {
            await db.insert(notificationRecords).values({
              operatorId,
              recipientType: 'student',
              recipientId: recipient.studentId,
              channel: 'email',
              templateId: template?.id ?? null,
              content: {
                subject,
                body: htmlBody,
                templateId: template?.id,
              } satisfies NotificationContent,
              deliveryStatus: emailResult.success ? 'sent' : 'failed',
              deliveryError: emailResult.error ?? null,
              sentAt: emailResult.success ? new Date() : null,
            });
          } catch (dbErr) {
            this.logger.warn(`Failed to record notification: ${dbErr instanceof Error ? dbErr.message : dbErr}`);
          }

          results.push({
            recipientName: recipient.name,
            recipientEmail: recipient.email,
            subject,
            success: emailResult.success,
            error: emailResult.error,
          });

          this.logger.log(
            `Email ${emailResult.success ? 'sent' : 'failed'} to ${recipient.name} <${recipient.email}>: "${subject}"`,
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.error(`Failed to send email to ${recipient.email}: ${msg}`);
          results.push({
            recipientName: recipient.name,
            recipientEmail: recipient.email,
            subject: action.subject,
            success: false,
            error: msg,
          });
        }
      }
    }

    return results;
  }

  /**
   * Wrap HTML content in the branded FlightSchedule Pro email layout.
   */
  private wrapInEmailLayout(content: string): string {
    return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #e5e7eb;">
        <div style="background: #1e40af; padding: 24px 32px;">
          <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 600;">FlightSchedule Pro</h1>
        </div>
        <div style="padding: 32px;">
          ${content}
        </div>
        <div style="padding: 16px 32px; background: #f9fafb; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">
          This is an automated notification from FlightSchedule Pro. Please contact your flight school if you have any questions.
        </div>
      </div>
    `;
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
        sections.push(`- ${i.fullName} (${i.instructorType})${i.isActive ? '' : ' [INACTIVE]'}`);
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
        .limit(MAX_RECENT_SUGGESTIONS);

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
        .limit(MAX_STUDENT_INSIGHTS);

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

## Email Tool

You can send emails to students on behalf of the flight school. When the user asks you to send an email (e.g. "email inactive students", "send a check-in email to Sarah", "reach out to students who haven't flown recently"), you MUST:

1. First describe what you'll send in your text response (who, what subject, what the email will say)
2. Then include an [EMAIL_ACTION] block with the email details

The format for sending emails is:

[EMAIL_ACTION]
{
  "intent": "outreach",
  "recipients": [
    {"studentId": "stu-001", "name": "Alex Johnson", "email": "alex.j@email.com"}
  ],
  "subject": "The email subject line",
  "body": "The email body text.\\nUse newlines for paragraphs.\\nKeep it warm, professional, and encouraging.\\nSign off as the flight school team."
}
[/EMAIL_ACTION]

**Important rules for the email tool:**
- Use the student data provided below to find correct IDs, names, and emails
- The "intent" field should describe the email category (e.g. "outreach", "check_in", "progress_update", "congratulations", "reminder", "re_engagement")
- Write warm, professional, encouraging emails appropriate for a flight school
- Personalize emails using the student's name and their actual data (flight hours, progress, days since last flight, etc.)
- You can include multiple recipients in one action to send the same email template to all of them
- If students need different content, use separate [EMAIL_ACTION] blocks
- Use {{studentName}} in the body/subject as a placeholder — it will be replaced with each recipient's name
- Always confirm in your text response what emails you're sending before the action block
- The system will wrap your body text in a branded HTML email template automatically

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
          max_tokens: AI_MAX_TOKENS,
          temperature: AI_TEMPERATURE,
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
          max_tokens: AI_MAX_TOKENS,
          temperature: AI_TEMPERATURE,
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
