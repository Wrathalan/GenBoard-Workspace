export const BOARD_SWITCH_BLOCKED = 'Finish or stop the current Codex turn to switch boards.';

export function boardName(value: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Enter a board name.');
  const name = value.trim();
  if (name.length > 100) throw new Error('Use 100 characters or fewer.');
  return name;
}
