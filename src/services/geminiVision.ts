const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash'];

const STORAGE_KEY = 'gemini-api-key';

export function getSavedApiKey(): string {
  return localStorage.getItem(STORAGE_KEY) ?? '';
}

export function saveApiKey(key: string): void {
  localStorage.setItem(STORAGE_KEY, key);
}

/** Converte File para base64 data string. */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove o prefixo "data:image/png;base64,"
      resolve(result.split(',')[1]);
    };
    reader.onerror = () => reject(new Error('Falha ao ler arquivo.'));
    reader.readAsDataURL(file);
  });
}

const PROMPT = `Analyze this GGPoker tournament screenshot and extract ALL hand history data as JSON.

The screenshot has two sections:
1. TOP: The poker table with players, stacks (in BB), community cards, pot, dealer button
2. BOTTOM: Action timeline with columns: Blinds(Ante), Pre-Flop, Flop, Turn, River

Extract EVERY detail and return ONLY valid JSON (no markdown, no code blocks) with this exact structure:

{
  "handId": "string from header like TM5500062102",
  "tournamentName": "string from header",
  "players": [
    { "name": "exact player name", "stack": 25.3, "seat": 1, "isDealer": false }
  ],
  "blinds": {
    "ante": 1,
    "sb": 0.5,
    "bb": 1,
    "sbPlayer": "player name who posted SB",
    "bbPlayer": "player name who posted BB"
  },
  "board": {
    "flop": ["Th", "8h", "Ah"],
    "turn": "8s",
    "river": "4c"
  },
  "actions": {
    "preflop": [
      { "player": "exact name", "position": "UTG1", "action": "raise", "amount": 2 }
    ],
    "flop": [],
    "turn": [],
    "river": []
  },
  "holeCards": {
    "PlayerName": ["Ah", "Jd"]
  },
  "winner": {
    "player": "name",
    "amount": 17.6
  }
}

IMPORTANT RULES:
- All amounts are in BB (big blinds) as shown in the screenshot
- Cards use format: rank + suit letter. Ranks: A,K,Q,J,T,9,8,7,6,5,4,3,2. Suits: h=hearts, d=diamonds, c=clubs, s=spades
- For actions: use exactly "fold", "check", "call", "bet", "raise", "allin"
- Include ALL players visible on the table
- The dealer has "D" button next to their avatar
- Extract hole cards ONLY when visible (showdown section or next to player)
- Read player names exactly as shown (including truncated names with "..")
- Read the action timeline from top to bottom in each column
- Return ONLY the JSON object, nothing else`;

export interface GeminiResponse {
  handId: string;
  tournamentName: string;
  players: { name: string; stack: number; seat: number; isDealer: boolean }[];
  blinds: { ante: number; sb: number; bb: number; sbPlayer: string; bbPlayer: string };
  board: { flop: string[]; turn: string | null; river: string | null };
  actions: {
    preflop: { player: string; position: string; action: string; amount?: number }[];
    flop: { player: string; position: string; action: string; amount?: number }[];
    turn: { player: string; position: string; action: string; amount?: number }[];
    river: { player: string; position: string; action: string; amount?: number }[];
  };
  holeCards: Record<string, string[]>;
  winner: { player: string; amount: number };
}

async function tryModel(model: string, body: object, apiKey: string): Promise<Response> {
  const url = `${API_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function analyzeScreenshot(file: File, apiKey: string): Promise<GeminiResponse> {
  const base64 = await fileToBase64(file);

  const body = {
    contents: [{
      parts: [
        { inline_data: { mime_type: file.type || 'image/png', data: base64 } },
        { text: PROMPT },
      ],
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 4096,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  let lastError = '';

  // Tenta cada modelo; se der 429, tenta o proximo
  for (const model of MODELS) {
    const res = await tryModel(model, body, apiKey);

    if (res.ok) {
      const json = await res.json();
      const text: string = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

      if (!text) {
        throw new Error('Gemini nao retornou resposta. Tente novamente.');
      }

      // Remove markdown code fences e extrai apenas o JSON
      let cleaned = text;
      // Tenta extrair bloco ```json ... ```
      const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/i);
      if (fenceMatch) {
        cleaned = fenceMatch[1];
      }
      // Tenta extrair o primeiro objeto JSON { ... }
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleaned = jsonMatch[0];
      }
      cleaned = cleaned.trim();

      try {
        return JSON.parse(cleaned) as GeminiResponse;
      } catch {
        console.error('[Gemini] Resposta bruta:', text.slice(0, 500));
        throw new Error('Gemini retornou formato invalido. Tente novamente com outra imagem.');
      }
    }

    if (res.status === 401 || res.status === 403) {
      throw new Error('API key invalida. Verifique sua chave do Google Gemini.');
    }

    if (res.status === 429) {
      lastError = `Rate limit no modelo ${model}`;
      continue; // tenta proximo modelo
    }

    const err = await res.text();
    throw new Error(`Erro na API Gemini (${res.status}): ${err.slice(0, 200)}`);
  }

  throw new Error(`${lastError}. Todos os modelos estao com limite excedido. Aguarde ~1 minuto e tente novamente.`);
}