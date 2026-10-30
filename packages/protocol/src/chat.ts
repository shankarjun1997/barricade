export type ChatTone = 'good' | 'playful' | 'spicy';
export type ChatGenre =
  | 'greetings'
  | 'respect'
  | 'hype'
  | 'strategy'
  | 'jokes'
  | 'trash'
  | 'flirty'
  | 'rematch';

export interface ChatOption {
  readonly id: string;
  readonly text: string;
  readonly tone: ChatTone;
  readonly genre: ChatGenre;
}

export const CHAT_TONES: readonly { readonly id: ChatTone; readonly label: string; readonly hint: string }[] = [
  { id: 'good', label: 'Good', hint: 'Kind and sportsmanlike' },
  { id: 'playful', label: 'Playful', hint: 'Cheeky banter' },
  { id: 'spicy', label: 'Spicy', hint: 'Bold, flirty or confident' },
];

export const CHAT_GENRES: readonly { readonly id: ChatGenre; readonly label: string }[] = [
  { id: 'greetings', label: 'Greetings' },
  { id: 'respect', label: 'Respect' },
  { id: 'hype', label: 'Hype' },
  { id: 'strategy', label: 'Strategy' },
  { id: 'jokes', label: 'Jokes' },
  { id: 'trash', label: 'Trash talk' },
  { id: 'flirty', label: 'Flirty' },
  { id: 'rematch', label: 'Rematch' },
];

function option(id: string, text: string, tone: ChatTone, genre: ChatGenre): ChatOption {
  return { id, text, tone, genre };
}

/** Server-validated quick chat. No free text, so every line is pre-moderated. */
export const CHAT_OPTIONS: readonly ChatOption[] = [
  option('greet-good-1', 'Good luck, have fun!', 'good', 'greetings'),
  option('greet-good-2', 'Nice to meet you — let’s play.', 'good', 'greetings'),
  option('greet-playful-1', 'Let’s make this one memorable.', 'playful', 'greetings'),
  option('greet-playful-2', 'Ready to get walled in?', 'playful', 'greetings'),
  option('greet-spicy-1', 'Be gentle with me… or don’t.', 'spicy', 'greetings'),
  option('greet-spicy-2', 'I came to win and look good doing it.', 'spicy', 'greetings'),

  option('respect-good-1', 'Nice wall.', 'good', 'respect'),
  option('respect-good-2', 'Well played!', 'good', 'respect'),
  option('respect-good-3', 'That was a great move.', 'good', 'respect'),
  option('respect-playful-1', 'Okay, that wall was actually clever.', 'playful', 'respect'),
  option('respect-playful-2', 'You’re making me work for this.', 'playful', 'respect'),
  option('respect-spicy-1', 'Almost impressive. Almost.', 'spicy', 'respect'),
  option('respect-spicy-2', 'Cute move — my turn.', 'spicy', 'respect'),

  option('hype-good-1', 'You’ve got this!', 'good', 'hype'),
  option('hype-good-2', 'Let’s have a clean match.', 'good', 'hype'),
  option('hype-playful-1', 'Big brain time.', 'playful', 'hype'),
  option('hype-playful-2', 'Watch this.', 'playful', 'hype'),
  option('hype-spicy-1', 'I’m about to cook.', 'spicy', 'hype'),
  option('hype-spicy-2', 'Buckle up — this is my board now.', 'spicy', 'hype'),

  option('strategy-good-1', 'The centre looks open.', 'good', 'strategy'),
  option('strategy-good-2', 'I’m watching the edges.', 'good', 'strategy'),
  option('strategy-playful-1', 'I saw that coming.', 'playful', 'strategy'),
  option('strategy-playful-2', 'You’re boxing me in, huh?', 'playful', 'strategy'),
  option('strategy-spicy-1', 'That wall had one job.', 'spicy', 'strategy'),
  option('strategy-spicy-2', 'Your route is looking… scenic.', 'spicy', 'strategy'),

  option('jokes-good-1', 'My pawn is on a coffee break.', 'good', 'jokes'),
  option('jokes-good-2', 'This board is rigged (affectionately).', 'good', 'jokes'),
  option('jokes-playful-1', 'Wall inspector, open up!', 'playful', 'jokes'),
  option('jokes-playful-2', 'I’m not lost, I’m exploring.', 'playful', 'jokes'),
  option('jokes-spicy-1', 'My pawn called — it wants a shortcut.', 'spicy', 'jokes'),
  option('jokes-spicy-2', 'I’ve seen better walls at a maze.', 'spicy', 'jokes'),

  option('trash-good-1', 'Friendly rivalry only!', 'good', 'trash'),
  option('trash-good-2', 'May the best wall win.', 'good', 'trash'),
  option('trash-playful-1', 'You’re boxed in, friend.', 'playful', 'trash'),
  option('trash-playful-2', 'Catch me if you can.', 'playful', 'trash'),
  option('trash-spicy-1', 'Too easy.', 'spicy', 'trash'),
  option('trash-spicy-2', 'My grandma walls faster.', 'spicy', 'trash'),
  option('trash-spicy-3', 'Nice try, rookie.', 'spicy', 'trash'),

  option('flirty-good-1', 'You’re fun to play with.', 'good', 'flirty'),
  option('flirty-good-2', 'Good game — you’re a natural.', 'good', 'flirty'),
  option('flirty-playful-1', 'Winning looks good on you.', 'playful', 'flirty'),
  option('flirty-playful-2', 'Stop distracting me.', 'playful', 'flirty'),
  option('flirty-spicy-1', 'You’re dangerously good at this.', 'spicy', 'flirty'),
  option('flirty-spicy-2', 'If I lose, you owe me a rematch… and maybe dinner.', 'spicy', 'flirty'),
  option('flirty-spicy-3', 'You + me + final row = trouble.', 'spicy', 'flirty'),

  option('rematch-good-1', 'Run it back?', 'good', 'rematch'),
  option('rematch-good-2', 'Good game — rematch?', 'good', 'rematch'),
  option('rematch-playful-1', 'One more, I wasn’t warmed up.', 'playful', 'rematch'),
  option('rematch-playful-2', 'Rematch, same time?', 'playful', 'rematch'),
  option('rematch-spicy-1', 'You got lucky. Run it back.', 'spicy', 'rematch'),
  option('rematch-spicy-2', 'Rematch — unless you’re scared.', 'spicy', 'rematch'),
];

const CHAT_OPTION_MAP = new Map(CHAT_OPTIONS.map((item) => [item.id, item]));

export function chatOptionById(id: string): ChatOption | undefined {
  return CHAT_OPTION_MAP.get(id);
}
