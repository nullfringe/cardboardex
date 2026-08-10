import type { Metadata } from "next";

import { CreateCardForm } from "@/components/create-card-form";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Add card",
  description: "Add a card printing and owned copy to Cardboardex.",
};

export default function NewCardPage() {
  return (
    <div className="app-shell">
      <SiteHeader compact />
      <CreateCardForm />
    </div>
  );
}
