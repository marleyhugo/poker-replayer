import { useState, useEffect, useCallback, useRef } from 'react';
import logoImg from './assets/logo.png';
import type { ParsedHand } from './types/poker';
import { computePositions } from './utils/positions';
import { useReplay } from './hooks/useReplay';
import { FileUpload } from './components/FileUpload';
import { PokerTable } from './components/PokerTable';
import { ReplayControls } from './components/ReplayControls';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Card } from './components/Card';
import './App.css';

/** Formata os blinds para exibição (ex: "$0.50/$1.00" ou "100/200" em torneios). */
function formatStakes(stakes: { sb: number; bb: number }, tableType: string): string {
  const fmt = (n: number) => n % 1 === 0 ? String(n) : n.toFixed(2);
  if (tableType === 'tournament') {
    return `${fmt(stakes.sb)}/${fmt(stakes.bb)}`;
  }
  return `$${fmt(stakes.sb)}/$${fmt(stakes.bb)}`;
}

/**
 * Calcula um resumo da perspectiva do herói em uma mão:
 * cartas na mão, stack inicial em BBs e resultado líquido em BBs.
 * Retorna null se não houver herói ou se o BB for zero.
 */
function getHeroSummary(h: ParsedHand) {
  if (!h.heroName || h.stakes.bb === 0) return null;
  const heroPlayer = h.players.find(p => p.name === h.heroName);
  if (!heroPlayer) return null;

  const heroCards = h.holeCards[h.heroName];
  const startStackBB = heroPlayer.stack / h.stakes.bb;

  let totalInvested = 0;
  for (const street of h.streets) {
    for (const action of street.actions) {
      if (action.player === h.heroName && action.amount != null) {
        totalInvested += action.amount;
      }
    }
  }
  const grossWon = h.winners.find(w => w.player === h.heroName)?.amount ?? 0;
  const netBB = (grossWon - totalInvested) / h.stakes.bb;

  const positionMap = computePositions(h.players, h.dealerSeat);
  const heroSeat = h.players.find(p => p.name === h.heroName)?.seat;
  const heroPosition = heroSeat != null ? positionMap.get(heroSeat) : undefined;

  return { heroCards, startStackBB, netBB, heroPosition };
}

export default function App() {
  const [hands, setHands] = useState<ParsedHand[]>([]);
  const [hand,  setHand]  = useState<ParsedHand | null>(null);
  const [showBBUnits, setShowBBUnits] = useState(false);
  const [zoom, setZoom] = useState(1);
  const replay = useReplay(hand);
  const replayRef = useRef<HTMLDivElement>(null);
  const [sidebarHeight, setSidebarHeight] = useState<number | undefined>();

  useEffect(() => {
    if (!replayRef.current) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setSidebarHeight(entry.contentRect.height);
      }
    });
    observer.observe(replayRef.current);
    return () => observer.disconnect();
  }, [hand]);

  const handleHandsParsed = (hs: ParsedHand[]) => {
    setHands(hs);
    // Se só há uma mão, vai direto para o replay sem passar pela lista
    if (hs.length === 1) setHand(hs[0]);
  };
  const handleSelectHand = (h: ParsedHand) => setHand(h);
  const handleBackToList = () => setHand(null);
  const handleReset      = () => { setHands([]); setHand(null); };

  // Navegação entre mãos na sessão atual
  const currentHandIndex = hand ? hands.indexOf(hand) : -1;
  const hasNextHand      = currentHandIndex >= 0 && currentHandIndex < hands.length - 1;
  const hasPrevHand      = currentHandIndex > 0;
  const handleNextHand   = useCallback(() => { if (hasNextHand) setHand(hands[currentHandIndex + 1]); }, [hasNextHand, hands, currentHandIndex]);
  const handlePrevHand   = useCallback(() => { if (hasPrevHand) setHand(hands[currentHandIndex - 1]); }, [hasPrevHand, hands, currentHandIndex]);

  // Navegação por teclado: ← → para ações, ↑ ↓ para mãos
  useEffect(() => {
    if (!hand) return;
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowRight') replay.next();
      if (e.key === 'ArrowLeft')  replay.prev();
      if (e.key === 'ArrowDown')  handleNextHand();
      if (e.key === 'ArrowUp')    handlePrevHand();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [hand, replay.next, replay.prev, handleNextHand, handlePrevHand]);

  // Botão "← Mãos" aparece apenas quando há múltiplas mãos e uma está selecionada
  const showBackBtn = hands.length > 1 && hand !== null;

  return (
    <div className="app">
      <header className="header">
        <h1 className="logo">
          <img src={logoImg} alt="" className="logoImg" aria-hidden="true" />
          FULL REPLAYER
        </h1>
        <div className="headerActions">
          {hand && hands.length <= 1 && (
            <div className="handInfo">
              <span className="formatBadge">{hand.format}</span>
              <span className="handId">Mão #1</span>
              <span className="stakes">{formatStakes(hand.stakes, hand.tableType)}</span>
            </div>
          )}
          {showBackBtn && (
            <button className="backBtn" onClick={handleBackToList}>
              ← Mãos
            </button>
          )}
          {hands.length > 0 && (
            <button className="resetBtn" onClick={handleReset}>
              Nova mão
            </button>
          )}
        </div>
      </header>

      <main className="main">
        <ErrorBoundary onReset={handleReset}>
          {hands.length === 0 ? (
            <FileUpload onHandsParsed={handleHandsParsed} />
          ) : !hand ? (
            /* Hand list */
            <div className="handListView">
              <h2 className="handListTitle">
                {hands.length} {hands.length === 1 ? 'mão encontrada' : 'mãos encontradas'}
              </h2>
              <ul className="handList">
                {hands.map((h, i) => {
                  const heroCards = h.heroName ? h.holeCards[h.heroName] : undefined;
                  return (
                    <li key={`${h.id}-${i}`}>
                      <button className="handListItem" onClick={() => handleSelectHand(h)}>
                        <span className="formatBadge">{h.format}</span>
                        <span className="handId">#{i + 1}</span>
                        {heroCards && (
                          <span className="handHeroCards">
                            <Card card={heroCards[0]} small />
                            <Card card={heroCards[1]} small />
                          </span>
                        )}
                        <span className="stakes">{formatStakes(h.stakes, h.tableType)}</span>
                        <span className="handDate">
                          {h.date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </span>
                        <span className="handPlayers">{h.players.length} jog.</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            /* Replay view — with optional sidebar */
            <div className={hands.length > 1 ? 'layout' : ''}>

              {hands.length > 1 && (
                <div className="sidebarColumn" style={sidebarHeight ? { maxHeight: sidebarHeight } : undefined}>
                  <div className="handInfoPanel">
                    <span className="formatBadge">{hand.format}</span>
                    <span className="handId">Mão #{currentHandIndex + 1}</span>
                    <span className="stakes">{formatStakes(hand.stakes, hand.tableType)}</span>
                  </div>
                  <aside className="sidebar">
                    <div className="sidebarHeader">{hands.length} mãos</div>
                    <ul className="sidebarList">
                      {hands.map((h, i) => {
                        const hero = getHeroSummary(h);
                        const won = hero ? hero.netBB > 0 : null;
                        return (
                          <li key={`${h.id}-${i}`}>
                            <button
                              className={`sidebarItem${h === hand ? ' sidebarItemActive' : ''}`}
                              onClick={() => handleSelectHand(h)}
                            >
                              <div className="sidebarItemRow">
                                <span className="sidebarItemId">#{i + 1}</span>
                                {hero?.heroCards && (
                                  <span className="sidebarItemCards">
                                    <Card card={hero.heroCards[0]} small />
                                    <Card card={hero.heroCards[1]} small />
                                  </span>
                                )}
                                {won !== null && (
                                  <span className={`sidebarItemResult${won ? ' sidebarItemResultWon' : ' sidebarItemResultLost'}`}>
                                    {won ? 'win' : 'loss'}
                                  </span>
                                )}
                              </div>
                              <div className="sidebarItemRow">
                                <span className="sidebarItemStakes">{formatStakes(h.stakes, h.tableType)}</span>
                                {hero?.heroPosition && (
                                  <span className="sidebarItemPosition">{hero.heroPosition}</span>
                                )}
                                {hero && (
                                  <span className="sidebarItemStack">
                                    {hero.startStackBB % 1 === 0 ? hero.startStackBB : hero.startStackBB.toFixed(1)}BB
                                  </span>
                                )}
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </aside>

                  <div className="sidebarPanel">
                    <div className="sidebarPanelRow">
                      <span className="sidebarPanelLabel">Valores</span>
                      <button
                        className={`sidebarPanelBtn${showBBUnits ? ' sidebarPanelBtnActive' : ''}`}
                        onClick={() => setShowBBUnits(v => !v)}
                      >
                        {showBBUnits ? 'BB' : 'Fichas'}
                      </button>
                    </div>
                    <div className="sidebarPanelRow">
                      <span className="sidebarPanelLabel">Zoom</span>
                      <input
                        type="range"
                        className="sidebarZoomSlider"
                        min="0.6"
                        max="1.4"
                        step="0.05"
                        value={zoom}
                        onChange={e => setZoom(Number(e.target.value))}
                      />
                      <span className="sidebarPanelValue">{Math.round(zoom * 100)}%</span>
                    </div>
                  </div>
                </div>
              )}

              {replay.state ? (
                <div className="replayView" ref={replayRef}>
                  <PokerTable
                    state={replay.state}
                    heroName={hand.heroName}
                    showBBUnits={showBBUnits}
                    bigBlind={hand.stakes.bb}
                    zoom={zoom}
                  />

                  <ReplayControls
                    currentStep={replay.currentStep}
                    totalSteps={replay.totalSteps}
                    onNext={replay.next}
                    onPrev={replay.prev}
                    hasNextHand={hasNextHand}
                    onNextHand={hands.length > 1 ? handleNextHand : undefined}
                    hasPrevHand={hasPrevHand}
                    onPrevHand={hands.length > 1 ? handlePrevHand : undefined}
                  />
                </div>
              ) : (
                <div className="loadingMsg">Carregando...</div>
              )}
            </div>
          )}
        </ErrorBoundary>
      </main>
    </div>
  );
}
