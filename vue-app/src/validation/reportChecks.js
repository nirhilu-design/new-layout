/**
 * כלי בקרה פנימי ליועץ — בדיקות שפיות והצלבות על החישובים ומקורות המידע בדוח.
 *
 * עיקרון: הכלי *מאיר* פערים ואי-התאמות בין המספרים המוצגים למקורות הנתונים, ואינו
 * מנחה פעולה. כל ממצא מנוסח עובדתית ומסתיים בהפניה לבדיקה מול בעל רישיון היכן
 * שמדובר בכלל מקצועי/רגולטורי. הכלי אינו מתקן דבר — הוא מסמן בלבד.
 *
 * כל בדיקה מחזירה:
 *   { id, category, label, status: 'pass'|'warn'|'fail'|'info', detail, expected, actual, source }
 */

const num = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const clean = String(v ?? "").replace(/[₪,\s%]/g, "").replace(/[^\d.-]/g, "");
  const n = Number(clean);
  return Number.isFinite(n) ? n : 0;
};
const arr = (v) => (Array.isArray(v) ? v : []);
const money = (v) => `₪${Math.round(num(v)).toLocaleString("en-US")}`;
const pct = (v, d = 1) => `${num(v).toFixed(d)}%`;

// סיווג סטטוס לפי סטייה יחסית (ברירת מחדל: 0.5% תקין, 2% אזהרה, מעבר לכך שגיאה).
const relStatus = (diff, base, warnAt = 0.005, failAt = 0.02) => {
  const rel = base ? Math.abs(diff) / Math.abs(base) : (Math.abs(diff) > 0 ? Infinity : 0);
  if (rel <= warnAt) return "pass";
  if (rel <= failAt) return "warn";
  return "fail";
};

// ---- גזירת תשואות משוקללות לפי קבוצת מוצר (זהה ללוגיקת הדוח) ----
function buildProductFunds(scope) {
  return arr(scope?.products)
    .map((p) => {
      const routes = arr(p.investmentRoutes);
      const avg = (k) => (routes.length ? routes.reduce((s, r) => s + num(r?.[k]), 0) / routes.length : 0);
      return {
        productType: p.productType || "אחר",
        value: num(p.currentValue),
        return12: avg("return12"), return36: avg("return36"), return60: avg("return60"),
        feeFromBalance: num(p.managementFeeFromBalance),
        feeFromDeposit: num(p.managementFeeFromDeposit),
      };
    })
    .filter((f) => f.value > 0);
}

function weightedGroups(funds) {
  const map = new Map();
  funds.forEach((f) => { if (!map.has(f.productType)) map.set(f.productType, []); map.get(f.productType).push(f); });
  const wavg = (list, key) => { const tv = list.reduce((s, x) => s + x.value, 0) || 1; return list.reduce((s, x) => s + x.value * x[key], 0) / tv; };
  return Array.from(map.entries()).map(([type, list]) => ({
    type, list,
    r12: wavg(list, "return12"), r36: wavg(list, "return36"), r60: wavg(list, "return60"),
  }));
}

export function runReportChecks(ctx = {}) {
  const reportData = ctx.reportData || {};
  const scope = ctx.scope || {};
  const special = ctx.specialSections || {};
  const family = reportData.family || {};
  const members = arr(reportData.members).length ? arr(reportData.members) : arr(ctx.detailedMembers);
  const checks = [];
  const add = (c) => { if (c) checks.push(c); };

  const totalAssets = num(family.totalAssets);

  // ============ הצלבות סכומים ============
  const products = arr(reportData.products);
  if (products.length && totalAssets) {
    const sum = products.reduce((s, p) => s + num(p.value), 0);
    const diff = sum - totalAssets;
    add({
      id: "products-total", category: "הצלבות סכומים", label: "סכום המוצרים מול סך הנכסים",
      status: relStatus(diff, totalAssets),
      detail: `סכום ההתפלגות לפי מוצרים (${money(sum)}) מול סך הנכסים המנוהל (${money(totalAssets)}). פער: ${money(diff)}.`,
      expected: money(totalAssets), actual: money(sum),
    });
  }

  const managers = arr(reportData.managers);
  if (managers.length && totalAssets) {
    const sum = managers.reduce((s, p) => s + num(p.value), 0);
    const diff = sum - totalAssets;
    add({
      id: "managers-total", category: "הצלבות סכומים", label: "סכום הגופים המנהלים מול סך הנכסים",
      status: relStatus(diff, totalAssets),
      detail: `סכום ההתפלגות לפי גופים מנהלים (${money(sum)}) מול סך הנכסים המנוהל (${money(totalAssets)}). פער: ${money(diff)}.`,
      expected: money(totalAssets), actual: money(sum),
    });
  }

  // ============ אחוזים ============
  const channels = arr(reportData.mainGroupAllocation);
  if (channels.length) {
    const sumPct = channels.reduce((s, c) => s + (c.percent != null ? num(c.percent) : 0), 0);
    // אם אין percent — נחשב מהערכים
    const usePct = channels.some((c) => c.percent != null);
    const total = channels.reduce((s, c) => s + num(c.value), 0) || 1;
    const effective = usePct ? sumPct : channels.reduce((s, c) => s + (num(c.value) / total) * 100, 0);
    const diff = effective - 100;
    add({
      id: "channels-100", category: "אחוזים", label: "סכום אחוזי האפיקים = 100%",
      status: Math.abs(diff) <= 0.6 ? "pass" : (Math.abs(diff) <= 2 ? "warn" : "fail"),
      detail: `סכום אחוזי חלוקת האפיקים הראשיים הוא ${pct(effective)} (${channels.length} אפיקים). ציפייה: 100%.`,
      expected: "100.0%", actual: pct(effective),
    });
  }

  const eq = num(reportData.weightedEquityExposure);
  add({
    id: "equity-range", category: "אחוזים", label: "חשיפה מנייתית משוקללת בתחום 0–100%",
    status: eq >= 0 && eq <= 100 ? "pass" : "fail",
    detail: `החשיפה המנייתית המשוקללת עומדת על ${pct(eq, 0)}.`,
    actual: pct(eq, 0),
  });
  const fx = num(reportData.weightedForeignExposure);
  add({
    id: "foreign-range", category: "אחוזים", label: "חשיפה לחו״ל משוקללת בתחום 0–100%",
    status: fx >= 0 && fx <= 100 ? "pass" : "fail",
    detail: `החשיפה המשוקללת לחו״ל עומדת על ${pct(fx, 0)}.`,
    actual: pct(fx, 0),
  });

  const fxAlloc = arr(reportData.foreignExposureAllocation);
  if (fxAlloc.length) {
    const s = fxAlloc.reduce((sum, x) => sum + num(x.value ?? x.percent), 0);
    add({
      id: "foreign-alloc-100", category: "אחוזים", label: "חלוקת ישראל/חו״ל = 100%",
      status: Math.abs(s - 100) <= 1 ? "pass" : "warn",
      detail: `סכום חלוקת החשיפה (ישראל + חו״ל) הוא ${pct(s)}. ציפייה: 100%.`,
      expected: "100.0%", actual: pct(s),
    });
  }

  // ============ תשואה משוקללת ============
  // אינvariant מתמטי: ממוצע משוקלל חייב להיות בין הערך הנמוך לגבוה של רכיביו.
  const funds = buildProductFunds(scope);
  if (funds.length) {
    const groups = weightedGroups(funds);
    const offenders = [];
    groups.forEach((g) => {
      ["return12", "return36", "return60"].forEach((k, i) => {
        const key = ["r12", "r36", "r60"][i];
        const vals = g.list.map((f) => f[k]).filter((v) => Number.isFinite(v));
        if (!vals.length) return;
        const min = Math.min(...vals), max = Math.max(...vals), w = g[key];
        if (w < min - 0.05 || w > max + 0.05) {
          offenders.push(`${g.type} · ${["12ח׳", "36ח׳", "60ח׳"][i]}: משוקלל ${pct(w, 2)} מחוץ לתחום [${pct(min, 2)}, ${pct(max, 2)}]`);
        }
      });
    });
    add({
      id: "weighted-return-bounds", category: "תשואה משוקללת", label: "התשואה המשוקללת בתוך תחום התשואות של הקבוצה",
      status: offenders.length ? "fail" : "pass",
      detail: offenders.length
        ? `נמצאו ${offenders.length} תשואות משוקללות מחוץ לתחום רכיביהן — ממוצע משוקלל אמור תמיד ליפול בין המינימום למקסימום. ${offenders.join(" ; ")}.`
        : `כל התשואות המשוקללות (${groups.length} קבוצות) נמצאות בתוך תחום התשואות של המוצרים בכל קבוצה.`,
    });
  }

  // ============ דמי ניהול ============
  if (funds.length) {
    const tv = funds.reduce((s, f) => s + f.value, 0) || 1;
    const wBal = funds.reduce((s, f) => s + f.value * f.feeFromBalance, 0) / tv;
    const anyImplausible = funds.some((f) => f.feeFromBalance < 0 || f.feeFromBalance > 3 || f.feeFromDeposit < 0 || f.feeFromDeposit > 6);
    add({
      id: "fee-plausibility", category: "דמי ניהול", label: "שיעורי דמי הניהול בתחום סביר",
      status: anyImplausible ? "fail" : "pass",
      detail: anyImplausible
        ? "נמצא לפחות מוצר עם שיעור דמי ניהול חריג (מהצבירה מחוץ ל-0%–3% או מהפקדה מחוץ ל-0%–6%) — ייתכן שגיאת נתונים."
        : "שיעורי דמי הניהול בכל המוצרים נמצאים בטווח מספרי סביר.",
      actual: `דמי ניהול מהצבירה משוקלל: ${pct(wBal, 2)}`,
    });
    if (wBal > 1.05 + 1e-9) {
      add({
        id: "fee-balance-cap", category: "דמי ניהול", label: "דמי ניהול מהצבירה מול תקרת ברירת המחדל",
        status: "warn",
        detail: `דמי הניהול המשוקללים מהצבירה (${pct(wBal, 2)}) גבוהים מתקרת ברירת המחדל בתקנות לקופות גמל וקרנות פנסיה (1.05% לשנה מהצבירה). ייתכנו מוצרים ותיקים שתקרתם שונה — נקודה לבדיקה מול בעל רישיון.`,
        expected: "עד 1.05%", actual: pct(wBal, 2),
        source: "רשות שוק ההון, ביטוח וחיסכון — תקרות דמי ניהול",
      });
    }
  }

  // ============ הגנות / קצבת שאירים ============
  const pensionRows = arr(scope?.pensionDeathBenefitProducts).length
    ? arr(scope.pensionDeathBenefitProducts)
    : arr(special?.section28Capping) && [];
  const survivorRows = arr(scope?.pensionDeathBenefitProducts);
  if (survivorRows.length && members.length) {
    const salaryOf = (name) => {
      const m = members.find((x) => (x.name || "") === name);
      return num(m?.currentSalary ?? m?.personalDetails?.currentSalary);
    };
    const byMember = new Map();
    survivorRows.forEach((r) => {
      const key = r.memberName || "—";
      byMember.set(key, (byMember.get(key) || 0) + num(r.totalPension ?? (num(r.widowPension) + num(r.orphanPension))));
    });
    const breaches = [];
    byMember.forEach((total, name) => {
      const sal = salaryOf(name);
      if (sal > 0 && total > sal + 1) breaches.push(`${name}: קצבת שאירים ${money(total)} מול שכר מבוטח ${money(sal)}`);
    });
    add({
      id: "survivor-vs-salary", category: "הגנות", label: "קצבת השאירים אינה עולה על השכר המבוטח",
      status: breaches.length ? "warn" : "pass",
      detail: breaches.length
        ? `נמצאו ${breaches.length} מקרים בהם סך קצבת השאירים החודשית גבוה מהשכר המבוטח. ${breaches.join(" ; ")}. לפי תקנון קרן הפנסיה סך הקצבה לאלמן/ה וליתומים אינו עולה על השכר המבוטח — נקודה לבדיקה מול בעל רישיון.`
        : "בכל בני המשפחה סך קצבת השאירים החודשית אינו עולה על השכר המבוטח.",
      source: "תקנון קרן פנסיה / רשות שוק ההון",
    });
  }

  // ============ פירוק נכסים (הצלבת סה״כ) ============
  const capSections = arr(special?.capitalClassification);
  if (capSections.length) {
    const rows = capSections.flatMap((s) => arr(s.pensionPolicies));
    if (rows.length) {
      const capVal = (r, keys) => keys.reduce((s, k) => s + num(r?.[k]), 0);
      const sumCapital = rows.reduce((s, r) => s + capVal(r, ["capitalRewards", "annuityRewardsUntil2000", "previousEmployersSeveranceRightsSequence", "currentEmployerSeveranceTaxable", "liquidExemptSeverance", "capitalSeverance"]), 0);
      const declaredCapital = rows.reduce((s, r) => s + (num(r?.totalCapital) || 0), 0);
      if (declaredCapital > 0) {
        const diff = declaredCapital - sumCapital;
        add({
          id: "capital-reconcile", category: "פירוק נכסים", label: 'סה״כ הון = סכום רכיבי ההון',
          status: relStatus(diff, declaredCapital, 0.01, 0.05),
          detail: `סה״כ ההון המוצהר (${money(declaredCapital)}) מול סכום רכיבי ההון (תגמולים הוניים, קצבתיים עד 2000, פיצויים ברצף/מעסיק נוכחי) שהם ${money(sumCapital)}. פער: ${money(diff)}.`,
          expected: money(declaredCapital), actual: money(sumCapital),
        });
      }
    }
  }

  // ============ איכות נתונים / חריגים ============
  const lumpWith = num(family.projectedLumpSumWithDeposits);
  const lumpWithout = num(family.projectedLumpSumWithoutDeposits);
  const pensWith = num(family.monthlyPensionWithDeposits);
  const pensWithout = num(family.monthlyPensionWithoutDeposits);
  if (lumpWith || lumpWithout || pensWith || pensWithout) {
    const anomalies = [];
    if (lumpWith && lumpWithout && lumpWithout > lumpWith + 1) anomalies.push(`צבירה: "ללא המשך" (${money(lumpWithout)}) גבוה מ"עם המשך" (${money(lumpWith)})`);
    if (pensWith && pensWithout && pensWithout > pensWith + 1) anomalies.push(`קצבה: "ללא המשך" (${money(pensWithout)}) גבוה מ"עם המשך" (${money(pensWith)})`);
    add({
      id: "deposits-monotonic", category: "איכות נתונים", label: "תרחיש המשך הפקדות ≥ תרחיש ללא המשך",
      status: anomalies.length ? "warn" : "pass",
      detail: anomalies.length
        ? `התרחיש עם המשך הפקדות אמור להיות גבוה או שווה לתרחיש ללא המשך. ${anomalies.join(" ; ")}. ייתכן פער נתונים — נקודה לבדיקה.`
        : "תחזיות ההמשך גבוהות או שוות לתחזיות ללא המשך, כמצופה.",
    });
  }

  // הזנה ידנית חריגה בקצבה מוכרת
  const recognized = arr(special?.recognizedPensionEntries);
  recognized.forEach((entry, i) => {
    const manual = arr(entry?.recognizedPensionAdjustments).reduce((s, r) => s + num(r?.amount), 0);
    if (manual > 0 && totalAssets > 0 && manual > totalAssets * 3) {
      add({
        id: `recognized-outlier-${i}`, category: "איכות נתונים", label: "הזנה ידנית חריגה בקצבה מוכרת",
        status: "warn",
        detail: `הקצבה המוכרת שהוזנה ידנית (${money(manual)}) גבוהה מפי 3 מסך התיק (${money(totalAssets)}). ייתכן שגיאת הזנה — נקודה לבדיקה מול בעל רישיון לפני הצגה ללקוח.`,
        actual: money(manual),
      });
    }
  });

  // ערכים שליליים בלתי-אפשריים
  const negatives = [];
  if (totalAssets < 0) negatives.push("סך נכסים שלילי");
  products.forEach((p) => { if (num(p.value) < 0) negatives.push(`ערך שלילי במוצר "${p.name || ""}"`); });
  if (negatives.length) {
    add({
      id: "negative-values", category: "איכות נתונים", label: "ערכים שליליים בלתי-אפשריים",
      status: "fail",
      detail: `נמצאו ערכים שליליים שאינם אפשריים: ${negatives.join(", ")}.`,
    });
  }

  // פרמיית סיכון חסרה (הארה, לא שגיאה)
  const riskPremium = reportData?.protections?.riskPremiumMonthly;
  if (riskPremium == null || riskPremium === "") {
    add({
      id: "missing-risk-premium", category: "איכות נתונים", label: "עלות הכיסויים (פרמיית סיכון) חסרה",
      status: "info",
      detail: "שדה פרמיית הסיכון החודשית (protections.riskPremiumMonthly) אינו קיים בנתונים, ולכן ה-KPI ״עלות הכיסויים למשפחה״ מושמט מהדוח (מוצג רק כשקיים נתון).",
    });
  }

  return checks;
}

export function summarizeChecks(checks) {
  const s = { pass: 0, warn: 0, fail: 0, info: 0, total: checks.length };
  checks.forEach((c) => { s[c.status] = (s[c.status] || 0) + 1; });
  return s;
}
