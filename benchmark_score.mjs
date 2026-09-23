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

import { scoreCases } from './score_cases.mjs';


// ============================================================
// CONFIG
// ============================================================

const MODELS = {
  jev: 'typesafe-ai/jev',
  nano: 'openai/gpt-5-nano',
  luna: 'openai/gpt-5.6-luna',
  llama: 'meta/llama-3.3-70b',
};

const PROGRESS_FILE = 'score-progress.json';
const RESULTS_FILE = 'results/03-score-severity.json';

mkdirSync('results', { recursive: true });


// ============================================================
// RUBRIC
// ============================================================

const RUBRIC = [
  'No incident. Informational question, documentation request, pricing question, or normal product inquiry with no malfunction.',
  'Minor issue. Cosmetic, slight degradation, or inconvenience. Core functionality still works and impact is small.',
  'Moderate issue. Real functionality is impaired, but impact is limited or a practical workaround exists.',
  'High severity. Major functionality is unavailable or a substantial group of users is blocked, but the entire core service is not catastrophically unavailable.',
  'Critical severity. Complete core production outage, active security compromise, severe unauthorized access, destructive data event, or major financial integrity incident.',
];


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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function expectedScore(probabilities) {
  return (
    probabilities[0] * 0 +
    probabilities[1] * 1 +
    probabilities[2] * 2 +
    probabilities[3] * 3 +
    probabilities[4] * 4
  );
}


// ============================================================
// LLM JSON PARSER
// ============================================================

function parseDistribution(text) {
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
    !parsed.probabilities ||
    typeof parsed.probabilities !== 'object'
  ) {
    throw new Error(
      `Missing probabilities: ${JSON.stringify(parsed)}`
    );
  }

  const raw = [];

  for (let i = 0; i <= 4; i++) {
    const value =
      parsed.probabilities[String(i)] ??
      parsed.probabilities[i];

    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < 0
    ) {
      throw new Error(
        `Invalid probability for level ${i}: ${JSON.stringify(parsed)}`
      );
    }

    raw.push(value);
  }

  const total =
    raw.reduce((sum, value) => sum + value, 0);

  if (total <= 0) {
    throw new Error(
      `Probability sum is zero: ${JSON.stringify(parsed)}`
    );
  }

  // Normalize because an LLM might give e.g. 0.99 or 1.01 total.
  const probabilities =
    raw.map((value) => value / total);

  return {
    probabilities,
    score: expectedScore(probabilities),
  };
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
// JEV SCORE
// ============================================================

async function runJev(item) {
  const start = performance.now();

  const result = await evaluate({
    model: MODELS.jev,
    maxRetries: 0,

    state: item.text,

    questions: {
      severity: {
        type: 'score',

        instructions:
          'How severe is the incident described in this customer support case?',

        criteria: RUBRIC,
      },
    },
  });

  const latencyMs =
    performance.now() - start;

  const answer =
    result.answers.severity;

  return {
    score: answer.score,
    probabilities:
      answer.probabilities ?? null,
    confidence:
      answer.confidence ?? null,
    legend:
      answer.legend ?? null,
    latencyMs,
  };
}


// ============================================================
// SHARED LLM PROMPT
// ============================================================

function buildPrompt(item) {
  return `
You are scoring the severity of a customer support case.

Use this ordered severity rubric:

0:
${RUBRIC[0]}

1:
${RUBRIC[1]}

2:
${RUBRIC[2]}

3:
${RUBRIC[3]}

4:
${RUBRIC[4]}

Return a probability distribution across ALL FIVE severity levels.

Probabilities must be numbers between 0 and 1.

They should sum to 1.

Return ONLY valid JSON in exactly this structure:

{
  "probabilities": {
    "0": 0.00,
    "1": 0.05,
    "2": 0.80,
    "3": 0.15,
    "4": 0.00
  }
}

Do not return:
- markdown
- explanation
- a severity field
- a score field
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

  const start =
    performance.now();

  const result =
    await generateText({
      model,

      maxRetries: 0,

      maxOutputTokens:
        isOpenAI ? 512 : 120,

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

  const parsed =
    parseDistribution(result.text);

  return {
    score: parsed.score,
    probabilities:
      parsed.probabilities,
    latencyMs,
    raw:
      result.text.trim(),
    usage:
      result.usage ?? null,
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

  console.log(
    '\n🧹 Starting fresh Score benchmark.\n'
  );
}

let results = [];

if (
  !fresh &&
  existsSync(PROGRESS_FILE)
) {
  const progress =
    JSON.parse(
      readFileSync(
        PROGRESS_FILE,
        'utf8'
      )
    );

  results =
    progress.results ?? [];

  console.log(
    `\n♻️ Resuming: ${results.length}/${scoreCases.length} complete.\n`
  );
}


// ============================================================
// BENCHMARK
// ============================================================

console.log(
  '🔥 SCORE BENCHMARK'
);

console.log(
  'Task: Incident severity from 0 → 4\n'
);

console.log(
  `Cases: ${scoreCases.length}`
);

console.log(
  `Jev:   ${MODELS.jev}`
);

console.log(
  `Nano:  ${MODELS.nano}`
);

console.log(
  `Luna:  ${MODELS.luna}`
);

console.log(
  `Llama: ${MODELS.llama}\n`
);


for (
  let i = 0;
  i < scoreCases.length;
  i++
) {
  const item =
    scoreCases[i];

  if (
    results.some(
      (row) =>
        row.id === item.id
    )
  ) {
    console.log(
      `[${i + 1}/${scoreCases.length}] already complete — skipping`
    );

    continue;
  }

  console.log(
    `\n[${i + 1}/${scoreCases.length}] ${item.text.slice(
      0,
      72
    )}...`
  );


  // ----------------------------------------------------------
  // RUN
  // ----------------------------------------------------------

  const jev =
    await withRetry(
      'Jev',
      () => runJev(item)
    );

  const nano =
    await withRetry(
      'GPT-5 nano',
      () =>
        runLLM(
          MODELS.nano,
          item
        )
    );

  const luna =
    await withRetry(
      'GPT-5.6 Luna',
      () =>
        runLLM(
          MODELS.luna,
          item
        )
    );

  const llama =
    await withRetry(
      'Llama 3.3 70B',
      () =>
        runLLM(
          MODELS.llama,
          item
        )
    );


  // ----------------------------------------------------------
  // METRICS PER ROW
  // ----------------------------------------------------------

  function modelMetrics(result) {
    const score =
      clamp(
        result.score,
        0,
        4
      );

    const rounded =
      Math.round(score);

    const absoluteError =
      Math.abs(
        score - item.expected
      );

    return {
      score,
      rounded,
      absoluteError,

      squaredError:
        Math.pow(
          score -
            item.expected,
          2
        ),

      roundedCorrect:
        rounded ===
        item.expected,

      withinOne:
        absoluteError <= 1,

      latencyMs:
        result.latencyMs,

      probabilities:
        result.probabilities,
    };
  }


  const jm =
    modelMetrics(jev);

  const nm =
    modelMetrics(nano);

  const lum =
    modelMetrics(luna);

  const llm =
    modelMetrics(llama);


  const row = {
    id:
      item.id,

    text:
      item.text,

    expected:
      item.expected,


    // JEV
    jevScore:
      jm.score,

    jevRounded:
      jm.rounded,

    jevAbsoluteError:
      jm.absoluteError,

    jevSquaredError:
      jm.squaredError,

    jevRoundedCorrect:
      jm.roundedCorrect,

    jevWithinOne:
      jm.withinOne,

    jevLatencyMs:
      jm.latencyMs,

    jevProbabilities:
      jev.probabilities,

    jevConfidence:
      jev.confidence,


    // NANO
    nanoScore:
      nm.score,

    nanoRounded:
      nm.rounded,

    nanoAbsoluteError:
      nm.absoluteError,

    nanoSquaredError:
      nm.squaredError,

    nanoRoundedCorrect:
      nm.roundedCorrect,

    nanoWithinOne:
      nm.withinOne,

    nanoLatencyMs:
      nm.latencyMs,

    nanoProbabilities:
      nano.probabilities,


    // LUNA
    lunaScore:
      lum.score,

    lunaRounded:
      lum.rounded,

    lunaAbsoluteError:
      lum.absoluteError,

    lunaSquaredError:
      lum.squaredError,

    lunaRoundedCorrect:
      lum.roundedCorrect,

    lunaWithinOne:
      lum.withinOne,

    lunaLatencyMs:
      lum.latencyMs,

    lunaProbabilities:
      luna.probabilities,


    // LLAMA
    llamaScore:
      llm.score,

    llamaRounded:
      llm.rounded,

    llamaAbsoluteError:
      llm.absoluteError,

    llamaSquaredError:
      llm.squaredError,

    llamaRoundedCorrect:
      llm.roundedCorrect,

    llamaWithinOne:
      llm.withinOne,

    llamaLatencyMs:
      llm.latencyMs,

    llamaProbabilities:
      llama.probabilities,
  };


  results.push(row);


  // ----------------------------------------------------------
  // PRINT
  // ----------------------------------------------------------

  console.log(
    `   Expected: ${item.expected}`
  );

  console.log(
    `   Jev:   ${jm.score.toFixed(2)} → ${jm.rounded} — ${jm.latencyMs.toFixed(0)} ms`
  );

  console.log(
    `   Nano:  ${nm.score.toFixed(2)} → ${nm.rounded} — ${nm.latencyMs.toFixed(0)} ms`
  );

  console.log(
    `   Luna:  ${lum.score.toFixed(2)} → ${lum.rounded} — ${lum.latencyMs.toFixed(0)} ms`
  );

  console.log(
    `   Llama: ${llm.score.toFixed(2)} → ${llm.rounded} — ${llm.latencyMs.toFixed(0)} ms`
  );


  // ----------------------------------------------------------
  // CHECKPOINT
  // ----------------------------------------------------------

  writeFileSync(
    PROGRESS_FILE,

    JSON.stringify(
      {
        experiment:
          'score-incident-severity',

        models:
          MODELS,

        rubric:
          RUBRIC,

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

results.sort(
  (a, b) =>
    a.id - b.id
);


function summarize(prefix) {
  const latency =
    results.map(
      (row) =>
        row[
          `${prefix}LatencyMs`
        ]
    );

  const absoluteErrors =
    results.map(
      (row) =>
        row[
          `${prefix}AbsoluteError`
        ]
    );

  const squaredErrors =
    results.map(
      (row) =>
        row[
          `${prefix}SquaredError`
        ]
    );

  const roundedCorrect =
    results.filter(
      (row) =>
        row[
          `${prefix}RoundedCorrect`
        ]
    ).length;

  const withinOne =
    results.filter(
      (row) =>
        row[
          `${prefix}WithinOne`
        ]
    ).length;


  const mae =
    absoluteErrors.reduce(
      (sum, value) =>
        sum + value,
      0
    ) /
    absoluteErrors.length;


  const mse =
    squaredErrors.reduce(
      (sum, value) =>
        sum + value,
      0
    ) /
    squaredErrors.length;


  return {
    meanAbsoluteError:
      mae,

    rootMeanSquaredError:
      Math.sqrt(mse),

    roundedAccuracy:
      roundedCorrect /
      results.length,

    withinOneAccuracy:
      withinOne /
      results.length,

    latency:
      stats(latency),
  };
}


const summary = {
  generatedAt:
    new Date().toISOString(),

  experiment:
    'score-incident-severity',

  cases:
    results.length,

  rubric:
    RUBRIC,

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
// SPEED RATIOS
// ============================================================

summary.speedup = {
  nano:
    summary.nano.latency.median /
    summary.jev.latency.median,

  luna:
    summary.luna.latency.median /
    summary.jev.latency.median,

  llama:
    summary.llama.latency.median /
    summary.jev.latency.median,
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

if (
  existsSync(PROGRESS_FILE)
) {
  unlinkSync(PROGRESS_FILE);
}


// ============================================================
// TERMINAL OUTPUT
// ============================================================

function printModel(
  name,
  data
) {
  console.log(`\n${name}`);

  console.log(
    `MAE:               ${data.meanAbsoluteError.toFixed(3)}`
  );

  console.log(
    `RMSE:              ${data.rootMeanSquaredError.toFixed(3)}`
  );

  console.log(
    `Rounded accuracy:  ${(data.roundedAccuracy * 100).toFixed(1)}%`
  );

  console.log(
    `Within ±1:         ${(data.withinOneAccuracy * 100).toFixed(1)}%`
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
  '        SCORE RESULTS'
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
  '\n--------------------------------'
);

console.log(
  'MEDIAN LATENCY VS JEV'
);

console.log(
  '--------------------------------'
);

console.log(
  `Nano:  ${summary.speedup.nano.toFixed(2)}x Jev latency`
);

console.log(
  `Luna:  ${summary.speedup.luna.toFixed(2)}x Jev latency`
);

console.log(
  `Llama: ${summary.speedup.llama.toFixed(2)}x Jev latency`
);


console.log(
  '\nMAE/RMSE: lower is better.'
);

console.log(
  'Rounded accuracy / Within ±1: higher is better.'
);

console.log(
  `\n✅ Saved to ${RESULTS_FILE}`
);