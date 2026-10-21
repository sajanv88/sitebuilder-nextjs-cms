// Dates are stored in UTC and shown in UTC with the zone named (design §7). The same output on
// the server and in the browser, so nothing differs between the first render and hydration, and
// nothing relative ("today", "2 hours ago") is rendered on the server.

const dateTime = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});

// "21 Oct 2026, 14:05 UTC"
export function formatDateTime(date: Date): string {
  return `${dateTime.format(date)} UTC`;
}
