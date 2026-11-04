// The words a search looks for, shared by the misconception search and the public goods catalog.
const STOP = new Set('about above after again also and any are as at be been being below between both but by can could did does doing down during each few for from further had has have having here how into its itself just more most must not now off once only other our out over own same should some such than that the their them then there these they this those through too under until use used uses using given include includes including very was were what when where which while who whom why will with within without would you your'.split(' '));
const SUFFIXES = ['ing', 'ed', 'es', 's', 'e'];
// Lowercase words of three letters or more, without common ones, each cut to a rough stem (adding,
// adds → add; fractions → fraction) so a teacher's words meet Eedi's, or the catalog's.
export function searchTerms(value) {
  const stem = (word) => { const end = SUFFIXES.find((suffix) => word.endsWith(suffix) && word.length - suffix.length >= 3); return end ? word.slice(0, -end.length) : word; };
  return [...new Set((String(value || '').toLowerCase().match(/[a-z0-9]+/g) || []).filter((word) => word.length >= 3 && !STOP.has(word)).map(stem))];
}
