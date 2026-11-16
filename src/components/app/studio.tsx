"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Board } from "./board";
import { ChatPanel } from "./chat-panel";
import { Guarantees } from "./guarantees";
import { OfficeCard } from "./office-card";
import { PurchaseSheet } from "./purchase-sheet";
import { ReportPanel } from "./report-panel";
import { Roster } from "./roster";
import { Toasts } from "./toasts";
import { TopBar } from "./topbar";
import { TotalCard } from "./total-card";
import { useSim } from "./use-sim";
import { springGentle } from "@/lib/motion";

function Section({ title, hint, children, delay = 0 }: { title: string; hint?: string; children: React.ReactNode; delay?: number }) {
  return (
    <motion.section initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ ...springGentle, delay }} className="flex flex-col gap-3">
      <div className="px-1">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {hint && <p className="mt-1 text-[13px] text-ink-2">{hint}</p>}
      </div>
      {children}
    </motion.section>
  );
}

export function Studio() {
  const { sim, snap } = useSim();
  const [receiptFor, setReceiptFor] = useState<string | null>(null);
  const receiptRefill = snap.refills.find((r) => r.id === receiptFor && r.state === "COMMITTED") ?? null;

  return (
    <div className="ambient min-h-screen w-full">
      <TopBar sim={sim} snap={snap} />
      <main className="mx-auto flex w-full max-w-[2200px] flex-col gap-10 px-4 pb-24 pt-8 sm:px-8 xl:px-12">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={springGentle} className="max-w-3xl">
          <p className="micro-label">Oslo · Bengaluru · 35 volunteers</p>
          <h1 className="mt-3 text-[clamp(2rem,4.6vw,3.4rem)] font-medium leading-[1.02] tracking-[-0.04em]">
            From “the box is empty” to “paid back”, <span className="text-ink-3">without anyone nagging anyone.</span>
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-2">
            This is the real refill engine running on a simulated clock. Press play, report a box empty, or step in as a volunteer from the chat. Every rule below is enforced in code and covered by tests.
          </p>
        </motion.div>

        {!snap.ready ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading six weeks of history">
            {[0, 1, 2].map((i) => <div key={i} className="skeleton h-[340px] rounded-[var(--radius-card)]" />)}
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <OfficeCard office="OSL" snap={snap} sim={sim} />
              <OfficeCard office="BLR" snap={snap} sim={sim} />
              <TotalCard snap={snap} />
            </div>

            <Section title="Every refill, live" hint="Cards move on their own as people answer, buy and HR approves. Open “History” on any card for its audit trail.">
              <Board snap={snap} sim={sim} onReceipt={setReceiptFor} />
            </Section>

            <Section title="The chat bot and the queue" hint="Everything the bot sends is here with working buttons. The picker is a pure function: in the office today, fewest recent refills, nobody waiting on HR money.">
              <div className="grid gap-4 lg:h-[640px] lg:grid-cols-2">
                <ChatPanel snap={snap} sim={sim} onReceipt={setReceiptFor} />
                <Roster snap={snap} />
              </div>
            </Section>

            <Section title="Why it works" hint="The four problems from the brief, each with a live counter.">
              <Guarantees snap={snap} />
            </Section>

            <Section title="What management sees">
              <ReportPanel snap={snap} />
            </Section>
          </>
        )}
      </main>
      <PurchaseSheet refill={receiptRefill} sim={sim} onClose={() => setReceiptFor(null)} />
      <Toasts toasts={snap.toasts} />
    </div>
  );
}
