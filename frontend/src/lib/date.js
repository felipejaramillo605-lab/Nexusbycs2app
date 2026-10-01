// NEXUS_LOCAL_DATE_NOT_UTC_V1
// `new Date().toISOString().split('T')[0]` gives the UTC date, not the
// viewer's local date. For any organization west of UTC (Colombia is
// UTC-5), from 19:00 local onward that already reads as "tomorrow" --
// every "today"/"this month" default across Manager and Staff screens
// silently rolled over to the next day hours before midnight, right when
// a manager is closing the register. Use this instead everywhere a
// YYYY-MM-DD "today" (or an offset from it) is needed for a UI default or
// filter.
export function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
