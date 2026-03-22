'use client';

import { useState, useRef, useEffect, FormEvent, KeyboardEvent } from 'react';
import DOMPurify from 'dompurify';
import { api } from '@/lib/api';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  timestamp: Date;
}

interface AskApiResponse {
  data: {
    answer: string;
    model: string;
  };
}

const SUGGESTED_QUESTIONS = [
  'How many students do we have and what is their training progress?',
  'Which aircraft are available in our fleet?',
  'Who are our instructors and what are their certifications?',
  'Which students are at risk of dropping out?',
  'What does the schedule look like for the next few days?',
  'Are there any scheduling gaps we could fill?',
];

export default function AskPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSubmit(e?: FormEvent) {
    e?.preventDefault();
    const question = input.trim();
    if (!question || loading) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: question,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const conversationHistory = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await api.post<AskApiResponse>('/ask', {
        question,
        conversationHistory,
      });

      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: res.data.answer,
        model: res.data.model,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      const errorMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Sorry, something went wrong. Please try again.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleSuggestion(q: string) {
    setInput(q);
    setTimeout(() => {
      const form = document.getElementById('ask-form') as HTMLFormElement;
      form?.requestSubmit();
    }, 50);
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 72px)',
        maxWidth: 900,
        margin: '0 auto',
        width: '100%',
      }}
    >
      {/* Messages area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 16px' }}>
        {messages.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: 24,
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: 8, opacity: 0.15 }}>
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  <path d="M8 10h.01" />
                  <path d="M12 10h.01" />
                  <path d="M16 10h.01" />
                </svg>
              </div>
              <h2
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 600,
                  color: 'var(--color-text)',
                  marginBottom: 4,
                }}
              >
                Ask Mode
              </h2>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
                Ask anything about your students, aircraft, instructors, or schedule.
              </p>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: 10,
                width: '100%',
                maxWidth: 700,
              }}
            >
              {SUGGESTED_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => handleSuggestion(q)}
                  style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 10,
                    padding: '12px 16px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    color: 'var(--color-text)',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-accent)';
                    e.currentTarget.style.background =
                      'var(--color-surface-hover, var(--color-surface))';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-border)';
                    e.currentTarget.style.background = 'var(--color-surface)';
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  style={{
                    maxWidth: '85%',
                    padding: '12px 16px',
                    borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    background:
                      msg.role === 'user' ? 'var(--color-accent)' : 'var(--color-surface)',
                    color: msg.role === 'user' ? '#fff' : 'var(--color-text)',
                    border: msg.role === 'user' ? 'none' : '1px solid var(--color-border)',
                    fontSize: '0.9rem',
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {msg.role === 'assistant' ? (
                    <div
                      dangerouslySetInnerHTML={{
                        __html: DOMPurify.sanitize(formatMarkdown(msg.content)),
                      }}
                    />
                  ) : (
                    msg.content
                  )}
                </div>
                {msg.model && (
                  <span
                    style={{
                      fontSize: '0.7rem',
                      color: 'var(--color-text-muted)',
                      marginTop: 4,
                      paddingLeft: 4,
                    }}
                  >
                    {msg.model}
                  </span>
                )}
              </div>
            ))}

            {loading && (
              <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: '16px 16px 16px 4px',
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    display: 'flex',
                    gap: 6,
                    alignItems: 'center',
                  }}
                >
                  <span className="ask-dot ask-dot-1" />
                  <span className="ask-dot ask-dot-2" />
                  <span className="ask-dot ask-dot-3" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div
        style={{
          borderTop: '1px solid var(--color-border)',
          padding: '16px',
          background: 'var(--color-bg)',
        }}
      >
        <form
          id="ask-form"
          onSubmit={handleSubmit}
          style={{
            display: 'flex',
            gap: 10,
            maxWidth: 700,
            margin: '0 auto',
            alignItems: 'flex-end',
          }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about students, aircraft, schedule..."
            rows={1}
            style={{
              flex: 1,
              resize: 'none',
              border: '1px solid var(--color-border)',
              borderRadius: 12,
              padding: '12px 16px',
              fontSize: '0.9rem',
              fontFamily: 'inherit',
              background: 'var(--color-surface)',
              color: 'var(--color-text)',
              outline: 'none',
              minHeight: 44,
              maxHeight: 120,
              overflowY: 'auto',
            }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = Math.min(el.scrollHeight, 120) + 'px';
            }}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              border: 'none',
              background: loading || !input.trim() ? 'var(--color-border)' : 'var(--color-accent)',
              color: '#fff',
              cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'background 0.15s',
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </form>
      </div>

      <style jsx>{`
        .ask-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--color-text-muted);
          animation: askBounce 1.4s infinite ease-in-out;
        }
        .ask-dot-1 {
          animation-delay: 0s;
        }
        .ask-dot-2 {
          animation-delay: 0.2s;
        }
        .ask-dot-3 {
          animation-delay: 0.4s;
        }
        @keyframes askBounce {
          0%,
          80%,
          100% {
            opacity: 0.3;
            transform: scale(0.8);
          }
          40% {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
      <style jsx global>{`
        .app-content table tbody tr:hover {
          background: rgba(0, 0, 0, 0.02);
        }
        .app-content table {
          border-radius: 8px;
          overflow: hidden;
          border: 1px solid var(--color-border);
        }
        .app-content table th {
          background: rgba(0, 0, 0, 0.03);
        }
      `}</style>
    </div>
  );
}

function formatMarkdown(text: string): string {
  // Split into lines to handle tables as blocks
  const lines = text.split('\n');
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    // Detect markdown table: a line with pipes, followed by a separator row (|---|...)
    if (
      i + 1 < lines.length &&
      lines[i]!.includes('|') &&
      /^\s*\|?\s*[-:]+[-|:\s]*$/.test(lines[i + 1]!)
    ) {
      // Collect all table rows
      const tableLines: string[] = [];
      while (i < lines.length && lines[i]!.includes('|')) {
        tableLines.push(lines[i]!);
        i++;
      }

      // Parse header
      const headerCells = parsePipeCells(tableLines[0]!);
      // Skip separator (tableLines[1])
      const bodyRows = tableLines.slice(2);

      let table =
        '<div style="overflow-x:auto;margin:12px 0"><table style="width:100%;border-collapse:collapse;font-size:0.85rem">';
      table += '<thead><tr>';
      for (const cell of headerCells) {
        table += `<th style="text-align:left;padding:10px 12px;border-bottom:2px solid var(--color-border);font-weight:600;white-space:nowrap">${inlineFormat(cell)}</th>`;
      }
      table += '</tr></thead><tbody>';

      for (const row of bodyRows) {
        const cells = parsePipeCells(row);
        table += '<tr>';
        for (let c = 0; c < headerCells.length; c++) {
          table += `<td style="padding:8px 12px;border-bottom:1px solid var(--color-border)">${inlineFormat(cells[c] ?? '')}</td>`;
        }
        table += '</tr>';
      }

      table += '</tbody></table></div>';
      result.push(table);
    } else {
      result.push(formatLine(lines[i]!));
      i++;
    }
  }

  return result.join('');
}

function parsePipeCells(line: string): string[] {
  return line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((c) => c.trim());
}

function inlineFormat(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(
      /`([^`]+)`/g,
      '<code style="background:rgba(0,0,0,0.06);padding:2px 5px;border-radius:4px;font-size:0.85em">$1</code>',
    );
}

function formatLine(line: string): string {
  const escaped = inlineFormat(line);
  if (/^### /.test(line))
    return `<h4 style="margin:12px 0 4px;font-size:0.95rem">${inlineFormat(line.slice(4))}</h4>`;
  if (/^## /.test(line))
    return `<h3 style="margin:12px 0 4px;font-size:1rem">${inlineFormat(line.slice(3))}</h3>`;
  if (/^# /.test(line))
    return `<h2 style="margin:12px 0 4px;font-size:1.1rem">${inlineFormat(line.slice(2))}</h2>`;
  if (/^- /.test(line))
    return `<div style="padding-left:16px">\u2022 ${inlineFormat(line.slice(2))}</div>`;
  if (line.trim() === '') return '<br/>';
  return escaped + '<br/>';
}
