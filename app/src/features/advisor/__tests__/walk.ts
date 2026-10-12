import { screen, waitFor } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";
import { expect } from "vitest";

type User = ReturnType<typeof userEvent.setup>;

/** Walk the five check-in steps with the given picks; ends on the summary (step 6). */
export async function walkCheckIn(user: User, opts: { profile?: RegExp; months?: RegExp; feel?: RegExp } = {}) {
  await user.click(await screen.findByRole("button", { name: opts.profile ?? /paid in usd\/eur/i }));
  await screen.findByText(/how much (comes in|goes out|do you put aside)/i);
  await user.click(screen.getByRole("button", { name: /^next$/i }));
  await screen.findByText(/lira (each month|can you set aside)|gold budget/i);
  await user.click(screen.getByRole("button", { name: /^next$/i }));
  await user.click(await screen.findByRole("button", { name: opts.months ?? /^3 months/i }));
  await user.click(await screen.findByRole("button", { name: opts.feel ?? /^manageable/i }));
  await waitFor(() => expect(screen.getByRole("heading", { name: /your hedge/i })).toBeInTheDocument());
}
