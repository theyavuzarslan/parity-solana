import type { Metadata } from "next";
import { DispatchSheet } from "@/features/dispatch/DispatchSheet";

export const metadata: Metadata = { title: "Dispatch" };

export default function DispatchPage() {
  return <DispatchSheet />;
}
