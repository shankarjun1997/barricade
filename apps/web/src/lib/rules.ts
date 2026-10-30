export interface RuleSection {
  readonly title: string;
  readonly body: string;
}

/** Standard Blockade ruleset used for in-app instructions and docs. */
export const BLOCKADE_RULES: readonly RuleSection[] = [
  {
    title: 'Object of the game',
    body: 'Race a pawn onto your opponent’s home space to win, which also clears that home space for your side.',
  },
  {
    title: 'Movement & jumping',
    body: 'Move a pawn two spaces orthogonally (forward, backward or sideways) or one space diagonally, provided the path is clear. Pawns cannot share a space. If a pawn is blocked, it may move only one space, and adjacent pawns can be jumped.',
  },
  {
    title: 'Placing walls',
    body: 'End your turn by placing a wall in an open board groove if one is available. Blue walls lie horizontally and green walls lie vertically, and every wall blocks two spaces.',
  },
  {
    title: 'Open paths & wall supply',
    body: 'Home spaces can never be completely enclosed, so each player always keeps at least one open path. When your wall supply runs out, keep taking turns by moving pawns only.',
  },
];

export const BLOCKADE_RULES_SUMMARY =
  'Race to the rival home space. Move two spaces orthogonally or one diagonally, then place a wall if you have one. Blue walls are horizontal, green walls vertical.';
