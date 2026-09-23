# Jev vs general-purpose LLMs: decision benchmarks

Four small benchmarks comparing [TypeSafe AI's Jev](https://www.typesafe.ai/), a typed decision model, with three general-purpose LLMs on bounded decisions: routing, escalation and severity.

Write-up: [Do You Need a Generative LLM for Every AI Decision?](https://immanuelsavio.com/blog/jev-decision-models)

All models are called through the Vercel AI Gateway:

| Key     | Model                 |
| ------- | --------------------- |
| `jev`   | `typesafe-ai/jev`     |
| `nano`  | `openai/gpt-5-nano`   |
| `luna`  | `openai/gpt-5.6-luna` |
| `llama` | `meta/llama-3.3-70b`  |

## Question

A lot of "AI" inside real systems is a bounded decision: which tool to call, whether to escalate, how severe something is. The set of answers is known up front. Do those decisions need a generative LLM, or is a model built for typed decisions a better fit?

## Experiments

Each experiment has 40 hand-labeled cases.

| # | Experiment | Jev question type | Dataset | Script | Results |
| - | ---------- | ----------------- | ------- | ------ | ------- |
| 1 | Support routing + urgency (composed) | Choice + Boolean | `tickets.mjs` | `benchmark.mjs` | `results/01-support-routing-choice-boolean.json` |
| 2 | Immediate escalation | Boolean | `boolean_cases.mjs` | `benchmark_boolean.mjs` | `results/02-boolean-escalation.json` |
| 3 | Incident severity (0 to 4) | Score | `score_cases.mjs` | `benchmark_score.mjs` | `results/03-score-severity.json` |
| 4 | Agent tool routing | Choice | `choice_cases.mjs` | `benchmark_choice.mjs` | `results/04-choice-agent-routing.json` |

1. **Composed.** Route a support ticket to `billing`, `technical`, `account` or `general` (10 each) and decide if it's urgent ("explicitly time-sensitive or completely blocked"). Both questions go to Jev in one `evaluate()` call.
2. **Boolean.** Does the case need immediate escalation under an explicit policy: complete production/core outage, active security compromise or exposed credential, or a stated deadline within 60 minutes. 20 positive, 20 negative.
3. **Score.** Severity on a five-level rubric (no incident, minor, moderate, high, critical). 8 cases per level.
4. **Choice.** Route an agent request to `knowledge_base`, `account_tool`, `billing_tool` or `human_escalation`. 10 per class.

## Results

| Experiment | Jev | GPT-5 nano | GPT-5.6 Luna | Llama 3.3 70B |
| ---------- | --: | ---------: | -----------: | ------------: |
| Boolean accuracy | **100%** | 97.5% | **100%** | **100%** |
| Score rounded accuracy | 97.5% | 32.5% | **100%** | 95% |
| Score MAE | **0.067** | 0.795 | 0.075 | 0.095 |
| Choice accuracy | **100%** | 50% | **100%** | **100%** |
| Composed routing | 97.5% | 95% | 95% | **100%** |
| Composed urgency | 82.5% | **97.5%** | 92.5% | 72.5% |
| Composed exact match | 80% | **92.5%** | 87.5% | 72.5% |

Median latency:

| Experiment | Jev | GPT-5 nano | GPT-5.6 Luna | Llama 3.3 70B |
| ---------- | --: | ---------: | -----------: | ------------: |
| Composed | **289 ms** | 787 ms | 851 ms | 372 ms |
| Boolean | **286 ms** | 796 ms | 1,014 ms | 382 ms |
| Score | **315 ms** | 1,203 ms | 1,225 ms | 565 ms |
| Choice | **304 ms** | 1,117 ms | 1,266 ms | 551 ms |

p95 latency:

| Experiment | Jev | GPT-5 nano | GPT-5.6 Luna | Llama 3.3 70B |
| ---------- | --: | ---------: | -----------: | ------------: |
| Composed | **376 ms** | 1,348 ms | 2,278 ms | 526 ms |
| Boolean | **401 ms** | 1,385 ms | 2,130 ms | 600 ms |
| Score | **462 ms** | 1,893 ms | 2,762 ms | 1,168 ms |
| Choice | **450 ms** | 1,663 ms | 7,043 ms | 747 ms |

Notes:

- All 7 of Jev's composed urgency misses were over-escalations (labeled not urgent, predicted urgent). Luna and Llama over-escalated mostly the same tickets. The one-line urgency rule in experiment 1 is looser than the labels, so this is at least partly a spec problem, not only a model problem.
- The standalone and composed Boolean runs use different datasets and instructions. They are not a controlled test of whether asking two questions at once hurts accuracy.
- GPT-5 nano sent all 20 of its Choice misses to `account_tool`.
- Brier scores are in the result files but 40 cases is too few to say anything general about calibration.

## How each model is called

Jev uses the AI SDK's `evaluate()` and returns typed answers directly:

```js
import { experimental_evaluate as evaluate } from 'ai';

const result = await evaluate({
  model: 'typesafe-ai/jev',
  state: ticket.text,
  questions: {
    route: {
      type: 'choice',
      instructions: 'Which team should handle this ticket?',
      criteria: {
        billing: 'Payments, charges, refunds, invoices, or subscriptions',
        technical: 'Bugs, errors, outages, or broken functionality',
        account: 'Login, permissions, or account access',
        general: 'Anything else',
      },
    },
    urgent: {
      type: 'boolean',
      instructions: 'Is the customer explicitly time-sensitive or completely blocked?',
    },
  },
});

result.answers.route.choice;        // 'account'
result.answers.route.probabilities; // { account: 1, technical: 0, ... }
result.answers.urgent.probability;  // 0.96
```

The LLMs get the same definitions in a prompt through `generateText()`, are asked to return only JSON, and the output is parsed and validated. In the composed experiment they return `{ route, urgent }` with `urgent` as a boolean. In the standalone Boolean, Score and Choice experiments they return a probability (or a probability per level or per class), so the metrics line up with Jev's.

Settings:

- OpenAI models: `reasoning: 'minimal'`
- Llama: `temperature: 0`
- Boolean decisions: `probability >= 0.5` counts as `true` for every model
- Score: Jev's continuous score is rounded for accuracy; MAE and RMSE use the raw value

## Metrics

- **Accuracy** per question; exact match for the composed experiment (route and urgency both correct)
- **Brier score** for Boolean and Choice probabilities
- **MAE, RMSE, rounded accuracy, within-one accuracy** for Score
- **Per-class accuracy** and mean confidence on correct vs incorrect answers for Choice
- **Latency** from `performance.now()` around each model call: mean, median, p95, min, max

## Methodology

- Each case is sent to all four models in a fixed order: Jev, nano, Luna, Llama. There is no warm-up request.
- Failed calls are retried with backoff.
- Progress is saved after every case to a `*-progress.json` file (git-ignored), so an interrupted run resumes where it stopped. Pass `--fresh` to start over.
- Latencies are end-to-end from a laptop through the gateway, so network and provider load are included. Treat them as observed numbers, not a controlled infrastructure benchmark.
- Each benchmark was run once, on 2026-09-19.

## Running it

```bash
npm install
```

Create `.env`:

```text
AI_GATEWAY_API_KEY=your_vercel_ai_gateway_key
```

Run any benchmark:

```bash
node benchmark.mjs            # 1. composed routing + urgency
node benchmark_boolean.mjs    # 2. escalation
node benchmark_score.mjs      # 3. severity
node benchmark_choice.mjs     # 4. agent tool routing

node benchmark_score.mjs --fresh   # ignore saved progress and rerun
```

Quick single-ticket checks:

```bash
node jev_bridge.mjs "I cannot log into my account and I have a client demo in 10 minutes."
node gpt_router.mjs "I cannot log into my account and I have a client demo in 10 minutes."
```

`gpt_router.mjs` uses a Zod schema via `Output.object`. Change its `model` to try other gateway models.

## Project structure

```text
.
├── benchmark.mjs              # 1. composed Choice + Boolean
├── benchmark_boolean.mjs      # 2. Boolean escalation
├── benchmark_score.mjs        # 3. Score severity
├── benchmark_choice.mjs       # 4. Choice agent routing
├── tickets.mjs                # dataset for 1
├── boolean_cases.mjs          # dataset for 2
├── score_cases.mjs            # dataset for 3
├── choice_cases.mjs           # dataset for 4
├── results/                   # summary + per-case results for each experiment
├── benchmark-results.json     # raw output of benchmark.mjs (same as results/01)
├── jev_bridge.mjs             # single-ticket Jev check
├── gpt_router.mjs             # single-ticket LLM check
└── package.json
```

## Limitations

- Four small handcrafted datasets, 40 cases each, labeled by one person.
- One run per benchmark.
- No cost comparison.
- This says nothing about which model is "smarter". It only covers these bounded decisions under these definitions.
