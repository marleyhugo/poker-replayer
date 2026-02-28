# Arquitetura

## Fluxo de Dados

```
Arquivo .txt / texto colado
        │
        ▼
  parsers/index.ts
  detectFormat() → parseHandHistory()
        │
        ▼
    ParsedHand          ← estrutura normalizada
        │
        ▼
  engine/gameState.ts
  buildSteps(hand)
        │
        ▼
   GameState[]          ← array de snapshots (um por ação)
        │
        ▼
  hooks/useReplay.ts
  useReplay(hand)
        │
        ▼
   Componentes React    ← recebem GameState via props
```

## Tipos Principais

### `ParsedHand`
Saída dos parsers. Representa uma mão completa de forma normalizada.

```ts
interface ParsedHand {
  id: string;
  format: 'pokerstars' | 'ggpoker' | '888poker' | 'wpn';
  date: Date;
  stakes: { sb: number; bb: number };
  tableType: 'cash' | 'tournament';
  players: { seat: number; name: string; stack: number }[];
  dealerSeat: number;
  heroName?: string;
  holeCards: Record<string, [Card, Card]>;
  streets: StreetData[];
  winners: { player: string; amount: number; description?: string }[];
}
```

### `GameState`
Snapshot do estado da mesa em um passo específico do replay.

```ts
interface GameState {
  step: number;
  totalSteps: number;
  street: Street;
  board: Card[];
  players: PlayerState[];
  pot: number;
  message: string;
}
```

### `PlayerState`
Estado de um jogador em um determinado passo.

```ts
interface PlayerState {
  name: string; seat: number; stack: number;
  bet: number;            // aposta na street atual
  totalInvested: number;  // total de fichas colocadas no pot
  holeCards?: [Card, Card];
  folded: boolean;
  isDealer: boolean;
  isActive: boolean;      // vez de agir
  isWinner: boolean;
  isAllIn: boolean;
}
```

## Princípios de Design

1. **Parsers stateless** — recebem texto, retornam `ParsedHand`, sem efeitos colaterais.
2. **Engine determinístico** — `buildSteps()` é função pura: mesmo input → mesmo output.
3. **Componentes "burros"** — componentes React recebem `GameState` via props e apenas renderizam.
4. **Hook gerencia estado** — `useReplay` encapsula toda lógica de tempo e navegação.
5. **DRY nos parsers** — lógica compartilhada (parseAmount, StreetMachine, addWinner) extraída para `parsers/utils.ts`.

## Módulos Adicionados (Refatoração)

| Arquivo | Responsabilidade |
|---|---|
| `parsers/utils.ts` | Helpers compartilhados: `parseAmount`, `parseCard`, `parseCards`, `parseTwoCards`, `StreetMachine`, `addWinner` |
| `parsers/validate.ts` | `validateHand()` + `HandValidationError` — chamado dentro de `parseHandHistory()` |
| `components/ErrorBoundary/` | Captura exceções React (class component) e exibe UI de erro amigável com botão de reset |

## Validação de Dados

`validateHand()` em `parsers/validate.ts` é chamada automaticamente após o parse e verifica:
- Mínimo 2 jogadores
- Nenhum jogador com stack negativo
- Nenhum nome de jogador vazio
- Nenhum assento duplicado
- `dealerSeat` pertence à lista de players (corrigido automaticamente se inválido)
- Pelo menos uma street presente
- Primeira street é `preflop`

## Tratamento de Erros

- Erros de parsing/validação propagam como `Error` com mensagem em português
- `ErrorBoundary` no `App` captura exceções de renderização e exibe botão "Tentar novamente"
- `useReplay` retorna `state: null` quando não há mão carregada

## CSS

Todas as cores e tokens visuais estão definidos em `index.css` como variáveis CSS:
- `--color-*` — cores de texto, superfície, bordas, feedbacks
- `--table-*` — cores da mesa (feltro, borda)
- CSS Modules nos componentes usam `var(--...)` — nenhuma cor hardcoded fora de `index.css`

## Posicionamento dos Assentos

Os assentos são posicionados via CSS (`.seat0` a `.seat9`) em coordenadas percentuais
relativas à mesa oval. Jogadores são mapeados por ordem de `seat` crescente para
as posições visuais. Key do React é `player.seat` (estável e único por mão).
