import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameState } from '../../types/poker';
import { computePositions } from '../../utils/positions';
import { Board } from '../Board';
import { BetChips } from '../BetChips';
import { ChipAnimation } from '../ChipAnimation';
import { PlayerSeat } from '../PlayerSeat';
import styles from './PokerTable.module.css';
import mesaSvg from '../../assets/mesa.svg';

/** Raios da oval dos assentos (em % do container). */
const SEAT_RX = 48;
const SEAT_RY = 41;

/** Offset vertical extra do hero (seat index 0) em relação à oval. */
const HERO_OFFSET_Y = -5;

/** Raios originais usados para posicionar as fichas de aposta. */
const BET_RX = 48;
const BET_RY = 36;

/** Gera posições distribuídas simetricamente numa oval para N jogadores. */
function computeOvalPositions(count: number, rx: number, ry: number) {
  const step = (2 * Math.PI) / count;
  return Array.from({ length: count }, (_, i) => ({
    left: 50 - rx * Math.sin(i * step),
    top:  50 + ry * Math.cos(i * step),
  }));
}

/** Gera posições de aposta a distância visual uniforme dos assentos em direção ao centro. */
/** Distância por seat index (0=hero, 1..8 sentido horário). */
const SEAT_DIST: Record<number, number> = {
  0: 70, 1: 70, 2: 95, 3: 80, 4: 70, 5: 90, 6: 80, 7: 95, 8: 80,
};

function computeBetPositions(seats: { left: number; top: number }[]) {
  const W = 680, H = 380;
  return seats.map((sp, i) => {
    const d = SEAT_DIST[i] ?? 80;
    const dxPx = ((50 - sp.left) / 100) * W;
    const dyPx = ((50 - sp.top) / 100) * H;
    const dist = Math.sqrt(dxPx * dxPx + dyPx * dyPx) || 1;
    const s = d / dist;
    return {
      left: sp.left + (dxPx * s / W) * 100,
      top:  sp.top  + (dyPx * s / H) * 100,
    };
  });
}

const CENTER = { left: 50, top: 50 };

/** Representa uma animação de ficha a ser renderizada (do ponto A ao ponto B). */
interface ChipEvent {
  id: string;
  fromLeft: number;
  fromTop: number;
  toLeft: number;
  toTop: number;
  /** Valor da ficha (0 para animações de win sem label). */
  amount: number;
}

interface PokerTableProps {
  state: GameState;
  heroName?: string;
  showBBUnits: boolean;
  bigBlind: number;
  zoom?: number;
}

/**
 * Mesa de poker oval com assentos posicionados absolutamente.
 * Ordena e rotaciona os jogadores para que o herói fique no assento inferior (seat0).
 * Gerencia animações de fichas ao detectar mudanças de estado entre passos.
 */
export function PokerTable({ state, heroName, showBBUnits, bigBlind, zoom = 1 }: PokerTableProps) {
  // Ordena por assento e rotaciona para o herói ficar sempre no seat0 (base da tela)
  const sortedPlayers = useMemo(() => {
    const sorted = [...state.players].sort((a, b) => a.seat - b.seat);
    if (!heroName) return sorted;
    const heroIdx = sorted.findIndex(p => p.name === heroName);
    if (heroIdx <= 0) return sorted;
    return [...sorted.slice(heroIdx), ...sorted.slice(0, heroIdx)];
  }, [state.players, heroName]);

  // Posições calculadas dinamicamente para o número atual de jogadores
  const seatPositions = useMemo(() => {
    const positions = computeOvalPositions(sortedPlayers.length, SEAT_RX, SEAT_RY);
    // Afasta o hero (index 0) para baixo sem mover a ficha
    positions[0] = { ...positions[0], top: positions[0].top + HERO_OFFSET_Y };
    return positions;
  }, [sortedPlayers.length]);
  const betBasePositions = useMemo(() => computeOvalPositions(sortedPlayers.length, BET_RX, BET_RY), [sortedPlayers.length]);
  const betPositions = useMemo(() => computeBetPositions(betBasePositions), [betBasePositions]);

  // Mapa de número de assento → índice visual (0-based) para lookup de posição
  const positionMap = useMemo(() => {
    const map = new Map<number, number>();
    sortedPlayers.forEach((p, i) => map.set(p.seat, i));
    return map;
  }, [sortedPlayers]);

  // Mapa de número de assento → label de posição de poker (BTN, SB, BB, UTG, CO...)
  const pokerPositions = useMemo(() => {
    const dealer = state.players.find(p => p.isDealer);
    if (!dealer) return new Map<number, string>();
    return computePositions(state.players, dealer.seat);
  }, [state.players]);

  const prevStateRef = useRef<GameState | null>(null);
  const [chips, setChips] = useState<ChipEvent[]>([]);

  // Detecta diferenças entre o estado anterior e o atual para disparar animações de ficha
  useEffect(() => {
    const prev = prevStateRef.current;
    if (!prev) { prevStateRef.current = state; return; }

    const newChips: ChipEvent[] = [];

    for (const player of state.players) {
      const prevPlayer = prev.players.find(p => p.seat === player.seat);
      if (!prevPlayer) continue;

      const posIdx = positionMap.get(player.seat) ?? 0;
      const seat   = seatPositions[posIdx] ?? CENTER;
      const betPos = betPositions[posIdx]  ?? CENTER;

      // Bet increased → fly from seat to bet zone (skip ante-only bets)
      if (player.bet > prevPlayer.bet && player.betType !== 'ante') {
        newChips.push({
          id: `bet-${player.seat}-${state.step}`,
          fromLeft: seat.left,   fromTop: seat.top,
          toLeft:   betPos.left, toTop:   betPos.top,
          amount: player.bet - prevPlayer.bet,
        });
      }

      // Bet cleared (> 0 → 0) and not a winner → chips collect to center pot
      if (prevPlayer.bet > 0 && player.bet === 0 && !player.isWinner) {
        newChips.push({
          id: `collect-${player.seat}-${state.step}`,
          fromLeft: betPos.left, fromTop: betPos.top,
          toLeft:   CENTER.left, toTop:   CENTER.top,
          amount: prevPlayer.bet,
        });
      }

      // Player wins → chips fly from center to their seat
      if (player.isWinner && !prevPlayer.isWinner) {
        newChips.push({
          id: `win-${player.seat}-${state.step}`,
          fromLeft: CENTER.left, fromTop: CENTER.top,
          toLeft:   seat.left,   toTop:   seat.top,
          amount: 0,
        });
      }
    }

    if (newChips.length > 0) setChips(prev => [...prev, ...newChips]);
    prevStateRef.current = state;
  }, [state, positionMap, seatPositions, betPositions]);

  const removeChip = useCallback((id: string) => {
    setChips(prev => prev.filter(c => c.id !== id));
  }, []);

  return (
    <div className={styles.tableContainer}>
      <div
        className={styles.tableOuter}
        style={zoom !== 1 ? { transform: `scale(${zoom})`, transformOrigin: 'top center' } : undefined}
      >
        <div className={styles.tableInner}>
          <div className={styles.tableBg}>
            <img src={mesaSvg} alt="" className={styles.tableImg} aria-hidden="true" />
          </div>
          <div className={styles.center}>
            <Board cards={state.board} pot={state.pot} showBBUnits={showBBUnits} bigBlind={bigBlind} />
          </div>

          {sortedPlayers.map(player => {
            const posIdx = positionMap.get(player.seat) ?? 0;
            const pos = seatPositions[posIdx] ?? CENTER;
            return (
              <PlayerSeat
                key={player.seat}
                player={player}
                left={pos.left}
                top={pos.top}
                positionLabel={pokerPositions.get(player.seat)}
                showBBUnits={showBBUnits}
                bigBlind={bigBlind}
                isHero={player.name === heroName}
              />
            );
          })}

          {/* Persistent bet stacks — visible while player.bet > 0 */}
          {sortedPlayers.map(player => {
            if (player.bet <= 0) return null;
            const posIdx = positionMap.get(player.seat) ?? 0;
            const betPos = betPositions[posIdx] ?? CENTER;
            return (
              <div
                key={`betstack-${player.seat}`}
                className={styles.betStack}
                style={{ left: `${betPos.left}%`, top: `${betPos.top}%` }}
                aria-hidden="true"
              >
                <BetChips
                  betAmount={player.bet}
                  anteBet={player.anteBet}
                  betType={player.betType}
                  startingStack={player.stack + player.totalInvested}
                  showBBUnits={showBBUnits}
                  bigBlind={bigBlind}
                />
              </div>
            );
          })}

          {chips.map(chip => (
            <ChipAnimation key={chip.id} {...chip} onDone={removeChip} />
          ))}
        </div>
      </div>

    </div>
  );
}
