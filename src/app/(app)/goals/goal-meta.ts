/** Labels shared by the goals page (server) and its forms (client). */
export const KIND_INFO: Record<string, { label: string; help: string; limit: boolean }> = {
  daily_loss_limit: { label: "Daily loss limit", help: "Stop for the day once your poker losses reach this amount.", limit: true },
  max_session_loss: { label: "Stop-loss per session", help: "Flags any session that loses more than this.", limit: true },
  min_bankroll: { label: "Minimum bankroll", help: "Warns when your bankroll (or one account) drops below this.", limit: true },
  expense_budget: { label: "Expense budget", help: "Caps travel, food, coaching and other costs per period.", limit: true },
  profit: { label: "Profit goal", help: "Net poker profit to aim for in a period.", limit: false },
  hours: { label: "Hours goal", help: "Volume target: hours played in a period.", limit: false },
  session_count: { label: "Sessions goal", help: "Number of sessions and tournaments in a period.", limit: false },
};
export const MONEY = ["profit", "expense_budget", "max_session_loss", "daily_loss_limit", "min_bankroll"];
export const WITH_PERIOD = ["profit", "hours", "session_count", "expense_budget"];
export const PERIOD_LABELS: Record<string, string> = { weekly: "This week", monthly: "This month", yearly: "This year", daily: "Today", custom: "Custom dates" };

