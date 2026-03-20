import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SuggestionsService } from './suggestions.service.js';
import { MockTriggerService } from './mock-trigger.service.js';
import { FspResourceService } from '../../fsp/fsp-resource.service.js';
import { FspTrainingService } from '../../fsp/fsp-training.service.js';
import { AiService } from '../ai/ai.service.js';
import type { AiRationaleInput } from '../ai/ai.service.js';
import { AutoApproveService } from './auto-approve.service.js';
import { db } from '../../../db/index.js';
import { suggestions } from '../../../db/schema/suggestions.js';
import { students } from '../../../db/schema/students.js';
import { instructors } from '../../../db/schema/instructors.js';
import { aircraft } from '../../../db/schema/aircraft.js';
import { activityTypes } from '../../../db/schema/activity-types.js';
import { eq, and } from 'drizzle-orm';

interface AuthenticatedRequest {
  user: {
    userId: string;
    email: string;
    operatorId: number;
    permissions: string[];
  };
}

interface DeclineBody {
  reason?: string;
}

interface BulkApproveBody {
  suggestionIds: string[];
}

interface BulkDeclineBody {
  suggestionIds: string[];
  reason?: string;
}

@Controller('suggestions')
export class SuggestionsController {
  constructor(
    private readonly suggestionsService: SuggestionsService,
    private readonly mockTriggerService: MockTriggerService,
    private readonly fspResourceService: FspResourceService,
    private readonly fspTrainingService: FspTrainingService,
    private readonly aiService: AiService,
    private readonly autoApproveService: AutoApproveService,
    @InjectQueue('ai-enrich-suggestion') private readonly aiEnrichQueue: Queue,
  ) {}

  /**
   * Enrich raw suggestion rows with display names from FSP.
   * Resolves studentId → studentName, instructorId → instructorName, aircraftId → registration.
   */
  private async enrichSuggestions(operatorId: number, rows: Record<string, unknown>[]) {
    const fspToken = ''; // Mock mode doesn't need a real token
    const [students, instructors, aircraft] = await Promise.all([
      this.fspTrainingService.getStudents(operatorId, fspToken).catch(() => []),
      this.fspResourceService.getInstructors(operatorId, fspToken).catch(() => []),
      this.fspResourceService.getAircraft(operatorId, fspToken).catch(() => []),
    ]);

    const studentMap = new Map(students.map((s) => [s.id, `${s.firstName} ${s.lastName}`]));
    const instructorMap = new Map(instructors.map((i) => [i.id, i.fullName]));
    const aircraftMap = new Map(aircraft.map((a) => [a.id, a.registration]));

    return rows.map((row) => {
      const sid = row.studentId as string | null;
      // Discovery flights store prospect name as "prospect:FirstName LastName"
      const studentName = sid?.startsWith('prospect:')
        ? sid.slice(9)
        : studentMap.get(sid ?? '') ?? null;

      return {
        ...row,
        studentName,
        instructorName: instructorMap.get(row.instructorId as string) ?? null,
        aircraftRegistration: aircraftMap.get(row.aircraftId as string) ?? null,
      };
    });
  }

  /**
   * GET /api/v1/suggestions
   * List suggestions with optional filters.
   * Query params: status, type, locationId, dateFrom, dateTo, page, pageSize
   */
  @Get()
  async list(
    @Req() req: AuthenticatedRequest,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('locationId') locationId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const result = await this.suggestionsService.list({
      operatorId: req.user.operatorId,
      status,
      type,
      locationId,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo + 'T23:59:59.999') : undefined,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });

    const enriched = await this.enrichSuggestions(
      req.user.operatorId,
      result.data as unknown as Record<string, unknown>[],
    );

    return { data: enriched, pagination: result.pagination };
  }

  /**
   * POST /api/v1/suggestions/mock-trigger
   * Generate mock suggestions from real DB data and enqueue AI enrichment.
   */
  @Post('mock-trigger')
  @HttpCode(HttpStatus.OK)
  async mockTrigger(@Req() req: AuthenticatedRequest) {
    try {
      const result = await this.mockTriggerService.trigger(
        req.user.operatorId,
        req.user.userId,
      );
      return {
        data: {
          suggestionIds: result.suggestionIds,
          count: result.count,
          message: `Created ${result.count} suggestions — AI enrichment in progress`,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Mock trigger failed';
      return {
        data: { suggestionIds: [], count: 0, message },
      };
    }
  }

  /**
   * GET /api/v1/suggestions/:id
   * Get a single suggestion by ID.
   */
  @Get(':id')
  async getById(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const suggestion = await this.suggestionsService.getById(
      req.user.operatorId,
      id,
    );
    return { data: suggestion };
  }

  /**
   * POST /api/v1/suggestions/:id/approve
   * Approve a pending suggestion — validates and creates an FSP reservation.
   */
  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  async approve(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    // TODO: FSP token storage per operator — currently we don't persist the FSP
    // bearer token after login. When operator-level FSP token storage is
    // implemented (Phase 4), replace this placeholder with the real token
    // retrieved from the operator's stored credentials.
    const fspToken = '';

    const result = await this.suggestionsService.approve(
      req.user.operatorId,
      id,
      req.user.userId,
      fspToken,
    );

    return { data: result };
  }

  /**
   * POST /api/v1/suggestions/:id/decline
   * Decline a pending suggestion with an optional reason.
   */
  @Post(':id/decline')
  @HttpCode(HttpStatus.OK)
  async decline(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: DeclineBody,
  ) {
    const suggestion = await this.suggestionsService.decline(
      req.user.operatorId,
      id,
      req.user.userId,
      body.reason,
    );

    return { data: suggestion };
  }

  /**
   * POST /api/v1/suggestions/bulk-approve
   * Approve multiple suggestions at once. Each is processed independently.
   */
  @Post('bulk-approve')
  @HttpCode(HttpStatus.OK)
  async bulkApprove(
    @Req() req: AuthenticatedRequest,
    @Body() body: BulkApproveBody,
  ) {
    // TODO: FSP token storage per operator — see approve() TODO above
    const fspToken = '';

    const result = await this.suggestionsService.bulkApprove(
      req.user.operatorId,
      body.suggestionIds,
      req.user.userId,
      fspToken,
    );

    return { data: result };
  }

  /**
   * POST /api/v1/suggestions/bulk-decline
   * Decline multiple suggestions at once with an optional reason.
   */
  @Post('bulk-decline')
  @HttpCode(HttpStatus.OK)
  async bulkDecline(
    @Req() req: AuthenticatedRequest,
    @Body() body: BulkDeclineBody,
  ) {
    const result = await this.suggestionsService.bulkDecline(
      req.user.operatorId,
      body.suggestionIds,
      req.user.userId,
      body.reason,
    );

    return { data: result };
  }

  /**
   * POST /api/v1/suggestions/ai-enrich
   * Process AI enrichment on all un-enriched suggestions for this operator.
   * Calls Claude/OpenAI directly and updates each suggestion's rationale.
   */
  @Post('ai-enrich')
  @HttpCode(HttpStatus.OK)
  async triggerAiEnrich(@Req() req: AuthenticatedRequest) {
    const operatorId = req.user.operatorId;

    if (!this.aiService.isAvailable) {
      return { data: { enriched: 0, message: 'AI service not configured — no API keys found' } };
    }

    const pending = await this.suggestionsService.listForAiEnrich(operatorId);
    let enriched = 0;
    let failed = 0;

    for (const s of pending) {
      try {
        // Load full suggestion
        const [suggestion] = await db
          .select()
          .from(suggestions)
          .where(and(eq(suggestions.id, s.id), eq(suggestions.operatorId, operatorId)))
          .limit(1);
        if (!suggestion) continue;

        // Load related entities
        const [student] = suggestion.studentId
          ? await db.select().from(students).where(eq(students.id, suggestion.studentId)).limit(1)
          : [null];
        const [instructor] = suggestion.instructorId
          ? await db.select().from(instructors).where(eq(instructors.id, suggestion.instructorId)).limit(1)
          : [null];
        const [craft] = suggestion.aircraftId
          ? await db.select().from(aircraft).where(eq(aircraft.id, suggestion.aircraftId)).limit(1)
          : [null];
        const [activity] = suggestion.activityTypeId
          ? await db.select().from(activityTypes).where(eq(activityTypes.id, suggestion.activityTypeId)).limit(1)
          : [null];

        const existingRationale = suggestion.rationale as Record<string, unknown>;
        const constraints = existingRationale?.constraints as Record<string, boolean> | undefined;

        const input: AiRationaleInput = {
          suggestionType: suggestion.type as AiRationaleInput['suggestionType'],
          studentName: student ? `${student.firstName} ${student.lastName}` : undefined,
          totalFlightHours: student ? Number(student.totalFlightHours) : undefined,
          enrollmentProgress: suggestion.enrollmentId ? `Course ${suggestion.courseId}, Lesson ${suggestion.lessonId}` : undefined,
          proposedStart: suggestion.proposedStart.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }),
          proposedEnd: suggestion.proposedEnd.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
          activityType: activity?.name,
          instructorName: instructor ? `${instructor.firstName} ${instructor.lastName}` : undefined,
          aircraftRegistration: craft?.registration,
          rankingScore: suggestion.rankingScore ? Number(suggestion.rankingScore) : undefined,
          constraintsPassed: constraints ? Object.entries(constraints).filter(([, v]) => v === true).map(([k]) => k) : [],
          constraintsFailed: constraints ? Object.entries(constraints).filter(([, v]) => v === false).map(([k]) => k) : [],
          policyNotes: Array.isArray(existingRationale?.policies) ? existingRationale.policies as string[] : Object.keys((existingRationale?.policies as Record<string, unknown>) ?? {}),
        };

        const result = await this.aiService.generateRationale(input);
        if (!result) { failed++; continue; }

        await db.update(suggestions).set({
          rationale: { ...existingRationale, aiSummary: result.aiSummary, riskLevel: result.riskLevel, riskReason: result.riskReason, aiModel: result.aiModel, aiEnriched: true },
          updatedAt: new Date(),
        }).where(eq(suggestions.id, s.id));

        // Try auto-approve if enabled
        await this.autoApproveService.checkAndAutoApprove(operatorId, s.id).catch(() => {});

        enriched++;
      } catch {
        failed++;
      }
    }

    return { data: { enriched, failed, total: pending.length, message: `AI enriched ${enriched}/${pending.length} suggestions` } };
  }
}
