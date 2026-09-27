/** Age in full years from an ISO date (`YYYY-MM-DD`). */
export function ageFromBirthdate(iso: string, now = new Date()): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return -1;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return -1;
  let age = now.getUTCFullYear() - year;
  const hadBirthday =
    now.getUTCMonth() + 1 > month ||
    (now.getUTCMonth() + 1 === month && now.getUTCDate() >= day);
  if (!hadBirthday) age -= 1;
  return age;
}

export function isAdultBirthdate(iso: string, now = new Date()): boolean {
  return ageFromBirthdate(iso, now) >= 18;
}
