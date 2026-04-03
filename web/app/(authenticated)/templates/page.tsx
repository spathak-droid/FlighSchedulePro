'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import gsap from 'gsap';
import { api, ApiRequestError } from '@/lib/api';
import type { NotificationTemplate, UpdateTemplateRequest } from '@/lib/types';

// ─── Constants ──────────────────────────────────────────────────────────────

const TEMPLATE_TYPE_LABELS: Record<string, string> = {
  waitlist: 'Waitlist Offer',
  reschedule: 'Reschedule Offer',
  discovery: 'Discovery Confirmation',
  next_lesson: 'Next Lesson Offer',
};

const TEMPLATE_TYPE_ORDER = ['waitlist', 'reschedule', 'discovery', 'next_lesson'];

type PlaceholderCategory = 'person' | 'schedule' | 'resource';

const PLACEHOLDER_COLORS: Record<PlaceholderCategory, { bg: string; border: string; text: string }> = {
  person:   { bg: 'rgba(59, 130, 246, 0.1)',  border: 'rgba(59, 130, 246, 0.3)',  text: '#60a5fa' },
  schedule: { bg: 'rgba(34, 197, 94, 0.1)',   border: 'rgba(34, 197, 94, 0.3)',   text: '#4ade80' },
  resource: { bg: 'rgba(168, 85, 247, 0.1)',  border: 'rgba(168, 85, 247, 0.3)',  text: '#c084fc' },
};

const AVAILABLE_PLACEHOLDERS: Array<{ key: string; label: string; category: PlaceholderCategory }> = [
  { key: '{{studentName}}', label: 'studentName', category: 'person' },
  { key: '{{proposedDate}}', label: 'proposedDate', category: 'schedule' },
  { key: '{{proposedTime}}', label: 'proposedTime', category: 'schedule' },
  { key: '{{instructorName}}', label: 'instructorName', category: 'person' },
  { key: '{{aircraftName}}', label: 'aircraftName', category: 'resource' },
  { key: '{{activityType}}', label: 'activityType', category: 'resource' },
];

const PLACEHOLDER_CATEGORY_MAP: Record<string, PlaceholderCategory> = Object.fromEntries(
  AVAILABLE_PLACEHOLDERS.map((p) => [p.label, p.category]),
);

const SAMPLE_VARIABLES: Record<string, string> = {
  studentName: 'John Smith',
  proposedTime: 'Mon, Mar 18, 10:00 AM',
  proposedDate: 'Monday, March 18, 2024',
  proposedStartTime: '10:00 AM',
  proposedEndTime: '11:00 AM',
  instructorName: 'Sarah Johnson',
  aircraftName: 'N12345 (Cessna 172)',
  activityType: 'Private Pilot Lesson',
};

// ─── Chip Editor Component ──────────────────────────────────────────────────

function TemplateChipEditor({
  value,
  onChange,
  placeholder,
  editorRef,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  editorRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const localRef = useRef<HTMLDivElement>(null);
  const isComposing = useRef(false);

  // Callback ref that sets both localRef and editorRef
  const setRef = useCallback((el: HTMLDivElement | null) => {
    localRef.current = el;
    if (editorRef) {
      (editorRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    }
  }, [editorRef]);

  // Use localRef everywhere internally
  const ref = localRef;

  // Convert raw template string → HTML with chip spans
  function toHtml(raw: string): string {
    const escaped = raw
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    return escaped.replace(/\{\{(\w+)\}\}/g, (_match, varName: string) => {
      const category = PLACEHOLDER_CATEGORY_MAP[varName] ?? 'resource';
      const colors = PLACEHOLDER_COLORS[category];
      return (
        `<span contenteditable="false" data-placeholder="${varName}" style="` +
        `display:inline-flex;align-items:center;padding:1px 8px;margin:0 2px;` +
        `font-size:0.78rem;font-weight:500;font-family:'SF Mono','Fira Code',monospace;` +
        `background:${colors.bg};border:1px solid ${colors.border};border-radius:4px;` +
        `color:${colors.text};user-select:all;vertical-align:baseline;line-height:1.6` +
        `">${varName}</span>`
      );
    }).replace(/\n/g, '<br>');
  }

  // Convert HTML back to raw template string
  function toRaw(el: HTMLDivElement): string {
    let result = '';
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        result += node.textContent ?? '';
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as HTMLElement;
        const ph = element.getAttribute('data-placeholder');
        if (ph) {
          result += `{{${ph}}}`;
        } else if (element.tagName === 'BR') {
          result += '\n';
        } else {
          // Recurse into other elements (div wraps lines in some browsers)
          result += element.innerText ?? '';
        }
      }
    }
    return result;
  }

  // Sync HTML into the div when value changes externally
  useEffect(() => {
    if (!ref.current) return;
    const currentRaw = toRaw(ref.current);
    if (currentRaw !== value) {
      ref.current.innerHTML = value ? toHtml(value) : '';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function handleInput() {
    if (isComposing.current) return;
    if (!ref.current) return;
    const raw = toRaw(ref.current);
    onChange(raw);
  }

  // Insert a placeholder chip at cursor position
  function insertAtCursor(varName: string) {
    if (!ref.current) return;
    ref.current.focus();

    const category = PLACEHOLDER_CATEGORY_MAP[varName] ?? 'resource';
    const colors = PLACEHOLDER_COLORS[category];

    const chip = document.createElement('span');
    chip.contentEditable = 'false';
    chip.setAttribute('data-placeholder', varName);
    chip.style.cssText =
      `display:inline-flex;align-items:center;padding:1px 8px;margin:0 2px;` +
      `font-size:0.78rem;font-weight:500;font-family:'SF Mono','Fira Code',monospace;` +
      `background:${colors.bg};border:1px solid ${colors.border};border-radius:4px;` +
      `color:${colors.text};user-select:all;vertical-align:baseline;line-height:1.6`;
    chip.textContent = varName;

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(chip);
      // Move cursor after chip
      range.setStartAfter(chip);
      range.setEndAfter(chip);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      ref.current.appendChild(chip);
    }

    handleInput();
  }

  // Expose insertAtCursor via a data attribute hack (we'll call it from parent)
  useEffect(() => {
    if (ref.current) {
      (ref.current as unknown as Record<string, unknown>).__insertChip = insertAtCursor;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={setRef}
      contentEditable
      suppressContentEditableWarning
      onInput={handleInput}
      onCompositionStart={() => { isComposing.current = true; }}
      onCompositionEnd={() => { isComposing.current = false; handleInput(); }}
      data-placeholder={placeholder}
      style={{
        background: 'var(--color-bg)',
        border: '1px solid var(--color-border)',
        borderRadius: '8px',
        padding: '12px 14px',
        fontSize: '0.85rem',
        color: 'var(--color-text)',
        lineHeight: 1.8,
        whiteSpace: 'pre-wrap',
        minHeight: '100px',
        outline: 'none',
        cursor: 'text',
        transition: 'border-color 0.15s',
        position: 'relative',
      }}
      onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent)'; }}
      onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}
    />
  );
}

// ─── Edit State ─────────────────────────────────────────────────────────────

interface TemplateEditState {
  subject: string;
  bodyTemplate: string;
  dirty: boolean;
  saving: boolean;
  error: string;
  saved: boolean;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [editStates, setEditStates] = useState<Map<string, TemplateEditState>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(TEMPLATE_TYPE_ORDER),
  );
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const sectionRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const contentRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const toastRef = useRef<HTMLDivElement>(null);
  const editorRefs = useRef<Map<string, React.RefObject<HTMLDivElement | null>>>(new Map());
  const hasAnimatedSections = useRef(false);

  // Fetch templates
  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get<{ data: NotificationTemplate[] }>('/templates');
      const fetched = res.data ?? [];
      setTemplates(fetched);

      const states = new Map<string, TemplateEditState>();
      for (const t of fetched) {
        states.set(t.id, {
          subject: t.subject ?? '',
          bodyTemplate: t.bodyTemplate,
          dirty: false,
          saving: false,
          error: '',
          saved: false,
        });
      }
      setEditStates(states);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message);
      } else {
        setError('Failed to load templates');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // GSAP stagger-in for sections
  useEffect(() => {
    if (!loading) {
      const sections = Array.from(sectionRefs.current.values()).filter(Boolean);
      if (sections.length > 0) {
        if (hasAnimatedSections.current) {
          gsap.set(sections, { opacity: 1, y: 0 });
          return;
        }
        hasAnimatedSections.current = true;
        gsap.fromTo(
          sections,
          { opacity: 0, y: 30 },
          {
            opacity: 1,
            y: 0,
            duration: 0.6,
            stagger: 0.15,
            ease: 'power3.out',
          },
        );
      }
    }
  }, [loading, templates]);

  // Toast animation
  useEffect(() => {
    if (toast && toastRef.current) {
      gsap.fromTo(
        toastRef.current,
        { opacity: 0, y: 20, x: 20 },
        { opacity: 1, y: 0, x: 0, duration: 0.4, ease: 'power2.out' },
      );
      const timer = setTimeout(() => {
        if (toastRef.current) {
          gsap.to(toastRef.current, {
            opacity: 0,
            y: 20,
            duration: 0.3,
            ease: 'power2.in',
            onComplete: () => setToast(null),
          });
        }
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Toggle section expand/collapse with GSAP
  function toggleSection(type: string) {
    const content = contentRefs.current.get(type);
    if (!content) return;

    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        // Collapse
        gsap.to(content, {
          height: 0,
          opacity: 0,
          duration: 0.35,
          ease: 'power2.inOut',
          onComplete: () => {
            content.style.overflow = 'hidden';
          },
        });
        next.delete(type);
      } else {
        // Expand
        content.style.overflow = 'hidden';
        content.style.height = '0px';
        content.style.opacity = '0';
        content.style.display = 'block';
        const naturalHeight = content.scrollHeight;
        gsap.to(content, {
          height: naturalHeight,
          opacity: 1,
          duration: 0.4,
          ease: 'power2.out',
          onComplete: () => {
            content.style.height = 'auto';
            content.style.overflow = 'visible';
          },
        });
        next.add(type);
      }
      return next;
    });
  }

  // Update local edit state
  function updateEditState(id: string, field: 'subject' | 'bodyTemplate', value: string) {
    setEditStates((prev) => {
      const next = new Map(prev);
      const current = next.get(id);
      if (current) {
        next.set(id, { ...current, [field]: value, dirty: true, saved: false });
      }
      return next;
    });
  }

  // Insert placeholder chip into the contentEditable editor
  function insertPlaceholder(templateId: string, placeholder: string) {
    const editorRefObj = editorRefs.current.get(templateId);
    const editorEl = editorRefObj?.current;
    if (!editorEl) return;

    // Extract variable name from {{varName}}
    const varName = placeholder.replace(/\{\{|\}\}/g, '');
    const insertFn = (editorEl as unknown as Record<string, unknown>).__insertChip;
    if (typeof insertFn === 'function') {
      (insertFn as (v: string) => void)(varName);
    }
  }

  // Save a template
  async function saveTemplate(id: string) {
    const state = editStates.get(id);
    if (!state) return;

    setEditStates((prev) => {
      const next = new Map(prev);
      next.set(id, { ...state, saving: true, error: '', saved: false });
      return next;
    });

    try {
      const body: UpdateTemplateRequest = {
        subject: state.subject,
        bodyTemplate: state.bodyTemplate,
      };
      await api.put(`/templates/${id}`, body);

      setEditStates((prev) => {
        const next = new Map(prev);
        next.set(id, { ...state, saving: false, dirty: false, saved: true });
        return next;
      });

      setToast({ message: 'Template saved successfully', type: 'success' });
    } catch (err) {
      const msg = err instanceof ApiRequestError ? err.message : 'Failed to save';
      setEditStates((prev) => {
        const next = new Map(prev);
        next.set(id, { ...state, saving: false, error: msg });
        return next;
      });
      setToast({ message: msg, type: 'error' });
    }
  }

  // Render preview with sample values
  function renderPreview(body: string): string {
    let rendered = body;
    for (const [key, value] of Object.entries(SAMPLE_VARIABLES)) {
      rendered = rendered.split(`{{${key}}}`).join(value);
    }
    return rendered;
  }

  // Group templates
  const groupedTemplates = TEMPLATE_TYPE_ORDER.map((type) => ({
    type,
    label: TEMPLATE_TYPE_LABELS[type] ?? type,
    templates: templates.filter((t) => t.type === type),
  })).filter((group) => group.templates.length > 0);

  // Include any templates with types not in the standard list
  const standardTypes = new Set(TEMPLATE_TYPE_ORDER);
  const otherTemplates = templates.filter((t) => !standardTypes.has(t.type));
  if (otherTemplates.length > 0) {
    const otherTypes = [...new Set(otherTemplates.map((t) => t.type))];
    for (const type of otherTypes) {
      groupedTemplates.push({
        type,
        label: type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' '),
        templates: otherTemplates.filter((t) => t.type === type),
      });
    }
  }

  if (loading) {
    return (
      <div style={styles.loadingState}>
        <div className="spinner-pulse" />
        <p style={styles.loadingText}>Loading templates...</p>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      {/* Page Header */}
      <div style={styles.pageHeader}>
        <h1 style={styles.pageTitle}>Notification Templates</h1>
        <p style={styles.pageSubtitle}>Customize messages sent to students</p>
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}

      {/* Template Groups */}
      {groupedTemplates.length === 0 && (
        <div className="card" style={styles.emptyState}>
          No notification templates configured. Templates are created during operator onboarding.
        </div>
      )}

      {groupedTemplates.map((group) => (
        <div
          key={group.type}
          ref={(el) => {
            sectionRefs.current.set(group.type, el);
          }}
          className="card"
          style={styles.sectionCard}
        >
          {/* Collapsible Section Header */}
          <div
            className="dark-section-header"
            onClick={() => toggleSection(group.type)}
            style={styles.sectionHeader}
          >
            <div style={styles.sectionTitleRow}>
              <div style={styles.sectionDot} />
              <h2 style={styles.sectionTitle}>{group.label}</h2>
              <span style={styles.sectionCount}>{group.templates.length}</span>
            </div>
            <svg
              className={`dark-section-chevron${expandedSections.has(group.type) ? ' open' : ''}`}
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
            >
              <path
                d="M4 6L8 10L12 6"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          {/* Section Content */}
          <div
            ref={(el) => {
              contentRefs.current.set(group.type, el);
            }}
            style={{
              overflow: expandedSections.has(group.type) ? 'visible' : 'hidden',
              height: expandedSections.has(group.type) ? 'auto' : 0,
              opacity: expandedSections.has(group.type) ? 1 : 0,
            }}
          >
            <div style={styles.sectionContent}>
              {group.templates.map((template) => {
                const state = editStates.get(template.id);
                if (!state) return null;

                return (
                  <div key={template.id} style={styles.templateCard}>
                    {/* Template Header */}
                    <div style={styles.templateHeader}>
                      <span
                        className={
                          template.channel === 'email' ? 'dark-badge-email' : 'dark-badge-sms'
                        }
                      >
                        {template.channel.toUpperCase()}
                      </span>
                      <span
                        style={{
                          ...styles.statusDot,
                          background: template.isActive ? '#22c55e' : '#565d73',
                        }}
                      />
                      <span style={styles.statusText}>
                        {template.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>

                    {/* Subject (email only) */}
                    {template.channel === 'email' && (
                      <div style={styles.fieldGroup}>
                        <label style={styles.fieldLabel}>Subject</label>
                        <input
                          type="text"
                          className="input"
                          value={state.subject}
                          onChange={(e) => updateEditState(template.id, 'subject', e.target.value)}
                          placeholder="Email subject line..."
                        />
                      </div>
                    )}

                    {/* Body Template — editable with inline chips */}
                    <div style={styles.fieldGroup}>
                      <label style={styles.fieldLabel}>
                        {template.channel === 'email' ? 'Body' : 'Message'}
                      </label>
                      <TemplateChipEditor
                        value={state.bodyTemplate}
                        onChange={(val) => updateEditState(template.id, 'bodyTemplate', val)}
                        placeholder="Type your template here..."
                        editorRef={(() => {
                          if (!editorRefs.current.has(template.id)) {
                            editorRefs.current.set(template.id, { current: null });
                          }
                          return editorRefs.current.get(template.id)!;
                        })()}
                      />
                    </div>

                    {/* Placeholder Chips */}
                    <div style={styles.chipsRow}>
                      <span style={styles.chipsLabel}>Insert:</span>
                      {AVAILABLE_PLACEHOLDERS.map((p) => {
                        const colors = PLACEHOLDER_COLORS[p.category];
                        return (
                          <button
                            key={p.key}
                            type="button"
                            onClick={() => insertPlaceholder(template.id, p.key)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '4px 10px',
                              fontSize: '0.75rem',
                              fontWeight: 500,
                              fontFamily: "'SF Mono', 'Fira Code', monospace",
                              background: colors.bg,
                              border: `1px solid ${colors.border}`,
                              borderRadius: '6px',
                              color: colors.text,
                              cursor: 'pointer',
                              transition: 'opacity 0.15s',
                            }}
                            onMouseOver={(e) => { (e.target as HTMLElement).style.opacity = '0.8'; }}
                            onMouseOut={(e) => { (e.target as HTMLElement).style.opacity = '1'; }}
                          >
                            {p.label}
                          </button>
                        );
                      })}
                    </div>

                    {/* Live Preview */}
                    <div style={styles.previewSection}>
                      <div style={styles.previewHeader}>
                        <span style={styles.previewLabel}>Live Preview</span>
                        <span style={styles.previewHint}>Sample data</span>
                      </div>
                      <div style={styles.previewBox}>
                        {template.channel === 'email' && state.subject && (
                          <div style={styles.previewSubject}>
                            <strong>Subject:</strong> {renderPreview(state.subject)}
                          </div>
                        )}
                        <div style={styles.previewBody}>{renderPreview(state.bodyTemplate)}</div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={styles.actions}>
                      {state.error && <span style={styles.actionError}>{state.error}</span>}
                      {state.saved && !state.dirty && <span style={styles.actionSaved}>Saved</span>}
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => saveTemplate(template.id)}
                        disabled={!state.dirty || state.saving}
                      >
                        {state.saving ? 'Saving...' : 'Save Template'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ))}

      {/* Toast */}
      {toast && (
        <div
          ref={toastRef}
          className={`dark-toast ${toast.type === 'success' ? 'dark-toast-success' : 'dark-toast-error'}`}
        >
          <span>{toast.type === 'success' ? '\u2713' : '\u2717'}</span>
          {toast.message}
        </div>
      )}
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: '920px',
    margin: '0 auto',
    paddingBottom: '48px',
  },
  pageHeader: {
    marginBottom: '32px',
  },
  pageTitle: {
    fontSize: '1.75rem',
    fontWeight: 700,
    color: 'var(--color-text)',
    marginBottom: '6px',
    letterSpacing: '-0.02em',
  },
  pageSubtitle: {
    fontSize: '0.9rem',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.6,
  },
  errorBox: {
    background: 'var(--color-danger-glow)',
    color: '#dc2626',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    borderRadius: '8px',
    padding: '12px 16px',
    fontSize: '0.875rem',
    marginBottom: '16px',
  },
  loadingState: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '80px 20px',
    gap: '16px',
  },
  loadingText: {
    color: 'var(--color-text-secondary)',
    fontSize: '0.875rem',
  },
  emptyState: {
    textAlign: 'center' as const,
    padding: '60px 20px',
    color: 'var(--color-text-secondary)',
    fontSize: '0.875rem',
  },

  // Section
  sectionCard: {
    marginBottom: '16px',
    padding: 0,
    overflow: 'hidden',
  },
  sectionHeader: {
    padding: '18px 24px',
  },
  sectionTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  sectionDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#3b82f6',
    boxShadow: '0 0 8px rgba(59, 130, 246, 0.4)',
    flexShrink: 0,
  },
  sectionTitle: {
    fontSize: '1.05rem',
    fontWeight: 600,
    color: 'var(--color-text)',
  },
  sectionCount: {
    fontSize: '0.7rem',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    background: 'var(--color-surface-elevated)',
    padding: '2px 8px',
    borderRadius: '10px',
  },
  sectionContent: {
    padding: '0 24px 24px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
  },

  // Template card
  templateCard: {
    background: 'var(--color-surface-elevated)',
    border: '1px solid var(--color-border)',
    borderRadius: '10px',
    padding: '20px',
  },
  templateHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '16px',
  },
  statusDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    marginLeft: '4px',
  },
  statusText: {
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },

  // Fields
  fieldGroup: {
    marginBottom: '14px',
  },
  fieldLabel: {
    display: 'block',
    fontSize: '0.78rem',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
    marginBottom: '6px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },

  // Chips
  chipsRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '6px',
    alignItems: 'center',
    marginBottom: '16px',
  },
  chipsLabel: {
    fontSize: '0.75rem',
    color: 'var(--color-text-muted)',
    fontWeight: 500,
    marginRight: '4px',
  },

  // Preview
  previewSection: {
    marginBottom: '16px',
  },
  previewHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  previewLabel: {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  previewHint: {
    fontSize: '0.7rem',
    color: 'var(--color-text-muted)',
    fontStyle: 'italic' as const,
  },
  previewBox: {
    background: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    padding: '14px 16px',
    fontSize: '0.85rem',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.6,
  },
  previewSubject: {
    marginBottom: '10px',
    paddingBottom: '10px',
    borderBottom: '1px solid var(--color-border)',
    color: 'var(--color-text)',
  },
  previewBody: {
    whiteSpace: 'pre-wrap' as const,
  },

  // Actions
  actions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '12px',
  },
  actionError: {
    fontSize: '0.8rem',
    color: '#dc2626',
  },
  actionSaved: {
    fontSize: '0.8rem',
    color: '#22c55e',
    fontWeight: 500,
  },
};
