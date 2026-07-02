import React from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { H, Svg, IcnArrow, IcnX, IcnTrash, IcnChat, IcnMenu } from './ui.jsx';

// Theme props from the design canvas (Teach.dc.html data-props defaults).
const ACCENT = '#4f46e5';
const SURFACE = 'cool';
const DENSITY = 'comfortable';

const MODELS = [
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
];

marked.setOptions({ gfm: true });

const api = typeof window !== 'undefined' ? window.teach : null;

const GEAR_PATH = 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z';

export default class App extends React.Component {
  _proseRef = React.createRef();

  state = {
    landingInput: '',
    focused: false,
    phIndex: 0,
    search: '',
    activeId: null,
    streaming: '',       // courseId currently generating
    streamPrompt: '',
    openLessonId: null,
    composer: '',
    panelOpen: false,
    activeThreadId: null,
    threads: {},
    threadBusy: null,    // threadId awaiting an answer
    draft: '',
    askBtn: null,
    picker: null,
    settingsOpen: false,
    agent: { method: 'cli', connected: false, hasApiKey: false, apiKey: '', model: 'claude-opus-4-8', connecting: false, error: '' },
    mobileNav: false,
    vw: (typeof window !== 'undefined' ? window.innerWidth : 1280),
    collapsed: {},
    completed: {},
    quiz: {},
    courses: [],
    genErrors: {},
    regenId: null,
  };

  placeholders = ['Learn React from scratch…', 'Explain quantum computing…', 'Teach me accounting…', 'Learn Docker…', 'Understand machine learning…'];

  componentDidMount() {
    this._ph = setInterval(() => this.setState(s => ({ phIndex: (s.phIndex + 1) % this.placeholders.length })), 2600);
    this._rs = () => this.setState({ vw: window.innerWidth });
    window.addEventListener('resize', this._rs);
    this.applyHLVars();
    if (api) {
      api.loadState().then(({ data, settings }) => {
        this.setState(s => ({
          courses: (data && data.courses) || [],
          completed: (data && data.completed) || {},
          threads: (data && data.threads) || {},
          quiz: (data && data.quiz) || {},
          agent: { ...s.agent, method: settings.method || s.agent.method, model: settings.model || s.agent.model, connected: !!settings.connected, hasApiKey: !!settings.hasApiKey },
        }));
      }).catch(() => {});
    }
  }

  persist() {
    if (!api) return;
    clearTimeout(this._save);
    this._save = setTimeout(() => {
      const { courses, completed, threads, quiz } = this.state;
      api.saveState({ courses, completed, threads, quiz }).catch(() => {});
    }, 800);
  }

  componentDidUpdate(_pp, ps) {
    this.applyHLVars();
    const lid = this.state.openLessonId;
    const sig = lid + '|' + ACCENT + '|' + this.state.activeThreadId + '|' + JSON.stringify((this.state.threads[lid] || []).map(t => t.id + ':' + (t.quote || '') + ':' + (t.at != null ? t.at : '')));
    if (sig !== this._hlSig) { this._hlSig = sig; this.scheduleHL(); }
    const s = this.state;
    if (s.courses !== ps.courses || s.completed !== ps.completed || s.threads !== ps.threads || s.quiz !== ps.quiz) this.persist();
  }

  applyHLVars() {
    try { const t = this.theme(); const r = document.documentElement; r.style.setProperty('--th-hl', t.hl); r.style.setProperty('--th-hl-active', t.hlActive); r.style.setProperty('--th-line', t.accent); } catch (e) {}
  }

  trunc(str, n) { str = str || ''; return str.length > n ? str.slice(0, n - 1) + '…' : str; }

  seedThreads() { return [{ id: 'general', quote: null, messages: [] }]; }

  // ---------- selection highlights (unchanged from the design) ----------

  findRange(container, quote) {
    if (!container || !quote) return null;
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
    const nodes = []; let full = '';
    while (walker.nextNode()) { const n = walker.currentNode; nodes.push({ node: n, start: full.length }); full += n.nodeValue; }
    const idx = full.indexOf(quote); if (idx < 0) return null;
    const end = idx + quote.length; const range = document.createRange(); let sSet = false;
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i].node, start = nodes[i].start, nEnd = start + node.nodeValue.length;
      if (!sSet && idx >= start && idx < nEnd) { range.setStart(node, idx - start); sSet = true; }
      if (end > start && end <= nEnd) { range.setEnd(node, end - start); return range; }
    }
    return sSet ? range : null;
  }

  reanchorHighlights() {
    const cont = this._proseRef.current || document.querySelector('.tui-prose'), lid = this.state.openLessonId;
    if (!cont || !lid) return;
    this.clearMarks(cont);
    const ths = (this.state.threads[lid] || []).filter(t => t.quote);
    ths.forEach(t => {
      const r = (t.at != null) ? this.rangeFromOffsets(cont, t.at, t.at + t.len) : this.findRange(cont, t.quote);
      if (r) this.wrapRange(cont, r, t.id, t.id === this.state.activeThreadId);
    });
  }
  clearMarks(cont) {
    const marks = cont.querySelectorAll('mark[data-th]');
    marks.forEach(m => { const p = m.parentNode; if (!p) return; while (m.firstChild) p.insertBefore(m.firstChild, m); p.removeChild(m); });
    cont.normalize();
  }
  textOffsetOf(cont, node, off) {
    const walker = document.createTreeWalker(cont, NodeFilter.SHOW_TEXT, null); let acc = 0;
    while (walker.nextNode()) { const n = walker.currentNode; if (n === node) return acc + off; acc += n.nodeValue.length; }
    return acc;
  }
  rangeFromOffsets(cont, from, to) {
    const walker = document.createTreeWalker(cont, NodeFilter.SHOW_TEXT, null);
    const nodes = []; let full = 0;
    while (walker.nextNode()) { const n = walker.currentNode; nodes.push({ node: n, start: full }); full += n.nodeValue.length; }
    const range = document.createRange(); let sSet = false;
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i].node, start = nodes[i].start, nEnd = start + node.nodeValue.length;
      if (!sSet && from >= start && from <= nEnd) { range.setStart(node, from - start); sSet = true; }
      if (to > start && to <= nEnd) { if (sSet) { range.setEnd(node, to - start); return range; } return null; }
    }
    return null;
  }
  wrapRange(cont, range, thId, active) {
    const texts = []; const walker = document.createTreeWalker(cont, NodeFilter.SHOW_TEXT, null);
    while (walker.nextNode()) { const n = walker.currentNode; if (range.intersectsNode(n)) texts.push(n); }
    texts.forEach(n => {
      const r = document.createRange(); r.selectNodeContents(n);
      if (n === range.startContainer) r.setStart(n, range.startOffset);
      if (n === range.endContainer) r.setEnd(n, range.endOffset);
      if (r.collapsed) return;
      const mark = document.createElement('mark'); mark.setAttribute('data-th', thId); mark.className = active ? 'th-mark th-active' : 'th-mark';
      try { r.surroundContents(mark); } catch (e) {}
    });
  }
  scheduleHL = () => { setTimeout(() => this.reanchorHighlights(), 0); };

  // ---------- threads ----------

  onTogglePanel = () => this.setState(s => ({ panelOpen: !s.panelOpen }));
  openThread = (id) => { this.setState({ activeThreadId: id, panelOpen: true, picker: null }); this.scheduleHL(); };
  backToList = () => { this.setState({ activeThreadId: null }); this.scheduleHL(); };
  deleteThread = (id) => { const lid = this.state.openLessonId; this.setState(s => ({ threads: { ...s.threads, [lid]: (s.threads[lid] || []).filter(t => t.id !== id) }, activeThreadId: s.activeThreadId === id ? null : s.activeThreadId })); this.scheduleHL(); };
  onDraft = (e) => this.setState({ draft: e.target.value });
  onDraftKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.onSendThread(); } };

  onSendThread = () => {
    const text = (this.state.draft || '').trim(); if (!text) return;
    const lid = this.state.openLessonId, id = this.state.activeThreadId;
    if (!id || this.state.threadBusy) return;
    const course = this.active, lesson = this.lessonById(course, lid);
    if (!course || !lesson) return;
    const thread = (this.state.threads[lid] || []).find(t => t.id === id);
    const history = thread ? thread.messages : [];
    this.appendThreadMsg(lid, id, { role: 'user', text });
    this.setState({ draft: '', threadBusy: id });
    const payload = {
      course: { title: course.title, mission: course.mission },
      lesson: { title: lesson.title, subtitle: lesson.subtitle, bodyMarkdown: lesson.bodyMarkdown },
      quote: thread ? thread.quote : null,
      history,
      question: text,
    };
    (api ? api.askThread(payload) : Promise.resolve({ ok: false, error: 'Agent bridge unavailable.' })).then(res => {
      this.appendThreadMsg(lid, id, { role: 'ai', text: res.ok ? res.result : `Sorry — ${res.error}` });
      this.setState({ threadBusy: null });
    });
  };

  appendThreadMsg(lid, threadId, msg) {
    this.setState(s => ({ threads: { ...s.threads, [lid]: (s.threads[lid] || []).map(t => t.id !== threadId ? t : { ...t, messages: [...t.messages, msg] }) } }));
  }

  onAskDown = (e) => { e.preventDefault(); };
  onAsk = () => {
    if (!this._pendingRange) return;
    const cont = this._proseRef.current || document.querySelector('.tui-prose');
    const range = this._pendingRange, quote = this._pendingQuote, len = quote.length;
    const at = cont ? this.textOffsetOf(cont, range.startContainer, range.startOffset) : null;
    const lid = this.state.openLessonId, id = 'th' + Date.now();
    try { window.getSelection().removeAllRanges(); } catch (e) {}
    this._pendingRange = null; this._pendingQuote = '';
    this.setState(s => ({ threads: { ...s.threads, [lid]: [...(s.threads[lid] || this.seedThreads()), { id, quote, at, len, createdAt: Date.now(), messages: [] }] }, activeThreadId: id, panelOpen: true, askBtn: null }));
    this.scheduleHL();
  };
  onLessonScroll = () => { if (this.state.askBtn) this.setState({ askBtn: null }); };
  onProseMouseUp = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) { if (this.state.askBtn) this.setState({ askBtn: null }); return; }
    const r = sel.getRangeAt(0), cont = this._proseRef.current || document.querySelector('.tui-prose');
    if (!cont || !cont.contains(r.commonAncestorContainer)) { if (this.state.askBtn) this.setState({ askBtn: null }); return; }
    const q = sel.toString().trim(); if (q.length < 2) return;
    this._pendingRange = r.cloneRange(); this._pendingQuote = q;
    const rect = r.getBoundingClientRect();
    this.setState({ askBtn: { top: Math.min(rect.bottom + 8, window.innerHeight - 46), left: Math.max(12, Math.min(rect.left, window.innerWidth - 96)) } });
  };
  onProseClick = (e) => {
    const sel = window.getSelection(); if (sel && !sel.isCollapsed) return;
    const cont = this._proseRef.current || document.querySelector('.tui-prose'); if (!cont) return;
    let el = e.target; const ids = [];
    while (el && el !== cont) { if (el.tagName === 'MARK' && el.getAttribute('data-th')) ids.push(el.getAttribute('data-th')); el = el.parentElement; }
    if (ids.length === 1) this.openThread(ids[0]);
    else if (ids.length > 1) this.setState({ picker: { top: e.clientY + 10, left: Math.min(e.clientX, window.innerWidth - 230), ids } });
  };
  onClosePicker = () => this.setState({ picker: null });
  componentWillUnmount() { clearInterval(this._ph); window.removeEventListener('resize', this._rs); clearTimeout(this._save); }

  // ---------- theme ----------

  theme() {
    const accent = ACCENT;
    const SURF = {
      warm: { page: '#faf9f7', sidebar: '#f5f3f0', border: '#eae7e2', borderSoft: '#efece7', inputBg: '#fbfaf8', ink: '#1c1b19', body: '#37352f', sub: '#8a8781', faint: '#a5a19a', railHover: '#ece9e4' },
      cool: { page: '#f6f8fb', sidebar: '#eceff4', border: '#e0e5ec', borderSoft: '#e7ecf2', inputBg: '#f3f6fa', ink: '#191d24', body: '#333a45', sub: '#7c8291', faint: '#9aa1b0', railHover: '#e4e9f0' },
      mono: { page: '#fbfbfb', sidebar: '#f4f4f5', border: '#e7e7e9', borderSoft: '#ededee', inputBg: '#fbfbfb', ink: '#18181b', body: '#3f3f46', sub: '#83838a', faint: '#a1a1aa', railHover: '#eeeeef' },
    }[SURFACE] || {};
    const DENS = {
      cozy: { threadPadTop: '22px', cardPad: '12px 15px', cardRadius: '12px', cardGap: '8px', msgMb: '15px', avatarGap: '11px' },
      comfortable: { threadPadTop: '32px', cardPad: '15px 18px', cardRadius: '15px', cardGap: '10px', msgMb: '20px', avatarGap: '13px' },
      spacious: { threadPadTop: '44px', cardPad: '19px 22px', cardRadius: '18px', cardGap: '14px', msgMb: '28px', avatarGap: '15px' },
    }[DENSITY] || {};
    return {
      accent, ...SURF, ...DENS,
      accentSoft: accent + '14',
      accentRing: accent + '55',
      landingBg: 'radial-gradient(120% 90% at 50% 0%, ' + accent + '12 0%, ' + SURF.page + ' 60%)',
      userShadow: '0 4px 14px -8px ' + accent + 'aa',
      railHoverCss: 'background: ' + SURF.railHover + ';',
      accentBorderCss: 'border-color: ' + accent + '; color: ' + accent + ';',
      quizBg: accent + '0a',
      quizBorder: accent + '2e',
      hl: accent + '33',
      hlActive: accent + '59',
    };
  }

  get courses() { return this.state.courses; }
  get active() { return this.courses.find(c => c.id === this.state.activeId) || null; }
  isMobile() { return this.state.vw < 860; }
  lessonById(course, id) { return course ? (course.lessons || []).find(l => l.id === id) : null; }

  proseHtml(l) {
    const md = l.bodyMarkdown || '_This lesson has no content yet — try Regenerate._';
    try { return DOMPurify.sanitize(marked.parse(md)); } catch (e) { return ''; }
  }

  // ---------- generation ----------

  updateCourse(courseId, fn) {
    this.setState(s => ({ courses: s.courses.map(c => c.id === courseId ? fn(c) : c) }));
  }

  setGenError(courseId, msg) {
    this.setState(s => ({ genErrors: { ...s.genErrors, [courseId]: msg || undefined } }));
  }

  slimCourse(course) {
    return {
      title: course.title,
      mission: course.mission,
      lessons: (course.lessons || []).map(l => ({ id: l.id, title: l.title, type: l.type, subtitle: l.subtitle, learningRecord: l.learningRecord })),
    };
  }

  // landing
  onLandingInput = e => this.setState({ landingInput: e.target.value });
  onFocus = () => this.setState({ focused: true });
  onBlur = () => this.setState({ focused: false });
  onLandingKey = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.onStart(); } };
  onStart = () => { const p = (this.state.landingInput || '').trim(); if (p) this.launch(p); };

  launch(prompt) {
    if (this.state.streaming) return;
    const id = 'c' + Date.now();
    const course = { id, title: this.trunc(prompt, 42), prompt, mission: '', intro: '', lessons: [] };
    this.setState(s => ({
      courses: [course, ...s.courses],
      activeId: id, landingInput: '', streaming: id, streamPrompt: '', mobileNav: false, collapsed: {}, openLessonId: null,
      genErrors: { ...s.genErrors, [id]: undefined },
    }));
    (api ? api.startCourse({ prompt }) : Promise.resolve({ ok: false, error: 'Agent bridge unavailable.' })).then(res => {
      if (res.ok) {
        const r = res.result;
        const lesson = { ...r.lesson, id: 'l' + Date.now(), prompt: null };
        this.updateCourse(id, c => ({ ...c, title: r.courseTitle || c.title, mission: r.mission, intro: r.intro, lessons: [lesson] }));
      } else {
        this.setGenError(id, res.error);
      }
      this.setState({ streaming: '', streamPrompt: '' });
    });
  }

  chooseSuggestion(courseId, sg) {
    if (this.state.streaming) return;
    const course = this.courses.find(c => c.id === courseId); if (!course) return;
    if (!course.lessons || course.lessons.length === 0) {
      // First lesson never landed (e.g. earlier failure) — restart the course.
      this.setState(s => ({ streaming: courseId, streamPrompt: '', genErrors: { ...s.genErrors, [courseId]: undefined } }));
      const prompt = sg.raw ? `${course.prompt}\n\nAdditional context from the user: ${sg.label}` : course.prompt;
      (api ? api.startCourse({ prompt }) : Promise.resolve({ ok: false, error: 'Agent bridge unavailable.' })).then(res => {
        if (res.ok) {
          const r = res.result;
          const lesson = { ...r.lesson, id: 'l' + Date.now(), prompt: null };
          this.updateCourse(courseId, c => ({ ...c, title: r.courseTitle || c.title, mission: r.mission, intro: r.intro, lessons: [lesson] }));
        } else {
          this.setGenError(courseId, res.error);
        }
        this.setState({ streaming: '', streamPrompt: '' });
      });
      return;
    }
    const request = sg.raw ? sg.label
      : sg.type === 'quiz' ? 'Quiz checkpoint: ' + sg.label
      : sg.type === 'project' ? 'Practice project: ' + sg.label
      : 'Teach me: ' + sg.label;
    this.setState(s => ({ streaming: courseId, streamPrompt: request, genErrors: { ...s.genErrors, [courseId]: undefined } }));
    const payload = { course: this.slimCourse(course), completedIds: Object.keys(this.state.completed).filter(k => this.state.completed[k]), request };
    (api ? api.nextLesson(payload) : Promise.resolve({ ok: false, error: 'Agent bridge unavailable.' })).then(res => {
      if (res.ok) {
        const r = res.result;
        const lesson = { ...r.lesson, id: 'l' + Date.now(), prompt: request, intro: r.intro || '' };
        this.updateCourse(courseId, c => ({ ...c, lessons: [...c.lessons, lesson] }));
      } else {
        this.setGenError(courseId, res.error);
      }
      this.setState({ streaming: '', streamPrompt: '' });
    });
  }

  onRegenerate = () => {
    const course = this.active, lid = this.state.openLessonId;
    const lesson = this.lessonById(course, lid);
    if (!course || !lesson || this.state.regenId) return;
    this.setState({ regenId: lid });
    const payload = {
      course: this.slimCourse(course),
      completedIds: Object.keys(this.state.completed).filter(k => this.state.completed[k]),
      regenerateOf: { title: lesson.title, type: lesson.type },
    };
    (api ? api.nextLesson(payload) : Promise.resolve({ ok: false, error: 'Agent bridge unavailable.' })).then(res => {
      if (res.ok) {
        const r = res.result;
        this.updateCourse(course.id, c => ({ ...c, lessons: c.lessons.map(l => l.id !== lid ? l : { ...l, ...r.lesson, id: lid, prompt: l.prompt }) }));
        this.setState(s => ({ quiz: { ...s.quiz, [lid]: undefined } }));
      }
      this.setState({ regenId: null });
    });
  };

  onHome = () => this.setState({ activeId: null, openLessonId: null, landingInput: '', mobileNav: false });
  onSearch = e => this.setState({ search: e.target.value });
  onNewCourse = () => this.setState({ activeId: null, openLessonId: null, landingInput: '', mobileNav: false });
  selectCourse = id => this.setState({ activeId: id, mobileNav: false, openLessonId: null });
  toggleCourse = id => this.setState(s => ({ collapsed: { ...s.collapsed, [id]: !s.collapsed[id] } }));
  onComposer = e => this.setState({ composer: e.target.value });
  onComposerKey = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.onComposerSend(); } };
  onComposerSend = () => {
    const text = (this.state.composer || '').trim();
    if (!text || this.state.streaming || !this.state.activeId) return;
    this.setState({ composer: '' });
    this.chooseSuggestion(this.state.activeId, { label: text, raw: true });
  };
  onOpenMobile = () => this.setState({ mobileNav: true });
  onCloseMobile = () => this.setState({ mobileNav: false });

  openLesson = (id) => { this.setState(s => ({ openLessonId: id, activeThreadId: null, askBtn: null, picker: null, draft: '', threads: s.threads[id] ? s.threads : { ...s.threads, [id]: this.seedThreads() } })); this.scheduleHL(); };
  onCloseViewer = () => this.setState({ openLessonId: null });
  stop = e => e.stopPropagation();
  onToggleComplete = () => { const id = this.state.openLessonId; this.setState(s => ({ completed: { ...s.completed, [id]: !s.completed[id] } })); };
  onNextLesson = () => {
    const course = this.active; if (!course) return;
    const idx = course.lessons.findIndex(l => l.id === this.state.openLessonId);
    if (idx >= 0 && idx < course.lessons.length - 1) this.setState({ openLessonId: course.lessons[idx + 1].id });
  };

  qState(id) { return this.state.quiz[id] || { qi: 0, selected: null, revealed: false }; }
  pickAnswer = (id, oi) => { const q = this.qState(id); if (q.revealed) return; this.setState(s => ({ quiz: { ...s.quiz, [id]: { ...q, selected: oi, revealed: true } } })); };
  nextQuestion = (id, total) => {
    const q = this.qState(id);
    if (q.qi < total - 1) this.setState(s => ({ quiz: { ...s.quiz, [id]: { qi: q.qi + 1, selected: null, revealed: false } } }));
    else { this.setState(s => ({ completed: { ...s.completed, [id]: true } })); this.onCloseViewer(); }
  };

  // ---------- settings ----------

  onOpenSettings = () => this.setState({ settingsOpen: true, mobileNav: false });
  onCloseSettings = () => this.setState({ settingsOpen: false });
  setAgent = (patch) => this.setState(s => ({ agent: { ...s.agent, ...patch } }));
  onApiKey = (e) => this.setAgent({ apiKey: e.target.value });
  onAgentMethod = (m) => { this.setAgent({ method: m, connected: false, error: '' }); if (api) api.setMethod(m).catch(() => {}); };
  onModel = (m) => { this.setAgent({ model: m }); if (api) api.setModel(m).catch(() => {}); };
  onCopyCmd = () => { try { navigator.clipboard.writeText('npm install -g @anthropic-ai/claude-code && claude'); } catch (e) {} };
  onConnect = () => {
    const a = this.state.agent;
    if (a.connecting) return;
    this.setAgent({ connecting: true, error: '' });
    (api ? api.connect({ method: a.method, apiKey: a.apiKey || undefined, model: a.model }) : Promise.resolve({ ok: false, error: 'Agent bridge unavailable.' })).then(res => {
      if (res.ok) this.setAgent({ connected: true, connecting: false, hasApiKey: this.state.agent.apiKey ? true : this.state.agent.hasApiKey, apiKey: '', error: '' });
      else this.setAgent({ connected: false, connecting: false, error: res.error });
    });
  };
  onDisconnect = () => {
    if (api) api.disconnect().catch(() => {});
    this.setAgent({ connected: false, connecting: false, hasApiKey: false, apiKey: '', error: '' });
  };

  typeMeta(type, accent) {
    if (type === 'quiz') return { tag: 'Quiz', color: '#7c3aed' };
    if (type === 'project') return { tag: 'Project', color: '#d97706' };
    return { tag: 'Lesson', color: accent };
  }

  lessonCardVm(l, num, done, t) {
    const meta = this.typeMeta(l.type, t.accent);
    return {
      isLesson: true, isUser: false, isAi: false,
      badge: done ? '✓' : String(num), title: l.title, subtitle: l.subtitle, readTime: l.readTime,
      typeTag: meta.tag, cta: done ? 'Review' : 'Open',
      onOpen: () => this.openLesson(l.id),
      cardStyle: { display: 'flex', alignItems: 'center', gap: '15px', background: '#fff', border: '1px solid ' + t.border, borderRadius: t.cardRadius, padding: t.cardPad, cursor: 'pointer', transition: 'all 0.18s', boxShadow: '0 1px 2px rgba(0,0,0,0.02)', marginBottom: t.cardGap, animation: 'tuiCardIn 0.45s cubic-bezier(0.22,1,0.36,1)' },
      cardHover: 'border-color: ' + t.accent + '; transform: translateY(-1px); box-shadow: 0 8px 22px -12px rgba(28,27,25,0.2);',
      badgeStyle: { width: '32px', height: '32px', borderRadius: '10px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 600, background: done ? t.accent : t.railHover, color: done ? '#fff' : t.sub },
      typeTagStyle: { fontSize: '10.5px', fontWeight: 600, letterSpacing: '0.03em', textTransform: 'uppercase', color: meta.color, background: meta.color + '18', padding: '2px 7px', borderRadius: '6px' },
      ctaStyle: { display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '13px', fontWeight: 500, color: t.accent, whiteSpace: 'nowrap' },
    };
  }

  renderVals() {
    const s = this.state, mobile = this.isMobile(), active = this.active, t = this.theme();

    const chipBase = { padding: '8px 15px', borderRadius: '999px', background: '#fff', border: '1px solid ' + t.border, fontFamily: 'inherit', fontSize: '13.5px', color: t.sub, cursor: 'pointer', transition: 'all 0.16s' };
    const examples = ['Learn React', 'Quantum computing', 'Accounting basics', 'Learn Docker', 'History of Rome'].map(label => ({ label, onPick: () => this.launch(label), style: chipBase, hover: 'border-color: ' + t.accent + '; color: ' + t.accent + ';' }));

    const q = s.search.toLowerCase();
    const chats = this.courses.filter(c => !q || c.title.toLowerCase().includes(q)).map(c => {
      const isActive = c.id === s.activeId;
      const expanded = s.collapsed[c.id] !== undefined ? !s.collapsed[c.id] : isActive;
      const gl = c.lessons || [];
      return {
        id: c.id, title: c.title, expanded,
        moreLabel: (s.streaming === c.id) ? 'Writing next lesson…'
          : s.genErrors[c.id] ? 'Couldn’t write — try again'
          : (gl.length === 0 ? 'No lessons yet — type below to start' : gl.length + ' lesson' + (gl.length === 1 ? '' : 's') + ' · ask for more'),
        onSelect: () => this.selectCourse(c.id),
        onToggle: (e) => { e.stopPropagation(); this.toggleCourse(c.id); },
        rowStyle: { display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 9px', borderRadius: '10px', cursor: 'pointer', transition: 'background 0.15s', background: isActive ? '#fff' : 'transparent', boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.06)' : 'none' },
        chevStyle: { display: 'inline-flex', transition: 'transform 0.2s', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' },
        lessons: gl.map((l, i) => {
          const done = !!s.completed[l.id];
          const cur = s.openLessonId === l.id;
          return {
            id: l.id, title: (i + 1) + '. ' + l.title, dot: done ? '✓' : '',
            onOpen: () => { this.setState({ activeId: c.id }); this.openLesson(l.id); },
            rowStyle: { display: 'flex', alignItems: 'center', gap: '9px', padding: '6px 9px', borderRadius: '8px', cursor: 'pointer', fontSize: '12.5px', fontWeight: cur ? 600 : 400, color: cur ? t.ink : t.sub, background: cur ? t.railHover : 'transparent', marginBottom: '1px', transition: 'background 0.15s' },
            dotStyle: { width: '15px', height: '15px', borderRadius: '999px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 700, background: done ? t.accent : 'transparent', color: done ? '#fff' : 'transparent', border: done ? 'none' : '1.5px solid ' + t.border },
          };
        }),
      };
    });

    // ---- thread ----
    const gl = active ? (active.lessons || []) : [];
    const isStreaming = !!active && s.streaming === active.id;
    const genError = active ? s.genErrors[active.id] : '';
    const thread = [];
    const userWrap = { display: 'flex', justifyContent: 'flex-end', marginBottom: t.msgMb, animation: 'tuiFadeUp 0.4s ease' };
    const aiWrap = { display: 'flex', gap: t.avatarGap, marginBottom: t.msgMb, animation: 'tuiFadeUp 0.5s ease' };
    if (active) {
      thread.push({ isUser: true, isAi: false, isLesson: false, first: true, text: active.prompt, wrapStyle: userWrap });
      if (active.intro) thread.push({ isAi: true, isUser: false, isLesson: false, text: active.intro, wrapStyle: aiWrap });
      gl.forEach((l, i) => {
        if (i > 0 && l.prompt) thread.push({ isUser: true, isAi: false, isLesson: false, first: false, text: l.prompt, wrapStyle: userWrap });
        if (i > 0 && l.intro) thread.push({ isAi: true, isUser: false, isLesson: false, text: l.intro, wrapStyle: aiWrap });
        thread.push(this.lessonCardVm(l, i + 1, !!s.completed[l.id], t));
      });
      if (isStreaming && s.streamPrompt) thread.push({ isUser: true, isAi: false, isLesson: false, first: false, text: s.streamPrompt, wrapStyle: userWrap });
    }

    // ---- suggestions ----
    let suggestions = [], showSuggestions = false, suggestIntro = '';
    if (active && !isStreaming && gl.length > 0) {
      showSuggestions = true;
      const tip = gl[gl.length - 1];
      const GENERIC = [{ label: 'Go deeper on this topic', type: 'lesson' }, { label: 'Give me a practice project', type: 'project' }, { label: 'Quiz me on what I learned', type: 'quiz' }];
      const raw = (tip.suggests && tip.suggests.length) ? tip.suggests : GENERIC;
      suggestIntro = 'Nice work. Where would you like to go next?';
      suggestions = raw.map(sg => {
        const meta = this.typeMeta(sg.type, t.accent);
        const icon = sg.type === 'quiz' ? '?' : sg.type === 'project' ? '⚒' : '→';
        return {
          label: sg.label, tag: meta.tag,
          onPick: () => this.chooseSuggestion(active.id, sg),
          style: { display: 'flex', alignItems: 'center', gap: '11px', width: '100%', maxWidth: '440px', textAlign: 'left', background: '#fff', border: '1px solid ' + t.border, borderRadius: '13px', padding: '12px 14px', fontFamily: 'inherit', fontSize: '14px', fontWeight: 500, color: t.ink, cursor: 'pointer', transition: 'all 0.16s' },
          hover: 'border-color: ' + t.accent + '; box-shadow: 0 6px 18px -12px rgba(28,27,25,0.25); transform: translateY(-1px);',
          icon,
          iconStyle: { width: '24px', height: '24px', borderRadius: '7px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, background: meta.color + '18', color: meta.color },
          tagStyle: { fontSize: '10.5px', fontWeight: 600, letterSpacing: '0.03em', textTransform: 'uppercase', color: meta.color, background: meta.color + '14', padding: '2px 7px', borderRadius: '6px', flexShrink: 0 },
        };
      });
    }

    // ---- viewer ----
    const openL = active ? this.lessonById(active, s.openLessonId) : null;
    let vm = {};
    if (openL) {
      const done = !!s.completed[openL.id];
      const idx = gl.findIndex(l => l.id === openL.id);
      const num = idx >= 0 ? idx + 1 : gl.length;
      const viewerHasNext = idx >= 0 && idx < gl.length - 1;
      const viewerAtTip = idx === gl.length - 1;
      const meta = this.typeMeta(openL.type, t.accent);
      const questions = Array.isArray(openL.quiz) ? openL.quiz : [];
      const hasQuiz = questions.length > 0;
      const qs = this.qState(openL.id);
      const curQ = hasQuiz ? questions[Math.min(qs.qi, questions.length - 1)] : null;
      const isLast = qs.qi >= questions.length - 1;
      const correct = curQ ? qs.selected === curQ.correct : false;
      vm = {
        activeLesson: {
          title: openL.title, readTime: openL.readTime, badge: done ? '✓' : String(num),
          typeTag: meta.tag,
          typeTagStyle: { fontSize: '11px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: meta.color, background: meta.color + '18', padding: '3px 9px', borderRadius: '7px' },
          badgeStyleLg: { width: '30px', height: '30px', borderRadius: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 600, background: done ? t.accent : t.railHover, color: done ? '#fff' : t.sub },
        },
        lessonProse: <div className="tui-prose" ref={this._proseRef} onMouseUp={this.onProseMouseUp} onClick={this.onProseClick} dangerouslySetInnerHTML={{ __html: this.proseHtml(openL) }} />,
        hasQuiz,
        quiz: hasQuiz ? {
          progress: 'Question ' + (qs.qi + 1) + ' of ' + questions.length, question: curQ.q, revealed: qs.revealed,
          options: curQ.options.map((opt, oi) => {
            const chosen = qs.selected === oi, isCorrect = oi === curQ.correct;
            let bg = '#fff', bd = t.border, mk = String.fromCharCode(65 + oi), mkBg = t.railHover, mkFg = t.sub;
            if (qs.revealed) { if (isCorrect) { bg = '#ecfdf5'; bd = '#a7f3d0'; mk = '✓'; mkBg = '#16a34a'; mkFg = '#fff'; } else if (chosen) { bg = '#fdeeee'; bd = '#f0b8b8'; mk = '✕'; mkBg = '#dc2626'; mkFg = '#fff'; } }
            return { text: opt, onPick: () => this.pickAnswer(openL.id, oi),
              style: { display: 'flex', alignItems: 'center', gap: '12px', width: '100%', textAlign: 'left', border: '1.5px solid ' + bd, background: bg, borderRadius: '13px', padding: '13px 15px', fontFamily: 'inherit', fontSize: '14.5px', color: t.body, cursor: qs.revealed ? 'default' : 'pointer', transition: 'all 0.15s' },
              hover: qs.revealed ? '' : 'border-color: ' + t.accent + ';',
              mark: mk, markStyle: { width: '26px', height: '26px', borderRadius: '8px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 600, background: mkBg, color: mkFg } };
          }),
          feedbackStyle: { marginTop: '18px', padding: '15px 16px', borderRadius: '13px', background: correct ? '#ecfdf5' : '#fdeeee', color: correct ? '#15803d' : '#9a2626' },
          feedbackTitle: correct ? '✓ Correct!' : '✕ Not quite', explanation: curQ.explanation,
          nextLabel: isLast ? 'Finish & mark complete' : 'Next question', onNext: () => this.nextQuestion(openL.id, questions.length),
        } : null,
        viewerHasNext, viewerAtTip: viewerAtTip && !viewerHasNext,
        nextLessonTitle: viewerHasNext ? gl[idx + 1].title : '',
        completeBtnStyle: { fontFamily: 'inherit', fontWeight: 500, fontSize: '14px', padding: '10px 18px', borderRadius: '11px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px', background: done ? '#ecfdf5' : t.accent, color: done ? '#15803d' : '#fff', border: done ? '1px solid #a7f3d0' : 'none' },
        completeBtnLabel: done ? '✓ Completed' : 'Mark as complete',
        regenerating: s.regenId === openL.id,
      };
    }

    // ---- lesson conversation panel ----
    let panelVals = { panelOpen: false, askBtn: false, picker: false, panel: { inThread: false, inList: false, list: [], messages: [] } };
    if (openL) {
      const lid = openL.id;
      const list = s.threads[lid] || this.seedThreads();
      const activeTh = list.find(x => x.id === s.activeThreadId);
      const activeIsGen = activeTh && activeTh.id === 'general';
      const mkIcon = (isGen) => ({ width: '26px', height: '26px', borderRadius: '8px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 700, background: isGen ? t.accent + '18' : t.hl, color: isGen ? t.accent : t.body });
      const panelList = list.map(th => {
        const isGen = th.id === 'general';
        const last = th.messages[th.messages.length - 1];
        return {
          id: th.id, icon: isGen ? '#' : '“', iconStyle: mkIcon(isGen), canDelete: !isGen,
          title: isGen ? 'About this lesson' : ('“' + this.trunc(th.quote, 38) + '”'),
          preview: th.messages.length ? ((last.role === 'user' ? 'You: ' : '') + this.trunc(last.text, 42)) : (isGen ? 'General questions about the lesson' : 'No replies yet — open to ask'),
          onOpen: () => this.openThread(th.id),
          onDelete: (e) => { e.stopPropagation(); this.deleteThread(th.id); },
          rowStyle: { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '11px', cursor: 'pointer', marginBottom: '2px', transition: 'background 0.15s' },
        };
      });
      const mkBubble = (role) => role === 'user'
        ? { maxWidth: '88%', background: t.accent, color: '#fff', borderRadius: '14px 14px 4px 14px', padding: '9px 13px', fontSize: '13.5px', lineHeight: '1.5' }
        : { maxWidth: '90%', background: '#fff', border: '1px solid ' + t.border, color: t.body, borderRadius: '14px 14px 14px 4px', padding: '10px 13px', fontSize: '13.5px', lineHeight: '1.55', whiteSpace: 'pre-wrap' };
      const msgs = activeTh ? activeTh.messages.map(m => ({
        text: m.text,
        wrapStyle: { display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' },
        bubbleStyle: mkBubble(m.role),
      })) : [];
      if (activeTh && s.threadBusy === activeTh.id) {
        msgs.push({ text: 'Thinking…', wrapStyle: { display: 'flex', justifyContent: 'flex-start', opacity: 0.6 }, bubbleStyle: mkBubble('ai') });
      }
      const count = list.filter(th => th.quote || th.messages.length > 0).length;
      panelVals = {
        panelOpen: s.panelOpen,
        panel: {
          inThread: s.panelOpen && !!activeTh,
          inList: s.panelOpen && !activeTh,
          list: panelList,
          messages: msgs,
          empty: !!activeTh && msgs.length === 0,
          emptyScope: activeIsGen ? ' lesson' : ' passage',
          title: activeTh ? (activeIsGen ? 'About this lesson' : 'Thread') : '',
          quote: activeTh && !activeIsGen ? activeTh.quote : '',
          canDelete: !!activeTh && !activeIsGen,
          onBack: this.backToList,
          onDelete: activeTh ? () => this.deleteThread(activeTh.id) : (() => {}),
        },
        draft: s.draft, onDraft: this.onDraft, onDraftKey: this.onDraftKey, onSendThread: this.onSendThread,
        draftBtnBg: s.draft.trim() && !s.threadBusy ? t.accent : '#cdcac4',
        onTogglePanel: this.onTogglePanel,
        discussLabel: 'Discuss', discussCount: count, hasThreads: count > 0,
        discussBadgeStyle: { fontSize: '10.5px', fontWeight: 700, background: t.accent, color: '#fff', borderRadius: '999px', padding: '0 6px', marginLeft: '1px' },
        discussBtnStyle: { border: '1px solid ' + (s.panelOpen ? t.accent : t.border), background: s.panelOpen ? t.accent + '12' : '#fff', color: s.panelOpen ? t.accent : t.sub, borderRadius: '9px', padding: '6px 11px', fontFamily: 'inherit', fontSize: '12.5px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 },
        askBtn: !!s.askBtn,
        askBtnStyle: s.askBtn ? { position: 'fixed', top: s.askBtn.top + 'px', left: s.askBtn.left + 'px', zIndex: 80, display: 'inline-flex', alignItems: 'center', gap: '6px', background: t.accent, color: '#fff', border: 'none', borderRadius: '10px', padding: '7px 12px', fontFamily: 'inherit', fontSize: '13px', fontWeight: 500, cursor: 'pointer', boxShadow: '0 8px 20px -6px rgba(0,0,0,0.4)', animation: 'tuiScaleIn 0.12s ease' } : {},
        onAsk: this.onAsk, onAskDown: this.onAskDown, onLessonScroll: this.onLessonScroll,
        picker: !!s.picker,
        pickerStyle: s.picker ? { position: 'fixed', top: s.picker.top + 'px', left: s.picker.left + 'px', zIndex: 72, background: '#fff', border: '1px solid ' + t.border, borderRadius: '12px', padding: '6px', boxShadow: '0 14px 40px -12px rgba(0,0,0,0.35)', minWidth: '204px', maxWidth: '260px' } : {},
        pickerItems: s.picker ? s.picker.ids.map(id => { const th = list.find(x => x.id === id); return { label: th ? '“' + this.trunc(th.quote, 30) + '”' : 'Thread', onOpen: () => this.openThread(id), style: { display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'transparent', borderRadius: '8px', padding: '9px 10px', fontFamily: 'inherit', fontSize: '13px', color: t.ink, cursor: 'pointer' } }; }) : [],
        onClosePicker: this.onClosePicker, stop: this.stop,
      };
    }

    // ---- settings / agent ----
    const ag = s.agent, connected = ag.connected;
    const modelLabel = (MODELS.find(m => m.id === ag.model) || MODELS[0]).label;
    const agentPill = connected
      ? { label: 'Connected', color: '#15803d', bg: '#ecfdf5', dot: '#16a34a' }
      : { label: 'Offline', color: t.sub, bg: t.railHover, dot: '#b3afa8' };
    const PROVIDERS = [
      { id: 'cli', title: 'Claude Code', desc: 'Uses your Claude Code sign-in — no API key', badge: 'C', soon: false },
      { id: 'api', title: 'Anthropic API', desc: 'Claude via an Anthropic API key', badge: 'A', soon: false },
      { id: 'copilot', title: 'GitHub Copilot', desc: 'Use your Copilot subscription', badge: 'GH', soon: true },
      { id: 'cursor', title: 'Cursor Agent', desc: 'Connect the Cursor agent', badge: 'Cu', soon: true },
    ];
    const agentProviders = PROVIDERS.map(p => {
      const on = !p.soon && ag.method === p.id;
      return {
        id: p.id, title: p.title, desc: p.desc, badge: p.badge,
        tag: p.soon ? 'Coming soon' : 'Available',
        onPick: p.soon ? (() => {}) : (() => this.onAgentMethod(p.id)),
        style: { display: 'flex', alignItems: 'center', gap: '12px', width: '100%', textAlign: 'left', border: '1.5px solid ' + (on ? t.accent : t.border), background: on ? t.accent + '10' : '#fff', color: p.soon ? t.faint : t.ink, borderRadius: '12px', padding: '11px 13px', fontFamily: 'inherit', cursor: p.soon ? 'default' : 'pointer', opacity: p.soon ? 0.7 : 1, transition: 'all 0.15s' },
        hover: (p.soon || on) ? '' : 'border-color: ' + t.accent + ';',
        iconStyle: { width: '30px', height: '30px', borderRadius: '9px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, background: on ? t.accent : t.railHover, color: on ? '#fff' : t.sub },
        tagStyle: { flexShrink: 0, fontSize: '10.5px', fontWeight: 600, letterSpacing: '0.03em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: '999px', color: p.soon ? t.faint : '#15803d', background: p.soon ? t.railHover : '#ecfdf5' },
      };
    });
    const modelOptions = MODELS.map(m => {
      const on = ag.model === m.id;
      return { id: m.id, label: m.label, onPick: () => this.onModel(m.id),
        style: { border: '1.5px solid ' + (on ? t.accent : t.border), background: on ? t.accent + '10' : '#fff', color: on ? t.accent : t.sub, borderRadius: '999px', padding: '7px 14px', fontFamily: 'inherit', fontSize: '13px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s' },
        hover: on ? '' : 'border-color: ' + t.accent + ';' };
    });
    const isCli = ag.method === 'cli';
    const settingsVals = {
      settingsOpen: s.settingsOpen, onOpenSettings: this.onOpenSettings, onCloseSettings: this.onCloseSettings,
      agentPill, agentProviders, modelOptions,
      methodIsCli: isCli, methodIsApi: !isCli,
      onCopyCmd: this.onCopyCmd,
      agentApiKey: ag.apiKey, onApiKey: this.onApiKey,
      apiKeyPlaceholder: ag.hasApiKey ? '••••••••  (key saved — enter a new one to replace)' : 'sk-ant-…  (optional if set via environment)',
      agentConnected: connected, agentDisconnected: !connected,
      onConnect: this.onConnect, onDisconnect: this.onDisconnect,
      connectLabel: ag.connecting ? 'Connecting…' : (isCli ? 'Connect Claude Code' : 'Connect'),
      connectBtnBg: ag.connecting ? '#cdcac4' : t.accent,
      agentHint: ag.error ? ag.error : (connected ? ('Teach is generating with ' + modelLabel + '.') : 'Connect to start generating lessons.'),
      agentHintColor: ag.error ? '#dc2626' : t.faint,
      agentCard: connected
        ? { title: (isCli ? 'Claude Code · ' : 'Anthropic API · ') + modelLabel, subtitle: isCli ? 'Using your local Claude Code sign-in' : (ag.hasApiKey ? 'Using your saved API key' : 'Using environment credentials'), border: '#a7f3d0', bg: '#ecfdf5', iconBg: '#16a34a', iconColor: '#fff' }
        : { title: 'No agent connected', subtitle: 'Teach needs Claude to write lessons.', border: t.border, bg: '#fff', iconBg: t.railHover, iconColor: t.sub },
    };

    return {
      t,
      showApp: true,
      landingInput: s.landingInput, placeholder: this.placeholders[s.phIndex], inputBorder: s.focused ? t.accent : t.border,
      onLandingInput: this.onLandingInput, onLandingKey: this.onLandingKey, onFocus: this.onFocus, onBlur: this.onBlur, onStart: this.onStart, examples,
      sidebarVisible: mobile ? s.mobileNav : true,
      sidebarAnim: 'tuiSlideLeft ' + (mobile ? '0.28s' : '0.4s') + ' cubic-bezier(0.22,1,0.36,1)',
      chats, search: s.search, onSearch: this.onSearch, onNewCourse: this.onNewCourse, onHome: this.onHome,
      mobileCloseDisplay: mobile ? 'flex' : 'none', onCloseMobile: this.onCloseMobile,
      activeCourse: { title: active ? active.title : '' },
      thread, streaming: isStreaming, genError,
      streamingLabel: gl.length === 0 ? 'Writing your first lesson…' : 'Writing your lesson…',
      showSuggestions, suggestions, suggestIntro,
      composer: s.composer, onComposer: this.onComposer, onComposerKey: this.onComposerKey, onComposerSend: this.onComposerSend,
      composerPlaceholder: 'Ask for anything — I’ll write a lesson on it…',
      composerBtnBg: s.composer.trim() && !s.streaming ? t.accent : '#cdcac4',
      hamburgerDisplay: mobile ? 'flex' : 'none', onOpenMobile: this.onOpenMobile, mobileScrim: mobile && s.mobileNav,
      viewerOpen: !!openL, showChat: !!active && !openL, isNewChat: !active && !openL,
      onCloseViewer: this.onCloseViewer, stop: this.stop, onRegenerate: this.onRegenerate,
      onToggleComplete: this.onToggleComplete, onNextLesson: this.onNextLesson,
      ...vm,
      ...panelVals,
      ...settingsVals,
    };
  }

  // ============ render ============

  renderSidebar(v) {
    const t = v.t;
    return (
      <aside style={{ width: 272, flexShrink: 0, height: '100%', background: t.sidebar, borderRight: `1px solid ${t.border}`, display: 'flex', flexDirection: 'column', animation: v.sidebarAnim }}>
        <div style={{ padding: '16px 14px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }} onClick={v.onHome}>
            <div style={{ width: 24, height: 24, borderRadius: 7, background: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>T</span></div>
            <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em' }}>Teach</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <H as="button" onClick={v.onNewCourse} title="New course" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: t.sub, padding: 7, borderRadius: 8, display: 'flex' }} hover={t.railHoverCss}>
              <Svg size={17}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></Svg>
            </H>
            <H as="button" onClick={v.onCloseMobile} style={{ display: v.mobileCloseDisplay, border: 'none', background: 'transparent', cursor: 'pointer', color: t.faint, padding: 7, borderRadius: 8 }} hover={t.railHoverCss}>
              <IcnX size={17} />
            </H>
          </div>
        </div>

        <div style={{ padding: '4px 12px 12px' }}>
          <div style={{ position: 'relative' }}>
            <Svg size={14} stroke={t.faint} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></Svg>
            <input value={v.search} onChange={v.onSearch} placeholder="Search" style={{ width: '100%', border: `1px solid ${t.border}`, background: t.inputBg, borderRadius: 10, padding: '8px 10px 8px 31px', fontFamily: 'inherit', fontSize: 13, color: t.ink, outline: 'none' }} />
          </div>
        </div>

        <div style={{ padding: '2px 18px 6px', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: t.faint }}>Chats</div>
        <div className="tui-scroll" style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px' }}>
          {v.chats.length === 0 && (
            <div style={{ fontSize: '12.5px', color: t.faint, padding: '10px 10px', lineHeight: 1.55 }}>No courses yet — ask to learn something and it appears here.</div>
          )}
          {v.chats.map(c => (
            <div key={c.id} style={{ marginBottom: 2 }}>
              <H onClick={c.onSelect} style={c.rowStyle} hover={t.railHoverCss}>
                <button onClick={c.onToggle} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 2, display: 'flex', color: t.faint, flexShrink: 0 }}>
                  <span style={c.chevStyle}><Svg size={12} sw={2.4}><path d="m9 18 6-6-6-6" /></Svg></span>
                </button>
                <span style={{ flex: 1, minWidth: 0, fontSize: '13.5px', fontWeight: 500, color: t.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.title}</span>
              </H>
              {c.expanded && (
                <div style={{ margin: '2px 0 4px 15px', paddingLeft: 13, borderLeft: `1.5px solid ${t.border}`, animation: 'tuiExpand 0.2s ease' }}>
                  {c.lessons.map(l => (
                    <H key={l.id} onClick={l.onOpen} style={l.rowStyle} hover={t.railHoverCss}>
                      <span style={l.dotStyle}>{l.dot}</span>
                      <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.title}</span>
                    </H>
                  ))}
                  <div style={{ fontSize: '11.5px', color: t.faint, padding: '5px 9px 3px' }}>{c.moreLabel}</div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{ borderTop: `1px solid ${t.border}`, padding: '8px 10px' }}>
          <H onClick={v.onOpenSettings} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 10, cursor: 'pointer' }} hover={t.railHoverCss}>
            <Svg size={17} stroke={t.sub} style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="3" /><path d={GEAR_PATH} /></Svg>
            <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: t.ink }}>Settings</div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '11.5px', fontWeight: 500, color: v.agentPill.color, background: v.agentPill.bg, padding: '3px 8px', borderRadius: 999 }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: v.agentPill.dot }} />{v.agentPill.label}
            </span>
          </H>
        </div>
      </aside>
    );
  }

  renderLanding(v) {
    const t = v.t;
    return (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: 56, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 11, padding: '0 22px' }}>
          <button onClick={v.onOpenMobile} style={{ display: v.hamburgerDisplay, border: 'none', background: 'transparent', cursor: 'pointer', color: t.sub, padding: 6, marginLeft: -6 }}><IcnMenu /></button>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 24px 90px', background: t.landingBg }}>
          <div style={{ width: '100%', maxWidth: 620, display: 'flex', flexDirection: 'column', alignItems: 'center', animation: 'tuiFadeUp 0.5s cubic-bezier(0.22,1,0.36,1)' }}>
            <h1 style={{ fontSize: 44, lineHeight: 1.06, fontWeight: 500, letterSpacing: '-0.03em', textAlign: 'center', margin: '0 0 32px', color: t.ink }}>What would you like to learn?</h1>
            <div style={{ width: '100%', position: 'relative', background: '#fff', border: `1.5px solid ${v.inputBorder}`, borderRadius: 20, boxShadow: '0 14px 40px -20px rgba(28,27,25,0.24), 0 2px 8px rgba(0,0,0,0.03)', transition: 'border-color 0.2s' }}>
              <textarea value={v.landingInput} onChange={v.onLandingInput} onKeyDown={v.onLandingKey} onFocus={v.onFocus} onBlur={v.onBlur} rows={1} placeholder={v.placeholder} style={{ width: '100%', border: 'none', outline: 'none', resize: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 18, lineHeight: 1.5, color: t.ink, padding: '19px 58px 19px 22px', maxHeight: 180, display: 'block' }} />
              <H as="button" onClick={v.onStart} title="Start learning" style={{ position: 'absolute', right: 10, bottom: 10, width: 40, height: 40, borderRadius: 12, border: 'none', background: t.accent, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform 0.15s' }} hover="transform: scale(1.06);">
                <IcnArrow size={18} />
              </H>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 18 }}>
              {v.examples.map(ex => (
                <H as="button" key={ex.label} onClick={ex.onPick} style={ex.style} hover={ex.hover}>{ex.label}</H>
              ))}
            </div>
            <div style={{ fontSize: 12, color: t.faint, marginTop: 26 }}>Every course is written on the fly with the <span style={{ fontFamily: "'Geist Mono', monospace" }}>/teach</span> skill.</div>
          </div>
        </div>
      </div>
    );
  }

  renderChat(v) {
    const t = v.t;
    return (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: 56, flexShrink: 0, borderBottom: `1px solid ${t.borderSoft}`, display: 'flex', alignItems: 'center', gap: 11, padding: '0 22px', background: t.page }}>
          <button onClick={v.onOpenMobile} style={{ display: v.hamburgerDisplay, border: 'none', background: 'transparent', cursor: 'pointer', color: t.sub, padding: 6, marginLeft: -6 }}><IcnMenu /></button>
          <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.activeCourse.title}</div>
        </div>

        <div className="tui-scroll" style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ maxWidth: 720, margin: '0 auto', padding: `${t.threadPadTop} 24px 20px` }}>
            {v.thread.map((m, i) => {
              if (m.isUser) return (
                <div key={i} style={m.wrapStyle}>
                  <div style={{ maxWidth: '82%', background: t.accent, color: '#fff', padding: '12px 15px', borderRadius: '17px 17px 5px 17px', fontSize: 15, lineHeight: 1.5, display: 'flex', alignItems: 'baseline', gap: 8, boxShadow: t.userShadow }}>
                    {m.first && <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: '12.5px', background: 'rgba(255,255,255,0.22)', padding: '2px 7px', borderRadius: 6, whiteSpace: 'nowrap' }}>/teach</span>}
                    <span>{m.text}</span>
                  </div>
                </div>
              );
              if (m.isAi) return (
                <div key={i} style={m.wrapStyle}>
                  <div style={{ width: 29, height: 29, borderRadius: 9, background: t.accent, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>T</span></div>
                  <div style={{ flex: 1, paddingTop: 3, fontSize: 15, lineHeight: 1.68, color: t.body }}>{m.text}</div>
                </div>
              );
              if (m.isLesson) return (
                <H key={i} onClick={m.onOpen} style={m.cardStyle} hover={m.cardHover}>
                  <div style={m.badgeStyle}>{m.badge}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 15, fontWeight: 600, color: t.ink, letterSpacing: '-0.01em' }}>{m.title}</span>
                      <span style={m.typeTagStyle}>{m.typeTag}</span>
                    </div>
                    <div style={{ fontSize: 13, color: t.sub, marginTop: 3, lineHeight: 1.45 }}>{m.subtitle}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 13, flexShrink: 0 }}>
                    <span style={m.ctaStyle}>{m.cta} <IcnArrow size={13} /></span>
                  </div>
                </H>
              );
              return null;
            })}

            {v.streaming && (
              <div style={{ display: 'flex', gap: 13, marginTop: 4, marginBottom: 10 }}>
                <div style={{ width: 29, height: 29, borderRadius: 9, background: t.accent, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>T</span></div>
                <div style={{ flex: 1, background: '#fff', border: `1px solid ${t.border}`, borderRadius: 15, padding: '15px 17px', display: 'flex', alignItems: 'center', gap: 11, animation: 'tuiCardIn 0.4s ease' }}>
                  <div style={{ width: 15, height: 15, border: `2px solid ${t.accentRing}`, borderTopColor: t.accent, borderRadius: 999, animation: 'tuiSpin 0.7s linear infinite', flexShrink: 0 }} />
                  <span style={{ fontSize: 14, fontWeight: 500, color: t.sub }}>{v.streamingLabel}</span>
                </div>
              </div>
            )}

            {!v.streaming && v.genError && (
              <div style={{ display: 'flex', gap: 13, marginTop: 4, marginBottom: 10, animation: 'tuiFadeUp 0.4s ease' }}>
                <div style={{ width: 29, height: 29, borderRadius: 9, background: t.accent, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>T</span></div>
                <div style={{ flex: 1, background: '#fdeeee', border: '1px solid #f0b8b8', borderRadius: 15, padding: '14px 17px' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#9a2626', marginBottom: 3 }}>Couldn't write the lesson</div>
                  <div style={{ fontSize: '13.5px', lineHeight: 1.55, color: '#9a2626', opacity: 0.9 }}>{v.genError}</div>
                  <button onClick={v.onOpenSettings} style={{ marginTop: 10, border: '1px solid #f0b8b8', background: '#fff', color: '#9a2626', fontFamily: 'inherit', fontSize: '12.5px', fontWeight: 500, padding: '6px 12px', borderRadius: 9, cursor: 'pointer' }}>Open Settings</button>
                </div>
              </div>
            )}

            {v.showSuggestions && (
              <div style={{ display: 'flex', gap: 13, marginTop: 4, animation: 'tuiFadeUp 0.5s ease' }}>
                <div style={{ width: 29, height: 29, borderRadius: 9, background: t.accent, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>T</span></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, lineHeight: 1.6, color: t.body, marginBottom: 12 }}>{v.suggestIntro}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {v.suggestions.map((sg, i) => (
                      <H as="button" key={i} onClick={sg.onPick} style={sg.style} hover={sg.hover}>
                        <span style={sg.iconStyle}>{sg.icon}</span>
                        <span style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>{sg.label}</span>
                        <span style={sg.tagStyle}>{sg.tag}</span>
                      </H>
                    ))}
                  </div>
                  <div style={{ fontSize: '12.5px', color: t.faint, marginTop: 10 }}>Or just type below — ask anything and I'll teach it.</div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div style={{ flexShrink: 0, borderTop: `1px solid ${t.borderSoft}`, padding: '14px 24px 18px', background: t.page }}>
          <div style={{ maxWidth: 720, margin: '0 auto', position: 'relative', background: '#fff', border: `1.5px solid ${t.border}`, borderRadius: 16, boxShadow: '0 2px 10px -6px rgba(0,0,0,0.1)' }}>
            <textarea value={v.composer} onChange={v.onComposer} onKeyDown={v.onComposerKey} rows={1} placeholder={v.composerPlaceholder} style={{ width: '100%', border: 'none', outline: 'none', resize: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 15, lineHeight: 1.5, color: t.ink, padding: '15px 54px 15px 18px', maxHeight: 140, display: 'block' }} />
            <button onClick={v.onComposerSend} style={{ position: 'absolute', right: 9, bottom: 9, width: 36, height: 36, borderRadius: 11, border: 'none', background: v.composerBtnBg, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><IcnArrow size={16} /></button>
          </div>
        </div>
      </div>
    );
  }

  renderViewer(v) {
    const t = v.t;
    return (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#fff', animation: 'tuiFadeUp 0.34s cubic-bezier(0.22,1,0.36,1)' }}>
        <div style={{ height: 56, flexShrink: 0, borderBottom: `1px solid ${t.borderSoft}`, display: 'flex', alignItems: 'center', gap: 10, padding: '0 18px', background: t.page }}>
          <H as="button" onClick={v.onCloseViewer} title="Back to chat" style={{ border: `1px solid ${t.border}`, background: '#fff', cursor: 'pointer', color: t.sub, padding: '6px 12px 6px 8px', borderRadius: 9, display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'inherit', fontSize: '12.5px', fontWeight: 500, flexShrink: 0 }} hover={t.accentBorderCss}>
            <Svg size={16}><path d="M19 12H5M12 19l-7-7 7-7" /></Svg>Chat
          </H>
          <span style={{ fontSize: 13, color: t.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.activeCourse.title}</span>
          <span style={{ color: t.border }}>/</span>
          <span style={{ fontSize: 13, fontWeight: 500, color: t.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{v.activeLesson.title}</span>
          <H as="button" onClick={v.onRegenerate} title="Regenerate lesson" style={{ border: `1px solid ${t.border}`, background: '#fff', borderRadius: 9, padding: '6px 11px', fontFamily: 'inherit', fontSize: '12.5px', color: v.regenerating ? t.faint : t.sub, cursor: v.regenerating ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }} hover={v.regenerating ? '' : t.accentBorderCss}>
            <Svg size={13} style={v.regenerating ? { animation: 'tuiSpin 0.9s linear infinite' } : undefined}><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /></Svg>{v.regenerating ? 'Regenerating…' : 'Regenerate'}
          </H>
          <button onClick={v.onTogglePanel} title="Discuss this lesson" style={v.discussBtnStyle}>
            <IcnChat />{v.discussLabel}{v.hasThreads && <span style={v.discussBadgeStyle}>{v.discussCount}</span>}
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          <div className="tui-scroll" style={{ flex: 1, overflowY: 'auto' }} onScroll={v.onLessonScroll}>
            <div style={{ maxWidth: 680, margin: '0 auto', padding: '46px 40px 90px' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <span style={v.activeLesson.badgeStyleLg}>{v.activeLesson.badge}</span>
                <span style={v.activeLesson.typeTagStyle}>{v.activeLesson.typeTag}</span>
                {v.activeLesson.readTime && <span style={{ fontSize: 12, color: t.faint }}>{v.activeLesson.readTime}</span>}
              </div>
              <h1 style={{ fontSize: 40, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.08, margin: '0 0 14px', color: t.ink }}>{v.activeLesson.title}</h1>
              <div style={{ paddingBottom: 26, borderBottom: `1px solid ${t.borderSoft}` }} />

              {v.lessonProse}

              {v.hasQuiz && (
                <div style={{ marginTop: 34, background: t.quizBg, border: `1px solid ${t.quizBorder}`, borderRadius: 18, padding: '24px 26px' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: t.accent, marginBottom: 10 }}>Quick check · {v.quiz.progress}</div>
                  <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: '-0.01em', margin: '0 0 18px', color: t.ink, lineHeight: 1.4 }}>{v.quiz.question}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {v.quiz.options.map((o, i) => (
                      <H as="button" key={i} onClick={o.onPick} style={o.style} hover={o.hover}>
                        <span style={o.markStyle}>{o.mark}</span>
                        <span style={{ flex: 1 }}>{o.text}</span>
                      </H>
                    ))}
                  </div>
                  {v.quiz.revealed && (
                    <>
                      <div style={v.quiz.feedbackStyle}>
                        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{v.quiz.feedbackTitle}</div>
                        <div style={{ fontSize: '13.5px', lineHeight: 1.6, opacity: 0.92 }}>{v.quiz.explanation}</div>
                      </div>
                      <button onClick={v.quiz.onNext} style={{ marginTop: 16, border: 'none', background: t.accent, color: '#fff', fontFamily: 'inherit', fontWeight: 500, fontSize: 14, padding: '10px 18px', borderRadius: 11, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}>{v.quiz.nextLabel} <IcnArrow size={14} /></button>
                    </>
                  )}
                </div>
              )}

              <div style={{ marginTop: 40, paddingTop: 26, borderTop: `1px solid ${t.borderSoft}`, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <button onClick={v.onToggleComplete} style={v.completeBtnStyle}>{v.completeBtnLabel}</button>
                <div style={{ flex: 1 }} />
                {v.viewerHasNext && (
                  <H as="button" onClick={v.onNextLesson} style={{ border: `1px solid ${t.border}`, background: '#fff', color: t.ink, fontFamily: 'inherit', fontWeight: 500, fontSize: 14, padding: '10px 16px', borderRadius: 11, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }} hover={t.accentBorderCss}>
                    Next: {v.nextLessonTitle} <IcnArrow size={14} sw={2.2} />
                  </H>
                )}
                {v.viewerAtTip && (
                  <H as="button" onClick={v.onCloseViewer} style={{ border: `1px solid ${t.border}`, background: '#fff', color: t.sub, fontFamily: 'inherit', fontWeight: 500, fontSize: 14, padding: '10px 16px', borderRadius: 11, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }} hover={t.accentBorderCss}>
                    Choose what's next in chat <IcnArrow size={14} sw={2.2} />
                  </H>
                )}
              </div>
            </div>
          </div>

          {v.panelOpen && this.renderPanel(v)}
        </div>
      </div>
    );
  }

  renderPanel(v) {
    const t = v.t;
    return (
      <aside style={{ width: 340, flexShrink: 0, borderLeft: `1px solid ${t.borderSoft}`, background: t.page, display: 'flex', flexDirection: 'column', animation: 'tuiSlideLeft 0.28s ease' }}>
        {v.panel.inThread && (
          <>
            <div style={{ height: 52, flexShrink: 0, borderBottom: `1px solid ${t.borderSoft}`, display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px' }}>
              <H as="button" onClick={v.panel.onBack} title="All conversations" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: t.sub, padding: 6, borderRadius: 8, display: 'flex' }} hover={t.railHoverCss}>
                <Svg size={17}><path d="M15 18l-6-6 6-6" /></Svg>
              </H>
              <div style={{ flex: 1, minWidth: 0, fontSize: '13.5px', fontWeight: 600, color: t.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.panel.title}</div>
              {v.panel.canDelete && (
                <H as="button" onClick={v.panel.onDelete} title="Delete thread" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: t.faint, padding: 6, borderRadius: 8, display: 'flex' }} hover="color: #dc2626;">
                  <IcnTrash />
                </H>
              )}
              <H as="button" onClick={v.onTogglePanel} title="Close panel" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: t.faint, padding: 6, borderRadius: 8, display: 'flex' }} hover={t.railHoverCss}>
                <IcnX size={16} />
              </H>
            </div>
            {v.panel.quote && (
              <div style={{ padding: '12px 14px', borderBottom: `1px solid ${t.borderSoft}` }}>
                <div style={{ fontSize: '10.5px', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: t.faint, marginBottom: 5 }}>Discussing</div>
                <div style={{ fontSize: 13, lineHeight: 1.5, color: t.body, borderLeft: `2px solid ${t.accent}`, paddingLeft: 10 }}>{v.panel.quote}</div>
              </div>
            )}
            <div className="tui-scroll" style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 11 }}>
              {v.panel.messages.map((mm, i) => (
                <div key={i} style={mm.wrapStyle}><div style={mm.bubbleStyle}>{mm.text}</div></div>
              ))}
              {v.panel.empty && (
                <div style={{ fontSize: 13, color: t.faint, lineHeight: 1.55, textAlign: 'center', padding: '18px 8px' }}>Ask anything about this{v.panel.emptyScope} — I'll answer with the lesson in mind.</div>
              )}
            </div>
            <div style={{ flexShrink: 0, padding: '10px 12px 12px', borderTop: `1px solid ${t.borderSoft}` }}>
              <div style={{ position: 'relative', background: '#fff', border: `1.5px solid ${t.border}`, borderRadius: 13 }}>
                <textarea value={v.draft} onChange={v.onDraft} onKeyDown={v.onDraftKey} rows={1} placeholder="Ask a question…" style={{ width: '100%', border: 'none', outline: 'none', resize: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 14, lineHeight: 1.5, color: t.ink, padding: '11px 44px 11px 14px', maxHeight: 120, display: 'block' }} />
                <button onClick={v.onSendThread} style={{ position: 'absolute', right: 7, bottom: 7, width: 30, height: 30, borderRadius: 9, border: 'none', background: v.draftBtnBg, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><IcnArrow size={14} /></button>
              </div>
            </div>
          </>
        )}

        {v.panel.inList && (
          <>
            <div style={{ height: 52, flexShrink: 0, borderBottom: `1px solid ${t.borderSoft}`, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px 0 16px' }}>
              <div style={{ flex: 1, fontSize: '13.5px', fontWeight: 600, color: t.ink }}>Conversations</div>
              <H as="button" onClick={v.onTogglePanel} title="Close panel" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: t.faint, padding: 6, borderRadius: 8, display: 'flex' }} hover={t.railHoverCss}>
                <IcnX size={16} />
              </H>
            </div>
            <div className="tui-scroll" style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
              {v.panel.list.map(th => (
                <H key={th.id} onClick={th.onOpen} style={th.rowStyle} hover={t.railHoverCss}>
                  <div style={th.iconStyle}>{th.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: t.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{th.title}</div>
                    <div style={{ fontSize: 12, color: t.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>{th.preview}</div>
                  </div>
                  {th.canDelete && (
                    <H as="button" onClick={th.onDelete} title="Delete thread" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: t.faint, padding: 5, borderRadius: 7, display: 'flex', flexShrink: 0 }} hover="color: #dc2626;">
                      <IcnTrash />
                    </H>
                  )}
                </H>
              ))}
              <div style={{ fontSize: 12, color: t.faint, lineHeight: 1.55, padding: '12px 10px', borderTop: `1px solid ${t.borderSoft}`, marginTop: 8 }}>Select any text in the lesson and tap the <span style={{ color: t.accent, fontWeight: 600 }}>Ask</span> bubble to open a thread about that passage.</div>
            </div>
          </>
        )}
      </aside>
    );
  }

  renderSettings(v) {
    const t = v.t;
    return (
      <div onClick={v.onCloseSettings} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(28,27,25,0.42)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, animation: 'tuiFadeUp 0.18s ease' }}>
        <div onClick={v.stop} className="tui-scroll" style={{ width: 'min(560px, 100%)', maxHeight: '88vh', overflowY: 'auto', background: t.page, border: `1px solid ${t.border}`, borderRadius: 20, boxShadow: '0 30px 80px -20px rgba(0,0,0,0.45)', animation: 'tuiCardIn 0.24s cubic-bezier(0.22,1,0.36,1)' }}>
          <div style={{ position: 'sticky', top: 0, background: t.page, display: 'flex', alignItems: 'center', gap: 10, padding: '20px 22px 14px', borderBottom: `1px solid ${t.borderSoft}`, zIndex: 1 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em', color: t.ink }}>Settings</div>
              <div style={{ fontSize: '12.5px', color: t.faint, marginTop: 1 }}>Connect an agent so Teach can write your lessons.</div>
            </div>
            <H as="button" onClick={v.onCloseSettings} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: t.faint, padding: 7, borderRadius: 9, display: 'flex' }} hover={t.railHoverCss}>
              <IcnX size={18} />
            </H>
          </div>

          <div style={{ padding: '20px 22px 24px', display: 'flex', flexDirection: 'column', gap: 22 }}>
            <div style={{ border: `1px solid ${v.agentCard.border}`, background: v.agentCard.bg, borderRadius: 14, padding: '16px 17px', display: 'flex', alignItems: 'center', gap: 13 }}>
              <div style={{ width: 38, height: 38, borderRadius: 11, background: v.agentCard.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Svg size={20} stroke={v.agentCard.iconColor}><path d="M12 2a3 3 0 0 0-3 3v1H7a2 2 0 0 0-2 2v3a4 4 0 0 0 4 4h6a4 4 0 0 0 4-4V8a2 2 0 0 0-2-2h-2V5a3 3 0 0 0-3-3z" /><path d="M9 20h6" /><path d="M12 16v4" /></Svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '14.5px', fontWeight: 600, color: t.ink }}>{v.agentCard.title}</div>
                <div style={{ fontSize: '12.5px', color: t.sub, marginTop: 1 }}>{v.agentCard.subtitle}</div>
              </div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: v.agentPill.color, background: v.agentPill.bg, padding: '4px 10px', borderRadius: 999, flexShrink: 0 }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: v.agentPill.dot }} />{v.agentPill.label}
              </span>
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: t.faint, marginBottom: 9 }}>Agent</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {v.agentProviders.map(mm => (
                  <H as="button" key={mm.id} onClick={mm.onPick} style={mm.style} hover={mm.hover}>
                    <div style={mm.iconStyle}>{mm.badge}</div>
                    <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                      <div style={{ fontSize: '13.5px', fontWeight: 600 }}>{mm.title}</div>
                      <div style={{ fontSize: 12, opacity: 0.72, marginTop: 1 }}>{mm.desc}</div>
                    </div>
                    <span style={mm.tagStyle}>{mm.tag}</span>
                  </H>
                ))}
              </div>
            </div>

            {v.methodIsCli && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 13, color: t.body, lineHeight: 1.55 }}>Teach talks to your local Claude Code and uses the account you're already signed in with — no API key needed. If you don't have it yet, install and sign in once:</div>
                <div style={{ position: 'relative', background: '#1c1b19', borderRadius: 12, padding: '14px 44px 14px 16px', fontFamily: "'Geist Mono', monospace", fontSize: 13, color: '#e9e7e2', overflowX: 'auto', whiteSpace: 'nowrap' }}>
                  {'npm install -g @anthropic-ai/claude-code && claude'}
                  <H as="button" onClick={v.onCopyCmd} title="Copy" style={{ position: 'absolute', right: 8, top: 8, border: 'none', background: 'rgba(255,255,255,0.1)', color: '#e9e7e2', borderRadius: 8, padding: 6, cursor: 'pointer', display: 'flex' }} hover="background: rgba(255,255,255,0.2);">
                    <Svg size={14}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></Svg>
                  </H>
                </div>
                <div style={{ fontSize: '12.5px', color: t.faint, lineHeight: 1.5 }}>Then use <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 12 }}>/login</span> inside Claude Code. Connect runs a quick test message to confirm everything works.</div>
              </div>
            )}

            {v.methodIsApi && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 13, color: t.body, lineHeight: 1.55 }}>Paste an Anthropic API key, or leave it empty to use <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 12 }}>ANTHROPIC_API_KEY</span> / an <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 12 }}>ant auth login</span> profile from your environment.</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: `1.5px solid ${t.border}`, borderRadius: 11, padding: '4px 4px 4px 14px' }}>
                  <span style={{ fontSize: '12.5px', color: t.faint, flexShrink: 0 }}>API key</span>
                  <input type="password" value={v.agentApiKey} onChange={v.onApiKey} placeholder={v.apiKeyPlaceholder} style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontFamily: "'Geist Mono', monospace", fontSize: 13, color: t.ink, padding: '8px 0' }} />
                </div>
              </div>
            )}

            <div>
              <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: t.faint, marginBottom: 9 }}>Model</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {v.modelOptions.map(mo => (
                  <H as="button" key={mo.id} onClick={mo.onPick} style={mo.style} hover={mo.hover}>{mo.label}</H>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 4, borderTop: `1px solid ${t.borderSoft}` }}>
              <div style={{ flex: 1, fontSize: '12.5px', color: v.agentHintColor, lineHeight: 1.5 }}>{v.agentHint}</div>
              {v.agentConnected && (
                <H as="button" onClick={v.onDisconnect} style={{ border: `1px solid ${t.border}`, background: '#fff', color: t.sub, fontFamily: 'inherit', fontSize: '13.5px', fontWeight: 500, padding: '10px 16px', borderRadius: 11, cursor: 'pointer' }} hover="color: #dc2626; border-color: #f0b8b8;">Disconnect</H>
              )}
              {v.agentDisconnected && (
                <button onClick={v.onConnect} style={{ border: 'none', background: v.connectBtnBg, color: '#fff', fontFamily: 'inherit', fontSize: '13.5px', fontWeight: 600, padding: '10px 18px', borderRadius: 11, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}>{v.connectLabel}</button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  render() {
    const v = this.renderVals();
    const t = v.t;
    return (
      <div style={{ position: 'fixed', inset: 0, fontFamily: "'Geist', system-ui, sans-serif", background: t.page, color: t.ink, WebkitFontSmoothing: 'antialiased', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
          {v.sidebarVisible && this.renderSidebar(v)}
          <main style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', background: t.page }}>
            {v.isNewChat && this.renderLanding(v)}
            {v.showChat && this.renderChat(v)}
            {v.viewerOpen && (
              <>
                {this.renderViewer(v)}
                {v.askBtn && (
                  <button onMouseDown={v.onAskDown} onClick={v.onAsk} style={v.askBtnStyle}><IcnChat />Ask</button>
                )}
                {v.picker && (
                  <div onClick={v.onClosePicker} style={{ position: 'fixed', inset: 0, zIndex: 71 }}>
                    <div onClick={v.stop} style={v.pickerStyle}>
                      <div style={{ fontSize: '10.5px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: t.faint, padding: '4px 9px 6px' }}>Threads here</div>
                      {v.pickerItems.map((p, i) => (
                        <H as="button" key={i} onClick={p.onOpen} style={p.style} hover={t.railHoverCss}>{p.label}</H>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </main>
        </div>

        {v.mobileScrim && (
          <div onClick={v.onCloseMobile} style={{ position: 'absolute', inset: 0, background: 'rgba(28,27,25,0.32)', zIndex: 40, animation: 'tuiScaleIn 0.2s ease' }} />
        )}

        {v.settingsOpen && this.renderSettings(v)}
      </div>
    );
  }
}
