const { Anthropic } = require('@anthropic-ai/sdk');
const path = require('path');
const fs = require('fs');
const {
  TEACH_SYSTEM,
  THREAD_SYSTEM,
  COURSE_START_SCHEMA,
  NEXT_LESSON_SCHEMA,
  courseContext,
} = require('./teach-prompts.cjs');

const DEFAULT_MODEL = 'claude-opus-4-8';

// The Claude Code CLI ships as a per-arch native binary. In a packaged app it's
// extracted out of the asar (see asarUnpack in package.json), but the SDK
// resolves its path *inside* app.asar — and spawning an executable through the
// asar file fails with "spawn ENOTDIR". Resolve the real unpacked binary and
// hand it to the SDK via options.pathToClaudeCodeExecutable.
let _claudeExe;
function claudeExecutable() {
  if (_claudeExe !== undefined) return _claudeExe;
  _claudeExe = null;
  try {
    const pkg = `claude-agent-sdk-${process.platform}-${process.arch}`;
    const bin = process.platform === 'win32' ? 'claude.exe' : 'claude';
    const sdkDir = path.dirname(require.resolve('@anthropic-ai/claude-agent-sdk/package.json'));
    const candidates = [
      path.join(sdkDir, 'node_modules', '@anthropic-ai', pkg, bin), // packaged (nested)
      path.join(sdkDir, '..', pkg, bin),                            // hoisted (dev)
    ];
    for (let c of candidates) {
      if (c.includes(`app.asar${path.sep}`)) c = c.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
      if (fs.existsSync(c)) { _claudeExe = c; break; }
    }
  } catch (e) { /* leave null — SDK falls back to its own resolution */ }
  return _claudeExe;
}

// ---------- debug log bus ----------
// Every notable step an agent takes is emitted here; main.cjs relays it to the
// renderer's debug console. Levels: 'info' | 'debug' (verbose stream/detail) |
// 'error'. Tags group by backend/op (cli, api, course, lesson, thread, connect).
const { EventEmitter } = require('events');
const logBus = new EventEmitter();
logBus.setMaxListeners(0);
let _logSeq = 0;
function log(tag, msg, level = 'info') {
  const entry = { id: ++_logSeq, time: Date.now(), level, tag, msg: String(msg == null ? '' : msg) };
  try { logBus.emit('log', entry); } catch (e) {}
  return entry;
}
function onLog(cb) { logBus.on('log', cb); return () => logBus.off('log', cb); }
function preview(s, n = 400) {
  s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n) + '…' : s;
}

// method 'cli'   → Claude Agent SDK, driving the local Claude Code sign-in
//                  (subscription auth, no API key).
// method 'api'   → Anthropic SDK with an API key / env credentials.
// method 'local' → any OpenAI-compatible server (Ollama, LM Studio, llama.cpp,
//                  Jan, …) at baseUrl; models are discovered from the server.
const DEFAULT_LOCAL_URL = 'http://localhost:11434/v1';
let cfg = { method: 'cli', apiKey: '', model: DEFAULT_MODEL, baseUrl: DEFAULT_LOCAL_URL };
let client = null;
let sdkPromise = null;

// The Anthropic models Claude Code / the API expose. Used as-is for those
// backends (and as a fallback if the live models list can't be fetched).
const STATIC_MODELS = [
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
];

function configure(next) {
  cfg = { ...cfg, ...next };
  if (!cfg.model) cfg.model = DEFAULT_MODEL;
  if (!cfg.baseUrl) cfg.baseUrl = DEFAULT_LOCAL_URL;
  client = null;
  return cfg;
}

function getApiClient() {
  // With no key the SDK falls back to ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN /
  // an `ant auth login` profile.
  if (!client) client = new Anthropic(cfg.apiKey ? { apiKey: cfg.apiKey } : {});
  return client;
}

// ---------- local (OpenAI-compatible) backend ----------

function localBase() { return String(cfg.baseUrl || DEFAULT_LOCAL_URL).replace(/\/+$/, ''); }
// No Authorization header: local runtimes (Ollama, LM Studio, …) don't need one,
// and the shared apiKey may be an Anthropic key we must not send to a user URL.
function localHeaders() { return { 'Content-Type': 'application/json' }; }

// List the models a local server actually has (GET /v1/models).
async function listLocalModels() {
  const res = await fetch(localBase() + '/models', { headers: localHeaders() });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' from ' + localBase() + '/models');
  const data = await res.json();
  const arr = (data && data.data) || [];
  return arr.map((m) => ({ id: m.id, label: m.id })).filter((m) => m.id);
}

// Models available for the current backend, as [{ id, label }].
async function listModels() {
  if (cfg.method === 'local') return listLocalModels();
  if (cfg.method === 'api') {
    try {
      const page = await getApiClient().models.list();
      const out = [];
      for (const m of (page.data || [])) out.push({ id: m.id, label: m.display_name || m.id });
      if (out.length) return out;
    } catch (e) { /* fall back to static */ }
    return STATIC_MODELS;
  }
  return STATIC_MODELS; // cli
}

async function localChat({ messages, jsonMode }) {
  log('local', 'chat · model=' + cfg.model + ' · ' + localBase());
  const t0 = Date.now();
  const body = { model: cfg.model, messages, stream: false };
  if (jsonMode) body.response_format = { type: 'json_object' };
  const res = await fetch(localBase() + '/chat/completions', {
    method: 'POST', headers: localHeaders(), body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = preview(await res.text().catch(() => ''), 200);
    log('local', 'failed · HTTP ' + res.status + (detail ? ' · ' + detail : ''), 'error');
    throw new Error('Local model error (HTTP ' + res.status + ')' + (detail ? ': ' + detail : ''));
  }
  const data = await res.json();
  const content = (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
  log('local', 'done · ' + content.length + ' chars · ' + (Date.now() - t0) + 'ms');
  return content;
}

// Local models don't reliably honor a JSON schema, so we ask for a JSON object
// and tolerate code fences / surrounding prose when parsing.
function parseJsonLoose(text) {
  let s = String(text == null ? '' : text).trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try { return JSON.parse(s); } catch (e) {}
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) return JSON.parse(s.slice(a, b + 1));
  throw new Error('The local model didn’t return valid JSON — try a more capable model.');
}

// The agent SDK is ESM-only; load it lazily from this CJS module.
function loadAgentSdk() {
  if (!sdkPromise) sdkPromise = import('@anthropic-ai/claude-agent-sdk');
  return sdkPromise;
}

function errMessage(e) {
  const msg = (e && e.message) || '';
  if (e instanceof Anthropic.AuthenticationError || /resolve authentication method/i.test(msg)) {
    return 'No working credentials. Add an API key in Settings, or set ANTHROPIC_API_KEY / run `ant auth login`, then restart Tutorly.';
  }
  if (/invalid api key|not logged in|please run \/login|oauth|credentials/i.test(msg)) {
    return 'Claude Code isn’t signed in. Run `claude` in a terminal, sign in with /login, then try again.';
  }
  if (/ENOENT|spawn.*failed/i.test(msg)) {
    return 'Couldn’t start Claude Code. Make sure Claude Code is installed (npm install -g @anthropic-ai/claude-code).';
  }
  if (/maximum number of turns/i.test(msg)) {
    return 'The lesson ran long and didn’t finish in one go — try a narrower topic, or regenerate.';
  }
  if (/ECONNREFUSED|fetch failed|ENOTFOUND|network|ECONNRESET/i.test(msg)) {
    return 'Couldn’t reach the local model server. Make sure it’s running (e.g. `ollama serve`) and the server URL is correct.';
  }
  if (e instanceof Anthropic.RateLimitError) return 'Rate limited by the Anthropic API — try again in a moment.';
  if (e instanceof Anthropic.APIConnectionError) return 'Could not reach the Anthropic API — check your connection.';
  if (e instanceof Anthropic.APIError) return `Anthropic API error (${e.status}): ${e.message}`;
  return msg || 'Unknown error';
}

// ---------- Claude Code (Agent SDK) backend ----------

async function cliRun({ system, userText, schema }) {
  const { query } = await loadAgentSdk();
  const exe = claudeExecutable();
  log('cli', 'query · model=' + cfg.model + ' · ' + (schema ? 'json_schema' : 'text') + (exe ? ' · exe=' + exe : ''));
  const t0 = Date.now();
  const q = query({
    prompt: userText,
    options: {
      model: cfg.model,
      systemPrompt: system,
      tools: [],          // pure generation — no file/bash access
      // A long lesson can run past one model turn (truncated output the SDK
      // continues, or a thinking + structured-output step), which aborts with
      // "Reached maximum number of turns (1)". Allow a few — with no tools there
      // is no tool-call loop to run away, so the extra turns only finish output.
      maxTurns: 8,
      persistSession: false,
      // Point at the real (unpacked) native binary; the SDK's own resolution
      // lands inside app.asar and spawning that yields "spawn ENOTDIR".
      ...(exe ? { pathToClaudeCodeExecutable: exe } : {}),
      ...(schema ? { outputFormat: { type: 'json_schema', schema } } : {}),
    },
  });
  let text = '';
  let structured;
  let sawResult = false;
  for await (const m of q) {
    if (m.type === 'assistant' && m.message && Array.isArray(m.message.content)) {
      for (const b of m.message.content) {
        if (b.type === 'text' && b.text) { text += b.text; log('cli◂', preview(b.text), 'debug'); }
        else if (b.type === 'thinking' && b.thinking) log('cli·think', preview(b.thinking), 'debug');
      }
    } else if (m.type === 'result') {
      sawResult = true;
      if (m.subtype === 'success') {
        if (m.structured_output !== undefined && m.structured_output !== null) structured = m.structured_output;
        else if (m.result) text = m.result;
        log('cli', 'done · ' + (structured !== undefined ? 'structured output' : text.length + ' chars') + ' · ' + (Date.now() - t0) + 'ms');
      } else {
        const detail = (m.errors && m.errors.length) ? m.errors.join('; ') : m.subtype.replace(/^error_/, '').replace(/_/g, ' ');
        log('cli', 'failed · ' + detail, 'error');
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
  log('api', 'messages.stream · model=' + cfg.model);
  const t0 = Date.now();
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
    log('api', 'refused', 'error');
    throw new Error('The model declined to write this lesson. Try rephrasing the request.');
  }
  if (message.stop_reason === 'max_tokens') {
    log('api', 'hit max_tokens', 'error');
    throw new Error('The lesson ran over the output limit — try a narrower topic.');
  }
  const u = message.usage || {};
  log('api', 'done · stop=' + message.stop_reason + ' · in=' + u.input_tokens + ' out=' + u.output_tokens + ' · ' + (Date.now() - t0) + 'ms');
  const text = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return JSON.parse(text);
}

// ---------- shared entry points ----------

async function generateJson(args) {
  if (cfg.method === 'cli') return cliRun(args);
  if (cfg.method === 'local') {
    const userText = args.userText +
      '\n\nRespond with ONLY a single JSON object matching this JSON Schema — no markdown, no code fences, no commentary:\n' +
      JSON.stringify(args.schema);
    const text = await localChat({
      messages: [{ role: 'system', content: args.system }, { role: 'user', content: userText }],
      jsonMode: true,
    });
    return parseJsonLoose(text);
  }
  return apiGenerateJson(args);
}

async function verifyConnection() {
  log('connect', 'verifying · ' + cfg.method + ' · model=' + cfg.model);
  if (cfg.method === 'cli') {
    const reply = await cliRun({
      system: 'You are a connectivity check. Reply with exactly: ok',
      userText: 'ping',
    });
    if (!reply) throw new Error('Claude Code replied with nothing.');
    return { model: cfg.model, displayName: 'Claude Code' };
  }
  if (cfg.method === 'local') {
    const models = await listLocalModels();
    if (!models.length) throw new Error('No models found at ' + localBase() + ' — pull one first (e.g. `ollama pull llama3.1`).');
    const picked = models.find((m) => m.id === cfg.model) ? cfg.model : models[0].id;
    return { model: picked, displayName: 'Local · ' + localBase() };
  }
  const m = await getApiClient().models.retrieve(cfg.model);
  return { model: m.id, displayName: m.display_name };
}

async function startCourse({ prompt }) {
  log('course', 'start · "' + preview(prompt, 140) + '"');
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
  log('lesson', regenerateOf ? ('regenerate · "' + preview(regenerateOf.title, 100) + '"') : ('next · "' + preview(request, 140) + '"'));
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
  log('thread', 'ask · "' + preview(question, 140) + '"');
  const contextText = threadContext({ course, lesson, quote });

  if (cfg.method === 'cli') {
    const parts = [contextText, '', 'Conversation so far:'];
    for (const m of history || []) parts.push((m.role === 'user' ? 'Learner: ' : 'Tutor: ') + m.text);
    parts.push('Learner: ' + question, '', 'Reply as the tutor (reply with the answer only, no "Tutor:" prefix).');
    return cliRun({ system: THREAD_SYSTEM, userText: parts.join('\n') });
  }

  if (cfg.method === 'local') {
    const msgs = [
      { role: 'system', content: THREAD_SYSTEM },
      { role: 'user', content: contextText + '\n\nI have the lesson in front of me — ask me anything about it.' },
      { role: 'assistant', content: 'Understood — what would you like to know?' },
    ];
    for (const m of history || []) msgs.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text });
    msgs.push({ role: 'user', content: question });
    const text = await localChat({ messages: msgs });
    return text.trim();
  }

  const messages = [
    { role: 'user', content: contextText + '\n\nFirst question follows in the next messages.' },
    { role: 'assistant', content: 'Understood — I have the lesson in front of me. What would you like to know?' },
  ];
  for (const m of history || []) {
    messages.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text });
  }
  messages.push({ role: 'user', content: question });

  log('api', 'thread stream · model=' + cfg.model);
  const t0 = Date.now();
  const stream = getApiClient().messages.stream({
    model: cfg.model,
    max_tokens: 2048,
    thinking: { type: 'adaptive' },
    system: [{ type: 'text', text: THREAD_SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages,
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === 'refusal') {
    log('api', 'thread refused', 'error');
    throw new Error('The model declined to answer this question.');
  }
  log('api', 'thread done · stop=' + message.stop_reason + ' · ' + (Date.now() - t0) + 'ms');
  return message.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
}

module.exports = { configure, verifyConnection, listModels, startCourse, nextLesson, askThread, errMessage, DEFAULT_MODEL, log, onLog };
