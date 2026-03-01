import type { ParsedHand } from '../types/poker';
import { parsePokerStars } from './pokerstars';
import { parseGGPoker } from './ggpoker';
import { parse888Poker } from './888poker';
import { parseWPN } from './wpn';
import { validateHand } from './validate';

/**
 * Identifica o formato do hand history pelo conteúdo do texto.
 * Retorna 'unknown' se nenhum formato for reconhecido.
 */
export function detectFormat(text: string): string {
  if (text.includes('PokerStars Hand #') || text.includes('PokerStars Game #')) return 'pokerstars';
  if (/Poker Hand #[A-Z]{2}/.test(text) || text.includes('GGPoker') || text.includes('Natural8')) return 'ggpoker';
  if (text.includes('888poker Hand History') || text.includes('Pacific Poker')) return '888poker';
  if (/Game #\d+ (starts|-)/.test(text) || text.includes('WPN') || text.includes('Winning Poker')) return 'wpn';
  return 'unknown';
}

const HAND_SPLIT_PATTERNS: Record<string, RegExp> = {
  pokerstars: /(?=^PokerStars (?:Hand|Game) #)/m,
  ggpoker:    /(?=^Poker Hand #)/m,
  '888poker': /(?=^(?:#Game No|Game \d+))/m,
  wpn:        /(?=^Game #\d+ )/m,
};

/** Divide um texto com múltiplas mãos em chunks individuais usando o padrão do formato. */
export function splitHands(text: string, format: string): string[] {
  const sep = HAND_SPLIT_PATTERNS[format];
  if (!sep) return [text];
  return text.split(sep).map(s => s.trim()).filter(Boolean);
}

const PARSERS: Record<string, (text: string) => ParsedHand> = {
  pokerstars: parsePokerStars,
  ggpoker:    parseGGPoker,
  '888poker': parse888Poker,
  wpn:        parseWPN,
};

/**
 * Processa um texto de hand history (potencialmente com múltiplas mãos),
 * detecta o formato automaticamente, faz o parse e valida cada mão.
 * Lança erro se o formato for desconhecido ou nenhuma mão válida for encontrada.
 */
export function parseMultipleHands(text: string): ParsedHand[] {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('O texto está vazio. Cole ou carregue um arquivo de hand history.');

  const format = detectFormat(trimmed);
  if (format === 'unknown') throw new Error(
    'Formato não reconhecido. Suportamos: PokerStars, GGPoker, 888 Poker e WPN.'
  );

  const parser = PARSERS[format];
  const chunks = splitHands(trimmed, format);
  const hands: ParsedHand[] = [];

  for (const chunk of chunks) {
    try {
      const hand = parser(chunk);
      validateHand(hand);
      hands.push(hand);
    } catch {
      // Chunks inválidos (mãos incompletas, headers duplicados, etc.) são ignorados silenciosamente
    }
  }

  if (hands.length === 0) throw new Error('Nenhuma mão válida encontrada no arquivo.');
  return hands;
}

/** Processa um texto de hand history e retorna apenas a primeira mão encontrada. */
export function parseHandHistory(text: string): ParsedHand {
  return parseMultipleHands(text)[0];
}

export { parsePokerStars, parseGGPoker, parse888Poker, parseWPN };
export { validateHand, HandValidationError } from './validate';
