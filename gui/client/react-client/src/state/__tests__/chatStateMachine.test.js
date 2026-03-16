import { describe, expect, it } from 'vitest';
import { chatReducer, CHAT_ACTIONS, createInitialChatState } from '../chatStateMachine';

function sendPrompt(state, prompt = 'hello') {
  return chatReducer(state, {
    type: CHAT_ACTIONS.SEND_REQUEST,
    prompt,
  });
}

describe('chatStateMachine', () => {
  it('starts generation with user and assistant messages', () => {
    const next = sendPrompt(createInitialChatState(), 'Where is my data?');

    expect(next.isGenerating).toBe(true);
    expect(next.history).toHaveLength(2);
    expect(next.history[0].role).toBe('user');
    expect(next.history[0].content).toBe('Where is my data?');
    expect(next.history[1].role).toBe('ai');
    expect(next.history[1].status).toBe('streaming');
  });

  it('updates streaming content and terminal status through explicit transitions', () => {
    let state = sendPrompt(createInitialChatState(), 'Prompt');

    state = chatReducer(state, { type: CHAT_ACTIONS.STREAM_START });
    state = chatReducer(state, { type: CHAT_ACTIONS.STREAM_TOKEN, content: 'Part A' });
    state = chatReducer(state, { type: CHAT_ACTIONS.STREAM_TOKEN, content: ' + Part B' });
    state = chatReducer(state, { type: CHAT_ACTIONS.STREAM_DONE });
    state = chatReducer(state, { type: CHAT_ACTIONS.STREAM_FINISHED });

    const assistant = state.history[state.history.length - 1];
    expect(assistant.content).toBe('Part A + Part B');
    expect(assistant.status).toBe('done');
    expect(state.isGenerating).toBe(false);
  });

  it('attaches citations metadata to the active assistant message', () => {
    let state = sendPrompt(createInitialChatState(), 'Prompt with sources');

    state = chatReducer(state, {
      type: CHAT_ACTIONS.STREAM_METADATA,
      citations: [
        {
          fileName: 'Architecture_Design.md',
          headerContext: 'Section > Overview',
          score: 0.91,
          preview: 'Architecture snapshot',
        },
      ],
    });

    const assistant = state.history[state.history.length - 1];
    expect(Array.isArray(assistant.citations)).toBe(true);
    expect(assistant.citations).toHaveLength(1);
    expect(assistant.citations[0].fileName).toBe('Architecture_Design.md');
  });

  it('defines explicit action constants for answer references and grounding warnings', () => {
    expect(CHAT_ACTIONS.STREAM_ANSWER_REFERENCES).toBe('STREAM_ANSWER_REFERENCES');
    expect(CHAT_ACTIONS.STREAM_GROUNDING_WARNING).toBe('STREAM_GROUNDING_WARNING');
  });

  it('attaches answer references separately from citations on the active assistant message', () => {
    let state = sendPrompt(createInitialChatState(), 'Prompt with grounded references');

    state = chatReducer(state, {
      type: 'STREAM_ANSWER_REFERENCES',
      references: [
        {
          chunkId: 'chunk-1',
          sourceId: 'source-1',
          fileName: 'Architecture_Design.md',
        },
      ],
    });

    const assistant = state.history[state.history.length - 1];
    expect(Array.isArray(assistant.answerReferences)).toBe(true);
    expect(assistant.answerReferences).toHaveLength(1);
    expect(assistant.answerReferences[0].chunkId).toBe('chunk-1');
    expect(Array.isArray(assistant.citations)).toBe(true);
  });

  it('stores grounding warning details on the active assistant message', () => {
    let state = sendPrompt(createInitialChatState(), 'Prompt with weak grounding');

    state = chatReducer(state, {
      type: 'STREAM_GROUNDING_WARNING',
      warning: {
        code: 'NO_APPROVED_CONTEXT',
        message: 'No approved evidence was available for grounded references.',
      },
    });

    const assistant = state.history[state.history.length - 1];
    expect(assistant.groundingWarning).toMatchObject({
      code: 'NO_APPROVED_CONTEXT',
    });
  });

  it('guards illegal token transition when not generating', () => {
    const initial = createInitialChatState();
    const next = chatReducer(initial, {
      type: CHAT_ACTIONS.STREAM_TOKEN,
      content: 'Should be ignored',
    });

    expect(next).toBe(initial);
  });

  it('guards clear-session transition while streaming', () => {
    const streamingState = sendPrompt(createInitialChatState(), 'Prompt');
    const guarded = chatReducer(streamingState, {
      type: CHAT_ACTIONS.CLEAR_SESSION,
    });

    expect(guarded).toBe(streamingState);

    const cleared = chatReducer(streamingState, {
      type: CHAT_ACTIONS.CLEAR_SESSION_DURING_GENERATION,
    });

    expect(cleared.history).toHaveLength(0);
    expect(cleared.isGenerating).toBe(false);
    expect(cleared.sessionNotice).toMatch(/generation cancelled and session cleared/i);
  });

  it('maps stream errors to failed-before-start or interrupted based on content', () => {
    let state = sendPrompt(createInitialChatState(), 'Prompt');
    state = chatReducer(state, {
      type: CHAT_ACTIONS.STREAM_ERROR,
      message: 'Network issue',
    });

    expect(state.history[state.history.length - 1].status).toBe('failed-before-start');

    state = sendPrompt(createInitialChatState(), 'Prompt');
    state = chatReducer(state, { type: CHAT_ACTIONS.STREAM_TOKEN, content: 'Partial' });
    state = chatReducer(state, {
      type: CHAT_ACTIONS.STREAM_ERROR,
      message: 'Network issue',
    });

    expect(state.history[state.history.length - 1].status).toBe('interrupted');
  });

  it('restores cleared history through explicit restore action', () => {
    let state = sendPrompt(createInitialChatState(), 'Prompt');
    state = chatReducer(state, { type: CHAT_ACTIONS.STREAM_TOKEN, content: 'Partial' });
    const snapshot = state.history;

    state = chatReducer(state, { type: CHAT_ACTIONS.STREAM_FINISHED });
    state = chatReducer(state, { type: CHAT_ACTIONS.CLEAR_SESSION });

    expect(state.history).toHaveLength(0);

    state = chatReducer(state, {
      type: CHAT_ACTIONS.RESTORE_SESSION,
      history: snapshot,
      sessionNotice: 'Session restored.',
    });

    expect(state.history).toHaveLength(snapshot.length);
    expect(state.sessionNotice).toBe('Session restored.');
  });
});
