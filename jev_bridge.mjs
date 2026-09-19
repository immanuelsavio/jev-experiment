import dotenv from 'dotenv';
import { experimental_evaluate as evaluate } from 'ai';

dotenv.config({ quiet: true });

const ticket = process.argv.slice(2).join(' ');

if (!ticket) {
  console.error('Please provide a support ticket.');
  process.exit(1);
}

const result = await evaluate({
  model: 'typesafe-ai/jev',

  state: ticket,

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
      instructions:
        'Is the customer explicitly time-sensitive or completely blocked?',
    },
  },
});

console.log(JSON.stringify(result.answers));