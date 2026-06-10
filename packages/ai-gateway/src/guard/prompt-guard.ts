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
];

const INJECTION_THRESHOLD = 0.6;

export function detectPromptInjection(text: string): PromptGuardResult {
  if (!text) {
    return { safe: true, score: 0 };
  }

  if (text.length > 50_000) {
    return { safe: false, score: 1, reason: 'Input exceeds safety limit' };
  }

  let maxScore = 0;
  let matchedReason: string | undefined;

  for (const { pattern, weight, reason } of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      if (weight > maxScore) {
        maxScore = weight;
        matchedReason = reason;
      }
    }
  }

  const safe = maxScore < INJECTION_THRESHOLD;

  if (!safe && matchedReason) {
    return { safe, score: maxScore, reason: matchedReason };
  }

  return { safe, score: maxScore };
}
