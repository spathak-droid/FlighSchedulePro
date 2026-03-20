import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock database - use inline functions to avoid hoisting issues
// ---------------------------------------------------------------------------

vi.mock('../../../../../src/db/index.js', () => {
  const mockInsertReturning = vi.fn().mockResolvedValue([{ id: 'notif-1' }]);
  const mockInsertValues = vi.fn().mockReturnValue({ returning: mockInsertReturning });
  const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues });

  const mockSelectLimit = vi.fn().mockResolvedValue([]);
  const mockSelectWhere = vi.fn().mockReturnValue({ limit: mockSelectLimit });
  const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere, orderBy: vi.fn().mockResolvedValue([]) });

  const mockUpdateReturning = vi.fn().mockResolvedValue([{}]);
  const mockUpdateWhere = vi.fn().mockReturnValue({ returning: mockUpdateReturning });
  const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
  const mockUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet });

  return {
    db: {
      select: () => ({ from: mockSelectFrom }),
      insert: mockInsert,
      update: mockUpdate,
      __mocks: {
        mockSelectLimit,
        mockSelectFrom,
        mockInsert,
        mockInsertValues,
        mockInsertReturning,
      },
    },
  };
});

vi.mock('../../../../../src/db/schema/index.js', () => ({
  notificationRecords: { id: 'id' },
  notificationTemplates: {
    id: 'id',
    operatorId: 'operatorId',
    type: 'type',
    channel: 'channel',
    isActive: 'isActive',
  },
  prospects: { id: 'id' },
  students: { id: 'id' },
  instructors: { id: 'id' },
  aircraft: { id: 'id' },
  activityTypes: { id: 'id' },
}));

vi.mock('../../../../../src/db/schema/scheduling-policies.js', () => ({
  schedulingPolicies: { operatorId: 'operatorId' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: unknown, val: unknown) => ({ type: 'eq', val })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { db } from '../../../../../src/db/index.js';
import { NotificationService } from '../../../../../src/api/modules/notifications/notification.service.js';
import type { SmsProvider, SmsResult } from '../../../../../src/api/modules/notifications/sms-provider.interface.js';
import type { AuditService } from '../../../../../src/api/modules/activity/audit.service.js';
import type { EmailService } from '../../../../../src/api/modules/notifications/email.service.js';
import type { NotificationDispatchParams } from '../../../../../src/api/modules/notifications/notification.service.js';

// Access the internal mocks
const mocks = (db as any).__mocks as {
  mockSelectLimit: ReturnType<typeof vi.fn>;
  mockSelectFrom: ReturnType<typeof vi.fn>;
  mockInsert: ReturnType<typeof vi.fn>;
  mockInsertValues: ReturnType<typeof vi.fn>;
  mockInsertReturning: ReturnType<typeof vi.fn>;
};

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function createMockSmsProvider(): SmsProvider {
  return {
    send: vi.fn<[string, string], Promise<SmsResult>>().mockResolvedValue({
      success: true,
      messageId: 'sms-msg-1',
    }),
  };
}

function createMockAuditService(): AuditService {
  return {
    create: vi.fn().mockResolvedValue({}),
  } as unknown as AuditService;
}

function createMockEmailService(): EmailService {
  return {
    sendEmail: vi.fn().mockResolvedValue({ success: true, messageId: 'email-1' }),
  } as unknown as EmailService;
}

function makeDispatchParams(overrides: Partial<NotificationDispatchParams> = {}): NotificationDispatchParams {
  return {
    notificationType: 'waitlist',
    recipientType: 'student',
    recipientId: 'student-1',
    variables: {
      studentName: 'John Doe',
      proposedTime: '10:00 AM',
      instructorName: 'Jane Smith',
      aircraftName: 'N12345',
      activityType: 'Dual Instruction',
      proposedDate: 'Monday, March 15, 2024',
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NotificationService', () => {
  let service: NotificationService;
  let smsProvider: SmsProvider;
  let auditService: AuditService;
  let emailService: EmailService;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset default mock return values
    mocks.mockSelectLimit.mockResolvedValue([]);
    mocks.mockInsertReturning.mockResolvedValue([{ id: 'notif-1' }]);

    smsProvider = createMockSmsProvider();
    auditService = createMockAuditService();
    emailService = createMockEmailService();

    service = new NotificationService(smsProvider, auditService, emailService);
  });

  // ─── renderTemplate ──────────────────────────────────────────────────

  describe('renderTemplate', () => {
    it('replaces all {{placeholder}} variables in subject and body', () => {
      const result = service.renderTemplate(
        'Hello {{name}}',
        'Your flight is on {{date}} at {{time}}.',
        { name: 'John', date: 'March 15', time: '10:00 AM' },
      );

      expect(result.subject).toBe('Hello John');
      expect(result.body).toBe('Your flight is on March 15 at 10:00 AM.');
    });

    it('handles multiple occurrences of the same variable', () => {
      const result = service.renderTemplate(
        '',
        '{{name}} booked. Confirmation for {{name}}.',
        { name: 'Alice' },
      );

      expect(result.body).toBe('Alice booked. Confirmation for Alice.');
    });

    it('leaves unreferenced placeholders as-is', () => {
      const result = service.renderTemplate(
        '',
        'Hello {{name}}, your {{unknown}} is ready.',
        { name: 'Bob' },
      );

      expect(result.body).toBe('Hello Bob, your {{unknown}} is ready.');
    });

    it('handles empty variables object', () => {
      const result = service.renderTemplate(
        'Subject {{var}}',
        'Body {{var}}',
        {},
      );

      expect(result.subject).toBe('Subject {{var}}');
      expect(result.body).toBe('Body {{var}}');
    });

    it('handles empty subject and body', () => {
      const result = service.renderTemplate('', '', { name: 'Test' });
      expect(result.subject).toBe('');
      expect(result.body).toBe('');
    });

    it('handles special characters in variable values', () => {
      const result = service.renderTemplate(
        '',
        'Hello {{name}}!',
        { name: 'O\'Brien & Sons <LLC>' },
      );

      expect(result.body).toBe('Hello O\'Brien & Sons <LLC>!');
    });
  });

  // ─── dispatch ─────────────────────────────────────────────────────────

  describe('dispatch', () => {
    it('sends email when email is enabled and recipient has email', async () => {
      // Policy returns emailEnabled: true (default)
      mocks.mockSelectLimit
        .mockResolvedValueOnce([{ notificationPreferences: { emailEnabled: true } }])
        // Template lookup returns null
        .mockResolvedValueOnce([]);

      const params = makeDispatchParams({ recipientEmail: 'john@example.com' });
      const result = await service.dispatch(1, params);

      expect(result.emailSent).toBe(true);
      expect(result.records.length).toBeGreaterThanOrEqual(1);
      expect(result.records.some((r) => r.channel === 'email')).toBe(true);
    });

    it('does not send email when recipient has no email address', async () => {
      mocks.mockSelectLimit.mockResolvedValueOnce([{ notificationPreferences: { emailEnabled: true } }]);

      const params = makeDispatchParams({ recipientEmail: undefined });
      const result = await service.dispatch(1, params);

      expect(result.emailSent).toBe(false);
    });

    it('sends SMS when SMS is enabled and recipient has phone', async () => {
      mocks.mockSelectLimit
        .mockResolvedValueOnce([
          { notificationPreferences: { emailEnabled: false, smsEnabled: true } },
        ])
        // Template lookup for SMS
        .mockResolvedValueOnce([]);

      const params = makeDispatchParams({ recipientPhone: '+15551234567' });
      const result = await service.dispatch(1, params);

      expect(result.smsSent).toBe(true);
      expect(smsProvider.send).toHaveBeenCalledWith(
        '+15551234567',
        expect.any(String),
      );
    });

    it('does not send SMS when SMS is disabled', async () => {
      mocks.mockSelectLimit.mockResolvedValueOnce([
        { notificationPreferences: { smsEnabled: false } },
      ]);

      const params = makeDispatchParams({ recipientPhone: '+15551234567' });
      const result = await service.dispatch(1, params);

      expect(result.smsSent).toBe(false);
      expect(smsProvider.send).not.toHaveBeenCalled();
    });

    it('does not send SMS when recipient has no phone number', async () => {
      mocks.mockSelectLimit.mockResolvedValueOnce([
        { notificationPreferences: { smsEnabled: true } },
      ]);

      const params = makeDispatchParams({ recipientPhone: undefined });
      const result = await service.dispatch(1, params);

      expect(result.smsSent).toBe(false);
    });

    it('records SMS failure in audit when SMS provider returns error', async () => {
      mocks.mockSelectLimit
        .mockResolvedValueOnce([
          { notificationPreferences: { smsEnabled: true } },
        ])
        // Template lookup
        .mockResolvedValueOnce([]);

      vi.mocked(smsProvider.send).mockResolvedValue({
        success: false,
        error: 'Invalid phone number',
      });

      const params = makeDispatchParams({ recipientPhone: '+1bad' });
      const result = await service.dispatch(1, params);

      expect(result.smsSent).toBe(false);
      expect(auditService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'notification.failed',
          entityType: 'notification',
        }),
      );
    });

    it('creates audit event on successful SMS send', async () => {
      mocks.mockSelectLimit
        .mockResolvedValueOnce([
          { notificationPreferences: { smsEnabled: true } },
        ])
        // Template lookup
        .mockResolvedValueOnce([]);

      const params = makeDispatchParams({ recipientPhone: '+15551234567' });
      await service.dispatch(1, params);

      expect(auditService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'notification.sent',
          entityType: 'notification',
          data: expect.objectContaining({
            channel: 'sms',
            recipientId: 'student-1',
          }),
        }),
      );
    });

    it('defaults emailEnabled to true when preferences are empty', async () => {
      mocks.mockSelectLimit
        .mockResolvedValueOnce([{ notificationPreferences: {} }])
        // Template lookup
        .mockResolvedValueOnce([]);

      const params = makeDispatchParams({ recipientEmail: 'test@example.com' });
      const result = await service.dispatch(1, params);

      expect(result.emailSent).toBe(true);
    });

    it('defaults smsEnabled to false when preferences are empty', async () => {
      mocks.mockSelectLimit.mockResolvedValueOnce([{ notificationPreferences: {} }]);

      const params = makeDispatchParams({ recipientPhone: '+15551234567' });
      const result = await service.dispatch(1, params);

      expect(result.smsSent).toBe(false);
      expect(smsProvider.send).not.toHaveBeenCalled();
    });

    it('handles missing policy (no rows) gracefully', async () => {
      mocks.mockSelectLimit
        .mockResolvedValueOnce([])
        // Template lookup
        .mockResolvedValueOnce([]);

      const params = makeDispatchParams({ recipientEmail: 'test@example.com' });
      const result = await service.dispatch(1, params);

      // emailEnabled defaults to true
      expect(result.emailSent).toBe(true);
    });

    it('sends both email and SMS when both are enabled', async () => {
      mocks.mockSelectLimit
        .mockResolvedValueOnce([
          { notificationPreferences: { emailEnabled: true, smsEnabled: true } },
        ])
        // Template lookups (one for email, one for SMS)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const params = makeDispatchParams({
        recipientEmail: 'test@example.com',
        recipientPhone: '+15551234567',
      });
      const result = await service.dispatch(1, params);

      expect(result.emailSent).toBe(true);
      expect(result.smsSent).toBe(true);
      expect(result.records.length).toBe(2);
    });

    it('renders template with provided variables before sending SMS', async () => {
      mocks.mockSelectLimit
        .mockResolvedValueOnce([
          { notificationPreferences: { smsEnabled: true } },
        ])
        // Template with variables
        .mockResolvedValueOnce([
          {
            id: 'tmpl-1',
            bodyTemplate: 'Hi {{studentName}}, your flight at {{proposedTime}}!',
          },
        ]);

      const params = makeDispatchParams({
        recipientPhone: '+15551234567',
        variables: {
          studentName: 'Alice',
          proposedTime: '2:00 PM',
          instructorName: 'Bob',
          aircraftName: 'N99999',
          activityType: 'Solo',
          proposedDate: 'Friday',
        },
      });

      await service.dispatch(1, params);

      expect(smsProvider.send).toHaveBeenCalledWith(
        '+15551234567',
        'Hi Alice, your flight at 2:00 PM!',
      );
    });
  });
});
