export const choiceCases = [
  // ==========================================================
  // KNOWLEDGE BASE
  // Answerable from product documentation / general knowledge
  // ==========================================================

  {
    id: 1,
    text: "Where can I find the API documentation?",
    expected: "knowledge_base",
  },
  {
    id: 2,
    text: "Does the product support SAML single sign-on?",
    expected: "knowledge_base",
  },
  {
    id: 3,
    text: "What is the difference between the Pro and Enterprise plans?",
    expected: "knowledge_base",
  },
  {
    id: 4,
    text: "Which countries are supported?",
    expected: "knowledge_base",
  },
  {
    id: 5,
    text: "How long is customer data retained after cancellation?",
    expected: "knowledge_base",
  },
  {
    id: 6,
    text: "Does the API have rate limits?",
    expected: "knowledge_base",
  },
  {
    id: 7,
    text: "Do you integrate with Salesforce?",
    expected: "knowledge_base",
  },
  {
    id: 8,
    text: "Where can I download your SOC 2 report?",
    expected: "knowledge_base",
  },
  {
    id: 9,
    text: "Can users export reports as CSV?",
    expected: "knowledge_base",
  },
  {
    id: 10,
    text: "How many projects are included in the Enterprise plan?",
    expected: "knowledge_base",
  },

  // ==========================================================
  // ACCOUNT TOOL
  // User-specific identity, login, profile, roles, permissions
  // ==========================================================

  {
    id: 11,
    text: "I forgot my password and need to reset it.",
    expected: "account_tool",
  },
  {
    id: 12,
    text: "Please change the email address associated with my account.",
    expected: "account_tool",
  },
  {
    id: 13,
    text: "Add my coworker as an administrator.",
    expected: "account_tool",
  },
  {
    id: 14,
    text: "I can sign in but I don't have permission to open analytics.",
    expected: "account_tool",
  },
  {
    id: 15,
    text: "Two-factor authentication codes are still going to my old phone.",
    expected: "account_tool",
  },
  {
    id: 16,
    text: "Remove a former employee from our workspace.",
    expected: "account_tool",
  },
  {
    id: 17,
    text: "I need to update the name shown on my profile.",
    expected: "account_tool",
  },
  {
    id: 18,
    text: "My teammate needs access to our shared project.",
    expected: "account_tool",
  },
  {
    id: 19,
    text: "I accidentally removed my own administrator permission.",
    expected: "account_tool",
  },
  {
    id: 20,
    text: "Please transfer workspace ownership to my manager.",
    expected: "account_tool",
  },

  // ==========================================================
  // BILLING TOOL
  // Payments, invoices, refunds, plans, subscription transactions
  // ==========================================================

  {
    id: 21,
    text: "I was charged twice for my subscription.",
    expected: "billing_tool",
  },
  {
    id: 22,
    text: "Please refund my most recent payment.",
    expected: "billing_tool",
  },
  {
    id: 23,
    text: "I need a copy of last month's invoice.",
    expected: "billing_tool",
  },
  {
    id: 24,
    text: "My credit card is being declined when I try to upgrade.",
    expected: "billing_tool",
  },
  {
    id: 25,
    text: "Cancel my subscription at the end of this billing period.",
    expected: "billing_tool",
  },
  {
    id: 26,
    text: "The invoice shows $129 but my contract says $89.",
    expected: "billing_tool",
  },
  {
    id: 27,
    text: "My approved refund has not appeared in my bank account.",
    expected: "billing_tool",
  },
  {
    id: 28,
    text: "Change the payment card used for our subscription.",
    expected: "billing_tool",
  },
  {
    id: 29,
    text: "We upgraded yesterday but are still being billed for both plans.",
    expected: "billing_tool",
  },
  {
    id: 30,
    text: "Our annual renewal payment failed.",
    expected: "billing_tool",
  },

  // ==========================================================
  // HUMAN ESCALATION
  // Security compromise, destructive/high-risk action,
  // legal/compliance exception, or suspected unauthorized activity
  // ==========================================================

  {
    id: 31,
    text: "Someone changed my password and email address and I cannot regain control of the account.",
    expected: "human_escalation",
  },
  {
    id: 32,
    text: "There are financial transactions in our account that nobody on our team made.",
    expected: "human_escalation",
  },
  {
    id: 33,
    text: "An employee who left the company is currently accessing confidential customer records.",
    expected: "human_escalation",
  },
  {
    id: 34,
    text: "I exposed our production API key publicly and can see unknown requests using it.",
    expected: "human_escalation",
  },
  {
    id: 35,
    text: "Please permanently delete every customer record immediately. There is no backup.",
    expected: "human_escalation",
  },
  {
    id: 36,
    text: "An unknown administrator was added to our company workspace.",
    expected: "human_escalation",
  },
  {
    id: 37,
    text: "We received a government request for customer data and need to know whether to release it.",
    expected: "human_escalation",
  },
  {
    id: 38,
    text: "Someone appears to be exporting thousands of customer records from our account right now.",
    expected: "human_escalation",
  },
  {
    id: 39,
    text: "I want you to disable every administrator account in our production organization.",
    expected: "human_escalation",
  },
  {
    id: 40,
    text: "Our security team believes the workspace has been compromised by an attacker.",
    expected: "human_escalation",
  },
];