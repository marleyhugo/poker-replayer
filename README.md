# Poker Replayer

Reprodutor visual de mãos de poker a partir de arquivos de hand history.

## Funcionalidades

- Upload de arquivo `.txt` ou cole o texto diretamente
- Detecção automática de formato (PokerStars, GGPoker, 888 Poker, WPN)
- Mesa 2D com até 9 assentos
- Controles de replay: play/pause, anterior/próximo, velocidade ajustável
- Exibe cartas, stacks, apostas e pot em tempo real

## Início Rápido

```bash
npm install
npm run dev      # servidor em http://localhost:5173
npm run build    # build de produção em dist/
npm run preview  # preview do build
```

## Formatos Suportados

| Plataforma | Identificação no cabeçalho |
|---|---|
| PokerStars | `PokerStars Hand #` |
| GGPoker / Natural8 | `Poker Hand #HD` |
| 888 Poker / Pacific | `888poker Hand History for Game` |
| WPN (Winning Poker) | `Game #NNN starts` |

## Documentação Detalhada

- [Arquitetura](docs/ARCHITECTURE.md) — estrutura do código, fluxo de dados, decisões de design
- [Parsers](docs/PARSERS.md) — como cada formato é parseado, formatos de regex
- [Engine](docs/ENGINE.md) — como `ParsedHand` é convertido em passos reproduzíveis

## Estrutura de Pastas

```
src/
  types/poker.ts          # Tipos TypeScript compartilhados
  parsers/                # Parser por plataforma + auto-detecção
    index.ts              # detectFormat() + parseHandHistory()
    pokerstars.ts
    ggpoker.ts
    888poker.ts
    wpn.ts
  engine/
    gameState.ts          # buildSteps(hand) → GameState[]
  hooks/
    useReplay.ts          # play/pause/step, auto-advance
  components/
    Card/                 # Carta (face/verso)
    Board/                # 5 cartas comunitárias + pot
    PlayerSeat/           # Assento com cartas, stack, aposta
    PokerTable/           # Mesa oval com todos os assentos
    ReplayControls/       # Transporte + slider + velocidade
    FileUpload/           # Drag-drop + textarea de texto
    ErrorBoundary/        # Captura erros de renderização
  App.tsx
```
