export const booleanCases = [
  // ==========================================================
  // FALSE — normal issues
  // ==========================================================

  {
    id: 1,
    text: "I was charged twice for my subscription and would like a refund.",
    expected: false,
  },
  {
    id: 2,
    text: "The export button downloads an empty CSV.",
    expected: false,
  },
  {
    id: 3,
    text: "I forgot my password and need help resetting it.",
    expected: false,
  },
  {
    id: 4,
    text: "Can you send me a copy of last month's invoice?",
    expected: false,
  },
  {
    id: 5,
    text: "Images look blurry on mobile devices.",
    expected: false,
  },
  {
    id: 6,
    text: "How do I add another administrator to my workspace?",
    expected: false,
  },
  {
    id: 7,
    text: "Our webhook occasionally takes a few seconds longer than usual.",
    expected: false,
  },
  {
    id: 8,
    text: "Do you offer discounts for nonprofit organizations?",
    expected: false,
  },
  {
    id: 9,
    text: "Two-factor authentication codes are going to my old phone.",
    expected: false,
  },
  {
    id: 10,
    text: "The dashboard loads slowly when I have more than 100 projects.",
    expected: false,
  },
  {
    id: 11,
    text: "My refund was approved but has not appeared after three business days.",
    expected: false,
  },
  {
    id: 12,
    text: "Can I change the email address associated with my profile?",
    expected: false,
  },
  {
    id: 13,
    text: "One report is displaying the wrong date format.",
    expected: false,
  },
  {
    id: 14,
    text: "Does your API support pagination?",
    expected: false,
  },
  {
    id: 15,
    text: "My coworker cannot access one optional analytics dashboard.",
    expected: false,
  },
  {
    id: 16,
    text: "Our integration failed once this morning but is working again.",
    expected: false,
  },
  {
    id: 17,
    text: "I would like to cancel my subscription at the end of the month.",
    expected: false,
  },
  {
    id: 18,
    text: "The search page sometimes takes around five seconds to load.",
    expected: false,
  },
  {
    id: 19,
    text: "Where can I find your security documentation?",
    expected: false,
  },
  {
    id: 20,
    text: "My credit card was declined while trying to upgrade my plan.",
    expected: false,
  },

  // ==========================================================
  // TRUE — immediate escalation
  // ==========================================================

  {
    id: 21,
    text: "Production is completely down and none of our customers can place orders.",
    expected: true,
  },
  {
    id: 22,
    text: "Someone changed my account password and email address and I cannot get back in.",
    expected: true,
  },
  {
    id: 23,
    text: "Our API is returning HTTP 500 for every production request.",
    expected: true,
  },
  {
    id: 24,
    text: "I need access restored before a client presentation that starts in 20 minutes.",
    expected: true,
  },
  {
    id: 25,
    text: "There are transactions appearing in our account that nobody on our team made.",
    expected: true,
  },
  {
    id: 26,
    text: "Every user in our company is currently unable to log in.",
    expected: true,
  },
  {
    id: 27,
    text: "Our checkout is completely unavailable during our live product launch.",
    expected: true,
  },
  {
    id: 28,
    text: "I received a login notification from another country and my password has already been changed.",
    expected: true,
  },
  {
    id: 29,
    text: "The site is blank for all visitors and our campaign launches in 30 minutes.",
    expected: true,
  },
  {
    id: 30,
    text: "Our production database connection is failing for every request.",
    expected: true,
  },
  {
    id: 31,
    text: "I accidentally exposed an API key publicly and it is still active.",
    expected: true,
  },
  {
    id: 32,
    text: "Nobody can process payments and customers are currently waiting at checkout.",
    expected: true,
  },
  {
    id: 33,
    text: "I have a board meeting in 45 minutes and our account is completely inaccessible.",
    expected: true,
  },
  {
    id: 34,
    text: "We are seeing account activity from an unknown administrator right now.",
    expected: true,
  },
  {
    id: 35,
    text: "All webhook deliveries have stopped and this is blocking our production order pipeline.",
    expected: true,
  },
  {
    id: 36,
    text: "Our entire support team is locked out and cannot respond to customers.",
    expected: true,
  },
  {
    id: 37,
    text: "A user who left the company is currently accessing confidential customer records.",
    expected: true,
  },
  {
    id: 38,
    text: "Our service is returning errors to every customer and there is no workaround.",
    expected: true,
  },
  {
    id: 39,
    text: "I need this fixed within 15 minutes or our scheduled customer demo cannot happen.",
    expected: true,
  },
  {
    id: 40,
    text: "Someone disabled our administrator accounts and we believe the workspace has been compromised.",
    expected: true,
  },
];