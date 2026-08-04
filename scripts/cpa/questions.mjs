/**
 * CPA exam question bank — 2024 CPA Evolution model.
 *
 * Sections: FAR, AUD, REG (core) + BAR, ISC, TCP (disciplines).
 * `area` maps to the AICPA blueprint area the question sits in.
 * `diff` is 1 (recall) → 3 (application/analysis), roughly matching the
 * exam's skill levels.
 *
 * Rules followed when writing these:
 *   - No inflation-adjusted dollar figure appears without the tax year stated,
 *     because those change annually and a stale number teaches the wrong answer.
 *   - Every `why` explains the reasoning, not just which letter is right.
 *   - Distractors are the mistakes people actually make, not filler.
 */

export const SECTIONS = {
  FAR: {
    name: "Financial Accounting and Reporting",
    core: true,
    areas: {
      "I": { name: "Financial Reporting", weight: [30, 40] },
      "II": { name: "Select Balance Sheet Accounts", weight: [30, 40] },
      "III": { name: "Select Transactions", weight: [25, 35] },
    },
  },
  AUD: {
    name: "Auditing and Attestation",
    core: true,
    areas: {
      "I": { name: "Ethics, Professional Responsibilities and General Principles", weight: [15, 25] },
      "II": { name: "Assessing Risk and Developing a Planned Response", weight: [25, 35] },
      "III": { name: "Performing Further Procedures and Obtaining Evidence", weight: [30, 40] },
      "IV": { name: "Forming Conclusions and Reporting", weight: [10, 20] },
    },
  },
  REG: {
    name: "Taxation and Regulation",
    core: true,
    areas: {
      "I": { name: "Ethics, Professional Responsibilities and Federal Tax Procedures", weight: [10, 20] },
      "II": { name: "Business Law", weight: [15, 25] },
      "III": { name: "Federal Taxation of Property Transactions", weight: [5, 15] },
      "IV": { name: "Federal Taxation of Individuals", weight: [22, 32] },
      "V": { name: "Federal Taxation of Entities", weight: [23, 33] },
    },
  },
  BAR: {
    name: "Business Analysis and Reporting",
    core: false,
    areas: {
      "I": { name: "Business Analysis", weight: [40, 50] },
      "II": { name: "Technical Accounting and Reporting", weight: [35, 45] },
      "III": { name: "State and Local Governments", weight: [10, 20] },
    },
  },
  ISC: {
    name: "Information Systems and Controls",
    core: false,
    areas: {
      "I": { name: "Information Systems and Data Management", weight: [35, 45] },
      "II": { name: "Security, Confidentiality and Privacy", weight: [35, 45] },
      "III": { name: "Considerations for SOC Engagements", weight: [15, 25] },
    },
  },
  TCP: {
    name: "Tax Compliance and Planning",
    core: false,
    areas: {
      "I": { name: "Tax Compliance and Planning for Individuals", weight: [30, 40] },
      "II": { name: "Entity Tax Compliance", weight: [30, 40] },
      "III": { name: "Entity Tax Planning", weight: [10, 20] },
      "IV": { name: "Property Transactions", weight: [10, 20] },
    },
  },
};

const q = (section, area, diff, text, choices, answer, why, tag) =>
  ({ section, area, diff, q: text, choices, answer, why, tag: tag || "" });

export const QUESTIONS = [

  /* ==================================================== FAR — Area I ==== */

  q("FAR", "I", 2,
    "Under ASC 606, which step of the five-step revenue model determines WHEN revenue is recognized?",
    ["Identify the contract", "Identify the performance obligations", "Determine the transaction price",
     "Recognize revenue when (or as) each performance obligation is satisfied"],
    3,
    "Steps 1–4 build up to the amount and the unit of account; step 5 is the timing step — control transfers, either at a point in time or over time.",
    "ASC 606"),

  q("FAR", "I", 2,
    "A performance obligation is satisfied OVER time if which condition is met?",
    ["The contract lasts more than one year",
     "The customer simultaneously receives and consumes the benefits as the entity performs",
     "The entity bills the customer monthly",
     "The transaction price exceeds $1 million"],
    1,
    "Over-time recognition requires one of three criteria; simultaneous receipt/consumption is the first. Billing frequency and contract length are irrelevant.",
    "ASC 606"),

  q("FAR", "I", 2,
    "Which item is reported as a component of OTHER COMPREHENSIVE INCOME rather than net income?",
    ["Gain on sale of equipment", "Unrealized gain on an available-for-sale debt security",
     "Interest expense", "Loss on inventory write-down"],
    1,
    "AFS debt securities are marked to fair value through OCI. Trading securities and equity securities go through net income.",
    "OCI"),

  q("FAR", "I", 3,
    "A company has 100,000 common shares outstanding all year and reports net income of $500,000 with $50,000 of preferred dividends declared. Basic EPS is:",
    ["$5.00", "$4.50", "$5.50", "$4.00"],
    1,
    "Basic EPS = (Net income − preferred dividends) ÷ weighted average common shares = ($500,000 − $50,000) ÷ 100,000 = $4.50. Preferred dividends must be subtracted.",
    "EPS"),

  q("FAR", "I", 2,
    "Under the INDIRECT method, depreciation expense appears on the statement of cash flows as:",
    ["An investing outflow", "An addition to net income in operating activities",
     "A financing inflow", "A deduction from net income in operating activities"],
    1,
    "Depreciation is a non-cash expense that reduced net income, so it is added back to reconcile to operating cash flow.",
    "Cash flows"),

  q("FAR", "I", 3,
    "Cash paid to acquire the company's own treasury stock is classified in the statement of cash flows as:",
    ["Operating", "Investing", "Financing", "A non-cash transaction disclosed only in the notes"],
    2,
    "Transactions with the company's own equity holders — issuing or reacquiring stock, dividends, borrowings — are financing activities.",
    "Cash flows"),

  q("FAR", "I", 2,
    "Which change is accounted for RETROSPECTIVELY (restating prior periods)?",
    ["Change in accounting estimate", "Change in accounting principle",
     "Change in the useful life of equipment", "Change in the estimated allowance for doubtful accounts"],
    1,
    "Principle changes are retrospective. Estimate changes — useful lives, allowances, residual values — are prospective only.",
    "Accounting changes"),

  q("FAR", "I", 2,
    "A not-for-profit entity classifies net assets as:",
    ["Unrestricted, temporarily restricted, permanently restricted",
     "With donor restrictions and without donor restrictions",
     "Restricted, committed, assigned, unassigned",
     "Current and non-current"],
    1,
    "ASU 2016-14 collapsed three classes into two: with and without donor restrictions. The three-class model is the superseded answer, and the four-category list is governmental fund balance.",
    "NFP"),

  q("FAR", "I", 3,
    "A contingent loss should be ACCRUED when it is:",
    ["Reasonably possible and estimable", "Probable and reasonably estimable",
     "Remote but material", "Probable but not estimable"],
    1,
    "Both conditions must hold: probable AND reasonably estimable. Reasonably possible means disclose only; probable but not estimable means disclose only.",
    "Contingencies"),

  /* =================================================== FAR — Area II ==== */

  q("FAR", "II", 2,
    "Under the allowance method, the entry to record estimated uncollectible accounts is:",
    ["Debit Bad Debt Expense, credit Accounts Receivable",
     "Debit Bad Debt Expense, credit Allowance for Doubtful Accounts",
     "Debit Allowance for Doubtful Accounts, credit Accounts Receivable",
     "Debit Accounts Receivable, credit Bad Debt Expense"],
    1,
    "The estimate credits the contra-asset allowance. Choice C is the later write-off of a specific account, which has no income statement effect.",
    "Receivables"),

  q("FAR", "II", 3,
    "Writing off a specific uncollectible account under the allowance method has what effect on NET accounts receivable?",
    ["Decreases it", "Increases it", "No effect", "Depends on the amount"],
    2,
    "The write-off debits the allowance and credits A/R by the same amount, so gross A/R and the allowance both fall — net realizable value is unchanged. This is a classic exam trap.",
    "Receivables"),

  q("FAR", "II", 3,
    "Equipment costs $50,000 with a $5,000 salvage value and a 5-year life. Under DOUBLE-DECLINING BALANCE, depreciation in year 1 is:",
    ["$18,000", "$20,000", "$9,000", "$10,000"],
    1,
    "DDB rate = 2 ÷ 5 = 40%, applied to the full cost ignoring salvage in the early years: $50,000 × 40% = $20,000. Salvage only caps the final book value.",
    "PP&E"),

  q("FAR", "II", 2,
    "Which cost is CAPITALIZED as part of the cost of land?",
    ["Annual property taxes", "Cost of razing an old building on the land to prepare it for use",
     "Landscaping maintenance", "Property insurance for the year"],
    1,
    "Costs to get land ready for its intended use — clearing, grading, razing, title fees — are capitalized. Recurring costs are expensed.",
    "PP&E"),

  q("FAR", "II", 2,
    "Inventory measured under a method other than LIFO or retail is reported at:",
    ["Lower of cost or market", "Lower of cost or net realizable value",
     "Net realizable value", "Replacement cost"],
    1,
    "ASU 2015-11 moved most inventory to lower of cost or NRV. LIFO and retail inventory still use the older lower-of-cost-or-market ceiling/floor test.",
    "Inventory"),

  q("FAR", "II", 3,
    "An investor owning 30% of an investee with significant influence uses the EQUITY method. When the investee reports net income, the investor:",
    ["Records dividend revenue only", "Debits the investment account and credits equity in investee income",
     "Credits the investment account", "Makes no entry until dividends are received"],
    1,
    "Under the equity method the investment rises by the investor's share of income. Dividends received then REDUCE the investment account — they are not revenue.",
    "Investments"),

  q("FAR", "II", 3,
    "A long-lived asset held for use is tested for impairment. Step 1 compares the carrying amount to:",
    ["Fair value", "Undiscounted future cash flows", "Discounted future cash flows", "Replacement cost"],
    1,
    "The recoverability test uses UNDISCOUNTED cash flows. Only if carrying amount exceeds them do you measure the loss as carrying amount minus fair value.",
    "Impairment"),

  q("FAR", "II", 2,
    "Under ASC 842, a lessee recognizes a right-of-use asset and lease liability for:",
    ["Finance leases only", "Operating leases only",
     "Both finance and operating leases (short-term leases may be excluded by policy election)",
     "Neither, unless ownership transfers"],
    2,
    "ASC 842's central change: essentially all leases go on the balance sheet. The income statement pattern still differs — front-loaded for finance, straight-line for operating.",
    "Leases"),

  q("FAR", "II", 3,
    "A deferred tax LIABILITY arises from:",
    ["A temporary difference where book income exceeds taxable income now",
     "A permanent difference such as municipal bond interest",
     "A temporary difference where taxable income exceeds book income now",
     "A net operating loss carryforward"],
    0,
    "Paying less tax now than book income implies means paying more later — a liability. Tax depreciation exceeding book depreciation is the classic case. Permanent differences never create deferred taxes.",
    "Income taxes"),

  /* ================================================== FAR — Area III ==== */

  q("FAR", "III", 3,
    "A bond is issued at a DISCOUNT. Under the effective interest method, interest expense each period:",
    ["Equals the cash coupon payment", "Is less than the cash payment and decreases over time",
     "Exceeds the cash payment and increases over time", "Is constant over the bond's life"],
    2,
    "Discount means the market rate exceeds the coupon rate. Expense = carrying value × market rate, and carrying value rises as the discount amortizes, so expense grows and always exceeds cash paid.",
    "Bonds"),

  q("FAR", "III", 2,
    "In a business combination, goodwill is measured as:",
    ["The excess of the fair value of identifiable net assets over consideration transferred",
     "The excess of consideration transferred (plus NCI) over the fair value of identifiable net assets acquired",
     "The acquiree's book equity", "Internally generated brand value"],
    1,
    "Goodwill is the residual. When the relationship reverses you have a bargain purchase, recognized as a gain in earnings — not negative goodwill.",
    "Business combinations"),

  q("FAR", "III", 2,
    "Goodwill is:",
    ["Amortized over 40 years", "Amortized over its useful life",
     "Tested for impairment at least annually and not amortized (absent a private-company election)",
     "Written off immediately at acquisition"],
    2,
    "Public companies do not amortize goodwill; they test at least annually at the reporting-unit level. Private companies may elect amortization over 10 years or less.",
    "Business combinations"),

  q("FAR", "III", 3,
    "A company's bank reconciliation shows a deposit in transit. This item:",
    ["Is added to the bank balance", "Is added to the book balance",
     "Is subtracted from the bank balance", "Requires an adjusting journal entry"],
    0,
    "The company already recorded it; the bank has not. Bank-side items (deposits in transit, outstanding checks) never require journal entries — only book-side items do.",
    "Cash"),

  q("FAR", "III", 2,
    "Research and development costs under U.S. GAAP are generally:",
    ["Capitalized and amortized", "Expensed as incurred",
     "Capitalized if the project is probable of success", "Deferred until the product launches"],
    1,
    "U.S. GAAP expenses R&D as incurred. IFRS differs — development costs meeting specific criteria are capitalized, a common comparison question.",
    "Intangibles"),

  /* ==================================================== AUD — Area I ==== */

  q("AUD", "I", 2,
    "Under the AICPA Code of Professional Conduct, independence is required for:",
    ["All engagements", "Attest engagements such as audits and reviews",
     "Tax return preparation", "Consulting engagements"],
    1,
    "Independence is an attest concept. Objectivity and integrity apply everywhere, but you may prepare tax returns for a client you are not independent of.",
    "Independence"),

  q("AUD", "I", 3,
    "A CPA firm's audit partner owns shares directly in an audit client. This is:",
    ["Permitted if the amount is immaterial", "Permitted if disclosed in the audit report",
     "A direct financial interest that impairs independence regardless of materiality",
     "Permitted if the shares are held in a blind trust"],
    2,
    "Direct financial interests impair independence with no materiality threshold. Only INDIRECT interests get a materiality test.",
    "Independence"),

  q("AUD", "I", 2,
    "The purpose of an engagement letter is to:",
    ["Guarantee the accuracy of the financial statements",
     "Establish an understanding of the terms, objectives, and responsibilities of the engagement",
     "Waive the auditor's liability", "Satisfy the SEC filing requirement"],
    1,
    "The engagement letter documents scope, responsibilities of management and auditor, and limitations. Auditors never guarantee statements.",
    "Engagement acceptance"),

  q("AUD", "I", 2,
    "Which best describes PROFESSIONAL SKEPTICISM?",
    ["Assuming management is dishonest",
     "An attitude that includes a questioning mind and a critical assessment of evidence",
     "Verifying 100% of transactions", "Relying on management representations"],
    1,
    "Skepticism is neither trust nor distrust — it is a questioning mind. Assuming dishonesty is not required; assuming honesty is not permitted.",
    "Professional skepticism"),

  /* =================================================== AUD — Area II ==== */

  q("AUD", "II", 3,
    "In the audit risk model AR = IR × CR × DR, if the auditor assesses inherent and control risk as HIGH, detection risk must be set:",
    ["High, and less substantive testing performed", "Low, requiring more persuasive substantive evidence",
     "At zero", "Unchanged — detection risk is not controllable"],
    1,
    "Detection risk is the only element the auditor controls. Higher RMM forces lower acceptable detection risk, meaning more extensive, better-timed, more effective procedures.",
    "Audit risk"),

  q("AUD", "II", 2,
    "Which procedure would the auditor perform to obtain an understanding of internal control?",
    ["Confirm receivables with customers", "Perform a walkthrough of a transaction from initiation to reporting",
     "Recalculate depreciation expense", "Observe the year-end inventory count"],
    1,
    "Walkthroughs establish understanding of design and implementation. The others are substantive procedures.",
    "Internal control"),

  q("AUD", "II", 2,
    "Performance materiality is set:",
    ["Higher than overall materiality", "Lower than overall materiality",
     "Equal to overall materiality", "At zero for public companies"],
    1,
    "Performance materiality is set below overall materiality to leave room for undetected and aggregated misstatements.",
    "Materiality"),

  q("AUD", "II", 3,
    "A material weakness in internal control is a deficiency such that:",
    ["A misstatement is remotely possible",
     "There is a reasonable possibility that a material misstatement will not be prevented or detected timely",
     "The auditor must issue an adverse opinion on the financial statements",
     "Management must be replaced"],
    1,
    "Severity ladder: deficiency → significant deficiency (merits attention) → material weakness (reasonable possibility of material misstatement). A control weakness does not by itself change the financial statement opinion.",
    "Internal control"),

  /* ================================================== AUD — Area III ==== */

  q("AUD", "III", 2,
    "Which type of audit evidence is generally MOST reliable?",
    ["Internally generated documents", "Management's oral representations",
     "Evidence obtained directly by the auditor from an independent external source",
     "Photocopies provided by the client"],
    2,
    "Reliability rises with auditor-obtained, external, and original evidence. Directly obtained external confirmations sit at the top.",
    "Evidence"),

  q("AUD", "III", 3,
    "Accounts receivable confirmations primarily test which assertion?",
    ["Completeness", "Existence", "Valuation", "Presentation"],
    1,
    "Confirmations test EXISTENCE — the recorded receivable is real. They are weak for completeness (unrecorded receivables have nobody to confirm with) and for collectibility.",
    "Assertions"),

  q("AUD", "III", 2,
    "To test for UNRECORDED liabilities, the auditor would primarily:",
    ["Confirm accounts payable balances with vendors",
     "Examine cash disbursements made after year-end for items relating to the prior period",
     "Vouch recorded payables to invoices", "Recalculate accrued interest"],
    1,
    "Search-for-unrecorded-liabilities works backwards from subsequent payments. Vouching recorded items tests existence, not completeness.",
    "Completeness"),

  q("AUD", "III", 2,
    "The management representation letter is dated:",
    ["At the beginning of fieldwork", "As of the date of the auditor's report",
     "At the balance sheet date", "Thirty days after the report"],
    1,
    "The letter covers the full period through the report date, so it carries the report date. Refusal to provide it is a scope limitation leading to disclaimer or withdrawal.",
    "Representations"),

  q("AUD", "III", 3,
    "Analytical procedures are REQUIRED in which phases of the audit?",
    ["Planning only", "Substantive testing only",
     "Risk assessment (planning) and the final overall review", "All three phases"],
    2,
    "Required at planning and near the end as an overall review. Using them as substantive tests is optional — the auditor may choose tests of details instead.",
    "Analytical procedures"),

  /* =================================================== AUD — Area IV ==== */

  q("AUD", "IV", 3,
    "The auditor cannot obtain sufficient appropriate evidence about a matter that is material AND pervasive. The appropriate opinion is:",
    ["Qualified", "Adverse", "Disclaimer of opinion", "Unmodified with an emphasis-of-matter paragraph"],
    2,
    "Two axes: a SCOPE problem gives qualified (material) or disclaimer (material and pervasive); a GAAP departure gives qualified or adverse. Scope + pervasive = disclaimer.",
    "Reports"),

  q("AUD", "IV", 3,
    "The financial statements contain a material GAAP departure that is pervasive. The opinion is:",
    ["Qualified", "Adverse", "Disclaimer", "Unmodified"],
    1,
    "A pervasive misstatement means the statements as a whole are not fairly presented — adverse. Contrast with a scope limitation, which would give a disclaimer.",
    "Reports"),

  q("AUD", "IV", 2,
    "Substantial doubt about going concern that is adequately disclosed results in:",
    ["An adverse opinion", "A disclaimer",
     "An unmodified opinion with a separate going-concern section", "A qualified opinion"],
    2,
    "Adequate disclosure means the statements are fair — the opinion stays unmodified with an added emphasis section. Inadequate disclosure would make it a GAAP departure.",
    "Going concern"),

  q("AUD", "IV", 2,
    "A subsequent event that provides evidence about conditions existing AT the balance sheet date is:",
    ["Disclosed only", "Recognized (adjusted) in the financial statements",
     "Ignored", "Reported as a prior period adjustment"],
    1,
    "Type 1 (recognized) events adjust the statements — for example, settlement of pre-existing litigation. Type 2 events arise from new conditions and are disclosed only.",
    "Subsequent events"),

  /* ==================================================== REG — Area I ==== */

  q("REG", "I", 2,
    "Circular 230 governs:",
    ["Auditor independence", "Practice before the Internal Revenue Service",
     "State board licensing", "PCAOB inspections"],
    1,
    "Circular 230 sets duties for those practicing before the IRS — CPAs, attorneys, enrolled agents — covering diligence, conflicts, and fee rules.",
    "Circular 230"),

  q("REG", "I", 3,
    "The general statute of limitations for the IRS to assess additional tax is:",
    ["Three years from the later of the due date or filing date",
     "Six years in all cases", "Ten years", "There is no limit"],
    0,
    "Three years generally; six years if gross income is understated by more than 25%; unlimited for a false or fraudulent return or a failure to file.",
    "Tax procedure"),

  /* =================================================== REG — Area II ==== */

  q("REG", "II", 2,
    "Under the UCC, a contract for the sale of goods for $500 or more generally must be:",
    ["Notarized", "In writing to be enforceable under the statute of frauds",
     "Approved by both parties' attorneys", "Recorded with the state"],
    1,
    "UCC 2-201 statute of frauds. Exceptions include specially manufactured goods, admissions in court, and performance already accepted.",
    "UCC"),

  q("REG", "II", 3,
    "An agent acting within actual authority binds the principal. If the agent exceeds actual authority but the third party reasonably believes authority exists, the principal may still be bound by:",
    ["Ratification only", "Apparent authority", "Novation", "Accord and satisfaction"],
    1,
    "Apparent authority arises from the PRINCIPAL's manifestations to the third party. The agent cannot create it by their own claims.",
    "Agency"),

  q("REG", "II", 2,
    "A security interest in personal property is generally perfected by:",
    ["Signing the security agreement alone", "Filing a financing statement or taking possession of the collateral",
     "Recording a deed", "Notifying the debtor's other creditors"],
    1,
    "Attachment makes the interest enforceable against the debtor; perfection — usually by filing — establishes priority against third parties.",
    "Secured transactions"),

  /* ================================================== REG — Area III ==== */

  q("REG", "III", 3,
    "After the Tax Cuts and Jobs Act, Section 1031 like-kind exchange treatment applies only to:",
    ["Any business property", "Real property held for productive use or investment",
     "Personal property such as equipment", "Inventory"],
    1,
    "TCJA limited 1031 to real property. Equipment and other personal property no longer qualify — a heavily tested change.",
    "Section 1031"),

  q("REG", "III", 3,
    "Depreciation recapture under Section 1245 on the sale of equipment at a gain is characterized as:",
    ["Long-term capital gain", "Ordinary income to the extent of prior depreciation taken",
     "Section 1231 gain in full", "Tax-exempt"],
    1,
    "1245 recaptures ALL prior depreciation as ordinary income first; any excess above original cost is 1231 gain.",
    "Recapture"),

  q("REG", "III", 2,
    "The basis of property received by GIFT, when the donor's basis is less than fair market value at the date of gift, is:",
    ["Fair market value at the date of gift", "The donor's carryover basis",
     "Zero", "The average of basis and fair market value"],
    1,
    "Carryover (transferred) basis for gifts. The dual-basis rule only kicks in when FMV is BELOW donor basis at gift date and the property is later sold at a loss.",
    "Basis"),

  q("REG", "III", 2,
    "The basis of property acquired from a DECEDENT is generally:",
    ["The decedent's adjusted basis", "Fair market value at the date of death (or alternate valuation date)",
     "Zero", "Original purchase price"],
    1,
    "The step-up (or step-down) to date-of-death FMV. Inherited property is also automatically long-term regardless of the holding period.",
    "Basis"),

  /* =================================================== REG — Area IV ==== */

  q("REG", "IV", 3,
    "An individual's net long-term capital LOSS in excess of capital gains is deductible against ordinary income up to what amount per year (2024, single or MFJ)?",
    ["$1,500", "$3,000", "$10,000", "Unlimited"],
    1,
    "$3,000 per year ($1,500 if married filing separately) for 2024; the remainder carries forward indefinitely. Verify the figure for the year you sit.",
    "Capital gains"),

  q("REG", "IV", 2,
    "Which filing status generally produces the LOWEST tax liability for a qualifying taxpayer?",
    ["Single", "Married filing separately", "Married filing jointly", "Head of household"],
    2,
    "MFJ has the widest brackets and largest standard deduction. MFS is generally the least favorable and disqualifies several credits.",
    "Filing status"),

  q("REG", "IV", 3,
    "Which item is an ABOVE-the-line deduction (adjustment to arrive at AGI)?",
    ["Mortgage interest", "Charitable contributions", "Deductible portion of self-employment tax", "State income taxes"],
    2,
    "One-half of SE tax is an adjustment. The others are itemized deductions taken below the line.",
    "AGI"),

  q("REG", "IV", 2,
    "Interest on state and local municipal bonds is:",
    ["Fully taxable", "Excluded from federal gross income",
     "Taxable only if over $10,000", "Deductible"],
    1,
    "Municipal interest is excluded from federal gross income — a PERMANENT book-tax difference, which is why it never generates a deferred tax.",
    "Gross income"),

  q("REG", "IV", 3,
    "The Section 199A qualified business income deduction is generally:",
    ["20% of QBI, subject to wage/property and taxable-income limitations",
     "50% of QBI with no limits", "A credit against tax",
     "Available only to C corporations"],
    0,
    "Up to 20% of QBI from pass-throughs, limited by W-2 wages and qualified property at higher income, and restricted for specified service trades or businesses.",
    "QBI"),

  /* ==================================================== REG — Area V ==== */

  q("REG", "V", 3,
    "Under Section 351, a transferor recognizes NO gain on contributing property to a corporation if, immediately after the exchange, the transferors control:",
    ["50% or more of the corporation", "80% or more of voting power and total shares",
     "100% of the corporation", "Any percentage, provided cash is not received"],
    1,
    "Control means at least 80%. Boot received triggers gain recognition up to the lesser of realized gain or boot.",
    "Section 351"),

  q("REG", "V", 3,
    "A partner's basis in a partnership interest is INCREASED by:",
    ["Partnership distributions", "The partner's share of partnership liabilities",
     "The partner's share of partnership losses", "Guaranteed payments received"],
    1,
    "Debt share increases outside basis (Section 752). Distributions and losses reduce it. Basis can never fall below zero.",
    "Partnership basis"),

  q("REG", "V", 3,
    "An S corporation shareholder's basis, unlike a partner's, generally does NOT include:",
    ["Capital contributions", "A share of entity-level liabilities",
     "Allocated income", "Direct shareholder loans to the corporation"],
    1,
    "S shareholders get basis only for their own investment and direct loans — not for a share of corporate debt. This is the key S corp vs partnership distinction.",
    "S corporation"),

  q("REG", "V", 2,
    "A C corporation's net capital losses may be:",
    ["Deducted in full against ordinary income",
     "Carried back 3 years and forward 5 years, deductible only against capital gains",
     "Deducted up to $3,000 per year", "Carried forward indefinitely against ordinary income"],
    1,
    "Corporations may only offset capital gains — no $3,000 ordinary offset, which is an individual rule.",
    "C corporation"),

  /* ==================================================== BAR — Area I ==== */

  q("BAR", "I", 3,
    "A company has fixed costs of $180,000, a unit selling price of $50, and unit variable cost of $30. The breakeven point in units is:",
    ["3,600 units", "6,000 units", "9,000 units", "4,500 units"],
    2,
    "Contribution margin per unit = $50 − $30 = $20. Breakeven = $180,000 ÷ $20 = 9,000 units.",
    "CVP"),

  q("BAR", "I", 3,
    "Using the data above, how many units must be sold to earn a target profit of $60,000?",
    ["12,000 units", "9,000 units", "10,500 units", "3,000 units"],
    0,
    "(Fixed costs + target profit) ÷ CM per unit = ($180,000 + $60,000) ÷ $20 = 12,000 units.",
    "CVP"),

  q("BAR", "I", 2,
    "A FAVORABLE direct materials price variance means:",
    ["More material was used than standard", "The actual price paid was less than the standard price",
     "Production exceeded budget", "Fixed overhead was overapplied"],
    1,
    "Price (rate) variances compare actual vs standard PRICE on actual quantity. Quantity used drives the usage variance instead.",
    "Variance analysis"),

  q("BAR", "I", 3,
    "The current ratio is 2.0. Paying an account payable with cash will:",
    ["Decrease the current ratio", "Increase the current ratio",
     "Leave it unchanged", "Depend on the amount"],
    1,
    "When the ratio starts above 1.0, subtracting equal amounts from both current assets and current liabilities raises the ratio. Below 1.0 it would fall.",
    "Ratios"),

  q("BAR", "I", 2,
    "Return on equity is computed as:",
    ["Net income ÷ total assets", "Net income ÷ average shareholders' equity",
     "Operating income ÷ sales", "Gross profit ÷ sales"],
    1,
    "ROE = net income ÷ average equity. DuPont decomposes it into margin × asset turnover × equity multiplier.",
    "Ratios"),

  /* =================================================== BAR — Area II ==== */

  q("BAR", "II", 3,
    "A derivative designated as a CASH FLOW hedge records the effective portion of gains and losses in:",
    ["Net income immediately", "Other comprehensive income until the hedged transaction affects earnings",
     "Retained earnings directly", "The investment account"],
    1,
    "Cash flow hedges park the effective portion in OCI and reclassify when the forecasted transaction hits earnings. Fair value hedges go straight to net income.",
    "Derivatives"),

  q("BAR", "II", 2,
    "Stock-based compensation for equity-classified awards is measured at:",
    ["Intrinsic value at each reporting date", "Grant-date fair value, recognized over the requisite service period",
     "The exercise price", "Cash paid on exercise"],
    1,
    "Grant-date fair value is fixed and expensed over the vesting period. Liability-classified awards, by contrast, are remeasured each period.",
    "Stock compensation"),

  /* ================================================== BAR — Area III ==== */

  q("BAR", "III", 3,
    "Governmental fund financial statements are prepared using:",
    ["Full accrual accounting", "Modified accrual accounting and the current financial resources measurement focus",
     "Cash basis", "The economic resources measurement focus"],
    1,
    "Governmental FUNDS use modified accrual — revenue when measurable and available. Government-wide statements and proprietary funds use full accrual.",
    "GASB"),

  q("BAR", "III", 2,
    "Under modified accrual, 'available' generally means collectible within:",
    ["The current period only", "The current period or soon enough thereafter to pay current liabilities",
     "Twelve months in all cases", "Any future period"],
    1,
    "Availability is the timing test unique to modified accrual; many governments use a 60-day window for property taxes.",
    "GASB"),

  q("BAR", "III", 2,
    "Which is a GOVERNMENTAL fund type?",
    ["Enterprise fund", "Internal service fund", "Special revenue fund", "Pension trust fund"],
    2,
    "Governmental funds: General, Special Revenue, Capital Projects, Debt Service, Permanent. Enterprise and internal service are proprietary; pension trust is fiduciary.",
    "GASB"),

  /* ==================================================== ISC — Area I ==== */

  q("ISC", "I", 2,
    "In a relational database, a FOREIGN key:",
    ["Uniquely identifies each row in its own table", "References the primary key of another table to enforce referential integrity",
     "Encrypts the table", "Is always auto-incremented"],
    1,
    "Foreign keys create and enforce relationships between tables. The primary key is what uniquely identifies rows within a table.",
    "Data management"),

  q("ISC", "I", 2,
    "In an ETL process, the TRANSFORM step:",
    ["Moves data into the target system", "Cleans, standardizes, validates, and reshapes data before loading",
     "Extracts data from source systems", "Backs up the data warehouse"],
    1,
    "Transform is where deduplication, type conversion, and business rules are applied. In ELT the order flips and transformation happens after loading.",
    "Data management"),

  q("ISC", "I", 2,
    "Which is an IT GENERAL control (ITGC) rather than an application control?",
    ["A three-way match on purchase orders", "A field validation rejecting non-numeric input",
     "Logical access provisioning and periodic user access reviews", "A batch total reconciliation"],
    2,
    "ITGCs are pervasive: access, change management, operations, backup. Application controls are transaction-level within a specific system.",
    "ITGC"),

  q("ISC", "I", 3,
    "The primary risk of inadequate SEGREGATION OF DUTIES in an IT environment is that one person could:",
    ["Work excessive overtime", "Both initiate a transaction and conceal it by altering the records",
     "Reduce system performance", "Increase storage costs"],
    1,
    "Segregation separates authorization, recording, and custody so committing and concealing an error or fraud requires collusion.",
    "SOD"),

  /* =================================================== ISC — Area II ==== */

  q("ISC", "II", 2,
    "Data encrypted while stored on a disk is protected:",
    ["In transit", "At rest", "In use", "In memory only"],
    1,
    "At rest = stored. In transit = moving across a network (TLS). In use = being processed in memory.",
    "Encryption"),

  q("ISC", "II", 2,
    "MULTI-FACTOR authentication requires factors from at least two of these categories:",
    ["Two different passwords", "Something you know, something you have, something you are",
     "Two different usernames", "Password entered twice"],
    1,
    "Two instances of the same category — a password plus a PIN — is not multi-factor.",
    "Access control"),

  q("ISC", "II", 3,
    "The principle of LEAST PRIVILEGE means users are granted:",
    ["Administrative rights by default", "Only the access necessary to perform their job duties",
     "Access to all systems for efficiency", "Read access to all data"],
    1,
    "Least privilege limits the blast radius of a compromised account. It pairs with periodic access recertification to prevent privilege creep.",
    "Access control"),

  q("ISC", "II", 3,
    "RPO (recovery point objective) measures:",
    ["How long recovery takes", "The maximum acceptable amount of DATA LOSS measured in time",
     "The cost of the outage", "The number of affected users"],
    1,
    "RPO = how much data you can afford to lose, driving backup frequency. RTO = how long you can afford to be down.",
    "BCP/DR"),

  /* ================================================== ISC — Area III ==== */

  q("ISC", "III", 3,
    "A SOC 1 report addresses:",
    ["Security, availability, processing integrity, confidentiality, and privacy",
     "Controls at a service organization relevant to user entities' INTERNAL CONTROL OVER FINANCIAL REPORTING",
     "The service organization's financial statements", "Compliance with GDPR"],
    1,
    "SOC 1 is ICFR-focused and used by user auditors. SOC 2 addresses the Trust Services Criteria.",
    "SOC"),

  q("ISC", "III", 3,
    "The difference between a Type 1 and a Type 2 SOC report is that Type 2:",
    ["Covers more control objectives", "Tests OPERATING EFFECTIVENESS over a period of time, not just design at a point in time",
     "Is issued by management", "Is available to the general public"],
    1,
    "Type 1 = design and implementation at a point in time. Type 2 = design plus operating effectiveness across a period, so it includes tests and results.",
    "SOC"),

  q("ISC", "III", 2,
    "The five Trust Services Criteria are security, availability, processing integrity, confidentiality, and:",
    ["Profitability", "Privacy", "Efficiency", "Accuracy"],
    1,
    "Security is the required common criteria; the other four are included based on engagement scope.",
    "SOC"),

  /* ==================================================== TCP — Area I ==== */

  q("TCP", "I", 3,
    "A traditional IRA differs from a Roth IRA in that the traditional IRA generally offers:",
    ["Tax-free qualified distributions", "A current-year deduction with taxable distributions later",
     "No contribution limits", "Exemption from required minimum distributions"],
    1,
    "Traditional = deduct now, tax later. Roth = no deduction now, qualified distributions tax-free, and no RMDs for the original owner.",
    "Retirement"),

  q("TCP", "I", 2,
    "The federal gift tax annual exclusion applies:",
    ["Once per donor per year in total", "Per donee, per year",
     "Only to gifts to charity", "Only to gifts of cash"],
    1,
    "The exclusion is per recipient each year, so gifts can be multiplied across donees, and doubled by gift-splitting between spouses.",
    "Gift tax"),

  q("TCP", "I", 3,
    "Which transfer qualifies for the UNLIMITED marital deduction?",
    ["A gift to a child", "An outright transfer to a U.S. citizen spouse",
     "A transfer to a non-citizen spouse", "A transfer to a sibling"],
    1,
    "Unlimited for U.S. citizen spouses. Transfers to non-citizen spouses use a limited annual exclusion or a QDOT.",
    "Estate/gift"),

  /* =================================================== TCP — Area II ==== */

  q("TCP", "II", 3,
    "A distribution from an S corporation with no accumulated E&P is treated first as:",
    ["Ordinary dividend income", "A tax-free reduction of stock basis",
     "Capital gain", "Wages subject to payroll tax"],
    1,
    "Tax-free to the extent of basis, then capital gain for any excess. E&P from prior C corp years changes the ordering.",
    "S corporation"),

  q("TCP", "II", 3,
    "A CURRENT (non-liquidating) partnership distribution of cash exceeding the partner's outside basis results in:",
    ["Ordinary income", "Capital gain to the extent of the excess",
     "No gain — basis simply goes negative", "A deductible loss"],
    1,
    "Outside basis cannot go below zero, so cash beyond basis triggers capital gain. Property distributions generally do not trigger gain.",
    "Partnership"),

  /* ================================================== TCP — Area III ==== */

  q("TCP", "III", 3,
    "A key tax disadvantage of operating as a C corporation rather than a pass-through is:",
    ["Limited liability", "Double taxation of distributed earnings",
     "Inability to deduct salaries", "Mandatory dissolution after 10 years"],
    1,
    "Earnings are taxed at the entity level and again as dividends. Pass-throughs are taxed once at the owner level and may qualify for the 199A deduction.",
    "Entity choice"),

  q("TCP", "III", 2,
    "Reasonable compensation is a particular audit focus for S corporations because owners may:",
    ["Overpay salaries to reduce corporate tax",
     "Understate salaries to minimize payroll taxes on distributions",
     "Avoid filing returns", "Deduct personal expenses"],
    1,
    "S corp distributions escape payroll tax, so understating wages shifts income away from FICA. The IRS recharacterizes unreasonably low salaries.",
    "Entity planning"),

  /* =================================================== TCP — Area IV ==== */

  q("TCP", "IV", 3,
    "Under the INSTALLMENT method, gain is recognized:",
    ["Entirely in the year of sale", "As payments are received, using the gross profit percentage",
     "Only in the final year", "Only when the buyer defaults"],
    1,
    "Gain recognized = payment received × gross profit percentage. Depreciation recapture, however, is recognized in full in the year of sale.",
    "Installment sales"),

  q("TCP", "IV", 3,
    "Section 1231 nets gains and losses on business property. A NET Section 1231 gain is generally treated as:",
    ["Ordinary income", "Long-term capital gain, subject to the five-year lookback recapture rule",
     "Tax-exempt", "Short-term capital gain"],
    1,
    "Net 1231 gain gets capital treatment; a net 1231 loss is fully ordinary — the best of both. The lookback recharacterizes gain as ordinary to the extent of unrecaptured 1231 losses in the prior five years.",
    "Section 1231"),
];

export default QUESTIONS;
