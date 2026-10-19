// HD44780 character ROMs differ. Send a bounded printable label, while retaining
// the original full name in the database/dashboard. At 48 users, 30 ASCII chars
// (even all JSON-escaped quotes) keep the sync under the ESP32's 15 KiB limit.
export function controllerDisplayName(name: string): string {
  return name.normalize('NFKD')
    .replace(/\p{Mark}/gu, '')
    .replace(/[\r\n\t]/g, ' ')
    .replace(/[^\x20-\x7e]/gu, '?')
    .replace(/ +/g, ' ')
    .trim().slice(0, 30).trim() || 'Authorized user';
}
