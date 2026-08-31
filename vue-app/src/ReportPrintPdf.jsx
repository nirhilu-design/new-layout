/**
 * ============================================================================
 *  דוח PDF להדפסה  —  PrintReportA4
 * ============================================================================
 *
 *  קובץ זה חולץ מתוך `components/ReportPage.jsx` והוא מכיל *רק* את החלק
 *  שהופך ל-PDF המודפס. המטרה: לתת לקלוד דיזיין קובץ ממוקד לעיצוב מחדש,
 *  בלי הרעש של אזור העריכה והתצוגה המקדימה על המסך (שנמצאים בקובץ המקורי).
 *
 *  איך זה עובד:
 *  ------------
 *  • אין ספריית PDF. הדוח הוא HTML+CSS, וההמרה ל-PDF נעשית ע"י `window.print()`
 *    של הדפדפן (הכפתור "ייצוא PDF" בקובץ המקורי קורא ל-window.print).
 *  • הקומפוננטה מרונדרת עם `class="print-report-root"`: מוסתרת על המסך
 *    ומוצגת רק בהדפסה (ראו בלוק ה-CSS ‎`css` בתוך PrintReportA4).
 *  • כל עמוד בדוח הוא ‎<section class="rp-section">‎ שמתחיל בעמוד A4 חדש
 *    (‎break-before: page‎). ‎.rp-avoid‎ מונע שבירת רכיב באמצע בין עמודים.
 *  • זו Vue JSX (‎class=‎ ולא ‎className=‎). ‎px()‎ מוסיף "px" לערכי style מספריים
 *    (מחקה את התנהגות React), כי Vue לא עושה זאת אוטומטית.
 *
 *  מה כדאי לעצב מחדש (החלק הויזואלי):
 *  ----------------------------------
 *  1. DESIGN TOKENS  — הצבעים/פונט בתוך PrintReportA4 (NAVY, PINK, TAN, ...).
 *  2. ‎css‎ + ‎@page‎  — הגדרות ההדפסה (גודל A4, שוליים, שבירת עמודים).
 *  3. רכיבי הבסיס    — SectionHeader, SectionIntro, Donut, CompareBars,
 *                      Gauge, Kpi, EmptyPanel, PageFooter, האייקונים.
 *  4. פריסת העמודים  — שער, פרטים אישיים, סיכום פנסיוני, התפלגות נכסים,
 *                      נכסים ברמת מוצר, דמי ניהול, פטירה, הלוואות, פירוק
 *                      נכסים, סעיף 28, סימולציה, קצבה מוכרת, סיכום שיחה.
 *
 *  מה *לא* קשור לעיצוב (data plumbing — להשאיר כמות שהוא):
 *  ------------------------------------------------------
 *  כל הפונקציות תחת "DATA HELPERS" בהמשך — נורמליזציה ופירמוט של נתונים
 *  שמגיעים מ-reportData. הן אינן משנות את המראה; רק מזינות אותו.
 *
 *  props של PrintReportA4:
 *  -----------------------
 *  reportData, conversationSummary, actionRecommendations, sections,
 *  productFunds, deathBenefit, managementFees.
 *  (‎sections‎ = Set של מזהי עמודים שיוצגו; ‎show(id)‎ מסנן לפיו.)
 *
 *  תלות חיצונית יחידה: תמונת השער ‎COVER_HERO_IMAGE‎ מ-`./coverHero`.
 * ============================================================================
 */

import { COVER_HERO_IMAGE } from "./coverHero";

/* ---------------------------------------------------------------------------
 * px() — מוסיף "px" לערכי style מספריים (מלבד תכונות unitless), כמו React.
 * ------------------------------------------------------------------------- */
const UNITLESS = new Set([
  "animationIterationCount", "borderImageOutset", "borderImageSlice",
  "borderImageWidth", "boxFlex", "boxFlexGroup", "boxOrdinalGroup",
  "columnCount", "columns", "flex", "flexGrow", "flexPositive", "flexShrink",
  "flexNegative", "flexOrder", "gridArea", "gridRow", "gridRowEnd",
  "gridRowSpan", "gridRowStart", "gridColumn", "gridColumnEnd",
  "gridColumnSpan", "gridColumnStart", "fontWeight", "lineClamp", "lineHeight",
  "opacity", "order", "orphans", "tabSize", "widows", "zIndex", "zoom",
  "fillOpacity", "floodOpacity", "stopOpacity", "strokeDasharray",
  "strokeDashoffset", "strokeMiterlimit", "strokeOpacity", "strokeWidth",
]);

export function px(styleValue) {
  if (styleValue == null || typeof styleValue === "string") return styleValue;
  if (Array.isArray(styleValue)) return styleValue.map(px);
  if (typeof styleValue !== "object") return styleValue;

  const result = {};
  for (const key in styleValue) {
    const value = styleValue[key];
    result[key] =
      typeof value === "number" && value !== 0 && !UNITLESS.has(key)
        ? `${value}px`
        : value;
  }
  return result;
}

/* ===========================================================================
 * DATA HELPERS  —  עיבוד/פירמוט נתונים (לא חלק מהעיצוב; להשאיר כמות שהוא)
 * =========================================================================== */

function normalizeCapitalReportArray(value) {
  return Array.isArray(value) ? value : [];
}

function hasCapitalReportRows(entry) {
  return (
    normalizeCapitalReportArray(entry?.pensionPolicies).length > 0 ||
    normalizeCapitalReportArray(entry?.studyFunds).length > 0
  );
}

function normalizeCapitalClassificationReportData(data) {
  const source = data || {};
  const raw = source.capitalClassification || {};
  const entriesFromUpload = normalizeCapitalReportArray(raw.entries)
    .map((entry) => ({
      owner: entry.owner === "spouseB" ? "spouseB" : "spouseA",
      ownerLabel: entry.ownerLabel || (entry.owner === "spouseB" ? "בת זוג" : "בן זוג"),
      sourceFileName: entry.sourceFileName || "",
      pensionPolicies: normalizeCapitalReportArray(entry.pensionPolicies),
      studyFunds: normalizeCapitalReportArray(entry.studyFunds),
      totals: entry.totals || {},
    }))
    .filter(hasCapitalReportRows);

  if (entriesFromUpload.length) {
    return entriesFromUpload;
  }

  const fallbackEntries = [
    {
      owner: "spouseA",
      ownerLabel: "בן זוג",
      sourceFileName: raw.spouseAFileName || "",
      pensionPolicies: normalizeCapitalReportArray(source.spouseA_pension_funds || raw.spouseA_pension_funds),
      studyFunds: normalizeCapitalReportArray(source.spouseA_study_funds || raw.spouseA_study_funds),
      totals: {},
    },
    {
      owner: "spouseB",
      ownerLabel: "בת זוג",
      sourceFileName: raw.spouseBFileName || "",
      pensionPolicies: normalizeCapitalReportArray(source.spouseB_pension_funds || raw.spouseB_pension_funds),
      studyFunds: normalizeCapitalReportArray(source.spouseB_study_funds || raw.spouseB_study_funds),
      totals: {},
    },
  ];

  return fallbackEntries.filter(hasCapitalReportRows);
}

function normalizeSection28CappingReportData(data) {
  const source = data || {};
  const raw = source.section28Capping;

  const normalizeEntry = (entry, fallbackOwner = "spouseA") => ({
    ...entry,
    owner: entry?.owner === "spouseB" ? "spouseB" : fallbackOwner,
    ownerLabel:
      entry?.ownerLabel ||
      (entry?.owner === "spouseB" || fallbackOwner === "spouseB"
        ? "בת זוג"
        : "בן זוג"),
    sourceFileName: entry?.sourceFileName || "",
    groups: normalizeCapitalReportArray(entry?.groups),
    comparisonRows: normalizeCapitalReportArray(entry?.comparisonRows),
  });

  const hasSection28Rows = (entry) =>
    normalizeCapitalReportArray(entry?.groups).length > 0 ||
    normalizeCapitalReportArray(entry?.comparisonRows).length > 0;

  if (Array.isArray(raw)) {
    return raw.map((entry) => normalizeEntry(entry)).filter(hasSection28Rows);
  }

  if (raw && typeof raw === "object" && hasSection28Rows(raw)) {
    return [normalizeEntry(raw, raw.owner === "spouseB" ? "spouseB" : "spouseA")];
  }

  const fallbackEntries = [
    ...(Array.isArray(source.spouseA_section28Capping)
      ? source.spouseA_section28Capping.map((entry) => normalizeEntry(entry, "spouseA"))
      : []),
    ...(Array.isArray(source.spouseB_section28Capping)
      ? source.spouseB_section28Capping.map((entry) => normalizeEntry(entry, "spouseB"))
      : []),
  ];

  return fallbackEntries.filter(hasSection28Rows);
}

function getReportOwnerLabel(owner, fallback = "בן/בת זוג") {
  if (owner === "spouseA") return "בן זוג";
  if (owner === "spouseB") return "בת זוג";
  return fallback || "בן/בת זוג";
}

function hasRecognizedPensionReportRows(entry) {
  return (
    normalizeCapitalReportArray(entry?.vestedBalanceTable?.rows).length > 0 ||
    normalizeCapitalReportArray(entry?.recognizedPensionAdjustments).length > 0
  );
}

function normalizeRecognizedPensionReportData(data) {
  const source = data || {};
  const topTable = source.vestedBalanceTable || null;
  const topAdjustments = normalizeCapitalReportArray(source.recognizedPensionAdjustments);

  const normalizeEntry = ({ table = null, adjustments = [], owner = "spouseA", ownerLabel = "" }) => {
    const safeOwner = owner === "spouseB" ? "spouseB" : "spouseA";
    const safeOwnerLabel = ownerLabel || table?.ownerLabel || getReportOwnerLabel(safeOwner);
    return {
      owner: safeOwner,
      ownerLabel: safeOwnerLabel,
      vestedBalanceTable: table && normalizeCapitalReportArray(table?.rows).length
        ? { ...table, owner: safeOwner, ownerLabel: safeOwnerLabel }
        : null,
      recognizedPensionAdjustments: normalizeCapitalReportArray(adjustments),
    };
  };

  const entries = [];
  if (source.spouseA_vestedBalanceTable || normalizeCapitalReportArray(source.spouseA_recognizedPensionAdjustments).length) {
    entries.push(normalizeEntry({ table: source.spouseA_vestedBalanceTable, adjustments: source.spouseA_recognizedPensionAdjustments, owner: "spouseA" }));
  }
  if (source.spouseB_vestedBalanceTable || normalizeCapitalReportArray(source.spouseB_recognizedPensionAdjustments).length) {
    entries.push(normalizeEntry({ table: source.spouseB_vestedBalanceTable, adjustments: source.spouseB_recognizedPensionAdjustments, owner: "spouseB" }));
  }

  const splitEntries = entries.filter(hasRecognizedPensionReportRows);
  if (splitEntries.length) return splitEntries;

  if (topTable || topAdjustments.length) {
    const owner = topTable?.owner || source.recognizedPensionOwner || "spouseA";
    const ownerLabel = topTable?.ownerLabel || source.recognizedPensionOwnerLabel || getReportOwnerLabel(owner);
    const adjustmentsForOwner = topAdjustments.filter((item) => !item?.owner || item.owner === owner);
    return [normalizeEntry({ table: topTable, adjustments: adjustmentsForOwner.length ? adjustmentsForOwner : topAdjustments, owner, ownerLabel })].filter(hasRecognizedPensionReportRows);
  }

  return [];
}

function getCapitalRowValue(row, key) {
  const value = row?.[key];
  if (value === null || value === undefined || value === "") return "-";

  if (typeof value === "number") {
    if (!Number.isFinite(value) || value === 0) return "-";
    return `₪${Math.round(value).toLocaleString("en-US")}`;
  }

  const text = String(value).trim();
  return text || "-";
}

function getCapitalRowNumber(row, key) {
  const value = row?.[key];
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const clean = String(value || "").replace(/[₪,%\s]/g, "").replace(/,/g, "").replace(/[^\d.-]/g, "");
  const number = Number(clean);
  return Number.isFinite(number) ? number : 0;
}

function summarizeCapitalRows(rows, key) {
  return normalizeCapitalReportArray(rows).reduce(
    (sum, row) => sum + getCapitalRowNumber(row, key),
    0
  );
}

function getCapitalTotalCapital(row) {
  const explicit = getCapitalRowNumber(row, "totalCapital");
  if (explicit > 0) return explicit;

  return (
    getCapitalRowNumber(row, "capitalSeverance") +
    getCapitalRowNumber(row, "capitalRewards") +
    getCapitalRowNumber(row, "annuityRewardsUntil2000") +
    getCapitalRowNumber(row, "previousEmployersSeveranceRightsSequence") +
    getCapitalRowNumber(row, "liquidExemptSeverance")
  );
}

function getCapitalTotalPension(row) {
  const explicit = getCapitalRowNumber(row, "totalPension");
  if (explicit > 0) return explicit;

  return (
    getCapitalRowNumber(row, "annuityRewards") +
    getCapitalRowNumber(row, "currentEmployerAnnuitySeverance") +
    getCapitalRowNumber(row, "previousEmployersSeveranceAnnuitySequence") +
    getCapitalRowNumber(row, "annuitySeverance")
  );
}

function summarizeCapitalDerivedRows(rows, key) {
  return normalizeCapitalReportArray(rows).reduce((sum, row) => {
    if (key === "totalCapital") return sum + getCapitalTotalCapital(row);
    if (key === "totalPension") return sum + getCapitalTotalPension(row);
    return sum + getCapitalRowNumber(row, key);
  }, 0);
}

function getCapitalDisplayValue(row, key) {
  if (key === "totalCapital") return getCapitalRowValue({ value: getCapitalTotalCapital(row) }, "value");
  if (key === "totalPension") return getCapitalRowValue({ value: getCapitalTotalPension(row) }, "value");
  return getCapitalRowValue(row, key);
}

function getStudyFundBalance(row) {
  return (
    getCapitalRowNumber(row, "redemptionValue") ||
    getCapitalRowNumber(row, "totalBalance") ||
    getCapitalRowNumber(row, "totalFund")
  );
}

function formatSection28DisplayValue(value) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return "—";
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const abs = Math.abs(value);

    if (abs > 0 && abs < 1) {
      return `${(value * 100).toLocaleString("he-IL", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      })}%`;
    }

    return `₪${Math.round(value).toLocaleString("en-US")}`;
  }

  const text = String(value).trim();

  if (/^-?\d+(\.\d+)?$/.test(text)) {
    const number = Number(text);

    if (Math.abs(number) > 0 && Math.abs(number) < 1) {
      return `${(number * 100).toLocaleString("he-IL", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      })}%`;
    }

    return `₪${Math.round(number).toLocaleString("en-US")}`;
  }

  return text;
}

function normalizeSection28Text(value) {
  return String(value || "")
    .replace(/[״”"]/g, '"')
    .replace(/[׳’']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function section28NumericValue(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const clean = String(value || "")
    .replace(/[₪,%\s]/g, "")
    .replace(/,/g, "")
    .replace(/[^\d.-]/g, "");

  const number = Number(clean);
  return Number.isFinite(number) ? number : 0;
}

function isMeaningfulSection28Value(value) {
  if (value === null || value === undefined) return false;
  const text = String(value).trim();
  if (!text || text === "—" || text === "-") return false;
  return section28NumericValue(value) !== 0 || /[^₪,%\s0.,-]/.test(text);
}

function isSection28MonthlySavingRow(label) {
  return normalizeSection28Text(label).includes("סכום חודשי נטו שמועבר לחיסכון אישי");
}

function getSection28Group(groups, id, titlePart) {
  return groups.find(
    (group) =>
      group?.id === id || normalizeSection28Text(group?.title).includes(titlePart)
  );
}

function pickSection28Rows(rows, labelParts) {
  return labelParts
    .map((part) => rows.find((row) => normalizeSection28Text(row.label).includes(part)))
    .filter(Boolean);
}

function normalizeInsuranceName(value) {
  const text = String(value || "")
    .replace(/[״"]/g, "")
    .replace(/[׳']/g, "")
    .replace(/בע"מ/g, "")
    .replace(/בעמ/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (text.includes("כלל")) return "כלל";
  if (text.includes("מגדל")) return "מגדל";
  if (text.includes("הראל")) return "הראל";
  if (text.includes("מנורה")) return "מנורה מבטחים";
  if (text.includes("הפניקס") || text.includes("פניקס")) return "הפניקס";
  if (text.includes("איילון")) return "איילון";
  if (text.includes("הכשרה")) return "הכשרה";
  if (text.includes("ביטוח ישיר")) return "ביטוח ישיר";
  if (text.includes("שלמה")) return "שלמה ביטוח";
  if (text.includes("שומרה")) return "שומרה";
  if (text.includes("ליברה")) return "ליברה";
  if (text.includes("ווישור") || text.includes("וישור")) return "ווישור";

  return text;
}

function parseReportNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const clean = String(value || "")
    .replace(/[₪,\s]/g, "")
    .replace(/[^\d.-]/g, "");

  const number = Number(clean);

  return Number.isFinite(number) ? number : 0;
}

function formatReportNumber(value, decimals = 0) {
  const number = Number(value || 0);

  if (!Number.isFinite(number)) {
    return "—";
  }

  return number.toLocaleString("he-IL", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function isVestedTotalRow(row) {
  return (
    String(row?.fundName || "")
      .replace(/[״"]/g, "")
      .includes("סהכ") ||
    String(row?.fundName || "").includes('סה"כ') ||
    String(row?.fundName || "").includes("סה״כ")
  );
}

function getPdfExemptPaymentsTotal(rows) {
  const pdfRows = Array.isArray(rows) ? rows : [];

  if (!pdfRows.length) {
    return 0;
  }

  const totalRows = pdfRows.filter(isVestedTotalRow);
  const totalRowValues = totalRows
    .map((row) => parseReportNumber(row.exemptPayments))
    .filter((value) => value > 0);

  if (totalRowValues.length) {
    return Math.max(...totalRowValues);
  }

  const nonTotalValues = pdfRows
    .filter((row) => !isVestedTotalRow(row))
    .map((row) => parseReportNumber(row.exemptPayments))
    .filter((value) => value > 0);

  return nonTotalValues.reduce((sum, value) => sum + value, 0);
}

function getManualRecognizedPensionRows(adjustments) {
  return Array.isArray(adjustments)
    ? adjustments
        .filter((item) => item?.companyName && Number(item?.amount || 0) > 0)
        .map((item, index) => ({
          id: `manual-recognized-pension-${index}`,
          companyName: normalizeInsuranceName(item.companyName),
          amount: Number(item.amount || 0),
        }))
    : [];
}

/* ===========================================================================
 * KPI ICONS  —  אייקוני SVG לכרטיסי ה-KPI (חלק מהעיצוב)
 * =========================================================================== */

function KpiDepositIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
      <path d="M12 3V12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M8.5 8.5L12 12L15.5 8.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M4 13V19A2 2 0 0 0 6 21H18A2 2 0 0 0 20 19V13" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </svg>
  );
}
function KpiWalletIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
      <path d="M4 7C4 6 4.8 5 6 5H17C18 5 19 6 19 7V8" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <rect x="3" y="7" width="17" height="12" rx="2.5" stroke="currentColor" stroke-width="2" />
      <path d="M20 11H16.5C15.4 11 14.7 11.9 14.7 13C14.7 14.1 15.4 15 16.5 15H20" stroke="currentColor" stroke-width="2" />
      <circle cx="16.6" cy="13" r="1" fill="currentColor" />
    </svg>
  );
}
function KpiBarsIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
      <path d="M4 20H20" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <rect x="5" y="13" width="3.3" height="6" rx="1" stroke="currentColor" stroke-width="2" />
      <rect x="10.3" y="9" width="3.3" height="10" rx="1" stroke="currentColor" stroke-width="2" />
      <rect x="15.6" y="5" width="3.3" height="14" rx="1" fill="currentColor" />
    </svg>
  );
}
function KpiRecurringIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
      <path d="M20 12A8 8 0 1 1 17.5 6.3" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M17 3.5V6.5H14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M12 8.4V15.6M9.8 9.7H13C13.7 9.7 14.2 10.2 14.2 11C14.2 11.8 13.7 12.3 13 12.3H10.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
    </svg>
  );
}

/* ===========================================================================
 * PrintReportA4  —  קומפוננטת דוח ה-PDF (זהו החלק לעיצוב מחדש)
 * =========================================================================== */

export function PrintReportA4({ reportData, conversationSummary = "", actionRecommendations = "", sections = null, productFunds = [], deathBenefit = {}, managementFees = {} }) {
  const data = reportData || {};
  const family = data.family || {};
  const printConversationSummary =
    conversationSummary || data.conversationSummary || data.clientConversationSummary || data.summaryText || "";
  const printActionRecommendations =
    actionRecommendations || data.actionRecommendations || data.clientActionRecommendations || data.recommendationsText || data.recommendations || "";
  const members = Array.isArray(data.members) ? data.members : [];
  const products = Array.isArray(data.products) ? data.products : [];
  const managers = Array.isArray(data.managers) ? data.managers : [];
  const mainGroups = Array.isArray(data.mainGroupAllocation) ? data.mainGroupAllocation : [];
  const foreignExposureAllocation = Array.isArray(data.foreignExposureAllocation) ? data.foreignExposureAllocation : [];
  const loans = data.loans || { hasData: false, details: [] };
  const loanDetails = Array.isArray(loans.details) ? loans.details : [];
  const section28CappingEntries = normalizeSection28CappingReportData(data);
  const recognizedPensionEntries = normalizeRecognizedPensionReportData(data);
  const capitalClassificationEntries = normalizeCapitalClassificationReportData(data);
  const hasCapitalClassification = capitalClassificationEntries.length > 0;
  const hasSection28Capping = section28CappingEntries.length > 0;
  const hasRecognizedPension = recognizedPensionEntries.length > 0;

  const fmtCurrency = (value) => `₪${Math.round(Number(value || 0)).toLocaleString("en-US")}`;
  const fmtPercentInt = (value) => `${Math.round(Number(value || 0))}%`;
  const fmtDate = (value) => {
    if (!value) return "—";
    const str = String(value).trim();
    if (/^\d{8}$/.test(str)) return `${str.slice(6, 8)}/${str.slice(4, 6)}/${str.slice(0, 4)}`;
    const date = new Date(str);
    return Number.isNaN(date.getTime()) ? str : new Intl.DateTimeFormat("he-IL").format(date);
  };

  const totalLoansAmount = loanDetails.reduce((sum, loan) => sum + Number(loan.amount || 0), 0);
  const totalLoansBalance = loanDetails.reduce((sum, loan) => sum + Number(loan.balance || 0), 0);

  // ---- Design tokens (from handoff) ----
  const NAVY = "#00215D";
  const PINK = "#FF2756";
  const TAN = "#DDE3EC";
  const OFFWHITE = "#FFFFFF";
  const DESK = "#F4F6F9";
  const MUTED = "#8892A3";
  const INK = "#1A1A1A";
  const DARKTAN = "#334155";
  const PALETTE = [NAVY, PINK, TAN, "#C9BBA8", "#9CA3AF", "#6B7280", "#43B5D9", "#8F63C9"];

  const today = new Intl.DateTimeFormat("he-IL").format(new Date());
  const reportDate = family.lastUpdated || today;

  const memberDetail = (member, key) =>
    member?.personalDetails?.[key] ?? member?.[key] ?? member?.details?.[key] ?? null;
  const combinedSalary = members.reduce((sum, m) => sum + Number(memberDetail(m, "currentSalary") || 0), 0);
  const totalLifeCoverage = members.reduce((sum, m) => sum + Number(m.deathCoverage || 0), 0);
  const productTotal = products.reduce((sum, p) => sum + Number(p.value || 0), 0);
  const show = (id) => !sections || sections.has(id);

  const css = `
    @media screen { .print-report-root { display: none; } }
    @media print {
      @page { size: A4 portrait; margin: 0; }
      html, body { margin: 0 !important; padding: 0 !important; background: ${OFFWHITE} !important; }
      .print-report-root { display: block !important; }
      .rp-section { break-before: page; page-break-before: always; }
      .rp-section:first-child { break-before: avoid; page-break-before: avoid; }
      .rp-section table { border-collapse: collapse; width: 100%; }
      .rp-section tr, .rp-avoid { break-inside: avoid; page-break-inside: avoid; }
      .rp-section, .rp-section * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
    }
  `;

  const pageStyle = {
    minHeight: "1122px",
    padding: "44px 48px",
    background: OFFWHITE,
    color: INK,
    direction: "rtl",
    textAlign: "right",
    fontFamily: "'Calibri', 'Segoe UI', 'Assistant', sans-serif",
    boxSizing: "border-box",
    position: "relative",
    overflow: "hidden",
  };

  const SectionHeader = ({ title, subtitle }) => (
    <div style={px({ display: "flex", alignItems: "baseline", gap: 14, borderBottom: `3px solid ${NAVY}`, paddingBottom: 14, marginBottom: 22 })}>
      <div style={px({ fontSize: 34, fontWeight: 800, color: NAVY })}>{title}</div>
      {subtitle ? <div style={px({ fontSize: 15, color: MUTED })}>{subtitle}</div> : null}
    </div>
  );

  // Short lead paragraph shown directly under a section header to explain the
  // section to the client in plain language.
  const SectionIntro = ({ text }) => (
    <div style={px({ fontSize: 14.5, color: DARKTAN, lineHeight: 1.75, maxWidth: 840, margin: "0 0 24px" })}>{text}</div>
  );

  // Build conic-gradient donut segments from {name, value} items.
  const donutData = (items) => {
    const clean = (Array.isArray(items) ? items : [])
      .map((item) => ({ name: item.name || "ללא שם", value: Number(item.value || 0) }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value);
    const total = clean.reduce((sum, item) => sum + item.value, 0) || 1;
    let current = 0;
    const segments = clean.map((item, index) => {
      const deg = (item.value / total) * 360;
      const seg = { ...item, percent: (item.value / total) * 100, start: current, end: current + deg, color: PALETTE[index % PALETTE.length] };
      current += deg;
      return seg;
    });
    const gradient = segments.length
      ? segments.map((s) => `${s.color} ${s.start}deg ${s.end}deg`).join(", ")
      : "#D7DEE7 0deg 360deg";
    return { segments, total, gradient };
  };

  const Donut = ({ title, centerLabel, items, note }) => {
    const { segments, gradient } = donutData(items);
    return (
      <div class="rp-avoid" style={px({ display: "grid", gridTemplateColumns: "300px 1fr", gap: 32, alignItems: "center", background: OFFWHITE, border: `1px solid ${TAN}`, borderRadius: 18, padding: 28, marginBottom: 22 })}>
        <div style={px({ display: "flex", justifyContent: "flex-start" })}>
          <div style={px({ width: 220, height: 220, borderRadius: "50%", background: `conic-gradient(${gradient})`, display: "flex", alignItems: "center", justifyContent: "center" })}>
            <div style={px({ width: 130, height: 130, borderRadius: "50%", background: OFFWHITE, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" })}>
              <div style={px({ fontSize: 11, color: MUTED })}>חלוקה לפי</div>
              <div style={px({ fontSize: 15, fontWeight: 700, color: NAVY, textAlign: "center" })}>{centerLabel}</div>
            </div>
          </div>
        </div>
        <div style={px({ display: "flex", flexDirection: "column", gap: 12 })}>
          {segments.length ? segments.map((seg, i) => (
            <div key={`${title}-${seg.name}-${i}`} style={px({ display: "flex", alignItems: "center", gap: 12 })}>
              <div style={px({ width: 13, height: 13, borderRadius: 4, background: seg.color, flexShrink: 0 })} />
              <div style={px({ flex: 1, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" })} title={seg.name}>{seg.name}</div>
              <div style={px({ fontSize: 15, fontWeight: 800, color: "#00215D", width: 64, textAlign: "left", direction: "ltr" })}>{seg.percent.toFixed(1)}%</div>
            </div>
          )) : <div style={px({ fontSize: 14, color: MUTED })}>אין נתונים להצגה</div>}
          {note ? <div style={px({ fontSize: 11, color: MUTED, marginTop: 4 })}>{note}</div> : null}
        </div>
      </div>
    );
  };

  const CompareBars = ({ label, withValue, withoutValue }) => {
    const withV = Number(withValue || 0);
    const withoutV = Number(withoutValue || 0);
    const max = Math.max(withV, withoutV, 1);
    return (
      <div class="rp-avoid" style={px({ background: OFFWHITE, border: `1px solid ${TAN}`, borderRadius: 16, padding: 26 })}>
        <div style={px({ fontSize: 17, fontWeight: 700, color: NAVY, marginBottom: 6 })}>{label}</div>
        <div style={px({ fontSize: 13, color: MUTED, marginBottom: 20 })}>עם המשך הפקדות מול הפסקתן</div>
        <div style={px({ display: "flex", flexDirection: "column", gap: 14 })}>
          {[{ l: "עם המשך הפקדות", v: withV, c: NAVY }, { l: "ללא המשך הפקדות", v: withoutV, c: PINK }].map((row) => (
            <div key={row.l}>
              <div style={px({ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 })}><span>{row.l}</span><strong style={px({ direction: "ltr" })}>{fmtCurrency(row.v)}</strong></div>
              <div style={px({ background: DESK, borderRadius: 8, height: 16, overflow: "hidden" })}>
                <div style={px({ width: `${Math.max((row.v / max) * 100, row.v ? 4 : 0)}%`, height: "100%", background: row.c, borderRadius: 8 })} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const Gauge = ({ label, sublabel, value, dark }) => {
    const v = Math.max(Math.min(Number(value || 0), 100), 0);
    const bg = dark ? NAVY : TAN;
    const txt = dark ? OFFWHITE : DARKTAN;
    const fill = dark ? PINK : NAVY;
    const track = dark ? "rgba(255,255,255,0.15)" : "rgba(0,33,93,0.12)";
    return (
      <div class="rp-avoid" style={px({ background: bg, borderRadius: 16, padding: 26, color: txt })}>
        <div style={px({ fontSize: 15, fontWeight: 700, marginBottom: 4, color: dark ? OFFWHITE : DARKTAN })}>{label}</div>
        <div style={px({ fontSize: 13, opacity: 0.75, marginBottom: 18, color: dark ? OFFWHITE : DARKTAN })}>{sublabel}</div>
        <div style={px({ fontSize: 36, fontWeight: 800, color: dark ? OFFWHITE : NAVY, marginBottom: 10, direction: "ltr", textAlign: "right" })}>{fmtPercentInt(v)}</div>
        <div style={px({ background: track, borderRadius: 8, height: 14, overflow: "hidden", display: "flex", direction: "rtl" })}>
          <div style={px({ width: `${v}%`, height: "100%", background: fill, borderRadius: 8, flexShrink: 0 })} />
        </div>
        <div style={px({ display: "flex", justifyContent: "space-between", fontSize: 11, opacity: 0.65, marginTop: 6, direction: "rtl", color: dark ? OFFWHITE : DARKTAN })}>
          <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
        </div>
      </div>
    );
  };

  const Kpi = ({ label, value, tone, icon }) => {
    const styles = {
      navy: { bg: NAVY, color: OFFWHITE, labelColor: "rgba(255,255,255,0.7)", border: "none" },
      pink: { bg: PINK, color: OFFWHITE, labelColor: "rgba(255,255,255,0.85)", border: "none" },
      outline: { bg: OFFWHITE, color: NAVY, labelColor: MUTED, border: `2px solid ${NAVY}` },
      soft: { bg: TAN, color: NAVY, labelColor: DARKTAN, border: "none" },
    }[tone || "outline"];
    return (
      <div class="rp-avoid" style={px({ background: styles.bg, color: styles.color, border: styles.border, borderRadius: 16, padding: 22 })}>
        {icon ? <div style={px({ marginBottom: 10, color: styles.color, lineHeight: 0 })}>{icon}</div> : null}
        <div style={px({ fontSize: 13, color: styles.labelColor })}>{label}</div>
        <div style={px({ fontSize: 26, fontWeight: 800, marginTop: 8, direction: "ltr", textAlign: "right" })}>{value}</div>
      </div>
    );
  };

  const EmptyPanel = ({ title, subtitle }) => (
    <div class="rp-avoid" style={px({ background: TAN, borderRadius: 16, padding: 40, textAlign: "center", color: DARKTAN })}>
      <div style={px({ fontSize: 16, fontWeight: 600 })}>{title}</div>
      {subtitle ? <div style={px({ fontSize: 13, opacity: 0.75, marginTop: 6 })}>{subtitle}</div> : null}
    </div>
  );

  const PageFooter = () => (
    <div style={px({ marginTop: 32, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: MUTED, borderTop: `1px solid ${TAN}`, paddingTop: 18 })}>
      <div>מבט משפחתי · דוח פנסיוני</div>
      <div style={px({ direction: "ltr" })}>{reportDate}</div>
    </div>
  );

  const th = { padding: "10px 12px", textAlign: "right" };
  const td = { padding: "9px 12px", borderBottom: `1px solid ${TAN}`, textAlign: "right" };

  // ---------- Capital breakdown aggregates ----------
  const allCapitalPension = capitalClassificationEntries.flatMap((e) => normalizeCapitalReportArray(e.pensionPolicies));
  const allCapitalStudy = capitalClassificationEntries.flatMap((e) => normalizeCapitalReportArray(e.studyFunds));
  const allCapitalRows = [...allCapitalPension, ...allCapitalStudy];
  // סה"כ קופה = כל הכספים; תגמולים/פיצויים/קצבה = פוליסות בלבד.
  // סה"כ הון = הון הפוליסות (כולל גמל להשקעה) + צבירת קרנות השתלמות.
  const capStudyBalance = allCapitalStudy.reduce((sum, r) => sum + getStudyFundBalance(r), 0);
  const capTotalBalance = summarizeCapitalRows(allCapitalRows, "totalBalance") || summarizeCapitalRows(allCapitalStudy, "redemptionValue");
  const capTotalRewards = summarizeCapitalRows(allCapitalPension, "totalRewards");
  const capTotalSeverance = summarizeCapitalRows(allCapitalPension, "totalSeverance");
  const capTotalCapital = summarizeCapitalDerivedRows(allCapitalPension, "totalCapital") + capStudyBalance;
  const capTotalPension = summarizeCapitalDerivedRows(allCapitalPension, "totalPension");

  const capitalColumns = [
    { key: "planName", label: "מוצר / קבוצה" },
    { key: "capitalRewards", label: "תגמולים הוניים", num: true },
    { key: "annuityRewardsUntil2000", label: "תגמולים קצבתיים עד 1.1.2000", num: true },
    { key: "previousEmployersSeveranceRightsSequence", label: "פיצויים קודמים ברצף", num: true },
    { key: "currentEmployerSeveranceTaxable", label: "פיצויים מעסיק נוכחי", num: true },
    { key: "totalPension", label: 'סה"כ קצבה', num: true },
    { key: "totalCapital", label: 'סה"כ הון', num: true },
    { key: "conversionCoefficient", label: "מקדם המרה לקצבה (ערך)*", theoretical: true },
    { key: "expectedRetirementCost", label: "עלות צפויה לגיל פרישה*", theoretical: true },
  ];

  // ---------- Section 28 helpers ----------
  const section28Meaningful = (rows) =>
    (Array.isArray(rows) ? rows : []).filter((row) => isMeaningfulSection28Value(row.value));

  // ---------- Savings simulation rows (from section 28 entry) ----------
  const firstSection28 = section28CappingEntries[0];
  const section28Groups = Array.isArray(firstSection28?.groups) ? firstSection28.groups : [];
  const savingGroup = getSection28Group(section28Groups, "saving-simulation", "סימולציה לחיסכון");
  const retirementGroup = getSection28Group(section28Groups, "retirement", "סימולציה לגיל פרישה");
  const savingRows = section28Meaningful(savingGroup?.rows).concat(section28Meaningful(retirementGroup?.rows));
  const hasSavingSimulation = savingRows.length > 0;

  const summaryParagraphs = String(printConversationSummary || "")
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  return (
    <div class="print-report-root" aria-hidden="true">
      <style>{css}</style>

      {/* ============ PAGE 0 — COVER ============ */}
      <section class="rp-section" style={px({ ...pageStyle, padding: "64px 56px 34px", color: NAVY, display: "flex", flexDirection: "column", borderTop: `10px solid ${NAVY}` })}>
        <div style={px({ display: "flex", alignItems: "center", gap: 10, marginBottom: 26 })}>
          <div style={px({ width: 8, height: 8, borderRadius: "50%", background: PINK })} />
          <div style={px({ fontSize: 14, letterSpacing: "0.3px", color: MUTED })}>מבט משפחתי · דוח פנסיוני</div>
        </div>
        <div style={px({ fontSize: 44, fontWeight: 800, lineHeight: 1.15, maxWidth: 640, color: NAVY })}>דוח פנסיוני משפחתי מאוחד</div>
        <div style={px({ marginTop: 16, fontSize: 16, color: "#5C5650", maxWidth: 560, lineHeight: 1.7 })}>תמונה מלאה של העתיד שלכם — פנסיה, ביטוח, השקעות ותכנון עתידי במקום אחד.</div>

        <div style={px({ position: "relative", width: "100%", height: 330, borderRadius: 20, overflow: "hidden", margin: "28px 0 24px", boxShadow: "0 14px 44px rgba(0,33,93,0.16)", backgroundImage: `url(${COVER_HERO_IMAGE})`, backgroundRepeat: "no-repeat", backgroundSize: "230%", backgroundPosition: "50% 55%" })}>
          <div style={px({ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 20%, rgba(255,255,255,0) 82%, rgba(255,255,255,0.30) 100%)" })} />
        </div>

        <div class="rp-avoid" style={px({ display: "grid", gridTemplateColumns: "300px 1fr", gap: 24, alignItems: "center", background: "#FFFFFF", border: `1px solid ${TAN}`, borderRadius: 20, padding: "24px 28px", boxShadow: "0 6px 22px rgba(0,33,93,0.06)" })}>
          <div style={px({ display: "flex", alignItems: "center", gap: 18 })}>
            <div style={px({ width: 132, height: 132, borderRadius: "50%", flexShrink: 0, background: `conic-gradient(${NAVY} 0deg 122deg, ${PINK} 122deg 212deg, ${TAN} 212deg 286deg, #C9BBA8 286deg 330deg, #9CA3AF 330deg 360deg)`, display: "flex", alignItems: "center", justifyContent: "center" })}>
              <div style={px({ width: 74, height: 74, borderRadius: "50%", background: "#fff" })} />
            </div>
            <div>
              {[["פנסיה", NAVY], ["ביטוחים", PINK], ["נכסים פיננסיים", TAN], ["נדל״ן", "#C9BBA8"], ["אחר", "#9CA3AF"]].map(([lbl, c]) => (
                <div key={lbl} style={px({ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#243B53", marginBottom: 7 })}>
                  <span style={px({ width: 11, height: 11, borderRadius: 3, flexShrink: 0, background: c })} />{lbl}
                </div>
              ))}
            </div>
          </div>
          <div>
            <div style={px({ fontSize: 12, color: MUTED, marginBottom: 8 })}>צמיחה לאורך זמן</div>
            <svg viewBox="0 0 420 130" width="100%" height="120" preserveAspectRatio="none">
              <defs><linearGradient id="rpGrow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color={NAVY} stop-opacity="0.18" /><stop offset="1" stop-color={NAVY} stop-opacity="0" /></linearGradient></defs>
              <g fill={TAN}>
                <rect x="24" y="112" width="16" height="16" rx="3" /><rect x="84" y="104" width="16" height="24" rx="3" /><rect x="144" y="96" width="16" height="32" rx="3" /><rect x="204" y="84" width="16" height="44" rx="3" /><rect x="264" y="70" width="16" height="58" rx="3" /><rect x="324" y="54" width="16" height="74" rx="3" /><rect x="384" y="34" width="16" height="94" rx="3" />
              </g>
              <polygon points="0,110 60,96 120,102 180,72 240,80 300,48 360,40 420,14 420,130 0,130" fill="url(#rpGrow)" />
              <polyline points="0,110 60,96 120,102 180,72 240,80 300,48 360,40 420,14" fill="none" stroke={NAVY} stroke-width="3" stroke-linejoin="round" stroke-linecap="round" />
              <circle cx="420" cy="14" r="5" fill={PINK} />
            </svg>
          </div>
        </div>

        <div style={px({ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderTop: `1px solid ${TAN}`, paddingTop: 22, marginTop: "auto" })}>
          <div style={px({ display: "flex", gap: 40 })}>
            <div>
              <div style={px({ fontSize: 12, color: MUTED })}>תאריך הפקה</div>
              <div style={px({ fontSize: 17, fontWeight: 600, marginTop: 4, direction: "ltr", textAlign: "right" })}>{reportDate}</div>
            </div>
            <div>
              <div style={px({ fontSize: 12, color: MUTED })}>סך נכסים משפחתי</div>
              <div style={px({ fontSize: 17, fontWeight: 600, marginTop: 4, direction: "ltr", textAlign: "right" })}>{fmtCurrency(family.totalAssets)}</div>
            </div>
          </div>
          <div style={px({ display: "flex", alignItems: "center", gap: 16 })}>
            {data?.clientLogo ? <img src={data.clientLogo} alt="לוגו" style={px({ maxHeight: 40, maxWidth: 120, objectFit: "contain" })} /> : null}
            <div>
              <div style={px({ fontSize: 12, color: MUTED })}>תאריך נכונות הנתונים</div>
              <div style={px({ fontSize: 15, fontWeight: 600, color: NAVY, marginTop: 2, direction: "ltr", textAlign: "left" })}>{family.dataValidityDate || "—"}</div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ PAGE 1 — פרטים אישיים ============ */}
      {show("personal") && (
      <section class="rp-section" style={px(pageStyle)}>
        <SectionHeader title="פרטים אישיים" subtitle="בני המשפחה המבוטחים בדוח" />
        <SectionIntro text="כדי לתת לכם תמונה מלאה ופשוטה של העתיד הפיננסי המשפחתי, ריכזנו את כל הנכסים והחיסכונות שלכם במקום אחד. כאן תוכלו לראות את סך הצבירה המעודכנת שנצברה עד כה, לצד חלוקת הכספים בין האפיקים והגופים השונים." />
        <div style={px({ display: "grid", gridTemplateColumns: members.length > 1 ? "1fr 1fr" : "1fr", gap: 28 })}>
          {(members.length ? members : [{ name: "—" }]).slice(0, 4).map((member, i) => {
            const cardNavy = i % 2 === 0;
            const bg = cardNavy ? NAVY : PINK;
            const bubble = cardNavy ? "rgba(255,39,86,0.25)" : "rgba(0,33,93,0.28)";
            const avatarBg = cardNavy ? PINK : NAVY;
            const roleLabel = i === 0 ? "מבוטח/ת ראשי/ת" : "בן/בת זוג";
            const name = member.name || "—";
            const memberRetireAge = memberDetail(member, "retireAge");
            return (
              <div class="rp-avoid" key={member.id || member.name || i} style={px({ background: bg, color: OFFWHITE, borderRadius: 20, padding: 32, position: "relative", overflow: "hidden" })}>
                <div style={px({ position: "absolute", left: -60, top: -60, width: 180, height: 180, borderRadius: "50%", background: bubble })} />
                <div style={px({ position: "relative", zIndex: 1 })}>
                  <div style={px({ width: 56, height: 56, borderRadius: "50%", background: avatarBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, marginBottom: 20 })}>{String(name).trim().slice(0, 1) || "?"}</div>
                  <div style={px({ fontSize: 26, fontWeight: 700 })}>{name}{memberRetireAge ? <span style={px({ fontSize: 15, fontWeight: 600, opacity: 0.8 })}>{` (פרישה בגיל ${memberRetireAge})`}</span> : null}</div>
                  <div style={px({ fontSize: 13, opacity: 0.8, marginTop: 2 })}>{roleLabel}</div>
                  <div style={px({ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 28 })}>
                    <div>
                      <div style={px({ fontSize: 12, opacity: 0.7 })}>תאריך לידה</div>
                      <div style={px({ fontSize: 18, fontWeight: 600, marginTop: 4, direction: "ltr", textAlign: "right" })}>{fmtDate(memberDetail(member, "birthDate"))}</div>
                    </div>
                    <div>
                      <div style={px({ fontSize: 12, opacity: 0.7 })}>שכר נוכחי</div>
                      <div style={px({ fontSize: 18, fontWeight: 600, marginTop: 4, direction: "ltr", textAlign: "right" })}>{memberDetail(member, "currentSalary") ? fmtCurrency(memberDetail(member, "currentSalary")) : "—"}</div>
                    </div>
                    <div style={px({ gridColumn: "span 2" })}>
                      <div style={px({ fontSize: 12, opacity: 0.7 })}>מקום עבודה אחרון מעודכן</div>
                      <div style={px({ fontSize: 16, fontWeight: 600, marginTop: 4, opacity: 0.8 })}>{memberDetail(member, "lastWorkplace") || "לא צוין"}</div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div class="rp-avoid" style={px({ marginTop: 28, background: TAN, borderRadius: 16, padding: "24px 28px", display: "flex", justifyContent: "space-between", alignItems: "center" })}>
          <div style={px({ fontSize: 15, color: DARKTAN, lineHeight: 1.6, maxWidth: 600 })}>סך השכר המצרפי המדווח למשפחה מהווה בסיס לחישובי ההפקדות והקצבאות המוצגים בהמשך הדוח.</div>
          <div style={px({ textAlign: "left" })}>
            <div style={px({ fontSize: 13, color: DARKTAN, opacity: 0.75 })}>שכר מצרפי</div>
            <div style={px({ fontSize: 28, fontWeight: 800, color: NAVY, direction: "ltr" })}>{combinedSalary ? fmtCurrency(combinedSalary) : "—"}</div>
          </div>
        </div>
      </section>
      )}

      {/* ============ PAGE 2 — סיכום פנסיוני ============ */}
      {show("pension") && (
      <section class="rp-section" style={px(pageStyle)}>
        <SectionHeader title="סיכום פנסיוני" subtitle="ריכוז צבירה, הפקדות ותחזית לגיל פרישה" />
        <SectionIntro text="הנה הצצה לאיך שהעתיד שלכם עשוי להיראות ביום הפרישה. החישוב מציג את הצבירה והקצבה החודשית הצפויה לכם, תוך השוואה בין המשך הפקדות שוטפות לבין מצב שבו נעצרות ההפקדות." />
        <div style={px({ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 18, marginBottom: 32 })}>
          <Kpi tone="navy" label="סך נכסים" value={fmtCurrency(family.totalAssets)} icon={<KpiWalletIcon />} />
          <Kpi tone="outline" label="הפקדה חודשית כוללת" value={fmtCurrency(family.monthlyDeposits)} icon={<KpiDepositIcon />} />
          <Kpi tone="outline" label="צבירה צפויה לפרישה" value={fmtCurrency(family.projectedLumpSumWithDeposits)} icon={<KpiBarsIcon />} />
          <Kpi tone="pink" label="קצבה חודשית צפויה" value={fmtCurrency(family.monthlyPensionWithDeposits)} icon={<KpiRecurringIcon />} />
        </div>
        <div style={px({ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 })}>
          <CompareBars label="השוואת צבירה צפויה" withValue={family.projectedLumpSumWithDeposits} withoutValue={family.projectedLumpSumWithoutDeposits} />
          <CompareBars label="השוואת קצבה חודשית צפויה" withValue={family.monthlyPensionWithDeposits} withoutValue={family.monthlyPensionWithoutDeposits} />
        </div>
        <div style={px({ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 24 })}>
          <Gauge dark label="חשיפה מנייתית משוקללת" sublabel="שיעור החשיפה למניות בתיק" value={data.weightedEquityExposure} />
          <Gauge label="חשיפה לחו״ל" sublabel="שיעור האחזקה בחו״ל" value={data.weightedForeignExposure} />
        </div>
      </section>
      )}

      {/* ============ PAGE 3 — התפלגות נכסים ============ */}
      {show("allocation") && (
      <section class="rp-section" style={px(pageStyle)}>
        <div style={px({ display: "flex", alignItems: "flex-end", justifyContent: "space-between", borderBottom: `3px solid ${NAVY}`, paddingBottom: 14, marginBottom: 22 })}>
          <div style={px({ fontSize: 34, fontWeight: 800, color: NAVY })}>התפלגות נכסים</div>
          <div style={px({ textAlign: "left" })}>
            <div style={px({ fontSize: 13, color: MUTED, fontWeight: 700 })}>סך צבירה מנוהלת</div>
            <div style={px({ fontSize: 30, fontWeight: 800, color: NAVY, direction: "ltr", marginTop: 2 })}>{fmtCurrency(family.totalAssets)}</div>
          </div>
        </div>
        <SectionIntro text="הכספים שלכם מושקעים במסלולים שונים כדי לייצר תשואה ולשמור על ערך הכסף לאורך זמן. בחלק זה תוכלו לראות בדיוק איפה הכסף מושקע – כמה ממנו נחשף למניות, כמה מושקע בחו״ל ואיך הוא מתפזר בין האפיקים השונים." />
        <Donut title="products" centerLabel="מוצרים" items={products} />
        <Donut title="managers" centerLabel="גופים מנהלים" items={managers} />
        <Donut title="channels" centerLabel="אפיקים ראשיים" items={mainGroups} note='ראו פירוט מלא בעמוד "פירוק נכסים".' />
      </section>
      )}

      {/* ============ PAGES 4+ — נכסים ברמת מוצר ============ */}
      {show("allocation") && (() => {
        const funds = (Array.isArray(productFunds) ? productFunds : [])
          .map((f) => ({
            name: f.name || "מוצר", policyNo: f.policyNo || "", productType: f.productType || "אחר", value: Number(f.value || 0),
            return12: Number(f.return12 || 0), return36: Number(f.return36 || 0), return60: Number(f.return60 || 0),
            st36: Number(f.st36 || 0), sharp36: Number(f.sharp36 || 0),
          }))
          .filter((f) => f.value > 0)
          .sort((a, b) => b.value - a.value);
        if (!funds.length) {
          return (
            <section class="rp-section" style={px(pageStyle)}>
              <SectionHeader title="נכסים ברמת מוצר" subtitle="פירוט אחזקות לפי מוצר" />
              <EmptyPanel title="לא התקבלו נתוני מוצרים להצגה" subtitle="ככל שיועברו נתוני מוצרים, יוצגו כאן אחזקות לפי מוצר." />
            </section>
          );
        }
        const Metric = ({ label, value, decimal, signed }) => (
          <div>
            <div style={px({ color: MUTED, fontSize: 10 })}>{label}</div>
            <div style={px({ fontWeight: 700, color: signed && value < 0 ? PINK : NAVY, fontSize: 12, direction: "ltr", textAlign: "right" })}>
              {decimal ? value.toFixed(2) : `${value.toFixed(2)}%`}
            </div>
          </div>
        );
        const order = ["פנסיה מקיפה", "פנסיה חדשה מקיפה", "פנסיה כללית", "ביטוח מנהלים", "קרן השתלמות", "קופת גמל", "גמל להשקעה"];
        const byType = new Map();
        funds.forEach((f) => { if (!byType.has(f.productType)) byType.set(f.productType, []); byType.get(f.productType).push(f); });
        const groups = Array.from(byType.entries())
          .map(([type, list]) => ({ type, list: list.sort((a, b) => b.value - a.value), total: list.reduce((s, x) => s + x.value, 0) }))
          .sort((a, b) => {
            const ai = order.findIndex((o) => a.type.includes(o));
            const bi = order.findIndex((o) => b.type.includes(o));
            return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || b.total - a.total;
          });
        return (
          <section class="rp-section" style={px(pageStyle)}>
            <SectionHeader title="נכסים ברמת מוצר" subtitle="תשואות ומדדי סיכון · מקובץ לפי סוג מוצר" />
            <SectionIntro text="כאן מופיע פירוט של כל המוצרים הפנסיוניים והפיננסיים שלכם, לצד הביצועים והמדדים שלהם בשנים האחרונות. מעקב אחר התשואות עוזר לנו לוודא שהחיסכון שלכם מנוהל עבורכם בצורה המיטבית בהתאם למדדי איכות ושוק." />
            {groups.map((g) => (
              <div key={g.type} style={px({ marginBottom: 20 })}>
                <div style={px({ breakAfter: "avoid", pageBreakAfter: "avoid", display: "flex", justifyContent: "space-between", alignItems: "center", background: NAVY, color: OFFWHITE, borderRadius: 10, padding: "10px 16px", marginBottom: 10 })}>
                  <div style={px({ fontSize: 15, fontWeight: 800 })}>{g.type}</div>
                  <div style={px({ fontSize: 14, fontWeight: 800, direction: "ltr" })}>{fmtCurrency(g.total)}</div>
                </div>
                <div style={px({ display: "flex", flexDirection: "column", gap: 10 })}>
                  {g.list.map((f, i) => (
                    <div class="rp-avoid" key={`${f.name}-${f.policyNo}-${i}`} style={px({ background: OFFWHITE, border: `1px solid ${TAN}`, borderLeft: `3px solid ${NAVY}`, borderRadius: 12, padding: "14px 18px" })}>
                      <div style={px({ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 })}>
                        <div style={px({ fontSize: 14, fontWeight: 700, color: NAVY })}>
                          {f.name}{f.policyNo ? <span style={px({ fontSize: 11, color: MUTED, fontWeight: 400 })}>{` · מס' ${f.policyNo}`}</span> : null}
                        </div>
                        <div style={px({ textAlign: "left" })}>
                          <div style={px({ fontSize: 10, color: MUTED, fontWeight: 700 })}>סך צבירה</div>
                          <div style={px({ fontSize: 16, fontWeight: 800, direction: "ltr", color: INK })}>{fmtCurrency(f.value)}</div>
                        </div>
                      </div>
                      <div style={px({ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 })}>
                        <Metric label="תשואה 12ח'" value={f.return12} />
                        <Metric label="תשואה 36ח'" value={f.return36} />
                        <Metric label="תשואה 60ח'" value={f.return60} />
                        <Metric label="סטיית תקן 36ח'" value={f.st36} />
                        <Metric label="שארפ 36ח'" value={f.sharp36} decimal signed />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        );
      })()}

      {/* ============ PAGE — דמי ניהול ============ */}
      {show("managementFees") && (() => {
        const mf = managementFees || {};
        const feeCards = Array.isArray(mf.cards) ? mf.cards : [];
        const feeProducts = Array.isArray(mf.products) ? mf.products : [];
        const fmtPct = (v) => `${Number(v || 0).toFixed(2)}%`;
        if (!feeCards.length && !feeProducts.length) return null;
        // Compact cell styles so the whole table fits under the boxes on one A4 page.
        const feeTh = { padding: "7px 6px", textAlign: "right", fontSize: 10.5, lineHeight: 1.25, wordBreak: "break-word" };
        const feeTd = { padding: "6px 6px", borderBottom: `1px solid ${TAN}`, textAlign: "right", fontSize: 10.5, lineHeight: 1.3, wordBreak: "break-word" };
        // overflow:visible + relaxed minHeight lets long tables paginate row-by-row
        // instead of the whole table being pushed onto the next page.
        return (
          <section class="rp-section" style={px({ ...pageStyle, minHeight: 0, overflow: "visible" })}>
            <SectionHeader title="דמי ניהול" subtitle="דמי ניהול משוקללים לפי צבירה, ופירוט דמי הניהול והמרווחים לכל מוצר" />
            <SectionIntro text="כדי לשמור על שקיפות מלאה, ריכזנו עבורכם את סך העלויות הנלוות לניהול התיק. כאן תוכלו לראות כמה אתם משלמים עבור הכיסויים הביטוחיים וכמה דמי ניהול נגבים מההפקדות השוטפות והצבירה המצטברת." />

            {feeCards.length ? (
              <div style={px({ display: "grid", gridTemplateColumns: `repeat(${feeCards.length}, 1fr)`, gap: 12, marginBottom: 16 })}>
                {feeCards.map((c, i) => (
                  <div class="rp-avoid" key={i} style={px({ background: c.isTotal ? NAVY : OFFWHITE, color: c.isTotal ? OFFWHITE : INK, border: c.isTotal ? "none" : `1px solid ${TAN}`, borderRadius: 12, padding: "12px 14px" })}>
                    <div style={px({ fontSize: 13, fontWeight: 800, color: c.isTotal ? OFFWHITE : NAVY })}>{c.name}</div>
                    <div style={px({ fontSize: 10.5, marginTop: 2, marginBottom: 8, color: c.isTotal ? "rgba(255,255,255,0.8)" : MUTED })}>סך צבירה {fmtCurrency(c.totalBalance)}</div>
                    <div style={px({ fontSize: 10.5, color: c.isTotal ? "rgba(255,255,255,0.8)" : MUTED })}>דמי ניהול מצבירה (משוקלל)</div>
                    <div style={px({ fontSize: 22, fontWeight: 800, direction: "ltr", textAlign: "right", color: c.isTotal ? OFFWHITE : NAVY })}>{fmtPct(c.feeFromBalance)}</div>
                    <div style={px({ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${c.isTotal ? "rgba(255,255,255,0.2)" : TAN}`, marginTop: 6, paddingTop: 6 })}>
                      <span style={px({ fontSize: 10.5, color: c.isTotal ? "rgba(255,255,255,0.8)" : MUTED })}>דמי ניהול מהפקדה</span>
                      <strong style={px({ fontSize: 12, direction: "ltr", color: c.isTotal ? OFFWHITE : PINK })}>{fmtPct(c.feeFromDeposit)}</strong>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {feeProducts.length ? (
              <table style={px({ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" })}>
                <colgroup>
                  <col style={px({ width: "20%" })} />
                  <col style={px({ width: "11%" })} />
                  <col style={px({ width: "10%" })} />
                  <col style={px({ width: "13%" })} />
                  <col style={px({ width: "11.5%" })} />
                  <col style={px({ width: "11.5%" })} />
                  <col style={px({ width: "11.5%" })} />
                  <col style={px({ width: "11.5%" })} />
                </colgroup>
                <thead>
                  <tr style={px({ background: NAVY, color: OFFWHITE })}>
                    <th style={px(feeTh)}>מוצר</th>
                    <th style={px(feeTh)}>ייחוס</th>
                    <th style={px(feeTh)}>מס' פוליסה</th>
                    <th style={px(feeTh)}>צבירה</th>
                    <th style={px(feeTh)}>ד"נ מצבירה</th>
                    <th style={px(feeTh)}>ד"נ מהפקדה</th>
                    <th style={px(feeTh)}>מרווח ריאלי</th>
                    <th style={px(feeTh)}>מבטיחת תשואה</th>
                  </tr>
                </thead>
                <tbody>
                  {feeProducts.map((p, i) => (
                    <tr class="rp-avoid" key={i}>
                      <td style={px(feeTd)}>{p.planName || "—"}</td>
                      <td style={px(feeTd)}>{p.attribution || "—"}</td>
                      <td style={px(feeTd)}>{p.policyNo || "—"}</td>
                      <td style={px({ ...feeTd, direction: "ltr", textAlign: "right" })}>{fmtCurrency(p.currentValue)}</td>
                      <td style={px(feeTd)}>{p.guaranteed ? "—" : fmtPct(p.feeFromBalance)}</td>
                      <td style={px(feeTd)}>{p.feeFromDeposit > 0 ? fmtPct(p.feeFromDeposit) : "—"}</td>
                      <td style={px(feeTd)}>{p.realSpread ? `${p.realSpread}%` : "—"}</td>
                      <td style={px(feeTd)}>{p.guaranteed ? (p.guaranteedYield > 0 ? fmtPct(p.guaranteedYield) : "כן") : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </section>
        );
      })()}

      {/* ============ PAGE — סכומים למקרה פטירה ============ */}
      {show("insurance") && (
      <section class="rp-section" style={px(pageStyle)}>
        <SectionHeader title="סכומים למקרה פטירה" subtitle="ביטוח חיים, הון למוטבים וקצבת שאירים" />
        <div class="rp-avoid" style={px({ background: OFFWHITE, border: `1px solid ${TAN}`, borderRadius: 12, padding: "14px 18px", marginBottom: 24, fontSize: 13, color: DARKTAN, lineHeight: 1.7 })}>
          הנתונים מציינים את הסכום למקרה פטירה המתקבל בתצורה הונית (סכום חד-פעמי למוטבים), וכן קצבה חודשית לשאירים בכל מקרה שקיימת קרן פנסיה.
        </div>
        <SectionIntro text="לצד החיסכון לעתיד, חשוב לוודא שהמשפחה מוגנת גם במקרים בלתי צפויים. חלק זה מפרט את ההגנה הכלכלית שקיימת לכם כיום במקרה של אובדן כושר עבודה או פטירה חלילה, כדי להבטיח את רשת הביטחון המשפחתית." />
        <div style={px({ fontSize: 17, fontWeight: 700, color: NAVY, marginBottom: 12 })}>כיסויים לפי בן משפחה</div>
        {members.length ? (
          <table style={px({ fontSize: 13 })}>
            <thead>
              <tr style={px({ background: NAVY, color: OFFWHITE })}>
                <th style={px(th)}>בן משפחה</th>
                <th style={px(th)}>הון למוטבים / פטירה</th>
                <th style={px(th)}>אובדן כושר עבודה</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member, i) => (
                <tr key={member.id || member.name || i} style={px({ background: i % 2 === 0 ? OFFWHITE : DESK })}>
                  <td style={px(td)}>{member.name || "—"}</td>
                  <td style={px({ ...td, direction: "ltr", textAlign: "right" })}>{fmtCurrency(member.deathCoverage)}</td>
                  <td style={px({ ...td, direction: "ltr", textAlign: "right" })}>{`${fmtCurrency(member.disabilityValue)} (${Math.round(Number(member.disabilityPercent || 0))}%)`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <EmptyPanel title="לא התקבלו נתוני כיסויים להצגה" />}
        <div style={px({ marginTop: 28, fontSize: 17, fontWeight: 700, color: NAVY, marginBottom: 12 })}>סכום פיצוי חודשי מקרן הפנסיה</div>
        {Array.isArray(deathBenefit?.pensionRows) && deathBenefit.pensionRows.length ? (
          <>
            <table style={px({ fontSize: 13 })}>
              <thead>
                <tr style={px({ background: PINK, color: OFFWHITE })}>
                  <th style={px(th)}>בן משפחה</th>
                  <th style={px(th)}>שם מוצר</th>
                  <th style={px(th)}>סטטוס</th>
                  <th style={px(th)}>סכום לאלמנה</th>
                  <th style={px(th)}>סכום ליתום</th>
                  <th style={px(th)}>סך קצבה</th>
                </tr>
              </thead>
              <tbody>
                {deathBenefit.pensionRows.map((row, i) => (
                  <tr key={row.id || i} style={px({ background: i % 2 === 0 ? OFFWHITE : DESK })}>
                    <td style={px(td)}>{row.memberName || "—"}</td>
                    <td style={px(td)}>{row.planName || "—"}</td>
                    <td style={px({ ...td, fontWeight: 600, color: row.active ? NAVY : MUTED })}>{row.active ? "פעילה" : "לא פעילה"}</td>
                    <td style={px({ ...td, direction: "ltr", textAlign: "right" })}>{fmtCurrency(row.widowPension)}</td>
                    <td style={px({ ...td, direction: "ltr", textAlign: "right" })}>{fmtCurrency(row.orphanPension)}</td>
                    <td style={px({ ...td, direction: "ltr", textAlign: "right", fontWeight: 700 })}>{fmtCurrency(row.totalPension)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={px({ fontSize: 12, color: MUTED, marginTop: 10, lineHeight: 1.6 })}>סך הקצבה החודשית לאלמנה וליתומים אינה יכולה לעלות על השכר המבוטח; הפיצוי לכל יתום משולם עד גיל 21.</div>
          </>
        ) : <EmptyPanel title="אין נתוני פיצוי חודשי מקרן פנסיה להצגה" />}
      </section>
      )}

      {/* ============ PAGE — הלוואות ============ */}
      {show("loans") && (
      <section class="rp-section" style={px(pageStyle)}>
        <SectionHeader title="הלוואות" subtitle="פירוט הלוואות על חשבון מוצרים פנסיוניים" />
        <div style={px({ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 36 })}>
          <Kpi tone="outline" label='סה"כ הלוואות' value={fmtCurrency(totalLoansAmount)} />
          <Kpi tone="outline" label="יתרת הלוואות" value={fmtCurrency(totalLoansBalance)} />
        </div>
        {loanDetails.length ? (
          <table style={px({ fontSize: 13 })}>
            <thead>
              <tr style={px({ background: NAVY, color: OFFWHITE })}>
                <th style={px(th)}>שם</th><th style={px(th)}>סכום</th><th style={px(th)}>יתרה</th><th style={px(th)}>תדירות</th><th style={px(th)}>סיום</th>
              </tr>
            </thead>
            <tbody>
              {loanDetails.slice(0, 14).map((loan, i) => (
                <tr key={loan.id || i} style={px({ background: i % 2 === 0 ? OFFWHITE : DESK })}>
                  <td style={px(td)}>{[loan.firstName, loan.familyName].filter(Boolean).join(" ") || "—"}</td>
                  <td style={px({ ...td, direction: "ltr", textAlign: "right" })}>{fmtCurrency(loan.amount)}</td>
                  <td style={px({ ...td, direction: "ltr", textAlign: "right" })}>{fmtCurrency(loan.balance)}</td>
                  <td style={px(td)}>{loan.repaymentFrequency || "—"}</td>
                  <td style={px({ ...td, direction: "ltr", textAlign: "right" })}>{fmtDate(loan.endDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyPanel title="לא התקבל מידע על הלוואות להצגה" subtitle="ככל שיועברו נתוני הלוואות, יוצגו כאן פירוט יתרות, ריביות ולוחות סילוקין." />
        )}
      </section>
      )}

      {/* ============ PAGE — פירוק נכסים ============ */}
      {show("capitalClassification") && hasCapitalClassification ? (
        <section class="rp-section" style={px(pageStyle)}>
          <SectionHeader title="פירוק נכסים" subtitle="סיווג הוני / קצבתי לפי מוצר" />
          <div style={px({ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 })}>
            <Kpi tone="navy" label='סה"כ קופה' value={fmtCurrency(capTotalBalance)} />
            <Kpi tone="outline" label='סה"כ תגמולים' value={fmtCurrency(capTotalRewards)} />
            <Kpi tone="outline" label='סה"כ פיצויים' value={fmtCurrency(capTotalSeverance)} />
            <Kpi tone="pink" label='סה"כ הון' value={fmtCurrency(capTotalCapital)} />
          </div>
          {(() => {
            const segs = [
              { name: "הון (נזיל / כספים הוניים)", value: capTotalCapital, color: NAVY },
              { name: "קצבה (מיועד לקצבה חודשית)", value: capTotalPension, color: PINK },
              { name: "קרנות השתלמות (צבירה בלבד)", value: capStudyBalance, color: TAN },
            ];
            const tot = segs.reduce((s, x) => s + x.value, 0) || 1;
            let cur = 0;
            const stops = segs.map((s) => { const start = cur; cur += (s.value / tot) * 360; return `${s.color} ${start}deg ${cur}deg`; }).join(", ");
            return (
              <div class="rp-avoid" style={px({ display: "grid", gridTemplateColumns: "300px 1fr", gap: 36, alignItems: "center", background: OFFWHITE, border: `1px solid ${TAN}`, borderRadius: 20, padding: 32, marginBottom: 28 })}>
                <div style={px({ display: "flex", justifyContent: "flex-start" })}>
                  <div style={px({ width: 220, height: 220, borderRadius: "50%", background: `conic-gradient(${stops})`, display: "flex", alignItems: "center", justifyContent: "center" })}>
                    <div style={px({ width: 130, height: 130, borderRadius: "50%", background: OFFWHITE, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" })}>
                      <div style={px({ fontSize: 11, color: MUTED })}>סיווג</div>
                      <div style={px({ fontSize: 14, fontWeight: 700, color: NAVY })}>הוני/קצבתי</div>
                    </div>
                  </div>
                </div>
                <div style={px({ display: "flex", flexDirection: "column", gap: 14 })}>
                  {segs.map((s, i) => (
                    <div key={i} style={px({ display: "flex", alignItems: "center", gap: 12 })}>
                      <div style={px({ width: 14, height: 14, borderRadius: 4, background: s.color, flexShrink: 0 })} />
                      <div style={px({ flex: 1, fontSize: 15 })}>{s.name}</div>
                      <div style={px({ fontSize: 15, fontWeight: 700, direction: "ltr" })}>{fmtCurrency(s.value)}</div>
                      <div style={px({ fontSize: 13, color: MUTED, width: 52, textAlign: "left", direction: "ltr" })}>{((s.value / tot) * 100).toFixed(1)}%</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
          {allCapitalPension.length ? (
            <table style={px({ fontSize: 8, marginTop: 6, tableLayout: "fixed", width: "100%" })}>
              <thead>
                <tr style={px({ background: NAVY, color: OFFWHITE })}>
                  {capitalColumns.map((c) => <th key={c.key} style={px({ padding: "6px 3px", textAlign: "right", wordBreak: "break-word", lineHeight: 1.2, width: c.key === "planName" ? "13%" : "10.8%" })}>{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {allCapitalPension.slice(0, 10).map((row, i) => (
                  <tr key={row.id || i} style={px({ background: i % 2 === 0 ? OFFWHITE : DESK })}>
                    {capitalColumns.map((c) => (
                      <td key={c.key} style={px({ padding: "5px 3px", borderBottom: `1px solid ${TAN}`, textAlign: "right", direction: c.num ? "ltr" : "rtl", wordBreak: "break-word", color: c.theoretical ? MUTED : undefined })}>
                        {c.theoretical ? "—" : getCapitalDisplayValue(row, c.key)}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr style={px({ background: NAVY, color: OFFWHITE, fontWeight: 700 })}>
                  {capitalColumns.map((c, i) => (
                    <td key={c.key} style={px({ padding: "6px 3px", textAlign: "right", direction: c.num ? "ltr" : "rtl", wordBreak: "break-word", opacity: c.theoretical ? 0.7 : 1 })}>
                      {i === 0 ? 'סה"כ' : c.theoretical ? "—" : c.num ? getCapitalRowValue({ value: summarizeCapitalDerivedRows(allCapitalPension, c.key) }, "value") : ""}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          ) : null}
          {capStudyBalance > 0 ? (
            <div class="rp-avoid" style={px({ marginTop: 24, display: "flex", justifyContent: "space-between", alignItems: "center", background: TAN, borderRadius: 14, padding: "18px 24px" })}>
              <div style={px({ fontSize: 14, color: DARKTAN })}>קרנות השתלמות — צבירה בלבד</div>
              <div style={px({ fontSize: 20, fontWeight: 800, color: NAVY, direction: "ltr" })}>{fmtCurrency(capStudyBalance)}</div>
            </div>
          ) : null}
          <div style={px({ fontSize: 11, color: MUTED, marginTop: 10, lineHeight: 1.6 })}>כספים הוניים כוללים רכיבי הון, תגמולים הוניים ותגמולים קצבתיים עד שנת 2000. קרנות השתלמות מוצגות כצבירה בלבד. * שתי העמודות האחרונות הן הערכה תיאורטית להמחשה בלבד ואינן מבוססות על מקדם בפועל שהתקבל מהגוף המנהל.</div>
        </section>
      ) : null}

      {/* ============ PAGE — קיטום סעיף 28 ============ */}
      {show("section28") && hasSection28Capping ? section28CappingEntries.map((entry, entryIndex) => {
        const groups = Array.isArray(entry?.groups) ? entry.groups : [];
        const allRows = groups.flatMap((g) => section28Meaningful(g?.rows));
        const monthlyRow = allRows.find((r) => isSection28MonthlySavingRow(r.label));
        const costGroup = getSection28Group(groups, "employer-cost", "עלויות") || groups[0];
        const costRows = section28Meaningful(costGroup?.rows);
        const employerRows = pickSection28Rows(costRows, ["השתלמות מעל תקרה", "פיצויים מעל לתקרה", "תגמולים מעל לתקרה"]);
        const employerSummary = pickSection28Rows(costRows, ["סכום קיטום מעל לסעיף 28 ברוטו", "סכום נטו לאחר ניכוי מס שולי"]);
        const employeeRows = pickSection28Rows(costRows, ["גידול בנטו בעקבות קיטום בפיצויים", "גידול בנטו בעקבות קיטום תגמולים", "גידול בנטו בעקבות קיטום קה\"ש מעל לתקרה", "הפרשות עובד קה\"ש מעל תקרה", "הפרשות עובד תגמולים"]);
        const employeeSummary = pickSection28Rows(costRows, ['סה"כ גידול נטו', "סה״כ גידול נטו", "סך הכל גידול נטו"]);
        const comparisonRows = Array.isArray(entry?.comparisonRows) ? entry.comparisonRows : [];
        const chartRows = comparisonRows.filter((r) => {
          const l = normalizeSection28Text(r.label).replace(/סהכ/g, 'סה"כ');
          return (l === "קצבה" || l.includes('סה"כ הון')) && (isMeaningfulSection28Value(r.before) || isMeaningfulSection28Value(r.after));
        });
        const CostCard = ({ title, rows, summary }) => (
          <div class="rp-avoid" style={px({ background: OFFWHITE, border: `1px solid ${TAN}`, borderRadius: 16, padding: 26 })}>
            <div style={px({ fontSize: 16, fontWeight: 700, color: NAVY, marginBottom: 16 })}>{title}</div>
            <div style={px({ display: "flex", flexDirection: "column", gap: 10, fontSize: 13.5 })}>
              {rows.map((r, i) => {
                const parts = String(r.label).split(/\s*—\s*/);
                return (
                  <div key={`r-${i}`} style={px({ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 })}>
                    <span style={px({ minWidth: 0 })}>{parts[0]}{parts.length > 1 ? <><br /><span style={px({ color: MUTED, fontSize: 12 })}>{parts.slice(1).join(" — ")}</span></> : null}</span>
                    <strong style={px({ direction: "ltr", flexShrink: 0, whiteSpace: "nowrap" })}>{formatSection28DisplayValue(r.value)}</strong>
                  </div>
                );
              })}
              {summary.map((r, i) => {
                const parts = String(r.label).split(/\s*—\s*/);
                return (
                  <div key={`s-${i}`} style={px({ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, borderTop: i === 0 ? `1px solid ${TAN}` : "none", paddingTop: i === 0 ? 10 : 0 })}>
                    <span style={px({ minWidth: 0 })}>{parts[0]}{parts.length > 1 ? <><br /><span style={px({ color: MUTED, fontSize: 12 })}>{parts.slice(1).join(" — ")}</span></> : null}</span>
                    <strong style={px({ direction: "ltr", color: NAVY, flexShrink: 0, whiteSpace: "nowrap" })}>{formatSection28DisplayValue(r.value)}</strong>
                  </div>
                );
              })}
              {!rows.length && !summary.length ? <div style={px({ color: MUTED })}>אין נתון להצגה</div> : null}
            </div>
          </div>
        );
        return (
          <section class="rp-section" style={px(pageStyle)} key={`s28-${entryIndex}`}>
            <SectionHeader title="קיטום סעיף 28" subtitle={entry.ownerLabel || "מבוטח/ת ראשית"} />
            <div class="rp-avoid" style={px({ background: OFFWHITE, border: `1px solid ${TAN}`, borderRadius: 12, padding: "14px 18px", marginBottom: 24, fontSize: 13, color: DARKTAN, lineHeight: 1.7 })}>
              קיטום לפי סעיף 28 משמעותו הפחתה יחסית של כלל רכיבי השכר, כך שסכומם הכולל לא יעלה על התקרה הקבועה בחוק – עד פי שמונה משכר המינימום. הקיטום אינו מבטל רכיב שכר מסוים, אלא מפחית באופן יחסי את כלל הרכיבים, ובכך עשוי להגדיל את השכר נטו המשולם בתלוש.
            </div>
            <div style={px({ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 28 })}>
              <CostCard title="חלק מעסיק" rows={employerRows} summary={employerSummary} />
              <CostCard title="חלק עובד" rows={employeeRows} summary={employeeSummary} />
            </div>
            {monthlyRow ? (
              <div class="rp-avoid" style={px({ background: NAVY, color: OFFWHITE, borderRadius: 16, padding: 26, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 })}>
                <div style={px({ fontSize: 15, opacity: 0.8 })}>{monthlyRow.label}</div>
                <div style={px({ fontSize: 30, fontWeight: 800, direction: "ltr" })}>{formatSection28DisplayValue(monthlyRow.value)}</div>
              </div>
            ) : null}
            {chartRows.length ? (
              <>
                <div style={px({ fontSize: 17, fontWeight: 700, color: NAVY, marginBottom: 14 })}>השוואה בין תרחישים</div>
                <div style={px({ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 })}>
                  {chartRows.map((row, i) => {
                    const before = Math.abs(section28NumericValue(row.before));
                    const after = Math.abs(section28NumericValue(row.after));
                    const max = Math.max(before, after, 1);
                    const gapNum = section28NumericValue(row.gap) || (section28NumericValue(row.after) - section28NumericValue(row.before));
                    const title = normalizeSection28Text(row.label) === "קצבה" ? "קצבה חודשית" : row.label;
                    return (
                      <div class="rp-avoid" key={`cmp-${i}`} style={px({ background: OFFWHITE, border: `1px solid ${TAN}`, borderRadius: 16, padding: 24 })}>
                        <div style={px({ fontSize: 14, color: MUTED, marginBottom: 14 })}>{title}</div>
                        <div style={px({ display: "flex", flexDirection: "column", gap: 12 })}>
                          {[{ l: "לפני קיטום", v: before, dv: row.before, c: NAVY }, { l: "אחרי קיטום", v: after, dv: row.after, c: PINK }].map((b, bi) => (
                            <div key={bi}>
                              <div style={px({ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 })}><span>{b.l}</span><strong style={px({ direction: "ltr" })}>{formatSection28DisplayValue(b.dv)}</strong></div>
                              <div style={px({ background: DESK, borderRadius: 8, height: 14, overflow: "hidden" })}>
                                <div style={px({ width: `${Math.max((b.v / max) * 100, b.v ? 4 : 0)}%`, height: "100%", background: b.c, borderRadius: 8 })} />
                              </div>
                            </div>
                          ))}
                        </div>
                        <div style={px({ marginTop: 14, fontSize: 13, fontWeight: 700, color: gapNum < 0 ? PINK : NAVY, direction: "rtl" })}>
                          פער: {gapNum < 0 ? "‎-" : "‎+"}{formatSection28DisplayValue(Math.abs(gapNum))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : null}
          </section>
        );
      }) : null}

      {/* ============ PAGE — סימולציה לחיסכון ============ */}
      {show("section28") && hasSavingSimulation ? (
        <section class="rp-section" style={px(pageStyle)}>
          <SectionHeader title="סימולציית חיסכון וגיל פרישה" subtitle="קופת גמל להשקעה · חיסכון אישי" />
          <div style={px({ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18, marginBottom: 24 })}>
            {savingRows.slice(0, 3).map((row, i) => (
              <Kpi key={`sv-${i}`} tone={i === 2 ? "pink" : "outline"} label={row.label} value={formatSection28DisplayValue(row.value)} />
            ))}
          </div>
          {savingRows.length > 3 ? (
            <div style={px({ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 })}>
              {savingRows.slice(3, 5).map((row, i) => (
                <Kpi key={`sv2-${i}`} tone={i === 0 ? "navy" : "soft"} label={row.label} value={formatSection28DisplayValue(row.value)} />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {/* ============ PAGE — קצבה מוכרת ============ */}
      {show("recognizedPension") && hasRecognizedPension ? recognizedPensionEntries.map((entry, entryIndex) => {
        const vestedRows = Array.isArray(entry?.vestedBalanceTable?.rows) ? entry.vestedBalanceTable.rows : [];
        const manualRows = getManualRecognizedPensionRows(entry?.recognizedPensionAdjustments);
        const pdfTotal = getPdfExemptPaymentsTotal(vestedRows);
        const manualTotal = manualRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
        return (
          <section class="rp-section" style={px(pageStyle)} key={`recognized-${entryIndex}`}>
            <SectionHeader title="קצבה מוכרת" subtitle={entry.ownerLabel || "בן/בת זוג"} />
            <div class="rp-avoid" style={px({ background: OFFWHITE, border: `1px solid ${TAN}`, borderRadius: 12, padding: "14px 18px", marginBottom: 24, fontSize: 13, color: DARKTAN, lineHeight: 1.7 })}>
              קצבה מוכרת היא החלק בקצבה שנובע מהפקדות שכבר שולם עליהן מס, או מהפקדות שלא ניתנה בגינן הטבת מס. לכן, בעת קבלת הקצבה בגיל פרישה, חלק זה עשוי להיות פטור ממס, בכפוף להוראות החוק ולהכרה של רשות המסים.
            </div>
            {vestedRows.length ? (
              <>
                <div class="rp-avoid" style={px({ background: NAVY, color: OFFWHITE, borderRadius: 16, padding: "24px 28px", marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center" })}>
                  <div style={px({ fontSize: 14, opacity: 0.75 })}>סה"כ תשלומים פטורים (טבלת חישוב מהמסמך)</div>
                  <div style={px({ fontSize: 26, fontWeight: 800, direction: "ltr" })}>{formatReportNumber(pdfTotal)}</div>
                </div>
                <table style={px({ fontSize: 12, marginBottom: 28 })}>
                  <thead>
                    <tr style={px({ background: NAVY, color: OFFWHITE })}>
                      <th style={px(th)}>שם הקופה</th><th style={px(th)}>תשלומים פטורים</th><th style={px(th)}>קצבה מוכרת</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vestedRows.slice(0, 10).map((row, i) => (
                      <tr key={row.id || i} style={px({ background: i % 2 === 0 ? OFFWHITE : DESK })}>
                        <td style={px(td)}>{row.fundName || "—"}</td>
                        <td style={px({ ...td, direction: "ltr", textAlign: "right" })}>{row.exemptPayments || "—"}</td>
                        <td style={px({ ...td, direction: "ltr", textAlign: "right" })}>{row.pension || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : null}
            {manualRows.length ? (
              <>
                <div style={px({ fontSize: 17, fontWeight: 700, color: NAVY, marginBottom: 14 })}>קצבה מוכרת שהוזנה ידנית</div>
                <div style={px({ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "stretch" })}>
                  <table style={px({ fontSize: 13 })}>
                    <thead>
                      <tr style={px({ background: PINK, color: OFFWHITE })}>
                        <th style={px(th)}>חברת ביטוח</th><th style={px(th)}>קצבה מוכרת שהוזנה</th>
                      </tr>
                    </thead>
                    <tbody>
                      {manualRows.slice(0, 8).map((row, i) => (
                        <tr key={row.id || i} style={px({ background: i % 2 === 0 ? OFFWHITE : DESK })}>
                          <td style={px(td)}>{row.companyName || "—"}</td>
                          <td style={px({ ...td, direction: "ltr", textAlign: "right" })}>{formatReportNumber(row.amount)}</td>
                        </tr>
                      ))}
                      <tr style={px({ background: DESK })}>
                        <td style={px({ ...td, fontWeight: 700 })}>סה"כ</td>
                        <td style={px({ ...td, fontWeight: 700, direction: "ltr", textAlign: "right" })}>{formatReportNumber(manualTotal)}</td>
                      </tr>
                    </tbody>
                  </table>
                  {pdfTotal > 0 && manualTotal > 0 ? (
                    <div class="rp-avoid" style={px({ background: TAN, borderRadius: 16, padding: 22, display: "flex", flexDirection: "column", justifyContent: "center" })}>
                      <div style={px({ fontSize: 13, color: DARKTAN })}>פער הצבירה לחיסכון במס</div>
                      <div style={px({ fontSize: 12, color: DARKTAN, opacity: 0.75, marginTop: 2 })}>לפי טבלת ה-PDF, בניכוי הקצבה שהוזנה ידנית</div>
                      <div style={px({ fontSize: 28, fontWeight: 800, color: NAVY, marginTop: 10, direction: "ltr" })}>{formatReportNumber(pdfTotal - manualTotal)}</div>
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}
            {!vestedRows.length && !manualRows.length ? <EmptyPanel title="לא קיימים נתוני קצבה מוכרת בדוח." /> : null}
          </section>
        );
      }) : null}

      {/* ============ PAGE — סיכום שיחה ============ */}
      {show("summary") && (
      <section class="rp-section" style={px({ ...pageStyle, display: "flex", flexDirection: "column" })}>
        <SectionHeader title="סיכום שיחה" subtitle="אזור להצגת סיכום הפגישה ותובנות ללקוח" />
        {summaryParagraphs.length ? (
          <div style={px({ flex: 1, display: "flex", flexDirection: "column", gap: 14 })}>
            {summaryParagraphs.map((block, i) => {
              const lines = block.split(/\n+/).map((l) => l.trim()).filter(Boolean);
              const isTopic = lines.length > 1;
              return (
                <div class="rp-avoid" key={`summary-${i}`} style={px({ background: OFFWHITE, border: `1px solid ${TAN}`, borderRadius: 16, padding: "20px 24px", whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.75 })}>
                  {isTopic ? (
                    <>
                      <div style={px({ color: NAVY, fontSize: 16, fontWeight: 800, marginBottom: 8 })}>{lines[0]}</div>
                      <div>{lines.slice(1).join("\n")}</div>
                    </>
                  ) : block}
                </div>
              );
            })}
          </div>
        ) : (
          <div class="rp-avoid" style={px({ flex: 1, background: OFFWHITE, border: `2px dashed ${TAN}`, borderRadius: 20, padding: 48, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, textAlign: "center" })}>
            <div style={px({ width: 56, height: 56, borderRadius: "50%", background: NAVY })} />
            <div style={px({ fontSize: 17, fontWeight: 700, color: NAVY })}>כאן יוצג סיכום השיחה עם הלקוח</div>
            <div style={px({ fontSize: 14, color: MUTED, maxWidth: 480, lineHeight: 1.6 })}>עבור משפחה מאוחדת. בשלב זה זהו אזור הכנה, וניתן לחבר אליו בהמשך שדה טקסט ידני או ממנגנון שמירת הדוח.</div>
          </div>
        )}
        <PageFooter />
      </section>
      )}
    </div>
  );
}
