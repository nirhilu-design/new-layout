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

  return (
    getCapitalRowNumber(row, "capitalRewards") +
    getCapitalRowNumber(row, "annuityRewardsUntil2000") +
    getCapitalRowNumber(row, "capitalSeverance") +
    getCapitalRowNumber(row, "liquidExemptSeverance")
  );
}

function getCapitalTotalPension(row) {
  const explicit = getCapitalRowNumber(row, "totalPension");
  if (explicit > 0) return explicit;

  return (
    getCapitalRowNumber(row, "annuityRewards") +
    getCapitalRowNumber(row, "annuitySeverance") +
    getCapitalRowNumber(row, "previousEmployersSeveranceRightsSequence") +
    getCapitalRowNumber(row, "pension")
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
  const totalBalance =
    summarizeCapitalRows(allRows, "totalBalance") ||
    summarizeCapitalRows(studyRows, "redemptionValue");
  const totalRewards = summarizeCapitalRows(allRows, "totalRewards");
  const totalSeverance = summarizeCapitalRows(allRows, "totalSeverance");
  const totalCapital = summarizeCapitalDerivedRows(allRows, "totalCapital");
  const totalPension = summarizeCapitalDerivedRows(allRows, "totalPension");

  return (
    <div
      style={px({
        border: "1px solid #EEE4D8",
        borderRadius: 18,
        background: "linear-gradient(180deg, #FFFFFF 0%, #FCFBF8 100%)",
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
          borderBottom: "1px solid #EEE4D8",
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
        border: isCapital ? "1px solid #F1E4C8" : isPension ? "1px solid #DDEAF8" : "1px solid #E2D8CA",
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
        border: "1px solid #EEE4D8",
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
    "liquidExemptSeverance",
    "totalCapital",
  ]);

  const pensionKeys = new Set([
    "annuityRewards",
    "previousEmployersSeveranceRightsSequence",
    "annuitySeverance",
    "pension",
    "totalPension",
  ]);

  if (capitalKeys.has(column.key)) return "capital";
  if (pensionKeys.has(column.key)) return "pension";
  return "neutral";
}

function getCapitalToneBackground(tone, isHeader = false, isTotal = false) {
  if (tone === "capital") return isHeader ? "#FFF8EA" : isTotal ? "#FFF8EA" : "#FFFDF7";
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
    { key: "currentEmployerSeveranceTaxable", label: "פיצויים מעסיק נוכחי למס", type: "number" },
    { key: "capitalSeverance", label: "פיצויים הוניים", type: "number" },
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

      <div style={px({ overflowX: "auto", border: "1px solid #E2D1BF", borderRadius: 14, background: "#fff", boxShadow: "0 4px 12px rgba(16,42,67,0.04)" })}>
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
                        background: rowIndex % 2 ? "#FFFFFF" : "#FCFBF8",
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
            border: "1px solid #EEE4D8",
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

  const pageBg = "#F9F7F3";
  const surface = "#FFFFFF";
  const surfaceAlt = "#FCFBF8";
  const border = "#E2D1BF";
  const divider = "#EEE4D8";
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
      borderBottom: "1px solid #F0E6DA",
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
      borderBottom: "1px solid #F0E6DA",
      borderLeft: "1px solid #F0E6DA",
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
      borderBottom: "1px solid #E2D1BF",
      borderLeft: "1px solid #E2D1BF",
      padding: "12px 10px",
      whiteSpace: "nowrap",
      background: "#FFF7E8",
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
      borderBottom: "1px solid #F0E6DA",
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
      borderBottom: "1px solid #F0E6DA",
      borderLeft: "1px solid #F0E6DA",
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
      background: "linear-gradient(180deg, #FFFFFF 0%, #FCFBF8 100%)",
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
            border-bottom: 1px solid #EEE4D8 !important;
          }

          .client-menu-member-row {
            width: 100% !important;
            border: 1px solid #EEE4D8 !important;
            background: linear-gradient(180deg, #FFFFFF 0%, #FCFBF8 100%) !important;
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
            border: 1px dashed #E2D1BF !important;
            background: #FCFBF8 !important;
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
            border: 1px solid #E2D1BF !important;
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
            border: 1px solid #EEE4D8 !important;
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
            border: 1px dashed #E2D1BF;
            background: #FCFBF8;
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
            border: 1px solid #E2D1BF;
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
            border-top: 1px solid #EEE4D8;
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
            border: 1px solid #EEE4D8;
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
            border-bottom: 1px solid #EEE4D8 !important;
          }

          .client-menu-member-row {
            width: 100% !important;
            border: 1px solid #EEE4D8 !important;
            background: linear-gradient(180deg, #FFFFFF 0%, #FCFBF8 100%) !important;
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
            border: 1px dashed #E2D1BF !important;
            background: #FCFBF8 !important;
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
            border: 1px solid #E7D9CA !important;
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
            border-top: 1px solid #E7D9CA;
            border-right: 1px solid #E7D9CA;
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
            border-bottom: 1px solid #EEE4D8 !important;
          }

          .client-menu-member-row {
            width: 100% !important;
            border: 1px solid #EEE4D8 !important;
            background: linear-gradient(180deg, #FFFFFF 0%, #FCFBF8 100%) !important;
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
            border: 1px dashed #E2D1BF !important;
            background: #FCFBF8 !important;
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
                      border: "1px solid #EEE4D8",
                      borderRadius: 18,
                      background: "linear-gradient(180deg, #FFFFFF 0%, #FCFBF8 100%)",
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
                      border: "1px solid #EEE4D8",
                      borderRadius: 18,
                      background: "linear-gradient(180deg, #FFFFFF 0%, #FCFBF8 100%)",
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
    background: "linear-gradient(180deg, #FFFFFF 0%, #FCFBF8 100%)",
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
        border: "1px solid #E2D1BF",
        borderRadius: 14,
        padding: "10px 12px",
        marginTop: 8,
        background: "linear-gradient(135deg, #FFF7E8 0%, #EEF2FA 100%)",
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
        border: "1px dashed #E2D1BF",
        borderRadius: 12,
        padding: "10px 12px",
        color: "#627D98",
        fontSize: 11,
        textAlign: "center",
        background: "#FCFBF8",
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
        border: "1px solid #EEE4D8",
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
            background: "#FFF7E8",
            color: "#00215D",
            border: "1px solid #E2D1BF",
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
        border: "1px solid #E2D1BF",
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
            "linear-gradient(270deg, #F9F7F3 0%, #EAF1FB 45%, #E2D1BF 75%, #00215D 100%)",
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
            border: "1px dashed #E2D1BF",
            borderRadius: "16px",
            padding: "18px",
            color: "#627D98",
            fontSize: "12px",
            background: "#FCFBF8",
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

  // ---- Design tokens (from handoff) ----
  const NAVY = "#00215D";
  const PINK = "#FF2756";
  const TAN = "#E2D1BF";
  const OFFWHITE = "#F9F7F3";
  const DESK = "#EDE7DD";
  const MUTED = "#8A8580";
  const INK = "#1A1A1A";
  const DARKTAN = "#4A3B2C";
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
    const track = dark ? "rgba(249,247,243,0.15)" : "rgba(0,33,93,0.12)";
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
      navy: { bg: NAVY, color: OFFWHITE, labelColor: "rgba(249,247,243,0.7)", border: "none" },
      pink: { bg: PINK, color: OFFWHITE, labelColor: "rgba(249,247,243,0.85)", border: "none" },
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
  const capTotalBalance = summarizeCapitalRows(allCapitalRows, "totalBalance") || summarizeCapitalRows(allCapitalStudy, "redemptionValue");
  const capTotalRewards = summarizeCapitalRows(allCapitalRows, "totalRewards");
  const capTotalSeverance = summarizeCapitalRows(allCapitalRows, "totalSeverance");
  const capTotalCapital = summarizeCapitalDerivedRows(allCapitalRows, "totalCapital");
  const capTotalPension = summarizeCapitalDerivedRows(allCapitalPension, "totalPension");
  const capStudyBalance = allCapitalStudy.reduce((sum, r) => sum + getStudyFundBalance(r), 0);

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
          <div style={px({ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(249,247,243,0.55) 0%, rgba(249,247,243,0) 20%, rgba(249,247,243,0) 82%, rgba(249,247,243,0.30) 100%)" })} />
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
