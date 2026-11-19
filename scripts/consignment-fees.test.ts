// Run with: npm run test:consignment-fees
// Checks the consignment fee formula (Probstein fee, my fee = END PRICE x rate, customer payout) with hand-calculated cases.

import { computeFees, feeScheduleInputSchema, validateSchedule, type FeeSchedule } from "../src/lib/consignment/fees";

let failures = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + JSON.stringify(extra)}`);
};
const flat = (percent: number, extra: Partial<FeeSchedule> = {}): FeeSchedule => ({
  mode: "FLAT_BY_BAND",
  serviceRate: 5,
  minimumFee: null,
  tiers: [{ from: 0, to: null, percent, fixed: 0 }],
  ...extra,
});

// The example from the brief: $1,000, Probstein 10%, mine 5%.
const ex = computeFees(1000, flat(10));
check("brief example: Probstein fee $100", ex.probsteinFee === 100, ex);
check("brief example: my fee / profit $50", ex.myFee === 50, ex);
check("brief example: total fee $150", ex.totalFee === 150, ex);
check("brief example: customer payout $850", ex.customerPayout === 850, ex);

// 5% is taken on END PRICE, not on what is left after Probstein: 5% of 1000 = 50 (not 45).
check("5% is on END PRICE, not on the remainder", ex.myFee === 50 && (ex.myFee as number) !== 45);
// Equivalent formula: END x (1 - rate - 5%)
check("payout equals END x (1 - 10% - 5%)", ex.customerPayout === 1000 * (1 - 0.1 - 0.05), ex.customerPayout);

// Another end price and rate.
const b = computeFees(2480, flat(12.5));
check("$2,480 at 12.5%: Probstein $310, mine $124, payout $2,046", b.probsteinFee === 310 && b.myFee === 124 && b.customerPayout === 2046, b);

// Rounding to the cent, and the parts always add up to the end price.
const r = computeFees(33.33, flat(10));
check("$33.33: Probstein $3.33, mine $1.67 (half-up), payout $28.33", r.probsteinFee === 3.33 && r.myFee === 1.67 && r.customerPayout === 28.33, r);
for (const price of [0.01, 1, 19.99, 99.99, 123.45, 1234.56, 99999.99, 5000]) {
  const f = computeFees(price, flat(9.75));
  const sum = Math.round((f.customerPayout + f.probsteinFee + f.myFee) * 100);
  check(`parts add up to the end price ($${price})`, sum === Math.round(price * 100), f);
}

// Service rate is configurable.
const c = computeFees(1000, flat(10, { serviceRate: 7.5 }));
check("service rate 7.5% -> my fee $75, payout $825", c.myFee === 75 && c.customerPayout === 825, c);
check("service rate 0% -> no fee for me", computeFees(1000, flat(10, { serviceRate: 0 })).myFee === 0);

// Several bands, whole price uses the band it falls into.
const bands: FeeSchedule = {
  mode: "FLAT_BY_BAND",
  serviceRate: 5,
  minimumFee: null,
  tiers: [
    { from: 0, to: 100, percent: 15, fixed: 0 },
    { from: 100, to: 1000, percent: 10, fixed: 0 },
    { from: 1000, to: null, percent: 8, fixed: 0 },
  ],
};
check("bands: $99.99 uses 15%", computeFees(99.99, bands).probsteinFee === 15, computeFees(99.99, bands));
check("bands: $100 uses 10% (lower bound included)", computeFees(100, bands).probsteinFee === 10, computeFees(100, bands));
check("bands: $999.99 uses 10%", computeFees(999.99, bands).probsteinFee === 100, computeFees(999.99, bands)); // 99.999 -> 100.00
check("bands: $1,000 uses 8%", computeFees(1000, bands).probsteinFee === 80, computeFees(1000, bands));
check("bands: $5,000 uses 8%", computeFees(5000, bands).probsteinFee === 400);

// Percent + fixed parts are both applied, not folded into one percentage.
const mixed: FeeSchedule = { mode: "FLAT_BY_BAND", serviceRate: 5, minimumFee: null, tiers: [{ from: 0, to: null, percent: 10, fixed: 3 }] };
const m = computeFees(200, mixed);
check("10% + $3 fixed on $200 = $23, shown as two parts", m.probsteinFee === 23 && m.breakdown.length === 2, m);

// Minimum fee.
const min: FeeSchedule = flat(10, { minimumFee: 1 });
check("minimum fee: $5 at 10% = $0.50 -> raised to $1.00", computeFees(5, min).probsteinFee === 1 && computeFees(5, min).breakdown.length === 2, computeFees(5, min));
check("minimum fee not applied above the minimum", computeFees(50, min).probsteinFee === 5);

// Marginal bands: each slice of the price has its own rate.
const marginal: FeeSchedule = {
  mode: "MARGINAL",
  serviceRate: 5,
  minimumFee: null,
  tiers: [
    { from: 0, to: 100, percent: 10, fixed: 0 },
    { from: 100, to: null, percent: 5, fixed: 2 },
  ],
};
const mg = computeFees(250, marginal); // 10 on first 100 + 5% of 150 = 7.5 + 2 fixed
check("marginal: $250 = $10 + $7.50 + $2 = $19.50", mg.probsteinFee === 19.5 && mg.myFee === 12.5 && mg.customerPayout === 218, mg);
check("marginal: $60 only reaches the first band = $6", computeFees(60, marginal).probsteinFee === 6, computeFees(60, marginal));
check("marginal: exactly $100 does not reach the second band (no fixed)", computeFees(100, marginal).probsteinFee === 10, computeFees(100, marginal));

// Zero and bad input.
check("end price 0 -> everything 0", (() => { const z = computeFees(0, flat(10)); return z.probsteinFee === 0 && z.myFee === 0 && z.customerPayout === 0; })());
check("negative end price is rejected", (() => { try { computeFees(-1, flat(10)); return false; } catch { return true; } })());

// Fees larger than the price give a negative payout instead of hiding it.
const heavy = computeFees(10, flat(10, { minimumFee: 20 }));
check("fee above the price -> negative payout is shown", heavy.customerPayout < 0, heavy);

// Schedule validation.
check("valid single-band schedule", validateSchedule(flat(10)) === null);
check("gap between bands rejected", validateSchedule({ ...bands, tiers: [{ from: 0, to: 100, percent: 10, fixed: 0 }, { from: 150, to: null, percent: 5, fixed: 0 }] }) !== null);
check("overlap rejected", validateSchedule({ ...bands, tiers: [{ from: 0, to: 100, percent: 10, fixed: 0 }, { from: 50, to: null, percent: 5, fixed: 0 }] }) !== null);
check("must start at $0", validateSchedule({ ...bands, tiers: [{ from: 10, to: null, percent: 10, fixed: 0 }] }) !== null);
check("last band must be open-ended", validateSchedule({ ...bands, tiers: [{ from: 0, to: 100, percent: 10, fixed: 0 }] }) !== null);
check("percent above 100 rejected", validateSchedule(flat(120)) !== null);

// Input schema (what the settings form posts).
const ok = feeScheduleInputSchema.safeParse({ name: "T1", effectiveFrom: "2026-11-01", mode: "FLAT_BY_BAND", serviceRate: "5", minimumFee: "", tiers: [{ from: "0", to: "", percent: "10", fixed: "0" }] });
check("input schema accepts form strings", ok.success && ok.data.minimumFee === null && ok.data.tiers[0].to === null && ok.data.serviceRate === 5, ok.success ? ok.data : ok.error.issues);
const bad = feeScheduleInputSchema.safeParse({ name: "", effectiveFrom: "2026-11-01", mode: "FLAT_BY_BAND", serviceRate: 5, tiers: [] });
check("input schema rejects an empty name / no tiers", !bad.success);

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
