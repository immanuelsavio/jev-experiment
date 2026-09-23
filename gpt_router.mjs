import 'dotenv/config';
import { generateText, Output } from 'ai';
import { z } from 'zod';

const ticket = process.argv.slice(2).join(' ');

if (!ticket) {
  console.error('Please provide a support ticket.');
  process.exit(1);
}

const result = await generateText({
  model: 'meta/llama-3.3-70b',

  output: Output.object({
    schema: z.object({
      route: z.enum([
        'billing',
        'technical',
        'account',
        'general',
      ]),
      urgent: z.boolean(),
    }),
  }),

  prompt: `
Classify this customer support ticket.

ROUTES:

billing:
Payments, charges, refunds, invoices, or subscriptions.

technical:
Bugs, errors, outages, or broken functionality.

account:
Login, permissions, or account access.

general:
Anything else.

URGENT:
Return true only if the customer is explicitly time-sensitive or completely blocked.

Ticket:
${ticket}
`,
});

console.log(JSON.stringify(result.output));
