# Jev vs GPT-5 nano: Decision Model Benchmark

This project explores how [TypeSafe AI's Jev](https://www.typesafe.ai/) compares with a general-purpose LLM on a simple production-style decision task.

Rather than comparing text generation quality, the experiment focuses on something Jev is designed for:

> **Fast, structured decisions.**

The benchmark compares:

- **Jev** — `typesafe-ai/jev`
- **GPT-5 nano** — `openai/gpt-5-nano`

Both models are accessed through the **Vercel AI Gateway**.

---

## Why this experiment?

A lot of AI applications use large language models for decisions that do not actually require text generation.

Examples include:

- Which tool should an agent call?
- Which team should receive a support ticket?
- Should a workflow retry or stop?
- Is an output acceptable?
- Should a request be escalated?
- Is something urgent?

Jev is designed specifically for these kinds of probabilistic decisions.

The question behind this experiment is:

> **Do we need a general-purpose generative LLM for every decision inside an AI system?**

---

## Task

The benchmark uses a customer-support routing task.

Each support ticket requires two decisions.

### 1. Route

The model must choose one of:

```text
billing
technical
account
general
````

### 2. Urgency

The model must decide:

```text
urgent = true / false
```

A ticket is considered urgent when the customer is explicitly time-sensitive or completely blocked.

Example:

```text
"I cannot log into my account and I have a client demo in 10 minutes."
```

Expected result:

```json
{
  "route": "account",
  "urgent": true
}
```

---

## Dataset

The benchmark contains **40 manually labeled support tickets**.

The dataset is balanced across four routing categories:

| Category  | Tickets |
| --------- | ------: |
| Billing   |      10 |
| Technical |      10 |
| Account   |      10 |
| General   |      10 |
| **Total** |  **40** |

The dataset includes both straightforward and intentionally overlapping cases.

For example:

```text
"The payment screen throws an error before I can enter my card details."
```

Although the ticket mentions payment, the underlying problem is technical.

Another example:

```text
"Our subscription expires today because the renewal payment failed
and our team needs access for a client launch in one hour."
```

This combines billing, account access, and urgency signals.

The labeled dataset is available in:

```text
tickets.mjs
```

---

## Models

### Jev

```text
typesafe-ai/jev
```

Jev uses Vercel AI SDK's evaluation interface.

Instead of generating text, it directly evaluates typed questions.

For routing, Jev returns a probability distribution:

```json
{
  "choice": "account",
  "probabilities": {
    "account": 1,
    "technical": 0,
    "billing": 0,
    "general": 0
  }
}
```

For boolean decisions, Jev returns a probability:

```json
{
  "probability": 0.96
}
```

For this benchmark:

```text
probability >= 0.5 → true
probability < 0.5 → false
```

---

### GPT-5 nano

```text
openai/gpt-5-nano
```

GPT-5 nano is used as the general-purpose LLM baseline.

Its output is constrained using a Zod schema:

```json
{
  "route": "account",
  "urgent": true
}
```

This keeps the output format comparable with Jev.

---

## Metrics

The benchmark measures:

### Accuracy

* Route accuracy
* Urgency accuracy
* Exact match accuracy

Exact match requires both:

```text
route == expected route
AND
urgent == expected urgency
```

### Latency

For every request:

```javascript
performance.now()
```

is measured before and after the model call.

The benchmark reports:

* Mean latency
* Median latency
* P95 latency
* Minimum latency
* Maximum latency

Median and P95 are emphasized instead of relying on a single request.

---

## Benchmark methodology

Before collecting measurements, each model receives one warm-up request.

The warm-up request is **not included in the final results**.

For the 40 measured examples, execution order alternates:

```text
Ticket 1: Jev → GPT
Ticket 2: GPT → Jev
Ticket 3: Jev → GPT
Ticket 4: GPT → Jev
...
```

This reduces bias caused by one model always being called first.

All raw results are saved to:

```text
benchmark-results.json
```

---

# Results

> Results will be populated after running the benchmark.

| Metric           | Jev | GPT-5 nano |
| ---------------- | --: | ---------: |
| Route accuracy   | TBD |        TBD |
| Urgency accuracy | TBD |        TBD |
| Exact match      | TBD |        TBD |
| Median latency   | TBD |        TBD |
| P95 latency      | TBD |        TBD |

---

## Example result

For:

```text
"I cannot log into my account and I have a client demo in 10 minutes."
```

Jev returned:

```json
{
  "route": {
    "choice": "account",
    "probabilities": {
      "account": 1,
      "technical": 0,
      "billing": 0,
      "general": 0
    }
  },
  "urgent": {
    "probability": 0.96
  }
}
```

GPT-5 nano returned:

```json
{
  "route": "account",
  "urgent": true
}
```

Both models made the same decision.

The interesting difference is how they arrive at and expose that decision:

```text
Jev
→ specialized probabilistic decision model
→ returns probabilities directly

GPT-5 nano
→ general-purpose generative model
→ constrained into structured output
```

---

## Running the experiment

Install dependencies:

```bash
npm install
```

Create a `.env` file:

```text
AI_GATEWAY_API_KEY=your_vercel_ai_gateway_key
```

Then run:

```bash
node benchmark.mjs
```

Raw benchmark data will be written to:

```text
benchmark-results.json
```

---

## Project structure

```text
.
├── benchmark.mjs
├── benchmark-results.json
├── gpt_router.mjs
├── jev_bridge.mjs
├── tickets.mjs
├── package.json
└── README.md
```

### `jev_bridge.mjs`

Simple standalone Jev test.

### `gpt_router.mjs`

Simple standalone GPT-5 nano test.

### `tickets.mjs`

The labeled benchmark dataset.

### `benchmark.mjs`

Runs both models, measures latency and accuracy, and produces the benchmark results.

---

## What I am trying to learn

This benchmark is not intended to prove that one model is universally better than another.

Jev and GPT-5 nano serve different purposes.

The experiment is meant to explore where a specialized decision model may be useful inside larger AI systems.

A possible architecture might look like:

```text
LLM
↓
Reasoning / generation

Jev
↓
Routing / classification / verification / control decisions

Code
↓
Deterministic business logic
```

The interesting question is not:

> "Can Jev replace an LLM?"

It is:

> **"Which decisions inside an AI system actually need an LLM?"**

---

## Reproducibility

The complete dataset, model definitions, benchmark code, and raw results are included in this repository.

This makes the benchmark easy to inspect, rerun, or extend with additional models.