import 'dotenv/config';

import {
  existsSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from 'node:fs';

import {
  experimental_evaluate as evaluate,
  generateText,
} from 'ai';

import { tickets } from './tickets.mjs';


// ============================================================
// MODELS
// ============================================================

const MODELS = {
  jev: 'typesafe-ai/jev',
  nano: 'openai/gpt-5-nano',
  luna: 'openai/gpt-5.6-luna',
  llama: 'meta/llama-3.3-70b',
};

const PROGRESS_FILE = 'benchmark-progress.json';
const RESULTS_FILE = 'benchmark-results.json';


// ============================================================
// TASK DEFINITION
// ============================================================

const routeCriteria = {
  billing:
    'Payments, charges, refunds, invoices, or subscriptions',

  technical:
    'Bugs, errors, outages, or broken functionality',

  account:
    'Login, permissions, or account access',

  general:
    'Anything else',
};


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
      values.reduce((a, b) => a + b, 0) /
      values.length,

    median: percentile(values, 50),

    p95: percentile(values, 95),

    min: Math.min(...values),

    max: Math.max(...values),
  };
}


function parseJSON(text) {
  const cleaned = text
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  const firstBrace =
    cleaned.indexOf('{');

  const lastBrace =
    cleaned.lastIndexOf('}');

  if (
    firstBrace === -1 ||
    lastBrace === -1
  ) {
    throw new Error(
      `No JSON object found: ${text}`
    );
  }

  const parsed = JSON.parse(
    cleaned.slice(
      firstBrace,
      lastBrace + 1
    )
  );

  const validRoutes = [
    'billing',
    'technical',
    'account',
    'general',
  ];

  if (
    !validRoutes.includes(parsed.route)
  ) {
    throw new Error(
      `Invalid route: ${parsed.route}`
    );
  }

  if (
    typeof parsed.urgent !== 'boolean'
  ) {
    throw new Error(
      `Invalid urgent value: ${parsed.urgent}`
    );
  }

  return parsed;
}


// ============================================================
// RETRY WRAPPER
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
        `   ⚠️ ${label} failed on attempt ${attempt}/${maxAttempts}`
      );

      console.log(
        `      ${error.message}`
      );

      if (attempt < maxAttempts) {
        const wait =
          attempt * 3000;

        console.log(
          `      retrying in ${
            wait / 1000
          }s...\n`
        );

        await sleep(wait);
      }
    }
  }

  throw lastError;
}


// ============================================================
// JEV
// ============================================================

async function runJev(ticket) {
  const start = performance.now();

  const result = await evaluate({
    model: MODELS.jev,

    maxRetries: 0,

    state: ticket.text,

    questions: {
      route: {
        type: 'choice',

        instructions:
          'Which team should handle this ticket?',

        criteria: routeCriteria,
      },

      urgent: {
        type: 'boolean',

        instructions:
          'Is the customer explicitly time-sensitive or completely blocked?',
      },
    },
  });

  const latencyMs =
    performance.now() - start;

  const route =
    result.answers.route.choice;

  const urgentProbability =
    result.answers.urgent.probability;

  return {
    route,

    urgent:
      urgentProbability >= 0.5,

    routeConfidence:
      result.answers.route
        .probabilities[route],

    urgentProbability,

    latencyMs,
  };
}


// ============================================================
// SHARED LLM PROMPT
// ============================================================

function buildPrompt(ticket) {
  return `
You are a support ticket classifier.

Classify the ticket using exactly one route.

ROUTES:

billing:
${routeCriteria.billing}

technical:
${routeCriteria.technical}

account:
${routeCriteria.account}

general:
${routeCriteria.general}

URGENT:

urgent must be true only when the customer is
explicitly time-sensitive or completely blocked.

Return ONLY valid JSON.

The output must contain exactly these two fields:

{
  "route": "billing | technical | account | general",
  "urgent": true
}

Do not explain your answer.
Do not use markdown.

TICKET:

${ticket.text}
`;
}


// ============================================================
// GENERIC LLM
// ============================================================

async function runLLM(model, ticket) {
  const isOpenAI = model.startsWith('openai/');

  const start = performance.now();

  const result = await generateText({
    model,

    maxRetries: 0,

    // Reasoning models need room for reasoning + final answer.
    maxOutputTokens: isOpenAI ? 512 : 100,

    // Keep GPT reasoning minimal for this tiny classification task.
    ...(isOpenAI
      ? { reasoning: 'minimal' }
      : { temperature: 0 }),

    prompt: buildPrompt(ticket),
  });

  const latencyMs = performance.now() - start;

  const parsed = parseJSON(result.text);

  return {
    route: parsed.route,
    urgent: parsed.urgent,
    latencyMs,
    raw: result.text.trim(),
  };
}


// ============================================================
// LOAD / RESET PROGRESS
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
    '\n🧹 Starting fresh benchmark.\n'
  );
}


let results = [];

if (
  !fresh &&
  existsSync(PROGRESS_FILE)
) {
  const progress = JSON.parse(
    readFileSync(
      PROGRESS_FILE,
      'utf8'
    )
  );

  results =
    progress.results || [];

  console.log(
    `\n♻️ Resuming with ${results.length}/${tickets.length} tickets complete.\n`
  );
}


// ============================================================
// BENCHMARK
// ============================================================

console.log(
  '🔥 Jev vs general-purpose LLMs'
);

console.log(
  `Tickets: ${tickets.length}\n`
);

console.log(`Jev:   ${MODELS.jev}`);
console.log(`Nano:  ${MODELS.nano}`);
console.log(`Luna:  ${MODELS.luna}`);
console.log(`Llama: ${MODELS.llama}`);

console.log(
  '\nStarting benchmark...\n'
);


for (
  let i = 0;
  i < tickets.length;
  i++
) {
  const ticket =
    tickets[i];

  const existing =
    results.find(
      (r) => r.id === ticket.id
    );

  if (existing) {
    console.log(
      `[${i + 1}/${tickets.length}] already complete — skipping`
    );

    continue;
  }


  console.log(
    `\n[${i + 1}/${tickets.length}] ${ticket.text.slice(
      0,
      70
    )}...`
  );


  // ==========================================================
  // RUN ALL FOUR
  // ==========================================================

  const jev =
    await withRetry(
      'Jev',
      () => runJev(ticket)
    );


  const nano =
    await withRetry(
      'GPT-5 nano',
      () =>
        runLLM(
          MODELS.nano,
          ticket
        )
    );


  const luna =
    await withRetry(
      'GPT-5.6 Luna',
      () =>
        runLLM(
          MODELS.luna,
          ticket
        )
    );


  const llama =
    await withRetry(
      'Llama 3.3 70B',
      () =>
        runLLM(
          MODELS.llama,
          ticket
        )
    );


  // ==========================================================
  // BUILD ROW
  // ==========================================================

  const row = {
    id:
      ticket.id,

    text:
      ticket.text,

    expectedRoute:
      ticket.route,

    expectedUrgent:
      ticket.urgent,


    // JEV
    jevRoute:
      jev.route,

    jevUrgent:
      jev.urgent,

    jevRouteConfidence:
      jev.routeConfidence,

    jevUrgentProbability:
      jev.urgentProbability,

    jevLatencyMs:
      jev.latencyMs,


    // NANO
    nanoRoute:
      nano.route,

    nanoUrgent:
      nano.urgent,

    nanoLatencyMs:
      nano.latencyMs,


    // LUNA
    lunaRoute:
      luna.route,

    lunaUrgent:
      luna.urgent,

    lunaLatencyMs:
      luna.latencyMs,


    // LLAMA
    llamaRoute:
      llama.route,

    llamaUrgent:
      llama.urgent,

    llamaLatencyMs:
      llama.latencyMs,
  };


  // ==========================================================
  // ACCURACY
  // ==========================================================

  row.jevRouteCorrect =
    row.jevRoute ===
    ticket.route;

  row.jevUrgentCorrect =
    row.jevUrgent ===
    ticket.urgent;


  row.nanoRouteCorrect =
    row.nanoRoute ===
    ticket.route;

  row.nanoUrgentCorrect =
    row.nanoUrgent ===
    ticket.urgent;


  row.lunaRouteCorrect =
    row.lunaRoute ===
    ticket.route;

  row.lunaUrgentCorrect =
    row.lunaUrgent ===
    ticket.urgent;


  row.llamaRouteCorrect =
    row.llamaRoute ===
    ticket.route;

  row.llamaUrgentCorrect =
    row.llamaUrgent ===
    ticket.urgent;


  results.push(row);


  // ==========================================================
  // PRINT
  // ==========================================================

  console.log(
    `   Jev:   ${jev.route}/${jev.urgent} — ${jev.latencyMs.toFixed(
      0
    )} ms`
  );

  console.log(
    `   Nano:  ${nano.route}/${nano.urgent} — ${nano.latencyMs.toFixed(
      0
    )} ms`
  );

  console.log(
    `   Luna:  ${luna.route}/${luna.urgent} — ${luna.latencyMs.toFixed(
      0
    )} ms`
  );

  console.log(
    `   Llama: ${llama.route}/${llama.urgent} — ${llama.latencyMs.toFixed(
      0
    )} ms`
  );


  // ==========================================================
  // SAVE PROGRESS
  // ==========================================================

  writeFileSync(
    PROGRESS_FILE,

    JSON.stringify(
      {
        models: MODELS,
        results,
      },

      null,
      2
    )
  );
}


// ============================================================
// SUMMARY FUNCTION
// ============================================================

function summarize(prefix) {
  const latency =
    results.map(
      (r) =>
        r[
          `${prefix}LatencyMs`
        ]
    );

  const routeCorrect =
    results.filter(
      (r) =>
        r[
          `${prefix}RouteCorrect`
        ]
    ).length;

  const urgentCorrect =
    results.filter(
      (r) =>
        r[
          `${prefix}UrgentCorrect`
        ]
    ).length;

  const exactCorrect =
    results.filter(
      (r) =>
        r[
          `${prefix}RouteCorrect`
        ] &&
        r[
          `${prefix}UrgentCorrect`
        ]
    ).length;


  return {
    routeAccuracy:
      routeCorrect /
      results.length,

    urgentAccuracy:
      urgentCorrect /
      results.length,

    exactMatch:
      exactCorrect /
      results.length,

    latency:
      stats(latency),
  };
}


// ============================================================
// FINAL RESULTS
// ============================================================

const summary = {
  generatedAt:
    new Date().toISOString(),

  tickets:
    results.length,

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


// Speed ratios relative to Jev

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
// SAVE FINAL JSON
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
// TABLE OUTPUT
// ============================================================

function printModel(
  name,
  data
) {
  console.log(`\n${name}`);

  console.log(
    `Route accuracy:  ${(
      data.routeAccuracy *
      100
    ).toFixed(1)}%`
  );

  console.log(
    `Urgent accuracy: ${(
      data.urgentAccuracy *
      100
    ).toFixed(1)}%`
  );

  console.log(
    `Exact match:     ${(
      data.exactMatch *
      100
    ).toFixed(1)}%`
  );

  console.log(
    `Mean latency:    ${data.latency.mean.toFixed(
      0
    )} ms`
  );

  console.log(
    `Median latency:  ${data.latency.median.toFixed(
      0
    )} ms`
  );

  console.log(
    `P95 latency:     ${data.latency.p95.toFixed(
      0
    )} ms`
  );
}


console.log(
  '\n================================'
);

console.log(
  '         FINAL RESULTS'
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
  `Nano:  ${summary.speedup.nano.toFixed(
    2
  )}x slower than Jev`
);

console.log(
  `Luna:  ${summary.speedup.luna.toFixed(
    2
  )}x slower than Jev`
);

console.log(
  `Llama: ${summary.speedup.llama.toFixed(
    2
  )}x slower than Jev`
);


console.log(
  `\n✅ Full results saved to ${RESULTS_FILE}`
);