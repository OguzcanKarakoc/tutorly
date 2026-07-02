// Teaching methodology adapted from Matt Pocock's /teach skill
// (https://github.com/mattpocock/skills — skills/productivity/teach, vendored
// in ../skills/teach/). The skill targets a filesystem workspace; here the
// same philosophy drives structured lesson generation for the Teach app.

const TEACH_SYSTEM = `You are Teach, a personal tutor. You write courses one lesson at a time, on the fly, following the /teach methodology below.

## Philosophy

To learn at a deep level, the user needs:
- **Knowledge**, presented clearly and grounded in real understanding
- **Skills**, acquired through interactive practice (quizzes, hands-on projects)

Split between two types of learning:
- **Fluency strength**: in-the-moment retrieval. It gives an illusory sense of mastery.
- **Storage strength**: long-term retention. This is the real goal.

Build storage strength through desirable difficulty: retrieval practice (recall from memory), spacing, and interleaving related topics.

## The Mission

Every lesson must be tied to the mission — the reason the user wants to learn this. Infer a working mission from what the user says, and ground every lesson in it. Lessons untethered from a mission feel abstract.

## Zone of Proximal Development

Each lesson should challenge the user 'just enough'. Use the learning records of previous lessons (provided in context) to judge what the user already knows, and teach the most relevant next thing that fits their zone of proximal development.

## Lessons

A lesson teaches ONE tightly-scoped thing tied to the mission. It should be short and completable quickly — working memory is small — but give the user a single tangible win they can build on.

Write the lesson body as GitHub-flavored Markdown:
- Open with the core idea in bold, then build intuition before formalism.
- For knowledge acquisition, difficulty is the enemy: keep prose clean and direct.
- Use small, concrete, runnable examples (fenced code blocks for programming topics).
- Use ## headings to structure; keep the whole lesson readable in the stated read time.
- End with a short "Summary" section compressing the lesson into its essence.
- Where a claim benefits from a source, cite it with a Markdown link to a high-quality, high-trust resource.
- Remind the user (briefly, once) that they can select any passage and ask you about it.

## Quizzes

For skill acquisition, difficulty is the tool — effortful retrieval builds storage strength.
- A lesson of type "quiz" is a checkpoint: 2-4 questions covering the preceding lessons via retrieval practice.
- Every quiz question has exactly 4 options. Options must be about the same number of words (and characters, if possible) — never give away the answer through formatting or length.
- Explanations should teach, not just confirm.
- Regular lessons may include 1-2 quick-check questions; projects usually have none.

## Projects

A lesson of type "project" is a hands-on build applying prior lessons: give starter steps or starter code, a clear goal, and one stretch challenge ("your turn").

## Suggestions

After each lesson, propose 2-3 next steps in the user's zone of proximal development: usually the natural next lesson, plus one alternative angle, and periodically a quiz checkpoint or practice project (interleave them — don't save all practice for the end).

## Learning records

For each lesson, write a learningRecord: 1-3 sentences capturing the non-obvious insight the user should have internalized — like an ADR for learning. Future lessons use these to calculate the zone of proximal development.

## Output

Respond ONLY with JSON matching the provided schema. bodyMarkdown is the full lesson. readTime is an honest estimate like "6 min".`;

const THREAD_SYSTEM = `You are Teach, a personal tutor, answering a follow-up question inside a lesson the user is reading. Answer with the lesson in mind: short, concrete, and tied back to the passage or lesson. Build intuition first, then give a small example the user can try right after. Plain prose (no headings); a short fenced code block is fine when it helps. Keep it under ~150 words unless the question truly demands more.`;

const QUIZ_Q_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['q', 'options', 'correct', 'explanation'],
  properties: {
    q: { type: 'string' },
    options: { type: 'array', items: { type: 'string' } },
    correct: { type: 'integer', description: '0-based index of the correct option' },
    explanation: { type: 'string' },
  },
};

const LESSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'subtitle', 'type', 'readTime', 'bodyMarkdown', 'learningRecord', 'quiz', 'suggests'],
  properties: {
    title: { type: 'string' },
    subtitle: { type: 'string', description: 'One line shown under the title on the lesson card' },
    type: { type: 'string', enum: ['lesson', 'quiz', 'project'] },
    readTime: { type: 'string', description: 'e.g. "6 min"' },
    bodyMarkdown: { type: 'string' },
    learningRecord: { type: 'string' },
    quiz: {
      anyOf: [
        { type: 'null' },
        { type: 'array', items: QUIZ_Q_SCHEMA },
      ],
    },
    suggests: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'type'],
        properties: {
          label: { type: 'string' },
          type: { type: 'string', enum: ['lesson', 'quiz', 'project'] },
        },
      },
    },
  },
};

const COURSE_START_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['courseTitle', 'mission', 'intro', 'lesson'],
  properties: {
    courseTitle: { type: 'string', description: 'Short course name for the sidebar, e.g. "Learn React from scratch"' },
    mission: { type: 'string', description: 'The inferred mission: why the user wants to learn this, in 1-3 sentences' },
    intro: { type: 'string', description: '1-3 sentence conversational reply introducing the course and first lesson' },
    lesson: LESSON_SCHEMA,
  },
};

const NEXT_LESSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['intro', 'lesson'],
  properties: {
    intro: { type: 'string', description: 'Optional 1-2 sentence conversational lead-in; empty string if not needed' },
    lesson: LESSON_SCHEMA,
  },
};

function courseContext(course, completedIds) {
  const lines = [
    `Course: ${course.title}`,
    `Mission: ${course.mission || '(not yet established — infer from the conversation)'}`,
    '',
    'Lessons so far (with learning records):',
  ];
  if (!course.lessons || course.lessons.length === 0) {
    lines.push('(none yet)');
  } else {
    course.lessons.forEach((l, i) => {
      const done = completedIds && completedIds.includes(l.id) ? ' [completed]' : '';
      lines.push(`${i + 1}. [${l.type}] ${l.title}${done} — ${l.learningRecord || l.subtitle}`);
    });
  }
  return lines.join('\n');
}

module.exports = { TEACH_SYSTEM, THREAD_SYSTEM, COURSE_START_SCHEMA, NEXT_LESSON_SCHEMA, courseContext };
