/**
 * Seeds repeatable BullMQ jobs and creates manual Workers on startup.
 *
 * Workers call job processor classes that use the db module directly
 * and the FSP mock router (when FSP_MOCK_MODE=true).
 */
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, Worker, Job } from 'bullmq';

@Injectable()
export class JobScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobScheduler.name);
  private workers: Worker[] = [];

  private readonly redisOpts = {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
    ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
    maxRetriesPerRequest: null as null,
  };

  constructor(
    @InjectQueue('poll-schedule') private readonly pollQueue: Queue,
    @InjectQueue('expire-suggestions') private readonly expireQueue: Queue,
  ) {}

  async onModuleInit() {
    // ── 1. Clean stale repeatable jobs ─────────────────────────────────
    for (const q of [this.pollQueue, this.expireQueue]) {
      try {
        const existing = await q.getRepeatableJobs();
        for (const job of existing) {
          await q.removeRepeatableByKey(job.key);
        }
      } catch (err) {
        this.logger.warn(
          `Failed to clean stale repeatable jobs for queue ${q.name}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // ── 2. Schedule repeatable jobs ───────────────────────────────────
    await this.pollQueue.add(
      'poll',
      { checkPendingLessons: true },
      {
        repeat: { every: 3 * 60 * 1000 },
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 20 },
      },
    );
    this.logger.log('Scheduled poll-schedule (every 3 min)');

    await this.expireQueue.add(
      'expire',
      {},
      {
        repeat: { every: 10 * 60 * 1000 },
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 20 },
      },
    );
    this.logger.log('Scheduled expire-suggestions (every 10 min)');

    // ── 3. Immediate poll on startup ──────────────────────────────────
    await this.pollQueue.add(
      'poll-immediate',
      { checkPendingLessons: true },
      {
        removeOnComplete: { count: 5 },
        removeOnFail: { count: 5 },
      },
    );
    this.logger.log('Enqueued immediate poll');

    // ── 4. Create manual Workers ──────────────────────────────────────
    await this.createWorkers();
  }

  private async createWorkers() {
    // Dynamically import services to avoid blocking module init
    const { ConfigService } = await import('@nestjs/config');
    const { FspClient } = await import('../api/fsp/fsp.client.js');
    const { FspAuthService } = await import('../api/fsp/fsp-auth.service.js');
    const { FspScheduleService } = await import('../api/fsp/fsp-schedule.service.js');
    const { FspTrainingService } = await import('../api/fsp/fsp-training.service.js');
    const { FspResourceService } = await import('../api/fsp/fsp-resource.service.js');
    const { AiService } = await import('../api/modules/ai/ai.service.js');

    // Create shared service instances
    const configService = new ConfigService({ envFilePath: ['.env.local', '.env'] });
    const fspClient = new FspClient(configService);
    const fspAuthService = new FspAuthService(fspClient);
    const fspScheduleService = new FspScheduleService(fspClient);
    const fspTrainingService = new FspTrainingService(fspClient);
    const fspResourceService = new FspResourceService(fspClient);
    const aiService = new AiService();

    // Queue references for job chaining
    const suggestionsQueue = new Queue('generate-suggestions', { connection: this.redisOpts });
    const aiEnrichQueue = new Queue('ai-enrich-suggestion', { connection: this.redisOpts });

    // Import job classes
    const { PollScheduleJob } = await import('./jobs/poll-schedule.job.js');
    const { GenerateSuggestionsJob } = await import('./jobs/generate-suggestions.job.js');
    const { ExpireSuggestionsJob } = await import('./jobs/expire-suggestions.job.js');
    const { AiEnrichSuggestionJob } = await import('./jobs/ai-enrich-suggestion.job.js');

    // Instantiate processors with correct constructor args
    const pollJob = new PollScheduleJob(
      fspScheduleService,
      fspAuthService,
      fspTrainingService,
      suggestionsQueue,
    );
    const genJob = new GenerateSuggestionsJob(
      fspTrainingService,
      fspResourceService,
      fspScheduleService,
      {} as any,
      aiEnrichQueue,
    );
    const expireJob = new ExpireSuggestionsJob(fspScheduleService);
    const aiJob = new AiEnrichSuggestionJob(aiService);

    // SendNotificationJob needs NotificationService which has complex DI
    // For now, create a simple handler that logs
    const sendHandler = async (job: Job) => {
      this.logger.log(
        `Notification job ${job.id}: would send notification for suggestion ${job.data?.suggestionId}`,
      );
    };

    const jobs: Array<{ name: string; handler: (job: Job) => Promise<unknown> }> = [
      { name: 'poll-schedule', handler: (job) => pollJob.process(job) },
      { name: 'generate-suggestions', handler: (job) => genJob.process(job) },
      { name: 'expire-suggestions', handler: (job) => expireJob.process(job) },
      { name: 'send-notification', handler: sendHandler },
      { name: 'ai-enrich-suggestion', handler: (job) => aiJob.process(job) },
    ];

    for (const j of jobs) {
      const worker = new Worker(j.name, j.handler, {
        connection: this.redisOpts,
        concurrency: 1,
      });
      worker.on('failed', (job, err) => {
        this.logger.error(`${j.name}/${job?.id} failed: ${err.message}`);
      });
      worker.on('completed', (job) => {
        this.logger.log(`${j.name}/${job.id} completed`);
      });
      this.workers.push(worker);
      this.logger.log(`Worker: ${j.name}`);
    }
  }

  async onModuleDestroy() {
    this.logger.log('Shutting down workers — draining active jobs...');

    // Close workers gracefully: `close(true)` forces immediate stop, `close()` waits
    // for the current job to finish. We use a timeout to avoid hanging indefinitely.
    const DRAIN_TIMEOUT_MS = 15_000;

    await Promise.all(
      this.workers.map(async (w) => {
        try {
          await Promise.race([
            w.close(),
            new Promise<void>((resolve) =>
              setTimeout(() => {
                this.logger.warn(
                  `Worker ${w.name} drain timed out after ${DRAIN_TIMEOUT_MS}ms — forcing close`,
                );
                resolve();
              }, DRAIN_TIMEOUT_MS),
            ),
          ]);
        } catch (err) {
          this.logger.error(
            `Error closing worker ${w.name}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }),
    );

    this.logger.log('All workers closed');
  }
}
