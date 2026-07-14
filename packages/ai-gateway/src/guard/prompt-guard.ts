interface PromptGuardResult {
  readonly safe: boolean;
  readonly score: number;
  readonly reason?: string;
}

const INJECTION_PATTERNS: {
  pattern: RegExp;
  weight: number;
  reason: string;
}[] = [
  // Role override
  {
    pattern:
      /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|rules|prompts)/i,
    weight: 0.9,
    reason: 'Instruction override attempt',
  },
  {
    pattern: /disregard\s+(all\s+)?(previous|prior|above)/i,
    weight: 0.9,
    reason: 'Instruction override attempt',
  },
  {
    pattern:
      /forget\s+(?:everything|all)\s+(?:your\s+)?(?:previous\s+)?(?:instructions|rules|guidelines)/i,
    weight: 0.8,
    reason: 'Instruction override attempt',
  },

  // Role hijacking
  {
    pattern:
      /you\s+are\s+now\s+(?:a |an |my |the )?(?:[\w,.]+\s+){0,4}(?:ai|assistant|bot|model|agent|persona|character)/i,
    weight: 0.8,
    reason: 'Role hijacking attempt',
  },
  {
    pattern:
      /act\s+as\s+(if\s+you\s+are\s+|a\s+)?(?:an?\s+)?(?:unrestricted|unfiltered|jailbr)/i,
    weight: 0.9,
    reason: 'Role hijacking attempt',
  },
  {
    pattern: /\bDAN\b.*mode/i,
    weight: 0.9,
    reason: 'Known jailbreak pattern',
  },

  // System prompt extraction
  {
    pattern:
      /(?:output|reveal|show|print|display|repeat)\s+(?:your\s+)?(?:system\s+)?(?:prompt|instructions|rules)/i,
    weight: 0.85,
    reason: 'System prompt extraction attempt',
  },
  {
    pattern:
      /what\s+(?:are|is)\s+your\s+(?:system\s+)?(?:prompt|instructions|rules)/i,
    weight: 0.7,
    reason: 'System prompt extraction attempt',
  },

  // Delimiter injection
  {
    pattern: /<\/?(system|user|assistant|prompt|context)>/i,
    weight: 0.75,
    reason: 'Delimiter injection',
  },
  {
    pattern: /```system/i,
    weight: 0.7,
    reason: 'Delimiter injection',
  },

  // Encoding-based evasion
  {
    pattern:
      /(?:decode|execute|run)\s*(?:this|the\s+following)?:?\s*[A-Za-z0-9+/=]{20,}/i,
    weight: 0.8,
    reason: 'Encoded payload detected',
  },

  // Indirect injection markers
  {
    pattern: /\[INST\]|\[\/INST\]|<<SYS>>|<\|im_start\|>/i,
    weight: 0.85,
    reason: 'Model-specific delimiter injection',
  },

  // Spanish — role override
  {
    pattern:
      /ignora(?:r)?\s+(?:(?:todas|todo)\s+)?(?:las\s+|los\s+)?(?:instrucciones|reglas|indicaciones|[óo]rdenes)\s+(?:anteriores|previas|de\s+arriba)/i,
    weight: 0.9,
    reason: 'Instruction override attempt (es)',
  },
  {
    pattern:
      /olv[íi]da(?:r|te\s+de)?\s+(?:(?:todas|todo)\s+)?(?:tus\s+|las\s+)?(?:instrucciones|reglas|indicaciones)/i,
    weight: 0.8,
    reason: 'Instruction override attempt (es)',
  },
  {
    pattern:
      /haz\s+caso\s+omiso\s+(?:de\s+|a\s+)?(?:las\s+)?(?:instrucciones|reglas)/i,
    weight: 0.85,
    reason: 'Instruction override attempt (es)',
  },
  // Spanish — role hijacking
  {
    pattern:
      /act[úu]a\s+como\s+(?:un[ao]?\s+)?(?:ia\s+|asistente\s+|modelo\s+)?(?:sin\s+(?:restricciones|filtros|l[íi]mites)|no\s+restringid)/i,
    weight: 0.9,
    reason: 'Role hijacking attempt (es)',
  },
  // Spanish — system prompt extraction
  {
    pattern:
      /(?:mu[ée]stra(?:me)?|revela|imprime|repite|dime)\s+(?:(?:tus?\s+(?:prompt|instrucciones|reglas))|(?:(?:el|la|las?)\s+(?:prompt|instrucciones|reglas)\s+(?:de|del)\s+sistema))/i,
    weight: 0.85,
    reason: 'System prompt extraction attempt (es)',
  },

  // Weak signals — a lone match stays under the threshold; they only
  // contribute via cumulative scoring. No '/' in the base64 class: with it
  // the run matches long URLs, repo paths, and JWT-ish blobs (benign FPs).
  {
    // Lookarounds (not \b) bound the run: '+'/'=' are non-word chars, so \b
    // would drop an edge char and let a 60-char payload fall under threshold.
    pattern: /(?<![A-Za-z0-9+/=])[A-Za-z0-9+]{60,}={0,2}(?![A-Za-z0-9+/=])/,
    weight: 0.3,
    reason: 'Long base64-like payload',
  },
  {
    pattern: /\bnew\s+(?:system\s+)?instructions?\s*:/i,
    weight: 0.4,
    reason: 'Instruction re-anchoring',
  },
  {
    pattern: /\bi[\s_.-]+g[\s_.-]+n[\s_.-]+o[\s_.-]+r[\s_.-]+e\b/i,
    weight: 0.4,
    reason: 'Obfuscated override keyword',
  },
  {
    pattern:
      /ignore[-_]+(?:all[-_]+)?(?:previous|prior)[-_]+(?:instructions|rules)/i,
    weight: 0.85,
    reason: 'Instruction override attempt (punctuated)',
  },
  {
    pattern:
      /\b(?:override|bypass|supersede)\s+(?:your|the|all)\s+(?:instructions|rules|guidelines|system\s+prompt)/i,
    weight: 0.7,
    reason: 'Instruction override attempt (synonym)',
  },
];

const INJECTION_THRESHOLD = 0.6;

const STRIP_CODEPOINTS: readonly number[] = [
  0x200b,
  0x200c,
  0x200d,
  0x2060,
  0xfeff, // zero-width
  0x202a,
  0x202b,
  0x202c,
  0x202d,
  0x202e, // bidi embedding/override
  0x2066,
  0x2067,
  0x2068,
  0x2069, // bidi isolates
  0x200e,
  0x200f,
  0x061c, // bidi marks (LRM, RLM, ALM)
];
const STRIP_CHARS: ReadonlySet<string> = new Set(
  STRIP_CODEPOINTS.map((cp) => String.fromCharCode(cp))
);

function normalizeForGuard(text: string): string {
  let out = '';
  for (const ch of text.normalize('NFKC')) {
    if (!STRIP_CHARS.has(ch)) {
      out += ch;
    }
  }
  return out;
}

export function detectPromptInjection(text: string): PromptGuardResult {
  if (!text) {
    return { safe: true, score: 0 };
  }

  if (text.length > 50_000) {
    return { safe: false, score: 1, reason: 'Input exceeds safety limit' };
  }

  const normalized = normalizeForGuard(text);

  let score = 0;
  let topWeight = 0;
  let matchedReason: string | undefined;

  for (const { pattern, weight, reason } of INJECTION_PATTERNS) {
    if (pattern.test(normalized)) {
      score += weight;
      if (weight > topWeight) {
        topWeight = weight;
        matchedReason = reason;
      }
    }
  }
  score = Math.min(score, 1);

  const safe = score < INJECTION_THRESHOLD;

  if (!safe && matchedReason) {
    return { safe, score, reason: matchedReason };
  }

  return { safe, score };
}
