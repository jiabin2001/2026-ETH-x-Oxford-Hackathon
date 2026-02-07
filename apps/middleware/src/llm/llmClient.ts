import { CONFIG } from "../config.js";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatResponse = {
  choices?: Array<{ message?: { content?: string } }>;
};

function extractJsonCandidate(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return trimmed;
  const firstObj = trimmed.indexOf("{");
  const firstArr = trimmed.indexOf("[");
  const first = firstObj === -1 ? firstArr : firstArr === -1 ? firstObj : Math.min(firstObj, firstArr);
  if (first === -1) return null;
  const lastObj = trimmed.lastIndexOf("}");
  const lastArr = trimmed.lastIndexOf("]");
  const last = Math.max(lastObj, lastArr);
  if (last === -1 || last <= first) return null;
  return trimmed.slice(first, last + 1);
}

export function tryParseJson(text: string): unknown | null {
  const candidate = extractJsonCandidate(text);
  if (!candidate) return null;
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

export async function chatComplete(messages: ChatMessage[]): Promise<{ ok: boolean; content?: string; error?: string }> {
  if (!CONFIG.llmEnabled) return { ok: false, error: "LLM disabled" };
  const url = CONFIG.llmChatUrl;
  if (!url) return { ok: false, error: "LLM chat URL not configured" };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(CONFIG.llmApiKey ? { Authorization: `Bearer ${CONFIG.llmApiKey}` } : {}),
      },
      body: JSON.stringify({
        model: CONFIG.llmModel,
        messages,
        temperature: CONFIG.llmTemperature,
        max_tokens: CONFIG.llmMaxTokens,
      }),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status} ${await res.text()}` };
    const payload = (await res.json()) as ChatResponse;
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return { ok: false, error: "Empty LLM response" };
    return { ok: true, content };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
