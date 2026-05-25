import React, { useEffect, useMemo, useState } from "react";

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

function CapitalClassificationReportSection({ entries, styles }) {
  const safeEntries = normalizeCapitalReportArray(entries);

  if (!safeEntries.length) return null;

  const wrapperStyle = {
    display: "flex",
    flexDirection: "column",
    gap: 18,
  };

  return (
    <div style={wrapperStyle}>
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

  return (
    <div
      style={{
        border: "1px solid #EEE4D8",
        borderRadius: 18,
        background: "linear-gradient(180deg, #FFFFFF 0%, #FCFBF8 100%)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          padding: "16px 18px",
          borderBottom: "1px solid #EEE4D8",
          background: "#FFFFFF",
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ color: "#00215D", fontSize: 16, fontWeight: 900 }}>
            פירוק נכסים ללקוח דוגמא זכר · {entry.ownerLabel || "בן/בת זוג"}
          </div>
          <div style={{ color: "#627D98", fontSize: 12, marginTop: 4 }}>
            {entry.sourceFileName ? `מקור הנתונים: ${entry.sourceFileName}` : "נתוני סיווג כספים שהוזנו במסך ההעלאה"}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(120px, 1fr))",
            gap: 8,
            minWidth: 360,
          }}
        >
          <CapitalMiniStat label="סה״כ קופה" value={totalBalance} />
          <CapitalMiniStat label="סה״כ תגמולים" value={totalRewards} />
          <CapitalMiniStat label="סה״כ פיצויים" value={totalSeverance} />
        </div>
      </div>

      <div style={{ padding: 18 }}>
        {pensionRows.length ? (
          <CapitalClassificationTable
            title="פירוט פוליסות וקרנות"
            subtitle="סקירה מרכזת של תגמולים, פיצויים וקרנות שאינן קרנות השתלמות."
            rows={pensionRows}
            type="pension"
          />
        ) : null}

        {studyRows.length ? (
          <div style={{ marginTop: pensionRows.length ? 24 : 0 }}>
            <CapitalClassificationTable
              title="קרנות השתלמות"
              subtitle="פירוט קרנות השתלמות לפי חברה מנהלת, מספר קופה וערך פדיון."
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
  return (
    <div
      style={{
        background: "#F4F7FB",
        border: "1px solid #E2D1BF",
        borderRadius: 14,
        padding: "10px 12px",
        textAlign: "center",
      }}
    >
      <div style={{ color: "#627D98", fontSize: 11, fontWeight: 800, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ color: "#00215D", fontSize: 14, fontWeight: 900, direction: "ltr" }}>
        {getCapitalRowValue({ value }, "value")}
      </div>
    </div>
  );
}

function CapitalClassificationTable({ title, subtitle, rows, type }) {
  const pensionColumns = [
    { key: "policyNumber", label: "מספר פוליסה" },
    { key: "managerName", label: "חברה מנהלת" },
    { key: "capitalRewards", label: "תגמולים הוניים" },
    { key: "annuityRewards", label: "תגמולים קצבתיים" },
    { key: "annuityRewardsUntil2000", label: "תגמולים קצבתיים עד 1.1.2000" },
    { key: "previousEmployersSeveranceRightsSequence", label: "פיצויים ממעסיקים קודמים ברצף זכויות" },
    { key: "currentEmployerSeveranceTaxable", label: "פיצויים מעסיק נוכחי למס" },
    { key: "capitalSeverance", label: "פיצויים הוניים" },
    { key: "liquidExemptSeverance", label: "פיצויים הוניים פטורים / נזילים" },
    { key: "annuitySeverance", label: "פיצויים קצבתיים פטורים / נזילים" },
  ];

  const studyColumns = [
    { key: "policyNumber", label: "מספר קופה" },
    { key: "managerName", label: "חברה מנהלת" },
    { key: "redemptionValue", label: "ערך פדיון" },
  ];

  const columns = type === "study" ? studyColumns : pensionColumns;
  const totalKeys = type === "study" ? ["redemptionValue"] : pensionColumns.slice(2).map((column) => column.key);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ color: "#00215D", fontSize: 18, fontWeight: 900 }}>{title}</div>
          <div style={{ color: "#627D98", fontSize: 12, marginTop: 4 }}>{subtitle}</div>
        </div>
      </div>

      <div style={{ overflowX: "auto", border: "1px solid #E2D1BF", borderRadius: 14, background: "#fff", boxShadow: "0 4px 12px rgba(16,42,67,0.04)" }}>
        <table style={{ width: "100%", minWidth: type === "study" ? 520 : 1180, borderCollapse: "collapse", tableLayout: "fixed", direction: "rtl" }}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  style={{
                    background: "#EEF2FA",
                    color: "#243B53",
                    borderLeft: "1px solid #D8E2EF",
                    borderBottom: "1px solid #D8E2EF",
                    padding: "13px 10px",
                    fontSize: 12,
                    fontWeight: 900,
                    textAlign: "center",
                    lineHeight: 1.35,
                  }}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={row.id || `${row.policyNumber || "row"}-${rowIndex}`}>
                {columns.map((column) => (
                  <td
                    key={column.key}
                    style={{
                      borderLeft: "1px solid #E4EAF2",
                      borderBottom: "1px solid #E4EAF2",
                      padding: "12px 10px",
                      textAlign: "center",
                      fontSize: 12,
                      color: "#102A43",
                      background: rowIndex % 2 ? "#FFFFFF" : "#FCFBF8",
                      whiteSpace: "normal",
                      wordBreak: "break-word",
                      direction: typeof row[column.key] === "number" ? "ltr" : "rtl",
                    }}
                  >
                    {getCapitalRowValue(row, column.key)}
                  </td>
                ))}
              </tr>
            ))}

            <tr>
              {columns.map((column, columnIndex) => {
                const shouldTotal = totalKeys.includes(column.key);
                return (
                  <td
                    key={column.key}
                    style={{
                      borderLeft: "1px solid #D8E2EF",
                      padding: "13px 10px",
                      textAlign: "center",
                      fontSize: 12,
                      fontWeight: 900,
                      color: "#1D4ED8",
                      background: columnIndex === columns.length - 1 ? "#DCEBFF" : "#EEF2FA",
                      direction: shouldTotal ? "ltr" : "rtl",
                    }}
                  >
                    {columnIndex === 0 ? 'סה"כ' : shouldTotal ? getCapitalRowValue({ value: summarizeCapitalRows(rows, column.key) }, "value") : ""}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
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

export default function ReportPage({
  reportData,
  onBack,
  onCreateShareLink = () => null,
}) {
  const [generalConversationSummary, setGeneralConversationSummary] = useState(
    () =>
      reportData?.generalConversationSummary ||
      reportData?.conversationSummary ||
      reportData?.clientConversationSummary ||
      reportData?.summaryText ||
      ""
  );

  const [summaryTopics, setSummaryTopics] = useState(() =>
    createDefaultSummaryTopics(
      reportData?.summaryTopics || reportData?.conversationSummaryTopics || []
    )
  );

  const [manualActionRecommendations, setManualActionRecommendations] = useState(
    () =>
      cleanManualActionText(
        reportData?.manualActionRecommendations ||
          reportData?.actionRecommendations ||
          reportData?.clientActionRecommendations ||
          reportData?.recommendationsText ||
          reportData?.recommendations ||
          ""
      )
  );

  const [isClientLinkCopied, setIsClientLinkCopied] = useState(false);

  const safeReportData = reportData || {};

  useEffect(() => {
    setGeneralConversationSummary(
      reportData?.generalConversationSummary ||
        reportData?.conversationSummary ||
        reportData?.clientConversationSummary ||
        reportData?.summaryText ||
        ""
    );

    setSummaryTopics(
      createDefaultSummaryTopics(
        reportData?.summaryTopics || reportData?.conversationSummaryTopics || []
      )
    );

    setManualActionRecommendations(
      cleanManualActionText(
        reportData?.manualActionRecommendations ||
          reportData?.actionRecommendations ||
          reportData?.clientActionRecommendations ||
          reportData?.recommendationsText ||
          reportData?.recommendations ||
          ""
      )
    );
  }, [reportData]);

  const conversationSummary = useMemo(
    () => buildConversationSummaryText(generalConversationSummary, summaryTopics),
    [generalConversationSummary, summaryTopics]
  );

  const actionRecommendations = useMemo(
    () => buildActionRecommendationsText(manualActionRecommendations, summaryTopics),
    [manualActionRecommendations, summaryTopics]
  );

  const selectedSummaryTopics = useMemo(
    () =>
      summaryTopics.filter(
        (topic) =>
          topic.checked &&
          (String(topic.spouseA || "").trim() ||
            String(topic.spouseB || "").trim() ||
            String(topic.actionA || "").trim() ||
            String(topic.actionB || "").trim() ||
            String(topic.action || "").trim())
      ),
    [summaryTopics]
  );

  const reportDataForClient = useMemo(
    () => ({
      ...safeReportData,
      generalConversationSummary,
      summaryTopics,
      conversationSummary,
      clientConversationSummary: conversationSummary,
      summaryText: conversationSummary,
      manualActionRecommendations,
      actionRecommendations,
      clientActionRecommendations: actionRecommendations,
      recommendationsText: actionRecommendations,
      recommendations: actionRecommendations,
    }),
    [
      safeReportData,
      generalConversationSummary,
      summaryTopics,
      conversationSummary,
      manualActionRecommendations,
      actionRecommendations,
    ]
  );

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

  const vestedBalanceTable = safeReportData?.vestedBalanceTable || null;
  const recognizedPensionAdjustments = Array.isArray(
    safeReportData?.recognizedPensionAdjustments
  )
    ? safeReportData.recognizedPensionAdjustments
    : [];
  const hasRecognizedPensionAdjustments =
    recognizedPensionAdjustments.length > 0;
  const hasVestedBalanceTable =
    (Array.isArray(vestedBalanceTable?.rows) &&
      vestedBalanceTable.rows.length > 0) ||
    hasRecognizedPensionAdjustments;

  const section28Capping = safeReportData?.section28Capping || null;
  const hasSection28Capping =
    Array.isArray(section28Capping?.groups) && section28Capping.groups.length > 0;

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

  const retirementLumpBars = useMemo(() => {
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
  }, [
    family.projectedLumpSumWithDeposits,
    family.projectedLumpSumWithoutDeposits,
  ]);

  const retirementPensionBars = useMemo(() => {
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
  }, [
    family.monthlyPensionWithDeposits,
    family.monthlyPensionWithoutDeposits,
  ]);

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
      <div style={{ padding: "40px", direction: "rtl" }}>טוען נתונים...</div>
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

      <div className="screen-report-root" style={styles.page}>
        <div className="no-print" style={styles.actionsBar}>

          <button onClick={handleExportPdf} className="action-button primary">
            ייצוא ל־PDF
          </button>

          <div className="client-link-button-wrap">
            <button onClick={handleCreateClientLink} className="action-button accent">
              יצירת לינק ללקוח
            </button>

            {isClientLinkCopied ? (
              <span className="client-link-success-check" title="הלינק הועתק">
                ✓
              </span>
            ) : null}
          </div>

          <button onClick={onBack} className="action-button">
            חזרה למסך העלאה
          </button>
        </div>

        <div style={styles.container}>
          <section
            className="print-section responsive-hero avoid-break"
            style={styles.heroHeader}
          >
            <div className="responsive-hero-logo" style={styles.heroLogoWrap}>
              <ZviranLogo light />
            </div>

            <div style={styles.heroCenter}>
              <div style={styles.heroEyebrow}>מסך ראשי · דוח משפחתי מאוחד</div>
              <h1 style={styles.heroTitle}>דוח פנסיוני משפחתי מאוחד</h1>
              <div style={styles.heroSubtitle}>
                ריכזנו עבורך תמונת מצב משפחתית אחת הכוללת את כלל הנכסים
                הפנסיוניים, תחזית פרישה, פיזור בין מוצרים וגופים מנהלים, חשיפה
                מנייתית, הלוואות, כיסויים ומידע מרכזי לכל אחד מבני המשפחה.
              </div>
            </div>

            <div className="responsive-hero-meta" style={styles.heroMeta}>
              <div style={styles.heroClientLogoBox}>
                {reportData?.clientLogo ? (
                  <img
                    src={reportData.clientLogo}
                    alt="לוגו חברה"
                    style={styles.heroClientLogoImage}
                  />
                ) : (
                  <div style={styles.heroClientLogoPlaceholder}>לוגו חברה</div>
                )}
              </div>

              <div>
                <div style={styles.heroMetaLabel}>תאריך עדכון</div>
                <div style={styles.heroMetaValue}>{family.lastUpdated || "—"}</div>
              </div>
            </div>
          </section>

          <section
            className="print-section responsive-grid-4 avoid-break"
            style={styles.topGrid}
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
            className="print-section responsive-grid-2 avoid-break"
            style={styles.compareGrid}
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
              className="print-section capital-classification-section avoid-break"
              style={styles.sectionCard}
            >
              <div style={styles.sectionHeader}>
                <div style={styles.titleWithIcon}>
                  <span>📑</span>
                  <h2 style={styles.h2}>פירוט פוליסות וקרנות</h2>
                </div>
              </div>

              <div style={styles.explanation}>
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
              className="print-section section-28-capping-section avoid-break"
              style={styles.sectionCard}
            >
              <div style={styles.sectionHeader}>
                <div style={styles.titleWithIcon}>
                  <span>🧮</span>
                  <h2 style={styles.h2}>קיטום על פי סעיף 28</h2>
                </div>
              </div>

              <div style={styles.explanation}>
                הנתונים מוצגים כפי שנקראו מקובץ האקסל לפי שמות השדות, ללא חישוב
                נוסף במערכת.
                {section28Capping?.sourceFileName
                  ? ` מקור הנתונים: ${section28Capping.sourceFileName}.`
                  : ""}
              </div>

              <Section28CappingReport data={section28Capping} styles={styles} />
            </section>
          ) : null}

          {hasVestedBalanceTable ? (
            <section
              className="print-section vested-balance-section avoid-break"
              style={styles.sectionCard}
            >
              <div style={styles.sectionHeader}>
                <div style={styles.titleWithIcon}>
                  <span>📋</span>
                  <h2 style={styles.h2}>צבירה מוכרת לפי תגמולים ופיצויים</h2>
                </div>
              </div>

              <div style={styles.explanation}>
                טבלה זו מוצגת רק כאשר הועלה PDF ייעודי במסך ההעלאה ונמצאו בו
                נתוני צבירה מוכרת, או כאשר הוזן סכום קצבה מוכרת ידנית לפי חברת ביטוח.
                {vestedBalanceTable?.sourceFileName
                  ? ` מקור הנתונים: ${vestedBalanceTable.sourceFileName}.`
                  : ""}
              </div>

              <VestedBalanceTable
                table={vestedBalanceTable}
                adjustments={recognizedPensionAdjustments}
                styles={styles}
              />
            </section>
          ) : null}

          <section
            className="print-section responsive-lower-two"
            style={styles.lowerTwoGrid}
          >
            <section
              className="foreign-exposure-print avoid-break"
              style={styles.sectionCard}
            >
              <div style={styles.sectionHeader}>
                <div style={styles.titleWithIcon}>
                  <span>🌍</span>
                  <h2 style={styles.h2}>חשיפה לחו"ל</h2>
                </div>
              </div>

              <div style={styles.explanation}>
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

            <section className="equity-print avoid-break" style={styles.equityCard}>
              <div style={styles.sectionHeader}>
                <div style={styles.titleWithIcon}>
                  <span>📊</span>
                  <h2 style={styles.h2}>חשיפה מנייתית משוקללת</h2>
                </div>
              </div>

              <div style={styles.explanation}>
                המדד מחושב על בסיס משקל המסלולים בתיק ואחוז המניות המשוער בכל
                מסלול.
              </div>

              <div style={styles.equityValueWrap}>
                <div style={styles.equityValue}>
                  {formatPercentLabel(weightedEquityExposure)}
                </div>
                <div style={styles.equityLabel}>{exposureLabel}</div>
              </div>

              <EquityBarModern value={weightedEquityExposure} />
            </section>
          </section>

          <section
            className="print-section main-group-print avoid-break"
            style={styles.sectionCard}
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
            className="print-section members-section force-new-page-print"
            style={styles.sectionCard}
          >
            <h2 style={styles.h2}>פירוט לפי בני משפחה</h2>
            <div style={styles.explanation}>
              מוצגת תמונת מצב אישית לכל אחד מבני המשפחה, כולל קצבה, סכום חד
              פעמי, ביטוח חיים ואובדן כושר עבודה.
            </div>

            <div className="responsive-members-grid" style={styles.membersGrid}>
              {members.map((member, index) => (
                <div
                  key={member.id || member.name || index}
                  className="member-card-print avoid-break"
                  style={styles.memberCard}
                >
                  <div style={styles.memberTop}>
                    <div>
                      <div style={styles.memberName}>{member.name || "ללא שם"}</div>
                    </div>

                    <div style={styles.chip}>
                      הפקדה חודשית: {formatCurrency(member.monthlyDeposits)}
                    </div>
                  </div>

                  <div style={styles.centerCard}>
                    <div style={styles.centerLabel}>סך צבירה</div>
                    <div style={styles.centerValue}>
                      {formatCurrency(member.assets)}
                    </div>
                  </div>

                  <div
                    className="responsive-mini-grid"
                    style={styles.compareMiniGrid}
                  >
                    <div style={styles.compareMiniCard}>
                      <div style={styles.compareMiniTitle}>קצבה חודשית צפויה</div>
                      <div style={styles.compareMiniInner}>
                        <div style={styles.compareMiniSide}>
                          <div style={styles.compareMiniSideLabel}>עם הפקדות</div>
                          <div style={styles.compareMiniSideValue}>
                            {formatCurrency(member.monthlyPensionWithDeposits)}
                          </div>
                        </div>

                        <div style={styles.dividerLine} />

                        <div style={styles.compareMiniSide}>
                          <div style={styles.compareMiniSideLabel}>ללא הפקדות</div>
                          <div style={styles.compareMiniSideValue}>
                            {formatCurrency(member.monthlyPensionWithoutDeposits)}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div style={styles.compareMiniCard}>
                      <div style={styles.compareMiniTitle}>סכום חד הוני לפרישה</div>
                      <div style={styles.compareMiniInner}>
                        <div style={styles.compareMiniSide}>
                          <div style={styles.compareMiniSideLabel}>עם הפקדות</div>
                          <div style={styles.compareMiniSideValue}>
                            {formatCurrency(member.lumpSumWithDeposits)}
                          </div>
                        </div>

                        <div style={styles.dividerLine} />

                        <div style={styles.compareMiniSide}>
                          <div style={styles.compareMiniSideLabel}>ללא הפקדות</div>
                          <div style={styles.compareMiniSideValue}>
                            {formatCurrency(member.lumpSumWithoutDeposits)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    className="responsive-insurance-grid"
                    style={styles.insuranceGrid}
                  >
                    <div style={styles.insuranceCard}>
                      <div style={styles.insuranceLabel}>🛡️ ביטוח חיים</div>
                      <div style={styles.insuranceValue}>
                        {formatCurrency(member.deathCoverage)}
                      </div>
                    </div>

                    <div style={styles.insuranceCard}>
                      <div style={styles.insuranceLabel}>🧍 אובדן כושר עבודה</div>
                      <div style={styles.insuranceValue}>
                        {formatCurrency(member.disabilityValue)} (
                        {Math.round(Number(member.disabilityPercent || 0))}%)
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {!members.length ? (
                <div style={styles.emptyState}>לא התקבל פירוט בני משפחה להצגה.</div>
              ) : null}
            </div>
          </section>

          <section
            className="print-section loans-section force-new-page-print"
            style={styles.loansBenefitsGrid}
          >
            <section style={styles.sectionCard}>
              <div style={styles.sectionHeader}>
                <div style={styles.titleWithIcon}>
                  <span>💳</span>
                  <h2 style={styles.h2}>הלוואות על חשבון מוצרים פנסיוניים</h2>
                </div>
              </div>

              <div style={styles.explanation}>
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
                        className="print-table-block loan-group-print avoid-break"
                        key={personName}
                        style={styles.loanGroup}
                      >
                        <div style={styles.loanPersonName}>{personName}</div>

                        <div
                          className="responsive-loan-summary"
                          style={styles.loanSummaryRow}
                        >
                          <div style={styles.loanSummaryCard}>
                            <div style={styles.loanSummaryLabel}>
                              סך סכום הלוואות
                            </div>
                            <div style={styles.loanSummaryValue}>
                              {formatCurrency(totalAmount)}
                            </div>
                          </div>

                          <div style={styles.loanSummaryCard}>
                            <div style={styles.loanSummaryLabel}>יתרת הלוואות</div>
                            <div style={styles.loanSummaryValue}>
                              {formatCurrency(totalBalance)}
                            </div>
                          </div>
                        </div>

                        <div
                          className="print-table-block avoid-break"
                          style={styles.loanTableWrap}
                        >
                          <table style={styles.loanTable}>
                            <thead>
                              <tr>
                                <th style={styles.loanTh}>סכום הלוואה</th>
                                <th style={styles.loanTh}>תדירות החזר</th>
                                <th style={styles.loanTh}>יתרת הלוואה</th>
                                <th style={styles.loanTh}>תאריך סיום</th>
                              </tr>
                            </thead>
                            <tbody>
                              {personLoans.map((loan) => (
                                <tr key={loan.id}>
                                  <td style={styles.loanTd}>
                                    {formatCurrency(loan.amount)}
                                  </td>
                                  <td style={styles.loanTd}>
                                    {loan.repaymentFrequency || "—"}
                                  </td>
                                  <td style={styles.loanTd}>
                                    {formatCurrency(loan.balance)}
                                  </td>
                                  <td style={styles.loanTd}>
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
                    className="print-table-block loan-group-print avoid-break"
                    style={{ ...styles.loanGroup, marginTop: "16px" }}
                  >
                    <div
                      className="responsive-loan-summary"
                      style={styles.loanSummaryRow}
                    >
                      <div style={styles.loanSummaryCard}>
                        <div style={styles.loanSummaryLabel}>סה"כ הלוואות</div>
                        <div style={styles.loanSummaryValue}>
                          {formatCurrency(totalLoansAmount)}
                        </div>
                      </div>

                      <div style={styles.loanSummaryCard}>
                        <div style={styles.loanSummaryLabel}>יחס לנכסים</div>
                        <div style={styles.loanSummaryValue}>
                          {loanRatioToAssets.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : !loans.hasData ? (
                <div style={styles.emptyState}>
                  לא התקבל מידע על הלוואות בשני הקבצים שהועלו.
                </div>
              ) : (
                <div style={styles.emptyState}>
                  התקבל סטטוס הלוואות, אבל לא הגיע פירוט מלא להצגה.
                </div>
              )}
            </section>
          </section>

          <section
            className="summary-box-print avoid-break"
            style={styles.sectionCard}
          >
            <div style={styles.sectionHeader}>
              <div style={styles.titleWithIcon}>
                <span>🧾</span>
                <h2 style={styles.h2}>סיכום מהיר</h2>
              </div>
            </div>

            <div style={styles.summaryStatsGrid}>
              <div style={styles.statCard}>
                <div style={styles.statLabel}>מוצרים</div>
                <div style={styles.statValue}>{products.length}</div>
              </div>

              <div style={styles.statCard}>
                <div style={styles.statLabel}>גופים מנהלים</div>
                <div style={styles.statValue}>{managers.length}</div>
              </div>

              <div style={styles.statCard}>
                <div style={styles.statLabel}>בני משפחה</div>
                <div style={styles.statValue}>{members.length}</div>
              </div>

              <div style={styles.statCard}>
                <div style={styles.statLabel}>אפיקים ראשיים</div>
                <div style={styles.statValue}>{mainGroupAllocation.length}</div>
              </div>
            </div>

            <div style={styles.simpleInfoBox}>
              <div style={styles.infoLabel}>יחס הלוואות לנכסים</div>
              <div style={styles.infoValue}>{loanRatioToAssets.toFixed(1)}%</div>
            </div>

            <div style={{ ...styles.simpleInfoBox, marginTop: "12px" }}>
              <div style={styles.infoLabel}>קצבה חודשית צפויה</div>
              <div style={styles.infoValue}>
                {formatCurrency(family.monthlyPensionWithDeposits)}
              </div>
            </div>

            <div style={{ ...styles.simpleInfoBox, marginTop: "12px" }}>
              <div style={styles.infoLabel}>צבירה צפויה בגיל פרישה</div>
              <div style={styles.infoValue}>
                {formatCurrency(family.projectedLumpSumWithDeposits)}
              </div>
            </div>
          </section>


          <section
            className="print-section conversation-summary-section recommendations-print avoid-break"
            style={styles.sectionCard}
          >
            <div style={styles.sectionHeader}>
              <div style={styles.titleWithIcon}>
                <span>🧾</span>
                <h2 style={styles.h2}>סיכום שיחה לפי נושאים</h2>
              </div>
            </div>

            <div style={styles.explanation}>
              ניתן לכתוב סיכום כללי חופשי, ובהמשך לפרט לפי נושאים מובנים. רק
              נושאים שסומנו ב־V יעברו לתצוגת הלקוח. לכל נושא ניתן להוסיף גם
              פעולה אופרטיבית חופשית, שתיכנס לרשימת הפעולות.
            </div>

            <div style={styles.recommendationsWrap}>
              <div className="screen-only">
                <div style={{ marginBottom: 16 }}>
                  <div style={{ color: navy, fontSize: 14, fontWeight: 900, marginBottom: 8 }}>
                    סיכום כללי חופשי
                  </div>
                  <textarea
                    value={generalConversationSummary}
                    onChange={(e) => setGeneralConversationSummary(e.target.value)}
                    style={styles.recommendationsText}
                    placeholder="כתוב כאן סיכום כללי של השיחה, מטרות הלקוח, דגשים רחבים או נקודות שאינן קשורות לנושא ספציפי..."
                  />
                </div>

                <div style={styles.summaryFlowToolbar}>
                  <button
                    type="button"
                    onClick={markAllSummaryTopics}
                    style={styles.summaryFlowButton}
                  >
                    סמן הכל
                  </button>
                  <button
                    type="button"
                    onClick={clearAllSummaryTopicMarks}
                    style={{
                      ...styles.summaryFlowButton,
                      color: accent,
                      borderColor: accent,
                    }}
                  >
                    נקה את כל ה־V
                  </button>
                  <div style={{ color: textSoft, fontSize: 12, fontWeight: 800 }}>
                    נבחרו {selectedSummaryTopics.length} נושאים להצגה ללקוח
                  </div>
                </div>

                <div style={styles.summaryTopicList}>
                  {summaryTopics.map((topic) => (
                    <div
                      key={topic.id}
                      className={`summary-topic-card ${
                        topic.checked
                          ? "summary-topic-card-active"
                          : "summary-topic-card-inactive"
                      }`}
                      style={styles.summaryTopicCard}
                    >
                      <div style={styles.summaryTopicTop}>
                        <label style={styles.summaryTopicCheckLabel}>
                          <input
                            type="checkbox"
                            checked={topic.checked}
                            onChange={() => toggleSummaryTopic(topic.id)}
                            style={styles.summaryTopicCheckbox}
                          />
                          {topic.title}
                        </label>

                        <div style={{ color: topic.checked ? navy : textSoft, fontSize: 11, fontWeight: 900 }}>
                          {topic.checked ? "יוצג ללקוח" : "לא יוצג ללקוח"}
                        </div>
                      </div>

                      {topic.checked ? (
                        <div className="summary-topic-grid" style={styles.summaryTopicGrid}>
                          <div>
                            <div style={styles.summaryTopicFieldLabel}>סיכום בן זוג</div>
                            <textarea
                              className="summary-topic-textarea"
                              value={topic.spouseA}
                              onChange={(e) =>
                                updateSummaryTopic(topic.id, "spouseA", e.target.value)
                              }
                              style={styles.summaryTopicTextarea}
                              placeholder="כתוב סיכום קצר לבן זוג..."
                            />
                          </div>

                          <div>
                            <div style={styles.summaryTopicFieldLabel}>סיכום בת זוג</div>
                            <textarea
                              className="summary-topic-textarea"
                              value={topic.spouseB}
                              onChange={(e) =>
                                updateSummaryTopic(topic.id, "spouseB", e.target.value)
                              }
                              style={styles.summaryTopicTextarea}
                              placeholder="כתוב סיכום קצר לבת זוג..."
                            />
                          </div>

                          <div>
                            <div style={styles.summaryTopicFieldLabel}>פעולה לבן זוג</div>
                            <textarea
                              className="summary-topic-textarea"
                              value={topic.actionA}
                              onChange={(e) =>
                                updateSummaryTopic(topic.id, "actionA", e.target.value)
                              }
                              style={styles.summaryTopicActionTextarea}
                              placeholder="כתוב פעולה אחת או יותר, כל פעולה בשורה נפרדת..."
                            />
                          </div>

                          <div>
                            <div style={styles.summaryTopicFieldLabel}>פעולה לבת זוג</div>
                            <textarea
                              className="summary-topic-textarea"
                              value={topic.actionB}
                              onChange={(e) =>
                                updateSummaryTopic(topic.id, "actionB", e.target.value)
                              }
                              style={styles.summaryTopicActionTextarea}
                              placeholder="כתוב פעולה אחת או יותר, כל פעולה בשורה נפרדת..."
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>

                <div style={styles.summaryPreviewBox}>
                  {conversationSummary || "אין סיכום להצגה ללקוח כרגע."}
                </div>
              </div>
            </div>
          </section>

          <section
            className="print-section action-recommendations-section recommendations-print avoid-break"
            style={styles.sectionCard}
          >
            <div style={styles.sectionHeader}>
              <div style={styles.titleWithIcon}>
                <span>📝</span>
                <h2 style={styles.h2}>פעולות אופרטיביות לביצוע</h2>
              </div>
            </div>

            <div style={styles.explanation}>
              כאן יוצגו רק פעולות שנכתבו בפועל — ידנית או לפי נושא מסומן. לא תתווסף פעולה אוטומטית שלא נכתבה.
            </div>

            <div style={styles.recommendationsWrap}>
              <div className="screen-only">
                <div style={{ color: navy, fontSize: 14, fontWeight: 900, marginBottom: 8 }}>
                  פעולות ידניות כלליות
                </div>
                <textarea
                  value={manualActionRecommendations}
                  onChange={(e) => setManualActionRecommendations(e.target.value)}
                  style={styles.recommendationsText}
                  placeholder="כתוב כאן רק פעולות כלליות, אם יש. פעולות לפי נושא יש להזין בטבלת הנושאים למעלה."
                />

                <div style={{ marginTop: 14 }}>
                  <div style={{ color: navy, fontSize: 14, fontWeight: 900, marginBottom: 8 }}>
                    תצוגה מקדימה של פעולות ללקוח
                  </div>
                  <div style={styles.summaryPreviewBox}>
                    {actionRecommendations || "אין פעולות להצגה ללקוח כרגע."}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div style={styles.footer}>
            <div>Zviran · Total Rewards Experts</div>
            <div>דוח זה הופק לצורך הצגה והדפסה מתוך המערכת</div>
          </div>
        </div>
      </div>
    </>
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
        <div style={{ marginTop: 14 }}>
          <Section28SavingSimulation group={savingGroup} styles={styles} />
        </div>
      ) : null}

      {comparisonRows.length ? (
        <Section28ComparisonTable rows={comparisonRows} styles={styles} />
      ) : null}

      {retirementGroup ? (
        <div style={{ marginTop: 14 }}>
          <Section28RetirementSimulation group={retirementGroup} styles={styles} />
        </div>
      ) : null}

      {otherGroups.length ? (
        <div className="section-28-grid-print" style={{ ...styles.section28Grid, marginTop: 14 }}>
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
    <div style={styles.section28Group}>
      <div style={styles.section28GroupTitle}>פירוט עלויות עובד / מעסיק</div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
        <div style={cardStyle}>
          <div style={{ ...styles.section28GroupTitle, fontSize: 12 }}>חלק מעסיק</div>
          {employerRows.map((row, index) => (
            <Section28DataRow key={`${row.label}-${index}`} row={row} styles={styles} />
          ))}
          {employerSummaryRows.length ? (
            <div style={{ marginTop: 10 }}>
              {employerSummaryRows.map((row, index) => (
                <Section28DataRow key={`${row.label}-${index}`} row={row} styles={styles} forceHighlight />
              ))}
            </div>
          ) : null}
        </div>

        <div style={cardStyle}>
          <div style={{ ...styles.section28GroupTitle, fontSize: 12 }}>חלק עובד</div>
          {employeeRows.map((row, index) => (
            <Section28DataRow key={`${row.label}-${index}`} row={row} styles={styles} />
          ))}
          {employeeSummaryRows.length ? (
            <div style={{ marginTop: 10 }}>
              {employeeSummaryRows.map((row, index) => (
                <Section28DataRow key={`${row.label}-${index}`} row={row} styles={styles} forceHighlight />
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {monthlyRow ? (
        <div style={{ marginTop: 12 }}>
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
    <div style={styles.section28Group}>
      <div style={styles.section28GroupTitle}>סימולציה לחיסכון</div>
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
    <div style={styles.section28Group}>
      <div style={styles.section28GroupTitle}>
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
    <div style={styles.section28Group}>
      <div style={styles.section28GroupTitle}>{group.title}</div>

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
    <div style={rowStyle}>
      <div style={{ ...styles.section28Label, color: isHighlighted ? "#00215D" : styles.section28Label.color, fontWeight: isHighlighted ? 900 : styles.section28Label.fontWeight }}>
        {row.label}
      </div>
      <div style={{ ...styles.section28Value, color: isHighlighted ? "#FF2756" : styles.section28Value.color }}>
        {formatSection28DisplayValue(row.value)}
      </div>
    </div>
  );
}

function Section28MonthlySavingRow({ row, styles }) {
  return (
    <div
      style={{
        border: "1px solid #D8DEE9",
        borderRadius: 14,
        background: "linear-gradient(135deg, #00215D 0%, #001845 100%)",
        color: "#fff",
        padding: "10px 14px",
        textAlign: "center",
        boxShadow: "0 6px 14px rgba(0,33,93,0.10)",
      }}
    >
      <div style={{ fontSize: 11.5, fontWeight: 800, color: "rgba(255,255,255,0.82)", marginBottom: 4 }}>
        {row.label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 900, direction: "ltr" }}>
        {formatSection28DisplayValue(row.value)}
      </div>
    </div>
  );
}

function Section28EmptyNote() {
  return (
    <div
      style={{
        border: "1px dashed #E2D1BF",
        borderRadius: 12,
        padding: "10px 12px",
        color: "#627D98",
        fontSize: 11,
        textAlign: "center",
        background: "#FCFBF8",
      }}
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
      style={{
        background: "#FFFFFF",
        border: "1px solid #EEE4D8",
        borderRadius: 16,
        padding: 12,
        minHeight: "100%",
      }}
    >
      <div style={{ color: "#00215D", fontSize: 12, fontWeight: 900, marginBottom: 10 }}>
        גרף השוואה
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
              <div style={{ color: "#627D98", fontSize: 10.5, fontWeight: 800, marginBottom: 5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {row.label}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 4 }}>
                {[topBar, bottomBar].map((bar, barIndex) => (
                  <div key={barIndex}>
                    <div style={{ color: bar.color, fontSize: 10.5, fontWeight: 900, marginBottom: 3, direction: "ltr", textAlign: "left" }}>
                      {formatSection28DisplayValue(bar.displayValue)}
                    </div>
                    <div style={{ height: 9, borderRadius: 999, background: "#EAF1FB", overflow: "hidden" }}>
                      <div style={{ width: `${Math.max((bar.value / rowMaxValue) * 100, bar.value ? 4 : 0)}%`, height: "100%", background: bar.fill, borderRadius: 999 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 12, color: "#627D98", fontSize: 10.5, fontWeight: 800 }}>
        <span><span style={{ color: "#C7D1E2" }}>■</span> לפני</span>
        <span><span style={{ color: "#FF2756" }}>■</span> אחרי</span>
      </div>
    </div>
  );
}

function Section28ComparisonTable({ rows, styles }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={styles.section28GroupTitle}>השוואה בין תרחישים</div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.18fr) minmax(230px, 0.82fr)", gap: 12, alignItems: "stretch" }}>
        <div style={{ ...styles.section28TableWrap, marginTop: 0 }}>
          <table style={{ ...styles.section28Table, minWidth: "560px" }}>
            <thead>
              <tr>
                <th style={{ ...styles.section28Th, fontSize: 9.5, padding: "7px 5px" }}>סעיף</th>
                <th style={{ ...styles.section28Th, fontSize: 9.5, padding: "7px 5px" }}>לפני קיטום</th>
                <th style={{ ...styles.section28Th, fontSize: 9.5, padding: "7px 5px" }}>אחרי קיטום</th>
                <th style={{ ...styles.section28Th, fontSize: 9.5, padding: "7px 5px" }}>פער בין תרחישים</th>
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
                    <td style={compactCellStyle}>{row.label}</td>
                    <td style={compactCellStyle}>{formatSection28DisplayValue(row.before)}</td>
                    <td style={compactCellStyle}>{formatSection28DisplayValue(row.after)}</td>
                    <td style={compactCellStyle}>{formatSection28DisplayValue(row.gap)}</td>
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
    <div style={{ marginBottom: 22 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 10,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ color: "#00215D", fontSize: 14, fontWeight: 900 }}>
            טבלת חישוב מתוך PDF
          </div>
          <div style={{ color: "#627D98", fontSize: 12, marginTop: 4 }}>
            הטבלה מציגה את נתוני הצבירה המוכרת כפי שנקראו מהמסמך.
          </div>
        </div>

        <div
          style={{
            background: "#EEF2FA",
            color: "#00215D",
            border: "1px solid #D8DEE9",
            borderRadius: 999,
            padding: "8px 14px",
            fontSize: 12,
            fontWeight: 900,
            whiteSpace: "nowrap",
          }}
        >
          סה"כ תשלומים פטורים: {formatReportNumber(pdfTotal)}
        </div>
      </div>

      <div style={styles.vestedTableWrap}>
        <table style={styles.vestedTable}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} style={styles.vestedTh}>
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
                    <td key={column.key} style={rowStyle}>
                      {row[column.key] || "—"}
                    </td>
                  ))}
                </tr>
              );
            })}

            <tr>
              {columns.map((column) => (
                <td key={column.key} style={styles.vestedTotalTd}>
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
    <div style={{ marginTop: 20 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 10,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ color: "#00215D", fontSize: 14, fontWeight: 900 }}>
            קצבה מוכרת שהוזנה ידנית
          </div>
          <div style={{ color: "#627D98", fontSize: 12, marginTop: 4 }}>
            הטבלה מציגה את הסכומים שהוזנו במסך ההעלאה לפי חברת ביטוח.
          </div>
        </div>
      </div>

      <div style={styles.vestedTableWrap}>
        <table
          style={{
            ...styles.vestedTable,
            minWidth: "520px",
          }}
        >
          <thead>
            <tr>
              <th style={styles.vestedTh}>חברת ביטוח</th>
              <th style={styles.vestedTh}>קצבה מוכרת שהוזנה</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td style={styles.vestedManualTd}>{row.companyName}</td>
                <td style={styles.vestedManualTd}>
                  {formatReportNumber(row.amount)}
                </td>
              </tr>
            ))}

            <tr>
              <td style={styles.vestedTotalTd}>סה"כ</td>
              <td style={styles.vestedTotalTd}>
                {formatReportNumber(manualTotal)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-start" }}>
        <div
          style={{
            background: "#FFF7E8",
            color: "#00215D",
            border: "1px solid #E2D1BF",
            borderRadius: 999,
            padding: "8px 14px",
            fontSize: 12,
            fontWeight: 900,
            whiteSpace: "nowrap",
          }}
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
      style={{
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
      }}
    >
      <div>
        <div style={{ color: "#00215D", fontSize: 15, fontWeight: 900 }}>
          פער הצבירה לחיסכון במס
        </div>
        <div style={{ color: "#627D98", fontSize: 12, marginTop: 5 }}>
          חישוב לפי סה"כ טבלת ה־PDF פחות סה"כ הקצבה המוכרת שהוזנה ידנית.
        </div>
      </div>

      <div
        style={{
          color: gapColor,
          fontSize: 22,
          fontWeight: 900,
          direction: "ltr",
          whiteSpace: "nowrap",
        }}
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
    <div style={styles.kpiCard} className="kpi-card-hover">
      <div
        className="responsive-kpi-inner"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          height: "100%",
        }}
      >
        <div style={styles.kpiIconWrap}>{icon}</div>
        <div style={styles.kpiTitle}>{title}</div>
        <div style={styles.kpiValue}>{value}</div>
        <div style={styles.kpiSub}>{subtext}</div>
      </div>
    </div>
  );
}

function ComparisonChartCard({ styles, title, explanation, bars }) {
  return (
    <div style={styles.compareCard}>
      <div style={styles.compareTitle}>{title}</div>
      <div style={styles.compareDesc}>{explanation}</div>

      <div style={styles.compareBarList}>
        {bars.map((bar) => (
          <div key={bar.label} style={styles.compareBarItem}>
            <div style={styles.compareBarTop}>
              <div style={styles.compareBarLabel}>{bar.label}</div>
              <div style={styles.compareBarValue}>{bar.display}</div>
            </div>

            <div style={styles.compareTrack}>
              <div
                style={{
                  ...(bar.tone === "primary"
                    ? styles.compareFillPrimary
                    : styles.compareFillMuted),
                  width: `${Math.max(bar.ratio, 6)}%`,
                }}
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
    <div style={{ paddingTop: "6px" }}>
      <div
        style={{
          position: "relative",
          height: "16px",
          borderRadius: "999px",
          background:
            "linear-gradient(270deg, #F9F7F3 0%, #EAF1FB 45%, #E2D1BF 75%, #00215D 100%)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            marginRight: 0,
            marginLeft: "auto",
            width: `${safeValue}%`,
            height: "100%",
            borderRadius: "999px",
            background: "linear-gradient(270deg, #FF2756 0%, #00215D 100%)",
            boxShadow: "0 1px 3px rgba(0,33,93,0.25)",
          }}
        />
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: "10px",
          fontSize: "12px",
          color: "#627D98",
          direction: "rtl",
        }}
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
      style={{
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
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background:
            "linear-gradient(145deg, rgba(255,255,255,0.22), rgba(255,255,255,0) 42%, rgba(0,0,0,0.10) 100%)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: hole,
          background: "#fff",
          borderRadius: "50%",
          boxShadow:
            "inset 0 5px 10px rgba(0,33,93,0.05), 0 0 0 2px rgba(255,255,255,0.9)",
          transform: soft ? "rotateX(-4deg)" : "rotateX(-4deg)",
        }}
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
    <section style={styles.donutCard}>
      <h3 style={styles.donutTitle}>{title}</h3>
      <div style={{ ...styles.smallText, marginTop: "6px" }}>{subtitle}</div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 116px",
          gap: "14px",
          alignItems: "center",
          marginTop: "12px",
          minHeight: "122px",
          direction: "rtl",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            minWidth: 0,
          }}
        >
          {segments.length ? (
            segments.slice(0, 5).map((seg, index) => (
              <div
                key={`${seg.name || "item"}-${index}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "42px 1fr 10px",
                  gap: "8px",
                  alignItems: "center",
                  fontSize: "12px",
                }}
              >
                <div
                  style={{
                    color: "#102A43",
                    fontWeight: 800,
                    textAlign: "left",
                    direction: "ltr",
                  }}
                >
                  {Math.round(seg.percent)}%
                </div>

                <div style={{ minWidth: 0, textAlign: "right" }}>
                  <div
                    style={{
                      color: "#102A43",
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={seg.name}
                  >
                    {seg.name}
                  </div>
                  <div
                    style={{
                      color: "#627D98",
                      fontSize: "11px",
                      marginTop: "2px",
                    }}
                  >
                    {formatCurrency(seg.value)}
                  </div>
                </div>

                <span
                  style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "50%",
                    background: seg.color,
                    display: "inline-block",
                    boxShadow: "0 1px 3px rgba(16,42,67,0.15)",
                  }}
                />
              </div>
            ))
          ) : (
            <div style={{ ...styles.smallText, marginTop: "4px" }}>
              אין נתונים להצגה
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "center" }}>
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
    <div style={{ width: "100%", direction: "rtl" }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "16px",
          marginBottom: "22px",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              marginBottom: "6px",
            }}
          >
            <span
              style={{
                width: "18px",
                height: "18px",
                borderRadius: "50%",
                background: `conic-gradient(${colors[0]} 0 25%, ${colors[1]} 25% 50%, ${colors[2]} 50% 75%, ${colors[3]} 75% 100%)`,
                display: "inline-block",
              }}
            />
            <h2
              style={{
                margin: 0,
                fontSize: "20px",
                lineHeight: 1.25,
                color: "#00215D",
                fontWeight: 800,
              }}
            >
              {title}
            </h2>
          </div>

          <div style={{ fontSize: "13px", color: "#627D98", lineHeight: 1.7 }}>
            {subtitle}
          </div>
        </div>
      </div>

      {segments.length ? (
        <div
          className="main-breakdown-layout"
          style={{
            display: "grid",
            gridTemplateColumns: "0.95fr 1.05fr",
            gap: "28px",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
            {segments.map((seg, index) => (
              <div
                key={`${seg.id || seg.name}-${index}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "72px 1fr 132px 14px",
                  gap: "12px",
                  alignItems: "center",
                  padding: "12px 0",
                  borderBottom:
                    index === segments.length - 1 ? "none" : "1px solid #E8E1D7",
                  minHeight: "44px",
                }}
              >
                <div
                  style={{
                    color: "#102A43",
                    fontWeight: 800,
                    fontSize: "14px",
                    textAlign: "left",
                    direction: "ltr",
                  }}
                >
                  {Math.round(seg.percent)}%
                </div>

                <div
                  style={{
                    color: "#102A43",
                    fontWeight: 800,
                    fontSize: "14px",
                    textAlign: "right",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                  title={seg.name}
                >
                  {seg.name}
                </div>

                <div
                  style={{
                    color: "#102A43",
                    fontWeight: 700,
                    fontSize: "14px",
                    textAlign: "right",
                    direction: "ltr",
                    whiteSpace: "nowrap",
                  }}
                >
                  {formatCurrency(seg.value)}
                </div>

                <span
                  style={{
                    width: "14px",
                    height: "14px",
                    borderRadius: "50%",
                    background: seg.color,
                    display: "inline-block",
                    boxShadow: "0 1px 3px rgba(16,42,67,0.15)",
                  }}
                />
              </div>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              minWidth: 0,
            }}
          >
            <div style={{ position: "relative", width: "min(340px, 100%)" }}>
              <div style={{ width: "100%", aspectRatio: "1 / 1", position: "relative" }}>
                <Donut3D gradient={gradient} size={340} hole="27%" />
                <div
                  style={{
                    position: "absolute",
                    inset: "27%",
                    borderRadius: "50%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    textAlign: "center",
                    pointerEvents: "none",
                  }}
                >
                  <div
                    style={{
                      color: "#627D98",
                      fontSize: "15px",
                      fontWeight: 700,
                      marginBottom: "8px",
                    }}
                  >
                    סה"כ נכסים
                  </div>

                  <div
                    style={{
                      color: "#00215D",
                      fontSize: "28px",
                      fontWeight: 900,
                      lineHeight: 1.1,
                      direction: "ltr",
                    }}
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
          style={{
            border: "1px dashed #E2D1BF",
            borderRadius: "16px",
            padding: "18px",
            color: "#627D98",
            fontSize: "12px",
            background: "#FCFBF8",
          }}
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
      style={{
        ...styles.donutCard,
        minHeight: "auto",
        boxShadow: "none",
        padding: 0,
        border: "none",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 116px",
          gap: "14px",
          alignItems: "center",
          minHeight: "122px",
          direction: "rtl",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {segments.length ? (
            segments.map((seg, index) => (
              <div
                key={`${seg.name || "item"}-${index}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "42px 1fr 10px",
                  gap: "8px",
                  alignItems: "center",
                  fontSize: "12px",
                }}
              >
                <div
                  style={{
                    color: "#102A43",
                    fontWeight: 800,
                    textAlign: "left",
                    direction: "ltr",
                  }}
                >
                  {Math.round(seg.percent)}%
                </div>

                <div
                  style={{
                    color: "#102A43",
                    fontWeight: 700,
                    minWidth: 0,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    textAlign: "right",
                  }}
                  title={seg.name}
                >
                  {seg.name}
                </div>

                <span
                  style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "50%",
                    background: seg.color,
                    display: "inline-block",
                    boxShadow: "0 1px 3px rgba(16,42,67,0.15)",
                  }}
                />
              </div>
            ))
          ) : (
            <div style={{ ...styles.smallText, marginTop: "4px" }}>
              אין נתונים להצגה
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "center" }}>
          <Donut3D gradient={gradient} size={110} hole="31%" soft />
        </div>
      </div>
    </section>
  );
}

function ZviranLogo({ light = false }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        direction: "ltr",
        justifyContent: light ? "flex-end" : "flex-start",
      }}
    >
      <div
        style={{
          width: "54px",
          height: "54px",
          borderRadius: "50%",
          background: light ? "rgba(255,255,255,0.14)" : "#0A2668",
          border: light ? "1px solid rgba(255,255,255,0.25)" : "none",
          position: "relative",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            position: "absolute",
            width: "24px",
            height: "8px",
            background: "#FF2756",
            borderRadius: "999px",
            top: "15px",
            left: "16px",
            transform: "rotate(-35deg)",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: "24px",
            height: "8px",
            background: "#ffffff",
            borderRadius: "999px",
            top: "24px",
            left: "12px",
            transform: "rotate(-35deg)",
          }}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
        <div
          style={{
            fontSize: "36px",
            fontWeight: 300,
            letterSpacing: "-1px",
            color: light ? "#fff" : "#0A2668",
          }}
        >
          zviran
        </div>
        <div
          style={{
            marginTop: "6px",
            fontSize: "12px",
            color: light ? "rgba(255,255,255,0.8)" : "#6B7A99",
            letterSpacing: "0.4px",
          }}
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
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M8.5 6.5L12 3L15.5 6.5"
        stroke="#FF2756"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x="4"
        y="14"
        width="16"
        height="6"
        rx="2"
        stroke="#FF2756"
        strokeWidth="2.2"
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
        strokeWidth="2"
      />
      <path d="M12 7V20" stroke="#00215D" strokeWidth="2" />
      <path d="M4 11H20" stroke="#00215D" strokeWidth="2" />
      <path
        d="M9 7C7.8 7 7 6.2 7 5C7 3.8 7.8 3 9 3C10.8 3 12 5 12 7"
        stroke="#00215D"
        strokeWidth="2"
      />
      <path
        d="M15 7C16.2 7 17 6.2 17 5C17 3.8 16.2 3 15 3C13.2 3 12 5 12 7"
        stroke="#00215D"
        strokeWidth="2"
      />
    </svg>
  );
}

function PrintReportA4({ reportData, conversationSummary = "", actionRecommendations = "" }) {
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
  const section28Capping = data.section28Capping || null;
  const section28Groups = Array.isArray(section28Capping?.groups) ? section28Capping.groups : [];
  const vestedBalanceTable = data.vestedBalanceTable || null;
  const vestedRows = Array.isArray(vestedBalanceTable?.rows) ? vestedBalanceTable.rows : [];
  const recognizedPensionAdjustments = Array.isArray(data.recognizedPensionAdjustments) ? data.recognizedPensionAdjustments : [];
  const manualRecognizedRows = getManualRecognizedPensionRows(recognizedPensionAdjustments);
  const capitalClassificationEntries = normalizeCapitalClassificationReportData(data);
  const hasCapitalClassification = capitalClassificationEntries.length > 0;
  const hasSection28Capping = section28Groups.length > 0;
  const hasRecognizedPension = vestedRows.length > 0 || manualRecognizedRows.length > 0;
  const shouldShowPensionAppendixPage = hasSection28Capping || hasRecognizedPension;

  const fmtCurrency = (value) => `₪${Math.round(Number(value || 0)).toLocaleString("en-US")}`;
  const fmtPercent = (value) => `${Math.round(Number(value || 0))}%`;
  const fmtDate = (value) => {
    if (!value) return "—";
    const str = String(value).trim();
    if (/^\d{8}$/.test(str)) return `${str.slice(6, 8)}/${str.slice(4, 6)}/${str.slice(0, 4)}`;
    const date = new Date(str);
    return Number.isNaN(date.getTime()) ? str : new Intl.DateTimeFormat("he-IL").format(date);
  };

  const totalLoansAmount = loanDetails.reduce((sum, loan) => sum + Number(loan.amount || 0), 0);
  const totalLoansBalance = loanDetails.reduce((sum, loan) => sum + Number(loan.balance || 0), 0);
  const loanRatioToAssets = Number(family.totalAssets || 0) > 0 ? (totalLoansAmount / Number(family.totalAssets || 0)) * 100 : 0;
  const pdfRecognizedTotal = getPdfExemptPaymentsTotal(vestedRows);
  const manualRecognizedTotal = manualRecognizedRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);

  const memberPages = [];
  for (let i = 0; i < members.length; i += 2) memberPages.push(members.slice(i, i + 2));

  const capitalClassificationPageNumber = 3;
  const appendixPageNumber = hasCapitalClassification ? 4 : 3;
  const firstMemberPageNumber = appendixPageNumber + (shouldShowPensionAppendixPage ? 1 : 0);
  const loansPageNumber = firstMemberPageNumber + memberPages.length;

  const colors = ["#00215D", "#FF2756", "#1F77B4", "#43B5D9", "#8F63C9", "#F0B43C", "#58BF78", "#A8B0BA"];

  const css = `
    @media screen { .print-report-root { display: none; } }
    @media print {
      @page { size: A4 portrait; margin: 0; }
      html, body { width: 210mm; margin: 0 !important; padding: 0 !important; background: #fff !important; }
      .print-report-root { display: block !important; direction: rtl; font-family: Calibri, Arial, sans-serif; color: #102A43; }
      .print-a4-page { width: 210mm; height: 297mm; padding: 9mm 10mm; background: #fff; page-break-after: always; break-after: page; overflow: hidden; box-sizing: border-box; position: relative; }
      .print-a4-page:last-child { page-break-after: auto; break-after: auto; }
      .print-page-header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 4mm; margin-bottom: 5mm; border-bottom: 1px solid #E2D1BF; }
      .print-logo-text { color: #00215D; font-size: 22px; font-weight: 300; direction: ltr; }
      .print-page-title { color: #00215D; font-size: 18px; font-weight: 900; margin: 0; }
      .print-muted { color: #627D98; font-size: 10.5px; line-height: 1.55; }
      .print-grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4mm; }
      .print-grid-3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4mm; }
      .print-grid-4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 3mm; }
      .print-card { border: 1px solid #E2D1BF; border-radius: 5mm; padding: 4mm; background: #FFFFFF; break-inside: avoid; page-break-inside: avoid; }
      .print-card-soft { background: #FCFBF8; border: 1px solid #EEE4D8; border-radius: 4mm; padding: 2.8mm; }
      .print-kpi-label { color: #627D98; font-size: 10.5px; font-weight: 800; margin-bottom: 2mm; }
      .print-kpi-value { color: #00215D; font-size: 19px; font-weight: 900; line-height: 1.1; direction: ltr; text-align: right; }
      .print-section-heading { color: #00215D; font-size: 13px; font-weight: 900; margin: 0 0 3mm; }
      .print-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 8.5px; }
      .print-table th { background: #00215D; color: white; padding: 1.4mm; border-left: 1px solid rgba(255,255,255,.22); font-weight: 900; }
      .print-table td { padding: 1.35mm; border: 1px solid #EEE4D8; vertical-align: top; word-break: break-word; }
      .print-bar-track { height: 6mm; background: #EAF1FB; border-radius: 999px; overflow: hidden; }
      .print-bar-fill { height: 100%; background: linear-gradient(90deg, #FF2756, #00215D); border-radius: 999px; }
      .print-footer { position: absolute; bottom: 6mm; right: 10mm; left: 10mm; display: flex; justify-content: space-between; color: #8AA0B8; font-size: 9px; border-top: 1px solid #EEE4D8; padding-top: 3mm; }
      .print-list-row { display: grid; grid-template-columns: 20mm minmax(0, 1fr) 28mm; gap: 2mm; align-items: center; border-bottom: 1px solid #EEE4D8; padding: 1.7mm 0; font-size: 9.2px; }
      .print-swatch { width: 3mm; height: 3mm; border-radius: 50%; display: inline-block; margin-left: 2mm; }
      .print-pie { width: 42mm; height: 42mm; border-radius: 50%; position: relative; box-shadow: inset 0 0 0 2px rgba(255,255,255,.95), inset 0 -5px 9px rgba(0,0,0,.12), 0 5px 12px rgba(0,33,93,.10); flex: 0 0 auto; }
      .print-pie::after { content: ""; position: absolute; inset: 30%; border-radius: 50%; background: #fff; box-shadow: inset 0 4px 8px rgba(0,33,93,.06); }
      .print-cover-top { background: linear-gradient(135deg, #00215D, #001845); color: #fff; border-radius: 8mm; padding: 8mm; height: 85mm; box-sizing: border-box; }
      .print-cover-title { font-size: 28px; line-height: 1.18; margin: 8mm 0 4mm; font-weight: 900; text-align: center; }
      .print-cover-subtitle { max-width: 158mm; margin: 0 auto; color: rgba(255,255,255,.86); text-align: center; font-size: 12px; line-height: 1.8; }
      .print-cover-body { display: flex; flex-direction: column; gap: 4mm; margin-top: 5mm; height: 170mm; }
      .print-cover-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 3mm; align-content: start; }
      .print-cover-bars { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4mm; }
      .print-cover-pies { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4mm; }
      .print-cover-pies .print-card { min-height: 62mm !important; }
      .print-page-2-main { margin-bottom: 5mm; }
      .print-page-2-main .print-card { min-height: 116mm !important; }
      .print-page-2-exposures { display: grid; grid-template-columns: minmax(0, .95fr) minmax(0, 1.05fr); gap: 4mm; align-items: stretch; }
      .print-page-2-exposures .print-card { min-height: 64mm !important; }
      .print-page-2-exposures .print-pie-card { min-height: 66mm !important; }
      .print-exposure-stack { border: 1px solid #E2D1BF; border-radius: 5mm; padding: 4mm; background: #FFFFFF; min-height: 66mm; display: flex; flex-direction: column; gap: 4mm; box-sizing: border-box; }
      .print-exposure-card { background: #FCFBF8; border: 1px solid #EEE4D8; border-radius: 4mm; padding: 4mm; flex: 1; display: flex; flex-direction: column; justify-content: center; }
      .print-exposure-row { display: flex; justify-content: space-between; align-items: baseline; gap: 3mm; margin-bottom: 3mm; }
      .print-exposure-legend { display: flex; gap: 4mm; align-items: center; flex-wrap: wrap; color: #627D98; font-size: 9px; font-weight: 800; margin-top: 2.5mm; }
      .print-exposure-dot { width: 3mm; height: 3mm; border-radius: 50%; display: inline-block; margin-left: 1mm; vertical-align: middle; }
      .print-logo-box { width: 38mm; height: 16mm; border: 1px solid rgba(255,255,255,.25); border-radius: 4mm; display: flex; align-items: center; justify-content: center; overflow: hidden; padding: 2mm; background: rgba(255,255,255,.10); }
      .print-logo-box img { max-width: 100%; max-height: 100%; object-fit: contain; }
      .print-simple-logo { color: #fff; font-size: 24px; font-weight: 300; direction: ltr; }
      .print-half-page { height: 123mm; }
      .print-appendix-grid { display: grid; grid-template-columns: minmax(0, 1.78fr) minmax(0, 0.82fr); gap: 4.5mm; align-items: start; direction: rtl; }
      .print-appendix-block { min-height: auto !important; break-inside: auto !important; page-break-inside: auto !important; }
      .print-appendix-card { border: 1px solid #E2D1BF; border-radius: 5mm; padding: 3.2mm; background: #FFFFFF; box-sizing: border-box; overflow: hidden; }
      .print-appendix-page { padding: 7mm 9mm !important; }
      .print-appendix-page .print-page-header { margin-bottom: 3.5mm; padding-bottom: 3mm; }
      .print-appendix-page .print-section-heading { font-size: 12px; margin-bottom: 2.2mm; }
      .print-appendix-page .print-card-soft { border-radius: 5mm; background: linear-gradient(180deg, #FFFFFF 0%, #FCFBF8 100%); }
      .print-appendix-grid > .print-appendix-card:first-child { min-height: auto; }
      .print-appendix-grid > .print-appendix-card:nth-child(2) { min-height: auto; }
      .print-section28-summary-box { border: 1px solid #E2D1BF; border-radius: 4mm; background: #FCFBF8; padding: 3mm 4mm; margin-top: 2.5mm; }
      .print-capital-page { padding: 7mm 8mm !important; }
      .print-capital-page .print-page-header { margin-bottom: 3mm; padding-bottom: 3mm; }
      .print-capital-owner { border: 1px solid #E2D1BF; border-radius: 5mm; background: #FFFFFF; overflow: hidden; margin-bottom: 4mm; }
      .print-capital-owner-header { display: flex; justify-content: space-between; align-items: center; gap: 3mm; padding: 3mm 4mm; border-bottom: 1px solid #EEE4D8; background: #FCFBF8; }
      .print-capital-owner-title { color: #00215D; font-size: 12px; font-weight: 900; }
      .print-capital-owner-source { color: #627D98; font-size: 8.2px; margin-top: 1mm; }
      .print-capital-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2mm; min-width: 70mm; }
      .print-capital-stat { background: #F4F7FB; border: 1px solid #D8E2EF; border-radius: 3mm; padding: 1.8mm; text-align: center; }
      .print-capital-stat-label { color: #627D98; font-size: 7.6px; font-weight: 800; }
      .print-capital-stat-value { color: #00215D; font-size: 9.2px; font-weight: 900; direction: ltr; margin-top: .8mm; }
      .print-capital-table-title { color: #00215D; font-size: 10.5px; font-weight: 900; margin: 3mm 0 1.5mm; }
      .print-capital-table { width: 100%; border-collapse: collapse; table-layout: fixed; direction: rtl; }
      .print-capital-table th { background: #EEF2FA; color: #243B53; border: 1px solid #D8E2EF; padding: 1.3mm .9mm; font-size: 6.4px; line-height: 1.2; font-weight: 900; text-align: center; }
      .print-capital-table td { border: 1px solid #E4EAF2; padding: 1.2mm .8mm; font-size: 6.3px; line-height: 1.2; text-align: center; color: #102A43; word-break: break-word; }
      .print-capital-total td { background: #EEF2FA; color: #1D4ED8; font-weight: 900; }
      .print-section28-summary-label { color: #00215D; font-size: 9.2px; font-weight: 900; line-height: 1.35; margin-bottom: 1.5mm; }
      .print-section28-summary-value { color: #FF2756; font-size: 12px; font-weight: 900; direction: ltr; text-align: left; }
      .print-section28-compact-title { color: #00215D; font-size: 10.5px; font-weight: 900; margin: 0 0 2mm; padding-bottom: 1.5mm; border-bottom: 1px solid #EEE4D8; }
      .print-mini-row { display: grid; grid-template-columns: minmax(0, 1fr) 32mm; gap: 2mm; padding: 1.7mm 0; border-bottom: 1px solid #EEE4D8; font-size: 9px; align-items: center; }
      .print-mini-value { color: #00215D; font-weight: 900; direction: ltr; text-align: left; white-space: nowrap; }
      .print-section28-two-cols { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3mm; align-items: start; }
      .print-section28-side-card { background: #FFFFFF; border: 1px solid #EEE4D8; border-radius: 4mm; padding: 2.6mm; }
      .print-section28-side-title { color: #00215D; font-size: 10.5px; font-weight: 900; padding-bottom: 2mm; margin-bottom: 2mm; border-bottom: 1px solid #EEE4D8; }
      .print-section28-line { display: grid; grid-template-columns: minmax(0, 1fr) 22mm; gap: 2mm; align-items: center; padding: 1.65mm 0; border-bottom: 1px solid #F0E6DA; }
      .print-section28-line-label { color: #627D98; font-size: 7.8px; font-weight: 800; line-height: 1.22; }
      .print-section28-line-value { color: #00215D; font-size: 8.8px; font-weight: 900; direction: ltr; text-align: left; white-space: nowrap; }
      .print-section28-line-highlight { border: 1px solid #E2D1BF; border-radius: 4mm; padding: 2mm 2.5mm; margin-top: 2mm; background: linear-gradient(135deg, #FFF7E8 0%, #EEF2FA 100%); box-shadow: 0 1mm 3mm rgba(0,33,93,0.05); }
      .print-section28-line-highlight .print-section28-line-label { color: #00215D; font-weight: 900; }
      .print-section28-line-highlight .print-section28-line-value { color: #FF2756; }
      .print-section28-monthly { margin-top: 2.5mm; border: 1px solid #D8DEE9; border-radius: 4mm; background: linear-gradient(135deg, #00215D 0%, #001845 100%); color: #fff; padding: 2.6mm; text-align: center; }
      .print-section28-monthly-label { color: rgba(255,255,255,.82); font-size: 8.8px; font-weight: 800; margin-bottom: 1mm; }
      .print-section28-monthly-value { color: #fff; font-size: 10.5px; font-weight: 900; direction: ltr; }

      .print-appendix-page .print-kpi-label { font-size: 9px; margin-bottom: 1.2mm; }
      .print-appendix-page .print-kpi-value { font-size: 16px; }
      .print-appendix-page .print-table { font-size: 7.6px; }
      .print-appendix-page .print-card-soft { margin-bottom: 2.2mm !important; }
    }
  `;

  const PrintHeader = ({ title, page }) => (
    <>
      <div className="print-page-header">
        <h2 className="print-page-title">{title}</h2>
        <div className="print-logo-text">zviran</div>
      </div>
      <div className="print-footer"><span>Zviran · Total Rewards Experts</span><span>עמוד {page}</span></div>
    </>
  );

  const Kpi = ({ label, value, note }) => (
    <div className="print-card">
      <div className="print-kpi-label">{label}</div>
      <div className="print-kpi-value">{value}</div>
      {note ? <div className="print-muted" style={{ marginTop: 6 }}>{note}</div> : null}
    </div>
  );

  const getPieData = (items) => {
    const clean = (Array.isArray(items) ? items : [])
      .map((item) => ({ name: item.name || "ללא שם", value: Number(item.value || 0) }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value);
    const total = clean.reduce((sum, item) => sum + item.value, 0) || 1;
    let current = 0;
    const segments = clean.map((item, index) => {
      const percent = (item.value / total) * 100;
      const start = current;
      const end = current + percent;
      current = end;
      return { ...item, percent, start, end, color: colors[index % colors.length] };
    });
    const gradient = segments.length ? segments.map((seg) => `${seg.color} ${seg.start}% ${seg.end}%`).join(", ") : "#D7DEE7 0% 100%";
    return { clean, segments, total, gradient };
  };

  const PieBreakdown = ({ title, items, large = false, compactClassName = "" }) => {
    const { segments, gradient } = getPieData(items);
    return (
      <div className={`print-card ${compactClassName}`} style={{ minHeight: large ? "112mm" : "auto" }}>
        <h3 className="print-section-heading">{title}</h3>
        <div style={{ display: "grid", gridTemplateColumns: large ? "1fr 58mm" : "1fr 45mm", gap: "4mm", alignItems: "center" }}>
          <div>
            {segments.slice(0, large ? 10 : 6).map((item, index) => (
              <div
                className="print-list-row"
                key={`${title}-${item.name}-${index}`}
                style={{ gridTemplateColumns: "minmax(0, 1fr) 14mm", gap: "2mm" }}
              >
                <div
                  style={{
                    minWidth: 0,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    fontWeight: 800,
                    color: "#102A43",
                  }}
                  title={item.name}
                >
                  <span className="print-swatch" style={{ background: item.color }} />
                  {item.name}
                </div>
                <div style={{ direction: "ltr", color: "#00215D", fontWeight: 900, textAlign: "left" }}>
                  {Math.round(item.percent)}%
                </div>
              </div>
            ))}
            {!segments.length ? <div className="print-muted">אין נתונים להצגה</div> : null}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "3mm" }}>
            <div className="print-pie" style={{ width: large ? "56mm" : "42mm", height: large ? "56mm" : "42mm", background: `conic-gradient(${gradient})` }} />
          </div>
        </div>
      </div>
    );
  };

  const ExposureCard = ({ label, value }) => {
    const safeValue = Math.max(Math.min(Number(value || 0), 100), 0);

    return (
      <div className="print-exposure-card">
        <div className="print-exposure-row">
          <div className="print-kpi-label" style={{ marginBottom: 0 }}>{label}</div>
          <div className="print-kpi-value">{fmtPercent(value)}</div>
        </div>

        <div className="print-bar-track">
          <div className="print-bar-fill" style={{ width: `${safeValue}%` }} />
        </div>

        <div className="print-exposure-legend">
          <span><span className="print-exposure-dot" style={{ background: "linear-gradient(90deg, #FF2756, #00215D)" }} />שיעור החשיפה</span>
          <span><span className="print-exposure-dot" style={{ background: "#EAF1FB" }} />יתרה עד 100%</span>
        </div>
      </div>
    );
  };

  const CompareBlock = ({ title, withValue, withoutValue, withLabel = "עם הפקדות", withoutLabel = "ללא הפקדות" }) => {
    const maxValue = Math.max(Number(withValue || 0), Number(withoutValue || 0), 1);
    return (
      <div className="print-card">
        <h3 className="print-section-heading">{title}</h3>
        {[
          { label: withLabel, value: Number(withValue || 0) },
          { label: withoutLabel, value: Number(withoutValue || 0) },
        ].map((row) => (
          <div key={row.label} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: 10.5, fontWeight: 800 }}>
              <span>{row.label}</span><span style={{ direction: "ltr" }}>{fmtCurrency(row.value)}</span>
            </div>
            <div className="print-bar-track"><div className="print-bar-fill" style={{ width: `${Math.max((row.value / maxValue) * 100, row.value ? 5 : 0)}%` }} /></div>
          </div>
        ))}
      </div>
    );
  };

  const Section28PrintSummary = () => {
    if (!hasSection28Capping) {
      return <div className="print-muted">לא קיימים נתוני סעיף 28 בדוח.</div>;
    }

    const allSection28Rows = section28Groups.flatMap((group) =>
      Array.isArray(group?.rows) ? group.rows.filter((row) => isMeaningfulSection28Value(row.value)) : []
    );

    const findRowsByParts = (rows, labelParts) =>
      labelParts
        .map((part) => rows.find((row) => normalizeSection28Text(row.label).includes(part)))
        .filter(Boolean);

    const costGroup = getSection28Group(section28Groups, "employer-cost", "עלויות") ||
      section28Groups.find((group) => normalizeSection28Text(group?.title).includes("עובד") || normalizeSection28Text(group?.title).includes("מעסיק")) ||
      section28Groups[0];

    const costRows = Array.isArray(costGroup?.rows)
      ? costGroup.rows.filter((row) => isMeaningfulSection28Value(row.value))
      : allSection28Rows;

    const monthlyRow = costRows.find((row) => isSection28MonthlySavingRow(row.label)) ||
      allSection28Rows.find((row) => isSection28MonthlySavingRow(row.label));

    const employerRows = findRowsByParts(costRows.length ? costRows : allSection28Rows, [
      "השתלמות מעל תקרה",
      "פיצויים מעל לתקרה",
      "תגמולים מעל לתקרה",
    ]);

    const employerSummaryRows = findRowsByParts(allSection28Rows, [
      "סכום קיטום מעל לסעיף 28 ברוטו",
      "סכום נטו לאחר ניכוי מס שולי",
    ]);

    const employeeRows = findRowsByParts(costRows.length ? costRows : allSection28Rows, [
      "גידול בנטו בעקבות קיטום בפיצויים",
      "גידול בנטו בעקבות קיטום תגמולים",
      "גידול בנטו בעקבות קיטום קה\"ל מעל לתקרה",
      "הפרשות עובד קה\"ל מעל תקרה",
      "הפרשות עובד תגמולים",
    ]);

    const employeeSummaryRows = findRowsByParts(allSection28Rows, [
      'סה"כ גידול נטו',
      "סה״כ גידול נטו",
      "סך הכל גידול נטו",
    ]);

    const printRow = (row, index, forceHighlight = false) => {
      const highlight = forceHighlight || isSection28ImportantRow(row.label);
      return (
        <div
          className={`print-section28-line${highlight ? " print-section28-line-highlight" : ""}`}
          key={`${row.label}-${index}`}
        >
          <div className="print-section28-line-label">{row.label}</div>
          <div className="print-section28-line-value">{formatSection28DisplayValue(row.value)}</div>
        </div>
      );
    };

    const renderSide = (title, rows, summaryRows) => (
      <div className="print-section28-side-card">
        <div className="print-section28-side-title">{title}</div>
        {rows.map((row, index) => printRow(row, index))}
        {summaryRows.map((row, index) => printRow(row, index, true))}
        {!rows.length && !summaryRows.length ? <div className="print-muted">אין נתון להצגה</div> : null}
      </div>
    );

    const savingGroup = getSection28Group(section28Groups, "saving-simulation", "סימולציה לחיסכון");
    const retirementGroup = getSection28Group(section28Groups, "retirement", "סימולציה לגיל פרישה");

    const renderSimpleGroup = (group, titleOverride, limit = 4) => {
      const rows = Array.isArray(group?.rows)
        ? group.rows.filter((row) => isMeaningfulSection28Value(row.value)).slice(0, limit)
        : [];

      if (!rows.length) return null;

      return (
        <div className="print-card-soft" style={{ marginTop: "3mm" }}>
          <div style={{ color: "#00215D", fontWeight: 900, fontSize: 10.5, marginBottom: "1.5mm" }}>
            {titleOverride || group.title || "סעיף 28"}
          </div>
          {rows.map((row, index) => printRow(row, index, isSection28ImportantRow(row.label)))}
        </div>
      );
    };

    const fallbackRows = allSection28Rows
      .filter((row) => !employerRows.includes(row) && !employerSummaryRows.includes(row) && !employeeRows.includes(row) && !employeeSummaryRows.includes(row))
      .slice(0, 8);

    return (
      <div>
        <div className="print-card-soft" style={{ marginBottom: "3mm" }}>
          <div style={{ color: "#00215D", fontWeight: 900, fontSize: 10.5, marginBottom: "2mm" }}>
            פירוט עלויות עובד / מעסיק
          </div>

          <div className="print-section28-two-cols">
            {renderSide("חלק מעסיק", employerRows, employerSummaryRows)}
            {renderSide("חלק עובד", employeeRows, employeeSummaryRows)}
          </div>

          {monthlyRow ? (
            <div className="print-section28-monthly">
              <div className="print-section28-monthly-label">{monthlyRow.label}</div>
              <div className="print-section28-monthly-value">{formatSection28DisplayValue(monthlyRow.value)}</div>
            </div>
          ) : null}
        </div>

        {renderSimpleGroup(savingGroup, "סימולציה לחיסכון", 3)}
        {renderSimpleGroup(retirementGroup, "סימולציה לגיל פרישה", 3)}

      </div>
    );
  };

  const RecognizedPensionPrintSummary = () => (
    <div>
      {vestedRows.length ? (
        <div className="print-card-soft" style={{ marginBottom: "3mm" }}>
          <div style={{ color: "#00215D", fontWeight: 900, fontSize: 10.5, marginBottom: "2mm" }}>טבלת חישוב מתוך PDF</div>
          <Kpi label="סה״כ תשלומים פטורים" value={formatReportNumber(pdfRecognizedTotal)} />
          <table className="print-table" style={{ marginTop: "3mm" }}>
            <thead><tr><th>שם הקופה</th><th>תשלומים פטורים</th><th>קצבה מוכרת</th></tr></thead>
            <tbody>{vestedRows.slice(0, 6).map((row, index) => <tr key={row.id || index}><td>{row.fundName || "—"}</td><td>{row.exemptPayments || "—"}</td><td>{row.pension || "—"}</td></tr>)}</tbody>
          </table>
        </div>
      ) : null}

      {manualRecognizedRows.length ? (
        <div className="print-card-soft" style={{ marginBottom: "3mm" }}>
          <div style={{ color: "#00215D", fontWeight: 900, fontSize: 10.5, marginBottom: "2mm" }}>קצבה מוכרת שהוזנה ידנית</div>
          <Kpi label="סה״כ קצבה מוכרת" value={formatReportNumber(manualRecognizedTotal)} />
          <table className="print-table" style={{ marginTop: "3mm" }}>
            <thead><tr><th>חברת ביטוח</th><th>סכום</th></tr></thead>
            <tbody>{manualRecognizedRows.slice(0, 7).map((row) => <tr key={row.id}><td>{row.companyName}</td><td>{formatReportNumber(row.amount)}</td></tr>)}</tbody>
          </table>
        </div>
      ) : null}

      {pdfRecognizedTotal > 0 && manualRecognizedTotal > 0 ? (
        <div className="print-card-soft">
          <div style={{ color: "#627D98", fontSize: 10.5, marginBottom: "1mm" }}>פער הצבירה לחיסכון במס</div>
          <div style={{ color: "#00215D", fontSize: 18, fontWeight: 900, direction: "ltr" }}>{formatReportNumber(pdfRecognizedTotal - manualRecognizedTotal)}</div>
        </div>
      ) : null}

      {!vestedRows.length && !manualRecognizedRows.length ? <div className="print-muted">לא קיימים נתוני קצבה מוכרת בדוח.</div> : null}
    </div>
  );



  const splitPrintParagraphs = (text) =>
    String(text || "")
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean);

  const parsePrintActionBlocks = (text) =>
    String(text || "")
      .split(/\n{2,}/)
      .map((block) => {
        const lines = block
          .split(/\n+/)
          .map((line) => line.trim())
          .filter(Boolean);

        if (!lines.length) return null;

        return {
          title: lines[0],
          lines: lines.slice(1),
        };
      })
      .filter(Boolean)
      .filter((block) => block.title || block.lines.length);

  const printSummaryBlocks = splitPrintParagraphs(printConversationSummary);
  const printActionBlocks = parsePrintActionBlocks(printActionRecommendations);

  const PrintSummaryActionsPage = ({ page }) => (
    <section className="print-a4-page print-summary-actions-page">
      <PrintHeader title="סיכום שיחה ופעולות אופרטיביות" page={page} />

      <div className="print-card" style={{ marginBottom: "5mm" }}>
        <h3 className="print-section-heading">סיכום שיחה</h3>
        {printSummaryBlocks.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "3mm" }}>
            {printSummaryBlocks.map((block, index) => {
              const lines = block.split(/\n+/).map((line) => line.trim()).filter(Boolean);
              const isTopicBlock = lines.length > 1;
              return (
                <div
                  key={`summary-print-block-${index}`}
                  className="print-card-soft"
                  style={{
                    whiteSpace: "pre-wrap",
                    fontSize: 10.8,
                    lineHeight: 1.75,
                    borderColor: isTopicBlock ? "#E2D1BF" : "#EEE4D8",
                  }}
                >
                  {isTopicBlock ? (
                    <>
                      <div style={{ color: "#00215D", fontSize: 11.5, fontWeight: 900, marginBottom: "1.5mm" }}>
                        {lines[0]}
                      </div>
                      <div>{lines.slice(1).join("\n")}</div>
                    </>
                  ) : (
                    block
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="print-muted">לא הוזן סיכום בדוח.</div>
        )}
      </div>

      <div className="print-card">
        <h3 className="print-section-heading">פעולות אופרטיביות לביצוע</h3>
        {printActionBlocks.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "3mm" }}>
            {printActionBlocks.map((block, blockIndex) => (
              <div key={`action-print-block-${blockIndex}`} className="print-card-soft" style={{ borderColor: "#E2D1BF" }}>
                <div style={{ color: "#00215D", fontSize: 11.5, fontWeight: 900, marginBottom: "2mm" }}>
                  {block.title}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "1.8mm" }}>
                  {block.lines.length ? (
                    block.lines.map((line, lineIndex) => {
                      const isManualFreeText = block.title === "פעולות ידניות כלליות";
                      const isPersonHeader = ["בן זוג", "בת זוג", "כללי"].includes(line);
                      const isNumberedAction = /^\s*\d+\s*[.)\-–:]\s+/.test(line);

                      if (isManualFreeText) {
                        return (
                          <div
                            key={`${block.title}-${line}-${lineIndex}`}
                            style={{
                              border: "1px solid #EEE4D8",
                              borderRadius: "4mm",
                              background: "#FFFFFF",
                              padding: "2.2mm 3mm",
                              fontSize: 10.5,
                              lineHeight: 1.7,
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                            }}
                          >
                            {line}
                          </div>
                        );
                      }

                      return isPersonHeader ? (
                        <div
                          key={`${block.title}-${line}-${lineIndex}`}
                          style={{
                            color: "#627D98",
                            fontSize: 9.6,
                            fontWeight: 900,
                            marginTop: lineIndex ? "1.5mm" : 0,
                          }}
                        >
                          {line}
                        </div>
                      ) : (
                        <div
                          key={`${block.title}-${line}-${lineIndex}`}
                          style={{
                            border: "1px solid #EEE4D8",
                            borderRadius: "4mm",
                            background: "#FFFFFF",
                            padding: "2.2mm 3mm",
                            fontSize: 10.5,
                            lineHeight: 1.7,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                          }}
                        >
                          {isNumberedAction ? line : line}
                        </div>
                      );
                    })
                  ) : (
                    <div className="print-muted">לא הוזנו פעולות לנושא זה.</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="print-muted">לא הוזנו המלצות לפעולה בדוח.</div>
        )}
      </div>
    </section>
  );


  const PrintCapitalStat = ({ label, value }) => (
    <div className="print-capital-stat">
      <div className="print-capital-stat-label">{label}</div>
      <div className="print-capital-stat-value">{getCapitalRowValue({ value }, "value")}</div>
    </div>
  );

  const PrintCapitalTable = ({ title, rows, type }) => {
    const pensionColumns = [
      { key: "policyNumber", label: "מספר פוליסה" },
      { key: "managerName", label: "חברה מנהלת" },
      { key: "capitalRewards", label: "תגמולים הוניים" },
      { key: "annuityRewards", label: "תגמולים קצבתיים" },
      { key: "annuityRewardsUntil2000", label: "תגמולים קצבתיים עד 1.1.2000" },
      { key: "previousEmployersSeveranceRightsSequence", label: "פיצויים ממעסיקים קודמים ברצף זכויות" },
      { key: "currentEmployerSeveranceTaxable", label: "פיצויים מעסיק נוכחי למס" },
      { key: "capitalSeverance", label: "פיצויים הוניים" },
      { key: "liquidExemptSeverance", label: "פיצויים הוניים פטורים / נזילים" },
      { key: "annuitySeverance", label: "פיצויים קצבתיים פטורים / נזילים" },
    ];
    const studyColumns = [
      { key: "policyNumber", label: "מספר קופה" },
      { key: "managerName", label: "חברה מנהלת" },
      { key: "redemptionValue", label: "ערך פדיון" },
    ];
    const columns = type === "study" ? studyColumns : pensionColumns;
    const totalKeys = type === "study" ? ["redemptionValue"] : pensionColumns.slice(2).map((column) => column.key);

    return (
      <div>
        <div className="print-capital-table-title">{title}</div>
        <table className="print-capital-table">
          <thead>
            <tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.slice(0, type === "study" ? 8 : 6).map((row, rowIndex) => (
              <tr key={row.id || `${row.policyNumber || "row"}-${rowIndex}`}>
                {columns.map((column) => (
                  <td key={column.key}>{getCapitalRowValue(row, column.key)}</td>
                ))}
              </tr>
            ))}
            <tr className="print-capital-total">
              {columns.map((column, index) => {
                const shouldTotal = totalKeys.includes(column.key);
                return (
                  <td key={column.key}>{index === 0 ? 'סה"כ' : shouldTotal ? getCapitalRowValue({ value: summarizeCapitalRows(rows, column.key) }, "value") : ""}</td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  const PrintCapitalClassificationPage = () => (
    <section className="print-a4-page print-capital-page">
      <PrintHeader title="פירוט פוליסות וקרנות" page={capitalClassificationPageNumber} />
      <div className="print-muted" style={{ marginBottom: "3mm" }}>
        פירוק נכסים ללקוח דוגמא זכר — פיצויים מעסיק נוכחי מוצגים תמיד כפיצויים למס.
      </div>
      {capitalClassificationEntries.map((entry, entryIndex) => {
        const pensionRows = normalizeCapitalReportArray(entry.pensionPolicies);
        const studyRows = normalizeCapitalReportArray(entry.studyFunds);
        const allRows = [...pensionRows, ...studyRows];
        const totalBalance = summarizeCapitalRows(allRows, "totalBalance") || summarizeCapitalRows(studyRows, "redemptionValue");
        const totalRewards = summarizeCapitalRows(allRows, "totalRewards");
        const totalSeverance = summarizeCapitalRows(allRows, "totalSeverance");

        return (
          <div className="print-capital-owner" key={`${entry.owner}-${entryIndex}`}>
            <div className="print-capital-owner-header">
              <div>
                <div className="print-capital-owner-title">{entry.ownerLabel || "בן/בת זוג"}</div>
                <div className="print-capital-owner-source">{entry.sourceFileName ? `מקור הנתונים: ${entry.sourceFileName}` : "נתוני סיווג כספים"}</div>
              </div>
              <div className="print-capital-stats">
                <PrintCapitalStat label="סה״כ קופה" value={totalBalance} />
                <PrintCapitalStat label="סה״כ תגמולים" value={totalRewards} />
                <PrintCapitalStat label="סה״כ פיצויים" value={totalSeverance} />
              </div>
            </div>
            <div style={{ padding: "2.5mm 3mm 3mm" }}>
              {pensionRows.length ? <PrintCapitalTable title="פירוט פוליסות וקרנות" rows={pensionRows} type="pension" /> : null}
              {studyRows.length ? <PrintCapitalTable title="קרנות השתלמות" rows={studyRows} type="study" /> : null}
            </div>
          </div>
        );
      })}
      <div className="print-footer"><span>Zviran · Total Rewards Experts</span><span>עמוד {capitalClassificationPageNumber}</span></div>
    </section>
  );

  return (
    <div className="print-report-root" aria-hidden="true">
      <style>{css}</style>

      <section className="print-a4-page">
        <div className="print-cover-top">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8mm" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "4mm", direction: "ltr" }}>
              <ZviranLogo light />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "4mm" }}>
              {data?.clientLogo ? (
                <div className="print-logo-box">
                  <img src={data.clientLogo} alt="לוגו חברה" />
                </div>
              ) : null}
              <div style={{ color: "rgba(255,255,255,.78)", fontSize: 12, whiteSpace: "nowrap" }}>תאריך עדכון: {family.lastUpdated || "—"}</div>
            </div>
          </div>

          <h1 className="print-cover-title">דוח פנסיוני משפחתי מאוחד</h1>
          <div className="print-cover-subtitle">
            אנו מבקשים להציג לך את הנכסים שנצברו במבט משפחתי מרוכז לעיונכם, כולל תמונת מצב של חסכונות, הפקדות, גופים מנהלים, אפיקי השקעה ונתונים מרכזיים נוספים.
          </div>
        </div>

        <div className="print-cover-body">
          <div>
            <h3 className="print-section-heading">נתונים מרכזיים</h3>
            <div className="print-cover-kpis">
              <Kpi label="סך נכסים" value={fmtCurrency(family.totalAssets)} />
              <Kpi label="הפקדה חודשית" value={fmtCurrency(family.monthlyDeposits)} />
              <Kpi label="קצבה חודשית צפויה" value={fmtCurrency(family.monthlyPensionWithDeposits)} />
              <Kpi label="צבירה צפויה בפרישה" value={fmtCurrency(family.projectedLumpSumWithDeposits)} />
            </div>
          </div>

          <div className="print-cover-bars">
            <CompareBlock title="צבירה צפויה בגיל פרישה" withValue={family.projectedLumpSumWithDeposits} withoutValue={family.projectedLumpSumWithoutDeposits} />
            <CompareBlock title="קצבה חודשית בגיל פרישה" withValue={family.monthlyPensionWithDeposits} withoutValue={family.monthlyPensionWithoutDeposits} />
          </div>

          <div className="print-cover-pies">
            <PieBreakdown title="חלוקה לפי מוצרים" items={products} />
            <PieBreakdown title="חלוקה לפי גופים מנהלים" items={managers} />
          </div>
        </div>

        <div className="print-footer"><span>Zviran · Total Rewards Experts</span><span>עמוד 1</span></div>
      </section>

      <section className="print-a4-page">
        <PrintHeader title="אפיקים ראשיים וחשיפות" page={2} />

        <div className="print-page-2-main">
          <PieBreakdown title="חלוקה עבור אפיקים ראשיים" items={mainGroups} large />
        </div>

        <div className="print-page-2-exposures">
          <PieBreakdown title={'פירוט חו"ל / ישראל'} items={foreignExposureAllocation} compactClassName="print-pie-card" />

          <div className="print-exposure-stack">
            <ExposureCard label="אחוז מניות" value={data.weightedEquityExposure} />
            <ExposureCard label={'אחוז אחזקה בחו"ל'} value={data.weightedForeignExposure} />
          </div>
        </div>
      </section>

      {hasCapitalClassification ? <PrintCapitalClassificationPage /> : null}

      {shouldShowPensionAppendixPage ? (
        <section className="print-a4-page print-appendix-page">
          <PrintHeader title="סעיף 28 וקצבה מוכרת" page={appendixPageNumber} />
          <div className="print-appendix-grid">
            <div className="print-appendix-card print-appendix-block">
              <h3 className="print-section-heading">קיטום על פי סעיף 28</h3>
              <Section28PrintSummary />
            </div>
            <div className="print-appendix-card print-appendix-block">
              <h3 className="print-section-heading">צבירה מוכרת / קצבה מוכרת</h3>
              <RecognizedPensionPrintSummary />
            </div>
          </div>
        </section>
      ) : null}

      {memberPages.map((pageMembers, pageIndex) => (
        <section className="print-a4-page" key={`members-page-${pageIndex}`}>
          <PrintHeader title="פירוט לפי בני משפחה" page={firstMemberPageNumber + pageIndex} />
          <div className="print-grid-2">
            {pageMembers.map((member, index) => (
              <div className="print-card" key={member.id || member.name || index}>
                <h3 className="print-section-heading">{member.name || "ללא שם"}</h3>
                <div className="print-grid-2">
                  <Kpi label="סך צבירה" value={fmtCurrency(member.assets)} />
                  <Kpi label="הפקדה חודשית" value={fmtCurrency(member.monthlyDeposits)} />
                </div>
                <div style={{ height: 12 }} />
                <CompareBlock title="קצבה חודשית צפויה" withValue={member.monthlyPensionWithDeposits} withoutValue={member.monthlyPensionWithoutDeposits} />
                <div style={{ height: 12 }} />
                <CompareBlock title="סכום חד הוני לפרישה" withValue={member.lumpSumWithDeposits} withoutValue={member.lumpSumWithoutDeposits} />
                <div style={{ height: 12 }} />
                <div className="print-grid-2">
                  <Kpi label="הון למוטבים / פטירה" value={fmtCurrency(member.deathCoverage)} />
                  <Kpi label="אובדן כושר עבודה" value={`${fmtCurrency(member.disabilityValue)} (${Math.round(Number(member.disabilityPercent || 0))}%)`} />
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="print-a4-page">
        <PrintHeader title="הלוואות וסיכום מהיר" page={loansPageNumber} />
        <div className="print-grid-2" style={{ marginBottom: "5mm" }}>
          <div className="print-card">
            <h3 className="print-section-heading">הלוואות על חשבון מוצרים פנסיוניים</h3>
            <div className="print-grid-2" style={{ marginBottom: 12 }}>
              <Kpi label="סה״כ סכום הלוואות" value={fmtCurrency(totalLoansAmount)} />
              <Kpi label="יתרת הלוואות" value={fmtCurrency(totalLoansBalance)} />
            </div>
            {loanDetails.length ? <table className="print-table"><thead><tr><th>שם</th><th>סכום</th><th>יתרה</th><th>תדירות</th><th>סיום</th></tr></thead><tbody>{loanDetails.slice(0, 10).map((loan, index) => <tr key={loan.id || index}><td>{[loan.firstName, loan.familyName].filter(Boolean).join(" ") || "—"}</td><td>{fmtCurrency(loan.amount)}</td><td>{fmtCurrency(loan.balance)}</td><td>{loan.repaymentFrequency || "—"}</td><td>{fmtDate(loan.endDate)}</td></tr>)}</tbody></table> : <div className="print-muted">לא התקבל פירוט הלוואות להצגה.</div>}
          </div>
          <div className="print-card">
            <h3 className="print-section-heading">סיכום מהיר</h3>
            <div className="print-grid-2" style={{ marginBottom: 12 }}>
              <Kpi label="מוצרים" value={products.length} />
              <Kpi label="גופים מנהלים" value={managers.length} />
              <Kpi label="בני משפחה" value={members.length} />
              <Kpi label="יחס הלוואות לנכסים" value={`${loanRatioToAssets.toFixed(1)}%`} />
            </div>
            <Kpi label="קצבה חודשית צפויה" value={fmtCurrency(family.monthlyPensionWithDeposits)} />
            <div style={{ height: 12 }} />
            <Kpi label="צבירה צפויה בגיל פרישה" value={fmtCurrency(family.projectedLumpSumWithDeposits)} />
          </div>
        </div>
      </section>

      {(printConversationSummary || printActionRecommendations) ? (
        <PrintSummaryActionsPage page={loansPageNumber + 1} />
      ) : null}
    </div>
  );
}
