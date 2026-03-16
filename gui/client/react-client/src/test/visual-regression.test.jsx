import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, afterEach, test } from 'vitest';
import InputArea from '../components/InputArea';
import ChatWindow from '../components/ChatWindow';
import AnalyticsPanel from '../components/AnalyticsPanel';

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
});

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
}

describe('visual regression harness', () => {
  test.each(['dark', 'light'])('input area states render consistently in %s theme', (theme) => {
    setTheme(theme);

    const { container, rerender } = render(
      <InputArea
        onSend={() => {}}
        onCancel={() => {}}
        disabled={false}
        isGenerating={false}
      />,
    );

    expect(container.firstChild).toMatchSnapshot(`input-ready-${theme}`);

    rerender(
      <InputArea
        onSend={() => {}}
        onCancel={() => {}}
        disabled={false}
        isGenerating
      />,
    );

    expect(container.firstChild).toMatchSnapshot(`input-generating-${theme}`);
  });

  test.each(['dark', 'light'])('chat recovery states render consistently in %s theme', (theme) => {
    setTheme(theme);

    const history = [
      {
        id: 'user-1',
        role: 'user',
        content: 'Explain token strategy',
        createdAt: new Date('2026-03-16T10:00:00.000Z').toISOString(),
      },
      {
        id: 'ai-1',
        role: 'ai',
        status: 'interrupted',
        content: 'Partial answer',
        errorMessage: 'Stream interrupted.',
        recoveryPrompt: 'Explain token strategy',
        createdAt: new Date('2026-03-16T10:00:02.000Z').toISOString(),
      },
      {
        id: 'ai-2',
        role: 'ai',
        status: 'error',
        content: '',
        errorMessage: 'Backend unavailable.',
        createdAt: new Date('2026-03-16T10:00:03.000Z').toISOString(),
      },
    ];

    const { container } = render(
      <ChatWindow
        history={history}
        isGenerating={false}
        sessionNotice=""
        onRetry={() => {}}
      />,
    );

    expect(container.firstChild).toMatchSnapshot(`chat-recovery-${theme}`);
  });

  test.each(['dark', 'light'])('analytics status surfaces render consistently in %s theme', (theme) => {
    setTheme(theme);

    const { container } = render(
      <AnalyticsPanel
        metrics={[
          { name: 'rag-index-A', health: 'HEALTHY' },
          { name: 'rag-index-B', health: 'CORRUPT' },
        ]}
        queue={[
          { id: 'job-1', entityId: 'job-1', path: '/docs/a.md', status: 'processing' },
          { id: 'job-2', entityId: 'job-2', path: '/docs/b.md', status: 'completed' },
          { id: 'job-3', entityId: 'job-3', path: '/docs/c.md', status: 'failed' },
        ]}
        metricsState={{ status: 'ready', error: '', lastUpdated: '', changeSummary: 'No changes.' }}
        queueState={{ status: 'ready', error: '', lastUpdated: '', changeSummary: 'No changes.' }}
        operationalActions={[
          {
            id: 'action-1',
            status: 'info',
            message: 'Queue loaded.',
            timestamp: new Date('2026-03-16T10:05:00.000Z').toISOString(),
          },
          {
            id: 'action-2',
            status: 'success',
            message: 'Ingestion completed.',
            timestamp: new Date('2026-03-16T10:06:00.000Z').toISOString(),
          },
          {
            id: 'action-3',
            status: 'warning',
            message: 'Slow render warning.',
            timestamp: new Date('2026-03-16T10:07:00.000Z').toISOString(),
          },
          {
            id: 'action-4',
            status: 'error',
            message: 'Queue error.',
            timestamp: new Date('2026-03-16T10:08:00.000Z').toISOString(),
          },
        ]}
      />,
    );

    expect(container.firstChild).toMatchSnapshot(`analytics-status-${theme}`);
  });
});
