const { Anthropic } = require('@anthropic-ai/sdk');
const {
  TEACH_SYSTEM,
  THREAD_SYSTEM,
  COURSE_START_SCHEMA,
  NEXT_LESSON_SCHEMA,
  courseContext,
} = require('./teach-prompts.cjs');

const DEFAULT_MODEL = 'claude-opus-4-8';

// method 'cli'  → Claude Agent SDK, driving the local Claude Code sign-in
//                 (subscription auth, no API key).
// method 'api'  → Anthropic SDK with an API key / env credentials.
let cfg = { method: 'cli', apiKey: '', model: DEFAULT_MODEL };
let client = null;
let sdkPromise = null;

function configure(next) {
  cfg = { ...cfg, ...next };
  if (!cfg.model) cfg.model = DEFAULT_MODEL;
  client = null;
  return cfg;
}

function getApiClient() {
  // With no key the SDK falls back to ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN /
  // an `ant auth login` profile.
  if (!client) client = new Anthropic(cfg.apiKey ? { apiKey: cfg.apiKey } : {});
  return client;
}

// The agent SDK is ESM-only; load it lazily from this CJS module.
function loadAgentSdk() {
  if (!sdkPromise) sdkPromise = import('@anthropic-ai/claude-agent-sdk');
  return sdkPromise;
}

function errMessage(e) {
  const msg = (e && e.message) || '';
  if (e instanceof Anthropic.AuthenticationError || /resolve authentication method/i.test(msg)) {
    return 'No working credentials. Add an API key in Settings, or set ANTHROPIC_API_KEY / run `ant auth login`, then restart Teach.';
  }
  if (/invalid api key|not logged in|please run \/login|oauth|credentials/i.test(msg)) {
    return 'Claude Code isn’t signed in. Run `claude` in a terminal, sign in with /login, then try again.';
  }
  if (/ENOENT|spawn.*failed/i.test(msg)) {
    return 'Couldn’t start Claude Code. Make sure Claude Code is installed (npm install -g @anthropic-ai/claude-code).';
  }
  if (e instanceof Anthropic.RateLimitError) return 'Rate limited by the Anthropic API — try again in a moment.';
  if (e instanceof Anthropic.APIConnectionError) return 'Could not reach the Anthropic API — check your connection.';
  if (e instanceof Anthropic.APIError) return `Anthropic API error (${e.status}): ${e.message}`;
  return msg || 'Unknown error';
}

// ---------- Claude Code (Agent SDK) backend ----------

async function cliRun({ system, userText, schema }) {
  const { query } = await loadAgentSdk();
  const q = query({
    prompt: userText,
    options: {
      model: cfg.model,
      systemPrompt: system,
      tools: [],          // pure generation — no file/bash access
      maxTurns: 1,
      persistSession: false,
      ...(schema ? { outputFormat: { type: 'json_schema', schema } } : {}),
    },
  });
  let text = '';
  let structured;
  let sawResult = false;
  for await (const m of q) {
    if (m.type === 'assistant' && m.message && Array.isArray(m.message.content)) {
      for (const b of m.message.content) if (b.type === 'text' && b.text) text += b.text;
    } else if (m.type === 'result') {
      sawResult = true;
      if (m.subtype === 'success') {
        if (m.structured_output !== undefined && m.structured_output !== null) structured = m.structured_output;
        else if (m.result) text = m.result;
      } else {
        const detail = (m.errors && m.errors.length) ? m.errors.join('; ') : m.subtype.replace(/^error_/, '').replace(/_/g, ' ');
        throw new Error('Claude Code run failed: ' + detail);
      }
    }
  }
  if (!sawResult) throw new Error('Claude Code produced no result.');
  if (schema) {
    if (structured !== undefined) return structured;
    return JSON.parse(text);
  }
  return text.trim();
}

// ---------- Anthropic API backend ----------

async function apiGenerateJson({ system, userText, schema, maxTokens }) {
  const c = getApiClient();
  const stream = c.messages.stream({
    model: cfg.model,
    max_tokens: maxTokens || 16000,
    thinking: { type: 'adaptive' },
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    output_config: { format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content: userText }],
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === 'refusal') {
    throw new Error('The model declined to write this lesson. Try rephrasing the request.');
  }
  if (message.stop_reason === 'max_tokens') {
    throw new Error('The lesson ran over the output limit — try a narrower topic.');
  }
  const text = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return JSON.parse(text);
}

// ---------- shared entry points ----------

async function generateJson(args) {
  if (cfg.method === 'cli') return cliRun(args);
  return apiGenerateJson(args);
}

async function verifyConnection() {
  if (cfg.method === 'cli') {
    const reply = await cliRun({
      system: 'You are a connectivity check. Reply with exactly: ok',
      userText: 'ping',
    });
    if (!reply) throw new Error('Claude Code replied with nothing.');
    return { model: cfg.model, displayName: 'Claude Code' };
  }
  const m = await getApiClient().models.retrieve(cfg.model);
  return { model: m.id, displayName: m.display_name };
}

async function startCourse({ prompt }) {
  const userText = [
    'The user has just started a new course with this request:',
    '',
    `"${prompt}"`,
    '',
    'Establish the course: infer the mission, name the course, write a short conversational intro, and write the FIRST lesson (type "lesson") — the ideal entry point for this mission, assuming no prior knowledge unless the request implies some.',
  ].join('\n');
  return generateJson({ system: TEACH_SYSTEM, userText, schema: COURSE_START_SCHEMA });
}

async function nextLesson({ course, completedIds, request, regenerateOf }) {
  const parts = [courseContext(course, completedIds), ''];
  if (regenerateOf) {
    parts.push(
      `The user asked you to REGENERATE lesson "${regenerateOf.title}" (type ${regenerateOf.type}). Write a fresh take on the same topic — same scope, new wording and examples. Keep the same type.`,
    );
  } else {
    parts.push(`The user's next request: "${request}"`, '', 'Write the next lesson for this request, in the zone of proximal development given the learning records above. If the request names a quiz, make it type "quiz" with retrieval-practice questions over the completed lessons; if it names a project or hands-on build, make it type "project".');
  }
  return generateJson({ system: TEACH_SYSTEM, userText: parts.join('\n'), schema: NEXT_LESSON_SCHEMA });
}

function threadContext({ course, lesson, quote }) {
  return [
    `Course: ${course.title}`,
    `Mission: ${course.mission || '(unknown)'}`,
    `Lesson: ${lesson.title} — ${lesson.subtitle}`,
    '',
    'Full lesson body:',
    lesson.bodyMarkdown || '(unavailable)',
    quote ? `\nThe user selected this passage and is asking about it:\n"${quote}"` : '',
  ].join('\n');
}

async function askThread({ course, lesson, quote, history, question }) {
  const contextText = threadContext({ course, lesson, quote });

  if (cfg.method === 'cli') {
    const parts = [contextText, '', 'Conversation so far:'];
    for (const m of history || []) parts.push((m.role === 'user' ? 'Learner: ' : 'Tutor: ') + m.text);
    parts.push('Learner: ' + question, '', 'Reply as the tutor (reply with the answer only, no "Tutor:" prefix).');
    return cliRun({ system: THREAD_SYSTEM, userText: parts.join('\n') });
  }

  const messages = [
    { role: 'user', content: contextText + '\n\nFirst question follows in the next messages.' },
    { role: 'assistant', content: 'Understood — I have the lesson in front of me. What would you like to know?' },
  ];
  for (const m of history || []) {
    messages.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text });
  }
  messages.push({ role: 'user', content: question });

  const stream = getApiClient().messages.stream({
    model: cfg.model,
    max_tokens: 2048,
    thinking: { type: 'adaptive' },
    system: [{ type: 'text', text: THREAD_SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages,
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === 'refusal') {
    throw new Error('The model declined to answer this question.');
  }
  return message.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
}

module.exports = { configure, verifyConnection, startCourse, nextLesson, askThread, errMessage, DEFAULT_MODEL };
