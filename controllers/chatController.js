require('dotenv').config();
const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── In-memory session store (keyed by sessionId) ─────────────────────────────
// In production, replace with Redis or a DB-backed session store.
const sessions = {};
const SESSION_MAX_MESSAGES = 40;

// ── System prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are Skinkadoc, a warm, professional AI doctor specialising in skin and hair care.
Your goal is to conduct a friendly consultation and collect the user's profile information step by step.

MANDATORY CONSULTATION FLOW — follow this EXACT order, ONE question per turn:
STEP 1: Ask: "Welcome to Skinkadoc AI Consultation. Are you facing a Skin problem or Hair problem?" → store problem_type as "Skin" or "Hair".
STEP 2: Ask: "Please describe your problem in detail." → store problem_details. Only a real skin/hair problem description is valid.
STEP 3: Ask: "May I know your name?" → store name. IMPORTANT: Accept WHATEVER the user says as their name — do NOT question, judge, or re-ask. Any word or phrase the user gives in response to the name question IS their name. Store it immediately.
STEP 4a: Ask: "Which country are you from?" → store country.
STEP 4b: Ask: "Which state are you in?" → store state.
STEP 4c: Ask: "Which city are you in?" → store city.
STEP 5: Ask: "Please select your gender (Male / Female / Other)." → store gender.
STEP 6: FINAL STEP — once all 6 fields (problem_type, problem_details, name, country, state, city, gender) are collected: say "Thank you, [name]! Your profile looks great. Let's verify your details now." and set next_step to "otp_verification". STOP — ask nothing more.

##CRITICAL — NEVER MENTION MOBILE OR PHONE NUMBER##
The words "mobile", "phone number", and "contact number" are FORBIDDEN. Never ask for them. Mobile is collected automatically by the app after this conversation.

##IRRELEVANCE RULE##
Before advancing, check that the user's reply actually answers the current question. If it doesn't, re-ask the same question politely. NEVER store or advance on an irrelevant answer.
- STEP 2 (problem_details): must be a real skin/hair problem. If not — re-ask.
- STEP 3 (name): ALWAYS accept the user's reply as their name. NEVER re-ask the name question.
- STEP 4a-4c (country/state/city): must be a real place name. If not — re-ask.
- STEP 5 (gender): must be male/female/other. If not — re-ask.

OTHER RULES:
- Ask ONLY ONE question per turn.
- Keep every message SHORT (≤ 2 sentences).
- Be warm and encouraging.
- Never repeat a question whose answer is already in collected_data.

REQUIRED RESPONSE FORMAT — always respond with a single valid JSON object and NOTHING else:
{
  "message": "<your short, voice-friendly reply>",
  "next_step": "continue | otp_verification | complete",
  "collected_data": {
    "name": null,
    "gender": null,
    "problem_type": null,
    "problem_details": null,
    "country": null,
    "state": null,
    "city": null,
    "mobile": null
  }
}

In collected_data, include ONLY confirmed fields. Use null for anything not yet collected. Never fabricate data.`;

// ── Helper: safely extract JSON from AI response ──────────────────────────────
function extractJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    // Strip markdown code fences if present
    const stripped = text.replace(/```json|```/gi, '').trim();
    try {
      return JSON.parse(stripped);
    } catch {
      // Grab first {...} block
      const match = stripped.match(/\{[\s\S]*\}/);
      if (match) {
        try { return JSON.parse(match[0]); } catch { /* fall through */ }
      }
    }
  }
  return null;
}

// ── Per-field validity hints injected dynamically ─────────────────────────────
function getCurrentFieldHint(cd) {
  if (!cd) return '';
  if (!cd.problem_type)    return '[CURRENT FIELD: problem_type. Valid = "Skin" or "Hair" or any related word.]';
  if (!cd.problem_details) return '[CURRENT FIELD: problem_details. Valid = a real skin or hair problem description. If unrelated — re-ask.]';
  if (!cd.name)            return '[CURRENT FIELD: name. IMPORTANT: Whatever the user says next IS their name — store it unconditionally. Do NOT question or re-ask under any circumstances.]';
  if (!cd.country)         return '[CURRENT FIELD: country. Valid = any real country name.]';
  if (!cd.state)           return '[CURRENT FIELD: state. Valid = any real state/province name.]';
  if (!cd.city)            return '[CURRENT FIELD: city. Valid = any real city name.]';
  if (!cd.gender)          return '[CURRENT FIELD: gender. Valid = male, female, other. Anything else is INVALID — re-ask.]';
  // Mobile is collected via the typed OTP modal — never prompt for it in conversation.
  return '';
}

// ── Server-side field validators ───────────────────────────────────────────────
const SKIN_HAIR_KEYWORDS = [
  'hair','scalp','dandruff','hairfall','hair fall','hair loss','thinning','split','frizzy','oily hair',
  'dry hair','breakage','baldness','grey','gray','itchy scalp','flaky',
  'skin','acne','pimple','spot','dark spot','pigmentation','oily skin','dry skin','rash','eczema',
  'psoriasis','wrinkle','blackhead','whitehead','redness','itchy skin','dull','sunburn','scar',
  'blemish','uneven','complexion','tan','fairness','moistur','glow','pore','sebum','irritat',
  'sensitive skin','aging','anti-aging','fine line'
];

function isValidProblemDetails(val) {
  if (!val || typeof val !== 'string') return false;
  const lower = val.toLowerCase();
  return SKIN_HAIR_KEYWORDS.some(k => lower.includes(k));
}

function isValidName(val) {
  if (!val || typeof val !== 'string') return false;
  const trimmed = val.trim();
  // Accept any non-empty string that isn't purely digits or very long garbage
  return trimmed.length >= 1 && trimmed.length <= 100 && !/^\d+$/.test(trimmed);
}

function isValidAge(val) {
  if (val === null || val === undefined) return false;
  const n = parseInt(String(val), 10);
  return !isNaN(n) && n >= 5 && n <= 120;
}

function isValidGender(val) {
  if (!val || typeof val !== 'string') return false;
  return /\b(male|female|man|woman|boy|girl|other|non.?binary|transgender|prefer not)\b/i.test(val);
}

function isValidMobile(val) {
  if (!val) return false;
  const digits = String(val).replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

// Sanitise AI-returned collected_data against the fields already confirmed by client
function sanitiseCollectedData(aiData, clientData) {
  if (!aiData) return clientData || {};
  const result = { ...(clientData || {}) };

  const fields = ['problem_type','problem_details','name','country','state','city','gender','mobile'];
  fields.forEach(f => {
    const val = aiData[f];
    if (val === null || val === undefined || val === '') return;

    if (f === 'problem_details' && !isValidProblemDetails(val)) return;
    if (f === 'name'            && !isValidName(val))            return;
    if (f === 'gender'          && !isValidGender(val))          return;
    if (f === 'mobile'          && !isValidMobile(val))          return;

    result[f] = val;
  });
  return result;
}

// ── Fallback prompt for the next missing field (used when AI goes off-script) ─
function nextFieldPrompt(cd) {
  if (!cd.problem_type)    return 'Are you facing a Skin problem or Hair problem?';
  if (!cd.problem_details) return 'Could you describe your specific concern? For example: acne, hair fall, dandruff.';
  if (!cd.name)            return 'May I know your name?';
  if (!cd.country)         return 'Which country are you from?';
  if (!cd.state)           return 'Which state are you in?';
  if (!cd.city)            return 'Which city are you in?';
  if (!cd.gender)          return 'What is your gender? (Male / Female / Other)';
  return 'Thank you! Everything looks great.';
}

// ── Controller ────────────────────────────────────────────────────────────────
const sendMessage = async (req, res) => {
  const { message, sessionId, collectedData } = req.body;

  if (!message || typeof message !== 'string' || !sessionId) {
    return res.status(400).json({ error: 'message (string) and sessionId are required.' });
  }

  // Sanitise input
  const safeMessage = message.trim().slice(0, 1000);

  // Initialise session
  if (!sessions[sessionId]) sessions[sessionId] = [];

  // Build system message with already-collected context + current field hint
  let contextNote = '';
  if (collectedData && Object.values(collectedData).some(v => v !== null)) {
    contextNote = `\n\n[ALREADY COLLECTED — do NOT ask for these again: ${JSON.stringify(collectedData)}]`;
  }
  const fieldHint = getCurrentFieldHint(collectedData || {});
  if (fieldHint) contextNote += `\n\n${fieldHint}`;

  // Push user turn
  sessions[sessionId].push({ role: 'user', content: safeMessage });

  try {
    const completion = await openai.chat.completions.create({
      model:       'gpt-3.5-turbo',
      temperature: 0.3,
      max_tokens:  400,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT + contextNote },
        ...sessions[sessionId]
      ]
    });

    const rawContent = completion.choices[0].message.content || '';

    // Push assistant turn
    sessions[sessionId].push({ role: 'assistant', content: rawContent });

    // Trim old turns to avoid token bloat
    if (sessions[sessionId].length > SESSION_MAX_MESSAGES) {
      sessions[sessionId] = sessions[sessionId].slice(-SESSION_MAX_MESSAGES);
    }

    const parsed = extractJSON(rawContent);

    if (parsed && parsed.message) {
      // Server-side guard: sanitise collected_data before sending to client
      let safeData = sanitiseCollectedData(parsed.collected_data, collectedData);

      // Hard override: if name was the current field and GPT still returned name:null,
      // force-store the user's raw message as the name (GPT-3.5 often rejects valid names).
      if (!safeData.name && safeData.problem_details && safeMessage) {
        safeData = { ...safeData, name: safeMessage.trim().slice(0, 100) };
      }

      // When all required fields (except mobile) are confirmed, ask frontend to
      // show the confirmation/edit panel before proceeding to mobile entry.
      // Mobile is ALWAYS collected via the typed OTP modal, never via voice.
      const allRequiredExceptMobile =
        safeData.problem_type && safeData.problem_details &&
        safeData.name         && safeData.country         &&
        safeData.state        && safeData.city            &&
        safeData.gender;
      const overrideStep =
        allRequiredExceptMobile && !safeData.mobile && (parsed.next_step || 'continue') !== 'complete'
          ? 'confirm_details'
          : (parsed.next_step || 'continue');

      // Hard guard: if the AI message contains ANY mention of mobile/phone number
      // (it should never ask for it — the OTP modal handles that entirely).
      // Simple broad pattern: catches any question that mentions mobile or phone number.
      const containsMobileAsk = /\bmobile\b|\bphone\s*number\b|\bcontact\s*number\b/i.test(parsed.message);
      let safeAiMessage = parsed.message;
      if (containsMobileAsk) {
        if (allRequiredExceptMobile) {
          safeAiMessage = `Thank you, ${safeData.name || 'there'}! Your profile is all set. We'll connect you with our expert right away. 😊`;
          return res.json({ message: safeAiMessage, next_step: 'confirm_details', collected_data: safeData });
        } else {
          // Mid-conversation — redirect to next missing field instead
          safeAiMessage = `Thank you for sharing that! ${nextFieldPrompt(safeData)}`;
        }
      }

      return res.json({ ...parsed, message: safeAiMessage, next_step: overrideStep, collected_data: safeData });
    }

    // Fallback: return raw text wrapped in expected shape
    return res.json({
      message:        rawContent || "I'm here to help. Could you tell me more?",
      next_step:      'continue',
      collected_data: collectedData || {}
    });

  } catch (err) {
    console.error('OpenAI error:', err);

    if (err.status === 401) {
      return res.status(401).json({ error: 'Invalid OpenAI API key. Please check your .env file.' });
    }
    if (err.status === 429) {
      return res.status(429).json({ error: 'Rate limit reached. Please wait a moment and try again.' });
    }

    return res.status(500).json({
      message:        "I'm sorry, I had a little trouble there. Could you please repeat that?",
      next_step:      'continue',
      collected_data: collectedData || {}
    });
  }
};

module.exports = { sendMessage };
