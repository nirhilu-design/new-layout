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



  // ============================================================
  // Design tokens — Family Pension Report handoff (high fidelity)
  // ============================================================
  const NAVY = "#00215D";      // ink / primary
  const INK2 = "#3C4A6B";      // ink secondary
  const MUTED = "#5B6480";     // in-sheet body / secondary numbers
  const MLABEL = "#6B7590";    // table headers, KPI labels, sub-titles
  const MONO = "#7A6A56";      // mono captions, axis labels, page numbers
  const ROSE = "#FF2756";      // accent (strictly limited)
  const ROSE_DK = "#B01235";   // negative delta text
  const PAPER = "#F9F7F3";     // page background
  const CARD = "#FFFFFF";      // card white
  const BORDER = "#E2D1BF";    // 1px card borders / hairlines
  const BORDER2 = "#C0AC94";   // dashed comparison / secondary bar borders
  const DIV = "#F2ECE3";       // inner row dividers, chart gridlines
  const DIV2 = "#F5F0E9";      // dense-table data-row dividers
  const TRACK = "#EFE7DC";     // exposure-scale track
  const MONOF = "'IBM Plex Mono', monospace";
  // Product ramp (largest = darkest).
  const RAMP = [NAVY, "#2B4A82", "#6E86AE", "#9FB0CC", BORDER2, BORDER];
  // 10-step ramp for the investment-track strip.
  const RAMP10 = [NAVY, "#24447C", "#4A6796", "#6E86AE", "#9FB0CC", BORDER2, "#D5C4AE", BORDER, "#EFE3D4", ROSE];
  // Heatmap ramp for returns, ordered lightest→darkest (darker = higher return in the column).
  const HEAT = ["#F0F3F8", "#EDF1F7", "#E7ECF4", "#E1E7F0", "#DCE3EE", "#D2DBEA", "#C6D1E4", "#B4C2DB", "#9FB0CC"];

  // ===== Formatters =====
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
  const monthYear = (value) => {
    if (!value) return "—";
    const str = String(value).trim();
    const m8 = /^(\d{4})(\d{2})(\d{2})$/.exec(str);
    if (m8) return `${m8[2]}/${m8[1]}`;
    const mMY = /^(\d{1,2})[/.](\d{4})$/.exec(str);
    if (mMY) return `${mMY[1].padStart(2, "0")}/${mMY[2]}`;
    const mSep = /^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})$/.exec(str);
    if (mSep) { let y = mSep[3]; if (y.length === 2) y = `20${y}`; return `${mSep[2].padStart(2, "0")}/${y}`; }
    const d = new Date(str);
    if (!Number.isNaN(d.getTime())) return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
    return str;
  };
  const fmtPct2 = (v) => `${Number(v || 0).toFixed(2)}%`;
  const fmtNum2 = (v) => `${Number(v || 0).toFixed(2)}`;
  const capMoney = (v) => `₪${Math.round(Number(v || 0)).toLocaleString("en-US")}`;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  const memberDetail = (member, key) =>
    member?.personalDetails?.[key] ?? member?.[key] ?? member?.details?.[key] ?? null;
  const combinedSalary = members.reduce((sum, m) => sum + Number(memberDetail(m, "currentSalary") || 0), 0);
  const totalLifeCoverage = members.reduce((sum, m) => sum + Number(m.deathCoverage || 0), 0);
  const productTotal = products.reduce((sum, p) => sum + Number(p.value || 0), 0);
  const show = (id) => !sections || sections.has(id);

  const firmName = data.firmName || "מבט משפחתי";
  const today = new Intl.DateTimeFormat("he-IL").format(new Date());
  const reportDate = family.lastUpdated || today;

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
  const capCols = [
    { key: "capitalRewards", label: "תגמולים הוניים" },
    { key: "annuityRewardsUntil2000", label: "תגמולים קצבתיים עד 2000" },
    { key: "previousEmployersSeveranceRightsSequence", label: "פיצויים קודמים ברצף" },
    { key: "currentEmployerSeveranceTaxable", label: "פיצויים מעסיק נוכחי" },
    { key: "totalPension", label: 'סה״כ קצבה' },
    { key: "totalCapital", label: 'סה״כ הון' },
  ];
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
    .split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const recommendationItems = String(printActionRecommendations || "")
    .split(/\n+/).map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim()).filter(Boolean);

  // ---------- Weighted returns (grouped by product group) ----------
  const weightedReturns = (() => {
    const funds = (Array.isArray(productFunds) ? productFunds : [])
      .map((f) => ({
        productType: f.productType || "אחר", value: Number(f.value || 0),
        return12: Number(f.return12 || 0), return36: Number(f.return36 || 0), return60: Number(f.return60 || 0),
        st36: Number(f.st36 || 0), sharp36: Number(f.sharp36 || 0),
      }))
      .filter((f) => f.value > 0);
    const order = ["פנסיה מקיפה", "פנסיה חדשה מקיפה", "פנסיה כללית", "ביטוח מנהלים", "ביטוח", "קרן השתלמות", "קופת גמל", "גמל להשקעה"];
    const map = new Map();
    funds.forEach((f) => { if (!map.has(f.productType)) map.set(f.productType, []); map.get(f.productType).push(f); });
    const wavg = (list, key) => { const tv = list.reduce((s, x) => s + x.value, 0) || 1; return list.reduce((s, x) => s + x.value * x[key], 0) / tv; };
    const groups = Array.from(map.entries()).map(([type, list]) => ({
      type, count: list.length, total: list.reduce((s, x) => s + x.value, 0),
      r12: wavg(list, "return12"), r36: wavg(list, "return36"), r60: wavg(list, "return60"), st: wavg(list, "st36"), sharp: wavg(list, "sharp36"),
    })).sort((a, b) => b.total - a.total);
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

  // ===== Ranked-distribution helper (sorted desc, ramp colors) =====
  const ranked = (items, ramp) => {
    const clean = (Array.isArray(items) ? items : [])
      .map((it) => ({ name: it.name || "ללא שם", value: Number(it.value || 0) }))
      .filter((it) => it.value > 0)
      .sort((a, b) => b.value - a.value);
    const total = clean.reduce((s, x) => s + x.value, 0) || 1;
    return clean.map((it, i) => ({ ...it, pct: (it.value / total) * 100, color: (ramp || RAMP)[Math.min(i, (ramp || RAMP).length - 1)] }));
  };
  const conicFromSegs = (segs) => {
    let acc = 0; const parts = [];
    segs.forEach((s) => { const start = acc; acc += s.pct; parts.push(`${s.color} ${start.toFixed(2)}% ${acc.toFixed(2)}%`); });
    return `conic-gradient(${parts.join(", ")})`;
  };
  // Per-column heatmap bucket → HEAT index (darker = higher).
  const heatColor = (v, min, max) => {
    if (v == null || !Number.isFinite(v)) return null;
    if (max <= min) return HEAT[4];
    const idx = Math.round(((v - min) / (max - min)) * (HEAT.length - 1));
    return HEAT[clamp(idx, 0, HEAT.length - 1)];
  };
  const heatIsDark = (bg) => bg === "#9FB0CC" || bg === "#B4C2DB";

  // ===== Category symbols =====
  const SymPension = ({ s = 46 }) => <div style={px({ width: s, height: s, borderRadius: "50%", border: `1.5px solid ${NAVY}`, background: "conic-gradient(#00215D 0 62%, transparent 0)", flex: "none" })} />;
  const SymAssets = ({ s = 46 }) => <div style={px({ width: s, height: s, display: "flex", alignItems: "flex-end", gap: 5, flex: "none" })}><div style={px({ flex: 1, height: "40%", background: BORDER })} /><div style={px({ flex: 1, height: "70%", background: "#9FB0CC" })} /><div style={px({ flex: 1, height: "100%", background: NAVY })} /></div>;
  const SymReturns = ({ s = 46 }) => <div style={px({ width: s, height: s, borderRadius: "50%", border: `1.5px solid ${BORDER}`, borderTopColor: NAVY, borderRightColor: NAVY, flex: "none" })} />;
  const SymProtection = ({ s = 46 }) => <div style={px({ width: s, height: s, border: `1.5px solid ${NAVY}`, borderRadius: "50% 50% 8px 8px", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" })}><div style={px({ width: 14, height: 14, background: NAVY, borderRadius: "50%" })} /></div>;
  const SymConversation = ({ s = 46 }) => <div style={px({ width: s, height: s, border: `1.5px solid ${NAVY}`, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" })}><div style={px({ width: 22, height: 1.5, background: NAVY })} /></div>;
  const SymDecomp = ({ s = 46 }) => <div style={px({ width: s, height: s, border: `1.5px solid ${NAVY}`, display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", flex: "none" })}><div style={px({ background: NAVY })} /><div /><div /><div style={px({ background: BORDER })} /></div>;
  const SymSection28 = ({ s = 46 }) => <div style={px({ width: s, height: s, borderRadius: "50%", border: `1.5px solid ${NAVY}`, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flex: "none" })}><div style={px({ width: 1.5, height: s, background: NAVY })} /><div style={px({ width: 14, height: 14, borderRadius: "50%", background: ROSE, marginInlineStart: -8 })} /></div>;
  const SymAnnuity = ({ s = 46 }) => <div style={px({ width: s, height: s, borderRadius: "50%", border: `1.5px solid ${NAVY}`, background: "linear-gradient(to top,#00215D 50%,transparent 50%)", flex: "none" })} />;

  // ===== Person markers (role, not gender) =====
  const PersonMark = ({ primary, size = 30, dot = 11 }) => primary ? (
    <span style={px({ width: size, height: size, borderRadius: "50%", border: `1.5px solid ${NAVY}`, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" })}><span style={px({ width: dot, height: dot, borderRadius: "50%", background: NAVY })} /></span>
  ) : (
    <span style={px({ width: size, height: size, borderRadius: "50%", border: `1.5px solid ${ROSE}`, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" })}><span style={px({ width: dot, height: dot, borderRadius: "50%", border: `2px solid ${ROSE}` })} /></span>
  );

  const roleLabel = (i) => (i === 0 ? "מבוטח ראשי" : "בן/בת זוג");

  // ===== Shared page chrome =====
  const sheet = {
    position: "relative", overflow: "hidden", background: PAPER, color: NAVY,
    direction: "rtl", textAlign: "right", fontFamily: "'Assistant','Segoe UI',sans-serif",
    fontVariantNumeric: "tabular-nums", width: "100%", minHeight: 1123,
    display: "flex", flexDirection: "column", boxSizing: "border-box",
  };
  const sheetPad = { ...sheet, padding: "44px 52px 36px" };

  const ChapterHeader = ({ num, title, subtitle, sym, marker }) => (
    <>
      <div style={px({ display: "flex", alignItems: "center", gap: 24 })}>
        <div style={px({ fontFamily: MONOF, fontSize: 46, fontWeight: 500, color: BORDER, lineHeight: 1, flex: "none" })}>{num}</div>
        <div style={px({ flex: 1 })}>
          {marker ? (
            <div style={px({ display: "flex", alignItems: "center", gap: 10 })}>{marker}<div style={px({ fontSize: 24, fontWeight: 700 })}>{title}</div></div>
          ) : (
            <div style={px({ fontSize: 24, fontWeight: 700 })}>{title}</div>
          )}
          <div style={px({ fontSize: 13, color: MLABEL, marginTop: 3 })}>{subtitle}</div>
        </div>
        {sym}
      </div>
      <div style={px({ height: 2, background: NAVY, marginTop: 18 })} />
    </>
  );

  const Lead = ({ text, max = 88, mt = 18 }) => (
    <p style={px({ margin: `${mt}px 0 0`, fontSize: 13, lineHeight: 1.6, color: MUTED, maxWidth: `${max}ch` })}>{text}</p>
  );

  const CardTitle = ({ title, right, mb = 16 }) => (
    <div style={px({ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: mb })}>
      <div style={px({ fontSize: 15.5, fontWeight: 700 })}>{title}</div>
      {right != null ? <div style={px({ fontSize: 11.5, color: MUTED })}>{right}</div> : null}
    </div>
  );

  const cardStyle = (extra) => px({ background: CARD, border: `1px solid ${BORDER}`, ...(extra || {}) });

  const Foot = ({ n, total, left, gap = 18 }) => (
    <div style={px({ marginTop: "auto", paddingTop: gap, borderTop: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 20 })}>
      {typeof left === "string"
        ? <div style={px({ fontSize: 11.5, color: MUTED, lineHeight: 1.5 })}>{left}</div>
        : (left || <div style={px({ fontSize: 11.5, color: MUTED })}>{`דוח פנסיוני משפחתי · ${firmName}`}</div>)}
      <div style={px({ fontFamily: MONOF, fontSize: 11, color: MONO, flex: "none" })}>{`${String(n).padStart(2, "0")} / ${String(total).padStart(2, "0")}`}</div>
    </div>
  );

  // ============================================================
  // Ordered page builders (cover first; footers numbered n/total).
  // ============================================================
  const pages = [];

  // ---- COVER ----
  pages.push((n, total) => {
    const withDep = Number(family.projectedLumpSumWithDeposits || 0);
    const withoutDep = Number(family.projectedLumpSumWithoutDeposits || 0);
    const dashPct = withDep > 0 ? clamp((withoutDep / withDep) * 100, 8, 92) : 59;
    const barHeights = [15, 17, 19, 22, 25, 28, 32, 36, 40, 45, 50, 56, 62, 68, 75, 82, 90, 100];
    const legendSym = (icon, label) => (
      <div style={px({ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: MUTED })}>{icon}{label}</div>
    );
    return (
      <section class="rp-section" key="cover" style={px({ ...sheet, padding: "52px 56px 44px" })}>
        <div style={px({ display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 20, borderBottom: `1px solid ${BORDER}` })}>
          <div>
            <div style={px({ fontSize: 18, fontWeight: 700 })}>{firmName}</div>
            <div style={px({ fontFamily: MONOF, fontSize: 10, letterSpacing: ".22em", color: MONO, marginTop: 4 })}>FAMILY WEALTH REVIEW</div>
          </div>
          <div style={px({ fontFamily: MONOF, fontSize: 11, color: "#8A7A68", textAlign: "left", lineHeight: 1.8 })}>{fmtDateDots(reportDate)}<br />נכונות נתונים {monthYear(family.dataValidityDate)}</div>
        </div>

        <div style={px({ paddingTop: 44 })}>
          <div style={px({ width: 40, height: 2, background: ROSE, marginBottom: 20 })} />
          <h2 style={px({ margin: 0, fontSize: 58, fontWeight: 800, lineHeight: 1.03, letterSpacing: "-.02em" })}>דוח פנסיוני<br /><span style={px({ fontWeight: 300, color: INK2 })}>משפחתי מאוחד</span></h2>
          <p style={px({ margin: "20px 0 0", maxWidth: "46ch", fontSize: 16, lineHeight: 1.65, color: INK2 })}>תמונה מלאה של העתיד שלכם — פנסיה, ביטוח, השקעות ותכנון עתידי, מרוכזים במסמך אחד ברור.</p>
        </div>

        <div style={px({ marginTop: 40, flex: "none", background: CARD, border: `1px solid ${BORDER}`, padding: "26px 28px 22px" })}>
          <div style={px({ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 20 })}>
            <div>
              <div style={px({ fontSize: 15.5, fontWeight: 700 })}>צמיחת הצבירה לאורך זמן</div>
              <div style={px({ fontSize: 12.5, color: MLABEL, marginTop: 3 })}>אופק התכנון — מהיום ועד גיל הפרישה</div>
            </div>
            <div style={px({ display: "flex", gap: 16, fontSize: 11.5, color: MUTED })}>
              <div style={px({ display: "flex", alignItems: "center", gap: 6 })}><span style={px({ width: 12, height: 3, background: NAVY })} />עם המשך הפקדות</div>
              <div style={px({ display: "flex", alignItems: "center", gap: 6 })}><span style={px({ width: 12, height: 0, borderTop: `1.5px dashed ${BORDER2}` })} />ללא המשך הפקדות</div>
            </div>
          </div>
          <div style={px({ position: "relative", height: 196 })}>
            <div style={px({ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "space-between" })}>
              <div style={px({ height: 1, background: DIV })} /><div style={px({ height: 1, background: DIV })} /><div style={px({ height: 1, background: DIV })} /><div style={px({ height: 1, background: BORDER })} />
            </div>
            <div style={px({ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", gap: 3 })}>
              {barHeights.map((h, i) => <div key={i} style={px({ flex: 1, height: `${h}%`, background: "linear-gradient(#9FB0CC,#00215D)" })} />)}
            </div>
            <div style={px({ position: "absolute", insetInline: 0, bottom: 0, height: `${dashPct}%`, borderTop: `1.5px dashed ${BORDER2}`, pointerEvents: "none" })} />
            <div style={px({ position: "absolute", insetInlineStart: 0, bottom: `${dashPct}%`, transform: "translateY(-6px)", fontSize: 10.5, color: MONO, background: CARD, padding: "0 5px" })}>ללא המשך הפקדות</div>
            <div style={px({ position: "absolute", insetInlineStart: 0, top: 0, width: 9, height: 9, borderRadius: "50%", background: ROSE })} />
          </div>
          <div style={px({ display: "flex", justifyContent: "space-between", marginTop: 12, fontFamily: MONOF, fontSize: 10.5, color: MONO })}>
            <span>היום</span><span>+10 שנים</span><span>+20 שנים</span><span>גיל פרישה</span>
          </div>
        </div>

        <div style={px({ marginTop: 38, display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 24 })}>
          {[["01", "סיכום פנסיוני", NAVY], ["02", "התפלגות נכסים", NAVY], ["03", "תשואות ודמי ניהול", NAVY], ["04–05", "הגנות וסיכום שיחה", ROSE]].map(([idx, lbl, c]) => (
            <div key={idx} style={px({ borderTop: `2px solid ${c}`, paddingTop: 12 })}>
              <div style={px({ fontFamily: MONOF, fontSize: 10.5, color: MONO, marginBottom: 6 })}>{idx}</div>
              <div style={px({ fontSize: 14, fontWeight: 700, lineHeight: 1.35 })}>{lbl}</div>
            </div>
          ))}
        </div>

        <div style={px({ marginTop: "auto", paddingTop: 26, borderTop: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between", alignItems: "flex-end" })}>
          <div style={px({ display: "flex", gap: 18, flexWrap: "wrap" })}>
            {legendSym(<span style={px({ width: 22, height: 22, borderRadius: "50%", border: `1.2px solid ${NAVY}`, background: "conic-gradient(#00215D 0 62%, transparent 0)" })} />, "פנסיה")}
            {legendSym(<span style={px({ width: 22, height: 22, border: `1.2px solid ${NAVY}`, borderRadius: "50% 50% 4px 4px", display: "flex", alignItems: "center", justifyContent: "center" })}><span style={px({ width: 7, height: 7, background: NAVY, borderRadius: "50%" })} /></span>, "ביטוחים")}
            {legendSym(<span style={px({ width: 22, height: 22, display: "flex", alignItems: "flex-end", gap: 2 })}><span style={px({ flex: 1, height: "40%", background: BORDER })} /><span style={px({ flex: 1, height: "70%", background: NAVY })} /><span style={px({ flex: 1, height: "100%", background: NAVY })} /></span>, "נכסים")}
            {legendSym(<span style={px({ width: 22, height: 22, border: `1.2px solid ${NAVY}`, display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr" })}><span style={px({ background: NAVY })} /><span /><span /><span style={px({ background: BORDER })} /></span>, "פירוק נכסים")}
            {legendSym(<span style={px({ width: 22, height: 22, borderRadius: "50%", border: `1.2px solid ${NAVY}`, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" })}><span style={px({ width: 1.2, height: 22, background: NAVY })} /><span style={px({ width: 7, height: 7, borderRadius: "50%", background: ROSE, marginInlineStart: -4.5 })} /></span>, "סעיף 28")}
            {legendSym(<span style={px({ width: 22, height: 22, borderRadius: "50%", border: `1.2px solid ${NAVY}`, borderLeftColor: ROSE, borderBottomColor: ROSE, transform: "rotate(-45deg)" })} />, "הלוואות")}
          </div>
          <div style={px({ fontFamily: MONOF, fontSize: 11, color: MONO })}>{`${String(n).padStart(2, "0")} / ${String(total).padStart(2, "0")}`}</div>
        </div>
      </section>
    );
  });

  // ---- 01 · פרטים אישיים וסיכום פנסיוני ----
  if (show("personal") || show("pension")) {
    pages.push((n, total) => {
      const rows = members.length ? members : [{ name: "—" }];
      const monPenWith = Number(family.monthlyPensionWithDeposits || 0);
      const monPenWithout = Number(family.monthlyPensionWithoutDeposits || 0);
      const lumpWith = Number(family.projectedLumpSumWithDeposits || 0);
      const lumpWithout = Number(family.projectedLumpSumWithoutDeposits || 0);
      const pensionDeltaPct = monPenWith > 0 ? Math.round(((monPenWithout - monPenWith) / monPenWith) * 100) : 0;
      const retireAge = memberDetail(members[0] || {}, "retireAge");
      const equity = Number(data.weightedEquityExposure || 0);
      const foreign = Number(data.weightedForeignExposure || 0);
      const PairBars = ({ label, withV, withoutV, fmt }) => {
        const hi = Math.max(withV, withoutV, 1);
        return (
          <div>
            <div style={px({ fontSize: 12, color: MLABEL, marginBottom: 12 })}>{label}</div>
            <div style={px({ display: "flex", alignItems: "flex-end", gap: 16, height: 164 })}>
              <div style={px({ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%", gap: 7 })}>
                <div style={px({ fontSize: 13.5, fontWeight: 800, textAlign: "center" })}>{fmt(withV)}</div>
                <div style={px({ height: `${clamp((withV / hi) * 100, withV ? 4 : 0, 100)}%`, background: NAVY })} />
              </div>
              <div style={px({ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%", gap: 7 })}>
                <div style={px({ fontSize: 13.5, fontWeight: 800, textAlign: "center", color: MUTED })}>{fmt(withoutV)}</div>
                <div style={px({ height: `${clamp((withoutV / hi) * 100, withoutV ? 4 : 0, 100)}%`, background: BORDER })} />
              </div>
            </div>
          </div>
        );
      };
      const ExposureScale = ({ label, value }) => (
        <div>
          <div style={px({ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 13.5, marginBottom: 11 })}><span style={px({ fontWeight: 600 })}>{label}</span><span style={px({ fontWeight: 800, fontSize: 16 })}>{Math.round(value)}%</span></div>
          <div style={px({ position: "relative", height: 7, background: TRACK })}>
            <div style={px({ position: "absolute", insetInlineStart: 0, top: 0, bottom: 0, width: `${clamp(value, 0, 100)}%`, background: NAVY })} />
            <div style={px({ position: "absolute", top: -5, right: `${clamp(100 - value, 0, 100)}%`, width: 3, height: 17, background: ROSE })} />
          </div>
          <div style={px({ display: "flex", justifyContent: "space-between", fontFamily: MONOF, fontSize: 10.5, color: MONO, marginTop: 6 })}><span>0%</span><span>50%</span><span>100%</span></div>
        </div>
      );
      return (
        <section class="rp-section" key="personal-pension" style={px(sheetPad)}>
          <ChapterHeader num={String(n - 1).padStart(2, "0")} title="פרטים אישיים וסיכום פנסיוני" subtitle="בני המשפחה · צבירה, הפקדות ותחזית לגיל פרישה" sym={<SymPension />} />
          <Lead text="ריכזנו את בני המשפחה המבוטחים לצד תמונת החיסכון הפנסיוני — סך הצבירה המעודכן, ההפקדות, והתחזית לצבירה ולקצבה החודשית בגיל פרישה, בהשוואה בין המשך הפקדות להפסקתן." />

          <div style={px({ marginTop: 22, border: `1px solid ${BORDER}`, background: CARD })}>
            <div style={px({ display: "grid", gridTemplateColumns: "1.6fr 1fr .8fr 1fr", gap: 12, padding: "10px 18px", background: PAPER, borderBottom: `1px solid ${BORDER}`, fontSize: 11, color: MLABEL })}>
              <div>בן משפחה</div><div>תאריך לידה</div><div>גיל פרישה</div><div>שכר נוכחי</div>
            </div>
            {rows.slice(0, 4).map((member, i) => (
              <div key={member.id || member.name || i} style={px({ display: "grid", gridTemplateColumns: "1.6fr 1fr .8fr 1fr", gap: 12, padding: "14px 18px", alignItems: "center", borderBottom: i < rows.slice(0, 4).length - 1 ? `1px solid ${DIV}` : "none" })}>
                <div style={px({ display: "flex", alignItems: "center", gap: 11 })}>
                  <PersonMark primary={i === 0} />
                  <div><div style={px({ fontSize: 14.5, fontWeight: 700 })}>{member.name || roleLabel(i)}</div><div style={px({ fontSize: 11.5, color: MUTED })}>{memberDetail(member, "lastWorkplace") || "מקום עבודה לא צוין"}</div></div>
                </div>
                <div style={px({ fontSize: 14 })}>{fmtDateDots(memberDetail(member, "birthDate"))}</div>
                <div style={px({ fontSize: 14 })}>{memberDetail(member, "retireAge") || "—"}</div>
                <div style={px({ fontSize: 15, fontWeight: 700 })}>{memberDetail(member, "currentSalary") ? capMoney(memberDetail(member, "currentSalary")) : "—"}</div>
              </div>
            ))}
            <div style={px({ display: "grid", gridTemplateColumns: "1.6fr 1fr .8fr 1fr", gap: 12, padding: "11px 18px", background: PAPER, borderTop: `1px solid ${BORDER}`, fontSize: 13.5 })}>
              <div style={px({ fontWeight: 700 })}>שכר מצרפי</div><div /><div /><div style={px({ fontWeight: 800, fontSize: 15 })}>{capMoney(combinedSalary)}</div>
            </div>
          </div>

          <div style={px({ marginTop: 26, display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 22 })}>
            {[["סך נכסים", family.totalAssets, false], ["הפקדה חודשית", family.monthlyDeposits, false], ["סך כיסויי חיים", totalLifeCoverage, false], ["קצבה חודשית צפויה", family.monthlyPensionWithDeposits, true]].map(([lbl, val, rose], i) => (
              <div key={i} style={px({ borderTop: `2px solid ${rose ? ROSE : NAVY}`, paddingTop: 11 })}>
                <div style={px({ fontSize: 11, color: MLABEL, marginBottom: 5 })}>{lbl}</div>
                <div style={px({ fontSize: 20, fontWeight: 800 })}>{val ? capMoney(val) : "—"}</div>
              </div>
            ))}
          </div>

          <div style={cardStyle({ marginTop: 26, padding: "22px 24px 18px" })}>
            <div style={px({ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 })}>
              <div style={px({ fontSize: 15.5, fontWeight: 700 })}>מה קורה אם ההפקדות נמשכות — ומה אם לא</div>
              <div style={px({ fontSize: 11.5, color: MUTED })}>תחזית לגיל פרישה{retireAge ? ` ${retireAge}` : ""}</div>
            </div>
            <div style={px({ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 34, marginTop: 18 })}>
              <PairBars label="צבירה צפויה" withV={lumpWith} withoutV={lumpWithout} fmt={capMoney} />
              <PairBars label="קצבה חודשית צפויה" withV={monPenWith} withoutV={monPenWithout} fmt={capMoney} />
            </div>
            <div style={px({ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 34, marginTop: 10, paddingTop: 12, borderTop: `1px solid ${DIV}` })}>
              <div style={px({ display: "flex", gap: 16, fontSize: 11.5, color: MUTED })}>
                <div style={px({ flex: 1, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 })}><span style={px({ width: 9, height: 9, background: NAVY, border: `1px solid ${NAVY}` })} />עם המשך הפקדות</div>
                <div style={px({ flex: 1, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 })}><span style={px({ width: 9, height: 9, background: BORDER, border: `1px solid ${BORDER2}` })} />ללא המשך</div>
              </div>
              <div style={px({ display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 10, fontSize: 12, color: MUTED })}><span style={px({ fontSize: 17, fontWeight: 800, color: ROSE })}>{pensionDeltaPct}%</span>בקצבה החודשית אם ההפקדות נעצרות היום</div>
            </div>
          </div>

          <div style={cardStyle({ marginTop: 26, padding: "22px 24px 20px" })}>
            <div style={px({ fontSize: 15.5, fontWeight: 700, marginBottom: 20 })}>איך התיק חשוף — מניות וחו״ל</div>
            <div style={px({ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 34 })}>
              <ExposureScale label="חשיפה מנייתית משוקללת" value={equity} />
              <ExposureScale label="חשיפה לחו״ל" value={foreign} />
            </div>
            <div style={px({ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${DIV}`, fontSize: 12.5, color: MUTED, lineHeight: 1.55 })}>הסמן האדום-ורוד מסמן את החשיפה ביחס לרף 50%. שני המדדים משוקללים לפי הצבירה בכל מוצר.</div>
          </div>

          <Foot n={n} total={total} />
        </section>
      );
    });
  }

  // ---- 02 · התפלגות נכסים ----
  if (show("allocation")) {
    pages.push((n, total) => {
      const prodSegs = ranked(products, RAMP);
      const mgrSegs = ranked(managers, RAMP);
      const trackSegs = ranked(mainGroups, RAMP10);
      const largest = prodSegs[0];
      const top2 = mgrSegs.slice(0, 2);
      const top2Sum = top2.reduce((s, x) => s + x.pct, 0);
      const RankedList = ({ segs, cols, swatch, fs }) => (
        <div style={px({ display: cols === 2 ? "grid" : "flex", gridTemplateColumns: cols === 2 ? "1fr 1fr" : undefined, flexDirection: cols === 2 ? undefined : "column", gap: cols === 2 ? "7px 26px" : 9, fontSize: fs || 13 })}>
          {segs.map((s, i) => (
            <div key={i} style={px({ display: "flex", alignItems: "center", gap: 9 })}>
              <span style={px({ width: swatch || 11, height: swatch || 11, background: s.color, border: s.color === BORDER || s.color === "#EFE3D4" ? `1px solid ${BORDER2}` : "none", boxSizing: "border-box", flex: "none" })} />
              <span style={px({ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" })} title={s.name}>{s.name}</span>
              {cols !== 2 ? <span style={px({ color: INK2 })}>{capMoney(s.value)}</span> : null}
              <span style={px({ width: 44, textAlign: "left", fontWeight: 700 })}>{s.pct.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      );
      const Strip = ({ segs, h }) => (
        <div style={px({ display: "flex", height: h, overflow: "hidden" })}>
          {segs.map((s, i) => <div key={i} style={px({ width: `${s.pct}%`, background: s.color })} />)}
        </div>
      );
      return (
        <section class="rp-section" key="allocation" style={px({ ...sheet, padding: "44px 52px 40px" })}>
          <ChapterHeader num={String(n - 1).padStart(2, "0")} title="התפלגות נכסים" subtitle="מוצרים · גופים מנהלים · אפיקים ראשיים" sym={<SymAssets />} />
          <div style={px({ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 30, marginTop: 18 })}>
            <p style={px({ margin: 0, fontSize: 13, lineHeight: 1.6, color: MUTED, maxWidth: "74ch" })}>הכספים מושקעים במסלולים שונים כדי לייצר תשואה ולשמור על ערך הכסף לאורך זמן. כאן רואים איפה הכסף מושקע — כמה נחשף למניות, כמה בחו״ל ואיך הוא מתפזר בין האפיקים.</p>
            <div style={px({ flex: "none", textAlign: "left" })}><div style={px({ fontSize: 11, color: MUTED })}>סך צבירה מנוהלת</div><div style={px({ fontSize: 22, fontWeight: 800 })}>{capMoney(family.totalAssets || productTotal)}</div></div>
          </div>

          <div style={cardStyle({ marginTop: 22, padding: "22px 24px" })}>
            <CardTitle title="חלוקה לפי מוצרים" right={`${prodSegs.length} קבוצות מוצר`} mb={18} />
            <div style={px({ display: "flex", alignItems: "center", gap: 30 })}>
              <div style={px({ position: "relative", width: 172, height: 172, flex: "none", borderRadius: "50%", background: prodSegs.length ? conicFromSegs(prodSegs) : "#EEE" })}>
                <div style={px({ position: "absolute", inset: 38, background: CARD, borderRadius: "50%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" })}>
                  <div style={px({ fontSize: 11, color: MUTED })}>הגדולה ביותר</div>
                  <div style={px({ fontSize: 15, fontWeight: 800 })}>{largest ? `${largest.pct.toFixed(1)}%` : "—"}</div>
                  <div style={px({ fontSize: 10.5, color: MUTED, textAlign: "center", lineHeight: 1.3, marginTop: 2 })}>{largest ? largest.name : ""}</div>
                </div>
              </div>
              <div style={px({ flex: 1 })}><RankedList segs={prodSegs} cols={1} /></div>
            </div>
          </div>

          <div style={cardStyle({ marginTop: 20, padding: "22px 24px" })}>
            <CardTitle title="חלוקה לפי גופים מנהלים" right={`${mgrSegs.length} גופים`} />
            <Strip segs={mgrSegs} h={34} />
            <div style={px({ marginTop: 16 })}><RankedList segs={mgrSegs} cols={2} /></div>
            {top2.length >= 2 ? <div style={px({ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${DIV}`, fontSize: 12.5, color: INK2 })}>{`${top2Sum.toFixed(1)}% מהצבירה מנוהלת בשני גופים — ${top2[0].name} ו${top2[1].name}.`}</div> : null}
          </div>

          <div style={cardStyle({ marginTop: 20, padding: "22px 24px" })}>
            <CardTitle title="חלוקה לפי אפיקים ראשיים" right={`${trackSegs.length} אפיקים`} />
            <Strip segs={trackSegs} h={26} />
            <div style={px({ marginTop: 16 })}><RankedList segs={trackSegs} cols={2} swatch={10} fs={12.5} /></div>
          </div>

          <Foot n={n} total={total} left={`ראו פירוט מלא בפרק ״פירוק נכסים״ · דוח פנסיוני משפחתי`} />
        </section>
      );
    });
  }

  // ---- 03 · תשואה משוקללת ודמי ניהול ----
  if (show("allocation") || (show("managementFees") && feeCards.length)) {
    const hasWeighted = show("allocation") && weightedReturns.groups.length;
    const hasFees = show("managementFees") && feeCards.length;
    pages.push((n, total) => {
      const grid = "1.45fr 1.25fr .72fr .72fr .72fr .62fr .58fr";
      const maxTotal = Math.max(...weightedReturns.groups.map((g) => g.total), 1);
      const colStats = (key) => {
        const vals = weightedReturns.groups.map((g) => g[key]).filter((v) => Number.isFinite(v) && v !== 0);
        return { min: Math.min(...vals), max: Math.max(...vals) };
      };
      const st12 = colStats("r12"), st36 = colStats("r36"), st60 = colStats("r60");
      const HeatCell = ({ v, stat }) => {
        const bg = heatColor(v, stat.min, stat.max);
        return <div style={px({ textAlign: "left" })}>{v ? <span style={px({ background: bg, padding: "3px 5px", color: heatIsDark(bg) ? NAVY : undefined })}>{fmtPct2(v)}</span> : <span style={px({ color: MUTED })}>—</span>}</div>;
      };
      const FeeBar = ({ pct, color }) => (
        <span style={px({ flex: 1, height: 6, background: TRACK, display: "block" })}><span style={px({ display: "block", width: `${clamp(pct, 0, 100)}%`, height: 6, background: color })} /></span>
      );
      const feeRow = (name, primary, balance, deposit, bold, isFamily) => (
        <div style={px({ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 12, alignItems: "center", padding: "11px 0", borderBottom: isFamily ? "none" : `1px solid ${DIV2}` })}>
          <div style={px({ display: "flex", alignItems: "center", gap: 10 })}>{isFamily ? null : <PersonMark primary={primary} size={26} dot={10} />}<span style={px({ fontSize: 13.5, fontWeight: bold ? 700 : 600 })}>{name}</span></div>
          <div style={px({ display: "flex", alignItems: "center", gap: 9 })}><FeeBar pct={balance * 100} color={primary ? NAVY : "#2B4A82"} /><span style={px({ width: 42, fontSize: 13.5, fontWeight: bold ? 800 : 700 })}>{fmtPct2(balance)}</span></div>
          <div style={px({ display: "flex", alignItems: "center", gap: 9 })}><FeeBar pct={deposit * 100} color={primary ? NAVY : "#2B4A82"} /><span style={px({ width: 42, fontSize: 13.5, fontWeight: bold ? 800 : 700 })}>{fmtPct2(deposit)}</span></div>
        </div>
      );
      const nonTotalCards = feeCards.filter((c) => !c.isTotal);
      const totalCard = feeCards.find((c) => c.isTotal);
      return (
        <section class="rp-section" key="returns-fees" style={px({ ...sheet, padding: "44px 52px 40px" })}>
          <ChapterHeader num={String(n - 1).padStart(2, "0")} title={hasWeighted && hasFees ? "תשואה משוקללת ודמי ניהול" : hasWeighted ? "תשואה משוקללת" : "דמי ניהול"} subtitle="ביצועי המוצרים ועלויות הניהול" sym={<SymReturns />} />
          <Lead text="התשואות ומדדי הסיכון מוצגים ברמת קבוצת מוצר, משוקללים לפי הצבירה בכל קבוצה — מבט ניהולי על התיק, ללא פירוט לפי פוליסה." />

          {hasWeighted ? (
            <div style={cardStyle({ marginTop: 20, padding: "20px 22px 18px" })}>
              <CardTitle title="תשואה לפי קבוצת מוצר" right={`${weightedReturns.totals.count} מוצרים · ${weightedReturns.groups.length} קבוצות`} mb={14} />
              <div style={px({ fontSize: 12.5 })}>
                <div style={px({ display: "grid", gridTemplateColumns: grid, background: NAVY, color: PAPER, padding: "9px 12px", fontSize: 11.5 })}>
                  <div>קבוצת מוצר</div><div>סך צבירה</div><div style={px({ textAlign: "left" })}>ח׳12</div><div style={px({ textAlign: "left" })}>ח׳36</div><div style={px({ textAlign: "left" })}>ח׳60</div><div style={px({ textAlign: "left", opacity: 0.72 })}>ס״ת 36</div><div style={px({ textAlign: "left", opacity: 0.72 })}>שארפ</div>
                </div>
                {weightedReturns.groups.map((g, i) => (
                  <div key={i} style={px({ display: "grid", gridTemplateColumns: grid, alignItems: "center", padding: "9px 12px", borderBottom: `1px solid ${DIV2}` })}>
                    <div style={px({ display: "flex", alignItems: "center", gap: 8 })}><span style={px({ width: 8, height: 8, borderRadius: "50%", background: RAMP[Math.min(i, RAMP.length - 1)], flex: "none" })} />{g.type} <span style={px({ color: MUTED })}>·{g.count}</span></div>
                    <div><div style={px({ height: 5, width: `${clamp((g.total / maxTotal) * 100, 4, 100)}%`, background: RAMP[Math.min(i, RAMP.length - 1)], marginBottom: 3 })} />{capMoney(g.total)}</div>
                    <HeatCell v={g.r12} stat={st12} /><HeatCell v={g.r36} stat={st36} /><HeatCell v={g.r60} stat={st60} />
                    <div style={px({ textAlign: "left", color: MUTED })}>{g.st ? fmtPct2(g.st) : "—"}</div>
                    <div style={px({ textAlign: "left", color: MUTED })}>{g.sharp ? fmtNum2(g.sharp) : "—"}</div>
                  </div>
                ))}
                <div style={px({ display: "grid", gridTemplateColumns: grid, alignItems: "center", padding: "11px 12px", background: PAPER, borderTop: `1px solid ${BORDER}`, fontWeight: 700 })}>
                  <div>סה״כ משוקלל</div><div>{capMoney(weightedReturns.allTotal)}</div>
                  <div style={px({ textAlign: "left" })}>{fmtPct2(weightedReturns.totals.r12)}</div><div style={px({ textAlign: "left" })}>{fmtPct2(weightedReturns.totals.r36)}</div><div style={px({ textAlign: "left" })}>{fmtPct2(weightedReturns.totals.r60)}</div>
                  <div style={px({ textAlign: "left", color: INK2 })}>{fmtPct2(weightedReturns.totals.st)}</div><div style={px({ textAlign: "left", color: INK2 })}>{fmtNum2(weightedReturns.totals.sharp)}</div>
                </div>
              </div>
              <div style={px({ marginTop: 12, display: "flex", alignItems: "center", gap: 10, fontSize: 11.5, color: MUTED })}>
                <span>עוצמת גוון = תשואה גבוהה יותר בטור</span>
                <span style={px({ display: "flex", gap: 2 })}>{["#F0F3F8", "#DCE3EE", "#C6D1E4", "#9FB0CC"].map((c, i) => <span key={i} style={px({ width: 16, height: 9, background: c })} />)}</span>
              </div>
            </div>
          ) : null}

          {hasFees ? (
            <div style={cardStyle({ marginTop: 20, padding: "20px 22px 18px" })}>
              <CardTitle title="דמי ניהול" right="משוקלל לפי צבירה והפקדה" />
              <div style={px({ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 12, fontSize: 11.5, color: MUTED })}>
                <div>בן משפחה</div><div>מצבירה</div><div>מהפקדה</div>
              </div>
              {nonTotalCards.map((c, i) => feeRow(c.name || roleLabel(i), i === 0, Number(c.feeFromBalance || 0), Number(c.feeFromDeposit || 0), false, false))}
              {totalCard ? feeRow("משוקלל משפחתי", true, Number(totalCard.feeFromBalance || 0), Number(totalCard.feeFromDeposit || 0), true, true) : null}
              <div style={px({ marginTop: 6, paddingTop: 14, borderTop: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 26 })}>
                {feeMoney.map((m, i) => (
                  <div key={i}><div style={px({ fontSize: 11, color: MUTED })}>עלות שנתית · {m.name}</div><div style={px({ fontSize: 16, fontWeight: 700 })}>{capMoney(m.annual)}</div></div>
                ))}
                <div style={px({ marginInlineStart: "auto", textAlign: "left", borderInlineStart: `1px solid ${DIV}`, paddingInlineStart: 22 })}>
                  <div style={px({ fontSize: 11, color: MUTED })}>עלות משפחתית כוללת בשנה</div>
                  <div style={px({ fontSize: 24, fontWeight: 800 })}>{capMoney(feeAnnualTotal)}</div>
                  <div style={px({ fontSize: 12, color: ROSE, fontWeight: 700 })}>{capMoney(feeMonthlyTotal)} לחודש</div>
                </div>
              </div>
            </div>
          ) : null}

          <Foot n={n} total={total} gap={16} left="העלות בכסף מחושבת לפי דמי הניהול המשוקללים והצבירה/ההפקדה הנוכחיות, בהנחה של המשך המצב הקיים לאורך שנה." />
        </section>
      );
    });
  }

  // ---- 04 · סכומים למקרה פטירה והלוואות ----
  if (show("insurance") || show("loans")) {
    pages.push((n, total) => {
      const sumDeath = members.reduce((s, m) => s + Number(m.deathCoverage || 0), 0);
      const sumDisab = members.reduce((s, m) => s + Number(m.disabilityValue || 0), 0);
      const maxDeath = Math.max(...members.map((m) => Number(m.deathCoverage || 0)), 1);
      const pensionRows = Array.isArray(deathBenefit?.pensionRows) ? deathBenefit.pensionRows : [];
      const primaryName = members[0]?.name || "";
      const byMember = (name) => pensionRows.filter((r) => (r.memberName || "") === name);
      const memberSum = (name) => byMember(name).reduce((s, r) => s + Number(r.totalPension || 0), 0);
      const spouseNames = [...new Set(pensionRows.map((r) => r.memberName).filter((nm) => nm && nm !== primaryName))];
      const spouseSum = spouseNames.reduce((s, nm) => s + memberSum(nm), 0);
      const spouseCount = spouseNames.reduce((s, nm) => s + byMember(nm).length, 0);
      const primarySum = memberSum(primaryName);
      const primaryCount = byMember(primaryName).length;
      const productWord = (c) => (c === 1 ? "מוצר אחד" : `${c} מוצרים`);
      const firstLoan = loanDetails[0] || {};
      const hasDeath = show("insurance");
      const hasLoans = show("loans") && loanDetails.length;
      return (
        <section class="rp-section" key="protections-loans" style={px({ ...sheet, padding: "44px 52px 40px" })}>
          <ChapterHeader num={String(n - 1).padStart(2, "0")} title={hasDeath && hasLoans ? "סכומים למקרה פטירה והלוואות" : hasDeath ? "סכומים למקרה פטירה" : "הלוואות"} subtitle="הגנות ביטוחיות והתחייבויות על החיסכון" sym={<SymProtection />} />
          <Lead text="לצד החיסכון לעתיד, חלק זה מפרט את ההגנה הכלכלית הקיימת היום במקרה של אובדן כושר עבודה או פטירה, ואת רשת הביטחון המשפחתית." />

          {hasDeath ? (
            <>
              <div style={cardStyle({ marginTop: 20, padding: "22px 24px 18px" })}>
                <CardTitle title="כיסויים לפי בן משפחה" right="הפסים ביחס לכיסוי הגדול בין בני המשפחה" mb={18} />
                {members.map((m, i) => {
                  const death = Number(m.deathCoverage || 0);
                  const isMax = death === maxDeath && death > 0;
                  const pctOfMax = (death / maxDeath) * 100;
                  const disab = Number(m.disabilityValue || 0);
                  const disabPct = Math.round(Number(m.disabilityPercent || 0));
                  const last = i === members.length - 1;
                  return (
                    <div key={m.id || m.name || i} style={px({ display: "grid", gridTemplateColumns: "1.15fr 1.5fr 1fr", gap: 20, alignItems: "center", padding: last ? "16px 0 0" : "0 0 16px", borderBottom: last ? "none" : `1px solid ${i === 0 ? DIV2 : BORDER}` })}>
                      <div style={px({ display: "flex", alignItems: "center", gap: 10 })}><PersonMark primary={i === 0} size={28} dot={10} /><span style={px({ fontSize: 14, fontWeight: 700 })}>{m.name || roleLabel(i)}</span></div>
                      <div>
                        <div style={px({ display: "flex", justifyContent: "space-between", fontSize: 11, color: MUTED, marginBottom: 5 })}><span>הון למוטבים / פטירה</span><span>{isMax ? "הגדול בין בני המשפחה" : `${pctOfMax.toFixed(1)}% מהגדול`}</span></div>
                        <div style={px({ display: "flex", alignItems: "center", gap: 10 })}><span style={px({ flex: 1, height: 8, background: TRACK, display: "block" })}><span style={px({ display: "block", width: `${clamp(pctOfMax, death ? 2 : 0, 100)}%`, height: 8, background: i === 0 ? NAVY : "#2B4A82" })} /></span><span style={px({ fontSize: 14, fontWeight: 700, width: 88 })}>{capMoney(death)}</span></div>
                      </div>
                      <div><div style={px({ fontSize: 11, color: MUTED, marginBottom: 5 })}>אכ״ע חודשי</div><div style={px({ fontSize: 14, fontWeight: 700 })}>{capMoney(disab)} {disabPct ? <span style={px({ fontSize: 11.5, color: MUTED, fontWeight: 400 })}>{disabPct}% משכר</span> : null}</div></div>
                    </div>
                  );
                })}
                <div style={px({ display: "grid", gridTemplateColumns: "1.15fr 1.5fr 1fr", gap: 20, alignItems: "center", paddingTop: 14 })}>
                  <div style={px({ fontSize: 14, fontWeight: 700 })}>סה״כ משפחתי</div>
                  <div style={px({ fontSize: 19, fontWeight: 800 })}>{capMoney(sumDeath)}</div>
                  <div style={px({ fontSize: 19, fontWeight: 800 })}>{capMoney(sumDisab)}</div>
                </div>
              </div>

              {pensionRows.length ? (
                <div style={cardStyle({ marginTop: 20, padding: "22px 24px 18px" })}>
                  <CardTitle title="קצבה חודשית מקרן הפנסיה" right={`${pensionRows.length} מוצרים`} />
                  <div style={px({ fontSize: 12.5 })}>
                    <div style={px({ display: "grid", gridTemplateColumns: "1.5fr 1.4fr .95fr .95fr 1fr", gap: 10, padding: "9px 12px", background: PAPER, border: `1px solid ${BORDER}`, fontSize: 11, color: MUTED })}>
                      <div>בן משפחה</div><div>שם מוצר</div><div style={px({ textAlign: "left" })}>לאלמנה</div><div style={px({ textAlign: "left" })}>ליתום</div><div style={px({ textAlign: "left" })}>סך קצבה</div>
                    </div>
                    {pensionRows.slice(0, 8).map((r, i) => (
                      <div key={r.id || i} style={px({ display: "grid", gridTemplateColumns: "1.5fr 1.4fr .95fr .95fr 1fr", gap: 10, padding: 12, alignItems: "center", borderBottom: i < Math.min(pensionRows.length, 8) - 1 ? `1px solid ${DIV2}` : "none" })}>
                        <div style={px({ display: "flex", alignItems: "center", gap: 9 })}><PersonMark primary={(r.memberName || "") === primaryName} size={24} dot={9} />{r.memberName || "—"}</div>
                        <div>{r.planName || "—"}</div>
                        <div style={px({ textAlign: "left" })}>{capMoney(r.widowPension)}</div>
                        <div style={px({ textAlign: "left" })}>{capMoney(r.orphanPension)}</div>
                        <div style={px({ textAlign: "left", fontWeight: 700, fontSize: 13.5 })}>{capMoney(r.totalPension)}</div>
                      </div>
                    ))}
                  </div>
                  <div style={px({ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 16 })}>
                    <div style={px({ flex: 1, fontSize: 11.5, color: MUTED, lineHeight: 1.5 })}>סך הקצבה החודשית לאלמנה וליתומים אינה יכולה לעלות על השכר המבוטח. הפיצוי לכל יתום משולם עד גיל 21.</div>
                    <div style={px({ flex: "none", display: "flex", gap: 20, borderInlineStart: `1px solid ${DIV}`, paddingInlineStart: 20 })}>
                      {spouseNames.length ? <div><div style={px({ fontSize: 11, color: MUTED })}>בפטירת בן/בת הזוג</div><div style={px({ fontSize: 19, fontWeight: 800 })}>{capMoney(spouseSum)}</div><div style={px({ fontSize: 10.5, color: MUTED })}>{productWord(spouseCount)}</div></div> : null}
                      <div><div style={px({ fontSize: 11, color: MUTED })}>בפטירת המבוטח הראשי</div><div style={px({ fontSize: 19, fontWeight: 800 })}>{capMoney(primarySum)}</div><div style={px({ fontSize: 10.5, color: MUTED })}>{productWord(primaryCount)}</div></div>
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}

          {hasLoans ? (
            <div style={cardStyle({ marginTop: 20, padding: "22px 24px 18px" })}>
              <CardTitle title="הלוואות על החיסכון" right={loanDetails.length === 1 ? "הלוואה אחת פעילה" : `${loanDetails.length} הלוואות פעילות`} />
              <div style={px({ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 28, alignItems: "center" })}>
                <div>
                  <div style={px({ display: "grid", gridTemplateColumns: "1fr 1fr 1.1fr", gap: 10, fontSize: 11, color: MUTED, paddingBottom: 8, borderBottom: `1px solid ${DIV2}` })}>
                    <div>סכום שנלקח</div><div>יתרה</div><div>תדירות · סיום</div>
                  </div>
                  <div style={px({ display: "grid", gridTemplateColumns: "1fr 1fr 1.1fr", gap: 10, paddingTop: 12, alignItems: "baseline" })}>
                    <div style={px({ fontSize: 16, fontWeight: 700 })}>{capMoney(totalLoansAmount)}</div>
                    <div style={px({ fontSize: 16, fontWeight: 700 })}>{capMoney(totalLoansBalance)}</div>
                    <div style={px({ fontSize: 12.5, color: INK2, lineHeight: 1.4 })}>{firstLoan.repaymentFrequency || "תשלום חודשי"}<br />{firstLoan.endDate ? `עד ${fmtDateDots(firstLoan.endDate)}` : ""}</div>
                  </div>
                </div>
                <div style={px({ borderInlineStart: `1px solid ${DIV}`, paddingInlineStart: 24 })}>
                  <div style={px({ fontSize: 11, color: MUTED, marginBottom: 8 })}>יתרת ההלוואות מסך הצבירה</div>
                  <div style={px({ display: "flex", alignItems: "baseline", gap: 8 })}><span style={px({ fontSize: 26, fontWeight: 800 })}>{totalLoansPct.toFixed(1)}%</span><span style={px({ fontSize: 11.5, color: MUTED })}>מ-{capMoney(family.totalAssets)}</span></div>
                  <div style={px({ position: "relative", height: 8, background: TRACK, marginTop: 12 })}><div style={px({ position: "absolute", insetInlineStart: 0, top: 0, bottom: 0, width: `${clamp(totalLoansPct, 0, 100)}%`, background: ROSE })} /></div>
                  <div style={px({ display: "flex", justifyContent: "space-between", fontFamily: MONOF, fontSize: 10.5, color: MONO, marginTop: 6 })}><span>0%</span><span>100%</span></div>
                </div>
              </div>
            </div>
          ) : null}

          <Foot n={n} total={total} gap={16} />
        </section>
      );
    });
  }

  // ---- 05 · סיכום שיחה ----
  if (show("summary")) {
    pages.push((n, total) => (
      <section class="rp-section" key="summary" style={px({ ...sheet, padding: "44px 52px 40px" })}>
        <ChapterHeader num={String(n - 1).padStart(2, "0")} title="סיכום שיחה" subtitle="תובנות מהפגישה והמלצות להמשך" sym={<SymConversation />} />
        <div style={px({ marginTop: 22, display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" })}>
          <div style={px({ display: "flex", alignItems: "center", gap: 9 })}><PersonMark primary size={28} dot={10} /><PersonMark primary={false} size={28} dot={10} /></div>
          <div style={px({ fontSize: 14, fontWeight: 600 })}>פגישה · {fmtDateDots(reportDate)}</div>
          <div style={px({ marginInlineStart: "auto", fontFamily: MONOF, fontSize: 11, color: MONO })}>נכונות נתונים {monthYear(family.dataValidityDate)}</div>
        </div>

        <div style={cardStyle({ marginTop: 22, padding: "26px 28px 24px", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" })}>
          <div style={px({ fontSize: 15.5, fontWeight: 700, marginBottom: 4 })}>מה עלה בפגישה</div>
          <div style={px({ fontSize: 12, color: MUTED, marginBottom: 18 })}>אזור לטקסט חופשי — מהמנגנון או בכתב יד</div>
          {summaryParagraphs.length || recommendationItems.length ? (
            <div style={px({ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 12, overflow: "hidden" })}>
              {summaryParagraphs.map((block, i) => {
                const lines = block.split(/\n+/).map((l) => l.trim()).filter(Boolean);
                const isTopic = lines.length > 1;
                return (
                  <div key={`s-${i}`}>
                    {isTopic ? <div style={px({ color: NAVY, fontSize: 14, fontWeight: 800, marginBottom: 4 })}>{lines[0]}</div> : null}
                    <div style={px({ fontSize: 13, lineHeight: 1.7, color: INK2, whiteSpace: "pre-wrap" })}>{isTopic ? lines.slice(1).join("\n") : block}</div>
                  </div>
                );
              })}
              {recommendationItems.length ? (
                <div style={px({ marginTop: 4 })}>
                  <div style={px({ color: NAVY, fontSize: 14, fontWeight: 800, marginBottom: 8 })}>צעדים להמשך</div>
                  <div style={px({ display: "flex", flexDirection: "column", gap: 8 })}>
                    {recommendationItems.map((it, i) => (
                      <div key={i} style={px({ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, color: INK2, lineHeight: 1.6 })}><span style={px({ width: 6, height: 6, borderRadius: "50%", background: ROSE, flex: "none", marginTop: 7 })} />{it}</div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div style={px({ flex: 1, minHeight: 0, background: "repeating-linear-gradient(#FFFFFF 0 32px,#EFE7DC 32px 33px)", borderTop: `1px solid ${TRACK}` })} />
          )}
        </div>

        <div style={px({ marginTop: "auto", paddingTop: 18, borderTop: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 20 })}>
          <div style={px({ fontSize: 11, color: MUTED, lineHeight: 1.55, maxWidth: "80ch" })}>הדוח נועד להאיר את התמונה הפיננסית המשפחתית ואינו מהווה ייעוץ, שיווק פנסיוני או המלצה לביצוע פעולה. הנתונים מבוססים על המידע שהתקבל מהגופים המנהלים נכון לתאריך נכונות הנתונים המצוין בשער.</div>
          <div style={px({ fontFamily: MONOF, fontSize: 11, color: MONO, flex: "none" })}>{`${String(n).padStart(2, "0")} / ${String(total).padStart(2, "0")}`}</div>
        </div>
      </section>
    ));
  }

  // ---- 06 · פירוק נכסים (אופציונלי) ----
  if (show("capitalClassification") && hasCapitalClassification) {
    pages.push((n, total) => {
      const classSegs = [
        { name: "קצבה · מיועד לקצבה חודשית", value: capTotalPension, color: NAVY },
        { name: "קרנות השתלמות · צבירה בלבד", value: capStudyBalance, color: "#6E86AE" },
        { name: "הון · נזיל, כספים הוניים", value: Math.max(capTotalCapital - capStudyBalance, 0), color: BORDER2 },
      ].filter((s) => s.value > 0);
      const classTotal = classSegs.reduce((s, x) => s + x.value, 0) || 1;
      const grid = "1.25fr .95fr .95fr .95fr .95fr .95fr .9fr";
      return (
        <section class="rp-section" key="capital" style={px({ ...sheet, padding: "44px 52px 40px" })}>
          <ChapterHeader num={String(n - 1).padStart(2, "0")} title="פירוק נכסים" subtitle="סיווג הוני / קצבתי · ברמת קבוצת מוצר" sym={<SymDecomp />} />
          <Lead max={90} text="הכספים מסווגים לפי ייעודם בגיל פרישה: כספים הוניים הניתנים למשיכה כסכום חד-פעמי, וכספים קצבתיים המיועדים לקצבה חודשית. הסיווג מוצג ברמת קבוצת מוצר." />

          <div style={cardStyle({ marginTop: 20, padding: "22px 24px 20px" })}>
            <CardTitle title="איך הכסף מסווג" right="שלושה סיווגים · אחוזים מסך הצבירה" mb={18} />
            <div style={px({ display: "flex", height: 30, overflow: "hidden" })}>
              {classSegs.map((s, i) => <div key={i} style={px({ width: `${(s.value / classTotal) * 100}%`, background: s.color })} />)}
            </div>
            <div style={px({ display: "flex", flexDirection: "column", gap: 11, marginTop: 16, fontSize: 13 })}>
              {classSegs.map((s, i) => (
                <div key={i} style={px({ display: "flex", alignItems: "center", gap: 10 })}>
                  <span style={px({ width: 11, height: 11, background: s.color, flex: "none" })} />
                  <span style={px({ flex: 1 })}>{s.name.split(" · ")[0]} <span style={px({ color: MUTED })}>· {s.name.split(" · ")[1]}</span></span>
                  <span style={px({ color: INK2 })}>{capMoney(s.value)}</span>
                  <span style={px({ width: 46, textAlign: "left", fontWeight: 700 })}>{((s.value / classTotal) * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
            <div style={px({ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${DIV}`, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 22 })}>
              {[["סה״כ צבירה", capTotalBalance], ["סה״כ תגמולים", capTotalRewards], ["סה״כ פיצויים", capTotalSeverance]].map(([lbl, v], i) => (
                <div key={i}><div style={px({ fontSize: 11, color: MUTED })}>{lbl}</div><div style={px({ fontSize: 18, fontWeight: 800 })}>{capMoney(v)}</div></div>
              ))}
            </div>
          </div>

          {capGroups.length ? (
            <div style={cardStyle({ marginTop: 20, padding: "20px 22px 18px", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" })}>
              <CardTitle title="פירוק לפי קבוצת מוצר" right="₪ · סיווג קצבתי / הוני" mb={14} />
              <div style={px({ fontSize: 12, flex: 1, minHeight: 0, display: "flex", flexDirection: "column" })}>
                <div style={px({ display: "grid", gridTemplateColumns: grid, gap: 8, background: NAVY, color: PAPER, padding: "9px 12px", fontSize: 10.5, lineHeight: 1.3 })}>
                  <div>קבוצת מוצר</div>{capCols.map((c) => <div key={c.key} style={px({ textAlign: "left" })}>{c.label}</div>)}
                </div>
                {capGroups.map((g, i) => (
                  <div key={i} style={px({ display: "grid", gridTemplateColumns: grid, gap: 8, padding: "10px 12px", borderBottom: `1px solid ${DIV2}`, flex: 1, alignItems: "center" })}>
                    <div>{g.label}</div>
                    {capCols.map((c) => { const v = summarizeCapitalDerivedRows(g.rows, c.key); return <div key={c.key} style={px({ textAlign: "left", color: v ? undefined : MUTED, fontWeight: c.key === "totalCapital" ? 700 : 400 })}>{capMoney(v)}</div>; })}
                  </div>
                ))}
                <div style={px({ display: "grid", gridTemplateColumns: grid, gap: 8, padding: "11px 12px", background: PAPER, borderTop: `1px solid ${BORDER}`, fontWeight: 700, flex: 1, alignItems: "center" })}>
                  <div>סה״כ</div>{capCols.map((c) => <div key={c.key} style={px({ textAlign: "left" })}>{capMoney(summarizeCapitalDerivedRows(allCapitalPension, c.key))}</div>)}
                </div>
                {capStudyBalance > 0 ? (
                  <div style={px({ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 12px", marginTop: 10, border: `1px solid ${BORDER}`, background: PAPER, flex: "none" })}>
                    <div style={px({ display: "flex", alignItems: "center", gap: 9, fontSize: 12.5 })}><span style={px({ width: 10, height: 10, background: "#6E86AE" })} />קרנות השתלמות — צבירה בלבד</div>
                    <div style={px({ fontSize: 14, fontWeight: 800 })}>{capMoney(capStudyBalance)}</div>
                  </div>
                ) : null}
              </div>
              <div style={px({ marginTop: 16, fontSize: 10.5, color: MUTED, lineHeight: 1.55 })}>כספים הוניים כוללים רכיבי הון, תגמולים הוניים ותגמולים קצבתיים עד שנת 2000. קרנות השתלמות מוצגות כצבירה בלבד. עמודות מקדם ההמרה והעלות הצפויה לגיל פרישה הן הערכה תיאורטית להמחשה בלבד, ואינן מוצגות כאן כשאין נתון.</div>
            </div>
          ) : null}

          <Foot n={n} total={total} />
        </section>
      );
    });
  }

  // ---- 07 · קיטום סעיף 28 (אופציונלי) ----
  if (show("section28") && hasSection28Capping) {
    section28CappingEntries.forEach((entry, entryIndex) => {
      const groups = Array.isArray(entry?.groups) ? entry.groups : [];
      const costGroup = getSection28Group(groups, "employer-cost", "עלויות") || groups[0];
      const costRows = section28Meaningful(costGroup?.rows);
      const allRows = groups.flatMap((g) => section28Meaningful(g?.rows));
      const monthlyRow = allRows.find((r) => isSection28MonthlySavingRow(r.label));
      const employerRows = pickSection28Rows(costRows, ["פיצויים מעל לתקרה", "תגמולים מעל לתקרה", "השתלמות מעל תקרה"]);
      const employerSummary = pickSection28Rows(costRows, ["סכום קיטום מעל לסעיף 28 ברוטו", "סכום נטו לאחר ניכוי מס שולי"]);
      const employeeRows = pickSection28Rows(costRows, ["גידול בנטו בעקבות קיטום בפיצויים", "גידול בנטו בעקבות קיטום תגמולים", "הפרשות עובד תגמולים"]);
      const employeeSummary = pickSection28Rows(costRows, ['סה"כ גידול נטו', "סה״כ גידול נטו", "סך הכל גידול נטו"]);
      const comparisonRows = Array.isArray(entry?.comparisonRows) ? entry.comparisonRows : [];
      const CmpRow = ({ label, sub, before, after, highlight, total: isTot }) => {
        const gapNum = section28NumericValue(after) - section28NumericValue(before);
        const hasGap = isMeaningfulSection28Value(before) && isMeaningfulSection28Value(after);
        return (
          <div style={px({ display: "grid", gridTemplateColumns: "2.1fr 1fr 1fr 1fr", gap: 10, padding: isTot ? "12px" : "17px 12px", background: isTot ? PAPER : (highlight ? "#FBFAF7" : "transparent"), borderTop: isTot ? `1px solid ${BORDER}` : "none", borderBottom: isTot ? "none" : `1px solid ${DIV2}`, fontWeight: isTot ? 700 : 400 })}>
            <div>{label}{sub ? <span style={px({ color: MUTED })}> · {sub}</span> : null}</div>
            <div style={px({ textAlign: "left", color: isMeaningfulSection28Value(before) ? undefined : MUTED })}>{isMeaningfulSection28Value(before) ? formatSection28DisplayValue(before) : "—"}</div>
            <div style={px({ textAlign: "left", color: isMeaningfulSection28Value(after) ? undefined : MUTED })}>{isMeaningfulSection28Value(after) ? formatSection28DisplayValue(after) : "—"}</div>
            <div style={px({ textAlign: "left", color: hasGap ? (gapNum < 0 ? ROSE_DK : (isTot ? ROSE : MUTED)) : MUTED, fontWeight: hasGap && gapNum !== 0 ? 700 : 400 })}>{hasGap && gapNum !== 0 ? `${gapNum < 0 ? "−" : "+"}${formatSection28DisplayValue(Math.abs(gapNum))}` : "—"}</div>
          </div>
        );
      };
      const CostCard = ({ title, rows, summary }) => (
        <div style={cardStyle({ padding: "22px 24px 18px" })}>
          <div style={px({ fontSize: 15, fontWeight: 700, marginBottom: 16 })}>{title}</div>
          <div style={px({ fontSize: 13 })}>
            {rows.map((r, i) => (
              <div key={`r-${i}`} style={px({ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 0", borderBottom: `1px solid ${DIV2}` })}><span style={px({ color: INK2, lineHeight: 1.4 })}>{r.label}</span><span style={px({ fontWeight: 700 })}>{formatSection28DisplayValue(r.value)}</span></div>
            ))}
            {summary.map((r, i) => (
              <div key={`s-${i}`} style={px({ display: "flex", justifyContent: "space-between", gap: 12, padding: i === summary.length - 1 ? "12px 0 0" : "11px 0", borderBottom: i === summary.length - 1 ? "none" : `1px solid ${BORDER}`, alignItems: "flex-end" })}><span style={px({ fontWeight: 700, lineHeight: 1.4, maxWidth: "24ch" })}>{r.label}</span><span style={px({ fontWeight: 800, fontSize: i === summary.length - 1 ? 17 : 14 })}>{formatSection28DisplayValue(r.value)}</span></div>
            ))}
            {!rows.length && !summary.length ? <div style={px({ color: MUTED })}>אין נתון להצגה</div> : null}
          </div>
        </div>
      );
      pages.push((n, total) => (
        <section class="rp-section" key={`s28-${entryIndex}`} style={px({ ...sheet, padding: "44px 52px 40px" })}>
          <ChapterHeader num={String(n - 1).padStart(2, "0")} title="קיטום סעיף 28" subtitle={`${entry.ownerLabel || "מבוטח/ת ראשית"} · השפעה על הנטו ועל החיסכון`} marker={<PersonMark primary size={26} dot={10} />} sym={<SymSection28 />} />
          <Lead max={92} text="קיטום לפי סעיף 28 משמעותו הפחתה יחסית של כלל רכיבי השכר, כך שסכומם הכולל לא יעלה על התקרה הקבועה בחוק — עד פי שמונה משכר המינימום. הקיטום אינו מבטל רכיב שכר מסוים, אלא מפחית באופן יחסי את כלל הרכיבים, ובכך עשוי להגדיל את השכר נטו המשולם בתלוש." />

          <div style={px({ marginTop: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 })}>
            <CostCard title="חלק מעסיק" rows={employerRows} summary={employerSummary} />
            <CostCard title="חלק עובד" rows={employeeRows} summary={employeeSummary} />
          </div>

          {monthlyRow ? (
            <div style={px({ marginTop: 20, background: NAVY, color: PAPER, padding: "24px 26px", display: "flex", alignItems: "center", gap: 26 })}>
              <div style={px({ flex: 1 })}>
                <div style={px({ fontSize: 12, color: BORDER })}>{monthlyRow.label}</div>
                <div style={px({ fontSize: 34, fontWeight: 800, lineHeight: 1.1, marginTop: 4 })}>{formatSection28DisplayValue(monthlyRow.value)}</div>
              </div>
              <div style={px({ flex: "none", display: "flex", alignItems: "flex-end", gap: 6, height: 64 })}>
                {[34, 26, 31, 100].map((h, i) => <div key={i} style={px({ width: 16, height: `${h}%`, background: i === 3 ? BORDER : "rgba(226,209,191,.5)" })} />)}
              </div>
            </div>
          ) : null}

          {comparisonRows.length ? (
            <div style={cardStyle({ marginTop: 20, padding: "22px 24px 20px", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" })}>
              <CardTitle title="השוואה בין תרחישים · סה״כ הון" right="לגיל פרישה" mb={6} />
              <div style={px({ marginTop: 16, fontSize: 12.5 })}>
                <div style={px({ display: "grid", gridTemplateColumns: "2.1fr 1fr 1fr 1fr", gap: 10, background: NAVY, color: PAPER, padding: "9px 12px", fontSize: 11 })}>
                  <div>סעיף</div><div style={px({ textAlign: "left" })}>לפני קיטום</div><div style={px({ textAlign: "left" })}>אחרי קיטום</div><div style={px({ textAlign: "left" })}>פער</div>
                </div>
                {comparisonRows.map((r, i) => {
                  const label = normalizeSection28Text(r.label).replace(/סהכ/g, 'סה"כ');
                  const isTot = label.includes('סה"כ הון');
                  return <CmpRow key={i} label={r.label} sub={r.sub || r.note} before={r.before} after={r.after} highlight={label.includes("קצבה")} total={isTot} />;
                })}
              </div>
            </div>
          ) : null}

          <Foot n={n} total={total} gap={16} />
        </section>
      ));
    });
  }

  // ---- 08 · קצבה מוכרת (אופציונלי) ----
  if (show("recognizedPension") && hasRecognizedPension) {
    recognizedPensionEntries.forEach((entry, entryIndex) => {
      const vestedRows = Array.isArray(entry?.vestedBalanceTable?.rows) ? entry.vestedBalanceTable.rows : [];
      const manualRows = getManualRecognizedPensionRows(entry?.recognizedPensionAdjustments);
      const pdfTotal = getPdfExemptPaymentsTotal(vestedRows);
      const manualTotal = manualRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
      const gap = pdfTotal - manualTotal;
      pages.push((n, total) => (
        <section class="rp-section" key={`recognized-${entryIndex}`} style={px({ ...sheet, padding: "44px 52px 40px" })}>
          <ChapterHeader num={String(n - 1).padStart(2, "0")} title="קצבה מוכרת" subtitle={`${entry.ownerLabel || "מבוטח/ת ראשית"} · החלק שעשוי להיות פטור ממס`} marker={<PersonMark primary size={26} dot={10} />} sym={<SymAnnuity />} />
          <Lead max={92} text="קצבה מוכרת היא החלק בקצבה שנובע מהפקדות שכבר שולם עליהן מס, או מהפקדות שלא ניתנה בגינן הטבת מס. לכן, בעת קבלת הקצבה בגיל פרישה, חלק זה עשוי להיות פטור ממס — בכפוף להוראות החוק ולהכרה של רשות המסים." />

          {vestedRows.length ? (
            <div style={cardStyle({ marginTop: 20, padding: "22px 24px 20px", flex: "none" })}>
              <CardTitle title="לפי טבלת החישוב במסמך" right="תשלומים פטורים · קצבה מוכרת" />
              <div style={px({ fontSize: 13 })}>
                <div style={px({ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr", gap: 12, padding: "9px 12px", background: PAPER, border: `1px solid ${BORDER}`, fontSize: 11, color: MUTED })}>
                  <div>שם הקופה</div><div style={px({ textAlign: "left" })}>תשלומים פטורים</div><div style={px({ textAlign: "left" })}>קצבה מוכרת</div>
                </div>
                {vestedRows.slice(0, 8).map((r, i) => (
                  <div key={r.id || i} style={px({ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr", gap: 12, padding: "16px 12px", borderBottom: i < Math.min(vestedRows.length, 8) - 1 ? `1px solid ${DIV2}` : `1px solid ${BORDER}` })}>
                    <div>{r.fundName || "—"}</div>
                    <div style={px({ textAlign: "left", color: MUTED })}>{r.exemptPayments || "0"}</div>
                    <div style={px({ textAlign: "left" })}>{r.pension ? formatReportNumber(r.pension) : <span style={px({ background: "#FFE6EC", color: ROSE_DK, padding: "2px 7px", fontSize: 11.5 })}>חסר</span>}</div>
                  </div>
                ))}
                <div style={px({ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr", gap: 12, padding: 12, background: PAPER, fontWeight: 700 })}>
                  <div>סה״כ</div><div style={px({ textAlign: "left" })}>{formatReportNumber(pdfTotal)}</div><div style={px({ textAlign: "left" })}><span style={px({ background: "#FFE6EC", color: ROSE_DK, padding: "2px 7px", fontSize: 11.5, fontWeight: 600 })}>חסר</span></div>
                </div>
              </div>
              <div style={px({ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${DIV}`, display: "flex", alignItems: "flex-end", gap: 16 })}>
                <div style={px({ flex: 1, fontSize: 11.5, color: MUTED, lineHeight: 1.5 })}>סה״כ התשלומים הפטורים מגיע מטבלת החישוב במסמך. נתוני הקצבה המוכרת לא התקבלו מהגופים המנהלים, ולכן מסומנים כחסרים ולא כאפס.</div>
                <div style={px({ flex: "none", textAlign: "left", borderInlineStart: `1px solid ${DIV}`, paddingInlineStart: 20 })}><div style={px({ fontSize: 11, color: MUTED })}>סה״כ תשלומים פטורים</div><div style={px({ fontSize: 24, fontWeight: 800 })}>{formatReportNumber(pdfTotal)}</div></div>
              </div>
            </div>
          ) : null}

          {manualRows.length ? (
            <div style={cardStyle({ marginTop: 20, padding: "22px 24px 20px", flex: "none" })}>
              <CardTitle title="קצבה מוכרת שהוזנה ידנית" right="הזנת יועץ · לא מהגוף המנהל" />
              <div style={px({ fontSize: 13 })}>
                <div style={px({ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 12, padding: "9px 12px", background: PAPER, border: `1px solid ${BORDER}`, fontSize: 11, color: MUTED })}>
                  <div>חברת ביטוח</div><div style={px({ textAlign: "left" })}>קצבה מוכרת שהוזנה</div>
                </div>
                {manualRows.slice(0, 6).map((r, i) => (
                  <div key={r.id || i} style={px({ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 12, padding: "16px 12px", borderBottom: `1px solid ${BORDER}` })}><div>{r.companyName || "—"}</div><div style={px({ textAlign: "left", fontWeight: 700 })}>{formatReportNumber(r.amount)}</div></div>
                ))}
                <div style={px({ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 12, padding: 12, background: PAPER, fontWeight: 700 })}><div>סה״כ</div><div style={px({ textAlign: "left" })}>{formatReportNumber(manualTotal)}</div></div>
              </div>
              <div style={px({ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${DIV}`, fontSize: 11.5, color: MUTED, lineHeight: 1.55 })}>סכומים בשורה זו הוזנו על ידי היועץ ואינם מגיעים מהגוף המנהל — הם אינם מאומתים מול נתוני הממשק ואינם מהווים אישור של רשות המסים להכרה בקצבה.</div>
            </div>
          ) : null}

          {pdfTotal > 0 && manualTotal > 0 ? (
            <div style={px({ marginTop: 20, border: `1px solid ${BORDER2}`, background: CARD, padding: "22px 20px", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "center" })}>
              <div style={px({ display: "flex", alignItems: "center", gap: 18 })}>
                <div style={px({ flex: 1 })}><div style={px({ fontSize: 14, fontWeight: 700 })}>פער הצבירה לחיסכון במס</div><div style={px({ fontSize: 11, color: MUTED, marginTop: 3, lineHeight: 1.45 })}>לפי טבלת החישוב במסמך, בניכוי הקצבה שהוזנה ידנית.</div></div>
                <div dir="ltr" style={px({ flex: "none", fontSize: 22, fontWeight: 800, color: gap < 0 ? ROSE_DK : NAVY })}>{gap < 0 ? "−" : "+"}{formatReportNumber(Math.abs(gap))}</div>
              </div>
              {gap < 0 ? (
                <div style={px({ marginTop: 12, paddingTop: 11, borderTop: `1px solid ${DIV}`, display: "flex", alignItems: "center", gap: 10 })}>
                  <span style={px({ width: 8, height: 8, borderRadius: "50%", background: ROSE, flex: "none" })} />
                  <div style={px({ fontSize: 11, color: INK2, lineHeight: 1.45 })}>הפער נובע מהזנה ידנית הגדולה בסדר גודל מהנתון שבטבלת החישוב — מומלץ לאמת לפני הצגה ללקוח.</div>
                </div>
              ) : null}
            </div>
          ) : null}

          {!vestedRows.length && !manualRows.length ? <div style={px({ marginTop: 20, background: PAPER, border: `1px solid ${BORDER}`, padding: 40, textAlign: "center", color: MUTED })}>לא קיימים נתוני קצבה מוכרת בדוח.</div> : null}

          <Foot n={n} total={total} gap={16} />
        </section>
      ));
    });
  }

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Assistant:wght@300;400;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap');
    @media screen { .print-report-root { display: none; } }
    @media print {
      @page { size: A4 portrait; margin: 0; }
      html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
      .print-report-root { display: block !important; }
      .rp-section { break-before: page; page-break-before: always; }
      .rp-section:first-child { break-before: avoid; page-break-before: avoid; }
      .rp-section, .rp-section * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
    }
  `;

  const totalPages = pages.length;
  return (
    <div class="print-report-root" aria-hidden="true">
      <style>{css}</style>
      {pages.map((fn, i) => fn(i + 1, totalPages))}
    </div>
  );
}
