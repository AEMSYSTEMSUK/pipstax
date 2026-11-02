import Anthropic from '@anthropic-ai/sdk';

// One Claude Messages call with tools for the AI Workspace tool loop (official SDK, manual loop - the loop needs a
// spend-cap check, permission-scoped tools and an audit trail between turns).

export const DEFAULT_MODEL = 'claude-opus-5-5';
export const MODEL_CHOICES = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'];

// List prices, USD per 1M tokens (Nov 2026). Cache reads bill at 0.1x input, 5-minute cache writes at 1.25x.
const PRICES: Array<[string, { in: number; out: number }]> = [
  ['claude-fable-5', { in: 10, out: 50 }],
  ['claude-opus-5-5', { in: 4, out: 20 }],
  ['claude-opus-5', { in: 5, out: 25 }],
  ['claude-opus-4', { in: 5, out: 25 }],
  ['claude-sonnet-5', { in: 2, out: 10 }],
  ['claude-sonnet-4', { in: 3, out: 15 }],
  ['claude-haiku-5', { in: 0.1, out: 0.5 }],
  ['claude-haiku-4', { in: 1, out: 5 }],
];
export const priceFor = (model: string) => PRICES.find(([k]) => (model || '').startsWith(k))?.[1] ?? { in: 4, out: 20 };

// Models that take server-side refusal fallbacks ("default" routing) and adaptive thinking with effort.
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-opus-5']);
const EFFORT_MODELS = /^claude-(opus|sonnet|haiku|fable)-5/;

export type ToolTurn = {
  message: Anthropic.Beta.BetaMessage;
  servedBy: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

export const claudeToolTurn = async (req: {
  apiKey: string;
  model: string;
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  tools: Anthropic.Beta.BetaTool[];
}): Promise<ToolTurn> => {
  const client = new Anthropic({ apiKey: req.apiKey, maxRetries: 3, timeout: 5 * 60 * 1000 });
  const fallback = FALLBACK_MODELS.has(req.model);
  const message = await client.beta.messages.create({
    model: req.model,
    max_tokens: 16000,
    // Automatic prompt caching: every turn resends tools + system + earlier turns, so from turn 2 most input is a
    // cache read. Prefixes below the model's minimum cacheable size simply aren't cached.
    cache_control: { type: 'ephemeral' },
    system: req.system,
    messages: req.messages,
    ...(req.tools.length ? { tools: req.tools, tool_choice: { type: 'auto' as const } } : {}),
    ...(EFFORT_MODELS.test(req.model) ? { output_config: { effort: 'medium' as const } } : {}),
    ...(fallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
  });
  const u = message.usage;
  const fresh = u.input_tokens || 0;
  const cacheRead = u.cache_read_input_tokens || 0;
  const cacheWrite = u.cache_creation_input_tokens || 0;
  const servedBy = message.model || req.model;
  const p = priceFor(servedBy);
  const costUsd = ((fresh + cacheRead * 0.1 + cacheWrite * 1.25) / 1e6) * p.in + ((u.output_tokens || 0) / 1e6) * p.out;
  return { message, servedBy, inputTokens: fresh + cacheRead + cacheWrite, outputTokens: u.output_tokens || 0, costUsd };
};

// Cheap key check for the settings page: list one model.
export const testAnthropicKey = async (apiKey: string) => {
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 20000 });
  await client.models.list({ limit: 1 });
  return true;
};
