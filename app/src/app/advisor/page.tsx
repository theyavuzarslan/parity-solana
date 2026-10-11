import type { Metadata } from "next";
import { Suspense } from "react";
import { AdvisorDesk } from "@/features/advisor/AdvisorDesk";

export const metadata: Metadata = { title: "Advisor" };

export default function AdvisorPage() {
  return (
    <Suspense fallback={null}>
      <AdvisorDesk />
    </Suspense>
  );
}
