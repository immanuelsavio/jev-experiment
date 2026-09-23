export const scoreCases = [
  // ==========================================================
  // 0 — NONE
  // No incident / informational request
  // ==========================================================

  {
    id: 1,
    text: "Where can I find the API documentation?",
    expected: 0,
  },
  {
    id: 2,
    text: "Do you offer discounts for nonprofit organizations?",
    expected: 0,
  },
  {
    id: 3,
    text: "What is the difference between the Pro and Enterprise plans?",
    expected: 0,
  },
  {
    id: 4,
    text: "Which countries are currently supported?",
    expected: 0,
  },
  {
    id: 5,
    text: "Can your product integrate with Salesforce?",
    expected: 0,
  },
  {
    id: 6,
    text: "How long do you retain customer data?",
    expected: 0,
  },
  {
    id: 7,
    text: "Do you have SOC 2 certification?",
    expected: 0,
  },
  {
    id: 8,
    text: "Can I invite more than 50 users to my workspace?",
    expected: 0,
  },

  // ==========================================================
  // 1 — LOW
  // Minor problem, cosmetic issue, or easy workaround
  // ==========================================================

  {
    id: 9,
    text: "One icon on the settings page is slightly misaligned.",
    expected: 1,
  },
  {
    id: 10,
    text: "The date is displayed as MM/DD instead of DD/MM, but all data is correct.",
    expected: 1,
  },
  {
    id: 11,
    text: "The dashboard loads a little slowly, but everything still works.",
    expected: 1,
  },
  {
    id: 12,
    text: "Images look slightly blurry on my phone but are fine on desktop.",
    expected: 1,
  },
  {
    id: 13,
    text: "I cannot change my profile picture, but the rest of my account works.",
    expected: 1,
  },
  {
    id: 14,
    text: "The export filename is wrong, but the exported data itself is correct.",
    expected: 1,
  },
  {
    id: 15,
    text: "Search sometimes takes five seconds instead of one second.",
    expected: 1,
  },
  {
    id: 16,
    text: "One tooltip is covering part of a button, but I can still click the button.",
    expected: 1,
  },

  // ==========================================================
  // 2 — MODERATE
  // Real functionality impaired, but workaround exists
  // or impact is limited
  // ==========================================================

  {
    id: 17,
    text: "CSV export is broken, but I can still download the same data as JSON.",
    expected: 2,
  },
  {
    id: 18,
    text: "Three people on my team cannot open analytics, but the rest of the team can.",
    expected: 2,
  },
  {
    id: 19,
    text: "Webhook delivery is failing intermittently, but retrying usually works.",
    expected: 2,
  },
  {
    id: 20,
    text: "The mobile application crashes when uploading PDFs, but uploads work from the website.",
    expected: 2,
  },
  {
    id: 21,
    text: "Our integration is timing out occasionally, but most requests still succeed.",
    expected: 2,
  },
  {
    id: 22,
    text: "I cannot pay with one credit card, but another card works.",
    expected: 2,
  },
  {
    id: 23,
    text: "The reporting page is unavailable for one department, but their normal workflow still works.",
    expected: 2,
  },
  {
    id: 24,
    text: "Email notifications stopped arriving, but users can still see all notifications inside the application.",
    expected: 2,
  },

  // ==========================================================
  // 3 — HIGH
  // Major feature unavailable / substantial users blocked,
  // but not complete platform-wide catastrophe
  // ==========================================================

  {
    id: 25,
    text: "Nobody on our finance team can generate invoices, and there is no workaround.",
    expected: 3,
  },
  {
    id: 26,
    text: "About half of our users cannot sign in after today's deployment.",
    expected: 3,
  },
  {
    id: 27,
    text: "Customers can browse our store, but checkout is failing for most orders.",
    expected: 3,
  },
  {
    id: 28,
    text: "Our primary integration has stopped working completely and our operations team is entering everything manually.",
    expected: 3,
  },
  {
    id: 29,
    text: "All scheduled reports failed this morning and our finance team cannot complete its normal workflow.",
    expected: 3,
  },
  {
    id: 30,
    text: "The admin console is completely unavailable, although regular users can still use the product.",
    expected: 3,
  },
  {
    id: 31,
    text: "File uploads are failing for every user, but the rest of the application remains available.",
    expected: 3,
  },
  {
    id: 32,
    text: "Our customer support agents cannot access customer records, although customers can still use the service.",
    expected: 3,
  },

  // ==========================================================
  // 4 — CRITICAL
  // Complete core outage, active compromise, severe data/
  // financial integrity event
  // ==========================================================

  {
    id: 33,
    text: "Production is completely down and none of our customers can use the service.",
    expected: 4,
  },
  {
    id: 34,
    text: "Someone compromised our administrator account and is actively downloading customer records.",
    expected: 4,
  },
  {
    id: 35,
    text: "Every production API request is returning HTTP 500 and all customer applications are offline.",
    expected: 4,
  },
  {
    id: 36,
    text: "Unauthorized financial transactions are currently being created from our account.",
    expected: 4,
  },
  {
    id: 37,
    text: "Our production database is unavailable and every customer request is failing.",
    expected: 4,
  },
  {
    id: 38,
    text: "An exposed production credential is currently being used by an unknown attacker.",
    expected: 4,
  },
  {
    id: 39,
    text: "Our checkout system is completely down worldwide and no customer can place an order.",
    expected: 4,
  },
  {
    id: 40,
    text: "Customer records are being deleted from production by an unauthorized administrator right now.",
    expected: 4,
  },
];