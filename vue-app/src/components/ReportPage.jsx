import { defineComponent, ref, computed, watch } from "vue";
import { px } from "../px";
import { COVER_HERO_IMAGE } from "../coverHero";

const STORAGE_CLIENT_MODEL_KEY = "familyPensionClientModel";
const STORAGE_REPORT_DATA_KEY = "familyPensionReportData";

const SUMMARY_TOPIC_DEFINITIONS = [
  { id: "managersInsurance", title: "ביטוח מנהלים" },
  { id: "pensionFund", title: "קרן פנסיה" },
  { id: "providentFund", title: "קופת גמל" },
  { id: "trainingFund", title: "קרן השתלמות" },
  { id: "section28", title: "סעיף 28" },
  { id: "recognizedPension", title: "קצבה מוכרת" },
  { id: "rightsFixation", title: "קיבוע זכויות" },
  { id: "simulatedRetirement", title: "פרישה מדומה" },
  { id: "amendment190", title: "תיקון 190" },
  { id: "inheritance", title: "הורשה / מוטבים" },
];

function createDefaultSummaryTopics(existingTopics = []) {
  const existingById = new Map(
    safeArray(existingTopics).map((topic) => [topic.id, topic])
  );

  return SUMMARY_TOPIC_DEFINITIONS.map((definition) => {
    const existing = existingById.get(definition.id) || {};

    return {
      ...definition,
      checked: Boolean(existing.checked),
      spouseA: existing.spouseA || existing.partnerA || existing.husband || "",
      spouseB: existing.spouseB || existing.partnerB || existing.wife || "",
      actionA: existing.actionA || existing.partnerAAction || existing.husbandAction || "",
      actionB: existing.actionB || existing.partnerBAction || existing.wifeAction || "",
      action: existing.action || existing.recommendedAction || "",
    };
  });
}

function buildConversationSummaryText(generalSummary, topics) {
  const parts = [];

  const cleanGeneral = String(generalSummary || "").trim();
  if (cleanGeneral) {
    parts.push(cleanGeneral);
  }

  const selectedTopicBlocks = safeArray(topics)
    .filter((topic) => topic.checked)
    .map((topic) => {
      const lines = [];
      const spouseA = String(topic.spouseA || "").trim();
      const spouseB = String(topic.spouseB || "").trim();

      if (spouseA) lines.push(`בן זוג: ${spouseA}`);
      if (spouseB) lines.push(`בת זוג: ${spouseB}`);

      if (!lines.length) return "";

      return `${topic.title}\n${lines.join("\n")}`;
    })
    .filter(Boolean);

  if (selectedTopicBlocks.length) {
    parts.push(selectedTopicBlocks.join("\n\n"));
  }

  return parts.join("\n\n");
}

function stripLeadingActionNumber(value) {
  return String(value || "")
    .replace(/^\s*(?:\d+|[א-ת])[\).\-\u05F3\u05F4]?\s*/u, "")
    .trim();
}

function cleanManualActionText(value) {
  const text = String(value || "").trim();

  if (!text) return "";

  const legacyDefaultMarkers = [
    "מומלץ לבחון את הפער בין הקצבה הצפויה",
    "מומלץ לבדוק האם יש ריכוז יתר במוצרים",
    "מומלץ לעבור על הכיסויים הביטוחיים",
    "מומלץ לבחון את מדיניות ההשקעה",
  ];

  if (legacyDefaultMarkers.some((marker) => text.includes(marker))) {
    return "";
  }

  return text;
}

function splitActionLines(value) {
  return String(value || "")
    .split(/\n+/)
    .map(stripLeadingActionNumber)
    .filter(Boolean);
}

function formatTopicActionBlock(topic) {
  const spouseAActions = splitActionLines(topic.actionA);
  const spouseBActions = splitActionLines(topic.actionB);
  const generalActions = splitActionLines(topic.action);
  const lines = [];

  if (spouseAActions.length) {
    lines.push("בן זוג");
    spouseAActions.forEach((action, index) => lines.push(`${index + 1}. ${action}`));
  }

  if (spouseBActions.length) {
    if (lines.length) lines.push("");
    lines.push("בת זוג");
    spouseBActions.forEach((action, index) => lines.push(`${index + 1}. ${action}`));
  }

  if (generalActions.length) {
    if (lines.length) lines.push("");
    lines.push("כללי");
    generalActions.forEach((action, index) => lines.push(`${index + 1}. ${action}`));
  }

  if (!lines.length) return "";

  return `${topic.title}\n${lines.join("\n")}`;
}

function buildActionRecommendationsText(manualText, topics) {
  const manualActions = splitActionLines(cleanManualActionText(manualText));

  const topicActionBlocks = safeArray(topics)
    .filter((topic) => topic.checked)
    .map(formatTopicActionBlock)
    .filter(Boolean);

  const cleanManual = cleanManualActionText(manualText).trim();
  const manualBlock = cleanManual
    ? `פעולות ידניות כלליות\n${cleanManual}`
    : "";

  return [manualBlock, ...topicActionBlocks].filter(Boolean).join("\n\n");
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

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

  // סה"כ הון = פיצוים הונים מעסיק נוכחי + תגמולים הונים +
  //           תגמולים קצבתים עד שנת 2000 + פיצוים ממעסיקים קודמים ברצף זכויות +
  //           פיצוים הונים פטורים / נזילים
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

  // סה"כ קצבה = תגמולים קצבתים + פיצוים קצבתים מעסיק נוכחי +
  //           פיצוים ממעסיקים קודמים ברצף קצבה + פיצוים קצבתים פטורים / נזילים
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

function hasCapitalColumnValue(rows, column) {
  const safeRows = normalizeCapitalReportArray(rows);
  if (!safeRows.length) return false;

  if (column.alwaysVisible) return true;

  if (column.type === "number") {
    return summarizeCapitalDerivedRows(safeRows, column.key) > 0;
  }

  return safeRows.some((row) => String(row?.[column.key] || "").trim());
}

function getCapitalActiveColumns(rows, columns) {
  return columns.filter((column) => hasCapitalColumnValue(rows, column));
}

function CapitalClassificationReportSection({ entries, styles }) {
  const safeEntries = normalizeCapitalReportArray(entries);

  if (!safeEntries.length) return null;

  const wrapperStyle = {
    display: "flex",
    flexDirection: "column",
    gap: 18,
  };

  return (
    <div style={px(wrapperStyle)}>
      {safeEntries.map((entry, index) => (
        <CapitalClassificationOwnerBlock
          key={`${entry.owner || "owner"}-${entry.sourceFileName || index}`}
          entry={entry}
          styles={styles}
        />
      ))}
    </div>
  );
}

function CapitalClassificationOwnerBlock({ entry, styles }) {
  const pensionRows = normalizeCapitalReportArray(entry?.pensionPolicies);
  const studyRows = normalizeCapitalReportArray(entry?.studyFunds);
  const allRows = [...pensionRows, ...studyRows];
  // סה"כ קופה = כל הכספים (פוליסות + קרנות השתלמות).
  // סה"כ תגמולים / פיצויים / קצבה = פוליסות בלבד.
  // סה"כ הון = הון הפוליסות (כולל גמל להשקעה) + צבירת קרנות השתלמות
  //           (קרנות השתלמות הן כספים הוניים).
  const studyBalance = studyRows.reduce((sum, row) => sum + getStudyFundBalance(row), 0);
  const totalBalance =
    summarizeCapitalRows(allRows, "totalBalance") ||
    summarizeCapitalRows(studyRows, "redemptionValue");
  const totalRewards = summarizeCapitalRows(pensionRows, "totalRewards");
  const totalSeverance = summarizeCapitalRows(pensionRows, "totalSeverance");
  const totalCapital = summarizeCapitalDerivedRows(pensionRows, "totalCapital") + studyBalance;
  const totalPension = summarizeCapitalDerivedRows(pensionRows, "totalPension");

  return (
    <div
      style={px({
        border: "1px solid #E7ECF3",
        borderRadius: 18,
        background: "linear-gradient(180deg, #FFFFFF 0%, #F7F9FC 100%)",
        overflow: "hidden",
      })}
    >
      <div
        style={px({
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          padding: "16px 18px",
          borderBottom: "1px solid #E7ECF3",
          background: "#FFFFFF",
          flexWrap: "wrap",
        })}
      >
        <div>
          <div style={px({ color: "#00215D", fontSize: 16, fontWeight: 900 })}>
            פירוק נכסים ללקוח דוגמא זכר · {entry.ownerLabel || "בן/בת זוג"}
          </div>
          <div style={px({ color: "#627D98", fontSize: 12, marginTop: 4 })}>
            {entry.sourceFileName ? `מקור הנתונים: ${entry.sourceFileName}` : "נתוני סיווג כספים שהוזנו במסך ההעלאה"}
          </div>
        </div>

        <div
          style={px({
            display: "grid",
            gridTemplateColumns: "repeat(5, minmax(108px, 1fr))",
            gap: 8,
            minWidth: 540,
          })}
        >
          <CapitalMiniStat label="סה״כ קופה" value={totalBalance} />
          <CapitalMiniStat label="סה״כ תגמולים" value={totalRewards} />
          <CapitalMiniStat label="סה״כ פיצויים" value={totalSeverance} />
          <CapitalMiniStat label="סה״כ הון" value={totalCapital} />
          <CapitalMiniStat label="סה״כ קצבה" value={totalPension} />
        </div>
      </div>

      <div style={px({ padding: 18 })}>
        {pensionRows.length ? (
          <CapitalClassificationTable
            title="פירוט פוליסות וקרנות"
            subtitle="סקירה מרכזת של תגמולים, פיצויים וקרנות שאינן קרנות השתלמות."
            rows={pensionRows}
            type="pension"
          />
        ) : null}

        {studyRows.length ? (
          <div style={px({ marginTop: pensionRows.length ? 24 : 0 })}>
            <CapitalClassificationTable
              title="קרנות השתלמות"
              subtitle="פירוט קרנות השתלמות לפי חברה מנהלת, מספר קופה וצבירה."
              rows={studyRows}
              type="study"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CapitalMiniStat({ label, value }) {
  const isCapital = String(label || "").includes("הון");
  const isPension = String(label || "").includes("קצבה");

  return (
    <div
      style={px({
        background: isCapital ? "#FFFDF7" : isPension ? "#F8FBFF" : "#F7F9FC",
        border: isCapital ? "1px solid #F1E4C8" : isPension ? "1px solid #DDEAF8" : "1px solid #DDE3EC",
        borderRadius: 14,
        padding: "10px 12px",
        textAlign: "center",
      })}
    >
      <div style={px({ color: "#627D98", fontSize: 11, fontWeight: 800, marginBottom: 4 })}>
        {label}
      </div>
      <div style={px({ color: "#00215D", fontSize: 14, fontWeight: 900, direction: "ltr" })}>
        {getCapitalRowValue({ value }, "value")}
      </div>
    </div>
  );
}

function CapitalLegend() {
  return (
    <div
      style={px({
        margin: "0 0 14px",
        background: "#FFFFFF",
        border: "1px solid #E7ECF3",
        borderRadius: 14,
        padding: "12px 14px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 14,
        flexWrap: "wrap",
      })}
    >
      <div style={px({ color: "#00215D", fontSize: 13, fontWeight: 900 })}>
        מקרא סיווג כספים
      </div>

      <div style={px({ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" })}>
        <div style={px({ display: "flex", gap: 8, alignItems: "center" })}>
          <span
            style={px({
              width: 16,
              height: 16,
              borderRadius: 5,
              background: "#FFFDF7",
              border: "1px solid #F1E4C8",
              display: "inline-block",
            })}
          />
          <span style={px({ color: "#486581", fontSize: 12, fontWeight: 800 })}>
            כספים הוניים / נזילים / תגמולים עד 1.1.2000
          </span>
        </div>

        <div style={px({ display: "flex", gap: 8, alignItems: "center" })}>
          <span
            style={px({
              width: 16,
              height: 16,
              borderRadius: 5,
              background: "#F8FBFF",
              border: "1px solid #DDEAF8",
              display: "inline-block",
            })}
          />
          <span style={px({ color: "#486581", fontSize: 12, fontWeight: 800 })}>
            כספים קצבתיים המיועדים לקצבה חודשית
          </span>
        </div>
      </div>
    </div>
  );
}

function getStudyFundBalance(row) {
  return (
    getCapitalRowNumber(row, "redemptionValue") ||
    getCapitalRowNumber(row, "totalBalance") ||
    getCapitalRowNumber(row, "totalFund")
  );
}

function getCapitalCellTone(column) {
  const capitalKeys = new Set([
    "capitalRewards",
    "annuityRewardsUntil2000",
    "capitalSeverance",
    "previousEmployersSeveranceRightsSequence",
    "liquidExemptSeverance",
    "totalCapital",
  ]);

  const pensionKeys = new Set([
    "annuityRewards",
    "currentEmployerAnnuitySeverance",
    "previousEmployersSeveranceAnnuitySequence",
    "annuitySeverance",
    "pension",
    "totalPension",
  ]);

  if (capitalKeys.has(column.key)) return "capital";
  if (pensionKeys.has(column.key)) return "pension";
  return "neutral";
}

function getCapitalToneBackground(tone, isHeader = false, isTotal = false) {
  if (tone === "capital") return isHeader ? "#EEF2FA" : isTotal ? "#EEF2FA" : "#FFFDF7";
  if (tone === "pension") return isHeader ? "#EEF6FF" : isTotal ? "#EEF6FF" : "#F8FBFF";
  return isHeader ? "#EEF2FA" : isTotal ? "#EEF2FA" : "#FFFFFF";
}

function CapitalClassificationTable({ title, subtitle, rows, type }) {
  const pensionColumns = [
    { key: "planName", label: "מוצר / קבוצה", alwaysVisible: true },
    { key: "policyNumber", label: "מספר פוליסה / קופה" },
    { key: "managerName", label: "חברה מנהלת" },
    { key: "capitalRewards", label: "תגמולים הוניים", type: "number" },
    { key: "annuityRewards", label: "תגמולים קצבתיים", type: "number" },
    { key: "annuityRewardsUntil2000", label: "תגמולים קצבתיים עד 1.1.2000", type: "number" },
    { key: "previousEmployersSeveranceRightsSequence", label: "פיצויים ממעסיקים קודמים ברצף זכויות", type: "number" },
    { key: "previousEmployersSeveranceAnnuitySequence", label: "פיצויים ממעסיקים קודמים ברצף קצבה", type: "number" },
    { key: "capitalSeverance", label: "פיצויים הוניים מעסיק נוכחי", type: "number" },
    { key: "currentEmployerAnnuitySeverance", label: "פיצויים קצבתיים מעסיק נוכחי", type: "number" },
    { key: "currentEmployerSeveranceTaxable", label: "פיצויים מעסיק נוכחי למס", type: "number" },
    { key: "liquidExemptSeverance", label: "פיצויים הוניים פטורים / נזילים", type: "number" },
    { key: "annuitySeverance", label: "פיצויים קצבתיים פטורים / נזילים", type: "number" },
    { key: "totalCapital", label: "סה״כ הון", type: "number", alwaysVisible: true, isTotalColumn: true },
    { key: "totalPension", label: "סה״כ קצבה", type: "number", alwaysVisible: true, isTotalColumn: true },
  ];

  const studyColumns = [
    { key: "managerName", label: "חברה מנהלת", alwaysVisible: true },
    { key: "policyNumber", label: "מספר קופה", alwaysVisible: true },
    { key: "studyBalance", label: "צבירה", type: "number", alwaysVisible: true },
  ];

  const displayRows = type === "study"
    ? normalizeCapitalReportArray(rows).map((row) => ({
        ...row,
        studyBalance: getStudyFundBalance(row),
      }))
    : normalizeCapitalReportArray(rows);

  const baseColumns = type === "study" ? studyColumns : pensionColumns;
  const columns = getCapitalActiveColumns(displayRows, baseColumns);
  const totalKeys = columns.filter((column) => column.type === "number").map((column) => column.key);
  const minWidth = type === "study" ? Math.max(480, columns.length * 160) : Math.max(760, columns.length * 126);

  return (
    <div>
      {type !== "study" ? <CapitalLegend /> : null}

      <div style={px({ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 10, flexWrap: "wrap" })}>
        <div>
          <div style={px({ color: "#00215D", fontSize: 18, fontWeight: 900 })}>{title}</div>
          <div style={px({ color: "#627D98", fontSize: 12, marginTop: 4 })}>{subtitle}</div>
        </div>
      </div>

      <div style={px({ overflowX: "auto", border: "1px solid #DDE3EC", borderRadius: 14, background: "#fff", boxShadow: "0 4px 12px rgba(16,42,67,0.04)" })}>
        <table style={px({ width: "100%", minWidth, borderCollapse: "collapse", tableLayout: "fixed", direction: "rtl" })}>
          <thead>
            <tr>
              {columns.map((column) => {
                const tone = getCapitalCellTone(column);
                return (
                  <th
                    key={column.key}
                    style={px({
                      background: "#EEF2FA",
                      color: "#243B53",
                      borderLeft: "1px solid #D8E2EF",
                      borderBottom: "1px solid #D8E2EF",
                      padding: "12px 8px",
                      fontSize: 11,
                      fontWeight: 900,
                      textAlign: "center",
                      lineHeight: 1.35,
                    })}
                  >
                    {column.label}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {displayRows.map((row, rowIndex) => (
              <tr key={row.id || `${row.policyNumber || row.planName || "row"}-${rowIndex}`}>
                {columns.map((column) => {
                  const tone = getCapitalCellTone(column);
                  const isTotalColumn = column.isTotalColumn || column.key === "studyBalance";
                  return (
                    <td
                      key={column.key}
                      style={px({
                        borderLeft: "1px solid #E4EAF2",
                        borderBottom: "1px solid #E4EAF2",
                        padding: "11px 8px",
                        textAlign: "center",
                        fontSize: 11,
                        fontWeight: isTotalColumn ? 900 : 600,
                        color: isTotalColumn ? "#00215D" : "#102A43",
                        background: rowIndex % 2 ? "#FFFFFF" : "#F7F9FC",
                        whiteSpace: "normal",
                        wordBreak: "break-word",
                        direction: column.type === "number" ? "ltr" : "rtl",
                      })}
                    >
                      {getCapitalDisplayValue(row, column.key)}
                    </td>
                  );
                })}
              </tr>
            ))}

            <tr>
              {columns.map((column, columnIndex) => {
                const shouldTotal = totalKeys.includes(column.key);
                const tone = getCapitalCellTone(column);
                return (
                  <td
                    key={column.key}
                    style={px({
                      borderLeft: "1px solid #D8E2EF",
                      padding: "12px 8px",
                      textAlign: "center",
                      fontSize: 11,
                      fontWeight: 900,
                      color: "#1D4ED8",
                      background: shouldTotal
                        ? getCapitalToneBackground(tone, true, column.isTotalColumn || column.key === "studyBalance")
                        : "#EEF2FA",
                      direction: shouldTotal ? "ltr" : "rtl",
                    })}
                  >
                    {columnIndex === 0 ? 'סה"כ' : shouldTotal ? getCapitalRowValue({ value: summarizeCapitalDerivedRows(displayRows, column.key) }, "value") : ""}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {type !== "study" ? (
        <div
          style={px({
            marginTop: 10,
            border: "1px solid #E7ECF3",
            borderRadius: 12,
            background: "#FFFFFF",
            color: "#627D98",
            fontSize: 11,
            lineHeight: 1.65,
            padding: "10px 12px",
          })}
        >
          כספים הוניים כוללים רכיבי הון, תגמולים הוניים, תגמולים קצבתיים עד 1.1.2000 ורכיבי פיצויים הוניים/נזילים. כספים קצבתיים כוללים רכיבים המיועדים לקצבה חודשית.
        </div>
      ) : null}
    </div>
  );
}

function buildClientModelFromReportData(reportData) {
  const data = reportData || {};
  const family = data.family || {};

  return {
    lastUpdated:
      family.lastUpdated ||
      data.lastUpdated ||
      new Intl.DateTimeFormat("he-IL").format(new Date()),

    summary: {
      totalAssets: Number(family.totalAssets || 0),
      monthlyDeposits: Number(family.monthlyDeposits || 0),
      projectedLumpSumWithDeposits: Number(
        family.projectedLumpSumWithDeposits || 0
      ),
      projectedLumpSumWithoutDeposits: Number(
        family.projectedLumpSumWithoutDeposits || 0
      ),
      monthlyPensionWithDeposits: Number(
        family.monthlyPensionWithDeposits || 0
      ),
      monthlyPensionWithoutDeposits: Number(
        family.monthlyPensionWithoutDeposits || 0
      ),
    },

    exposures: {
      equity: Number(data.weightedEquityExposure || 0),
      foreign: Number(data.weightedForeignExposure || 0),
    },

    distributions: {
      products: safeArray(data.products),
      managers: safeArray(data.managers),
      mainGroups: safeArray(data.mainGroupAllocation),
      mainGroupAllocation: safeArray(data.mainGroupAllocation),
      assetClasses: safeArray(data.mainGroupAllocation),
      foreignExposureAllocation: safeArray(data.foreignExposureAllocation),
    },

    members: safeArray(data.members).map((member, index) => ({
      id: member.id || member.name || `member-${index}`,
      name: member.name || "ללא שם",

      summary: {
        totalAssets: Number(member.assets || member.totalAssets || 0),
        monthlyDeposits: Number(member.monthlyDeposits || 0),
        monthlyPensionWithDeposits: Number(
          member.monthlyPensionWithDeposits || 0
        ),
        monthlyPensionWithoutDeposits: Number(
          member.monthlyPensionWithoutDeposits || 0
        ),
        projectedLumpSumWithDeposits: Number(
          member.lumpSumWithDeposits ||
            member.projectedLumpSumWithDeposits ||
            0
        ),
        projectedLumpSumWithoutDeposits: Number(
          member.lumpSumWithoutDeposits ||
            member.projectedLumpSumWithoutDeposits ||
            0
        ),
      },

      insurance: {
        deathCoverage: Number(member.deathCoverage || 0),
        disabilityValue: Number(member.disabilityValue || 0),
        disabilityPercent: Number(member.disabilityPercent || 0),
      },
    })),

    loans: {
      hasData: Boolean(data.loans?.hasData),
      details: safeArray(data.loans?.details),
    },

    conversationSummary:
      data.conversationSummary || data.clientConversationSummary || data.summaryText || "",
    actionRecommendations:
      data.actionRecommendations || data.clientActionRecommendations || data.recommendationsText || data.recommendations || "",
    recommendationsText:
      data.actionRecommendations || data.clientActionRecommendations || data.recommendationsText || data.recommendations || "",

    sourceReportData: data,
  };
}

function saveClientDashboardData(reportData) {
  const clientModel = buildClientModelFromReportData(reportData);

  const clientModelJson = JSON.stringify(clientModel);
  const reportDataJson = JSON.stringify(reportData);

  localStorage.setItem(STORAGE_CLIENT_MODEL_KEY, clientModelJson);
  localStorage.setItem(STORAGE_REPORT_DATA_KEY, reportDataJson);
  localStorage.setItem("clientModel", clientModelJson);
  localStorage.setItem("reportData", reportDataJson);
  localStorage.setItem("familyPensionClientModel", clientModelJson);
  localStorage.setItem("familyPensionReportData", reportDataJson);

  sessionStorage.setItem(STORAGE_CLIENT_MODEL_KEY, clientModelJson);
  sessionStorage.setItem(STORAGE_REPORT_DATA_KEY, reportDataJson);
  sessionStorage.setItem("clientModel", clientModelJson);
  sessionStorage.setItem("reportData", reportDataJson);
  sessionStorage.setItem("familyPensionClientModel", clientModelJson);
  sessionStorage.setItem("familyPensionReportData", reportDataJson);

  window.__familyPensionClientModel = clientModel;
  window.__familyPensionReportData = reportData;

  window.dispatchEvent(
    new CustomEvent("familyPensionReportDataUpdated", {
      detail: {
        reportData,
        clientModel,
      },
    })
  );

  return clientModel;
}

const ReportPage = defineComponent({
  name: "ReportPage",
  props: {
    reportData: { type: Object, default: null },
    onBack: { type: Function, default: undefined },
    onCreateShareLink: { type: Function, default: () => null },
  },
  setup(props) {
    const generalConversationSummaryRef = ref(
      props.reportData?.generalConversationSummary ||
        props.reportData?.conversationSummary ||
        props.reportData?.clientConversationSummary ||
        props.reportData?.summaryText ||
        ""
    );

    const summaryTopicsRef = ref(
      createDefaultSummaryTopics(
        props.reportData?.summaryTopics ||
          props.reportData?.conversationSummaryTopics ||
          []
      )
    );

    const manualActionRecommendationsRef = ref(
      cleanManualActionText(
        props.reportData?.manualActionRecommendations ||
          props.reportData?.actionRecommendations ||
          props.reportData?.clientActionRecommendations ||
          props.reportData?.recommendationsText ||
          props.reportData?.recommendations ||
          ""
      )
    );

    const isClientLinkCopiedRef = ref(false);

    watch(
      () => props.reportData,
      () => {
        generalConversationSummaryRef.value =
          props.reportData?.generalConversationSummary ||
          props.reportData?.conversationSummary ||
          props.reportData?.clientConversationSummary ||
          props.reportData?.summaryText ||
          "";
        summaryTopicsRef.value = createDefaultSummaryTopics(
          props.reportData?.summaryTopics ||
            props.reportData?.conversationSummaryTopics ||
            []
        );
        manualActionRecommendationsRef.value = cleanManualActionText(
          props.reportData?.manualActionRecommendations ||
            props.reportData?.actionRecommendations ||
            props.reportData?.clientActionRecommendations ||
            props.reportData?.recommendationsText ||
            props.reportData?.recommendations ||
            ""
        );
      }
    );

    const conversationSummaryC = computed(() =>
      buildConversationSummaryText(
        generalConversationSummaryRef.value,
        summaryTopicsRef.value
      )
    );

    const actionRecommendationsC = computed(() =>
      buildActionRecommendationsText(
        manualActionRecommendationsRef.value,
        summaryTopicsRef.value
      )
    );

    const selectedSummaryTopicsC = computed(() =>
      summaryTopicsRef.value.filter(
        (topic) =>
          topic.checked &&
          (String(topic.spouseA || "").trim() ||
            String(topic.spouseB || "").trim() ||
            String(topic.actionA || "").trim() ||
            String(topic.actionB || "").trim() ||
            String(topic.action || "").trim())
      )
    );

    const reportDataForClientC = computed(() => ({
      ...(props.reportData || {}),
      generalConversationSummary: generalConversationSummaryRef.value,
      summaryTopics: summaryTopicsRef.value,
      conversationSummary: conversationSummaryC.value,
      clientConversationSummary: conversationSummaryC.value,
      summaryText: conversationSummaryC.value,
      manualActionRecommendations: manualActionRecommendationsRef.value,
      actionRecommendations: actionRecommendationsC.value,
      clientActionRecommendations: actionRecommendationsC.value,
      recommendationsText: actionRecommendationsC.value,
      recommendations: actionRecommendationsC.value,
    }));

    return () => {
      const reportData = props.reportData;
      const onBack = props.onBack;
      const onCreateShareLink = props.onCreateShareLink || (() => null);

      const generalConversationSummary = generalConversationSummaryRef.value;
      const summaryTopics = summaryTopicsRef.value;
      const manualActionRecommendations = manualActionRecommendationsRef.value;
      const isClientLinkCopied = isClientLinkCopiedRef.value;
      const conversationSummary = conversationSummaryC.value;
      const actionRecommendations = actionRecommendationsC.value;
      const selectedSummaryTopics = selectedSummaryTopicsC.value;
      const reportDataForClient = reportDataForClientC.value;

      const setGeneralConversationSummary = (v) => {
        generalConversationSummaryRef.value = v;
      };
      const setSummaryTopics = (updater) => {
        summaryTopicsRef.value =
          typeof updater === "function" ? updater(summaryTopicsRef.value) : updater;
      };
      const setManualActionRecommendations = (v) => {
        manualActionRecommendationsRef.value = v;
      };
      const setIsClientLinkCopied = (v) => {
        isClientLinkCopiedRef.value = v;
      };

  const safeReportData = reportData || {};

  const {
    family = {},
    members = [],
    products = [],
    managers = [],
    mainGroupAllocation = [],
    foreignExposureAllocation = [],
    weightedForeignExposure = 0,
    loans = { hasData: false, details: [] },
    weightedEquityExposure = 0,
  } = safeReportData;

  const recognizedPensionEntries = normalizeRecognizedPensionReportData(safeReportData);
  const hasVestedBalanceTable = recognizedPensionEntries.length > 0;

  const section28CappingEntries = normalizeSection28CappingReportData(safeReportData);
  const hasSection28Capping = section28CappingEntries.length > 0;

  const capitalClassificationEntries = normalizeCapitalClassificationReportData(safeReportData);
  const hasCapitalClassification = capitalClassificationEntries.length > 0;

  const handleExportPdf = () => {
    window.print();
  };

  const copyTextToClipboard = async (text) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
    return true;
  };

  const handleCreateClientLink = async () => {
    if (!reportData || !reportData.family) {
      alert("אין דוח מוכן ליצירת לינק. קודם יש להפיק דוח.");
      return;
    }

    saveClientDashboardData(reportDataForClient);

    const result = onCreateShareLink({
      expirationHours: 24,
      reportData: reportDataForClient,
      clientModel: buildClientModelFromReportData(reportDataForClient),
      conversationSummary,
      actionRecommendations,
      recommendationsText: actionRecommendations,
    });

    if (!result?.success || !result?.url) {
      alert(result?.error || "לא ניתן היה ליצור לינק ללקוח.");
      return;
    }

    try {
      await copyTextToClipboard(result.url);
    } catch (error) {
      console.error("Failed to copy client link", error);
      window.prompt("העתק את הלינק ללקוח:", result.url);
    }

    setIsClientLinkCopied(true);
    window.setTimeout(() => setIsClientLinkCopied(false), 3500);
  };

  const updateSummaryTopic = (id, field, value) => {
    setSummaryTopics((prev) =>
      prev.map((topic) =>
        topic.id === id
          ? {
              ...topic,
              [field]: value,
            }
          : topic
      )
    );
  };

  const toggleSummaryTopic = (id) => {
    setSummaryTopics((prev) =>
      prev.map((topic) =>
        topic.id === id
          ? {
              ...topic,
              checked: !topic.checked,
            }
          : topic
      )
    );
  };

  const markAllSummaryTopics = () => {
    setSummaryTopics((prev) =>
      prev.map((topic) => ({
        ...topic,
        checked: true,
      }))
    );
  };

  const clearAllSummaryTopicMarks = () => {
    setSummaryTopics((prev) =>
      prev.map((topic) => ({
        ...topic,
        checked: false,
      }))
    );
  };

  const formatCurrency = (value) =>
    `₪${Math.round(Number(value || 0)).toLocaleString("en-US")}`;

  const formatPercentLabel = (value) => `${Math.round(Number(value || 0))}%`;

  const formatDate = (value) => {
    if (!value) return "—";
    const str = String(value).trim();

    if (/^\d{8}$/.test(str)) {
      const y = str.slice(0, 4);
      const m = str.slice(4, 6);
      const d = str.slice(6, 8);
      return `${d}/${m}/${y}`;
    }

    const date = new Date(str);
    if (!isNaN(date.getTime())) {
      return new Intl.DateTimeFormat("he-IL").format(date);
    }

    return str;
  };

  const normalizedLoanDetails = Array.isArray(loans?.details)
    ? loans.details
        .map((loan, index) => ({
          id:
            loan.id ||
            `${loan.firstName || ""}_${loan.familyName || ""}_${
              loan.endDate || ""
            }_${index}`,
          firstName: loan.firstName || "",
          familyName: loan.familyName || "",
          amount: Number(loan.amount || 0),
          repaymentFrequency: loan.repaymentFrequency || "",
          balance: Number(loan.balance || 0),
          endDate: loan.endDate || "",
        }))
        .filter(
          (loan) =>
            loan.firstName ||
            loan.familyName ||
            loan.amount ||
            loan.balance ||
            loan.repaymentFrequency ||
            loan.endDate
        )
    : [];

  const groupedLoans = normalizedLoanDetails.reduce((acc, loan) => {
    const personName =
      [loan.firstName, loan.familyName].filter(Boolean).join(" ").trim() ||
      "ללא שיוך";

    if (!acc[personName]) acc[personName] = [];
    acc[personName].push(loan);
    return acc;
  }, {});

  const hasDetailedLoans = normalizedLoanDetails.length > 0;

  const totalLoansAmount = normalizedLoanDetails.reduce(
    (sum, loan) => sum + (loan.amount || 0),
    0
  );

  const loanRatioToAssets =
    Number(family.totalAssets || 0) > 0
      ? (totalLoansAmount / Number(family.totalAssets || 0)) * 100
      : 0;

  const retirementLumpBars = (() => {
    const withDeposits = Number(family.projectedLumpSumWithDeposits || 0);
    const withoutDeposits = Number(family.projectedLumpSumWithoutDeposits || 0);
    const maxValue = Math.max(withDeposits, withoutDeposits, 1);

    return [
      {
        label: "עם הפקדות",
        value: withDeposits,
        display: formatCurrency(withDeposits),
        ratio: (withDeposits / maxValue) * 100,
        tone: "primary",
      },
      {
        label: "ללא הפקדות",
        value: withoutDeposits,
        display: formatCurrency(withoutDeposits),
        ratio: (withoutDeposits / maxValue) * 100,
        tone: "muted",
      },
    ];
  })();

  const retirementPensionBars = (() => {
    const withDeposits = Number(family.monthlyPensionWithDeposits || 0);
    const withoutDeposits = Number(family.monthlyPensionWithoutDeposits || 0);
    const maxValue = Math.max(withDeposits, withoutDeposits, 1);

    return [
      {
        label: "עם הפקדות",
        value: withDeposits,
        display: formatCurrency(withDeposits),
        ratio: (withDeposits / maxValue) * 100,
        tone: "primary",
      },
      {
        label: "ללא הפקדות",
        value: withoutDeposits,
        display: formatCurrency(withoutDeposits),
        ratio: (withoutDeposits / maxValue) * 100,
        tone: "muted",
      },
    ];
  })();

  const exposureLabel =
    weightedEquityExposure <= 30
      ? "חשיפה נמוכה"
      : weightedEquityExposure <= 60
      ? "חשיפה בינונית"
      : "חשיפה גבוהה";

  const pageBg = "#F4F6F9";
  const surface = "#FFFFFF";
  const surfaceAlt = "#F7F9FC";
  const border = "#DDE3EC";
  const divider = "#E7ECF3";
  const text = "#102A43";
  const textSoft = "#627D98";
  const navy = "#00215D";
  const accent = "#FF2756";
  const blue = "#1F77B4";
  const cyan = "#43B5D9";
  const purple = "#8F63C9";
  const gold = "#F0B43C";
  const mutedBar = "#C7D1E2";
  const softBlue = "#EAF1FB";
  const buttonBorder = "#D9DDE8";

  const brandChartColors = [
    navy,
    accent,
    blue,
    cyan,
    purple,
    gold,
    "#9FD0E6",
    "#58BF78",
    "#B79ADE",
    "#A8B0BA",
  ];

  const styles = {
    page: {
      minHeight: "100vh",
      background: pageBg,
      padding: "24px",
      direction: "rtl",
      fontFamily: 'Calibri, "Arial", sans-serif',
      color: text,
      boxSizing: "border-box",
      fontSize: "12px",
      lineHeight: 1.6,
    },
    actionsBar: {
      maxWidth: "1280px",
      margin: "0 auto 18px",
      display: "flex",
      gap: "12px",
      flexWrap: "wrap",
      justifyContent: "flex-start",
      direction: "rtl",
      alignItems: "center",
    },
    container: {
      maxWidth: "1280px",
      margin: "0 auto",
      display: "flex",
      flexDirection: "column",
      gap: "18px",
    },
    sectionCard: {
      background: surface,
      border: `1px solid ${border}`,
      borderRadius: "20px",
      padding: "20px",
      boxShadow: "0 2px 10px rgba(16,42,67,0.05)",
      boxSizing: "border-box",
      breakInside: "avoid",
      pageBreakInside: "avoid",
    },
    heroHeader: {
      background: `linear-gradient(135deg, ${navy}, #001845)`,
      color: "#fff",
      borderRadius: "24px",
      padding: "24px 26px",
      boxShadow: "0 8px 28px rgba(0,33,93,0.14)",
      display: "grid",
      gridTemplateColumns: "1.05fr 2fr 1.05fr",
      alignItems: "center",
      gap: "16px",
      direction: "ltr",
      overflow: "hidden",
      breakInside: "avoid",
      pageBreakInside: "avoid",
    },
    heroMeta: {
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      alignItems: "flex-end",
      justifySelf: "end",
      direction: "rtl",
      minWidth: 0,
    },
    heroMetaLabel: {
      fontSize: "12px",
      color: "rgba(255,255,255,0.75)",
    },
    heroMetaValue: {
      fontSize: "14px",
      fontWeight: 700,
      color: "#fff",
    },
    heroCenter: {
      textAlign: "center",
      direction: "rtl",
      minWidth: 0,
    },
    heroEyebrow: {
      fontSize: "12px",
      color: "rgba(255,255,255,0.78)",
      marginBottom: "8px",
      fontWeight: 700,
    },
    heroTitle: {
      margin: 0,
      fontSize: "30px",
      fontWeight: 700,
      lineHeight: 1.2,
      color: "#fff",
    },
    heroSubtitle: {
      margin: "12px auto 0",
      maxWidth: "760px",
      fontSize: "12px",
      lineHeight: 1.8,
      color: "rgba(255,255,255,0.9)",
    },
    heroLogoWrap: {
      justifySelf: "start",
      direction: "ltr",
      minWidth: 0,
    },
    heroClientLogoBox: {
      width: "178px",
      height: "64px",
      borderRadius: "16px",
      background: "rgba(255,255,255,0.11)",
      border: "1px solid rgba(255,255,255,0.18)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      padding: "8px",
      boxSizing: "border-box",
    },
    heroClientLogoImage: {
      display: "block",
      maxWidth: "100%",
      maxHeight: "100%",
      width: "auto",
      height: "auto",
      objectFit: "contain",
    },
    heroClientLogoPlaceholder: {
      width: "100%",
      height: "100%",
      borderRadius: "12px",
      background: "rgba(255,255,255,0.13)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "rgba(255,255,255,0.58)",
      fontSize: "11px",
      fontWeight: 700,
    },
    topGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
      gap: "18px",
      breakInside: "avoid",
      pageBreakInside: "avoid",
    },
    kpiCard: {
      background: surface,
      border: `1px solid ${border}`,
      borderRadius: "20px",
      padding: "20px",
      minHeight: "188px",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      boxShadow: "0 2px 10px rgba(16,42,67,0.05)",
      boxSizing: "border-box",
      breakInside: "avoid",
      pageBreakInside: "avoid",
      transition: "all 0.2s ease",
    },
    kpiIconWrap: {
      width: "74px",
      height: "74px",
      borderRadius: "22px",
      background: "#F4F7FB",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      marginBottom: "14px",
    },
    kpiTitle: {
      fontSize: "14px",
      color: textSoft,
      fontWeight: 700,
      marginBottom: "10px",
      textAlign: "center",
    },
    kpiValue: {
      fontSize: "34px",
      lineHeight: 1.1,
      fontWeight: 700,
      color: navy,
      marginBottom: "10px",
      textAlign: "center",
    },
    kpiSub: {
      fontSize: "12px",
      color: "#7A8CA8",
      lineHeight: 1.7,
      textAlign: "center",
      maxWidth: "260px",
      margin: "0 auto",
    },
    donutCard: {
      background: surface,
      border: `1px solid ${border}`,
      borderRadius: "20px",
      padding: "18px",
      minHeight: "188px",
      boxShadow: "0 2px 10px rgba(16,42,67,0.05)",
      boxSizing: "border-box",
      breakInside: "avoid",
      pageBreakInside: "avoid",
    },
    donutTitle: {
      margin: 0,
      color: navy,
      fontSize: "14px",
      fontWeight: 700,
    },
    smallText: {
      fontSize: "12px",
      color: textSoft,
      lineHeight: 1.6,
    },
    donutLayout: {
      display: "grid",
      gridTemplateColumns: "110px 1fr",
      gap: "14px",
      alignItems: "center",
      marginTop: "12px",
    },
    compareGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
      gap: "18px",
      breakInside: "avoid",
      pageBreakInside: "avoid",
    },
    compareCard: {
      background: surface,
      border: `1px solid ${border}`,
      borderRadius: "20px",
      padding: "20px",
      minHeight: "190px",
      boxShadow: "0 2px 10px rgba(16,42,67,0.05)",
      boxSizing: "border-box",
      breakInside: "avoid",
      pageBreakInside: "avoid",
    },
    compareTitle: {
      fontSize: "14px",
      fontWeight: 700,
      color: navy,
      marginBottom: "8px",
    },
    compareDesc: {
      fontSize: "12px",
      color: textSoft,
      lineHeight: 1.7,
      marginBottom: "18px",
    },
    compareBarList: {
      display: "flex",
      flexDirection: "column",
      gap: "18px",
    },
    compareBarItem: {
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      breakInside: "avoid",
      pageBreakInside: "avoid",
    },
    compareBarTop: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: "8px",
      flexWrap: "wrap",
    },
    compareBarLabel: {
      fontSize: "12px",
      color: "#4A5D7A",
      fontWeight: 700,
    },
    compareBarValue: {
      fontSize: "18px",
      color: navy,
      fontWeight: 700,
    },
    compareTrack: {
      width: "100%",
      height: "18px",
      borderRadius: "999px",
      background: softBlue,
      overflow: "hidden",
    },
    compareFillPrimary: {
      height: "100%",
      borderRadius: "999px",
      background: `linear-gradient(90deg, ${accent}, ${navy})`,
    },
    compareFillMuted: {
      height: "100%",
      borderRadius: "999px",
      background: mutedBar,
    },
    lowerTwoGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
      gap: "18px",
      alignItems: "stretch",
    },
    equityCard: {
      background: surface,
      border: `1px solid ${border}`,
      borderRadius: "20px",
      padding: "20px",
      minHeight: "190px",
      boxShadow: "0 2px 10px rgba(16,42,67,0.05)",
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "column",
      breakInside: "avoid",
      pageBreakInside: "avoid",
    },
    equityValueWrap: {
      display: "flex",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: "12px",
      flexWrap: "wrap",
      marginBottom: "18px",
    },
    equityValue: {
      fontSize: "34px",
      lineHeight: 1.1,
      fontWeight: 700,
      color: navy,
    },
    equityLabel: {
      fontSize: "14px",
      fontWeight: 700,
      color: textSoft,
    },
    sectionHeader: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: "12px",
      flexWrap: "wrap",
      marginBottom: "10px",
    },
    titleWithIcon: {
      display: "flex",
      alignItems: "center",
      gap: "10px",
    },
    h2: {
      margin: 0,
      fontSize: "14px",
      color: navy,
      fontWeight: 700,
      lineHeight: 1.4,
    },
    explanation: {
      fontSize: "12px",
      color: textSoft,
      lineHeight: 1.7,
      marginBottom: "16px",
    },
    bottomGrid: {
      display: "grid",
      gridTemplateColumns: "1.35fr 0.9fr",
      gap: "18px",
      alignItems: "start",
    },
    summaryStatsGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
      gap: "12px",
      marginBottom: "14px",
    },
    statCard: {
      background: surfaceAlt,
      border: `1px solid ${divider}`,
      borderRadius: "14px",
      padding: "14px",
      breakInside: "avoid",
      pageBreakInside: "avoid",
    },
    statLabel: {
      fontSize: "12px",
      color: textSoft,
      marginBottom: "8px",
    },
    statValue: {
      fontSize: "18px",
      fontWeight: 700,
      color: navy,
    },
    simpleInfoBox: {
      background: surfaceAlt,
      border: `1px solid ${divider}`,
      borderRadius: "14px",
      padding: "16px",
      breakInside: "avoid",
      pageBreakInside: "avoid",
    },
    infoLabel: {
      fontSize: "12px",
      color: textSoft,
      marginBottom: "8px",
    },
    infoValue: {
      fontSize: "16px",
      fontWeight: 700,
      color: navy,
      lineHeight: 1.5,
    },
    membersGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
      gap: "18px",
      alignItems: "start",
    },
    memberCard: {
      background: surface,
      border: `1px solid ${border}`,
      borderRadius: "20px",
      padding: "18px",
      boxShadow: "0 2px 10px rgba(16,42,67,0.05)",
      boxSizing: "border-box",
      breakInside: "avoid",
      pageBreakInside: "avoid",
      alignSelf: "start",
    },
    memberTop: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: "12px",
      flexWrap: "wrap",
      marginBottom: "14px",
    },
    memberName: {
      fontSize: "18px",
      fontWeight: 700,
      color: navy,
      marginBottom: "4px",
    },
    chip: {
      display: "inline-block",
      padding: "8px 12px",
      border: `1px solid ${divider}`,
      borderRadius: "999px",
      background: surfaceAlt,
      fontSize: "12px",
      color: "#486581",
      fontWeight: 700,
    },
    centerCard: {
      background: surfaceAlt,
      border: `1px solid ${divider}`,
      borderRadius: "16px",
      padding: "18px",
      textAlign: "center",
      marginBottom: "12px",
      breakInside: "avoid",
      pageBreakInside: "avoid",
    },
    centerLabel: {
      fontSize: "12px",
      color: textSoft,
      marginBottom: "8px",
    },
    centerValue: {
      fontSize: "24px",
      fontWeight: 700,
      color: navy,
      lineHeight: 1.15,
    },
    compareMiniGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
      gap: "12px",
      marginBottom: "12px",
      alignItems: "start",
    },
    compareMiniCard: {
      background: surfaceAlt,
      border: `1px solid ${divider}`,
      borderRadius: "16px",
      padding: "14px",
      breakInside: "avoid",
      pageBreakInside: "avoid",
    },
    compareMiniTitle: {
      fontSize: "12px",
      color: textSoft,
      marginBottom: "10px",
      fontWeight: 700,
    },
    compareMiniInner: {
      display: "grid",
      gridTemplateColumns: "1fr 1px 1fr",
      gap: "10px",
      alignItems: "stretch",
    },
    dividerLine: {
      background: divider,
      width: "1px",
    },
    compareMiniSide: {
      textAlign: "center",
    },
    compareMiniSideLabel: {
      fontSize: "11px",
      color: textSoft,
      marginBottom: "6px",
    },
    compareMiniSideValue: {
      fontSize: "16px",
      fontWeight: 700,
      color: navy,
      lineHeight: 1.2,
    },
    insuranceGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
      gap: "12px",
      alignItems: "start",
    },
    insuranceCard: {
      background: surfaceAlt,
      border: `1px solid ${divider}`,
      borderRadius: "14px",
      padding: "12px",
      breakInside: "avoid",
      pageBreakInside: "avoid",
    },
    insuranceLabel: {
      fontSize: "12px",
      color: textSoft,
      marginBottom: "6px",
      display: "flex",
      alignItems: "center",
      gap: "8px",
    },
    insuranceValue: {
      fontSize: "16px",
      fontWeight: 700,
      color: navy,
      lineHeight: 1.2,
    },
    loansBenefitsGrid: {
      display: "grid",
      gridTemplateColumns: "1fr",
      gap: "18px",
      alignItems: "start",
    },
    emptyState: {
      background: surfaceAlt,
      border: `1px dashed ${border}`,
      borderRadius: "14px",
      padding: "18px",
      fontSize: "12px",
      color: textSoft,
      lineHeight: 1.7,
      breakInside: "avoid",
      pageBreakInside: "avoid",
    },
    loanGroup: {
      background: surfaceAlt,
      border: `1px solid ${divider}`,
      borderRadius: "16px",
      padding: "14px",
      marginTop: "12px",
      breakInside: "avoid",
      pageBreakInside: "avoid",
    },
    loanPersonName: {
      fontSize: "14px",
      fontWeight: 700,
      color: navy,
      marginBottom: "12px",
    },
    loanSummaryRow: {
      display: "grid",
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
      gap: "12px",
      marginBottom: "12px",
      alignItems: "start",
    },
    loanSummaryCard: {
      background: "#fff",
      border: `1px solid ${divider}`,
      borderRadius: "14px",
      padding: "12px",
      breakInside: "avoid",
      pageBreakInside: "avoid",
    },
    loanSummaryLabel: {
      fontSize: "12px",
      color: textSoft,
      marginBottom: "6px",
    },
    loanSummaryValue: {
      fontSize: "16px",
      fontWeight: 700,
      color: navy,
    },
    loanTableWrap: {
      overflowX: "auto",
      marginTop: "8px",
      borderRadius: "14px",
      border: `1px solid ${divider}`,
      background: "#fff",
      breakInside: "avoid",
      pageBreakInside: "avoid",
    },
    loanTable: {
      width: "100%",
      borderCollapse: "collapse",
      minWidth: "620px",
      background: "#fff",
      breakInside: "avoid",
      pageBreakInside: "avoid",
    },
    loanTh: {
      textAlign: "right",
      fontSize: "12px",
      color: textSoft,
      borderBottom: `1px solid ${divider}`,
      padding: "12px 10px",
      fontWeight: 700,
      whiteSpace: "nowrap",
      background: "#FAF8F4",
    },
    loanTd: {
      textAlign: "right",
      fontSize: "12px",
      color: text,
      borderBottom: "1px solid #E7ECF3",
      padding: "12px 10px",
      whiteSpace: "nowrap",
    },
    vestedTableWrap: {
      overflowX: "auto",
      marginTop: "12px",
      borderRadius: "16px",
      border: `1px solid ${divider}`,
      background: "#fff",
      breakInside: "avoid",
      pageBreakInside: "avoid",
    },
    vestedTable: {
      width: "100%",
      borderCollapse: "collapse",
      minWidth: "980px",
      background: "#fff",
      breakInside: "avoid",
      pageBreakInside: "avoid",
    },
    vestedTh: {
      textAlign: "center",
      fontSize: "12px",
      color: "#fff",
      background: navy,
      borderLeft: "1px solid rgba(255,255,255,0.15)",
      padding: "12px 10px",
      fontWeight: 800,
      whiteSpace: "normal",
      lineHeight: 1.35,
    },
    vestedTd: {
      textAlign: "center",
      fontSize: "12px",
      color: text,
      borderBottom: "1px solid #E7ECF3",
      borderLeft: "1px solid #E7ECF3",
      padding: "12px 10px",
      whiteSpace: "nowrap",
      background: "#fff",
    },
    vestedTotalTd: {
      textAlign: "center",
      fontSize: "12px",
      color: navy,
      borderBottom: "1px solid #D8DEE9",
      borderLeft: "1px solid #D8DEE9",
      padding: "12px 10px",
      whiteSpace: "nowrap",
      background: "#EEF2FA",
      fontWeight: 900,
    },
    vestedManualTd: {
      textAlign: "center",
      fontSize: "12px",
      color: navy,
      borderBottom: "1px solid #DDE3EC",
      borderLeft: "1px solid #DDE3EC",
      padding: "12px 10px",
      whiteSpace: "nowrap",
      background: "#F7F9FC",
      fontWeight: 900,
    },
    section28Grid: {
      display: "grid",
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
      gap: "14px",
      alignItems: "start",
    },
    section28Group: {
      background: surfaceAlt,
      border: `1px solid ${divider}`,
      borderRadius: "16px",
      padding: "14px",
      breakInside: "avoid",
      pageBreakInside: "avoid",
    },
    section28GroupTitle: {
      color: navy,
      fontSize: "13px",
      fontWeight: 900,
      marginBottom: "10px",
      paddingBottom: "8px",
      borderBottom: `1px solid ${divider}`,
    },
    section28Row: {
      display: "grid",
      gridTemplateColumns: "minmax(0, 1.45fr) minmax(92px, 0.55fr)",
      gap: "10px",
      alignItems: "center",
      padding: "8px 0",
      borderBottom: "1px solid #E7ECF3",
    },
    section28Label: {
      color: textSoft,
      fontSize: "11px",
      fontWeight: 700,
      lineHeight: 1.45,
    },
    section28Value: {
      color: navy,
      fontSize: "13px",
      fontWeight: 900,
      textAlign: "left",
      direction: "ltr",
      whiteSpace: "nowrap",
    },
    section28TableWrap: {
      overflowX: "auto",
      marginTop: "14px",
      borderRadius: "16px",
      border: `1px solid ${divider}`,
      background: "#fff",
      breakInside: "avoid",
      pageBreakInside: "avoid",
    },
    section28Table: {
      width: "100%",
      borderCollapse: "collapse",
      minWidth: "680px",
      background: "#fff",
    },
    section28Th: {
      textAlign: "center",
      fontSize: "11px",
      color: "#fff",
      background: navy,
      borderLeft: "1px solid rgba(255,255,255,0.15)",
      padding: "10px 8px",
      fontWeight: 900,
      whiteSpace: "normal",
      lineHeight: 1.3,
    },
    section28Td: {
      textAlign: "center",
      fontSize: "11px",
      color: text,
      borderBottom: "1px solid #E7ECF3",
      borderLeft: "1px solid #E7ECF3",
      padding: "10px 8px",
      whiteSpace: "nowrap",
      background: "#fff",
    },
    section28TotalTd: {
      textAlign: "center",
      fontSize: "11px",
      color: navy,
      borderBottom: "1px solid #D8DEE9",
      borderLeft: "1px solid #D8DEE9",
      padding: "10px 8px",
      whiteSpace: "nowrap",
      background: "#EEF2FA",
      fontWeight: 900,
    },
    recommendationsWrap: {
      background: "#fff",
      border: `1px solid ${divider}`,
      borderRadius: "18px",
      padding: "18px",
      breakInside: "avoid",
      pageBreakInside: "avoid",
    },
    recommendationsText: {
      width: "100%",
      minHeight: "180px",
      resize: "vertical",
      border: `1px solid ${border}`,
      borderRadius: "14px",
      padding: "16px 22px",
      textAlign: "right",
      direction: "rtl",
      fontSize: "12px",
      lineHeight: 1.8,
      color: text,
      boxSizing: "border-box",
      fontFamily: 'Calibri, "Arial", sans-serif',
      background: "#FFFDFB",
    },
    summaryFlowToolbar: {
      display: "flex",
      gap: "10px",
      flexWrap: "wrap",
      justifyContent: "flex-start",
      alignItems: "center",
      marginBottom: "14px",
    },
    summaryFlowButton: {
      border: `1px solid ${buttonBorder}`,
      background: "#FFFFFF",
      color: navy,
      borderRadius: "12px",
      padding: "9px 14px",
      fontSize: "12px",
      fontWeight: 900,
      cursor: "pointer",
      fontFamily: 'Calibri, "Arial", sans-serif',
    },
    summaryTopicList: {
      display: "flex",
      flexDirection: "column",
      gap: "7px",
      marginTop: "12px",
    },
    summaryTopicCard: {
      border: `1px solid ${divider}`,
      borderRadius: "16px",
      background: "linear-gradient(180deg, #FFFFFF 0%, #F7F9FC 100%)",
      padding: "10px 12px",
      boxShadow: "0 2px 8px rgba(16,42,67,0.035)",
    },
    summaryTopicTop: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: "10px",
      marginBottom: "6px",
      flexWrap: "wrap",
    },
    summaryTopicCheckLabel: {
      display: "inline-flex",
      alignItems: "center",
      gap: "10px",
      color: navy,
      fontSize: "14px",
      fontWeight: 900,
      cursor: "pointer",
      userSelect: "none",
    },
    summaryTopicCheckbox: {
      width: "18px",
      height: "18px",
      accentColor: navy,
      cursor: "pointer",
    },
    summaryTopicGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
      gap: "10px",
      alignItems: "stretch",
    },
    summaryTopicFieldLabel: {
      color: textSoft,
      fontSize: "11px",
      fontWeight: 900,
      marginBottom: "6px",
    },
    summaryTopicTextarea: {
      width: "100%",
      minHeight: "60px",
      resize: "vertical",
      border: `1px solid ${border}`,
      borderRadius: "14px",
      padding: "12px 18px",
      textAlign: "right",
      direction: "rtl",
      color: text,
      background: "#FFFDFB",
      fontSize: "12px",
      lineHeight: 1.55,
      fontFamily: 'Calibri, "Arial", sans-serif',
      boxSizing: "border-box",
      outline: "none",
    },
    summaryTopicActionTextarea: {
      width: "100%",
      minHeight: "60px",
      resize: "vertical",
      border: `1px solid ${border}`,
      borderRadius: "14px",
      padding: "12px 18px",
      textAlign: "right",
      direction: "rtl",
      color: text,
      background: "#FFFDFB",
      fontSize: "12px",
      lineHeight: 1.55,
      fontFamily: 'Calibri, "Arial", sans-serif',
      boxSizing: "border-box",
      outline: "none",
    },
    summaryPreviewBox: {
      marginTop: "14px",
      border: `1px solid ${divider}`,
      borderRadius: "16px",
      background: surfaceAlt,
      padding: "14px",
      color: text,
      fontSize: "12px",
      lineHeight: 1.8,
      whiteSpace: "pre-wrap",
      minHeight: "64px",
    },
    recommendationsPrintText: {
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      fontSize: "12px",
      lineHeight: 1.9,
      color: text,
      background: "#FFFDFB",
      border: `1px solid ${border}`,
      borderRadius: "14px",
      padding: "16px",
      minHeight: "120px",
      breakInside: "avoid",
      pageBreakInside: "avoid",
    },
    footer: {
      display: "flex",
      justifyContent: "space-between",
      gap: "12px",
      fontSize: "11px",
      color: textSoft,
      padding: "0 4px 6px",
      flexWrap: "wrap",
      breakInside: "avoid",
      pageBreakInside: "avoid",
    },
  };

  if (!reportData || !reportData.family) {
    return (
      <div style={px({ padding: "40px", direction: "rtl" })}>טוען נתונים...</div>
    );
  }

  return (
    <>
      <style>
        {`
          * {
            box-sizing: border-box;
          }

          html, body {
            margin: 0;
            padding: 0;
            font-family: Calibri, Arial, sans-serif;
            font-size: 12px;
          }

          .print-section,
          .avoid-break,
          .avoid-break * {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          table,
          thead,
          tbody,
          tfoot,
          tr,
          th,
          td {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          .action-button {
            padding: 12px 18px;
            min-height: 42px;
            border-radius: 12px;
            border: 1px solid ${buttonBorder};
            background: #ffffff;
            color: #102A43;
            font-weight: 800;
            font-family: Calibri, Arial, sans-serif;
            font-size: 13px;
            cursor: pointer;
            transition: all 0.18s ease;
            min-width: 160px;
            white-space: nowrap;
          }

          .action-button:hover {
            border-color: ${navy};
            color: ${navy};
            transform: translateY(-1px);
          }

          .action-button:active {
            transform: translateY(0);
          }

          .action-button.primary {
            border-color: ${navy};
            background: ${navy};
            color: #ffffff;
            box-shadow: 0 6px 14px rgba(0, 33, 93, 0.16);
          }

          .action-button.primary:hover {
            border-color: #001845;
            background: #001845;
            color: #ffffff;
          }

          .action-button.accent {
            border-color: ${accent};
            background: ${accent};
            color: #ffffff;
            box-shadow: 0 6px 14px rgba(255, 39, 86, 0.16);
          }

          .action-button.accent:hover {
            border-color: #e61f4d;
            background: #e61f4d;
            color: #ffffff;
          }

          .action-button.danger {
            background: #ffffff;
            color: ${accent};
            border-color: ${accent};
          }

          .action-button.danger:hover {
            background: #fff0f3;
            border-color: ${accent};
            color: ${accent};
          }

          .action-button:focus-visible {
            outline: 2px solid rgba(0, 33, 93, 0.22);
            outline-offset: 2px;
          }

          .client-menu-wrap {
            position: relative !important;
            display: inline-flex !important;
            order: -100;
          }

          .hamburger-button {
            width: 48px !important;
            min-width: 48px !important;
            height: 44px !important;
            padding: 0 !important;
            font-size: 0 !important;
            line-height: 1 !important;
            border-radius: 14px !important;
            position: relative !important;
          }

          .hamburger-button::before {
            content: "";
            width: 20px;
            height: 14px;
            display: block;
            background:
              linear-gradient(#00215D, #00215D) 0 0 / 20px 2px no-repeat,
              linear-gradient(#00215D, #00215D) 0 6px / 20px 2px no-repeat,
              linear-gradient(#00215D, #00215D) 0 12px / 20px 2px no-repeat;
            margin: 0 auto;
          }

          .client-menu-panel {
            position: absolute !important;
            top: 54px !important;
            right: 0 !important;
            left: auto !important;
            width: 280px !important;
            max-width: calc(100vw - 28px) !important;
            background: #FFFFFF !important;
            border: 1px solid #E9DCCF !important;
            border-radius: 20px !important;
            box-shadow: 0 24px 54px rgba(0, 33, 93, 0.18) !important;
            padding: 14px !important;
            z-index: 9999 !important;
            text-align: right !important;
          }

          .client-menu-panel::before {
            content: "";
            position: absolute;
            top: -8px;
            right: 18px;
            width: 16px;
            height: 16px;
            background: #FFFFFF;
            border-top: 1px solid #E9DCCF;
            border-right: 1px solid #E9DCCF;
            transform: rotate(-45deg);
          }

          .client-menu-title {
            color: #00215D !important;
            font-size: 14px !important;
            font-weight: 900 !important;
            margin: 0 0 4px !important;
            padding: 2px 2px 0 !important;
          }

          .client-menu-subtitle {
            color: #627D98 !important;
            font-size: 11px !important;
            line-height: 1.55 !important;
            margin: 0 0 12px !important;
            padding: 0 2px 10px !important;
            border-bottom: 1px solid #E7ECF3 !important;
          }

          .client-menu-member-row {
            width: 100% !important;
            border: 1px solid #E7ECF3 !important;
            background: linear-gradient(180deg, #FFFFFF 0%, #F7F9FC 100%) !important;
            border-radius: 14px !important;
            min-height: 48px !important;
            padding: 0 14px !important;
            margin: 0 0 9px !important;
            display: grid !important;
            grid-template-columns: 1fr 24px !important;
            gap: 10px !important;
            align-items: center !important;
            cursor: pointer !important;
            font-family: Calibri, Arial, sans-serif !important;
            text-align: right !important;
            transition: all 0.16s ease !important;
          }

          .client-menu-member-row:hover {
            border-color: #00215D !important;
            background: #F4F7FB !important;
            transform: translateY(-1px) !important;
            box-shadow: 0 8px 18px rgba(0, 33, 93, 0.08) !important;
          }

          .client-menu-member-row:last-child {
            margin-bottom: 0 !important;
          }

          .client-menu-member-name {
            min-width: 0 !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            white-space: nowrap !important;
            color: #102A43 !important;
            font-size: 14px !important;
            font-weight: 900 !important;
          }

          .client-menu-member-arrow {
            width: 24px !important;
            height: 24px !important;
            border-radius: 50% !important;
            background: #EAF1FB !important;
            color: #00215D !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            font-size: 20px !important;
            font-weight: 900 !important;
            line-height: 1 !important;
            transform: rotate(180deg) !important;
          }

          .client-menu-empty {
            border: 1px dashed #DDE3EC !important;
            background: #F7F9FC !important;
            color: #627D98 !important;
            border-radius: 14px !important;
            padding: 14px !important;
            font-size: 12px !important;
            text-align: center !important;
          }

          .client-link-button-wrap {
            position: relative !important;
            display: inline-flex !important;
            align-items: center !important;
          }

          .client-link-success-check {
            position: absolute !important;
            right: -9px !important;
            top: -9px !important;
            width: 21px !important;
            height: 21px !important;
            border-radius: 50% !important;
            background: #20B26B !important;
            color: #ffffff !important;
            border: 2px solid #ffffff !important;
            box-shadow: 0 4px 10px rgba(32,178,107,0.25) !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            font-size: 12px !important;
            font-weight: 900 !important;
            line-height: 1 !important;
          }

          .client-menu-wrap {
            position: relative;
            display: inline-flex;
          }

          .hamburger-button {
            width: 46px;
            min-width: 46px;
            padding: 0;
            font-size: 22px;
            line-height: 1;
          }

          .client-menu-panel {
            position: absolute !important;
            top: 56px !important;
            right: 0 !important;
            left: auto !important;
            width: 316px !important;
            max-width: calc(100vw - 32px) !important;
            background: rgba(255, 255, 255, 0.98) !important;
            border: 1px solid #DDE3EC !important;
            border-radius: 22px !important;
            box-shadow: 0 18px 40px rgba(16,42,67,0.16) !important;
            padding: 18px !important;
            z-index: 100 !important;
            backdrop-filter: blur(8px);
          }

          .client-menu-title {
            color: #00215D;
            font-size: 15px;
            font-weight: 900;
            margin-bottom: 6px;
          }

          .client-menu-subtitle {
            color: #627D98;
            font-size: 12px;
            line-height: 1.6;
            margin-bottom: 14px;
          }

          .client-menu-member-row {
            width: 100% !important;
            display: grid !important;
            grid-template-columns: 1fr auto !important;
            gap: 10px !important;
            align-items: center !important;
            padding: 14px 16px !important;
            border: 1px solid #E7ECF3 !important;
            border-radius: 14px !important;
            background: #FFFFFF !important;
            cursor: pointer !important;
            font-family: Calibri, Arial, sans-serif !important;
            text-align: right !important;
            margin-bottom: 10px !important;
            transition: all 0.18s ease !important;
          }

          .client-menu-member-row:hover {
            border-color: #00215D !important;
            background: #F4F7FB !important;
            transform: translateY(-1px);
          }

          .client-menu-member-name {
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            color: #102A43;
            font-size: 14px;
            font-weight: 900;
          }

          .client-menu-member-arrow {
            color: #00215D;
            font-size: 22px;
            font-weight: 900;
            line-height: 1;
            transform: rotate(180deg);
          }

          .client-menu-empty {
            border: 1px dashed #DDE3EC;
            background: #F7F9FC;
            color: #627D98;
            border-radius: 14px;
            padding: 14px;
            font-size: 12px;
            text-align: center;
          }

          .client-link-button-wrap {
            position: relative;
            display: inline-flex;
            align-items: center;
          }

          .client-link-success-check {
            position: absolute;
            right: -10px;
            top: -8px;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: #20B26B;
            color: #ffffff;
            border: 2px solid #ffffff;
            box-shadow: 0 4px 10px rgba(32,178,107,0.25);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: 900;
            line-height: 1;
          }

          .client-menu-wrap {
            position: relative;
            display: inline-flex;
          }

          .hamburger-button {
            width: 46px;
            min-width: 46px;
            padding: 0;
            font-size: 22px;
            line-height: 1;
          }

          .client-menu-panel {
            position: absolute;
            top: 52px;
            right: 0;
            width: 300px;
            max-width: calc(100vw - 32px);
            background: #ffffff;
            border: 1px solid #DDE3EC;
            border-radius: 18px;
            box-shadow: 0 16px 34px rgba(16,42,67,0.16);
            padding: 14px;
            z-index: 50;
          }

          .client-menu-title {
            color: #00215D;
            font-size: 14px;
            font-weight: 900;
            margin-bottom: 4px;
          }

          .client-menu-subtitle {
            color: #627D98;
            font-size: 12px;
            line-height: 1.6;
            margin-bottom: 12px;
          }

          .client-menu-section {
            border-top: 1px solid #E7ECF3;
            padding-top: 12px;
            margin-top: 12px;
          }

          .client-menu-member-row {
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            padding: 13px 12px;
            border: 1px solid #E7ECF3;
            border-radius: 12px;
            background: #FFFFFF;
            cursor: pointer;
            font-family: Calibri, Arial, sans-serif;
            text-align: right;
            margin-bottom: 8px;
          }

          .client-menu-member-row:hover {
            border-color: #00215D;
            background: #F4F7FB;
          }

          .client-menu-member-row::after {
            content: "›";
            color: #00215D;
            font-size: 20px;
            font-weight: 900;
            transform: rotate(180deg);
          }

          .client-menu-member-row:last-child {
            margin-bottom: 0;
          }

          .client-menu-member-name {
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            color: #102A43;
            font-size: 13px;
            font-weight: 800;
          }

          .client-menu-mini-button {
            min-height: 34px;
            padding: 7px 10px;
            border: 1px solid #D9DDE8;
            border-radius: 10px;
            background: #ffffff;
            color: #00215D;
            font-size: 12px;
            font-weight: 800;
            cursor: pointer;
            font-family: Calibri, Arial, sans-serif;
            white-space: nowrap;
          }

          .client-menu-mini-button:hover {
            border-color: #00215D;
            background: #F4F7FB;
          }

          .client-link-button-wrap {
            position: relative;
            display: inline-flex;
            align-items: center;
          }

          .client-link-success-check {
            position: absolute;
            right: -10px;
            top: -8px;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: #20B26B;
            color: #ffffff;
            border: 2px solid #ffffff;
            box-shadow: 0 4px 10px rgba(32,178,107,0.25);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: 900;
            line-height: 1;
          }


          /* Final client-actions menu design */
          .client-menu-wrap {
            position: relative !important;
            display: inline-flex !important;
            order: -100 !important;
          }

          .hamburger-button {
            width: 48px !important;
            min-width: 48px !important;
            height: 44px !important;
            padding: 0 !important;
            font-size: 0 !important;
            line-height: 1 !important;
            border-radius: 14px !important;
            position: relative !important;
            background: #ffffff !important;
          }

          .hamburger-button::before {
            content: "";
            width: 20px;
            height: 14px;
            display: block;
            background:
              linear-gradient(#00215D, #00215D) 0 0 / 20px 2px no-repeat,
              linear-gradient(#00215D, #00215D) 0 6px / 20px 2px no-repeat,
              linear-gradient(#00215D, #00215D) 0 12px / 20px 2px no-repeat;
            margin: 0 auto;
          }

          .client-menu-panel {
            position: absolute !important;
            top: 54px !important;
            right: 0 !important;
            left: auto !important;
            width: 288px !important;
            max-width: calc(100vw - 28px) !important;
            background: #FFFFFF !important;
            border: 1px solid #E9DCCF !important;
            border-radius: 20px !important;
            box-shadow: 0 24px 54px rgba(0, 33, 93, 0.18) !important;
            padding: 14px !important;
            z-index: 9999 !important;
            text-align: right !important;
          }

          .client-menu-panel::before {
            content: "";
            position: absolute;
            top: -8px;
            right: 18px;
            width: 16px;
            height: 16px;
            background: #FFFFFF;
            border-top: 1px solid #E9DCCF;
            border-right: 1px solid #E9DCCF;
            transform: rotate(-45deg);
          }

          .client-menu-title {
            color: #00215D !important;
            font-size: 14px !important;
            font-weight: 900 !important;
            margin: 0 0 4px !important;
            padding: 2px 2px 0 !important;
          }

          .client-menu-subtitle {
            color: #627D98 !important;
            font-size: 11px !important;
            line-height: 1.55 !important;
            margin: 0 0 12px !important;
            padding: 0 2px 10px !important;
            border-bottom: 1px solid #E7ECF3 !important;
          }

          .client-menu-member-row {
            width: 100% !important;
            border: 1px solid #E7ECF3 !important;
            background: linear-gradient(180deg, #FFFFFF 0%, #F7F9FC 100%) !important;
            border-radius: 14px !important;
            min-height: 48px !important;
            padding: 0 14px !important;
            margin: 0 0 9px !important;
            display: grid !important;
            grid-template-columns: 1fr 24px !important;
            gap: 10px !important;
            align-items: center !important;
            cursor: pointer !important;
            font-family: Calibri, Arial, sans-serif !important;
            text-align: right !important;
            transition: all 0.16s ease !important;
          }

          .client-menu-member-row:hover {
            border-color: #00215D !important;
            background: #F4F7FB !important;
            transform: translateY(-1px) !important;
            box-shadow: 0 8px 18px rgba(0, 33, 93, 0.08) !important;
          }

          .client-menu-member-row:last-child {
            margin-bottom: 0 !important;
          }

          .client-menu-member-name {
            min-width: 0 !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            white-space: nowrap !important;
            color: #102A43 !important;
            font-size: 14px !important;
            font-weight: 900 !important;
          }

          .client-menu-member-arrow {
            width: 24px !important;
            height: 24px !important;
            border-radius: 50% !important;
            background: #EAF1FB !important;
            color: #00215D !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            font-size: 20px !important;
            font-weight: 900 !important;
            line-height: 1 !important;
            transform: rotate(180deg) !important;
          }

          .client-menu-empty {
            border: 1px dashed #DDE3EC !important;
            background: #F7F9FC !important;
            color: #627D98 !important;
            border-radius: 14px !important;
            padding: 14px !important;
            font-size: 12px !important;
            text-align: center !important;
          }

          .client-link-button-wrap {
            position: relative !important;
            display: inline-flex !important;
            align-items: center !important;
          }

          .client-link-success-check {
            position: absolute !important;
            right: -9px !important;
            top: -9px !important;
            width: 21px !important;
            height: 21px !important;
            border-radius: 50% !important;
            background: #20B26B !important;
            color: #ffffff !important;
            border: 2px solid #ffffff !important;
            box-shadow: 0 4px 10px rgba(32,178,107,0.25) !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            font-size: 12px !important;
            font-weight: 900 !important;
            line-height: 1 !important;
          }

          .kpi-card-hover:hover {
            transform: translateY(-3px);
            box-shadow: 0 8px 18px rgba(16,42,67,0.08) !important;
          }


          /* Unified client navigation menu - final override */
          .client-menu-wrap {
            position: relative !important;
            display: inline-flex !important;
            order: -100 !important;
            z-index: 10000 !important;
          }

          .client-hamburger-button,
          .hamburger-button {
            width: 48px !important;
            min-width: 48px !important;
            height: 44px !important;
            padding: 0 !important;
            border-radius: 14px !important;
            background: #ffffff !important;
            border: 1px solid #D9DDE8 !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            box-shadow: 0 2px 8px rgba(16,42,67,0.05) !important;
            font-size: 0 !important;
          }

          .client-hamburger-lines {
            width: 22px;
            height: 16px;
            display: block;
            background:
              linear-gradient(#00215D, #00215D) 0 0 / 22px 2px no-repeat,
              linear-gradient(#00215D, #00215D) 0 7px / 22px 2px no-repeat,
              linear-gradient(#00215D, #00215D) 0 14px / 22px 2px no-repeat;
          }

          .hamburger-button::before {
            content: "";
            width: 22px;
            height: 16px;
            display: block;
            background:
              linear-gradient(#00215D, #00215D) 0 0 / 22px 2px no-repeat,
              linear-gradient(#00215D, #00215D) 0 7px / 22px 2px no-repeat,
              linear-gradient(#00215D, #00215D) 0 14px / 22px 2px no-repeat;
            margin: 0 auto;
          }

          .client-menu-panel {
            position: absolute !important;
            top: 56px !important;
            right: 0 !important;
            left: auto !important;
            width: 292px !important;
            max-width: calc(100vw - 28px) !important;
            background: #FFFFFF !important;
            border: 1px solid #DDE3EC !important;
            border-radius: 22px !important;
            box-shadow: 0 24px 54px rgba(0, 33, 93, 0.18) !important;
            padding: 14px !important;
            z-index: 99999 !important;
            text-align: right !important;
            direction: rtl !important;
          }

          .client-menu-panel::before {
            content: "";
            position: absolute;
            top: -8px;
            right: 18px;
            width: 16px;
            height: 16px;
            background: #FFFFFF;
            border-top: 1px solid #DDE3EC;
            border-right: 1px solid #DDE3EC;
            transform: rotate(-45deg);
          }

          .client-menu-title {
            color: #00215D !important;
            font-size: 14px !important;
            font-weight: 900 !important;
            margin: 0 0 4px !important;
            padding: 2px 2px 0 !important;
          }

          .client-menu-subtitle {
            color: #627D98 !important;
            font-size: 11px !important;
            line-height: 1.55 !important;
            margin: 0 0 12px !important;
            padding: 0 2px 10px !important;
            border-bottom: 1px solid #E7ECF3 !important;
          }

          .client-menu-member-row {
            width: 100% !important;
            border: 1px solid #E7ECF3 !important;
            background: linear-gradient(180deg, #FFFFFF 0%, #F7F9FC 100%) !important;
            border-radius: 14px !important;
            min-height: 48px !important;
            padding: 0 14px !important;
            margin: 0 0 9px !important;
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) 24px !important;
            gap: 10px !important;
            align-items: center !important;
            cursor: pointer !important;
            font-family: Calibri, Arial, sans-serif !important;
            text-align: right !important;
            transition: all 0.16s ease !important;
          }

          .client-menu-member-row::after {
            content: none !important;
            display: none !important;
          }

          .client-menu-member-row:hover {
            border-color: #00215D !important;
            background: #F4F7FB !important;
            transform: translateY(-1px) !important;
            box-shadow: 0 8px 18px rgba(0, 33, 93, 0.08) !important;
          }

          .client-menu-member-row:last-child {
            margin-bottom: 0 !important;
          }

          .client-menu-member-name {
            min-width: 0 !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            white-space: nowrap !important;
            color: #102A43 !important;
            font-size: 14px !important;
            font-weight: 900 !important;
          }

          .client-menu-member-arrow {
            width: 24px !important;
            height: 24px !important;
            border-radius: 50% !important;
            background: #EAF1FB !important;
            color: #00215D !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            font-size: 20px !important;
            font-weight: 900 !important;
            line-height: 1 !important;
            transform: rotate(180deg) !important;
          }

          .client-menu-empty {
            border: 1px dashed #DDE3EC !important;
            background: #F7F9FC !important;
            color: #627D98 !important;
            border-radius: 14px !important;
            padding: 14px !important;
            font-size: 12px !important;
            text-align: center !important;
          }

          .client-link-button-wrap {
            position: relative !important;
            display: inline-flex !important;
            align-items: center !important;
          }

          .client-link-success-check {
            position: absolute !important;
            right: -9px !important;
            top: -9px !important;
            width: 21px !important;
            height: 21px !important;
            border-radius: 50% !important;
            background: #20B26B !important;
            color: #ffffff !important;
            border: 2px solid #ffffff !important;
            box-shadow: 0 4px 10px rgba(32,178,107,0.25) !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            font-size: 12px !important;
            font-weight: 900 !important;
            line-height: 1 !important;
          }


          .summary-topic-card-active {
            border-color: #00215D !important;
            box-shadow: 0 8px 18px rgba(0,33,93,0.08) !important;
          }

          .summary-topic-card-inactive {
            opacity: 0.78;
          }

          .summary-topic-textarea:focus {
            border-color: #00215D !important;
            box-shadow: 0 0 0 3px rgba(0,33,93,0.08) !important;
          }

          @media (max-width: 980px) {
            .summary-topic-grid {
              grid-template-columns: 1fr !important;
            }
          }

          .responsive-hero-logo img,
          .responsive-hero-meta img {
            max-width: 100% !important;
            max-height: 100% !important;
            object-fit: contain !important;
          }


          .capital-classification-section table th,
          .capital-classification-section table td {
            vertical-align: middle;
          }

          @media (max-width: 980px) {
            .capital-classification-section table {
              min-width: 980px !important;
            }
          }

          @media print {
            .screen-report-root { display: none !important; }

            .print-report-root { display: block !important; }

            .no-print,
            .client-menu-panel {
              display: none !important;
            }

            .print-only {
              display: block !important;
            }

            .screen-only {
              display: none !important;
            }

            body {
              background: white !important;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }

            @page {
              size: A4 portrait;
              margin: 7mm;
            }

            .print-section {
              break-inside: avoid !important;
              page-break-inside: avoid !important;
            }

            .print-table-block {
              break-inside: avoid !important;
              page-break-inside: avoid !important;
            }

            .force-new-page-print {
              break-before: page !important;
              page-break-before: always !important;
            }

            .member-card-print,
            .loan-group-print,
            .recommendations-print,
            .summary-box-print,
            .foreign-exposure-print,
            .equity-print,
            .main-group-print {
              break-inside: avoid !important;
              page-break-inside: avoid !important;
            }

            .responsive-grid-4 {
              grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
            }

            .responsive-grid-2 {
              grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            }

            .responsive-bottom-grid {
              grid-template-columns: 1fr !important;
            }

            .members-section {
              break-before: page !important;
              page-break-before: always !important;
            }

            .loans-section {
              break-before: page !important;
              page-break-before: always !important;
            }

            html,
            body {
              width: 210mm !important;
              min-height: 297mm !important;
              margin: 0 !important;
              padding: 0 !important;
              overflow: visible !important;
              background: #ffffff !important;
              direction: rtl !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }

            body {
              zoom: 1 !important;
            }

            .responsive-grid-4 {
              grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
              gap: 8px !important;
            }

            .responsive-grid-2,
            .responsive-lower-two,
            .responsive-members-grid,
            .responsive-loans-grid,
            .responsive-mini-grid,
            .responsive-insurance-grid,
            .responsive-loan-summary {
              grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
              gap: 8px !important;
            }

            .responsive-bottom-grid {
              grid-template-columns: 1fr !important;
              gap: 8px !important;
            }

            .print-section,
            .avoid-break,
            .member-card-print,
            .loan-group-print,
            .recommendations-print,
            .summary-box-print,
            .foreign-exposure-print,
            .equity-print,
            .main-group-print {
              max-width: 100% !important;
              overflow: visible !important;
              box-shadow: none !important;
              break-inside: avoid !important;
              page-break-inside: avoid !important;
            }

            .force-new-page-print,
            .members-section,
            .loans-section {
              break-before: auto !important;
              page-break-before: auto !important;
            }

            table {
              width: 100% !important;
              min-width: 100% !important;
            }

            th,
            td {
              font-size: 9px !important;
              padding: 6px !important;
            }

            .capital-classification-section {
              width: 100% !important;
              max-width: 100% !important;
              break-inside: avoid !important;
              page-break-inside: avoid !important;
            }

            .capital-classification-section table {
              min-width: 100% !important;
              table-layout: fixed !important;
            }

            .capital-classification-section th,
            .capital-classification-section td {
              font-size: 7.2px !important;
              padding: 4px 3px !important;
              white-space: normal !important;
              word-break: break-word !important;
            }

            .vested-balance-section {
              width: 100% !important;
              max-width: 100% !important;
              break-inside: avoid !important;
              page-break-inside: avoid !important;
            }

            .vested-balance-section table {
              min-width: 100% !important;
              table-layout: fixed !important;
            }

            .vested-balance-section th,
            .vested-balance-section td {
              font-size: 7.5px !important;
              padding: 5px 4px !important;
              white-space: normal !important;
              word-break: break-word !important;
            }

            .section-28-capping-section {
              width: 100% !important;
              max-width: 100% !important;
              break-inside: avoid !important;
              page-break-inside: avoid !important;
            }

            .section-28-grid-print {
              grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
              gap: 8px !important;
            }

            .section-28-capping-section th,
            .section-28-capping-section td {
              font-size: 7.5px !important;
              padding: 5px 4px !important;
              white-space: normal !important;
              word-break: break-word !important;
            }
          }

          @media screen {
            .print-report-root { display: none !important; }

            .print-only {
              display: none !important;
            }

            .screen-only {
              display: block !important;
            }
          }

          @media (max-width: 1180px) {
            .responsive-grid-4 {
              grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            }

            .responsive-grid-2,
            .responsive-bottom-grid,
            .responsive-members-grid,
            .responsive-loans-grid,
            .responsive-lower-two {
              grid-template-columns: 1fr !important;
            }

            .responsive-hero {
              grid-template-columns: 1fr !important;
              text-align: center !important;
              direction: rtl !important;
            }

            .responsive-hero-meta,
            .responsive-hero-logo {
              justify-self: center !important;
              align-items: center !important;
            }
          }

          @media (max-width: 760px) {
            .responsive-mini-grid,
            .responsive-insurance-grid,
            .responsive-loan-summary,
            .responsive-kpi-inner,
            .responsive-grid-4 {
              grid-template-columns: 1fr !important;
            }
          }
        `}
      </style>

      <PrintReportA4
        reportData={reportDataForClient}
        conversationSummary={conversationSummary}
        actionRecommendations={actionRecommendations}
      />

      <div class="screen-report-root" style={px(styles.page)}>
        <div class="no-print" style={px(styles.actionsBar)}>

          <button onClick={handleExportPdf} class="action-button primary">
            ייצוא ל־PDF
          </button>

          <div class="client-link-button-wrap">
            <button onClick={handleCreateClientLink} class="action-button accent">
              יצירת לינק ללקוח
            </button>

            {isClientLinkCopied ? (
              <span class="client-link-success-check" title="הלינק הועתק">
                ✓
              </span>
            ) : null}
          </div>

          <button onClick={onBack} class="action-button">
            חזרה למסך העלאה
          </button>
        </div>

        <div style={px(styles.container)}>
          <section
            class="print-section responsive-hero avoid-break"
            style={px(styles.heroHeader)}
          >
            <div class="responsive-hero-logo" style={px(styles.heroLogoWrap)}>
              <ZviranLogo light />
            </div>

            <div style={px(styles.heroCenter)}>
              <div style={px(styles.heroEyebrow)}>מסך ראשי · דוח משפחתי מאוחד</div>
              <h1 style={px(styles.heroTitle)}>דוח פנסיוני משפחתי מאוחד</h1>
              <div style={px(styles.heroSubtitle)}>
                ריכזנו עבורך תמונת מצב משפחתית אחת הכוללת את כלל הנכסים
                הפנסיוניים, תחזית פרישה, פיזור בין מוצרים וגופים מנהלים, חשיפה
                מנייתית, הלוואות, כיסויים ומידע מרכזי לכל אחד מבני המשפחה.
              </div>
            </div>

            <div class="responsive-hero-meta" style={px(styles.heroMeta)}>
              <div style={px(styles.heroClientLogoBox)}>
                {reportData?.clientLogo ? (
                  <img
                    src={reportData.clientLogo}
                    alt="לוגו חברה"
                    style={px(styles.heroClientLogoImage)}
                  />
                ) : (
                  <div style={px(styles.heroClientLogoPlaceholder)}>לוגו חברה</div>
                )}
              </div>

              <div>
                <div style={px(styles.heroMetaLabel)}>תאריך עדכון</div>
                <div style={px(styles.heroMetaValue)}>{family.lastUpdated || "—"}</div>
              </div>
            </div>
          </section>

          <section
            class="print-section responsive-grid-4 avoid-break"
            style={px(styles.topGrid)}
          >
            <KpiCard
              styles={styles}
              icon={<GiftIcon />}
              title="סך נכסים"
              value={formatCurrency(family.totalAssets)}
              subtext="סך הצבירה הכולל של התא המשפחתי"
            />

            <KpiCard
              styles={styles}
              icon={<DepositIcon />}
              title="הפקדה חודשית"
              value={formatCurrency(family.monthlyDeposits)}
              subtext="סך ההפקדות החודשיות של בני המשפחה"
            />

            <DonutSummaryCard
              title="חלוקה לפי מוצרים"
              subtitle="התפלגות הנכסים בין סוגי החיסכון הקיימים בתיק."
              items={products}
              colors={brandChartColors}
              styles={styles}
              formatCurrency={formatCurrency}
            />

            <DonutSummaryCard
              title="חלוקה לפי גופים מנהלים"
              subtitle="התפלגות הניהול בין החברות והגופים המנהלים."
              items={managers}
              colors={brandChartColors}
              styles={styles}
              formatCurrency={formatCurrency}
            />
          </section>

          <section
            class="print-section responsive-grid-2 avoid-break"
            style={px(styles.compareGrid)}
          >
            <ComparisonChartCard
              styles={styles}
              title="צבירה צפויה בגיל פרישה"
              explanation="השוואה בין סכום חד פעמי צפוי עם המשך הפקדות לבין ללא המשך הפקדות."
              bars={retirementLumpBars}
            />

            <ComparisonChartCard
              styles={styles}
              title="קצבה חודשית בגיל פרישה"
              explanation="השוואה בין קצבה צפויה עם המשך הפקדות לבין ללא המשך הפקדות."
              bars={retirementPensionBars}
            />
          </section>



          {hasCapitalClassification ? (
            <section
              class="print-section capital-classification-section avoid-break"
              style={px(styles.sectionCard)}
            >
              <div style={px(styles.sectionHeader)}>
                <div style={px(styles.titleWithIcon)}>
                  <span>📑</span>
                  <h2 style={px(styles.h2)}>פירוט פוליסות וקרנות</h2>
                </div>
              </div>

              <div style={px(styles.explanation)}>
                פירוק נכסים ללקוח דוגמא זכר — הנתונים מוצגים לפי קובץ סיווג הכספים שהועלה במסך ההעלאה, עם שיוך נפרד לבן זוג / בת זוג. פיצויים מעסיק נוכחי מוצגים תמיד כפיצויים למס.
              </div>

              <CapitalClassificationReportSection
                entries={capitalClassificationEntries}
                styles={styles}
              />
            </section>
          ) : null}

          {hasSection28Capping ? (
            <section
              class="print-section section-28-capping-section avoid-break"
              style={px(styles.sectionCard)}
            >
              <div style={px(styles.sectionHeader)}>
                <div style={px(styles.titleWithIcon)}>
                  <span>🧮</span>
                  <h2 style={px(styles.h2)}>קיטום על פי סעיף 28 לפי בן/בת זוג</h2>
                </div>
              </div>

              <div style={px(styles.explanation)}>
                הנתונים מוצגים כפי שנקראו מקובצי האקסל לפי שמות השדות, ללא חישוב
                נוסף במערכת. כל קובץ מוצג לפי השיוך שנבחר במסך ההעלאה.
              </div>

              <div style={px({ display: "flex", flexDirection: "column", gap: 18 })}>
                {section28CappingEntries.map((entry, index) => (
                  <div
                    key={`${entry.owner || "owner"}-${entry.sourceFileName || index}`}
                    style={px({
                      border: "1px solid #E7ECF3",
                      borderRadius: 18,
                      background: "linear-gradient(180deg, #FFFFFF 0%, #F7F9FC 100%)",
                      padding: 16,
                    })}
                  >
                    <div
                      style={px({
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                        flexWrap: "wrap",
                        marginBottom: 12,
                      })}
                    >
                      <div style={px({ color: navy, fontSize: 14, fontWeight: 900 })}>
                        סעיף 28 — {entry.ownerLabel || "בן זוג"}
                      </div>
                      {entry.sourceFileName ? (
                        <div style={px({ color: textSoft, fontSize: 11, fontWeight: 800 })}>
                          מקור: {entry.sourceFileName}
                        </div>
                      ) : null}
                    </div>

                    <Section28CappingReport data={entry} styles={styles} />
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {hasVestedBalanceTable ? (
            <section
              class="print-section vested-balance-section avoid-break"
              style={px(styles.sectionCard)}
            >
              <div style={px(styles.sectionHeader)}>
                <div style={px(styles.titleWithIcon)}>
                  <span>📋</span>
                  <h2 style={px(styles.h2)}>צבירה מוכרת לפי תגמולים ופיצויים</h2>
                </div>
              </div>

              <div style={px(styles.explanation)}>
                טבלה זו מוצגת רק כאשר הועלה PDF ייעודי במסך ההעלאה ונמצאו בו
                נתוני צבירה מוכרת, או כאשר הוזן סכום קצבה מוכרת ידנית לפי חברת ביטוח.
                כל בלוק מוצג לפי השיוך שנבחר במסך ההעלאה.
              </div>

              <div style={px({ display: "flex", flexDirection: "column", gap: 18 })}>
                {recognizedPensionEntries.map((entry, index) => (
                  <div
                    key={`${entry.owner || "owner"}-${index}`}
                    style={px({
                      border: "1px solid #E7ECF3",
                      borderRadius: 18,
                      background: "linear-gradient(180deg, #FFFFFF 0%, #F7F9FC 100%)",
                      padding: 16,
                    })}
                  >
                    <div style={px({ color: navy, fontSize: 14, fontWeight: 900, marginBottom: 12 })}>
                      קצבה מוכרת — {entry.ownerLabel || "בן/בת זוג"}
                    </div>

                    {entry.vestedBalanceTable?.sourceFileName ? (
                      <div style={px({ color: textSoft, fontSize: 11, fontWeight: 800, marginBottom: 12 })}>
                        מקור: {entry.vestedBalanceTable.sourceFileName}
                      </div>
                    ) : null}

                    <VestedBalanceTable
                      table={entry.vestedBalanceTable}
                      adjustments={entry.recognizedPensionAdjustments}
                      styles={styles}
                    />
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section
            class="print-section responsive-lower-two"
            style={px(styles.lowerTwoGrid)}
          >
            <section
              class="foreign-exposure-print avoid-break"
              style={px(styles.sectionCard)}
            >
              <div style={px(styles.sectionHeader)}>
                <div style={px(styles.titleWithIcon)}>
                  <span>🌍</span>
                  <h2 style={px(styles.h2)}>חשיפה לחו"ל</h2>
                </div>
              </div>

              <div style={px(styles.explanation)}>
                התרשים מציג חלוקה משוקללת בין חו"ל לישראל על בסיס נתוני
                Exposures בכלל הנכסים.
              </div>

              <PercentDonutCard
                title={'חשיפה לחו"ל'}
                subtitle={`חשיפה משוקללת לחו"ל: ${formatPercentLabel(
                  weightedForeignExposure
                )}`}
                items={foreignExposureAllocation}
                colors={[accent, gold]}
                styles={styles}
              />
            </section>

            <section class="equity-print avoid-break" style={px(styles.equityCard)}>
              <div style={px(styles.sectionHeader)}>
                <div style={px(styles.titleWithIcon)}>
                  <span>📊</span>
                  <h2 style={px(styles.h2)}>חשיפה מנייתית משוקללת</h2>
                </div>
              </div>

              <div style={px(styles.explanation)}>
                המדד מחושב על בסיס משקל המסלולים בתיק ואחוז המניות המשוער בכל
                מסלול.
              </div>

              <div style={px(styles.equityValueWrap)}>
                <div style={px(styles.equityValue)}>
                  {formatPercentLabel(weightedEquityExposure)}
                </div>
                <div style={px(styles.equityLabel)}>{exposureLabel}</div>
              </div>

              <EquityBarModern value={weightedEquityExposure} />
            </section>
          </section>

          <section
            class="print-section main-group-print avoid-break"
            style={px(styles.sectionCard)}
          >
            <DonutBreakdownCard
              title="חלוקה עבור אפיקים ראשיים"
              subtitle="התרשים מציג את חלוקת אפיקי ההשקעה בתיק ביחס לסך הנכסים."
              items={mainGroupAllocation}
              formatCurrency={formatCurrency}
              colors={brandChartColors}
            />
          </section>

          <section
            class="print-section members-section force-new-page-print"
            style={px(styles.sectionCard)}
          >
            <h2 style={px(styles.h2)}>פירוט לפי בני משפחה</h2>
            <div style={px(styles.explanation)}>
              מוצגת תמונת מצב אישית לכל אחד מבני המשפחה, כולל קצבה, סכום חד
              פעמי, ביטוח חיים ואובדן כושר עבודה.
            </div>

            <div class="responsive-members-grid" style={px(styles.membersGrid)}>
              {members.map((member, index) => (
                <div
                  key={member.id || member.name || index}
                  class="member-card-print avoid-break"
                  style={px(styles.memberCard)}
                >
                  <div style={px(styles.memberTop)}>
                    <div>
                      <div style={px(styles.memberName)}>{member.name || "ללא שם"}</div>
                    </div>

                    <div style={px(styles.chip)}>
                      הפקדה חודשית: {formatCurrency(member.monthlyDeposits)}
                    </div>
                  </div>

                  <div style={px(styles.centerCard)}>
                    <div style={px(styles.centerLabel)}>סך צבירה</div>
                    <div style={px(styles.centerValue)}>
                      {formatCurrency(member.assets)}
                    </div>
                  </div>

                  <div
                    class="responsive-mini-grid"
                    style={px(styles.compareMiniGrid)}
                  >
                    <div style={px(styles.compareMiniCard)}>
                      <div style={px(styles.compareMiniTitle)}>קצבה חודשית צפויה</div>
                      <div style={px(styles.compareMiniInner)}>
                        <div style={px(styles.compareMiniSide)}>
                          <div style={px(styles.compareMiniSideLabel)}>עם הפקדות</div>
                          <div style={px(styles.compareMiniSideValue)}>
                            {formatCurrency(member.monthlyPensionWithDeposits)}
                          </div>
                        </div>

                        <div style={px(styles.dividerLine)} />

                        <div style={px(styles.compareMiniSide)}>
                          <div style={px(styles.compareMiniSideLabel)}>ללא הפקדות</div>
                          <div style={px(styles.compareMiniSideValue)}>
                            {formatCurrency(member.monthlyPensionWithoutDeposits)}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div style={px(styles.compareMiniCard)}>
                      <div style={px(styles.compareMiniTitle)}>סכום חד הוני לפרישה</div>
                      <div style={px(styles.compareMiniInner)}>
                        <div style={px(styles.compareMiniSide)}>
                          <div style={px(styles.compareMiniSideLabel)}>עם הפקדות</div>
                          <div style={px(styles.compareMiniSideValue)}>
                            {formatCurrency(member.lumpSumWithDeposits)}
                          </div>
                        </div>

                        <div style={px(styles.dividerLine)} />

                        <div style={px(styles.compareMiniSide)}>
                          <div style={px(styles.compareMiniSideLabel)}>ללא הפקדות</div>
                          <div style={px(styles.compareMiniSideValue)}>
                            {formatCurrency(member.lumpSumWithoutDeposits)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    class="responsive-insurance-grid"
                    style={px(styles.insuranceGrid)}
                  >
                    <div style={px(styles.insuranceCard)}>
                      <div style={px(styles.insuranceLabel)}>🛡️ ביטוח חיים</div>
                      <div style={px(styles.insuranceValue)}>
                        {formatCurrency(member.deathCoverage)}
                      </div>
                    </div>

                    <div style={px(styles.insuranceCard)}>
                      <div style={px(styles.insuranceLabel)}>🧍 אובדן כושר עבודה</div>
                      <div style={px(styles.insuranceValue)}>
                        {formatCurrency(member.disabilityValue)} (
                        {Math.round(Number(member.disabilityPercent || 0))}%)
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {!members.length ? (
                <div style={px(styles.emptyState)}>לא התקבל פירוט בני משפחה להצגה.</div>
              ) : null}
            </div>
          </section>

          <section
            class="print-section loans-section force-new-page-print"
            style={px(styles.loansBenefitsGrid)}
          >
            <section style={px(styles.sectionCard)}>
              <div style={px(styles.sectionHeader)}>
                <div style={px(styles.titleWithIcon)}>
                  <span>💳</span>
                  <h2 style={px(styles.h2)}>הלוואות על חשבון מוצרים פנסיוניים</h2>
                </div>
              </div>

              <div style={px(styles.explanation)}>
                פירוט הלוואות לפי אדם עם סיכום כולל ויחס לנכסים.
              </div>

              {hasDetailedLoans ? (
                <>
                  {Object.entries(groupedLoans).map(([personName, personLoans]) => {
                    const totalAmount = personLoans.reduce(
                      (sum, loan) => sum + (loan.amount || 0),
                      0
                    );
                    const totalBalance = personLoans.reduce(
                      (sum, loan) => sum + (loan.balance || 0),
                      0
                    );

                    return (
                      <div
                        class="print-table-block loan-group-print avoid-break"
                        key={personName}
                        style={px(styles.loanGroup)}
                      >
                        <div style={px(styles.loanPersonName)}>{personName}</div>

                        <div
                          class="responsive-loan-summary"
                          style={px(styles.loanSummaryRow)}
                        >
                          <div style={px(styles.loanSummaryCard)}>
                            <div style={px(styles.loanSummaryLabel)}>
                              סך סכום הלוואות
                            </div>
                            <div style={px(styles.loanSummaryValue)}>
                              {formatCurrency(totalAmount)}
                            </div>
                          </div>

                          <div style={px(styles.loanSummaryCard)}>
                            <div style={px(styles.loanSummaryLabel)}>יתרת הלוואות</div>
                            <div style={px(styles.loanSummaryValue)}>
                              {formatCurrency(totalBalance)}
                            </div>
                          </div>
                        </div>

                        <div
                          class="print-table-block avoid-break"
                          style={px(styles.loanTableWrap)}
                        >
                          <table style={px(styles.loanTable)}>
                            <thead>
                              <tr>
                                <th style={px(styles.loanTh)}>סכום הלוואה</th>
                                <th style={px(styles.loanTh)}>תדירות החזר</th>
                                <th style={px(styles.loanTh)}>יתרת הלוואה</th>
                                <th style={px(styles.loanTh)}>תאריך סיום</th>
                              </tr>
                            </thead>
                            <tbody>
                              {personLoans.map((loan) => (
                                <tr key={loan.id}>
                                  <td style={px(styles.loanTd)}>
                                    {formatCurrency(loan.amount)}
                                  </td>
                                  <td style={px(styles.loanTd)}>
                                    {loan.repaymentFrequency || "—"}
                                  </td>
                                  <td style={px(styles.loanTd)}>
                                    {formatCurrency(loan.balance)}
                                  </td>
                                  <td style={px(styles.loanTd)}>
                                    {formatDate(loan.endDate)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}

                  <div
                    class="print-table-block loan-group-print avoid-break"
                    style={px({ ...styles.loanGroup, marginTop: "16px" })}
                  >
                    <div
                      class="responsive-loan-summary"
                      style={px(styles.loanSummaryRow)}
                    >
                      <div style={px(styles.loanSummaryCard)}>
                        <div style={px(styles.loanSummaryLabel)}>סה"כ הלוואות</div>
                        <div style={px(styles.loanSummaryValue)}>
                          {formatCurrency(totalLoansAmount)}
                        </div>
                      </div>

                      <div style={px(styles.loanSummaryCard)}>
                        <div style={px(styles.loanSummaryLabel)}>יחס לנכסים</div>
                        <div style={px(styles.loanSummaryValue)}>
                          {loanRatioToAssets.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : !loans.hasData ? (
                <div style={px(styles.emptyState)}>
                  לא התקבל מידע על הלוואות בשני הקבצים שהועלו.
                </div>
              ) : (
                <div style={px(styles.emptyState)}>
                  התקבל סטטוס הלוואות, אבל לא הגיע פירוט מלא להצגה.
                </div>
              )}
            </section>
          </section>

          <section
            class="summary-box-print avoid-break"
            style={px(styles.sectionCard)}
          >
            <div style={px(styles.sectionHeader)}>
              <div style={px(styles.titleWithIcon)}>
                <span>🧾</span>
                <h2 style={px(styles.h2)}>סיכום מהיר</h2>
              </div>
            </div>

            <div style={px(styles.summaryStatsGrid)}>
              <div style={px(styles.statCard)}>
                <div style={px(styles.statLabel)}>מוצרים</div>
                <div style={px(styles.statValue)}>{products.length}</div>
              </div>

              <div style={px(styles.statCard)}>
                <div style={px(styles.statLabel)}>גופים מנהלים</div>
                <div style={px(styles.statValue)}>{managers.length}</div>
              </div>

              <div style={px(styles.statCard)}>
                <div style={px(styles.statLabel)}>בני משפחה</div>
                <div style={px(styles.statValue)}>{members.length}</div>
              </div>

              <div style={px(styles.statCard)}>
                <div style={px(styles.statLabel)}>אפיקים ראשיים</div>
                <div style={px(styles.statValue)}>{mainGroupAllocation.length}</div>
              </div>
            </div>

            <div style={px(styles.simpleInfoBox)}>
              <div style={px(styles.infoLabel)}>יחס הלוואות לנכסים</div>
              <div style={px(styles.infoValue)}>{loanRatioToAssets.toFixed(1)}%</div>
            </div>

            <div style={px({ ...styles.simpleInfoBox, marginTop: "12px" })}>
              <div style={px(styles.infoLabel)}>קצבה חודשית צפויה</div>
              <div style={px(styles.infoValue)}>
                {formatCurrency(family.monthlyPensionWithDeposits)}
              </div>
            </div>

            <div style={px({ ...styles.simpleInfoBox, marginTop: "12px" })}>
              <div style={px(styles.infoLabel)}>צבירה צפויה בגיל פרישה</div>
              <div style={px(styles.infoValue)}>
                {formatCurrency(family.projectedLumpSumWithDeposits)}
              </div>
            </div>
          </section>


          <section
            class="print-section conversation-summary-section recommendations-print avoid-break"
            style={px(styles.sectionCard)}
          >
            <div style={px(styles.sectionHeader)}>
              <div style={px(styles.titleWithIcon)}>
                <span>🧾</span>
                <h2 style={px(styles.h2)}>סיכום שיחה לפי נושאים</h2>
              </div>
            </div>

            <div style={px(styles.explanation)}>
              ניתן לכתוב סיכום כללי חופשי, ובהמשך לפרט לפי נושאים מובנים. רק
              נושאים שסומנו ב־V יעברו לתצוגת הלקוח. לכל נושא ניתן להוסיף גם
              פעולה אופרטיבית חופשית, שתיכנס לרשימת הפעולות.
            </div>

            <div style={px(styles.recommendationsWrap)}>
              <div class="screen-only">
                <div style={px({ marginBottom: 16 })}>
                  <div style={px({ color: navy, fontSize: 14, fontWeight: 900, marginBottom: 8 })}>
                    סיכום כללי חופשי
                  </div>
                  <textarea
                    value={generalConversationSummary}
                    onChange={(e) => setGeneralConversationSummary(e.target.value)}
                    style={px(styles.recommendationsText)}
                    placeholder="כתוב כאן סיכום כללי של השיחה, מטרות הלקוח, דגשים רחבים או נקודות שאינן קשורות לנושא ספציפי..."
                  />
                </div>

                <div style={px(styles.summaryFlowToolbar)}>
                  <button
                    type="button"
                    onClick={markAllSummaryTopics}
                    style={px(styles.summaryFlowButton)}
                  >
                    סמן הכל
                  </button>
                  <button
                    type="button"
                    onClick={clearAllSummaryTopicMarks}
                    style={px({
                      ...styles.summaryFlowButton,
                      color: accent,
                      borderColor: accent,
                    })}
                  >
                    נקה את כל ה־V
                  </button>
                  <div style={px({ color: textSoft, fontSize: 12, fontWeight: 800 })}>
                    נבחרו {selectedSummaryTopics.length} נושאים להצגה ללקוח
                  </div>
                </div>

                <div style={px(styles.summaryTopicList)}>
                  {summaryTopics.map((topic) => (
                    <div
                      key={topic.id}
                      class={`summary-topic-card ${
                        topic.checked
                          ? "summary-topic-card-active"
                          : "summary-topic-card-inactive"
                      }`}
                      style={px(styles.summaryTopicCard)}
                    >
                      <div style={px(styles.summaryTopicTop)}>
                        <label style={px(styles.summaryTopicCheckLabel)}>
                          <input
                            type="checkbox"
                            checked={topic.checked}
                            onChange={() => toggleSummaryTopic(topic.id)}
                            style={px(styles.summaryTopicCheckbox)}
                          />
                          {topic.title}
                        </label>

                        <div style={px({ color: topic.checked ? navy : textSoft, fontSize: 11, fontWeight: 900 })}>
                          {topic.checked ? "יוצג ללקוח" : "לא יוצג ללקוח"}
                        </div>
                      </div>

                      {topic.checked ? (
                        <div class="summary-topic-grid" style={px(styles.summaryTopicGrid)}>
                          <div>
                            <div style={px(styles.summaryTopicFieldLabel)}>סיכום בן זוג</div>
                            <textarea
                              class="summary-topic-textarea"
                              value={topic.spouseA}
                              onChange={(e) =>
                                updateSummaryTopic(topic.id, "spouseA", e.target.value)
                              }
                              style={px(styles.summaryTopicTextarea)}
                              placeholder="כתוב סיכום קצר לבן זוג..."
                            />
                          </div>

                          <div>
                            <div style={px(styles.summaryTopicFieldLabel)}>סיכום בת זוג</div>
                            <textarea
                              class="summary-topic-textarea"
                              value={topic.spouseB}
                              onChange={(e) =>
                                updateSummaryTopic(topic.id, "spouseB", e.target.value)
                              }
                              style={px(styles.summaryTopicTextarea)}
                              placeholder="כתוב סיכום קצר לבת זוג..."
                            />
                          </div>

                          <div>
                            <div style={px(styles.summaryTopicFieldLabel)}>פעולה לבן זוג</div>
                            <textarea
                              class="summary-topic-textarea"
                              value={topic.actionA}
                              onChange={(e) =>
                                updateSummaryTopic(topic.id, "actionA", e.target.value)
                              }
                              style={px(styles.summaryTopicActionTextarea)}
                              placeholder="כתוב פעולה אחת או יותר, כל פעולה בשורה נפרדת..."
                            />
                          </div>

                          <div>
                            <div style={px(styles.summaryTopicFieldLabel)}>פעולה לבת זוג</div>
                            <textarea
                              class="summary-topic-textarea"
                              value={topic.actionB}
                              onChange={(e) =>
                                updateSummaryTopic(topic.id, "actionB", e.target.value)
                              }
                              style={px(styles.summaryTopicActionTextarea)}
                              placeholder="כתוב פעולה אחת או יותר, כל פעולה בשורה נפרדת..."
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>

                <div style={px(styles.summaryPreviewBox)}>
                  {conversationSummary || "אין סיכום להצגה ללקוח כרגע."}
                </div>
              </div>
            </div>
          </section>

          <section
            class="print-section action-recommendations-section recommendations-print avoid-break"
            style={px(styles.sectionCard)}
          >
            <div style={px(styles.sectionHeader)}>
              <div style={px(styles.titleWithIcon)}>
                <span>📝</span>
                <h2 style={px(styles.h2)}>פעולות אופרטיביות לביצוע</h2>
              </div>
            </div>

            <div style={px(styles.explanation)}>
              כאן יוצגו רק פעולות שנכתבו בפועל — ידנית או לפי נושא מסומן. לא תתווסף פעולה אוטומטית שלא נכתבה.
            </div>

            <div style={px(styles.recommendationsWrap)}>
              <div class="screen-only">
                <div style={px({ color: navy, fontSize: 14, fontWeight: 900, marginBottom: 8 })}>
                  פעולות ידניות כלליות
                </div>
                <textarea
                  value={manualActionRecommendations}
                  onChange={(e) => setManualActionRecommendations(e.target.value)}
                  style={px(styles.recommendationsText)}
                  placeholder="כתוב כאן רק פעולות כלליות, אם יש. פעולות לפי נושא יש להזין בטבלת הנושאים למעלה."
                />

                <div style={px({ marginTop: 14 })}>
                  <div style={px({ color: navy, fontSize: 14, fontWeight: 900, marginBottom: 8 })}>
                    תצוגה מקדימה של פעולות ללקוח
                  </div>
                  <div style={px(styles.summaryPreviewBox)}>
                    {actionRecommendations || "אין פעולות להצגה ללקוח כרגע."}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div style={px(styles.footer)}>
            <div>Zviran · Total Rewards Experts</div>
            <div>דוח זה הופק לצורך הצגה והדפסה מתוך המערכת</div>
          </div>
        </div>
      </div>
    </>
  );
    };
  },
});

export default ReportPage;


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

function isSection28ImportantRow(label) {
  const text = normalizeSection28Text(label);
  return (
    text.includes("סכום קיטום מעל לסעיף 28 ברוטו") ||
    text.includes("סכום נטו לאחר ניכוי מס שולי") ||
    text.includes('סה"כ גידול נטו') ||
    text.includes("סה״כ גידול נטו") ||
    text.includes("סך הכל גידול נטו") ||
    text.includes("צבירת סכום נטו בחיסכון אישי")
  );
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

function Section28CappingReport({ data, styles }) {
  const groups = Array.isArray(data?.groups) ? data.groups : [];
  const comparisonRows = Array.isArray(data?.comparisonRows)
    ? data.comparisonRows
    : [];

  const costGroup = getSection28Group(groups, "employer-cost", "עלויות");
  const savingGroup = getSection28Group(groups, "saving-simulation", "סימולציה לחיסכון");
  const retirementGroup = getSection28Group(groups, "retirement", "סימולציה לגיל פרישה");

  const renderedGroupIds = new Set(
    [costGroup?.id, savingGroup?.id, retirementGroup?.id, "base"].filter(Boolean)
  );

  const otherGroups = groups.filter(
    (group) => !renderedGroupIds.has(group?.id) && !normalizeSection28Text(group?.title).includes("נתוני בסיס")
  );

  return (
    <div>
      {costGroup ? <Section28CostSplit group={costGroup} styles={styles} /> : null}

      {savingGroup ? (
        <div style={px({ marginTop: 14 })}>
          <Section28SavingSimulation group={savingGroup} styles={styles} />
        </div>
      ) : null}

      {comparisonRows.length ? (
        <Section28ComparisonTable rows={comparisonRows} styles={styles} />
      ) : null}

      {retirementGroup ? (
        <div style={px({ marginTop: 14 })}>
          <Section28RetirementSimulation group={retirementGroup} styles={styles} />
        </div>
      ) : null}

      {otherGroups.length ? (
        <div class="section-28-grid-print" style={px({ ...styles.section28Grid, marginTop: 14 })}>
          {otherGroups.map((group) => (
            <Section28Group key={group.id || group.title} group={group} styles={styles} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function pickSection28Rows(rows, labelParts) {
  return labelParts
    .map((part) => rows.find((row) => normalizeSection28Text(row.label).includes(part)))
    .filter(Boolean);
}

function Section28CostSplit({ group, styles }) {
  const rows = Array.isArray(group?.rows) ? group.rows.filter((row) => isMeaningfulSection28Value(row.value)) : [];
  const monthlyRow = rows.find((row) => isSection28MonthlySavingRow(row.label));

  const employerRows = pickSection28Rows(rows, [
    "השתלמות מעל תקרה",
    "פיצויים מעל לתקרה",
    "תגמולים מעל לתקרה",
  ]);

  const employerSummaryRows = pickSection28Rows(rows, [
    "סכום קיטום מעל לסעיף 28 ברוטו",
    "סכום נטו לאחר ניכוי מס שולי",
  ]);

  const employeeRows = pickSection28Rows(rows, [
    "גידול בנטו בעקבות קיטום בפיצויים",
    "גידול בנטו בעקבות קיטום תגמולים",
    "גידול בנטו בעקבות קיטום קה\"ל מעל לתקרה",
    "הפרשות עובד קה\"ל מעל תקרה",
    "הפרשות עובד תגמולים",
  ]);

  const employeeSummaryRows = pickSection28Rows(rows, [
    'סה"כ גידול נטו',
    "סה״כ גידול נטו",
    "סך הכל גידול נטו",
  ]);

  const cardStyle = {
    ...styles.section28Group,
    background: "linear-gradient(180deg, #FFFFFF 0%, #F7F9FC 100%)",
  };

  return (
    <div style={px(styles.section28Group)}>
      <div style={px(styles.section28GroupTitle)}>פירוט עלויות עובד / מעסיק</div>

      <div style={px({ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 })}>
        <div style={px(cardStyle)}>
          <div style={px({ ...styles.section28GroupTitle, fontSize: 12 })}>חלק מעסיק</div>
          {employerRows.map((row, index) => (
            <Section28DataRow key={`${row.label}-${index}`} row={row} styles={styles} />
          ))}
          {employerSummaryRows.length ? (
            <div style={px({ marginTop: 10 })}>
              {employerSummaryRows.map((row, index) => (
                <Section28DataRow key={`${row.label}-${index}`} row={row} styles={styles} forceHighlight />
              ))}
            </div>
          ) : null}
        </div>

        <div style={px(cardStyle)}>
          <div style={px({ ...styles.section28GroupTitle, fontSize: 12 })}>חלק עובד</div>
          {employeeRows.map((row, index) => (
            <Section28DataRow key={`${row.label}-${index}`} row={row} styles={styles} />
          ))}
          {employeeSummaryRows.length ? (
            <div style={px({ marginTop: 10 })}>
              {employeeSummaryRows.map((row, index) => (
                <Section28DataRow key={`${row.label}-${index}`} row={row} styles={styles} forceHighlight />
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {monthlyRow ? (
        <div style={px({ marginTop: 12 })}>
          <Section28MonthlySavingRow row={monthlyRow} styles={styles} />
        </div>
      ) : null}
    </div>
  );
}

function Section28SavingSimulation({ group, styles }) {
  const rows = Array.isArray(group?.rows) ? group.rows.filter((row) => isMeaningfulSection28Value(row.value)) : [];
  const wanted = ["סכום צבירה ברוטו", "הפקדות נומינליות", "צבירת סכום נטו בחיסכון אישי"];
  const selectedRows = wanted
    .map((label) => rows.find((row) => normalizeSection28Text(row.label).includes(label)))
    .filter(Boolean);

  if (!selectedRows.length) return null;

  return (
    <div style={px(styles.section28Group)}>
      <div style={px(styles.section28GroupTitle)}>סימולציה לחיסכון</div>
      {selectedRows.map((row, index) => (
        <Section28DataRow
          key={`${row.label}-${index}`}
          row={row}
          styles={styles}
          forceHighlight={normalizeSection28Text(row.label).includes("צבירת סכום נטו בחיסכון אישי")}
        />
      ))}
    </div>
  );
}

function Section28RetirementSimulation({ group, styles }) {
  const rows = Array.isArray(group?.rows) ? group.rows.filter((row) => isMeaningfulSection28Value(row.value)) : [];
  const interestRow = rows.find((row) => normalizeSection28Text(row.label).includes("ריבית שנתית"));
  const yearsRow = rows.find((row) => normalizeSection28Text(row.label).includes("תקופת משיכה בשנים"));

  const displayRows = rows
    .filter((row) => {
      const label = normalizeSection28Text(row.label);
      return (
        !label.includes("תגמול נדחה") &&
        !label.includes("ריבית שנתית") &&
        !label.includes("תקופת משיכה בשנים")
      );
    })
    .map((row) => ({
      ...row,
      label: normalizeSection28Text(row.label).includes("סכום משיכה") ? "קצבה מחושבת" : row.label,
    }));

  if (!displayRows.length) return null;

  const meta = [
    interestRow ? `ריבית ${formatSection28DisplayValue(interestRow.value)}` : "",
    yearsRow ? `${formatSection28DisplayValue(yearsRow.value)} שנים` : "",
  ].filter(Boolean).join(" · ");

  return (
    <div style={px(styles.section28Group)}>
      <div style={px(styles.section28GroupTitle)}>
        סימולציה לגיל פרישה{meta ? ` (${meta})` : ""}
      </div>
      {displayRows.map((row, index) => (
        <Section28DataRow key={`${row.label}-${index}`} row={row} styles={styles} />
      ))}
    </div>
  );
}

function Section28Group({ group, styles }) {
  const rows = Array.isArray(group?.rows)
    ? group.rows.filter((row) => isMeaningfulSection28Value(row.value))
    : [];

  if (!rows.length) return null;

  return (
    <div style={px(styles.section28Group)}>
      <div style={px(styles.section28GroupTitle)}>{group.title}</div>

      {rows.map((row, index) => (
        <Section28DataRow
          key={`${row.label}-${index}`}
          row={row}
          styles={styles}
          isLast={index === rows.length - 1}
          forceHighlight={isSection28ImportantRow(row.label)}
        />
      ))}
    </div>
  );
}

function Section28DataRow({ row, styles, isLast = false, forceHighlight = false }) {
  const isHighlighted = forceHighlight || isSection28ImportantRow(row.label);

  const rowStyle = isHighlighted
    ? {
        ...styles.section28Row,
        border: "1px solid #DDE3EC",
        borderRadius: 14,
        padding: "10px 12px",
        marginTop: 8,
        background: "linear-gradient(135deg, #F7F9FC 0%, #EEF2FA 100%)",
        boxShadow: "0 4px 12px rgba(0,33,93,0.05)",
      }
    : {
        ...styles.section28Row,
        borderBottom: isLast ? "none" : styles.section28Row.borderBottom,
      };

  return (
    <div style={px(rowStyle)}>
      <div style={px({ ...styles.section28Label, color: isHighlighted ? "#00215D" : styles.section28Label.color, fontWeight: isHighlighted ? 900 : styles.section28Label.fontWeight })}>
        {row.label}
      </div>
      <div style={px({ ...styles.section28Value, color: isHighlighted ? "#FF2756" : styles.section28Value.color })}>
        {formatSection28DisplayValue(row.value)}
      </div>
    </div>
  );
}

function Section28MonthlySavingRow({ row, styles }) {
  return (
    <div
      style={px({
        border: "1px solid #D8DEE9",
        borderRadius: 14,
        background: "linear-gradient(135deg, #00215D 0%, #001845 100%)",
        color: "#fff",
        padding: "10px 14px",
        textAlign: "center",
        boxShadow: "0 6px 14px rgba(0,33,93,0.10)",
      })}
    >
      <div style={px({ fontSize: 11.5, fontWeight: 800, color: "rgba(255,255,255,0.82)", marginBottom: 4 })}>
        {row.label}
      </div>
      <div style={px({ fontSize: 14, fontWeight: 900, direction: "ltr" })}>
        {formatSection28DisplayValue(row.value)}
      </div>
    </div>
  );
}

function Section28EmptyNote() {
  return (
    <div
      style={px({
        border: "1px dashed #DDE3EC",
        borderRadius: 12,
        padding: "10px 12px",
        color: "#627D98",
        fontSize: 11,
        textAlign: "center",
        background: "#F7F9FC",
      })}
    >
      אין נתון להצגה
    </div>
  );
}

function Section28ComparisonBars({ rows }) {
  const chartRows = rows.filter((row) => {
    const label = normalizeSection28Text(row.label).replace(/סהכ/g, 'סה"כ');
    const isWantedRow = label === "קצבה" || label.includes('סה"כ הון') || label.includes("סה״כ הון");
    return isWantedRow && (isMeaningfulSection28Value(row.before) || isMeaningfulSection28Value(row.after));
  });

  return (
    <div
      style={px({
        background: "#FFFFFF",
        border: "1px solid #E7ECF3",
        borderRadius: 16,
        padding: 12,
        minHeight: "100%",
      })}
    >
      <div style={px({ color: "#00215D", fontSize: 12, fontWeight: 900, marginBottom: 10 })}>
        גרף השוואה
      </div>
      <div style={px({ display: "flex", flexDirection: "column", gap: 10 })}>
        {chartRows.map((row, index) => {
          const before = Math.abs(section28NumericValue(row.before));
          const after = Math.abs(section28NumericValue(row.after));
          const rowMaxValue = Math.max(before, after, 1);
          const isPensionRow = normalizeSection28Text(row.label) === "קצבה";
          const beforeBar = {
            value: before,
            displayValue: row.before,
            color: "#00215D",
            fill: "linear-gradient(90deg, #C7D1E2, #EAF1FB)",
          };
          const afterBar = {
            value: after,
            displayValue: row.after,
            color: "#FF2756",
            fill: "linear-gradient(90deg, #FF2756, #00215D)",
          };
          const [topBar, bottomBar] = isPensionRow && before > after
            ? [afterBar, beforeBar]
            : [beforeBar, afterBar];

          return (
            <div key={`${row.label}-${index}`}>
              <div style={px({ color: "#627D98", fontSize: 10.5, fontWeight: 800, marginBottom: 5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" })}>
                {row.label}
              </div>
              <div style={px({ display: "grid", gridTemplateColumns: "1fr", gap: 4 })}>
                {[topBar, bottomBar].map((bar, barIndex) => (
                  <div key={barIndex}>
                    <div style={px({ color: bar.color, fontSize: 10.5, fontWeight: 900, marginBottom: 3, direction: "ltr", textAlign: "left" })}>
                      {formatSection28DisplayValue(bar.displayValue)}
                    </div>
                    <div style={px({ height: 9, borderRadius: 999, background: "#EAF1FB", overflow: "hidden" })}>
                      <div style={px({ width: `${Math.max((bar.value / rowMaxValue) * 100, bar.value ? 4 : 0)}%`, height: "100%", background: bar.fill, borderRadius: 999 })} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div style={px({ display: "flex", gap: 12, marginTop: 12, color: "#627D98", fontSize: 10.5, fontWeight: 800 })}>
        <span><span style={px({ color: "#C7D1E2" })}>■</span> לפני</span>
        <span><span style={px({ color: "#FF2756" })}>■</span> אחרי</span>
      </div>
    </div>
  );
}

function Section28ComparisonTable({ rows, styles }) {
  return (
    <div style={px({ marginTop: 16 })}>
      <div style={px(styles.section28GroupTitle)}>השוואה בין תרחישים</div>

      <div style={px({ display: "grid", gridTemplateColumns: "minmax(0, 1.18fr) minmax(230px, 0.82fr)", gap: 12, alignItems: "stretch" })}>
        <div style={px({ ...styles.section28TableWrap, marginTop: 0 })}>
          <table style={px({ ...styles.section28Table, minWidth: "560px" })}>
            <thead>
              <tr>
                <th style={px({ ...styles.section28Th, fontSize: 9.5, padding: "7px 5px" })}>סעיף</th>
                <th style={px({ ...styles.section28Th, fontSize: 9.5, padding: "7px 5px" })}>לפני קיטום</th>
                <th style={px({ ...styles.section28Th, fontSize: 9.5, padding: "7px 5px" })}>אחרי קיטום</th>
                <th style={px({ ...styles.section28Th, fontSize: 9.5, padding: "7px 5px" })}>פער בין תרחישים</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row, index) => {
                const isTotal = String(row.label || "").includes('סה"כ') ||
                  String(row.label || "").includes("סה״כ");
                const cellStyle = isTotal ? styles.section28TotalTd : styles.section28Td;
                const compactCellStyle = { ...cellStyle, fontSize: 9.5, padding: "7px 5px" };

                return (
                  <tr key={`${row.label}-${index}`}>
                    <td style={px(compactCellStyle)}>{row.label}</td>
                    <td style={px(compactCellStyle)}>{formatSection28DisplayValue(row.before)}</td>
                    <td style={px(compactCellStyle)}>{formatSection28DisplayValue(row.after)}</td>
                    <td style={px(compactCellStyle)}>{formatSection28DisplayValue(row.gap)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <Section28ComparisonBars rows={rows} />
      </div>
    </div>
  );
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

function formatRecognizedPensionAmount(value) {
  const number = Number(value || 0);

  if (!Number.isFinite(number) || number <= 0) {
    return "";
  }

  return formatReportNumber(number, 0);
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

function VestedPdfCalculationTable({ rows, styles }) {
  const pdfRows = Array.isArray(rows) ? rows : [];

  const columns = [
    { key: "fundName", label: "שם הקופה" },
    { key: "balanceFee", label: "% דמי ניהול על הצבירה" },
    { key: "depositFee", label: "% דמי ניהול על ההפקדות" },
    { key: "rewardsUntil2011", label: "תגמולים עד 2011" },
    { key: "rewardsFrom2012", label: "תגמולים מ־2012" },
    { key: "severanceFrom2017", label: "פיצויים מ־2017" },
    { key: "exemptPayments", label: "סכום תשלומים פטורים" },
    { key: "coefficient", label: "מקדם" },
    { key: "pension", label: "קצבה מוכרת" },
  ];

  const pdfTotal = getPdfExemptPaymentsTotal(pdfRows);

  return (
    <div style={px({ marginBottom: 22 })}>
      <div
        style={px({
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 10,
          flexWrap: "wrap",
        })}
      >
        <div>
          <div style={px({ color: "#00215D", fontSize: 14, fontWeight: 900 })}>
            טבלת חישוב מתוך PDF
          </div>
          <div style={px({ color: "#627D98", fontSize: 12, marginTop: 4 })}>
            הטבלה מציגה את נתוני הצבירה המוכרת כפי שנקראו מהמסמך.
          </div>
        </div>

        <div
          style={px({
            background: "#EEF2FA",
            color: "#00215D",
            border: "1px solid #D8DEE9",
            borderRadius: 999,
            padding: "8px 14px",
            fontSize: 12,
            fontWeight: 900,
            whiteSpace: "nowrap",
          })}
        >
          סה"כ תשלומים פטורים: {formatReportNumber(pdfTotal)}
        </div>
      </div>

      <div style={px(styles.vestedTableWrap)}>
        <table style={px(styles.vestedTable)}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} style={px(styles.vestedTh)}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {pdfRows.map((row, index) => {
              const rowStyle = isVestedTotalRow(row)
                ? styles.vestedTotalTd
                : styles.vestedTd;

              return (
                <tr key={row.id || index}>
                  {columns.map((column) => (
                    <td key={column.key} style={px(rowStyle)}>
                      {row[column.key] || "—"}
                    </td>
                  ))}
                </tr>
              );
            })}

            <tr>
              {columns.map((column) => (
                <td key={column.key} style={px(styles.vestedTotalTd)}>
                  {column.key === "fundName"
                    ? 'סה"כ טבלת PDF'
                    : column.key === "exemptPayments"
                    ? formatReportNumber(pdfTotal)
                    : "—"}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ManualRecognizedPensionTable({ rows, styles }) {
  const manualTotal = rows.reduce(
    (sum, row) => sum + Number(row.amount || 0),
    0
  );

  return (
    <div style={px({ marginTop: 20 })}>
      <div
        style={px({
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 10,
          flexWrap: "wrap",
        })}
      >
        <div>
          <div style={px({ color: "#00215D", fontSize: 14, fontWeight: 900 })}>
            קצבה מוכרת שהוזנה ידנית
          </div>
          <div style={px({ color: "#627D98", fontSize: 12, marginTop: 4 })}>
            הטבלה מציגה את הסכומים שהוזנו במסך ההעלאה לפי חברת ביטוח.
          </div>
        </div>
      </div>

      <div style={px(styles.vestedTableWrap)}>
        <table
          style={px({
            ...styles.vestedTable,
            minWidth: "520px",
          })}
        >
          <thead>
            <tr>
              <th style={px(styles.vestedTh)}>חברת ביטוח</th>
              <th style={px(styles.vestedTh)}>קצבה מוכרת שהוזנה</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td style={px(styles.vestedManualTd)}>{row.companyName}</td>
                <td style={px(styles.vestedManualTd)}>
                  {formatReportNumber(row.amount)}
                </td>
              </tr>
            ))}

            <tr>
              <td style={px(styles.vestedTotalTd)}>סה"כ</td>
              <td style={px(styles.vestedTotalTd)}>
                {formatReportNumber(manualTotal)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={px({ marginTop: 12, display: "flex", justifyContent: "flex-start" })}>
        <div
          style={px({
            background: "#F7F9FC",
            color: "#00215D",
            border: "1px solid #DDE3EC",
            borderRadius: 999,
            padding: "8px 14px",
            fontSize: 12,
            fontWeight: 900,
            whiteSpace: "nowrap",
          })}
        >
          סה"כ קצבה מוכרת: {formatReportNumber(manualTotal)}
        </div>
      </div>
    </div>
  );
}


function TaxSavingGapSummary({ pdfTotal, manualTotal }) {
  const gap = pdfTotal - manualTotal;
  const gapColor = gap >= 0 ? "#00215D" : "#B42318";

  return (
    <div
      style={px({
        marginTop: 22,
        padding: "18px 20px",
        borderRadius: 18,
        border: "1px solid #DDE3EC",
        background:
          "linear-gradient(135deg, rgba(255,255,255,1) 0%, rgba(255,247,232,1) 100%)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 16,
        flexWrap: "wrap",
      })}
    >
      <div>
        <div style={px({ color: "#00215D", fontSize: 15, fontWeight: 900 })}>
          פער הצבירה לחיסכון במס
        </div>
        <div style={px({ color: "#627D98", fontSize: 12, marginTop: 5 })}>
          חישוב לפי סה"כ טבלת ה־PDF פחות סה"כ הקצבה המוכרת שהוזנה ידנית.
        </div>
      </div>

      <div
        style={px({
          color: gapColor,
          fontSize: 22,
          fontWeight: 900,
          direction: "ltr",
          whiteSpace: "nowrap",
        })}
      >
        {formatReportNumber(gap)}
      </div>
    </div>
  );
}

function VestedBalanceTable({ table, adjustments, styles }) {
  const pdfRows = Array.isArray(table?.rows) ? table.rows : [];
  const manualRows = getManualRecognizedPensionRows(adjustments);

  const pdfTotal = getPdfExemptPaymentsTotal(pdfRows);
  const manualTotal = manualRows.reduce(
    (sum, row) => sum + Number(row.amount || 0),
    0
  );

  return (
    <div>
      {pdfRows.length ? (
        <VestedPdfCalculationTable rows={pdfRows} styles={styles} />
      ) : null}

      {manualRows.length ? (
        <ManualRecognizedPensionTable rows={manualRows} styles={styles} />
      ) : null}

      {pdfTotal > 0 && manualTotal > 0 ? (
        <TaxSavingGapSummary pdfTotal={pdfTotal} manualTotal={manualTotal} />
      ) : null}
    </div>
  );
}


function KpiCard({ styles, icon, title, value, subtext }) {
  return (
    <div style={px(styles.kpiCard)} class="kpi-card-hover">
      <div
        class="responsive-kpi-inner"
        style={px({
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          height: "100%",
        })}
      >
        <div style={px(styles.kpiIconWrap)}>{icon}</div>
        <div style={px(styles.kpiTitle)}>{title}</div>
        <div style={px(styles.kpiValue)}>{value}</div>
        <div style={px(styles.kpiSub)}>{subtext}</div>
      </div>
    </div>
  );
}

function ComparisonChartCard({ styles, title, explanation, bars }) {
  return (
    <div style={px(styles.compareCard)}>
      <div style={px(styles.compareTitle)}>{title}</div>
      <div style={px(styles.compareDesc)}>{explanation}</div>

      <div style={px(styles.compareBarList)}>
        {bars.map((bar) => (
          <div key={bar.label} style={px(styles.compareBarItem)}>
            <div style={px(styles.compareBarTop)}>
              <div style={px(styles.compareBarLabel)}>{bar.label}</div>
              <div style={px(styles.compareBarValue)}>{bar.display}</div>
            </div>

            <div style={px(styles.compareTrack)}>
              <div
                style={px({
                  ...(bar.tone === "primary"
                    ? styles.compareFillPrimary
                    : styles.compareFillMuted),
                  width: `${Math.max(bar.ratio, 6)}%`,
                })}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EquityBarModern({ value }) {
  const safeValue = Math.max(0, Math.min(100, Number(value || 0)));

  return (
    <div style={px({ paddingTop: "6px" })}>
      <div
        style={px({
          position: "relative",
          height: "16px",
          borderRadius: "999px",
          background:
            "linear-gradient(270deg, #F4F6F9 0%, #EAF1FB 45%, #DDE3EC 75%, #00215D 100%)",
          overflow: "hidden",
        })}
      >
        <div
          style={px({
            marginRight: 0,
            marginLeft: "auto",
            width: `${safeValue}%`,
            height: "100%",
            borderRadius: "999px",
            background: "linear-gradient(270deg, #FF2756 0%, #00215D 100%)",
            boxShadow: "0 1px 3px rgba(0,33,93,0.25)",
          })}
        />
      </div>

      <div
        style={px({
          display: "flex",
          justifyContent: "space-between",
          marginTop: "10px",
          fontSize: "12px",
          color: "#627D98",
          direction: "rtl",
        })}
      >
        <span>0%</span>
        <span>25%</span>
        <span>50%</span>
        <span>75%</span>
        <span>100%</span>
      </div>
    </div>
  );
}

function buildDonutSegments(items, colors) {
  const safeItems = Array.isArray(items) ? items : [];
  const cleanItems = safeItems
    .map((item) => ({
      ...item,
      name: item.name || "ללא שם",
      value: Number(item.value || 0),
    }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);

  const total = cleanItems.reduce((sum, item) => sum + item.value, 0);
  const safeTotal = total || 1;

  let current = 0;
  const segments = cleanItems.map((item, index) => {
    const percent = (item.value / safeTotal) * 100;
    const start = current;
    const end = current + percent;
    current = end;

    return {
      ...item,
      percent,
      start,
      end,
      color: colors[index % colors.length],
    };
  });

  const gradient = segments.length
    ? segments.map((seg) => `${seg.color} ${seg.start}% ${seg.end}%`).join(", ")
    : "#D7DEE7 0% 100%";

  return { segments, total, gradient };
}

function Donut3D({ gradient, size = 110, hole = "30%", soft = false }) {
  return (
    <div
      style={px({
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: "50%",
        background: `conic-gradient(${gradient})`,
        position: "relative",
        flexShrink: 0,
        boxShadow: soft
          ? "inset 0 0 0 2px rgba(255,255,255,0.95), inset 0 -7px 10px rgba(0,0,0,0.12), 0 7px 14px rgba(0,33,93,0.10)"
          : "inset 0 0 0 3px rgba(255,255,255,0.95), inset 0 -12px 18px rgba(0,0,0,0.14), 0 10px 22px rgba(0,33,93,0.12)",
        transform: soft
          ? "perspective(700px) rotateX(4deg)"
          : "perspective(900px) rotateX(4deg)",
      })}
    >
      <div
        style={px({
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background:
            "linear-gradient(145deg, rgba(255,255,255,0.22), rgba(255,255,255,0) 42%, rgba(0,0,0,0.10) 100%)",
          pointerEvents: "none",
        })}
      />
      <div
        style={px({
          position: "absolute",
          inset: hole,
          background: "#fff",
          borderRadius: "50%",
          boxShadow:
            "inset 0 5px 10px rgba(0,33,93,0.05), 0 0 0 2px rgba(255,255,255,0.9)",
          transform: soft ? "rotateX(-4deg)" : "rotateX(-4deg)",
        })}
      />
    </div>
  );
}

function DonutSummaryCard({
  title,
  subtitle,
  items,
  colors,
  styles,
  formatCurrency,
}) {
  const { segments, gradient } = buildDonutSegments(items, colors);

  return (
    <section style={px(styles.donutCard)}>
      <h3 style={px(styles.donutTitle)}>{title}</h3>
      <div style={px({ ...styles.smallText, marginTop: "6px" })}>{subtitle}</div>

      <div
        style={px({
          display: "grid",
          gridTemplateColumns: "1fr 116px",
          gap: "14px",
          alignItems: "center",
          marginTop: "12px",
          minHeight: "122px",
          direction: "rtl",
        })}
      >
        <div
          style={px({
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            minWidth: 0,
          })}
        >
          {segments.length ? (
            segments.slice(0, 5).map((seg, index) => (
              <div
                key={`${seg.name || "item"}-${index}`}
                style={px({
                  display: "grid",
                  gridTemplateColumns: "42px 1fr 10px",
                  gap: "8px",
                  alignItems: "center",
                  fontSize: "12px",
                })}
              >
                <div
                  style={px({
                    color: "#102A43",
                    fontWeight: 800,
                    textAlign: "left",
                    direction: "ltr",
                  })}
                >
                  {Math.round(seg.percent)}%
                </div>

                <div style={px({ minWidth: 0, textAlign: "right" })}>
                  <div
                    style={px({
                      color: "#102A43",
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    })}
                    title={seg.name}
                  >
                    {seg.name}
                  </div>
                  <div
                    style={px({
                      color: "#627D98",
                      fontSize: "11px",
                      marginTop: "2px",
                    })}
                  >
                    {formatCurrency(seg.value)}
                  </div>
                </div>

                <span
                  style={px({
                    width: "10px",
                    height: "10px",
                    borderRadius: "50%",
                    background: seg.color,
                    display: "inline-block",
                    boxShadow: "0 1px 3px rgba(16,42,67,0.15)",
                  })}
                />
              </div>
            ))
          ) : (
            <div style={px({ ...styles.smallText, marginTop: "4px" })}>
              אין נתונים להצגה
            </div>
          )}
        </div>

        <div style={px({ display: "flex", justifyContent: "center" })}>
          <Donut3D gradient={gradient} size={104} hole="31%" soft />
        </div>
      </div>
    </section>
  );
}

function DonutBreakdownCard({
  title = "חלוקה עבור אפיקים ראשיים",
  subtitle = "התרשים מציג את חלוקת אפיקי ההשקעה בתיק ביחס לסך הנכסים.",
  items,
  formatCurrency,
  colors,
}) {
  const { segments, total, gradient } = buildDonutSegments(items, colors);

  return (
    <div style={px({ width: "100%", direction: "rtl" })}>
      <div
        style={px({
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "16px",
          marginBottom: "22px",
        })}
      >
        <div style={px({ minWidth: 0 })}>
          <div
            style={px({
              display: "flex",
              alignItems: "center",
              gap: "10px",
              marginBottom: "6px",
            })}
          >
            <span
              style={px({
                width: "18px",
                height: "18px",
                borderRadius: "50%",
                background: `conic-gradient(${colors[0]} 0 25%, ${colors[1]} 25% 50%, ${colors[2]} 50% 75%, ${colors[3]} 75% 100%)`,
                display: "inline-block",
              })}
            />
            <h2
              style={px({
                margin: 0,
                fontSize: "20px",
                lineHeight: 1.25,
                color: "#00215D",
                fontWeight: 800,
              })}
            >
              {title}
            </h2>
          </div>

          <div style={px({ fontSize: "13px", color: "#627D98", lineHeight: 1.7 })}>
            {subtitle}
          </div>
        </div>
      </div>

      {segments.length ? (
        <div
          class="main-breakdown-layout"
          style={px({
            display: "grid",
            gridTemplateColumns: "0.95fr 1.05fr",
            gap: "28px",
            alignItems: "center",
          })}
        >
          <div style={px({ display: "flex", flexDirection: "column", minWidth: 0 })}>
            {segments.map((seg, index) => (
              <div
                key={`${seg.id || seg.name}-${index}`}
                style={px({
                  display: "grid",
                  gridTemplateColumns: "72px 1fr 132px 14px",
                  gap: "12px",
                  alignItems: "center",
                  padding: "12px 0",
                  borderBottom:
                    index === segments.length - 1 ? "none" : "1px solid #E8E1D7",
                  minHeight: "44px",
                })}
              >
                <div
                  style={px({
                    color: "#102A43",
                    fontWeight: 800,
                    fontSize: "14px",
                    textAlign: "left",
                    direction: "ltr",
                  })}
                >
                  {Math.round(seg.percent)}%
                </div>

                <div
                  style={px({
                    color: "#102A43",
                    fontWeight: 800,
                    fontSize: "14px",
                    textAlign: "right",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  })}
                  title={seg.name}
                >
                  {seg.name}
                </div>

                <div
                  style={px({
                    color: "#102A43",
                    fontWeight: 700,
                    fontSize: "14px",
                    textAlign: "right",
                    direction: "ltr",
                    whiteSpace: "nowrap",
                  })}
                >
                  {formatCurrency(seg.value)}
                </div>

                <span
                  style={px({
                    width: "14px",
                    height: "14px",
                    borderRadius: "50%",
                    background: seg.color,
                    display: "inline-block",
                    boxShadow: "0 1px 3px rgba(16,42,67,0.15)",
                  })}
                />
              </div>
            ))}
          </div>

          <div
            style={px({
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              minWidth: 0,
            })}
          >
            <div style={px({ position: "relative", width: "min(340px, 100%)" })}>
              <div style={px({ width: "100%", aspectRatio: "1 / 1", position: "relative" })}>
                <Donut3D gradient={gradient} size={340} hole="27%" />
                <div
                  style={px({
                    position: "absolute",
                    inset: "27%",
                    borderRadius: "50%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    textAlign: "center",
                    pointerEvents: "none",
                  })}
                >
                  <div
                    style={px({
                      color: "#627D98",
                      fontSize: "15px",
                      fontWeight: 700,
                      marginBottom: "8px",
                    })}
                  >
                    סה"כ נכסים
                  </div>

                  <div
                    style={px({
                      color: "#00215D",
                      fontSize: "28px",
                      fontWeight: 900,
                      lineHeight: 1.1,
                      direction: "ltr",
                    })}
                  >
                    {formatCurrency(total)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div
          style={px({
            border: "1px dashed #DDE3EC",
            borderRadius: "16px",
            padding: "18px",
            color: "#627D98",
            fontSize: "12px",
            background: "#F7F9FC",
          })}
        >
          אין נתוני אפיקים להצגה
        </div>
      )}
    </div>
  );
}

function PercentDonutCard({ title, subtitle, items, colors, styles }) {
  const safeItems = Array.isArray(items) ? items : [];
  const { segments, gradient } = buildDonutSegments(
    safeItems.map((item) => ({
      ...item,
      value: Number(item.value || item.percent || 0),
    })),
    colors
  );

  return (
    <section
      style={px({
        ...styles.donutCard,
        minHeight: "auto",
        boxShadow: "none",
        padding: 0,
        border: "none",
      })}
    >
      <div
        style={px({
          display: "grid",
          gridTemplateColumns: "1fr 116px",
          gap: "14px",
          alignItems: "center",
          minHeight: "122px",
          direction: "rtl",
        })}
      >
        <div style={px({ display: "flex", flexDirection: "column", gap: "8px" })}>
          {segments.length ? (
            segments.map((seg, index) => (
              <div
                key={`${seg.name || "item"}-${index}`}
                style={px({
                  display: "grid",
                  gridTemplateColumns: "42px 1fr 10px",
                  gap: "8px",
                  alignItems: "center",
                  fontSize: "12px",
                })}
              >
                <div
                  style={px({
                    color: "#102A43",
                    fontWeight: 800,
                    textAlign: "left",
                    direction: "ltr",
                  })}
                >
                  {Math.round(seg.percent)}%
                </div>

                <div
                  style={px({
                    color: "#102A43",
                    fontWeight: 700,
                    minWidth: 0,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    textAlign: "right",
                  })}
                  title={seg.name}
                >
                  {seg.name}
                </div>

                <span
                  style={px({
                    width: "10px",
                    height: "10px",
                    borderRadius: "50%",
                    background: seg.color,
                    display: "inline-block",
                    boxShadow: "0 1px 3px rgba(16,42,67,0.15)",
                  })}
                />
              </div>
            ))
          ) : (
            <div style={px({ ...styles.smallText, marginTop: "4px" })}>
              אין נתונים להצגה
            </div>
          )}
        </div>

        <div style={px({ display: "flex", justifyContent: "center" })}>
          <Donut3D gradient={gradient} size={110} hole="31%" soft />
        </div>
      </div>
    </section>
  );
}

function ZviranLogo({ light = false }) {
  return (
    <div
      style={px({
        display: "flex",
        alignItems: "center",
        gap: "12px",
        direction: "ltr",
        justifyContent: light ? "flex-end" : "flex-start",
      })}
    >
      <div
        style={px({
          width: "54px",
          height: "54px",
          borderRadius: "50%",
          background: light ? "rgba(255,255,255,0.14)" : "#0A2668",
          border: light ? "1px solid rgba(255,255,255,0.25)" : "none",
          position: "relative",
          flexShrink: 0,
        })}
      >
        <div
          style={px({
            position: "absolute",
            width: "24px",
            height: "8px",
            background: "#FF2756",
            borderRadius: "999px",
            top: "15px",
            left: "16px",
            transform: "rotate(-35deg)",
          })}
        />
        <div
          style={px({
            position: "absolute",
            width: "24px",
            height: "8px",
            background: "#ffffff",
            borderRadius: "999px",
            top: "24px",
            left: "12px",
            transform: "rotate(-35deg)",
          })}
        />
      </div>

      <div style={px({ display: "flex", flexDirection: "column", lineHeight: 1 })}>
        <div
          style={px({
            fontSize: "36px",
            fontWeight: 300,
            letterSpacing: "-1px",
            color: light ? "#fff" : "#0A2668",
          })}
        >
          zviran
        </div>
        <div
          style={px({
            marginTop: "6px",
            fontSize: "12px",
            color: light ? "rgba(255,255,255,0.8)" : "#6B7A99",
            letterSpacing: "0.4px",
          })}
        >
          Total Rewards Experts
        </div>
      </div>
    </div>
  );
}

function DepositIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3V14"
        stroke="#FF2756"
        stroke-width="2.2"
        stroke-linecap="round"
      />
      <path
        d="M8.5 6.5L12 3L15.5 6.5"
        stroke="#FF2756"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <rect
        x="4"
        y="14"
        width="16"
        height="6"
        rx="2"
        stroke="#FF2756"
        stroke-width="2.2"
      />
    </svg>
  );
}

function GiftIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <rect
        x="4"
        y="7"
        width="16"
        height="13"
        rx="2"
        stroke="#00215D"
        stroke-width="2"
      />
      <path d="M12 7V20" stroke="#00215D" stroke-width="2" />
      <path d="M4 11H20" stroke="#00215D" stroke-width="2" />
      <path
        d="M9 7C7.8 7 7 6.2 7 5C7 3.8 7.8 3 9 3C10.8 3 12 5 12 7"
        stroke="#00215D"
        stroke-width="2"
      />
      <path
        d="M15 7C16.2 7 17 6.2 17 5C17 3.8 16.2 3 15 3C13.2 3 12 5 12 7"
        stroke="#00215D"
        stroke-width="2"
      />
    </svg>
  );
}

// KPI icons for the PDF summary boxes — single-tone (currentColor) so they read
// on navy / pink / outline backgrounds. Same shapes as the WEB KPI icons.
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


  // ---- Design tokens (Pension Report Redesign / Claude Design handoff) ----
  const NAVY = "#00215D";
  const PINK = "#FF2756";
  const TAN = "#DDE3EC";
  const OFFWHITE = "#FFFFFF";
  const DESK = "#F4F6F9";
  const MUTED = "#8892A3";
  const INK = "#1A1A1A";
  const DARKTAN = "#334155";
  const HAIR = "#EEF1F6";
  const HAIR2 = "#E4E9F0";
  // 10-color chart palette (handoff order).
  const PALETTE = [NAVY, PINK, TAN, "#C9BBA8", "#43B5D9", "#8F63C9", "#9CA3AF", "#3D5A8A", "#6B7280", "#F2A0B2"];
  const GRAD_NAVY = "linear-gradient(180deg,#0B3079,#00215D)";
  const GRAD_PINK = "linear-gradient(180deg,#FF4A70,#F0143F)";
  const GRAD_ROW = "linear-gradient(180deg,#FAFBFD,#F1F4F9)";
  const GRAD_TOTAL = "linear-gradient(180deg,#E7ECF4,#D3DBE7)";
  const CARD_SOFT = "0 2px 12px rgba(0,33,93,0.08)";
  const CARD_TABLE = "0 10px 24px rgba(0,33,93,0.12),0 2px 4px rgba(0,33,93,0.06)";
  const HEAD_SHADOW = "inset 0 1px 0 rgba(255,255,255,0.18),0 2px 6px rgba(0,33,93,0.35)";
  const HEAD_SHADOW_PINK = "inset 0 1px 0 rgba(255,255,255,0.22),0 2px 6px rgba(240,20,63,0.3)";

  const firmName = data.firmName || "מבט משפחתי";
  const watermark = data.watermark !== false;

  // Client name(s) for the cover title line — e.g. "משפחת לוי · דניאל ומיכל".
  const clientNames = members.map((m) => String(m.name || "").trim()).filter(Boolean);
  const clientFirstNames = clientNames.map((n) => n.split(/\s+/)[0]);
  const clientNamesJoined =
    clientFirstNames.length === 0 ? "" :
    clientFirstNames.length === 1 ? clientFirstNames[0] :
    `${clientFirstNames.slice(0, -1).join(", ")} ו${clientFirstNames.slice(-1)}`;
  const coverTitleLine = family.name
    ? `משפחת ${family.name}${clientNamesJoined ? ` · ${clientNamesJoined}` : ""}`
    : (clientNames.length ? clientNames.join(" · ") : "דוח משפחתי");

  const today = new Intl.DateTimeFormat("he-IL").format(new Date());
  const reportDate = family.lastUpdated || today;

  // dd.mm.yyyy formatter (handoff uses dotted dates with leading zeros).
  const fmtDateDots = (value) => {
    if (!value) return "—";
    const str = String(value).trim();
    const m8 = /^(\d{4})(\d{2})(\d{2})$/.exec(str);
    if (m8) return `${m8[3]}.${m8[2]}.${m8[1]}`;
    const mSep = /^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})$/.exec(str);
    if (mSep) return `${mSep[1].padStart(2, "0")}.${mSep[2].padStart(2, "0")}.${mSep[3]}`;
    const d = new Date(str);
    if (!Number.isNaN(d.getTime())) return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
    return str;
  };
  const fmtPct2 = (v) => `${Number(v || 0).toFixed(2)}%`;
  const fmtNum2 = (v) => `${Number(v || 0).toFixed(2)}`;
  const capMoney = (v) => `₪${Math.round(Number(v || 0)).toLocaleString("en-US")}`;

  const memberDetail = (member, key) =>
    member?.personalDetails?.[key] ?? member?.[key] ?? member?.details?.[key] ?? null;
  const combinedSalary = members.reduce((sum, m) => sum + Number(memberDetail(m, "currentSalary") || 0), 0);
  const totalLifeCoverage = members.reduce((sum, m) => sum + Number(m.deathCoverage || 0), 0);
  const productTotal = products.reduce((sum, p) => sum + Number(p.value || 0), 0);
  const show = (id) => !sections || sections.has(id);

  // ---------- Capital breakdown aggregates ----------
  const allCapitalPension = capitalClassificationEntries.flatMap((e) => normalizeCapitalReportArray(e.pensionPolicies));
  const allCapitalStudy = capitalClassificationEntries.flatMap((e) => normalizeCapitalReportArray(e.studyFunds));
  const allCapitalRows = [...allCapitalPension, ...allCapitalStudy];
  const capStudyBalance = allCapitalStudy.reduce((sum, r) => sum + getStudyFundBalance(r), 0);
  const capTotalBalance = summarizeCapitalRows(allCapitalRows, "totalBalance") || summarizeCapitalRows(allCapitalStudy, "redemptionValue");
  const capTotalRewards = summarizeCapitalRows(allCapitalPension, "totalRewards");
  const capTotalSeverance = summarizeCapitalRows(allCapitalPension, "totalSeverance");
  const capTotalCapital = summarizeCapitalDerivedRows(allCapitalPension, "totalCapital") + capStudyBalance;
  const capTotalPension = summarizeCapitalDerivedRows(allCapitalPension, "totalPension");

  // Capital table columns (grouped by product group, no per-policy rows).
  const capCols = [
    { key: "capitalRewards", label: "תגמולים הוניים" },
    { key: "annuityRewardsUntil2000", label: "תגמולים קצבתיים עד 1.1.2000" },
    { key: "previousEmployersSeveranceRightsSequence", label: "פיצויים קודמים ברצף" },
    { key: "currentEmployerSeveranceTaxable", label: "פיצויים מעסיק נוכחי" },
    { key: "totalPension", label: 'סה״כ קצבה' },
    { key: "totalCapital", label: 'סה״כ הון' },
    { key: "conversionCoefficient", label: "מקדם המרה לקצבה*", theoretical: true },
    { key: "expectedRetirementCost", label: "עלות צפויה לגיל פרישה*", theoretical: true },
  ];
  // Group capital pension rows by product group (falls back to plan name).
  const capGroupKey = (row) => row?.productGroup || row?.productType || row?.group || row?.groupLabel || row?.planName || "אחר";
  const capGroups = (() => {
    const m = new Map();
    allCapitalPension.forEach((r) => { const k = capGroupKey(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); });
    return Array.from(m.entries()).map(([label, rows]) => ({ label, rows }));
  })();

  // ---------- Section 28 helpers ----------
  const section28Meaningful = (rows) =>
    (Array.isArray(rows) ? rows : []).filter((row) => isMeaningfulSection28Value(row.value));

  const summaryParagraphs = String(printConversationSummary || "")
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  const recommendationItems = String(printActionRecommendations || "")
    .split(/\n+/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);

  // ---------- Weighted returns (grouped by product group) ----------
  const weightedReturns = (() => {
    const funds = (Array.isArray(productFunds) ? productFunds : [])
      .map((f) => ({
        productType: f.productType || "אחר", value: Number(f.value || 0),
        return12: Number(f.return12 || 0), return36: Number(f.return36 || 0), return60: Number(f.return60 || 0),
        st36: Number(f.st36 || 0), sharp36: Number(f.sharp36 || 0),
      }))
      .filter((f) => f.value > 0);
    const order = ["פנסיה מקיפה", "פנסיה חדשה מקיפה", "פנסיה כללית", "ביטוח מנהלים", "קרן השתלמות", "קופת גמל", "גמל להשקעה"];
    const map = new Map();
    funds.forEach((f) => { if (!map.has(f.productType)) map.set(f.productType, []); map.get(f.productType).push(f); });
    const wavg = (list, key) => { const tv = list.reduce((s, x) => s + x.value, 0) || 1; return list.reduce((s, x) => s + x.value * x[key], 0) / tv; };
    const groups = Array.from(map.entries()).map(([type, list]) => ({
      type, count: list.length, total: list.reduce((s, x) => s + x.value, 0),
      r12: wavg(list, "return12"), r36: wavg(list, "return36"), r60: wavg(list, "return60"), st: wavg(list, "st36"), sharp: wavg(list, "sharp36"),
    })).sort((a, b) => {
      const ai = order.findIndex((o) => a.type.includes(o));
      const bi = order.findIndex((o) => b.type.includes(o));
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || b.total - a.total;
    });
    const allTotal = funds.reduce((s, x) => s + x.value, 0);
    const tw = (key) => (allTotal ? funds.reduce((s, x) => s + x.value * x[key], 0) / allTotal : 0);
    return { groups, funds, allTotal, totals: { count: funds.length, r12: tw("return12"), r36: tw("return36"), r60: tw("return60"), st: tw("st36"), sharp: tw("sharp36") } };
  })();

  // ---------- Management fees (money cost) ----------
  const mf = managementFees || {};
  const feeCards = Array.isArray(mf.cards) ? mf.cards : [];
  const feeMoney = feeCards.filter((c) => !c.isTotal).map((c) => {
    const member = members.find((m) => (m.name || "") === c.name);
    const dep = Number(member ? (memberDetail(member, "monthlyDeposits") || member.monthlyDeposits || 0) : 0);
    const annual = Number(c.totalBalance || 0) * Number(c.feeFromBalance || 0) / 100 + dep * 12 * Number(c.feeFromDeposit || 0) / 100;
    return { name: c.name, annual };
  });
  const feeAnnualTotal = feeMoney.reduce((s, x) => s + x.annual, 0);
  const feeMonthlyTotal = feeAnnualTotal / 12;

  const totalLoansPct = family.totalAssets ? (totalLoansBalance / Number(family.totalAssets)) * 100 : 0;

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Assistant:wght@400;500;600;700;800&display=swap');
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

  const pageBase = {
    position: "relative",
    overflow: "hidden",
    background: OFFWHITE,
    color: INK,
    direction: "rtl",
    textAlign: "right",
    fontFamily: "'Assistant', 'Segoe UI', sans-serif",
    fontVariantNumeric: "tabular-nums",
    minHeight: 1122,
    padding: "44px 50px 32px",
    display: "flex",
    flexDirection: "column",
    boxSizing: "border-box",
  };

  const Watermark = ({ style }) =>
    watermark ? <div style={px({ position: "absolute", borderRadius: "50%", border: "1px solid rgba(0,33,93,0.07)", pointerEvents: "none", ...style })} /> : null;

  const ChapterHeader = ({ num, title, subtitle, right }) => (
    <div style={px({ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, paddingBottom: 12, borderBottom: `1px solid ${HAIR2}` })}>
      <div>
        <div style={px({ display: "flex", alignItems: "center", gap: 9, marginBottom: 7 })}>
          <span style={px({ width: 24, height: 24, borderRadius: 7, background: NAVY, color: "#fff", fontSize: 11.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", direction: "ltr" })}>{num}</span>
          <span style={px({ fontSize: 10.5, letterSpacing: ".2em", color: MUTED })}>פרק</span>
        </div>
        <div style={px({ fontSize: 31, fontWeight: 800, color: NAVY, lineHeight: 1.1 })}>{title}</div>
      </div>
      {right ? right : (subtitle ? <div style={px({ fontSize: 13, color: MUTED, paddingBottom: 5 })}>{subtitle}</div> : null)}
    </div>
  );

  const Lead = ({ text, mb = 22 }) => (
    <div style={px({ fontSize: 14, color: DARKTAN, lineHeight: 1.75, maxWidth: 760, margin: `18px 0 ${mb}px` })}>{text}</div>
  );

  const NoteLine = ({ text }) => (
    <div style={px({ marginTop: 14, fontSize: 11, color: MUTED, lineHeight: 1.6 })}>{text}</div>
  );

  const InfoStrip = ({ text }) => (
    <div class="rp-avoid" style={px({ background: "#fff", boxShadow: CARD_SOFT, borderRadius: 12, padding: "14px 18px", fontSize: 12.5, color: DARKTAN, lineHeight: 1.7, margin: "18px 0 20px" })}>{text}</div>
  );

  const Foot = ({ n, total }) => (
    <div style={px({ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 14, borderTop: `1px solid ${HAIR}`, fontSize: 10.5, color: MUTED })}>
      <span style={px({ whiteSpace: "nowrap", flexShrink: 0 })}>{firmName} · דוח פנסיוני משפחתי</span>
      <span style={px({ direction: "ltr", whiteSpace: "nowrap", flexShrink: 0 })}>{`${fmtDateDots(reportDate)} · ${String(n).padStart(2, "0")} / ${String(total).padStart(2, "0")}`}</span>
    </div>
  );

  const EmptyPanel = ({ title, subtitle }) => (
    <div class="rp-avoid" style={px({ background: DESK, borderRadius: 16, padding: 40, textAlign: "center", color: DARKTAN })}>
      <div style={px({ fontSize: 16, fontWeight: 600, color: NAVY })}>{title}</div>
      {subtitle ? <div style={px({ fontSize: 13, opacity: 0.75, marginTop: 6 })}>{subtitle}</div> : null}
    </div>
  );

  // SVG donut segments (r=44, gap 2.4 between segments).
  const donutSegments = (items) => {
    const clean = (Array.isArray(items) ? items : [])
      .map((it) => ({ name: it.name || "ללא שם", value: Number(it.value || 0) }))
      .filter((it) => it.value > 0)
      .sort((a, b) => b.value - a.value);
    const total = clean.reduce((s, x) => s + x.value, 0) || 1;
    const C = 2 * Math.PI * 44;
    const gap = 2.4;
    let startDeg = 0;
    return clean.map((it, i) => {
      const deg = (it.value / total) * 360;
      const len = Math.max((deg / 360) * C - gap, 0);
      const seg = {
        ...it, percent: (it.value / total) * 100, color: PALETTE[i % PALETTE.length],
        len: len.toFixed(2), rest: (C - len).toFixed(2), offset: (-(startDeg / 360) * C).toFixed(2),
      };
      startDeg += deg;
      return seg;
    });
  };

  const SvgDonut = ({ size, segments, centerTop, centerLabel }) => (
    <div style={px({ position: "relative", width: size, height: size, flexShrink: 0 })}>
      <svg width={size} height={size} viewBox="0 0 120 120" style={px({ transform: "rotate(-90deg)", display: "block" })}>
        <circle cx="60" cy="60" r="44" fill="none" stroke="#F1F4F9" stroke-width="15" />
        {segments.map((s, i) => (
          <circle key={i} cx="60" cy="60" r="44" fill="none" stroke={s.color} stroke-width="15" stroke-dasharray={`${s.len} ${s.rest}`} stroke-dashoffset={s.offset} stroke-linecap="butt" />
        ))}
      </svg>
      <div style={px({ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1 })}>
        <div style={px({ fontSize: 10, color: MUTED })}>{centerTop}</div>
        <div style={px({ fontSize: 14, fontWeight: 800, color: NAVY, textAlign: "center" })}>{centerLabel}</div>
      </div>
    </div>
  );

  const DonutCard = ({ centerTop, centerLabel, items, size = 168, note, twoCol, mb = 14 }) => {
    const segs = donutSegments(items);
    return (
      <div class="rp-avoid" style={px({ display: "grid", gridTemplateColumns: `${size + 22}px minmax(0,1fr)`, gap: 26, alignItems: "center", background: "#fff", boxShadow: CARD_SOFT, borderRadius: 16, padding: "20px 24px", marginBottom: mb })}>
        <div style={px({ display: "flex", justifyContent: "flex-start" })}>
          <SvgDonut size={size} segments={segs} centerTop={centerTop} centerLabel={centerLabel} />
        </div>
        {twoCol ? (
          <div style={px({ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: "8px 20px" })}>
            {segs.map((s, i) => (
              <div key={i} style={px({ display: "flex", alignItems: "flex-start", gap: 8, minWidth: 0 })}>
                <span style={px({ width: 11, height: 11, borderRadius: 3, background: s.color, flexShrink: 0, marginTop: 3 })} />
                <span style={px({ flex: 1, minWidth: 0, fontSize: 11.5, lineHeight: 1.3 })} title={s.name}>{s.name}</span>
                <strong style={px({ fontSize: 11.5, direction: "ltr", color: NAVY, flexShrink: 0 })}>{fmtCurrency(s.value)}</strong>
                <span style={px({ width: 42, textAlign: "left", direction: "ltr", fontSize: 11, color: MUTED, flexShrink: 0 })}>{s.percent.toFixed(1)}%</span>
              </div>
            ))}
            {note ? <div style={px({ gridColumn: "span 2", fontSize: 10.5, color: MUTED, marginTop: 2 })}>{note}</div> : null}
          </div>
        ) : (
          <div style={px({ display: "flex", flexDirection: "column", gap: 9 })}>
            {segs.length ? segs.map((s, i) => (
              <div key={i} style={px({ display: "flex", alignItems: "center", gap: 10, minWidth: 0 })}>
                <span style={px({ width: 12, height: 12, borderRadius: 4, background: s.color, flexShrink: 0 })} />
                <span style={px({ flex: 1, minWidth: 0, fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" })} title={s.name}>{s.name}</span>
                <strong style={px({ fontSize: 13.5, direction: "ltr", color: NAVY })}>{fmtCurrency(s.value)}</strong>
                <span style={px({ width: 52, textAlign: "left", direction: "ltr", fontSize: 13, color: MUTED })}>{s.percent.toFixed(1)}%</span>
              </div>
            )) : <div style={px({ fontSize: 13.5, color: MUTED })}>אין נתונים להצגה</div>}
            {note ? <div style={px({ fontSize: 10.5, color: MUTED, marginTop: 2 })}>{note}</div> : null}
          </div>
        )}
      </div>
    );
  };

  const KpiTile = ({ label, value, tone }) => {
    const map = {
      navy: { bg: NAVY, color: "#fff", lc: "rgba(255,255,255,0.72)" },
      pink: { bg: PINK, color: "#fff", lc: "rgba(255,255,255,0.85)" },
      soft: { bg: DESK, color: NAVY, lc: MUTED },
    }[tone || "soft"];
    return (
      <div class="rp-avoid" style={px({ background: map.bg, color: map.color, borderRadius: 16, padding: 20 })}>
        <div style={px({ fontSize: 11.5, color: map.lc })}>{label}</div>
        <div style={px({ fontSize: 24, fontWeight: 800, marginTop: 8, direction: "ltr", textAlign: "right" })}>{value}</div>
      </div>
    );
  };

  const CompareCard = ({ title, sub, withV, withoutV }) => {
    const a = Number(withV || 0), b = Number(withoutV || 0);
    const max = Math.max(a, b, 1);
    return (
      <div class="rp-avoid" style={px({ background: "#fff", boxShadow: CARD_SOFT, borderRadius: 16, padding: 24 })}>
        <div style={px({ fontSize: 16, fontWeight: 700, color: NAVY })}>{title}</div>
        <div style={px({ fontSize: 12.5, color: MUTED, margin: "5px 0 18px" })}>{sub}</div>
        <div style={px({ display: "flex", flexDirection: "column", gap: 14 })}>
          {[{ l: "עם המשך הפקדות", v: a, c: NAVY }, { l: "ללא המשך הפקדות", v: b, c: PINK }].map((r, i) => (
            <div key={i}>
              <div style={px({ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 })}><span>{r.l}</span><strong style={px({ direction: "ltr" })}>{fmtCurrency(r.v)}</strong></div>
              <div style={px({ background: DESK, borderRadius: 8, height: 16, overflow: "hidden" })}><div style={px({ width: `${Math.max((r.v / max) * 100, r.v ? 4 : 0)}%`, height: "100%", background: r.c, borderRadius: 8 })} /></div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const GaugeCard = ({ title, sub, value, dark }) => {
    const v = Math.max(Math.min(Number(value || 0), 100), 0);
    return (
      <div class="rp-avoid" style={px({ background: dark ? NAVY : TAN, color: dark ? "#fff" : DARKTAN, borderRadius: 16, padding: 24 })}>
        <div style={px({ fontSize: 15, fontWeight: 700 })}>{title}</div>
        <div style={px({ fontSize: 12.5, opacity: dark ? 0.72 : 0.75, marginBottom: 14 })}>{sub}</div>
        <div style={px({ fontSize: 36, fontWeight: 800, color: dark ? "#fff" : NAVY, direction: "ltr", textAlign: "right", marginBottom: 10 })}>{`${Math.round(v)}%`}</div>
        <div style={px({ background: dark ? "rgba(255,255,255,0.16)" : "rgba(0,33,93,0.12)", borderRadius: 8, height: 14, overflow: "hidden", display: "flex" })}><div style={px({ width: `${v}%`, height: "100%", background: dark ? PINK : NAVY, borderRadius: 8 })} /></div>
        <div style={px({ display: "flex", justifyContent: "space-between", fontSize: 10.5, opacity: 0.65, marginTop: 6 })}><span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div>
      </div>
    );
  };

  // Shared table cell styles.
  const hc = { padding: "11px 12px", textAlign: "right", fontWeight: 700 };
  const bc = { padding: "11px 12px", borderBottom: `1px solid ${HAIR}`, textAlign: "right" };
  const nc = { ...bc, direction: "ltr", textAlign: "right" };
  const headRow = { background: GRAD_NAVY, color: "#fff", boxShadow: HEAD_SHADOW };
  const headRowPink = { background: GRAD_PINK, color: "#fff", boxShadow: HEAD_SHADOW_PINK };
  const tableWrap = { width: "100%", borderCollapse: "collapse", borderRadius: 14, overflow: "hidden", boxShadow: CARD_TABLE };

  // ============================================================
  // Build the ordered list of pages (cover first, footers numbered).
  // ============================================================
  const pages = [];

  // ---- COVER ----
  pages.push(() => (
    <section class="rp-section" key="cover" style={px({ ...pageBase, padding: 0 })}>
      <div style={px({ height: 8, background: NAVY })} />
      <Watermark style={{ top: -180, left: -200, width: 520, height: 520, border: "1px solid rgba(0,33,93,0.08)" }} />
      <div style={px({ padding: "52px 54px 30px", display: "flex", flexDirection: "column", flex: 1 })}>
        <div style={px({ display: "flex", alignItems: "center", justifyContent: "space-between" })}>
          <div style={px({ display: "flex", alignItems: "center", gap: 10 })}>
            <span style={px({ width: 9, height: 9, borderRadius: "50%", background: PINK })} />
            <span style={px({ fontSize: 12.5, letterSpacing: ".18em", color: MUTED })}>מבט משפחתי · דוח פנסיוני</span>
          </div>
          <span style={px({ fontSize: 12.5, color: MUTED, direction: "ltr" })}>{fmtDateDots(reportDate)}</span>
        </div>

        <div style={px({ marginTop: 44, fontSize: 15, letterSpacing: ".22em", color: PINK, fontWeight: 700 })}>FAMILY WEALTH REVIEW</div>
        <h1 style={px({ margin: "10px 0 0", fontSize: 54, lineHeight: 1.06, fontWeight: 800, color: NAVY, maxWidth: 640 })}>דוח פנסיוני<br />משפחתי מאוחד</h1>
        <div style={px({ marginTop: 16, display: "flex", alignItems: "center", gap: 12 })}>
          <span style={px({ width: 30, height: 2, background: PINK })} />
          <span style={px({ fontSize: 20, fontWeight: 700, color: NAVY })}>{coverTitleLine}</span>
        </div>
        <div style={px({ marginTop: 14, fontSize: 16.5, lineHeight: 1.75, color: DARKTAN, maxWidth: 520 })}>תמונה מלאה של העתיד שלכם — פנסיה, ביטוח, השקעות ותכנון עתידי, מרוכזים במסמך אחד ברור.</div>

        <div style={px({ marginTop: 40, display: "grid", gridTemplateColumns: "250px 1fr", gap: 34, alignItems: "center" })}>
          <div style={px({ display: "flex", alignItems: "center", gap: 18 })}>
            <div style={px({ position: "relative", width: 150, height: 150, flexShrink: 0 })}>
              <svg width="150" height="150" viewBox="0 0 120 120" style={px({ transform: "rotate(-90deg)", display: "block" })}>
                <circle cx="60" cy="60" r="44" fill="none" stroke="#F1F4F9" stroke-width="15" />
                <circle cx="60" cy="60" r="44" fill="none" stroke="#00215D" stroke-width="15" stroke-dasharray="118.94 157.52" stroke-dashoffset="0" stroke-linecap="butt" />
                <circle cx="60" cy="60" r="44" fill="none" stroke="#FF2756" stroke-width="15" stroke-dasharray="47.52 228.94" stroke-dashoffset="-121.34" stroke-linecap="butt" />
                <circle cx="60" cy="60" r="44" fill="none" stroke="#DDE3EC" stroke-width="15" stroke-dasharray="42.14 234.32" stroke-dashoffset="-171.25" stroke-linecap="butt" />
                <circle cx="60" cy="60" r="44" fill="none" stroke="#C9BBA8" stroke-width="15" stroke-dasharray="30.62 245.84" stroke-dashoffset="-215.79" stroke-linecap="butt" />
                <circle cx="60" cy="60" r="44" fill="none" stroke="#9CA3AF" stroke-width="15" stroke-dasharray="25.25 251.21" stroke-dashoffset="-248.81" stroke-linecap="butt" />
              </svg>
              <div style={px({ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1 })}>
                <div style={px({ fontSize: 10, color: MUTED })}>אפיקים</div>
                <div style={px({ fontSize: 15, fontWeight: 800, color: NAVY })}>5</div>
              </div>
            </div>
            <div style={px({ display: "flex", flexDirection: "column", gap: 7 })}>
              {[["פנסיה", NAVY], ["ביטוחים", PINK], ["נכסים פיננסיים", "#DDE3EC"], ["נדל״ן", "#C9BBA8"], ["אחר", "#9CA3AF"]].map(([lbl, c]) => (
                <div key={lbl} style={px({ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#243B53" })}>
                  <span style={px({ width: 10, height: 10, borderRadius: 3, background: c })} />{lbl}
                </div>
              ))}
            </div>
          </div>
          <div>
            <div style={px({ fontSize: 11.5, color: MUTED, marginBottom: 6 })}>צמיחת הצבירה לאורך זמן</div>
            <svg viewBox="0 0 420 130" width="100%" height="130" preserveAspectRatio="none">
              <defs><linearGradient id="rpGrow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color={NAVY} stop-opacity="0.16" /><stop offset="1" stop-color={NAVY} stop-opacity="0" /></linearGradient></defs>
              <g fill={TAN}>
                <rect x="24" y="112" width="16" height="16" rx="3" /><rect x="84" y="104" width="16" height="24" rx="3" /><rect x="144" y="96" width="16" height="32" rx="3" /><rect x="204" y="84" width="16" height="44" rx="3" /><rect x="264" y="70" width="16" height="58" rx="3" /><rect x="324" y="54" width="16" height="74" rx="3" /><rect x="384" y="34" width="16" height="94" rx="3" />
              </g>
              <polygon points="0,110 60,96 120,102 180,72 240,80 300,48 360,40 420,14 420,130 0,130" fill="url(#rpGrow)" />
              <polyline points="0,110 60,96 120,102 180,72 240,80 300,48 360,40 420,14" fill="none" stroke={NAVY} stroke-width="3" stroke-linejoin="round" stroke-linecap="round" />
              <circle cx="418" cy="14" r="5" fill={PINK} />
            </svg>
          </div>
        </div>

        <div style={px({ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderTop: `1px solid ${HAIR}`, paddingTop: 20 })}>
          <div style={px({ display: "flex", gap: 44 })}>
            <div>
              <div style={px({ fontSize: 11.5, color: MUTED })}>תאריך הפקה</div>
              <div style={px({ fontSize: 18, fontWeight: 700, marginTop: 3, direction: "ltr", textAlign: "right" })}>{fmtDateDots(reportDate)}</div>
            </div>
            <div>
              <div style={px({ fontSize: 11.5, color: MUTED })}>נכונות הנתונים</div>
              <div style={px({ fontSize: 18, fontWeight: 700, marginTop: 3, direction: "ltr", textAlign: "right" })}>{fmtDateDots(family.dataValidityDate)}</div>
            </div>
          </div>
          <div style={px({ display: "flex", alignItems: "center", gap: 14 })}>
            {data?.clientLogo ? <img src={data.clientLogo} alt="לוגו" style={px({ maxHeight: 34, maxWidth: 120, objectFit: "contain" })} /> : null}
            <div style={px({ fontSize: 13, fontWeight: 700, color: NAVY })}>{firmName}</div>
          </div>
        </div>
      </div>
    </section>
  ));

  // ---- 01 · פרטים אישיים ----
  if (show("personal")) {
    pages.push((n, total) => (
      <section class="rp-section" key="personal" style={px(pageBase)}>
        <Watermark style={{ bottom: -200, left: -180, width: 460, height: 460 }} />
        <ChapterHeader num="01" title="פרטים אישיים" subtitle="בני המשפחה המבוטחים בדוח" />
        <Lead mb={24} text="כדי לתת לכם תמונה מלאה ופשוטה של העתיד הפיננסי המשפחתי, ריכזנו את כל הנכסים והחיסכונות שלכם במקום אחד. כאן תוכלו לראות את סך הצבירה המעודכנת שנצברה עד כה, לצד חלוקת הכספים בין האפיקים והגופים השונים." />

        <div style={px({ display: "grid", gridTemplateColumns: members.length > 1 ? "1fr 1fr" : "1fr", gap: 22 })}>
          {(members.length ? members : [{ name: "—" }]).slice(0, 4).map((member, i) => {
            const brand = i % 2 === 0 ? NAVY : PINK;
            const name = member.name || "—";
            const role = i === 0 ? "מבוטח ראשי" : "בן/בת זוג";
            const retireAge = memberDetail(member, "retireAge");
            return (
              <div class="rp-avoid" key={member.id || name || i} style={px({ background: "#fff", borderTop: `4px solid ${brand}`, borderRadius: 18, boxShadow: CARD_SOFT, padding: 28 })}>
                <div style={px({ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 })}>
                  <div style={px({ width: 50, height: 50, borderRadius: "50%", background: DESK, color: brand, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 21, fontWeight: 800 })}>{String(name).trim().slice(0, 1) || "?"}</div>
                  <div>
                    <div style={px({ fontSize: 23, fontWeight: 800, color: NAVY })}>{name}</div>
                    <div style={px({ fontSize: 12.5, color: MUTED, marginTop: 1 })}>{role}{retireAge ? ` · פרישה בגיל ${retireAge}` : ""}</div>
                  </div>
                </div>
                <div style={px({ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 })}>
                  <div><div style={px({ fontSize: 11.5, color: MUTED })}>תאריך לידה</div><div style={px({ fontSize: 17, fontWeight: 700, marginTop: 3, direction: "ltr", textAlign: "right", color: INK })}>{fmtDate(memberDetail(member, "birthDate"))}</div></div>
                  <div><div style={px({ fontSize: 11.5, color: MUTED })}>שכר נוכחי</div><div style={px({ fontSize: 17, fontWeight: 700, marginTop: 3, direction: "ltr", textAlign: "right", color: INK })}>{memberDetail(member, "currentSalary") ? fmtCurrency(memberDetail(member, "currentSalary")) : "—"}</div></div>
                  <div style={px({ gridColumn: "span 2", borderTop: `1px solid ${HAIR}`, paddingTop: 12 })}><div style={px({ fontSize: 11.5, color: MUTED })}>מקום עבודה אחרון מעודכן</div><div style={px({ fontSize: 15.5, fontWeight: 600, marginTop: 3, color: DARKTAN })}>{memberDetail(member, "lastWorkplace") || "לא צוין"}</div></div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={px({ marginTop: 22, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 1, background: "#EDF1F6", borderRadius: 16, overflow: "hidden", boxShadow: CARD_SOFT })}>
          {[["שכר מצרפי", combinedSalary], ["הפקדה חודשית כוללת", family.monthlyDeposits], ["סך כיסויי חיים", totalLifeCoverage]].map(([lbl, val], i) => (
            <div key={i} style={px({ background: "#fff", padding: "20px 22px" })}>
              <div style={px({ fontSize: 11.5, color: MUTED })}>{lbl}</div>
              <div style={px({ fontSize: 26, fontWeight: 800, color: NAVY, direction: "ltr", textAlign: "right", marginTop: 4 })}>{val ? fmtCurrency(val) : "—"}</div>
            </div>
          ))}
        </div>

        <div style={px({ marginTop: 20, background: DESK, borderRadius: 16, padding: "20px 24px", fontSize: 13.5, color: DARKTAN, lineHeight: 1.7 })}>סך השכר המצרפי המדווח למשפחה מהווה בסיס לחישובי ההפקדות והקצבאות המוצגים בהמשך הדוח.</div>

        <Foot n={n} total={total} />
      </section>
    ));
  }

  // ---- 02 · סיכום פנסיוני ----
  if (show("pension")) {
    pages.push((n, total) => (
      <section class="rp-section" key="pension" style={px(pageBase)}>
        <ChapterHeader num="02" title="סיכום פנסיוני" subtitle="ריכוז צבירה, הפקדות ותחזית לגיל פרישה" />
        <Lead text="הנה הצצה לאיך שהעתיד שלכם עשוי להיראות ביום הפרישה. החישוב מציג את הצבירה והקצבה החודשית הצפויה לכם, תוך השוואה בין המשך הפקדות שוטפות לבין מצב שבו נעצרות ההפקדות." />
        <div style={px({ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 })}>
          <KpiTile tone="navy" label="סך נכסים" value={fmtCurrency(family.totalAssets)} />
          <KpiTile tone="soft" label="הפקדה חודשית כוללת" value={fmtCurrency(family.monthlyDeposits)} />
          <KpiTile tone="soft" label="צבירה צפויה לפרישה" value={fmtCurrency(family.projectedLumpSumWithDeposits)} />
          <KpiTile tone="pink" label="קצבה חודשית צפויה" value={fmtCurrency(family.monthlyPensionWithDeposits)} />
        </div>
        <div style={px({ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 20 })}>
          <CompareCard title="השוואת צבירה צפויה" sub="עם המשך הפקדות מול הפסקתן" withV={family.projectedLumpSumWithDeposits} withoutV={family.projectedLumpSumWithoutDeposits} />
          <CompareCard title="השוואת קצבה חודשית צפויה" sub="עם המשך הפקדות מול הפסקתן" withV={family.monthlyPensionWithDeposits} withoutV={family.monthlyPensionWithoutDeposits} />
        </div>
        <div style={px({ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 20 })}>
          <GaugeCard dark title="חשיפה מנייתית משוקללת" sub="שיעור החשיפה למניות בתיק" value={data.weightedEquityExposure} />
          <GaugeCard title="חשיפה לחו״ל" sub="שיעור האחזקה בחו״ל" value={data.weightedForeignExposure} />
        </div>
        <Foot n={n} total={total} />
      </section>
    ));
  }

  // ---- 03 · התפלגות נכסים ----
  if (show("allocation")) {
    pages.push((n, total) => (
      <section class="rp-section" key="allocation" style={px(pageBase)}>
        <Watermark style={{ top: -190, left: -190, width: 480, height: 480 }} />
        <ChapterHeader num="03" title="התפלגות נכסים" right={
          <div style={px({ textAlign: "left" })}>
            <div style={px({ fontSize: 11.5, color: MUTED, fontWeight: 700 })}>סך צבירה מנוהלת</div>
            <div style={px({ fontSize: 28, fontWeight: 800, color: NAVY, direction: "ltr" })}>{fmtCurrency(family.totalAssets)}</div>
          </div>
        } />
        <Lead mb={18} text="הכספים שלכם מושקעים במסלולים שונים כדי לייצר תשואה ולשמור על ערך הכסף לאורך זמן. כאן תוכלו לראות איפה הכסף מושקע — כמה ממנו נחשף למניות, כמה מושקע בחו״ל ואיך הוא מתפזר בין האפיקים." />
        <DonutCard centerTop="חלוקה לפי" centerLabel="מוצרים" items={products} />
        <DonutCard centerTop="חלוקה לפי" centerLabel="גופים מנהלים" items={managers} />
        <DonutCard centerTop="חלוקה לפי" centerLabel="אפיקים ראשיים" items={mainGroups} twoCol mb={0} note='ראו פירוט מלא בפרק ״פירוק נכסים״.' />
        <Foot n={n} total={total} />
      </section>
    ));
  }

  // ---- 04 · תשואה משוקללת ----
  if (show("allocation")) {
    pages.push((n, total) => (
      <section class="rp-section" key="weighted" style={px(pageBase)}>
        <ChapterHeader num="04" title="תשואה משוקללת" subtitle="תשואות ומדדי סיכון · ברמת קבוצת מוצר" />
        <Lead mb={20} text="התשואות ומדדי הסיכון מוצגים ברמת קבוצת מוצר, משוקללים לפי הצבירה בכל קבוצה — כדי לאפשר מבט ניהולי על התיק, ללא פירוט לפי פוליסה." />
        {weightedReturns.groups.length ? (
          <>
            <table style={px({ ...tableWrap, fontSize: 12.5 })}>
              <thead>
                <tr style={px(headRow)}>
                  {["קבוצת מוצר", "מס׳ מוצרים", "סך צבירה", "תשואה משוקללת 12ח׳", "תשואה משוקללת 36ח׳", "תשואה משוקללת 60ח׳", "ס״ת 36ח׳", "שארפ משוקלל 36ח׳"].map((h, i) => (
                    <th key={i} style={px(hc)}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weightedReturns.groups.map((g, i) => (
                  <tr key={i} style={px({ background: i % 2 === 0 ? "#fff" : GRAD_ROW })}>
                    <td style={px({ ...bc, fontWeight: 700, color: NAVY })}>{g.type}</td>
                    <td style={px(nc)}>{g.count}</td>
                    <td style={px(nc)}>{fmtCurrency(g.total)}</td>
                    <td style={px(nc)}>{fmtPct2(g.r12)}</td>
                    <td style={px(nc)}>{fmtPct2(g.r36)}</td>
                    <td style={px(nc)}>{fmtPct2(g.r60)}</td>
                    <td style={px(nc)}>{fmtPct2(g.st)}</td>
                    <td style={px(nc)}>{fmtNum2(g.sharp)}</td>
                  </tr>
                ))}
                <tr style={px({ background: GRAD_NAVY, color: "#fff", fontWeight: 800, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.16)" })}>
                  <td style={px({ padding: 12 })}>סה״כ / משוקלל</td>
                  <td style={px({ padding: 12, direction: "ltr", textAlign: "right" })}>{weightedReturns.totals.count}</td>
                  <td style={px({ padding: 12, direction: "ltr", textAlign: "right" })}>{fmtCurrency(weightedReturns.allTotal)}</td>
                  <td style={px({ padding: 12, direction: "ltr", textAlign: "right" })}>{fmtPct2(weightedReturns.totals.r12)}</td>
                  <td style={px({ padding: 12, direction: "ltr", textAlign: "right" })}>{fmtPct2(weightedReturns.totals.r36)}</td>
                  <td style={px({ padding: 12, direction: "ltr", textAlign: "right" })}>{fmtPct2(weightedReturns.totals.r60)}</td>
                  <td style={px({ padding: 12, direction: "ltr", textAlign: "right" })}>{fmtPct2(weightedReturns.totals.st)}</td>
                  <td style={px({ padding: 12, direction: "ltr", textAlign: "right" })}>{fmtNum2(weightedReturns.totals.sharp)}</td>
                </tr>
              </tbody>
            </table>
            <NoteLine text="התשואות והשארפ מוצגים כערך משוקלל לפי צבירה בכל קבוצה. מדדי הסיכון (סטיית תקן, שארפ) מחושבים ל-36 חודשים אחרונים ואינם מהווים הבטחת תשואה עתידית." />
          </>
        ) : (
          <EmptyPanel title="לא התקבלו נתוני תשואה להצגה" subtitle="ככל שיועברו נתוני מוצרים, תוצג כאן תשואה משוקללת ברמת קבוצת מוצר." />
        )}
        <Foot n={n} total={total} />
      </section>
    ));
  }

  // ---- 05 · דמי ניהול ----
  if (show("managementFees") && feeCards.length) {
    pages.push((n, total) => (
      <section class="rp-section" key="fees" style={px(pageBase)}>
        <Watermark style={{ bottom: -210, left: -200, width: 500, height: 500 }} />
        <ChapterHeader num="05" title="דמי ניהול" subtitle="שיעורים משוקללים לפי צבירה · עלות בכסף" />
        <Lead mb={20} text="כדי לשמור על שקיפות מלאה, ריכזנו את סך העלויות הנלוות לניהול התיק — דמי הניהול הנגבים מההפקדה השוטפת ומהצבירה המצטברת, בשיעורים ובכסף — ברמת בן משפחה וברמה המשפחתית." />
        <div style={px({ display: "grid", gridTemplateColumns: `repeat(${Math.min(feeCards.length, 3)},1fr)`, gap: 14 })}>
          {feeCards.map((c, i) => (
            <div class="rp-avoid" key={i} style={px({ background: c.isTotal ? NAVY : "#fff", color: c.isTotal ? "#fff" : INK, boxShadow: c.isTotal ? "none" : CARD_SOFT, borderRadius: 16, padding: "18px 20px" })}>
              <div style={px({ fontSize: 14, fontWeight: 800, color: c.isTotal ? "#fff" : NAVY })}>{c.name}</div>
              <div style={px({ fontSize: 11, color: c.isTotal ? "rgba(255,255,255,0.75)" : MUTED, margin: "2px 0 12px" })}>סך צבירה {fmtCurrency(c.totalBalance)}</div>
              <div style={px({ fontSize: 11, color: c.isTotal ? "rgba(255,255,255,0.75)" : MUTED })}>דמי ניהול מצבירה (משוקלל)</div>
              <div style={px({ fontSize: 26, fontWeight: 800, color: c.isTotal ? "#fff" : NAVY, direction: "ltr", textAlign: "right" })}>{fmtPct2(c.feeFromBalance)}</div>
              <div style={px({ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${c.isTotal ? "rgba(255,255,255,0.22)" : HAIR}`, marginTop: 10, paddingTop: 8 })}>
                <span style={px({ fontSize: 11, color: c.isTotal ? "rgba(255,255,255,0.75)" : MUTED })}>דמי ניהול מהפקדה</span>
                <strong style={px({ fontSize: 13, direction: "ltr", color: c.isTotal ? "#fff" : PINK })}>{fmtPct2(c.feeFromDeposit)}</strong>
              </div>
            </div>
          ))}
        </div>

        {feeMoney.length ? (
          <>
            <div style={px({ fontSize: 16, fontWeight: 700, color: NAVY, margin: "26px 0 12px" })}>עלות דמי הניהול בכסף</div>
            <div style={px({ display: "grid", gridTemplateColumns: `repeat(${Math.min(feeMoney.length, 2)},1fr)`, gap: 14 })}>
              {feeMoney.map((m, i) => (
                <div class="rp-avoid" key={i} style={px({ background: "#fff", boxShadow: CARD_SOFT, borderRadius: 16, padding: "20px 22px" })}>
                  <div style={px({ fontSize: 12.5, color: MUTED })}>{m.name} · עלות שנתית</div>
                  <div style={px({ fontSize: 24, fontWeight: 800, color: NAVY, direction: "ltr", textAlign: "right", marginTop: 5 })}>{capMoney(m.annual)}</div>
                </div>
              ))}
            </div>
            <div class="rp-avoid" style={px({ marginTop: 14, background: NAVY, color: "#fff", borderRadius: 18, padding: "24px 26px", display: "flex", justifyContent: "space-between", alignItems: "center" })}>
              <div>
                <div style={px({ fontSize: 15, fontWeight: 800 })}>עלות משפחתית כוללת</div>
                <div style={px({ fontSize: 12, opacity: 0.75, marginTop: 3 })}>סך דמי הניהול המשולמים בשנה על ידי המשפחה</div>
              </div>
              <div style={px({ textAlign: "left" })}>
                <div style={px({ fontSize: 32, fontWeight: 800, direction: "ltr" })}>{capMoney(feeAnnualTotal)}</div>
                <div style={px({ fontSize: 11.5, opacity: 0.75, direction: "ltr", textAlign: "left" })}>{`${capMoney(feeMonthlyTotal)} לחודש`}</div>
              </div>
            </div>
            <NoteLine text="העלות בכסף מחושבת לפי דמי הניהול המשוקללים והצבירה/ההפקדה הנוכחיות, בהנחה של המשך המצב הקיים לאורך שנה." />
          </>
        ) : null}
        <Foot n={n} total={total} />
      </section>
    ));
  }

  // ---- 06 · סכומים למקרה פטירה ----
  if (show("insurance")) {
    const sumDeath = members.reduce((s, m) => s + Number(m.deathCoverage || 0), 0);
    const sumDisab = members.reduce((s, m) => s + Number(m.disabilityValue || 0), 0);
    pages.push((n, total) => (
      <section class="rp-section" key="insurance" style={px(pageBase)}>
        <ChapterHeader num="06" title="סכומים למקרה פטירה" subtitle="ביטוח חיים, הון למוטבים וקצבת שאירים" />
        <Lead mb={18} text="לצד החיסכון לעתיד, חשוב לוודא שהמשפחה מוגנת גם במקרים בלתי צפויים. חלק זה מפרט את ההגנה הכלכלית הקיימת לכם היום במקרה של אובדן כושר עבודה או פטירה, ואת רשת הביטחון המשפחתית." />
        <InfoStrip text="הנתונים מציינים את הסכום למקרה פטירה המתקבל בתצורה הונית (סכום חד-פעמי למוטבים), וכן קצבה חודשית לשאירים בכל מקרה שקיימת קרן פנסיה." />
        <div style={px({ fontSize: 16, fontWeight: 700, color: NAVY, marginBottom: 10 })}>כיסויים לפי בן משפחה</div>
        {members.length ? (
          <table style={px({ ...tableWrap, fontSize: 13 })}>
            <thead>
              <tr style={px(headRow)}>
                <th style={px({ ...hc, fontWeight: 700 })}>בן משפחה</th>
                <th style={px({ ...hc, fontWeight: 700 })}>הון למוטבים / פטירה</th>
                <th style={px({ ...hc, fontWeight: 700 })}>אובדן כושר עבודה</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member, i) => (
                <tr key={member.id || member.name || i} style={px({ background: i % 2 === 0 ? "#fff" : GRAD_ROW })}>
                  <td style={px(bc)}>{member.name || "—"}</td>
                  <td style={px(nc)}>{fmtCurrency(member.deathCoverage)}</td>
                  <td style={px(nc)}>{`${fmtCurrency(member.disabilityValue)} (${Math.round(Number(member.disabilityPercent || 0))}%)`}</td>
                </tr>
              ))}
              <tr style={px({ background: GRAD_TOTAL, color: NAVY, fontWeight: 800 })}>
                <td style={px({ padding: "10px 12px" })}>סה״כ</td>
                <td style={px({ padding: "10px 12px", direction: "ltr", textAlign: "right" })}>{fmtCurrency(sumDeath)}</td>
                <td style={px({ padding: "10px 12px", direction: "ltr", textAlign: "right" })}>{fmtCurrency(sumDisab)}</td>
              </tr>
            </tbody>
          </table>
        ) : <EmptyPanel title="לא התקבלו נתוני כיסויים להצגה" />}
        <div style={px({ marginTop: 24, fontSize: 16, fontWeight: 700, color: NAVY, marginBottom: 10 })}>סכום פיצוי חודשי מקרן הפנסיה</div>
        {Array.isArray(deathBenefit?.pensionRows) && deathBenefit.pensionRows.length ? (
          <>
            <table style={px({ ...tableWrap, fontSize: 12.5 })}>
              <thead>
                <tr style={px(headRowPink)}>
                  {["בן משפחה", "שם מוצר", "סטטוס", "סכום לאלמנה", "סכום ליתום", "סך קצבה"].map((h, i) => <th key={i} style={px({ padding: "10px 12px", textAlign: "right" })}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {deathBenefit.pensionRows.map((row, i) => (
                  <tr key={row.id || i} style={px({ background: i % 2 === 0 ? "#fff" : GRAD_ROW })}>
                    <td style={px(bc)}>{row.memberName || "—"}</td>
                    <td style={px(bc)}>{row.planName || "—"}</td>
                    <td style={px({ ...bc, fontWeight: 700, color: row.active ? NAVY : MUTED })}>{row.active ? "פעילה" : "לא פעילה"}</td>
                    <td style={px(nc)}>{fmtCurrency(row.widowPension)}</td>
                    <td style={px(nc)}>{fmtCurrency(row.orphanPension)}</td>
                    <td style={px({ ...nc, fontWeight: 700 })}>{fmtCurrency(row.totalPension)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <NoteLine text="סך הקצבה החודשית לאלמנה וליתומים אינה יכולה לעלות על השכר המבוטח; הפיצוי לכל יתום משולם עד גיל 21." />
          </>
        ) : <EmptyPanel title="אין נתוני פיצוי חודשי מקרן פנסיה להצגה" />}
        <Foot n={n} total={total} />
      </section>
    ));
  }

  // ---- 07 · הלוואות ----
  if (show("loans")) {
    pages.push((n, total) => (
      <section class="rp-section" key="loans" style={px(pageBase)}>
        <Watermark style={{ top: -170, left: -190, width: 460, height: 460 }} />
        <ChapterHeader num="07" title="הלוואות" subtitle="הלוואות על חשבון מוצרים פנסיוניים" />
        <Lead mb={20} text="הלוואות הנלקחות כנגד החיסכון הפנסיוני מקטינות את הצבירה הצפויה בפרישה כל עוד אינן נפרעות. להלן מצב ההלוואות הקיימות ויתרתן." />
        <div style={px({ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 24 })}>
          <div style={px({ background: "#fff", boxShadow: "0 3px 16px rgba(0,33,93,0.12)", borderRadius: 16, padding: 20 })}><div style={px({ fontSize: 11.5, color: MUTED })}>סה״כ הלוואות שנלקחו</div><div style={px({ fontSize: 24, fontWeight: 800, color: NAVY, direction: "ltr", textAlign: "right", marginTop: 6 })}>{fmtCurrency(totalLoansAmount)}</div></div>
          <div style={px({ background: "#fff", boxShadow: "0 3px 16px rgba(0,33,93,0.12)", borderRadius: 16, padding: 20 })}><div style={px({ fontSize: 11.5, color: MUTED })}>יתרת הלוואות</div><div style={px({ fontSize: 24, fontWeight: 800, color: NAVY, direction: "ltr", textAlign: "right", marginTop: 6 })}>{fmtCurrency(totalLoansBalance)}</div></div>
          <div style={px({ background: PINK, color: "#fff", borderRadius: 16, padding: 20 })}><div style={px({ fontSize: 11.5, opacity: 0.85 })}>שיעור מסך הצבירה</div><div style={px({ fontSize: 24, fontWeight: 800, direction: "ltr", textAlign: "right", marginTop: 6 })}>{`${totalLoansPct.toFixed(1)}%`}</div></div>
        </div>
        {loanDetails.length ? (
          <table style={px({ ...tableWrap, fontSize: 13 })}>
            <thead>
              <tr style={px(headRow)}>
                {["שם", "סכום", "יתרה", "תדירות החזר", "תאריך סיום"].map((h, i) => <th key={i} style={px({ padding: "10px 12px", textAlign: "right" })}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {loanDetails.slice(0, 14).map((loan, i) => (
                <tr key={loan.id || i} style={px({ background: i % 2 === 0 ? "#fff" : GRAD_ROW })}>
                  <td style={px(bc)}>{[loan.firstName, loan.familyName].filter(Boolean).join(" ") || "—"}</td>
                  <td style={px(nc)}>{fmtCurrency(loan.amount)}</td>
                  <td style={px(nc)}>{fmtCurrency(loan.balance)}</td>
                  <td style={px(bc)}>{loan.repaymentFrequency || "—"}</td>
                  <td style={px(nc)}>{fmtDateDots(loan.endDate)}</td>
                </tr>
              ))}
              <tr style={px({ background: GRAD_TOTAL, color: NAVY, fontWeight: 800 })}>
                <td style={px({ padding: "10px 12px" })}>סה״כ</td>
                <td style={px({ padding: "10px 12px", direction: "ltr", textAlign: "right" })}>{fmtCurrency(totalLoansAmount)}</td>
                <td style={px({ padding: "10px 12px", direction: "ltr", textAlign: "right" })}>{fmtCurrency(totalLoansBalance)}</td>
                <td style={px({ padding: "10px 12px" })}>—</td>
                <td style={px({ padding: "10px 12px" })}>—</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <EmptyPanel title="לא התקבל מידע על הלוואות להצגה" subtitle="ככל שיועברו נתוני הלוואות, יוצגו כאן פירוט יתרות, ריביות ולוחות סילוקין." />
        )}
        <Foot n={n} total={total} />
      </section>
    ));
  }

  // ---- 08 · פירוק נכסים ----
  if (show("capitalClassification") && hasCapitalClassification) {
    pages.push((n, total) => (
      <section class="rp-section" key="capital" style={px(pageBase)}>
        <ChapterHeader num="08" title="פירוק נכסים" subtitle="סיווג הוני / קצבתי · ברמת קבוצת מוצר" />
        <Lead mb={18} text="הכספים מסווגים לפי ייעודם בגיל פרישה: כספים הוניים הניתנים למשיכה כסכום חד-פעמי, וכספים קצבתיים המיועדים לקצבה חודשית. הסיווג מוצג ברמת קבוצת מוצר." />
        <div style={px({ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 18 })}>
          <div style={px({ background: NAVY, color: "#fff", borderRadius: 14, padding: "16px 18px" })}><div style={px({ fontSize: 11, opacity: 0.72 })}>סה״כ קופה</div><div style={px({ fontSize: 21, fontWeight: 800, direction: "ltr", textAlign: "right", marginTop: 5 })}>{fmtCurrency(capTotalBalance)}</div></div>
          <div style={px({ background: "#fff", boxShadow: "0 3px 16px rgba(0,33,93,0.12)", borderRadius: 14, padding: "16px 18px" })}><div style={px({ fontSize: 11, color: MUTED })}>סה״כ תגמולים</div><div style={px({ fontSize: 21, fontWeight: 800, color: NAVY, direction: "ltr", textAlign: "right", marginTop: 5 })}>{fmtCurrency(capTotalRewards)}</div></div>
          <div style={px({ background: "#fff", boxShadow: "0 3px 16px rgba(0,33,93,0.12)", borderRadius: 14, padding: "16px 18px" })}><div style={px({ fontSize: 11, color: MUTED })}>סה״כ פיצויים</div><div style={px({ fontSize: 21, fontWeight: 800, color: NAVY, direction: "ltr", textAlign: "right", marginTop: 5 })}>{fmtCurrency(capTotalSeverance)}</div></div>
          <div style={px({ background: PINK, color: "#fff", borderRadius: 14, padding: "16px 18px" })}><div style={px({ fontSize: 11, opacity: 0.85 })}>סה״כ הון</div><div style={px({ fontSize: 21, fontWeight: 800, direction: "ltr", textAlign: "right", marginTop: 5 })}>{fmtCurrency(capTotalCapital)}</div></div>
        </div>

        <div class="rp-avoid" style={px({ display: "grid", gridTemplateColumns: "180px 1fr", gap: 26, alignItems: "center", background: "#fff", boxShadow: CARD_SOFT, borderRadius: 16, padding: "18px 22px", marginBottom: 18 })}>
          <div style={px({ display: "flex", justifyContent: "flex-start" })}>
            <SvgDonut size={158} centerTop="סיווג" centerLabel="הוני/קצבתי" segments={donutSegments([
              { name: "הון (נזיל / כספים הוניים)", value: Math.max(capTotalCapital - capStudyBalance, 0) },
              { name: "קצבה (מיועד לקצבה חודשית)", value: capTotalPension },
              { name: "קרנות השתלמות (צבירה בלבד)", value: capStudyBalance },
            ])} />
          </div>
          <div style={px({ display: "flex", flexDirection: "column", gap: 12 })}>
            {[
              { name: "הון (נזיל / כספים הוניים)", value: Math.max(capTotalCapital - capStudyBalance, 0), color: NAVY },
              { name: "קצבה (מיועד לקצבה חודשית)", value: capTotalPension, color: PINK },
              { name: "קרנות השתלמות (צבירה בלבד)", value: capStudyBalance, color: TAN },
            ].map((s, i) => {
              const tot = Math.max(capTotalCapital - capStudyBalance, 0) + capTotalPension + capStudyBalance || 1;
              return (
                <div key={i} style={px({ display: "flex", alignItems: "center", gap: 12 })}>
                  <span style={px({ width: 13, height: 13, borderRadius: 4, background: s.color, flexShrink: 0 })} />
                  <span style={px({ flex: 1, fontSize: 14 })}>{s.name}</span>
                  <strong style={px({ fontSize: 14.5, direction: "ltr" })}>{fmtCurrency(s.value)}</strong>
                  <span style={px({ width: 52, textAlign: "left", direction: "ltr", fontSize: 12.5, color: MUTED })}>{((s.value / tot) * 100).toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
        </div>

        {capGroups.length ? (
          <table style={px({ ...tableWrap, tableLayout: "fixed", fontSize: 9.5 })}>
            <thead>
              <tr style={px(headRow)}>
                <th style={px({ padding: "8px 4px", textAlign: "right", width: "14%", lineHeight: 1.25 })}>קבוצת מוצר</th>
                {capCols.map((c) => <th key={c.key} style={px({ padding: "8px 4px", textAlign: "right", lineHeight: 1.25 })}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {capGroups.map((g, i) => (
                <tr key={i} style={px({ background: i % 2 === 0 ? "#fff" : GRAD_ROW })}>
                  <td style={px({ padding: "7px 4px", borderBottom: `1px solid ${HAIR}`, fontWeight: 700, color: NAVY })}>{g.label}</td>
                  {capCols.map((c) => (
                    <td key={c.key} style={px({ padding: "7px 4px", borderBottom: `1px solid ${HAIR}`, direction: "ltr", textAlign: "right", color: c.theoretical ? MUTED : undefined })}>
                      {c.theoretical ? "—" : capMoney(summarizeCapitalDerivedRows(g.rows, c.key))}
                    </td>
                  ))}
                </tr>
              ))}
              <tr style={px({ background: GRAD_NAVY, color: "#fff", fontWeight: 800, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.16)" })}>
                <td style={px({ padding: "8px 4px" })}>סה״כ</td>
                {capCols.map((c) => (
                  <td key={c.key} style={px({ padding: "8px 4px", direction: "ltr", textAlign: "right", opacity: c.theoretical ? 0.7 : 1 })}>
                    {c.theoretical ? "—" : capMoney(summarizeCapitalDerivedRows(allCapitalPension, c.key))}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        ) : null}

        {capStudyBalance > 0 ? (
          <div class="rp-avoid" style={px({ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center", background: TAN, borderRadius: 14, padding: "16px 22px" })}>
            <div style={px({ fontSize: 13.5, color: DARKTAN })}>קרנות השתלמות — צבירה בלבד</div>
            <div style={px({ fontSize: 19, fontWeight: 800, color: NAVY, direction: "ltr" })}>{fmtCurrency(capStudyBalance)}</div>
          </div>
        ) : null}
        <NoteLine text="כספים הוניים כוללים רכיבי הון, תגמולים הוניים ותגמולים קצבתיים עד שנת 2000. קרנות השתלמות מוצגות כצבירה בלבד. * שתי העמודות האחרונות הן הערכה תיאורטית להמחשה בלבד ואינן מבוססות על מקדם שהתקבל בפועל מהגוף המנהל." />
        <Foot n={n} total={total} />
      </section>
    ));
  }

  // ---- 09 · קיטום סעיף 28 ----
  if (show("section28") && hasSection28Capping) {
    section28CappingEntries.forEach((entry, entryIndex) => {
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
        <div class="rp-avoid" style={px({ background: "#fff", boxShadow: CARD_SOFT, borderRadius: 16, padding: 22 })}>
          <div style={px({ fontSize: 15.5, fontWeight: 700, color: NAVY, marginBottom: 14 })}>{title}</div>
          <div style={px({ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 })}>
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
                <div key={`s-${i}`} style={px({ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, borderTop: i === 0 ? `1px solid ${HAIR}` : "none", paddingTop: i === 0 ? 10 : 0 })}>
                  <span style={px({ minWidth: 0 })}>{parts[0]}{parts.length > 1 ? <><br /><span style={px({ color: MUTED, fontSize: 12 })}>{parts.slice(1).join(" — ")}</span></> : null}</span>
                  <strong style={px({ direction: "ltr", color: NAVY, flexShrink: 0, whiteSpace: "nowrap" })}>{formatSection28DisplayValue(r.value)}</strong>
                </div>
              );
            })}
            {!rows.length && !summary.length ? <div style={px({ color: MUTED })}>אין נתון להצגה</div> : null}
          </div>
        </div>
      );
      pages.push((n, total) => (
        <section class="rp-section" key={`s28-${entryIndex}`} style={px(pageBase)}>
          <Watermark style={{ top: -180, left: -180, width: 460, height: 460 }} />
          <ChapterHeader num="09" title="קיטום סעיף 28" subtitle={entry.ownerLabel || "מבוטח/ת ראשית"} />
          <InfoStrip text="קיטום לפי סעיף 28 משמעותו הפחתה יחסית של כלל רכיבי השכר, כך שסכומם הכולל לא יעלה על התקרה הקבועה בחוק — עד פי שמונה משכר המינימום. הקיטום אינו מבטל רכיב שכר מסוים, אלא מפחית באופן יחסי את כלל הרכיבים, ובכך עשוי להגדיל את השכר נטו המשולם בתלוש." />
          <div style={px({ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 })}>
            <CostCard title="חלק מעסיק" rows={employerRows} summary={employerSummary} />
            <CostCard title="חלק עובד" rows={employeeRows} summary={employeeSummary} />
          </div>
          {monthlyRow ? (
            <div class="rp-avoid" style={px({ background: NAVY, color: "#fff", borderRadius: 16, padding: "22px 26px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 })}>
              <div style={px({ fontSize: 14.5, opacity: 0.82 })}>{monthlyRow.label}</div>
              <div style={px({ fontSize: 30, fontWeight: 800, direction: "ltr" })}>{formatSection28DisplayValue(monthlyRow.value)}</div>
            </div>
          ) : null}
          {chartRows.length ? (
            <>
              <div style={px({ fontSize: 16, fontWeight: 700, color: NAVY, marginBottom: 12 })}>השוואה בין תרחישים</div>
              <div style={px({ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 })}>
                {chartRows.map((row, i) => {
                  const before = Math.abs(section28NumericValue(row.before));
                  const after = Math.abs(section28NumericValue(row.after));
                  const max = Math.max(before, after, 1);
                  const gapNum = section28NumericValue(row.gap) || (section28NumericValue(row.after) - section28NumericValue(row.before));
                  const title = normalizeSection28Text(row.label) === "קצבה" ? "קצבה חודשית" : row.label;
                  return (
                    <div class="rp-avoid" key={`cmp-${i}`} style={px({ background: "#fff", boxShadow: CARD_SOFT, borderRadius: 16, padding: 20 })}>
                      <div style={px({ fontSize: 13.5, color: MUTED, marginBottom: 12 })}>{title}</div>
                      <div style={px({ display: "flex", flexDirection: "column", gap: 12 })}>
                        {[{ l: "לפני קיטום", v: before, dv: row.before, c: NAVY }, { l: "אחרי קיטום", v: after, dv: row.after, c: PINK }].map((b, bi) => (
                          <div key={bi}>
                            <div style={px({ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 5 })}><span>{b.l}</span><strong style={px({ direction: "ltr" })}>{formatSection28DisplayValue(b.dv)}</strong></div>
                            <div style={px({ background: DESK, borderRadius: 8, height: 14, overflow: "hidden" })}>
                              <div style={px({ width: `${Math.max((b.v / max) * 100, b.v ? 4 : 0)}%`, height: "100%", background: b.c, borderRadius: 8 })} />
                            </div>
                          </div>
                        ))}
                      </div>
                      <div style={px({ marginTop: 12, fontSize: 12.5, fontWeight: 700, color: gapNum < 0 ? PINK : NAVY })}>
                        פער: {gapNum < 0 ? "‎-" : "‎+"}{formatSection28DisplayValue(Math.abs(gapNum))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}
          <Foot n={n} total={total} />
        </section>
      ));
    });
  }

  // ---- 10 · קצבה מוכרת ----
  if (show("recognizedPension") && hasRecognizedPension) {
    recognizedPensionEntries.forEach((entry, entryIndex) => {
      const vestedRows = Array.isArray(entry?.vestedBalanceTable?.rows) ? entry.vestedBalanceTable.rows : [];
      const manualRows = getManualRecognizedPensionRows(entry?.recognizedPensionAdjustments);
      const pdfTotal = getPdfExemptPaymentsTotal(vestedRows);
      const manualTotal = manualRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
      pages.push((n, total) => (
        <section class="rp-section" key={`recognized-${entryIndex}`} style={px(pageBase)}>
          <Watermark style={{ bottom: -200, left: -200, width: 480, height: 480 }} />
          <ChapterHeader num="10" title="קצבה מוכרת" subtitle={entry.ownerLabel || "בן/בת זוג"} />
          <InfoStrip text="קצבה מוכרת היא החלק בקצבה שנובע מהפקדות שכבר שולם עליהן מס, או מהפקדות שלא ניתנה בגינן הטבת מס. לכן, בעת קבלת הקצבה בגיל פרישה, חלק זה עשוי להיות פטור ממס, בכפוף להוראות החוק ולהכרה של רשות המסים." />
          {vestedRows.length ? (
            <>
              <div class="rp-avoid" style={px({ background: NAVY, color: "#fff", borderRadius: 16, padding: "22px 26px", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" })}>
                <div style={px({ fontSize: 14, opacity: 0.78 })}>סה״כ תשלומים פטורים (טבלת חישוב מהמסמך)</div>
                <div style={px({ fontSize: 26, fontWeight: 800, direction: "ltr" })}>{formatReportNumber(pdfTotal)}</div>
              </div>
              <table style={px({ ...tableWrap, fontSize: 12.5, marginBottom: 24 })}>
                <thead>
                  <tr style={px(headRow)}>
                    {["שם הקופה", "תשלומים פטורים", "קצבה מוכרת"].map((h, i) => <th key={i} style={px({ padding: "10px 12px", textAlign: "right" })}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {vestedRows.slice(0, 10).map((row, i) => (
                    <tr key={row.id || i} style={px({ background: i % 2 === 0 ? "#fff" : GRAD_ROW })}>
                      <td style={px(bc)}>{row.fundName || "—"}</td>
                      <td style={px(nc)}>{row.exemptPayments || "—"}</td>
                      <td style={px(nc)}>{row.pension || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}
          {manualRows.length ? (
            <>
              <div style={px({ fontSize: 16, fontWeight: 700, color: NAVY, marginBottom: 12 })}>קצבה מוכרת שהוזנה ידנית</div>
              <div style={px({ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "stretch" })}>
                <table style={px({ ...tableWrap, fontSize: 13 })}>
                  <thead>
                    <tr style={px(headRowPink)}>
                      {["חברת ביטוח", "קצבה מוכרת שהוזנה"].map((h, i) => <th key={i} style={px({ padding: "10px 12px", textAlign: "right" })}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {manualRows.slice(0, 8).map((row, i) => (
                      <tr key={row.id || i} style={px({ background: i % 2 === 0 ? "#fff" : GRAD_ROW })}>
                        <td style={px(bc)}>{row.companyName || "—"}</td>
                        <td style={px(nc)}>{formatReportNumber(row.amount)}</td>
                      </tr>
                    ))}
                    <tr style={px({ background: GRAD_ROW })}>
                      <td style={px({ ...bc, fontWeight: 800 })}>סה״כ</td>
                      <td style={px({ ...nc, fontWeight: 800 })}>{formatReportNumber(manualTotal)}</td>
                    </tr>
                  </tbody>
                </table>
                {pdfTotal > 0 && manualTotal > 0 ? (
                  <div class="rp-avoid" style={px({ background: TAN, borderRadius: 16, padding: 22, display: "flex", flexDirection: "column", justifyContent: "center" })}>
                    <div style={px({ fontSize: 13, color: DARKTAN })}>פער הצבירה לחיסכון במס</div>
                    <div style={px({ fontSize: 11.5, color: DARKTAN, opacity: 0.75, marginTop: 2 })}>לפי טבלת ה-PDF, בניכוי הקצבה שהוזנה ידנית</div>
                    <div style={px({ fontSize: 28, fontWeight: 800, color: NAVY, marginTop: 10, direction: "ltr" })}>{formatReportNumber(pdfTotal - manualTotal)}</div>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
          {!vestedRows.length && !manualRows.length ? <EmptyPanel title="לא קיימים נתוני קצבה מוכרת בדוח." /> : null}
          <Foot n={n} total={total} />
        </section>
      ));
    });
  }

  // ---- 11 · סיכום שיחה ----
  if (show("summary")) {
    pages.push((n, total) => (
      <section class="rp-section" key="summary" style={px(pageBase)}>
        <ChapterHeader num="11" title="סיכום שיחה" subtitle="תובנות מהפגישה והמלצות להמשך" />
        {summaryParagraphs.length ? (
          <div style={px({ display: "flex", flexDirection: "column", gap: 12, marginTop: 20 })}>
            {summaryParagraphs.map((block, i) => {
              const lines = block.split(/\n+/).map((l) => l.trim()).filter(Boolean);
              const isTopic = lines.length > 1;
              return (
                <div class="rp-avoid" key={`summary-${i}`} style={px({ background: "#fff", boxShadow: CARD_SOFT, borderRadius: 16, padding: "18px 22px" })}>
                  {isTopic ? (
                    <>
                      <div style={px({ color: NAVY, fontSize: 15.5, fontWeight: 800, marginBottom: 6 })}>{lines[0]}</div>
                      <div style={px({ fontSize: 13.5, lineHeight: 1.75, color: DARKTAN, whiteSpace: "pre-wrap" })}>{lines.slice(1).join("\n")}</div>
                    </>
                  ) : <div style={px({ fontSize: 13.5, lineHeight: 1.75, color: DARKTAN, whiteSpace: "pre-wrap" })}>{block}</div>}
                </div>
              );
            })}
          </div>
        ) : (
          <div class="rp-avoid" style={px({ marginTop: 20, background: "#fff", boxShadow: CARD_SOFT, borderRadius: 16, padding: 40, textAlign: "center" })}>
            <div style={px({ fontSize: 15.5, fontWeight: 700, color: NAVY })}>כאן יוצג סיכום השיחה עם הלקוח</div>
            <div style={px({ fontSize: 13.5, color: MUTED, maxWidth: 480, lineHeight: 1.6, margin: "8px auto 0" })}>אזור להצגת תובנות מהפגישה. ניתן לחבר אליו שדה טקסט ידני או ממנגנון שמירת הדוח.</div>
          </div>
        )}

        {recommendationItems.length ? (
          <div class="rp-avoid" style={px({ marginTop: 18, background: NAVY, color: "#fff", borderRadius: 18, padding: "24px 26px" })}>
            <div style={px({ fontSize: 16, fontWeight: 800, marginBottom: 12 })}>המלצות לפעולה</div>
            <div style={px({ display: "flex", flexDirection: "column", gap: 10, fontSize: 13.5, lineHeight: 1.65 })}>
              {recommendationItems.map((item, i) => (
                <div key={i} style={px({ display: "flex", gap: 12, alignItems: "flex-start" })}>
                  <span style={px({ width: 22, height: 22, borderRadius: "50%", background: PINK, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800 })}>{i + 1}</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div style={px({ marginTop: 18, fontSize: 10.5, color: MUTED, lineHeight: 1.7 })}>הדוח נועד להאיר את התמונה הפיננסית המשפחתית ואינו מהווה ייעוץ, שיווק פנסיוני או המלצה לביצוע פעולה. הנתונים מבוססים על המידע שהתקבל מהגופים המנהלים נכון לתאריך נכונות הנתונים המצוין בשער.</div>
        <Foot n={n} total={total} />
      </section>
    ));
  }

  const totalPages = pages.length;
  return (
    <div class="print-report-root" aria-hidden="true">
      <style>{css}</style>
      {pages.map((fn, i) => fn(i + 1, totalPages))}
    </div>
  );
}
