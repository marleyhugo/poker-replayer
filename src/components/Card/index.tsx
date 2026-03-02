import { useId } from 'react';
import styles from './Card.module.css';

interface CardProps {
  /** Código da carta (ex: "Ah", "Kd", "??" para carta virada). */
  card: string;
  /** Se true, renderiza a versão menor usada nos assentos dos jogadores. */
  small?: boolean;
}

const SUIT_BG: Record<string, string> = {
  h: 'var(--card-hearts)',
  d: 'var(--card-diamonds)',
  c: 'var(--card-clubs)',
  s: 'var(--card-spades)',
};

const FACE_DOWN = new Set(['??', '?', 'XX']);
const RANK_DISPLAY: Record<string, string> = { T: '10' };

/* ─── SVG dos naipes (coordenadas no espaço ~x:8-34, y:38-69) ─── */

function SuitIcon({ suit, scale = 1 }: { suit: string; scale?: number }) {
  const tx = 21, ty = 53.5; // centro aproximado do naipe
  const wrap = (el: React.ReactElement) =>
    scale === 1 ? el : (
      <g transform={`translate(${tx * (1 - scale)}, ${ty * (1 - scale)}) scale(${scale})`}>{el}</g>
    );
  switch (suit) {
    case 'h':
      return wrap(
        <path
          d="M 21 68 C 12 58 8 51 8 45 C 8 41 11 38 15.5 38 C 18.5 38 20 40 21 43 C 22 40 23.5 38 26.5 38 C 31 38 34 41 34 45 C 34 51 30 58 21 68 Z"
          fill="var(--card-text)"
        />
      );
    case 'd':
      return wrap(
        <path
          d="M 21 38 L 33 53.5 L 21 69 L 9 53.5 Z"
          fill="var(--card-text)"
        />
      );
    case 'c':
      return wrap(
        <g fill="var(--card-text)">
          <circle cx="21" cy="44" r="6" />
          <circle cx="14" cy="55" r="6" />
          <circle cx="28" cy="55" r="6" />
          <rect x="19" y="55" width="4" height="14" rx="1" />
        </g>
      );
    case 's':
      return wrap(
        <path
          d="M 21 38 C 21 38 10 50 10 57 C 10 61 13 64 16.5 64 C 19 64 20.5 62 21 59 L 19 69 L 23 69 L 21 59 C 21.5 62 23 64 25.5 64 C 29 64 32 61 32 57 C 32 50 21 38 21 38 Z"
          fill="var(--card-text)"
        />
      );
    default:
      return null;
  }
}

/**
 * Renderiza uma carta de baralho em SVG puro.
 * Modelo 4-color deck com fundo colorido por naipe, texto branco.
 */
export function Card({ card, small }: CardProps) {
  const patternId = useId();
  const w = small ? 29 : 40;
  const h = small ? 40 : 56;

  /* ── Carta virada ── */
  if (!card || FACE_DOWN.has(card)) {
    return (
      <svg viewBox="0 0 100 140" width={w} height={h} className={styles.card}>
        <defs>
          <pattern
            id={patternId}
            width="8.5"
            height="8.5"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="4.25" height="8.5" fill="var(--card-back-accent)" />
          </pattern>
        </defs>
        <rect x="2" y="2" width="96" height="136" rx="8"
          fill="var(--card-back-primary)" stroke="var(--card-back-border)" strokeWidth="2" />
        <rect x="10" y="10" width="80" height="120" rx="4"
          fill={`url(#${patternId})`} stroke="var(--card-back-border)" strokeWidth="1" />
      </svg>
    );
  }

  /* ── Carta aberta ── */
  const rank = card.slice(0, -1);
  const suit = card.slice(-1).toLowerCase();
  const displayRank = RANK_DISPLAY[rank] || rank;
  const bg = SUIT_BG[suit] || '#333';
  const isTwoChar = displayRank.length > 1;

  return (
    <svg viewBox="0 0 100 140" width={w} height={h} className={styles.card}>
      {/* Fundo da carta */}
      <rect x="2" y="2" width="96" height="136" rx="8"
        fill={bg} stroke="var(--card-border)" strokeWidth="2" />

      {/* Índice: canto superior esquerdo — rank + naipe */}
      <text
        x="12" y="32"
        fill="var(--card-text)"
        fontFamily="Arial, sans-serif"
        fontWeight="bold"
        fontSize={isTwoChar ? 22 : 28}
      >
        {displayRank}
      </text>
      <SuitIcon suit={suit} scale={isTwoChar ? 0.75 : 1} />

      {/* Rank gigante: centro/inferior direito */}
      <text
        x={isTwoChar ? 6 : 25}
        y="120"
        fill="var(--card-text)"
        fontFamily="Arial, sans-serif"
        fontWeight="bold"
        fontSize={isTwoChar ? 82 : 90}
        letterSpacing="-4"
      >
        {displayRank}
      </text>
    </svg>
  );
}
