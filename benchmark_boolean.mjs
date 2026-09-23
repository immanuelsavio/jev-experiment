import 'dotenv/config';

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from 'node:fs';

import {
  experimental_evaluate as evaluate,
  generateText,
} from 'ai';

import { booleanCases } from './boolean_cases.mjs';


// ============================================================
// CONFIG
// ============================================================

const MODELS = {
  jev: 'typesafe-ai/jev',
  nano: 'openai/gpt-5-nano',
  luna: 'openai/gpt-5.6-luna',
  llama: 'meta/llama-3.3-70b',
};

const PROGRESS_FILE = 'boolean-progress.json';
const RESULTS_FILE = 'results/02-boolean-escalation.json';

mkdirSync('results', { recursive: true });


// ============================================================
// ESCALATION POLICY
// ============================================================

const POLICY = `
Immediate escalation is required if ANY of these are true:

1. A production or core service is completely unavailable,
   or essentially all affected users are blocked.

2. There is an active security compromise, account takeover,
   unauthorized access, or exposed active credential.

3. The user explicitly states a deadline within the next 60 minutes.

Otherwise immediate escalation is NOT required.
`.trim();


// ============================================================
// HELPERS
// ============================================================

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;

  return sorted[Math.max(0, index)];
}

function stats(values) {
  return {
    mean:
      values.reduce((sum, value) => sum + value, 0) /
      values.length,

    median: percentile(values, 50),
    p95: percentile(values, 95),
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

function parseProbability(text) {
  const cleaned = text
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');

  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error(`No JSON object found: ${text}`);
  }

  const parsed = JSON.parse(
    cleaned.slice(firstBrace, lastBrace + 1)
  );

  if (
    typeof parsed.probability !== 'number' ||
    !Number.isFinite(parsed.probability) ||
    parsed.probability < 0 ||
    parsed.probability > 1
  ) {
    throw new Error(
      `Invalid probability: ${JSON.stringify(parsed)}`
    );
  }

  return parsed.probability;
}


// ============================================================
// RETRY
// ============================================================

async function withRetry(label, fn, maxAttempts = 4) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      console.log(
        `   ⚠️ ${label} failed ${attempt}/${maxAttempts}: ${error.message}`
      );

      if (attempt < maxAttempts) {
        const waitMs = attempt * 3000;

        console.log(
          `      retrying in ${waitMs / 1000}s...\n`
        );

        await sleep(waitMs);
      }
    }
  }

  throw lastError;
}


// ============================================================
// JEV BOOLEAN
// ============================================================

async function runJev(item) {
  const start = performance.now();

  const result = await evaluate({
    model: MODELS.jev,
    maxRetries: 0,

    state: item.text,

    questions: {
      escalation: {
        type: 'boolean',

        instructions: `
Does this support case require immediate escalation?

Use this policy exactly:

${POLICY}
`.trim(),
      },
    },
  });

  const latencyMs = performance.now() - start;

  const probability =
    result.answers.escalation.probability;

  return {
    probability,
    predicted: probability >= 0.5,
    latencyMs,
  };
}


// ============================================================
// SHARED LLM PROMPT
// ============================================================

function buildPrompt(item) {
  return `
You are evaluating whether a customer support case requires
immediate escalation.

Use this policy exactly:

${POLICY}

Return your probability that the policy evaluates to TRUE.

The probability must be a number between 0 and 1.

Return ONLY valid JSON in exactly this form:

{"probability":0.93}

Do not return:
- markdown
- explanation
- an answer field
- any other fields

SUPPORT CASE:

${item.text}
`.trim();
}


// ============================================================
// GENERAL-PURPOSE LLM
// ============================================================

async function runLLM(model, item) {
  const isOpenAI =
    model.startsWith('openai/');

  const start = performance.now();

  const result = await generateText({
    model,

    maxRetries: 0,

    maxOutputTokens:
      isOpenAI ? 512 : 80,

    ...(isOpenAI
      ? {
          reasoning: 'minimal',
        }
      : {
          temperature: 0,
        }),

    prompt: buildPrompt(item),
  });

  const latencyMs =
    performance.now() - start;

  const probability =
    parseProbability(result.text);

  return {
    probability,
    predicted: probability >= 0.5,
    latencyMs,
    raw: result.text.trim(),
    usage: result.usage ?? null,
  };
}


// ============================================================
// LOAD / RESET
// ============================================================

const fresh =
  process.argv.includes('--fresh');

if (fresh) {
  if (existsSync(PROGRESS_FILE)) {
    unlinkSync(PROGRESS_FILE);
  }

  if (existsSync(RESULTS_FILE)) {
    unlinkSync(RESULTS_FILE);
  }

  console.log('\n🧹 Starting fresh Boolean benchmark.\n');
}

let results = [];

if (!fresh && existsSync(PROGRESS_FILE)) {
  const progress = JSON.parse(
    readFileSync(PROGRESS_FILE, 'utf8')
  );

  results = progress.results ?? [];

  console.log(
    `\n♻️ Resuming: ${results.length}/${booleanCases.length} complete.\n`
  );
}


// ============================================================
// BENCHMARK
// ============================================================

console.log('🔥 BOOLEAN BENCHMARK');
console.log('Question: Does this case require immediate escalation?\n');

console.log(`Cases: ${booleanCases.length}`);
console.log(`Jev:   ${MODELS.jev}`);
console.log(`Nano:  ${MODELS.nano}`);
console.log(`Luna:  ${MODELS.luna}`);
console.log(`Llama: ${MODELS.llama}\n`);


for (let i = 0; i < booleanCases.length; i++) {
  const item = booleanCases[i];

  if (results.some((row) => row.id === item.id)) {
    console.log(
      `[${i + 1}/${booleanCases.length}] already complete — skipping`
    );

    continue;
  }

  console.log(
    `\n[${i + 1}/${booleanCases.length}] ${item.text.slice(0, 72)}...`
  );


  // ----------------------------------------------------------
  // Run all four
  // ----------------------------------------------------------

  const jev = await withRetry(
    'Jev',
    () => runJev(item)
  );

  const nano = await withRetry(
    'GPT-5 nano',
    () => runLLM(MODELS.nano, item)
  );

  const luna = await withRetry(
    'GPT-5.6 Luna',
    () => runLLM(MODELS.luna, item)
  );

  const llama = await withRetry(
    'Llama 3.3 70B',
    () => runLLM(MODELS.llama, item)
  );


  // ----------------------------------------------------------
  // Save result
  // ----------------------------------------------------------

  const expectedNumber =
    item.expected ? 1 : 0;

  const row = {
    id: item.id,
    text: item.text,
    expected: item.expected,

    jevProbability: jev.probability,
    jevPredicted: jev.predicted,
    jevCorrect:
      jev.predicted === item.expected,
    jevBrier:
      Math.pow(
        jev.probability - expectedNumber,
        2
      ),
    jevLatencyMs: jev.latencyMs,

    nanoProbability: nano.probability,
    nanoPredicted: nano.predicted,
    nanoCorrect:
      nano.predicted === item.expected,
    nanoBrier:
      Math.pow(
        nano.probability - expectedNumber,
        2
      ),
    nanoLatencyMs: nano.latencyMs,

    lunaProbability: luna.probability,
    lunaPredicted: luna.predicted,
    lunaCorrect:
      luna.predicted === item.expected,
    lunaBrier:
      Math.pow(
        luna.probability - expectedNumber,
        2
      ),
    lunaLatencyMs: luna.latencyMs,

    llamaProbability: llama.probability,
    llamaPredicted: llama.predicted,
    llamaCorrect:
      llama.predicted === item.expected,
    llamaBrier:
      Math.pow(
        llama.probability - expectedNumber,
        2
      ),
    llamaLatencyMs: llama.latencyMs,
  };

  results.push(row);


  // ----------------------------------------------------------
  // Print
  // ----------------------------------------------------------

  const expected =
    item.expected ? 'TRUE' : 'FALSE';

  console.log(`   Expected: ${expected}`);

  console.log(
    `   Jev:   p=${jev.probability.toFixed(2)} → ${jev.predicted} — ${jev.latencyMs.toFixed(0)} ms`
  );

  console.log(
    `   Nano:  p=${nano.probability.toFixed(2)} → ${nano.predicted} — ${nano.latencyMs.toFixed(0)} ms`
  );

  console.log(
    `   Luna:  p=${luna.probability.toFixed(2)} → ${luna.predicted} — ${luna.latencyMs.toFixed(0)} ms`
  );

  console.log(
    `   Llama: p=${llama.probability.toFixed(2)} → ${llama.predicted} — ${llama.latencyMs.toFixed(0)} ms`
  );


  // ----------------------------------------------------------
  // Checkpoint
  // ----------------------------------------------------------

  writeFileSync(
    PROGRESS_FILE,

    JSON.stringify(
      {
        experiment: 'boolean-immediate-escalation',
        models: MODELS,
        policy: POLICY,
        results,
      },
      null,
      2
    )
  );
}


// ============================================================
// SUMMARY
// ============================================================

results.sort((a, b) => a.id - b.id);


function summarize(prefix) {
  const latency = results.map(
    (row) => row[`${prefix}LatencyMs`]
  );

  const brier = results.map(
    (row) => row[`${prefix}Brier`]
  );

  const correct = results.filter(
    (row) => row[`${prefix}Correct`]
  ).length;

  const trueCases = results.filter(
    (row) => row.expected === true
  );

  const falseCases = results.filter(
    (row) => row.expected === false
  );

  const meanTrueProbability =
    trueCases.reduce(
      (sum, row) =>
        sum +
        row[`${prefix}Probability`],
      0
    ) / trueCases.length;

  const meanFalseProbability =
    falseCases.reduce(
      (sum, row) =>
        sum +
        row[`${prefix}Probability`],
      0
    ) / falseCases.length;

  return {
    accuracy:
      correct / results.length,

    brierScore:
      brier.reduce(
        (sum, value) => sum + value,
        0
      ) / brier.length,

    meanProbabilityOnTrueCases:
      meanTrueProbability,

    meanProbabilityOnFalseCases:
      meanFalseProbability,

    latency:
      stats(latency),
  };
}


const summary = {
  generatedAt:
    new Date().toISOString(),

  experiment:
    'boolean-immediate-escalation',

  cases:
    results.length,

  positiveCases:
    results.filter(
      (row) => row.expected
    ).length,

  negativeCases:
    results.filter(
      (row) => !row.expected
    ).length,

  policy:
    POLICY,

  models:
    MODELS,

  jev:
    summarize('jev'),

  nano:
    summarize('nano'),

  luna:
    summarize('luna'),

  llama:
    summarize('llama'),
};


// ============================================================
// SAVE
// ============================================================

writeFileSync(
  RESULTS_FILE,

  JSON.stringify(
    {
      summary,
      results,
    },
    null,
    2
  )
);

if (existsSync(PROGRESS_FILE)) {
  unlinkSync(PROGRESS_FILE);
}


// ============================================================
// TERMINAL RESULTS
// ============================================================

function printModel(name, data) {
  console.log(`\n${name}`);

  console.log(
    `Accuracy:          ${(data.accuracy * 100).toFixed(1)}%`
  );

  console.log(
    `Brier score:       ${data.brierScore.toFixed(4)}`
  );

  console.log(
    `Avg P(true) | true cases:  ${data.meanProbabilityOnTrueCases.toFixed(3)}`
  );

  console.log(
    `Avg P(true) | false cases: ${data.meanProbabilityOnFalseCases.toFixed(3)}`
  );

  console.log(
    `Median latency:    ${data.latency.median.toFixed(0)} ms`
  );

  console.log(
    `P95 latency:       ${data.latency.p95.toFixed(0)} ms`
  );
}


console.log(
  '\n================================'
);

console.log(
  '       BOOLEAN RESULTS'
);

console.log(
  '================================'
);

printModel(
  'JEV',
  summary.jev
);

printModel(
  'GPT-5 NANO',
  summary.nano
);

printModel(
  'GPT-5.6 LUNA',
  summary.luna
);

printModel(
  'LLAMA 3.3 70B',
  summary.llama
);

console.log(
  '\nBrier score: lower is better.'
);

console.log(
  '0.000 = perfect probabilities.'
);

console.log(
  `\n✅ Saved to ${RESULTS_FILE}`
);