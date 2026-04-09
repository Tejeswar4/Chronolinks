export function cn(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}

export function formatTimestamp(ts: number | string | Date): string {
  const date =
    typeof ts === "number" || typeof ts === "string"
      ? new Date(ts)
      : ts;

  return date.toLocaleString();
}
