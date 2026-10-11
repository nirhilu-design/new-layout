// חישובי תשואה משוקללת.
// עיקרון: נתון חסר (מסלול ללא היסטוריה מספקת / שדה ריק ב-XML) נשאר null ואינו
// נספר כ-0%. כל ממוצע מחושב רק על הרכיבים שיש להם נתון לאותה תקופה, והמשקל
// מתחלק מחדש ביניהם. הכיסוי (כמה רכיבים / איזה חלק מהצבירה נכלל) מוחזר לתצוגה.

export const RETURN_KEYS = ["return12", "return36", "return60", "st36", "sharp36"];

export function rateOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// ממוצע פשוט (משקל שווה) של הערכים הקיימים; null אם אין אף ערך.
export function meanOrNull(values) {
  const nums = values.map(rateOrNull).filter((v) => v !== null);
  return nums.length ? nums.reduce((s, v) => s + v, 0) / nums.length : null;
}

// ממוצע משוקלל לפי `weightKey` על פריטים שיש להם ערך ב-`key`.
// מחזיר { value, count, total, coveredWeight, totalWeight, partial }.
export function weightedWithCoverage(items, key, weightKey = "value") {
  const all = items.filter((x) => Number(x?.[weightKey]) > 0);
  const totalWeight = all.reduce((s, x) => s + Number(x[weightKey]), 0);
  const covered = all.filter((x) => rateOrNull(x[key]) !== null);
  const coveredWeight = covered.reduce((s, x) => s + Number(x[weightKey]), 0);
  const value = coveredWeight > 0
    ? covered.reduce((s, x) => s + Number(x[weightKey]) * rateOrNull(x[key]), 0) / coveredWeight
    : null;
  return {
    value,
    count: covered.length,
    total: all.length,
    coveredWeight,
    totalWeight,
    partial: covered.length > 0 && covered.length < all.length,
  };
}

// תשואת מוצר: ממוצע המסלולים שלו (אין בקובץ חלוקת צבירה בין מסלולים).
export function productReturnsFromRoutes(routes) {
  const list = Array.isArray(routes) ? routes : [];
  return Object.fromEntries(RETURN_KEYS.map((k) => [k, meanOrNull(list.map((r) => r?.[k]))]));
}
