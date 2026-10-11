import type { Direction } from "advisor";
import type { MarketId, Side } from "@/data/types";

export type PersonaId = "freelancer" | "exporter" | "importer" | "saver";

export interface PairOption {
  market: MarketId;
  direction: Direction;
  label: string;
  /** what the hedger actually does on the forward */
  plain: string;
}

export interface Persona {
  id: PersonaId;
  tab: string;
  title: string;
  blurb: string;
  pairs: PairOption[];
  proposed?: boolean;
  defaultMonthlyUsd: number;
}

export const PERSONAS: Persona[] = [
  {
    id: "freelancer", tab: "Freelancer", title: "Freelancer paid in USD", defaultMonthlyUsd: 2_000,
    blurb: "Dollars arrive monthly, rent and bills are in lira. Lock what each month's dollars will be worth in lira.",
    pairs: [{ market: "USD/TRY", direction: "sell", label: "USD/TRY · sell USD", plain: "You sell dollars forward and lock the lira you receive." }],
  },
  {
    id: "exporter", tab: "Exporter", title: "Exporter invoicing abroad", defaultMonthlyUsd: 10_000,
    blurb: "Receivables in dollars or euros, costs in lira. Lock the lira value of invoices you will collect.",
    pairs: [
      { market: "USD/TRY", direction: "sell", label: "USD/TRY · sell USD", plain: "You sell dollar receivables forward for lira." },
      { market: "EUR/TRY", direction: "sell", label: "EUR/TRY · sell EUR", plain: "You sell euro receivables forward for lira (amount entered in USD)." },
    ],
  },
  {
    id: "importer", tab: "Importer", title: "Importer paying suppliers", defaultMonthlyUsd: 10_000,
    blurb: "You hold lira and owe suppliers in dollars or yuan. Lock what each payment will cost.",
    pairs: [
      { market: "USD/TRY", direction: "buy", label: "USD/TRY · buy USD", plain: "You buy dollars forward and lock the lira you will pay." },
      { market: "USD/CNH", direction: "sell", label: "USD/CNH · buy CNH", plain: "You hold dollars and owe yuan: sell dollars forward for yuan." },
    ],
  },
  {
    id: "saver", tab: "Saver", title: "Saver in gram gold", defaultMonthlyUsd: 300, proposed: true,
    blurb: "Proposed future product. Lock the lira price of the gram gold you plan to buy each month.",
    pairs: [{ market: "GAU/TRY", direction: "buy", label: "GAU/TRY · buy gold", plain: "You buy gram gold forward and lock its lira price." }],
  },
];

export const personaById = (id: string | null | undefined): Persona => PERSONAS.find((p) => p.id === id) ?? PERSONAS[0];

export const sideOf = (d: Direction): Side => (d === "sell" ? "short" : "long");
