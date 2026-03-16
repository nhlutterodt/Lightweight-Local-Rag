const CHAT_ACTIONS = {
  SEND_REQUEST: 'SEND_REQUEST',
  STREAM_START: 'STREAM_START',
  STREAM_METADATA: 'STREAM_METADATA',
  STREAM_ANSWER_REFERENCES: 'STREAM_ANSWER_REFERENCES',
  STREAM_GROUNDING_WARNING: 'STREAM_GROUNDING_WARNING',
  STREAM_TOKEN: 'STREAM_TOKEN',
  STREAM_ERROR: 'STREAM_ERROR',
  STREAM_CANCELLED: 'STREAM_CANCELLED',
  STREAM_DONE: 'STREAM_DONE',
  STREAM_FINISHED: 'STREAM_FINISHED',
  CANCEL_REQUESTED: 'CANCEL_REQUESTED',
  CLEAR_SESSION: 'CLEAR_SESSION',
  CLEAR_SESSION_DURING_GENERATION: 'CLEAR_SESSION_DURING_GENERATION',
  RESTORE_SESSION: 'RESTORE_SESSION',
};

function createAssistantMessage(prompt) {
  return {
    id: crypto.randomUUID(),
    role: 'ai',
    createdAt: new Date().toISOString(),
    content: '',
    citations: [],
    answerReferences: [],
    groundingWarning: null,
    status: 'streaming',
    errorMessage: '',
    recoveryPrompt: prompt,
  };
}

function createUserMessage(prompt) {
  return {
    id: crypto.randomUUID(),
    role: 'user',
    createdAt: new Date().toISOString(),
    content: prompt,
  };
}

function warnIllegalTransition(actionType, state) {
  if (!import.meta.env.DEV) {
    return;
  }

  console.warn(
    `[ChatStateMachine] Ignored illegal transition: ${actionType} while isGenerating=${state.isGenerating}.`,
  );
}

function updateActiveAssistant(history, updater) {
  if (history.length === 0) {
    return null;
  }

  const lastIndex = history.length - 1;
  const lastMessage = history[lastIndex];
  if (lastMessage.role !== 'ai') {
    return null;
  }

  const nextHistory = [...history];
  nextHistory[lastIndex] = updater(lastMessage);
  return nextHistory;
}

function hasStreamingAssistant(history) {
  if (history.length === 0) {
    return false;
  }

  const lastMessage = history[history.length - 1];
  return lastMessage.role === 'ai' && lastMessage.status === 'streaming';
}

export function createInitialChatState() {
  return {
    history: [],
    isGenerating: false,
    sessionNotice: '',
  };
}

export function chatReducer(state, action) {
  switch (action.type) {
    case CHAT_ACTIONS.SEND_REQUEST: {
      if (state.isGenerating) {
        warnIllegalTransition(action.type, state);
        return state;
      }

      const prompt = action.prompt?.trim();
      if (!prompt) {
        warnIllegalTransition(action.type, state);
        return state;
      }

      return {
        ...state,
        isGenerating: true,
        sessionNotice: '',
        history: [...state.history, createUserMessage(prompt), createAssistantMessage(prompt)],
      };
    }

    case CHAT_ACTIONS.STREAM_START: {
      if (!state.isGenerating) {
        warnIllegalTransition(action.type, state);
        return state;
      }

      const nextHistory = updateActiveAssistant(state.history, (assistant) => ({
        ...assistant,
        status: 'streaming',
        errorMessage: '',
      }));

      if (!nextHistory) {
        warnIllegalTransition(action.type, state);
        return state;
      }

      return {
        ...state,
        history: nextHistory,
      };
    }

    case CHAT_ACTIONS.STREAM_TOKEN: {
      if (!state.isGenerating) {
        warnIllegalTransition(action.type, state);
        return state;
      }

      if (typeof action.content !== 'string' || action.content.length === 0) {
        return state;
      }

      const nextHistory = updateActiveAssistant(state.history, (assistant) => ({
        ...assistant,
        content: `${assistant.content}${action.content}`,
      }));

      if (!nextHistory) {
        warnIllegalTransition(action.type, state);
        return state;
      }

      return {
        ...state,
        history: nextHistory,
      };
    }

    case CHAT_ACTIONS.STREAM_METADATA: {
      if (!state.isGenerating) {
        warnIllegalTransition(action.type, state);
        return state;
      }

      if (!Array.isArray(action.citations)) {
        return state;
      }

      const nextHistory = updateActiveAssistant(state.history, (assistant) => ({
        ...assistant,
        citations: action.citations,
      }));

      if (!nextHistory) {
        warnIllegalTransition(action.type, state);
        return state;
      }

      return {
        ...state,
        history: nextHistory,
      };
    }

    case CHAT_ACTIONS.STREAM_ANSWER_REFERENCES: {
      if (!state.isGenerating) {
        warnIllegalTransition(action.type, state);
        return state;
      }

      if (!Array.isArray(action.references)) {
        return state;
      }

      const nextHistory = updateActiveAssistant(state.history, (assistant) => ({
        ...assistant,
        answerReferences: action.references,
      }));

      if (!nextHistory) {
        warnIllegalTransition(action.type, state);
        return state;
      }

      return {
        ...state,
        history: nextHistory,
      };
    }

    case CHAT_ACTIONS.STREAM_GROUNDING_WARNING: {
      if (!state.isGenerating) {
        warnIllegalTransition(action.type, state);
        return state;
      }

      if (!action.warning || typeof action.warning !== 'object') {
        return state;
      }

      const nextHistory = updateActiveAssistant(state.history, (assistant) => ({
        ...assistant,
        groundingWarning: action.warning,
      }));

      if (!nextHistory) {
        warnIllegalTransition(action.type, state);
        return state;
      }

      return {
        ...state,
        history: nextHistory,
      };
    }

    case CHAT_ACTIONS.STREAM_ERROR:
    case CHAT_ACTIONS.STREAM_CANCELLED:
    case CHAT_ACTIONS.STREAM_DONE: {
      if (!hasStreamingAssistant(state.history)) {
        warnIllegalTransition(action.type, state);
        return state;
      }

      const nextHistory = updateActiveAssistant(state.history, (assistant) => {
        const hasPartialContent = assistant.content.trim().length > 0;

        if (action.type === CHAT_ACTIONS.STREAM_DONE) {
          return {
            ...assistant,
            status: assistant.errorMessage ? 'error' : 'done',
          };
        }

        if (action.type === CHAT_ACTIONS.STREAM_ERROR) {
          return {
            ...assistant,
            status: hasPartialContent ? 'interrupted' : 'failed-before-start',
            errorMessage: action.message || 'Unable to complete request.',
          };
        }

        return {
          ...assistant,
          status: hasPartialContent ? 'cancelled' : 'cancelled-before-start',
          errorMessage: action.message || 'Generation cancelled.',
        };
      });

      if (!nextHistory) {
        warnIllegalTransition(action.type, state);
        return state;
      }

      return {
        ...state,
        history: nextHistory,
      };
    }

    case CHAT_ACTIONS.STREAM_FINISHED: {
      if (!state.isGenerating) {
        return state;
      }

      return {
        ...state,
        isGenerating: false,
      };
    }

    case CHAT_ACTIONS.CANCEL_REQUESTED: {
      if (!state.isGenerating) {
        return state;
      }

      return {
        ...state,
        isGenerating: false,
        sessionNotice: 'Generation cancelled.',
      };
    }

    case CHAT_ACTIONS.CLEAR_SESSION: {
      if (state.isGenerating) {
        warnIllegalTransition(action.type, state);
        return state;
      }

      return {
        ...state,
        history: [],
        sessionNotice: 'Session cleared.',
      };
    }

    case CHAT_ACTIONS.CLEAR_SESSION_DURING_GENERATION: {
      if (!state.isGenerating) {
        warnIllegalTransition(action.type, state);
        return state;
      }

      return {
        ...state,
        history: [],
        isGenerating: false,
        sessionNotice: 'Generation cancelled and session cleared.',
      };
    }

    case CHAT_ACTIONS.RESTORE_SESSION: {
      if (state.isGenerating) {
        warnIllegalTransition(action.type, state);
        return state;
      }

      if (!Array.isArray(action.history)) {
        warnIllegalTransition(action.type, state);
        return state;
      }

      return {
        ...state,
        history: action.history,
        sessionNotice: action.sessionNotice || 'Session restored.',
      };
    }

    default:
      return state;
  }
}

export { CHAT_ACTIONS };
