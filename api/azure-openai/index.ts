import { AzureOpenAI } from "openai";
import { AzureKeyCredential, SearchClient } from "@azure/search-documents";

// Azure OpenAI configuration from environment variables
const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
const AZURE_OPENAI_API_KEY = process.env.AZURE_OPENAI_API_KEY;
const AZURE_OPENAI_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || "grok-4-fast-reasoning";
const AZURE_OPENAI_API_VERSION = process.env.AZURE_OPENAI_API_VERSION || "2024-08-01-preview";

// Azure AI Search configuration from environment variables
const SEARCH_ENDPOINT = process.env.AZURE_SEARCH_ENDPOINT;
const SEARCH_API_KEY = process.env.AZURE_SEARCH_API_KEY;
const SEARCH_INDEX_NAME = process.env.AZURE_SEARCH_INDEX_NAME || "full-index-bluecrow";

const DEFAULT_GROUNDING_CONFIDENCE_THRESHOLD = 0.55;
const GROUNDING_CONFIDENCE_THRESHOLD = resolveConfidenceThreshold(
  process.env.AZURE_OPENAI_GROUNDING_CONFIDENCE_THRESHOLD
);
const DEFAULT_RETRIEVAL_CACHE_TTL_MS = 10 * 60 * 1000;
const RETRIEVAL_CACHE_TTL_MS = resolvePositiveInteger(
  process.env.AZURE_OPENAI_RETRIEVAL_CACHE_TTL_MS,
  DEFAULT_RETRIEVAL_CACHE_TTL_MS
);

const KB_SEPARATOR = "\n\n---\n\n";

const FAST_DEEP_KEYWORDS = [
  "more detail",
  "expand",
  "tell me more",
  "dive deeper",
  "explain in detail",
  "walk me through",
];

const FACTUAL_DETAIL_KEYWORDS = [
  "fee",
  "fees",
  "minimum",
  "process",
  "timeline",
  "eligibility",
  "requirement",
  "golden visa",
  "risk",
  "liquidity",
  "return",
  "returns",
  "track record",
  "subscription",
  "redemption",
  "performance",
];

type ResponseMode = "FAST" | "DEEP";

type QuestionClaritySignal = {
  needsClarification: boolean;
  reasons: string[];
};

type SmalltalkIntent = "greeting" | "connection_check" | "thanks" | "goodbye" | null;
type RetrievalSource = "cache" | "search" | "provided_context";

type RetrievalConfig = {
  topK: number;
  maxCharsPerChunk: number;
  totalKBCharsBudget: number;
  maxOutputTokens: number;
};

type ModeDecision = {
  mode: ResponseMode;
  reasons: string[];
};

type FaqMatch = {
  intent: string;
  matchedKeywords: string[];
};

type RetrievalResult = {
  kbContext: string;
  snippets: string[];
  slideCandidates: string[];
  source: RetrievalSource;
  cacheHit: boolean;
  faqIntent: string | null;
  config: RetrievalConfig;
};

type RetrievalCacheEntry = {
  expiresAt: number;
  value: Omit<RetrievalResult, "source" | "cacheHit">;
};

interface KnowledgeDocument {
  id?: string;
  parent_id?: string;
  title?: string;
  chunk?: string;
}

const MODE_RETRIEVAL_CONFIG: Record<ResponseMode, RetrievalConfig> = {
  FAST: {
    topK: 3,
    maxCharsPerChunk: 600,
    totalKBCharsBudget: 2200,
    maxOutputTokens: 220,
  },
  DEEP: {
    topK: 6,
    maxCharsPerChunk: 900,
    totalKBCharsBudget: 5200,
    maxOutputTokens: 700,
  },
};

const COMMON_FAQ_INTENTS: Array<{ intent: string; keywords: string[] }> = [
  { intent: "fees", keywords: ["fee", "fees", "management fee", "performance fee", "cost"] },
  {
    intent: "minimum_investment",
    keywords: ["minimum", "minimum investment", "ticket size", "entry amount", "min amount"],
  },
  {
    intent: "investment_process",
    keywords: ["process", "onboarding", "application", "subscription", "steps"],
  },
  { intent: "timeline", keywords: ["timeline", "timeframe", "how long", "duration", "processing time"] },
  {
    intent: "golden_visa_eligibility",
    keywords: ["golden visa", "eligibility", "eligible", "qualify", "requirements"],
  },
  { intent: "risk", keywords: ["risk", "downside", "loss", "volatility"] },
  { intent: "liquidity", keywords: ["liquidity", "lock-up", "lockup", "withdraw", "liquid"] },
  {
    intent: "track_record_returns",
    keywords: ["track record", "return", "returns", "performance", "historical"],
  },
  {
    intent: "subscription_redemption",
    keywords: ["subscribe", "subscription", "redeem", "redemption", "exit"],
  },
  {
    intent: "documentation",
    keywords: ["documents", "paperwork", "forms", "kyc", "compliance"],
  },
];

const retrievalCache = new Map<string, RetrievalCacheEntry>();
let searchClient: SearchClient<KnowledgeDocument> | null = null;

function resolvePositiveInteger(rawValue: string | undefined, fallbackValue: number): number {
  if (!rawValue) {
    return fallbackValue;
  }

  const parsedValue = Number(rawValue);
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return fallbackValue;
  }

  return Math.round(parsedValue);
}

function resolveConfidenceThreshold(rawThreshold?: string): number {
  if (!rawThreshold) {
    return DEFAULT_GROUNDING_CONFIDENCE_THRESHOLD;
  }

  const parsedThreshold = Number(rawThreshold);
  if (!Number.isFinite(parsedThreshold) || parsedThreshold < 0 || parsedThreshold > 1) {
    return DEFAULT_GROUNDING_CONFIDENCE_THRESHOLD;
  }

  return parsedThreshold;
}

function normalizeEvidence(rawEvidence: unknown): string[] {
  if (!Array.isArray(rawEvidence)) {
    return [];
  }

  return rawEvidence
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveConfidence(rawConfidence: unknown): number {
  if (typeof rawConfidence === "number") {
    return rawConfidence;
  }

  if (typeof rawConfidence === "string") {
    return Number(rawConfidence);
  }

  return NaN;
}

function normalizeQuestionForCache(rawQuestion: string): string {
  return rawQuestion
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u00ff\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeForMatching(rawValue: string): string[] {
  return rawValue
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u00ff\s]/gi, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}
function detectSmalltalkIntent(rawQuestion: string): SmalltalkIntent {
  const questionText = typeof rawQuestion === "string" ? rawQuestion.toLowerCase().trim() : "";

  if (!questionText) {
    return null;
  }

  if (
    /\b(bye|goodbye|see you|talk to you later|that'?s all|we'?re done|i'?m done|im done)\b/i.test(
      questionText
    )
  ) {
    return "goodbye";
  }

  if (/\b(thanks|thank you|thank u|appreciate it)\b/i.test(questionText)) {
    return "thanks";
  }

  if (
    /\b(can you hear me|are you there|mic check|audio check|sound check|test(?:ing)?|check check)\b/i.test(
      questionText
    )
  ) {
    return "connection_check";
  }

  if (/\b(hello|hi|hey|good morning|good afternoon|good evening)\b/i.test(questionText)) {
    return "greeting";
  }

  return null;
}

function buildSmalltalkFastPathAnswer(language: string, intent: Exclude<SmalltalkIntent, null>): string {
  const isPortuguese = language === "pt-BR";

  if (isPortuguese) {
    if (intent === "connection_check") {
      return "Sim, estou ouvindo bem. Sobre qual tema da BlueCrow voce quer falar?";
    }
    if (intent === "thanks") {
      return "De nada. Se quiser, posso cobrir mais algum ponto da BlueCrow.";
    }
    if (intent === "goodbye") {
      return "Obrigado pela conversa. Quando quiser, podemos retomar.";
    }
    return "Ola, estou aqui e pronto para ajudar. O que voce gostaria de ver sobre a BlueCrow?";
  }

  if (intent === "connection_check") {
    return "Yes, I can hear you clearly. What would you like to discuss about BlueCrow?";
  }
  if (intent === "thanks") {
    return "You're welcome. If you want, we can quickly cover one more BlueCrow topic.";
  }
  if (intent === "goodbye") {
    return "Thanks for the conversation. Feel free to come back anytime.";
  }
  return "Hi, I'm here and ready to help. What would you like to go over about BlueCrow?";
}

function analyzeQuestionForSpeechNoise(rawQuestion: string): QuestionClaritySignal {
  const questionText = typeof rawQuestion === "string" ? rawQuestion.trim() : "";

  if (!questionText) {
    return { needsClarification: true, reasons: ["empty_or_whitespace"] };
  }

  const reasons: string[] = [];
  const tokens = questionText.split(/\s+/).filter(Boolean);
  const symbolCount = (questionText.match(/[^a-zA-Z0-9\u00c0-\u00ff\s]/g) || []).length;
  const symbolRatio = symbolCount / Math.max(questionText.length, 1);
  const compactTokens = tokens.map((token) => token.replace(/[^a-zA-Z0-9\u00c0-\u00ff]/g, ""));
  const oneCharTokenCount = compactTokens.filter((token) => token.length === 1).length;
  const oneCharTokenRatio = oneCharTokenCount / Math.max(tokens.length, 1);

  if (questionText.length < 12 || tokens.length <= 2) {
    reasons.push("very_short");
  }
  if (symbolRatio > 0.28) {
    reasons.push("high_symbol_noise");
  }
  if (/[bcdfghjklmnpqrstvwxyz]{6,}/i.test(questionText)) {
    reasons.push("garbled_letter_sequence");
  }
  if (tokens.length >= 4 && oneCharTokenRatio > 0.6) {
    reasons.push("fragmented_tokens");
  }
  if (/[?!.]{3,}/.test(questionText)) {
    reasons.push("repeated_punctuation");
  }

  return {
    needsClarification: reasons.length > 0,
    reasons,
  };
}

function decideResponseMode(rawQuestion: string): ModeDecision {
  const question = typeof rawQuestion === "string" ? rawQuestion.trim() : "";
  const normalizedQuestion = normalizeQuestionForCache(question);
  const tokenCount = normalizedQuestion.split(/\s+/).filter(Boolean).length;
  const questionMarkCount = (question.match(/\?/g) || []).length;

  const reasons: string[] = [];

  const askedToGoDeeper = FAST_DEEP_KEYWORDS.some((keyword) => normalizedQuestion.includes(keyword));
  if (askedToGoDeeper) {
    reasons.push("explicit_deep_request");
  }

  if (tokenCount > 18) {
    reasons.push("token_count_gt_18");
  }
  if (questionMarkCount >= 2) {
    reasons.push("multiple_questions");
  }
  if (/\b(and also|also|additionally|compare|difference between)\b/i.test(normalizedQuestion)) {
    reasons.push("multi_part_phrase");
  }

  if (reasons.length > 0) {
    return { mode: "DEEP", reasons };
  }

  return { mode: "FAST", reasons: ["default_fast"] };
}

function isClearlyFactualBlueCrowQuestion(rawQuestion: string): boolean {
  const normalizedQuestion = normalizeQuestionForCache(rawQuestion);
  const matchedCount = FACTUAL_DETAIL_KEYWORDS.filter((keyword) =>
    normalizedQuestion.includes(keyword)
  ).length;

  return matchedCount >= 1;
}

function matchCommonFaqIntent(rawQuestion: string): FaqMatch | null {
  const normalizedQuestion = normalizeQuestionForCache(rawQuestion);

  const scoredMatches = COMMON_FAQ_INTENTS.map((item) => {
    const matchedKeywords = item.keywords.filter((keyword) => normalizedQuestion.includes(keyword));
    return {
      intent: item.intent,
      matchedKeywords,
      score: matchedKeywords.length,
    };
  })
    .filter((entry) => entry.score >= 2)
    .sort((left, right) => right.score - left.score);

  if (scoredMatches.length === 0) {
    return null;
  }

  return {
    intent: scoredMatches[0].intent,
    matchedKeywords: scoredMatches[0].matchedKeywords,
  };
}

function getEffectiveRetrievalConfig(mode: ResponseMode, faqMatch: FaqMatch | null): RetrievalConfig {
  const baseConfig = MODE_RETRIEVAL_CONFIG[mode];

  if (!faqMatch) {
    return { ...baseConfig };
  }

  return {
    topK: Math.max(2, baseConfig.topK - 1),
    maxCharsPerChunk: Math.max(350, Math.floor(baseConfig.maxCharsPerChunk * 0.85)),
    totalKBCharsBudget: Math.max(1200, Math.floor(baseConfig.totalKBCharsBudget * 0.8)),
    maxOutputTokens: baseConfig.maxOutputTokens,
  };
}

function truncateWithEllipsis(rawValue: string, maxChars: number): string {
  if (rawValue.length <= maxChars) {
    return rawValue;
  }

  if (maxChars <= 3) {
    return rawValue.slice(0, maxChars);
  }

  return `${rawValue.slice(0, maxChars - 3).trimEnd()}...`;
}
function selectSnippetSegments(rawChunk: string, queryTokens: Set<string>): string[] {
  const normalizedChunk = rawChunk.replace(/\r/g, " ").replace(/\t/g, " ").trim();
  if (!normalizedChunk) {
    return [];
  }

  const lineCandidates = normalizedChunk
    .split(/\n+/)
    .flatMap((line) => {
      const compactLine = line.replace(/\s+/g, " ").trim();
      if (!compactLine) {
        return [];
      }
      const sentenceParts = compactLine.match(/[^.!?]+[.!?]?/g) || [compactLine];
      return sentenceParts.map((part) => part.replace(/\s+/g, " ").trim()).filter(Boolean);
    })
    .filter((line) => line.length >= 20);

  if (lineCandidates.length === 0) {
    return [truncateWithEllipsis(normalizedChunk, 240)];
  }

  const uniqueLines: string[] = [];
  const seen = new Set<string>();

  lineCandidates.forEach((line) => {
    const key = line.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      uniqueLines.push(line);
    }
  });

  const ranked = uniqueLines
    .map((line, index) => {
      const tokens = tokenizeForMatching(line);
      const overlap = tokens.reduce((count, token) => {
        return count + (queryTokens.has(token) ? 1 : 0);
      }, 0);

      const score = overlap * 4 + (line.length > 50 ? 0.3 : 0) - index * 0.01;
      return { line, index, overlap, score };
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.index - right.index;
    });

  const overlapMatches = ranked.filter((item) => item.overlap > 0).slice(0, 4);
  const selected = overlapMatches.length >= 2 ? overlapMatches : ranked.slice(0, Math.min(3, ranked.length));

  return selected.map((item) => item.line);
}

function buildCompressedSnippet(
  doc: { slideId: string; title: string; chunk: string },
  questionTokens: Set<string>,
  maxCharsPerChunk: number
): string {
  const selectedSegments = selectSnippetSegments(doc.chunk, questionTokens).slice(0, 4);
  const snippetText = selectedSegments.join(" ");

  const baseSnippet = `SlideId: ${doc.slideId}\nTitle: ${doc.title}\nSnippet: ${snippetText}`;
  return truncateWithEllipsis(baseSnippet, maxCharsPerChunk);
}

function compactProvidedContext(
  rawContext: string,
  config: RetrievalConfig,
  rawQuestion: string
): { snippets: string[]; kbContext: string; slideCandidates: string[] } {
  const sections = rawContext
    .split(KB_SEPARATOR)
    .map((section) => section.trim())
    .filter(Boolean);

  const snippets: string[] = [];
  const questionTokens = new Set(tokenizeForMatching(rawQuestion));
  let currentChars = 0;

  for (const section of sections) {
    if (snippets.length >= config.topK || currentChars >= config.totalKBCharsBudget) {
      break;
    }

    let title = "Provided Context";
    let chunk = section;

    if (section.toLowerCase().startsWith("source:")) {
      const newLineIndex = section.indexOf("\n");
      if (newLineIndex > -1) {
        title = section.slice("source:".length, newLineIndex).trim() || title;
        chunk = section.slice(newLineIndex + 1).trim();
      } else {
        title = section.slice("source:".length).trim() || title;
        chunk = "";
      }
    }

    const snippet = buildCompressedSnippet(
      {
        slideId: "unknown",
        title,
        chunk,
      },
      questionTokens,
      config.maxCharsPerChunk
    );

    const separatorChars = snippets.length > 0 ? KB_SEPARATOR.length : 0;
    const remainingBudget = config.totalKBCharsBudget - currentChars - separatorChars;
    if (remainingBudget <= 80) {
      break;
    }

    const boundedSnippet = truncateWithEllipsis(snippet, remainingBudget);
    snippets.push(boundedSnippet);
    currentChars += separatorChars + boundedSnippet.length;
  }

  if (snippets.length === 0) {
    const fallbackSnippet = truncateWithEllipsis(rawContext.trim(), Math.min(config.totalKBCharsBudget, 800));
    snippets.push(fallbackSnippet || "No relevant information found in the provided context.");
  }

  return {
    snippets,
    kbContext: snippets.join(KB_SEPARATOR),
    slideCandidates: [],
  };
}

function getSearchClient(): SearchClient<KnowledgeDocument> {
  if (!SEARCH_ENDPOINT || !SEARCH_API_KEY) {
    throw new Error("Missing Azure Search configuration");
  }

  if (!searchClient) {
    searchClient = new SearchClient<KnowledgeDocument>(
      SEARCH_ENDPOINT,
      SEARCH_INDEX_NAME,
      new AzureKeyCredential(SEARCH_API_KEY)
    );
  }

  return searchClient;
}

function getRetrievalCacheKey(rawQuestion: string, mode: ResponseMode): string {
  return `${normalizeQuestionForCache(rawQuestion)}|${mode}`;
}

function pruneRetrievalCache(now: number): void {
  if (retrievalCache.size <= 250) {
    return;
  }

  for (const [key, entry] of retrievalCache.entries()) {
    if (entry.expiresAt <= now) {
      retrievalCache.delete(key);
    }
  }

  while (retrievalCache.size > 180) {
    const oldestKey = retrievalCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    retrievalCache.delete(oldestKey);
  }
}

function getCachedRetrieval(cacheKey: string, now: number): RetrievalCacheEntry | null {
  const cachedEntry = retrievalCache.get(cacheKey);
  if (!cachedEntry) {
    return null;
  }

  if (cachedEntry.expiresAt <= now) {
    retrievalCache.delete(cacheKey);
    return null;
  }

  return cachedEntry;
}

function setCachedRetrieval(cacheKey: string, value: Omit<RetrievalResult, "cacheHit" | "source">, now: number): void {
  retrievalCache.set(cacheKey, {
    expiresAt: now + RETRIEVAL_CACHE_TTL_MS,
    value,
  });

  pruneRetrievalCache(now);
}
async function getKnowledgeContext(options: {
  question: string;
  mode: ResponseMode;
  providedContext?: string | null;
}): Promise<RetrievalResult> {
  const { question, mode, providedContext } = options;
  const faqMatch = matchCommonFaqIntent(question);
  const config = getEffectiveRetrievalConfig(mode, faqMatch);

  const now = Date.now();
  const cacheKey = getRetrievalCacheKey(question, mode);
  const cachedEntry = getCachedRetrieval(cacheKey, now);

  if (cachedEntry) {
    return {
      ...cachedEntry.value,
      source: "cache",
      cacheHit: true,
    };
  }

  if (typeof providedContext === "string" && providedContext.trim()) {
    const compact = compactProvidedContext(providedContext, config, question);

    const value: Omit<RetrievalResult, "cacheHit" | "source"> = {
      kbContext: compact.kbContext,
      snippets: compact.snippets,
      slideCandidates: compact.slideCandidates,
      faqIntent: faqMatch?.intent || null,
      config,
    };

    setCachedRetrieval(cacheKey, value, now);

    return {
      ...value,
      source: "provided_context",
      cacheHit: false,
    };
  }

  const client = getSearchClient();
  const searchOptions: any = {
    top: config.topK,
    includeTotalCount: false,
    select: ["id", "parent_id", "title", "chunk"],
  };

  const searchResults = await client.search(question, searchOptions);

  const snippets: string[] = [];
  const slideCandidates: string[] = [];
  const queryTokens = new Set(tokenizeForMatching(question));
  let currentChars = 0;

  for await (const result of searchResults.results) {
    const document = result.document;
    if (!document?.chunk) {
      continue;
    }

    const slideId = (document.parent_id || document.id || "unknown").trim() || "unknown";
    const title = (document.title || "Untitled").trim() || "Untitled";

    const rawSnippet = buildCompressedSnippet(
      {
        slideId,
        title,
        chunk: document.chunk,
      },
      queryTokens,
      config.maxCharsPerChunk
    );

    const separatorChars = snippets.length > 0 ? KB_SEPARATOR.length : 0;
    const remainingBudget = config.totalKBCharsBudget - currentChars - separatorChars;
    if (remainingBudget <= 80) {
      break;
    }

    const boundedSnippet = truncateWithEllipsis(rawSnippet, remainingBudget);
    snippets.push(boundedSnippet);
    currentChars += separatorChars + boundedSnippet.length;

    if (slideId !== "unknown" && !slideCandidates.includes(slideId)) {
      slideCandidates.push(slideId);
    }

    if (snippets.length >= config.topK || currentChars >= config.totalKBCharsBudget) {
      break;
    }
  }

  if (snippets.length === 0) {
    snippets.push("No relevant information found in the provided Knowledge Base snippets.");
  }

  const value: Omit<RetrievalResult, "cacheHit" | "source"> = {
    kbContext: snippets.join(KB_SEPARATOR),
    snippets,
    slideCandidates,
    faqIntent: faqMatch?.intent || null,
    config,
  };

  setCachedRetrieval(cacheKey, value, now);

  return {
    ...value,
    source: "search",
    cacheHit: false,
  };
}

function resolveFallbackSlideId(
  slidesManifest: string,
  preferredSlideId: unknown,
  candidateSlideIds: string[] = []
): string {
  const normalizedPreferredSlideId =
    typeof preferredSlideId === "string" ? preferredSlideId.trim() : "";
  let manifestSlideIds: string[] = [];

  try {
    const parsedManifest = JSON.parse(slidesManifest);

    if (Array.isArray(parsedManifest)) {
      manifestSlideIds = parsedManifest
        .map((slide: any) => (slide && typeof slide.id === "string" ? slide.id.trim() : ""))
        .filter(Boolean);
    }
  } catch {
    // Ignore parsing issues and use safe fallback logic below.
  }

  if (
    normalizedPreferredSlideId &&
    (manifestSlideIds.length === 0 || manifestSlideIds.includes(normalizedPreferredSlideId))
  ) {
    return normalizedPreferredSlideId;
  }

  const normalizedCandidates = candidateSlideIds
    .map((candidate) => (typeof candidate === "string" ? candidate.trim() : ""))
    .filter(Boolean);
  const validCandidate = normalizedCandidates.find((candidate) => manifestSlideIds.includes(candidate));

  if (validCandidate) {
    return validCandidate;
  }

  if (manifestSlideIds.length > 0) {
    return manifestSlideIds[0];
  }

  if (normalizedPreferredSlideId) {
    return normalizedPreferredSlideId;
  }

  if (normalizedCandidates.length > 0) {
    return normalizedCandidates[0];
  }

  return "fallback";
}

function buildSafeFallbackAnswer(language: string): string {
  if (language === "pt-BR") {
    return "Nao encontrei esse detalhe especifico nos materiais fornecidos. Posso ajudar com as informacoes disponiveis aqui ou ligar voce a equipe da BlueCrow para uma resposta mais precisa.";
  }

  return "I couldn't find that specific detail in the provided materials. I can still help with what's available here, or I can connect you with the BlueCrow team for a precise answer.";
}

function buildSystemPrompt(languageName: string, slidesManifest: string): string {
  return `You are Blue Crow Capital's Virtual Financial Information Specialist for live investor conversations.

CRITICAL LANGUAGE
- Respond entirely in ${languageName}.

ROLE
- Provide clear, professional information about Blue Crow Capital funds, structures, timelines, and documented processes.
- You are informational only, not a financial, legal, tax, or regulatory advisor.

HARD GROUNDING (KB-ONLY FOR BLUECROW FACTS)
- Use outside knowledge only for basic conversational wording.
- Any BlueCrow fact must come strictly from the provided Knowledge Base snippets.
- If a requested detail is missing, explicitly say you cannot confirm it from available materials.
- Do not invent, guess, interpolate, or imply certainty.

REGULATED TOPIC BOUNDARIES
- No personal suitability advice and no recommendations on what someone should invest in.
- No guarantees or predictions (returns, approvals, timelines, or outcomes).
- No legal interpretation or success probability for Golden Visa.
- For performance expectations, share only documented facts; no projections or implied promises.
- For regulated-topic deflection, keep it brief and calm using: acknowledge -> boundary -> what you can cover from KB -> one practical next-step question.

RESPONSE DEPTH MODES
- FAST: Give a short answer first (1-2 spoken sentences) and one natural follow-up question that offers to expand.
- DEEP: Provide more detail (3-6 short spoken sentences). Follow-up is optional.

UNCLEAR / SPEECH-NOISE INPUT
- If the request is unclear or garbled, ask a quick clarification before factual answering.
- Offer 2-3 likely interpretations as explicit options (A/B/C style), tied to user wording and KB topics.
- Never guess user intent.

SCOPE
- Answer only Blue Crow Capital-related questions and documented processes; politely redirect out-of-scope topics.

SLIDE SELECTION
- Choose the single slide that best illustrates your answer.

RESPONSE FORMAT (JSON ONLY)
Return ONLY valid JSON:
{
  "answer": "Natural, concise response in ${languageName}. No citations in the answer.",
  "slideId": "most_relevant_slide_id",
  "grounded": true,
  "confidence": 0.0,
  "evidence": [
    "short verbatim snippet from the provided Knowledge Base"
  ]
}
Field rules:
- "grounded" is true only when supported by the provided Knowledge Base.
- "confidence" is a number between 0 and 1.
- "evidence" is a non-empty array of short verbatim snippets from the provided Knowledge Base.
- Do not output any text outside the JSON object.

Available Slides:
${slidesManifest}`;
}

function buildModeInstruction(mode: ResponseMode): string {
  if (mode === "FAST") {
    return "Response Mode: FAST. Keep the answer to 1-2 short spoken sentences and end with one natural follow-up question offering to expand.";
  }

  return "Response Mode: DEEP. Provide a fuller explanation in short spoken paragraphs; follow-up question is optional.";
}
export default async function (context: any, req: any) {
  const requestStartedAt = Date.now();
  const timingLog: Record<string, number> = {};

  context.log("[API] Azure OpenAI endpoint called");

  // Only allow POST requests
  if (req.method !== "POST") {
    context.res = {
      status: 405,
      body: { error: "Method not allowed" },
    };
    return;
  }

  // Validate core OpenAI environment variables
  if (!AZURE_OPENAI_ENDPOINT || !AZURE_OPENAI_API_KEY) {
    context.log.error("Missing Azure OpenAI credentials");
    context.res = {
      status: 500,
      body: { error: "Server configuration error" },
    };
    return;
  }

  try {
    const {
      question,
      context: bodyContext,
      slidesManifest,
      language = "en-US",
      conversationHistory = [],
    } = req.body || {};

    // Validate request body
    if (!question || !slidesManifest) {
      context.res = {
        status: 400,
        body: { error: "Missing required fields: question, slidesManifest" },
      };
      return;
    }

    const smalltalkIntent = detectSmalltalkIntent(question);
    if (smalltalkIntent) {
      const fallbackSlideId = resolveFallbackSlideId(slidesManifest, "");
      context.log("[Azure OpenAI] Smalltalk fast path hit", {
        intent: smalltalkIntent,
        fallbackSlideId,
      });
      context.res = {
        status: 200,
        body: {
          answer: buildSmalltalkFastPathAnswer(language, smalltalkIntent),
          slideId: fallbackSlideId,
        },
      };
      return;
    }

    const modeDecisionStartedAt = Date.now();
    const modeDecision = decideResponseMode(question);
    const mode = modeDecision.mode;
    timingLog.modeDecisionMs = Date.now() - modeDecisionStartedAt;

    context.log("[Azure OpenAI] Mode decision", {
      mode,
      reasons: modeDecision.reasons,
      elapsedMs: timingLog.modeDecisionMs,
    });

    const retrievalStartedAt = Date.now();
    const retrievalResult = await getKnowledgeContext({
      question,
      mode,
      providedContext: bodyContext,
    });
    timingLog.retrievalMs = Date.now() - retrievalStartedAt;

    context.log("[Azure OpenAI] Retrieval summary", {
      mode,
      source: retrievalResult.source,
      cacheHit: retrievalResult.cacheHit,
      faqIntent: retrievalResult.faqIntent,
      topK: retrievalResult.config.topK,
      maxCharsPerChunk: retrievalResult.config.maxCharsPerChunk,
      totalKBCharsBudget: retrievalResult.config.totalKBCharsBudget,
      snippetCount: retrievalResult.snippets.length,
      kbChars: retrievalResult.kbContext.length,
      slideCandidateCount: retrievalResult.slideCandidates.length,
      elapsedMs: timingLog.retrievalMs,
    });

    // Initialize Azure OpenAI client (server-side only)
    const client = new AzureOpenAI({
      endpoint: AZURE_OPENAI_ENDPOINT,
      apiKey: AZURE_OPENAI_API_KEY,
      apiVersion: AZURE_OPENAI_API_VERSION,
      deployment: AZURE_OPENAI_DEPLOYMENT,
    });

    const languageMap: Record<string, string> = {
      "en-US": "English",
      "en-UK": "English",
      "pt-BR": "Portuguese Brazilian",
    };

    const languageName = languageMap[language] || "English";
    const systemPrompt = buildSystemPrompt(languageName, slidesManifest);

    // Build conversation history for context (last 10 messages)
    const recentHistory = Array.isArray(conversationHistory)
      ? conversationHistory.slice(-10)
      : [];

    const questionClarity = analyzeQuestionForSpeechNoise(question);
    const speechNoiseGuidance = questionClarity.needsClarification
      ? `Speech-Recognition Signal: POSSIBLY NOISY OR AMBIGUOUS. Potential issues: ${questionClarity.reasons.join(
          ", "
        )}. If unclear, ask a quick clarification and provide 2-3 likely interpretations as options.`
      : "Speech-Recognition Signal: CLEAR_ENOUGH.";

    context.log("[Azure OpenAI] Question clarity signal", {
      needsClarification: questionClarity.needsClarification,
      reasons: questionClarity.reasons,
    });

    const userPrompt = `${buildModeInstruction(mode)}
${speechNoiseGuidance}

Current Question:
${question}

Knowledge Base Snippets:
${retrievalResult.kbContext}`;

    // Build messages array with conversation history
    const messages: any[] = [{ role: "system", content: systemPrompt }];

    // Add recent conversation history as alternating user/assistant messages
    recentHistory.forEach((msg: any) => {
      messages.push({
        role: msg.sender === "user" ? "user" : "assistant",
        content: msg.text,
      });
    });

    // Add current question
    messages.push({ role: "user", content: userPrompt });

    const openAiStartedAt = Date.now();
    const response = await client.chat.completions.create({
      model: AZURE_OPENAI_DEPLOYMENT,
      messages,
      temperature: 0.2, // Low temperature for deterministic voice responses
      response_format: { type: "json_object" },
      max_tokens: retrievalResult.config.maxOutputTokens,
    });
    timingLog.openAiMs = Date.now() - openAiStartedAt;

    context.log("[Azure OpenAI] OpenAI call", {
      mode,
      maxTokens: retrievalResult.config.maxOutputTokens,
      elapsedMs: timingLog.openAiMs,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from Azure OpenAI");
    }

    const parsedResponse = JSON.parse(content);
    const answer = typeof parsedResponse.answer === "string" ? parsedResponse.answer.trim() : "";
    const slideId = typeof parsedResponse.slideId === "string" ? parsedResponse.slideId.trim() : "";
    const grounded = parsedResponse.grounded === true;
    const confidence = resolveConfidence(parsedResponse.confidence);
    const evidence = normalizeEvidence(parsedResponse.evidence);
    const evidencePreview = evidence.map((snippet) => snippet.slice(0, 160)).slice(0, 3);

    // Validate core response structure
    if (!answer || !slideId) {
      throw new Error("Invalid response structure from AI");
    }

    const enforceGrounding = mode === "DEEP" || isClearlyFactualBlueCrowQuestion(question);

    context.log("[Azure OpenAI] Grounding metadata", {
      mode,
      enforceGrounding,
      grounded,
      confidence: Number.isFinite(confidence) ? confidence : null,
      evidenceCount: evidence.length,
      evidencePreview,
    });

    const fallbackReasons: string[] = [];

    if (enforceGrounding) {
      if (!grounded) {
        fallbackReasons.push("not_grounded");
      }
      if (evidence.length === 0) {
        fallbackReasons.push("missing_evidence");
      }
      if (
        !Number.isFinite(confidence) ||
        confidence < 0 ||
        confidence > 1 ||
        confidence < GROUNDING_CONFIDENCE_THRESHOLD
      ) {
        fallbackReasons.push("low_confidence");
      }
    }

    if (fallbackReasons.length > 0) {
      const fallbackSlideId = resolveFallbackSlideId(
        slidesManifest,
        slideId,
        retrievalResult.slideCandidates
      );

      context.log.warn("[Azure OpenAI] Returning fallback response", {
        mode,
        reasons: fallbackReasons,
        confidence: Number.isFinite(confidence) ? confidence : null,
        threshold: GROUNDING_CONFIDENCE_THRESHOLD,
        evidenceCount: evidence.length,
        fallbackSlideId,
      });

      context.res = {
        status: 200,
        body: {
          answer: buildSafeFallbackAnswer(language),
          slideId: fallbackSlideId,
        },
      };
      return;
    }

    const resolvedSlideId = resolveFallbackSlideId(slidesManifest, slideId, retrievalResult.slideCandidates);

    context.res = {
      status: 200,
      body: {
        answer,
        slideId: resolvedSlideId,
      },
    };
  } catch (error: any) {
    context.log.error("Azure OpenAI API call failed:", error);
    context.res = {
      status: 500,
      body: {
        error: "Failed to get a valid response from the AI model",
        details: error?.message || "Unknown error",
      },
    };
  } finally {
    timingLog.totalRequestMs = Date.now() - requestStartedAt;
    context.log("[Azure OpenAI] Request timings", timingLog);
  }
}
