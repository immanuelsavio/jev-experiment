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

import { choiceCases } from './choice_cases.mjs';


// ============================================================
// CONFIG
// ============================================================

const MODELS = {
  jev: 'typesafe-ai/jev',
  nano: 'openai/gpt-5-nano',
  luna: 'openai/gpt-5.6-luna',
  llama: 'meta/llama-3.3-70b',
};

const PROGRESS_FILE = 'choice-progress.json';
const RESULTS_FILE = 'results/04-choice-agent-routing.json';

mkdirSync('results', { recursive: true });


// ============================================================
// CHOICES
// ============================================================

const CRITERIA = {
  knowledge_base:
    'A general product, documentation, capability, policy, or informational question that can be answered from trusted documentation without changing user-specific data.',

  account_tool:
    'A user-specific account operation involving login, profile information, workspace membership, roles, permissions, or normal account access.',

  billing_tool:
    'A payment, charge, invoice, refund, subscription, renewal, plan change, or payment-method transaction.',

  human_escalation:
    'A security compromise, suspected unauthorized activity, destructive or irreversible high-risk request, legal/compliance judgment, or situation requiring human review.',
};

const LABELS = Object.keys(CRITERIA);


// ============================================================
// HELPERS
// ============================================================

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);

  const index =
    Math.ceil((p / 100) * sorted.length) - 1;

  return sorted[Math.max(0, index)];
}

function stats(values) {
  return {
    mean:
      values.reduce((sum, x) => sum + x, 0) /
      values.length,

    median:
      percentile(values, 50),

    p95:
      percentile(values, 95),

    min:
      Math.min(...values),

    max:
      Math.max(...values),
  };
}

function argmax(probabilities) {
  let bestLabel = null;
  let bestValue = -Infinity;

  for (const label of LABELS) {
    if (probabilities[label] > bestValue) {
      bestValue = probabilities[label];
      bestLabel = label;
    }
  }

  return bestLabel;
}


// ============================================================
// PARSE LLM DISTRIBUTION
// ============================================================

function parseDistribution(text) {
  const cleaned = text
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');

  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error(`No JSON found: ${text}`);
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

  const probabilities = {};

  let total = 0;

  for (const label of LABELS) {
    const value =
      parsed.probabilities[label];

    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < 0
    ) {
      throw new Error(
        `Invalid probability for ${label}: ${JSON.stringify(parsed)}`
      );
    }

    probabilities[label] = value;
    total += value;
  }

  if (total <= 0) {
    throw new Error('Probability total is zero.');
  }

  // Normalize if model returns 0.99 / 1.01 etc.
  for (const label of LABELS) {
    probabilities[label] /= total;
  }

  const choice =
    argmax(probabilities);

  return {
    choice,
    probabilities,
    confidence:
      probabilities[choice],
  };
}


// ============================================================
// MULTICLASS BRIER SCORE
// ============================================================

function multiclassBrier(
  probabilities,
  expected
) {
  let sum = 0;

  for (const label of LABELS) {
    const truth =
      label === expected ? 1 : 0;

    sum += Math.pow(
      probabilities[label] - truth,
      2
    );
  }

  // Divide by number of classes so range stays intuitive.
  return sum / LABELS.length;
}


// ============================================================
// RETRY
// ============================================================

async function withRetry(
  label,
  fn,
  maxAttempts = 4
) {
  let lastError;

  for (
    let attempt = 1;
    attempt <= maxAttempts;
    attempt++
  ) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      console.log(
        `   ⚠️ ${label} failed ${attempt}/${maxAttempts}: ${error.message}`
      );

      if (attempt < maxAttempts) {
        const waitMs =
          attempt * 3000;

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
// JEV CHOICE
// ============================================================

async function runJev(item) {
  const start =
    performance.now();

  const result =
    await evaluate({
      model: MODELS.jev,

      maxRetries: 0,

      state:
        item.text,

      questions: {
        action: {
          type: 'choice',

          instructions:
            'Which action should the support agent take next? Choose exactly one action using the criteria.',

          criteria:
            CRITERIA,
        },
      },
    });

  const latencyMs =
    performance.now() - start;

  const answer =
    result.answers.action;

  return {
    choice:
      answer.choice,

    probabilities:
      answer.probabilities,

    confidence:
      answer.probabilities[
        answer.choice
      ],

    latencyMs,
  };
}


// ============================================================
// SHARED LLM PROMPT
// ============================================================

function buildPrompt(item) {
  return `
You are choosing the next action for a customer support agent.

Choose between exactly four actions.

knowledge_base:
${CRITERIA.knowledge_base}

account_tool:
${CRITERIA.account_tool}

billing_tool:
${CRITERIA.billing_tool}

human_escalation:
${CRITERIA.human_escalation}

Return your probability distribution across ALL FOUR actions.

Probabilities must be numbers between 0 and 1 and should sum to 1.

Return ONLY valid JSON in exactly this structure:

{
  "probabilities": {
    "knowledge_base": 0.05,
    "account_tool": 0.80,
    "billing_tool": 0.10,
    "human_escalation": 0.05
  }
}

Do not include:
- markdown
- explanation
- a choice field
- any other fields

REQUEST:

${item.text}
`.trim();
}


// ============================================================
// GENERAL-PURPOSE LLM
// ============================================================

async function runLLM(
  model,
  item
) {
  const isOpenAI =
    model.startsWith('openai/');

  const start =
    performance.now();

  const result =
    await generateText({
      model,

      maxRetries: 0,

      maxOutputTokens:
        isOpenAI ? 512 : 140,

      ...(isOpenAI
        ? {
            reasoning: 'minimal',
          }
        : {
            temperature: 0,
          }),

      prompt:
        buildPrompt(item),
    });

  const latencyMs =
    performance.now() - start;

  const parsed =
    parseDistribution(
      result.text
    );

  return {
    ...parsed,
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
  if (
    existsSync(PROGRESS_FILE)
  ) {
    unlinkSync(PROGRESS_FILE);
  }

  if (
    existsSync(RESULTS_FILE)
  ) {
    unlinkSync(RESULTS_FILE);
  }

  console.log(
    '\n🧹 Starting fresh Choice benchmark.\n'
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
    `\n♻️ Resuming: ${results.length}/${choiceCases.length} complete.\n`
  );
}


// ============================================================
// BENCHMARK
// ============================================================

console.log(
  '🔥 CHOICE BENCHMARK'
);

console.log(
  'Task: Choose the next agent action\n'
);

console.log(
  `Cases: ${choiceCases.length}`
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
  i < choiceCases.length;
  i++
) {
  const item =
    choiceCases[i];

  if (
    results.some(
      (row) =>
        row.id === item.id
    )
  ) {
    console.log(
      `[${i + 1}/${choiceCases.length}] already complete — skipping`
    );

    continue;
  }


  console.log(
    `\n[${i + 1}/${choiceCases.length}] ${item.text.slice(
      0,
      72
    )}...`
  );


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


  function metrics(result) {
    return {
      choice:
        result.choice,

      probabilities:
        result.probabilities,

      confidence:
        result.confidence,

      correct:
        result.choice ===
        item.expected,

      brier:
        multiclassBrier(
          result.probabilities,
          item.expected
        ),

      latencyMs:
        result.latencyMs,
    };
  }


  const jm =
    metrics(jev);

  const nm =
    metrics(nano);

  const lum =
    metrics(luna);

  const llm =
    metrics(llama);


  const row = {
    id:
      item.id,

    text:
      item.text,

    expected:
      item.expected,


    jevChoice:
      jm.choice,

    jevProbabilities:
      jm.probabilities,

    jevConfidence:
      jm.confidence,

    jevCorrect:
      jm.correct,

    jevBrier:
      jm.brier,

    jevLatencyMs:
      jm.latencyMs,


    nanoChoice:
      nm.choice,

    nanoProbabilities:
      nm.probabilities,

    nanoConfidence:
      nm.confidence,

    nanoCorrect:
      nm.correct,

    nanoBrier:
      nm.brier,

    nanoLatencyMs:
      nm.latencyMs,


    lunaChoice:
      lum.choice,

    lunaProbabilities:
      lum.probabilities,

    lunaConfidence:
      lum.confidence,

    lunaCorrect:
      lum.correct,

    lunaBrier:
      lum.brier,

    lunaLatencyMs:
      lum.latencyMs,


    llamaChoice:
      llm.choice,

    llamaProbabilities:
      llm.probabilities,

    llamaConfidence:
      llm.confidence,

    llamaCorrect:
      llm.correct,

    llamaBrier:
      llm.brier,

    llamaLatencyMs:
      llm.latencyMs,
  };


  results.push(row);


  console.log(
    `   Expected: ${item.expected}`
  );

  console.log(
    `   Jev:   ${jm.choice} (${(jm.confidence * 100).toFixed(0)}%) — ${jm.latencyMs.toFixed(0)} ms`
  );

  console.log(
    `   Nano:  ${nm.choice} (${(nm.confidence * 100).toFixed(0)}%) — ${nm.latencyMs.toFixed(0)} ms`
  );

  console.log(
    `   Luna:  ${lum.choice} (${(lum.confidence * 100).toFixed(0)}%) — ${lum.latencyMs.toFixed(0)} ms`
  );

  console.log(
    `   Llama: ${llm.choice} (${(llm.confidence * 100).toFixed(0)}%) — ${llm.latencyMs.toFixed(0)} ms`
  );


  writeFileSync(
    PROGRESS_FILE,

    JSON.stringify(
      {
        experiment:
          'choice-agent-routing',

        models:
          MODELS,

        criteria:
          CRITERIA,

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

  const correctRows =
    results.filter(
      (row) =>
        row[
          `${prefix}Correct`
        ]
    );

  const incorrectRows =
    results.filter(
      (row) =>
        !row[
          `${prefix}Correct`
        ]
    );

  const briers =
    results.map(
      (row) =>
        row[
          `${prefix}Brier`
        ]
    );


  const perClass = {};

  for (const label of LABELS) {
    const rows =
      results.filter(
        (row) =>
          row.expected === label
      );

    const correct =
      rows.filter(
        (row) =>
          row[
            `${prefix}Choice`
          ] === label
      ).length;

    perClass[label] = {
      correct,
      total:
        rows.length,

      accuracy:
        correct /
        rows.length,
    };
  }


  const macroAccuracy =
    LABELS.reduce(
      (sum, label) =>
        sum +
        perClass[label]
          .accuracy,
      0
    ) /
    LABELS.length;


  function meanConfidence(rows) {
    if (rows.length === 0) {
      return null;
    }

    return (
      rows.reduce(
        (sum, row) =>
          sum +
          row[
            `${prefix}Confidence`
          ],
        0
      ) /
      rows.length
    );
  }


  return {
    accuracy:
      correctRows.length /
      results.length,

    macroAccuracy,

    perClass,

    multiclassBrier:
      briers.reduce(
        (sum, value) =>
          sum + value,
        0
      ) /
      briers.length,

    meanConfidenceCorrect:
      meanConfidence(
        correctRows
      ),

    meanConfidenceIncorrect:
      meanConfidence(
        incorrectRows
      ),

    latency:
      stats(latency),
  };
}


const summary = {
  generatedAt:
    new Date().toISOString(),

  experiment:
    'choice-agent-routing',

  cases:
    results.length,

  choices:
    LABELS,

  criteria:
    CRITERIA,

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
// OUTPUT
// ============================================================

function printModel(
  name,
  data
) {
  console.log(`\n${name}`);

  console.log(
    `Accuracy:          ${(data.accuracy * 100).toFixed(1)}%`
  );

  console.log(
    `Macro accuracy:    ${(data.macroAccuracy * 100).toFixed(1)}%`
  );

  console.log(
    `Brier score:       ${data.multiclassBrier.toFixed(4)}`
  );

  console.log(
    `Median latency:    ${data.latency.median.toFixed(0)} ms`
  );

  console.log(
    `P95 latency:       ${data.latency.p95.toFixed(0)} ms`
  );

  console.log(
    'Per-class accuracy:'
  );

  for (const label of LABELS) {
    const item =
      data.perClass[label];

    console.log(
      `  ${label.padEnd(18)} ${(item.accuracy * 100).toFixed(0)}% (${item.correct}/${item.total})`
    );
  }
}


console.log(
  '\n================================'
);

console.log(
  '        CHOICE RESULTS'
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
  '\nBrier score: lower is better.'
);

console.log(
  `\n✅ Saved to ${RESULTS_FILE}`
);