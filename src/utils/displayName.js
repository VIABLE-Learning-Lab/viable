// Format explicit family-name-first provider labels without rewriting stored identities.
export function formatDisplayName(value) {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (!name) return null;
  const parts = name.split(/[,，]/).map(part => part.trim());
  const [family, given] = parts;
  if (parts.length === 2 && family && given && !/^(?:jr\.?|sr\.?|ii|iii|iv|v|ph\.?d\.?|m\.?d\.?)$/i.test(given)) {
    return `${given} ${family}`;
  }
  return name;
}
