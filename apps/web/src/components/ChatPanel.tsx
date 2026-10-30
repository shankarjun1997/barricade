import { useMemo, useState } from 'react';
import {
  CHAT_GENRES,
  CHAT_OPTIONS,
  CHAT_TONES,
  type ChatGenre,
  type ChatMessage,
  type ChatOption,
  type ChatTone,
} from '@barricade/protocol';
import { GameOptions } from './GameOptions.js';

interface ChatPanelProps {
  readonly messages: readonly ChatMessage[];
  readonly selfId: string;
  readonly onSend: (option: ChatOption) => void;
  readonly onClose: () => void;
  readonly disabled?: boolean;
}

export function ChatPanel({ messages, selfId, onSend, onClose, disabled = false }: ChatPanelProps) {
  const [tone, setTone] = useState<ChatTone>('good');
  const [genre, setGenre] = useState<ChatGenre | 'all'>('all');
  const [cooling, setCooling] = useState(false);
  const options = useMemo(
    () => CHAT_OPTIONS.filter((option) => option.tone === tone && (genre === 'all' || option.genre === genre)),
    [tone, genre],
  );
  const recent = messages.slice(-8);

  const send = (option: ChatOption) => {
    if (disabled || cooling) return;
    onSend(option);
    setCooling(true);
    window.setTimeout(() => setCooling(false), 950);
  };

  return (
    <GameOptions title="Chat" closeLabel="Close chat" onClose={onClose}>
      <div className="chat-feed" aria-live="polite">
        {recent.length === 0 ? (
          <p className="chat-empty">No messages yet. Pick a quick line below — keep it friendly.</p>
        ) : (
          recent.map((message) => {
            const mine = message.from.id === selfId;
            return (
              <div key={message.id} className={`chat-bubble${mine ? ' self' : ''}`} data-tone={message.tone}>
                <div className="chat-bubble-meta">
                  <span>{mine ? 'You' : message.from.name}</span>
                  <span>{new Date(message.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <p>{message.text}</p>
              </div>
            );
          })
        )}
      </div>

      <div className="chat-tones" role="group" aria-label="Chat tone">
        {CHAT_TONES.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`chat-tone ${item.id}`}
            aria-pressed={tone === item.id}
            title={item.hint}
            onClick={() => setTone(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="chat-genres" role="group" aria-label="Chat genre">
        <button
          type="button"
          className={`chat-genre${genre === 'all' ? ' active' : ''}`}
          aria-pressed={genre === 'all'}
          onClick={() => setGenre('all')}
        >
          All
        </button>
        {CHAT_GENRES.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`chat-genre${genre === item.id ? ' active' : ''}`}
            aria-pressed={genre === item.id}
            onClick={() => setGenre(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="chat-option-grid">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className="chat-option"
            data-tone={option.tone}
            disabled={disabled || cooling}
            onClick={() => send(option)}
          >
            <span>{option.text}</span>
            <small>{CHAT_GENRES.find((item) => item.id === option.genre)?.label}</small>
          </button>
        ))}
        {options.length === 0 ? <p className="chat-empty">No lines in this genre yet.</p> : null}
      </div>

      <p className="game-options-note">
        Quick chat only — every line is pre-written and server-checked. Keep it playful, never personal.
      </p>
    </GameOptions>
  );
}
