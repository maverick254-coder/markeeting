/**
 * Up to two initials for the account avatar, from the verified identity in the session: the
 * first letters of the first and last words of the name, or the first letter of the email
 * address when there is no name. Never hard-coded, never guessed beyond that.
 */
export function initialsFor(name: string | null, email: string | null): string {
  const words = (name ?? "")
    .normalize("NFKC")
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  if (words.length >= 2) return (firstChar(words[0]) + firstChar(words[words.length - 1])).toLocaleUpperCase();
  if (words.length === 1) return firstChar(words[0]).toLocaleUpperCase();
  const local = (email ?? "").split("@")[0]?.replace(/[^\p{L}\p{N}]/gu, "") ?? "";
  return local ? firstChar(local).toLocaleUpperCase() : "?";
}

function firstChar(value: string) {
  return Array.from(value)[0] ?? "";
}
