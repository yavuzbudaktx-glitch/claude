// A rotating bank of CPA-exam-style multiple-choice questions, one surfaced
// per day on the Accounting page. Sections use the post-2024 CPA Evolution
// model: FAR, AUD, REG (core) plus the disciplines (BAR, ISC, TCP). Kept
// self-contained (no external API) so it's rock-solid.

export type CpaSection = "FAR" | "AUD" | "REG" | "BAR" | "ISC" | "TCP";

export interface CpaQuestion {
  section: CpaSection;
  q: string;
  choices: string[];   // exactly 4
  answer: number;      // index into choices
  why: string;         // one-line explanation of the correct answer
}

export const CPA_QUESTIONS: CpaQuestion[] = [
  {
    section: "FAR",
    q: "A company receives $12,000 on Oct 1 for a one-year service contract. Under accrual accounting, how much revenue is recognized by Dec 31?",
    choices: ["$0", "$3,000", "$9,000", "$12,000"],
    answer: 1,
    why: "3 of 12 months earned → $12,000 × 3/12 = $3,000; the rest is unearned (deferred) revenue.",
  },
  {
    section: "FAR",
    q: "Which inventory method generally produces the HIGHEST net income in a period of rising prices?",
    choices: ["LIFO", "FIFO", "Weighted average", "Specific identification"],
    answer: 1,
    why: "FIFO expenses the oldest (cheapest) costs to COGS, leaving lower COGS and higher income when prices rise.",
  },
  {
    section: "FAR",
    q: "Goodwill is recognized when:",
    choices: [
      "A company generates it internally over time",
      "Purchase price of an acquired business exceeds the fair value of identifiable net assets",
      "Fair value of net assets exceeds the purchase price",
      "A patent is amortized",
    ],
    answer: 1,
    why: "Goodwill = consideration transferred − fair value of identifiable net assets acquired. Internally generated goodwill is never recorded.",
  },
  {
    section: "FAR",
    q: "A bond issued at a discount will have an interest expense (effective-interest method) that, each period, is:",
    choices: ["Equal to the cash paid", "Less than the cash paid", "Greater than the cash paid", "Zero"],
    answer: 2,
    why: "Discount bonds: interest expense = carrying value × market rate, which exceeds the cash coupon; the difference amortizes the discount.",
  },
  {
    section: "FAR",
    q: "Treasury stock is reported on the balance sheet as:",
    choices: ["An asset", "A contra-equity account", "A liability", "Revenue"],
    answer: 1,
    why: "Treasury stock reduces total stockholders' equity — it's a contra-equity account, never an asset.",
  },
  {
    section: "AUD",
    q: "Which type of audit opinion is issued when financial statements are fairly presented in all material respects?",
    choices: ["Qualified", "Adverse", "Unmodified (unqualified)", "Disclaimer"],
    answer: 2,
    why: "An unmodified opinion is the clean 'fairly presented' opinion. The others signal a problem or a scope limitation.",
  },
  {
    section: "AUD",
    q: "Inherent risk and control risk together make up:",
    choices: ["Detection risk", "Audit risk", "Risk of material misstatement", "Sampling risk"],
    answer: 2,
    why: "RMM = inherent risk × control risk. Audit risk = RMM × detection risk.",
  },
  {
    section: "AUD",
    q: "An auditor's independence is MOST clearly impaired by:",
    choices: [
      "Auditing a company in an industry they specialize in",
      "Owning shares of the audit client",
      "Having audited the client for many years",
      "Charging a fixed fee",
    ],
    answer: 1,
    why: "A direct financial interest (owning the client's stock) impairs independence in fact and appearance.",
  },
  {
    section: "AUD",
    q: "The purpose of a management representation letter is to:",
    choices: [
      "Replace substantive audit procedures",
      "Corroborate other evidence and confirm management's responsibility",
      "Give the auditor legal immunity",
      "Serve as the audit opinion",
    ],
    answer: 1,
    why: "The rep letter corroborates evidence and documents management's acknowledgment of its responsibilities — it does not replace testing.",
  },
  {
    section: "REG",
    q: "For a single taxpayer in 2024, long-term capital gains are taxed at a preferential rate because the asset was held for:",
    choices: ["More than 6 months", "More than 1 year", "More than 2 years", "Any length of time"],
    answer: 1,
    why: "Long-term treatment requires a holding period of more than one year; one year or less is short-term (ordinary rates).",
  },
  {
    section: "REG",
    q: "Which entity generally provides its owners LIMITED liability AND pass-through taxation by default?",
    choices: ["C corporation", "General partnership", "Sole proprietorship", "LLC"],
    answer: 3,
    why: "An LLC gives limited liability and, by default, pass-through taxation (single-member = disregarded; multi-member = partnership).",
  },
  {
    section: "REG",
    q: "The 'wash sale' rule disallows a loss when substantially identical stock is repurchased within:",
    choices: ["7 days", "30 days before or after", "60 days after only", "1 year"],
    answer: 1,
    why: "A wash sale occurs if you buy substantially identical securities within 30 days before OR after the sale; the loss is deferred, not lost.",
  },
  {
    section: "REG",
    q: "Under the accrual method, an expense is generally deductible when:",
    choices: [
      "It is paid in cash",
      "The all-events test is met and economic performance occurs",
      "It is authorized by the board",
      "The invoice is received",
    ],
    answer: 1,
    why: "Accrual deductions require the all-events test (fixed liability + determinable amount) AND economic performance.",
  },
  {
    section: "BAR",
    q: "A company's degree of operating leverage is high when it has:",
    choices: ["Mostly variable costs", "Mostly fixed costs", "No costs", "Only period costs"],
    answer: 1,
    why: "High fixed costs magnify the effect of sales changes on operating income → high operating leverage.",
  },
  {
    section: "BAR",
    q: "Contribution margin equals:",
    choices: [
      "Sales − fixed costs",
      "Sales − variable costs",
      "Sales − total costs",
      "Fixed costs ÷ units",
    ],
    answer: 1,
    why: "Contribution margin = sales − variable costs; it's what's left to cover fixed costs and profit.",
  },
  {
    section: "BAR",
    q: "In the DuPont framework, Return on Equity is driven by profit margin, asset turnover, and:",
    choices: ["Dividend payout", "The equity (financial-leverage) multiplier", "Tax rate only", "Inventory days"],
    answer: 1,
    why: "ROE = net profit margin × asset turnover × equity multiplier (assets/equity).",
  },
  {
    section: "ISC",
    q: "The security principle that grants users only the access needed to do their job is called:",
    choices: ["Segregation of duties", "Least privilege", "Defense in depth", "Change management"],
    answer: 1,
    why: "Least privilege limits each user's access to the minimum required, shrinking the attack surface.",
  },
  {
    section: "ISC",
    q: "In a SOC 1 report, the controls being examined relate to:",
    choices: [
      "A service organization's controls over financial reporting",
      "Cybersecurity marketing claims",
      "The user entity's tax return",
      "Physical building security only",
    ],
    answer: 0,
    why: "SOC 1 addresses controls at a service organization relevant to user entities' internal control over financial reporting (ICFR).",
  },
  {
    section: "TCP",
    q: "A taxpayer contributing appreciated property to a partnership generally recognizes:",
    choices: [
      "Gain equal to the full appreciation",
      "No gain (nonrecognition under §721)",
      "Ordinary income",
      "A capital loss",
    ],
    answer: 1,
    why: "§721 provides nonrecognition on contributions of property to a partnership in exchange for an interest (built-in gain is tracked).",
  },
  {
    section: "TCP",
    q: "An S corporation shareholder's basis is INCREASED by:",
    choices: [
      "Distributions received",
      "Their share of separately and non-separately stated income",
      "Nondeductible expenses",
      "Corporate borrowing",
    ],
    answer: 1,
    why: "Stock basis rises with the shareholder's share of income items; it falls with distributions, losses, and nondeductible expenses.",
  },
];
