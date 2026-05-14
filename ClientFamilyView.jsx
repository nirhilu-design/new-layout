import React, { useEffect, useState } from "react";


const STORAGE_CLIENT_MODEL_KEY = "familyPensionClientModel";
const STORAGE_REPORT_DATA_KEY = "familyPensionReportData";

function safeJsonParse(value, fallback = null) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function readLinkedReportData() {
  return (
    window.__familyPensionReportData ||
    safeJsonParse(sessionStorage.getItem(STORAGE_REPORT_DATA_KEY)) ||
    safeJsonParse(localStorage.getItem(STORAGE_REPORT_DATA_KEY)) ||
    safeJsonParse(sessionStorage.getItem("reportData")) ||
    safeJsonParse(localStorage.getItem("reportData")) ||
    safeJsonParse(sessionStorage.getItem("familyPensionReportData")) ||
    safeJsonParse(localStorage.getItem("familyPensionReportData")) ||
    null
  );
}

function readLinkedClientModel() {
  return (
    window.__familyPensionClientModel ||
    safeJsonParse(sessionStorage.getItem(STORAGE_CLIENT_MODEL_KEY)) ||
    safeJsonParse(localStorage.getItem(STORAGE_CLIENT_MODEL_KEY)) ||
    safeJsonParse(sessionStorage.getItem("clientModel")) ||
    safeJsonParse(localStorage.getItem("clientModel")) ||
    safeJsonParse(sessionStorage.getItem("familyPensionClientModel")) ||
    safeJsonParse(localStorage.getItem("familyPensionClientModel")) ||
    null
  );
}

function ClientFamilyView({ clientModel }) {
  const [linkedReportData, setLinkedReportData] = useState(() => readLinkedReportData());
  const [linkedClientModel, setLinkedClientModel] = useState(() => readLinkedClientModel());

  useEffect(() => {
    const syncFromStorage = () => {
      setLinkedReportData(readLinkedReportData());
      setLinkedClientModel(readLinkedClientModel());
    };

    const handleReportUpdate = (event) => {
      if (event?.detail?.reportData) {
        setLinkedReportData(event.detail.reportData);
      }

      if (event?.detail?.clientModel) {
        setLinkedClientModel(event.detail.clientModel);
      }
    };

    window.addEventListener("storage", syncFromStorage);
    window.addEventListener("familyPensionReportDataUpdated", handleReportUpdate);

    syncFromStorage();

    return () => {
      window.removeEventListener("storage", syncFromStorage);
      window.removeEventListener("familyPensionReportDataUpdated", handleReportUpdate);
    };
  }, []);

  const model = linkedClientModel || clientModel || {};
  const linkedSourceReportData = linkedReportData || model.sourceReportData || clientModel?.sourceReportData || {};

  const summary = model.summary || {};
  const exposures = model.exposures || {};
  const members = model.members || [];
  const managers = model.distributions?.managers || [];
  const products = model.distributions?.products || [];
  const mainGroups =
    model.distributions?.mainGroups ||
    model.distributions?.mainGroupAllocation ||
    model.mainGroupAllocation ||
    model.distributions?.assetClasses ||
    [];

  const loans = model.loans || {};
  const loanDetails = Array.isArray(loans.details) ? loans.details : [];

  const sourceReportData = linkedSourceReportData || {};
  const vestedBalanceTable =
    clientModel.vestedBalanceTable || sourceReportData.vestedBalanceTable || null;
  const recognizedPensionAdjustments =
    clientModel.recognizedPensionAdjustments ||
    sourceReportData.recognizedPensionAdjustments ||
    [];
  const hasVestedBalanceData =
    (Array.isArray(vestedBalanceTable?.rows) &&
      vestedBalanceTable.rows.length > 0) ||
    (Array.isArray(recognizedPensionAdjustments) &&
      recognizedPensionAdjustments.length > 0);

  const summaryText = getClientConversationSummaryText(model, sourceReportData);
  const recommendationsText = getClientRecommendationsText(model, sourceReportData);

  const formatCurrency = (value) =>
    `₪${Math.round(Number(value || 0)).toLocaleString("en-US")}`;

  const formatPercent = (value) => `${Math.round(Number(value || 0))}%`;

  const totalLoansAmount = loanDetails.reduce(
    (sum, loan) => sum + Number(loan.amount || loan.balance || 0),
    0
  );

  const loanRatioToAssets =
    Number(summary.totalAssets || 0) > 0
      ? (totalLoansAmount / Number(summary.totalAssets || 0)) * 100
      : 0;

  const lumpBars = buildCompareBars(
    summary.projectedLumpSumWithDeposits,
    summary.projectedLumpSumWithoutDeposits,
    formatCurrency
  );

  const pensionBars = buildCompareBars(
    summary.monthlyPensionWithDeposits,
    summary.monthlyPensionWithoutDeposits,
    formatCurrency
  );

  return (
    <div className="client-family-root" style={page}>
      <style>
        {`
          @media print {
            @page {
              size: A4 portrait;
              margin: 8mm;
            }

            html, body {
              width: 210mm !important;
              margin: 0 !important;
              padding: 0 !important;
              background: #ffffff !important;
              direction: rtl !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }

            .client-family-root {
              width: 194mm !important;
              max-width: 194mm !important;
              margin: 0 auto !important;
              padding: 0 !important;
              background: #ffffff !important;
              direction: rtl !important;
              box-sizing: border-box !important;
            }

            .client-family-root * {
              box-sizing: border-box !important;
            }

            /* Pages */
            .family-print-page {
              width: 194mm !important;
              max-width: 194mm !important;
              margin: 0 auto !important;
              padding: 0 !important;
              background: #ffffff !important;
              page-break-after: always !important;
              break-after: page !important;
            }

            .family-print-page:last-child {
              page-break-after: avoid !important;
              break-after: avoid !important;
            }

            /* Hero */
            .family-hero {
              display: grid !important;
              grid-template-columns: 1fr 2fr 1fr !important;
              gap: 10px !important;
              width: 100% !important;
              margin-bottom: 8px !important;
              padding: 10px 14px !important;
              border-radius: 14px !important;
              box-shadow: none !important;
              break-inside: avoid !important;
            }

            /* Top 4-column grid */
            .family-top-grid {
              display: grid !important;
              grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
              gap: 7px !important;
              margin-bottom: 8px !important;
              width: 100% !important;
            }

            /* Compare grid - 2 columns */
            .family-compare-grid {
              display: grid !important;
              grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
              gap: 7px !important;
              margin-bottom: 8px !important;
              width: 100% !important;
            }

            /* Lower 2-column grid */
            .family-lower-grid {
              display: grid !important;
              grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
              gap: 7px !important;
              margin-bottom: 8px !important;
              width: 100% !important;
            }

            /* Members grid */
            .family-members-grid {
              display: grid !important;
              grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
              gap: 7px !important;
              width: 100% !important;
            }

            /* Summary stats grid */
            .family-summary-grid {
              display: grid !important;
              grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
              gap: 7px !important;
              margin-bottom: 8px !important;
              width: 100% !important;
            }

            /* Cards common */
            .family-kpi-card,
            .family-donut-card,
            .family-compare-card,
            .family-section-card,
            .family-member-card {
              box-shadow: none !important;
              break-inside: avoid !important;
              page-break-inside: avoid !important;
              min-width: 0 !important;
              width: 100% !important;
            }

            .family-kpi-card {
              padding: 8px !important;
              border-radius: 12px !important;
              min-height: 80px !important;
            }

            .family-donut-card {
              padding: 8px !important;
              border-radius: 12px !important;
              min-height: 120px !important;
            }

            .family-compare-card {
              padding: 8px !important;
              border-radius: 12px !important;
              min-height: 100px !important;
            }

            .family-section-card {
              padding: 10px !important;
              border-radius: 12px !important;
              margin-bottom: 8px !important;
              width: 100% !important;
            }

            .family-member-card {
              padding: 8px !important;
              border-radius: 12px !important;
            }

            /* Donut inner layout */
            .family-donut-card [style*="grid-template-columns"] {
              display: grid !important;
              grid-template-columns: 70px minmax(0, 1fr) !important;
              gap: 6px !important;
              margin-top: 5px !important;
            }

            /* Main breakdown full-width donut */
            .family-main-breakdown {
              display: grid !important;
              grid-template-columns: 160px minmax(0, 1fr) !important;
              gap: 10px !important;
              align-items: center !important;
              width: 100% !important;
            }

            .family-main-donut {
              width: 150px !important;
              height: 150px !important;
            }

            .family-main-legend-row {
              display: grid !important;
              grid-template-columns: 10px minmax(0, 1fr) 72px 32px !important;
              gap: 5px !important;
              min-height: 20px !important;
              padding: 3px 0 !important;
            }

            /* Typography */
            h1 { font-size: 16px !important; line-height: 1.2 !important; }
            h2, h3 { font-size: 9px !important; line-height: 1.3 !important; }
            p, span, div { font-size: 8px !important; }

            .family-kpi-value {
              font-size: 16px !important;
              line-height: 1 !important;
              margin-bottom: 2px !important;
            }

            .family-center-value { font-size: 14px !important; }

            .family-explanation {
              font-size: 7.5px !important;
              margin-bottom: 6px !important;
              line-height: 1.4 !important;
            }

            .family-kpi-card svg {
              width: 18px !important;
              height: 18px !important;
            }

            .family-kpi-card > div:first-child {
              width: 36px !important;
              height: 36px !important;
              border-radius: 10px !important;
              margin-bottom: 4px !important;
            }

            /* Table */
            table {
              width: 100% !important;
              table-layout: fixed !important;
              break-inside: avoid !important;
            }

            th, td {
              font-size: 7.5px !important;
              padding: 4px !important;
              white-space: normal !important;
              word-break: break-word !important;
            }

            .no-print { display: none !important; }
          }
        `}
      </style>

      <div className="family-print-page family-print-page-1">
        <Header
          title="דוח פנסיוני משפחתי מאוחד"
          eyebrow="מסך לקוח · דוח משפחתי מאוחד"
          subtitle="ריכזנו עבורך תמונת מצב משפחתית אחת הכוללת את כלל הנכסים הפנסיוניים, תחזית פרישה, פיזור בין מוצרים וגופים מנהלים, חשיפות ומידע מרכזי לכל אחד מבני המשפחה."
          lastUpdated={model.lastUpdated}
        />

        <section className="family-top-grid" style={topGrid}>
          <KpiCard
            icon={<GiftIcon />}
            title="סך נכסים"
            value={formatCurrency(summary.totalAssets)}
            subtext="סך הצבירה הכולל של התא המשפחתי"
          />

          <KpiCard
            icon={<DepositIcon />}
            title="הפקדה חודשית"
            value={formatCurrency(summary.monthlyDeposits)}
            subtext="סך ההפקדות החודשיות של בני המשפחה"
          />

          <DonutSummaryCard
            title="חלוקה לפי מוצרים"
            subtitle="התפלגות הנכסים בין סוגי החיסכון הקיימים בתיק."
            items={products}
            formatCurrency={formatCurrency}
          />

          <DonutSummaryCard
            title="חלוקה לפי גופים מנהלים"
            subtitle="התפלגות הניהול בין החברות והגופים המנהלים."
            items={managers}
            formatCurrency={formatCurrency}
          />
        </section>

        <section className="family-compare-grid" style={compareGrid}>
          <ComparisonChartCard
            title="צבירה צפויה בגיל פרישה"
            explanation="השוואה בין סכום חד פעמי צפוי עם המשך הפקדות לבין ללא המשך הפקדות."
            bars={lumpBars}
          />

          <ComparisonChartCard
            title="קצבה חודשית בגיל פרישה"
            explanation="השוואה בין קצבה צפויה עם המשך הפקדות לבין ללא המשך הפקדות."
            bars={pensionBars}
          />
        </section>

        {hasVestedBalanceData ? (
          <SectionCard title="צבירה מוכרת לפי תגמולים ופיצויים" icon="📋">
            <div className="family-explanation" style={explanation}>
              טבלה זו מוצגת כאשר הועלו נתוני צבירה מוכרת או כאשר הוזנה קצבה
              מוכרת ידנית לפי חברת ביטוח.
            </div>

            <ClientVestedBalanceSection
              table={vestedBalanceTable}
              adjustments={recognizedPensionAdjustments}
            />
          </SectionCard>
        ) : null}
      </div>

      <div className="family-print-page family-print-page-2">
        <section className="family-lower-grid" style={lowerTwoGrid}>
          <SectionCard title='חשיפה לחו"ל' icon="🌍">
            <ExposureMetricBlock
              value={exposures.foreign}
              valueText={formatPercent(exposures.foreign)}
              label={getForeignExposureLabel(exposures.foreign)}
              explanationText='התרשים מציג את החשיפה המשפחתית לחו"ל לפי הנתונים שעובדו מהקבצים.'
            />
          </SectionCard>

          <SectionCard title="חשיפה מנייתית משוקללת" icon="📊">
            <ExposureMetricBlock
              value={exposures.equity}
              valueText={formatPercent(exposures.equity)}
              label={getExposureLabel(exposures.equity)}
              explanationText="המדד מציג את רמת החשיפה למניות ברמת התא המשפחתי."
            />
          </SectionCard>
        </section>

        <SectionCard title="חלוקה לפי אפיקים ראשיים" icon="🥧">
          <div className="family-explanation" style={explanation}>
            התרשים מציג חלוקה משוקללת לפי צבירה של הקטגוריות הראשיות בכלל המוצרים.
          </div>

          <FullWidthDonutCard
            items={mainGroups.length ? mainGroups : products}
            formatCurrency={formatCurrency}
            emptyText="אין נתוני אפיקים להצגה"
          />
        </SectionCard>

        <SectionCard title="פירוט לפי בני משפחה" icon="👨‍👩‍👧‍👦">
          <div className="family-explanation" style={explanation}>
            מוצגת תמונת מצב אישית לכל אחד מבני המשפחה, כולל צבירה, הפקדה, קצבה
            צפויה, סכום חד הוני וכיסויים ביטוחיים.
          </div>

          {members.length ? (
            <div className="family-members-grid" style={membersGrid}>
              {members.map((member) => (
                <MemberCard
                  key={member.id || member.name}
                  member={member}
                  formatCurrency={formatCurrency}
                />
              ))}
            </div>
          ) : (
            <EmptyText>אין בני משפחה להצגה</EmptyText>
          )}
        </SectionCard>
      </div>

      <div className="family-print-page family-print-page-3">
        <SectionCard title="הלוואות על חשבון מוצרים פנסיוניים" icon="💳">
          <div className="family-explanation" style={explanation}>
            פירוט הלוואות לפי אדם עם סיכום כולל ויחס לנכסים.
          </div>

          {loanDetails.length ? (
            <>
              <div className="family-summary-grid" style={summaryStatsGrid}>
                <SmallStat
                  title="סה״כ הלוואות"
                  value={formatCurrency(totalLoansAmount)}
                />
                <SmallStat
                  title="יחס לנכסים"
                  value={`${loanRatioToAssets.toFixed(1)}%`}
                />
              </div>

              <div style={tableWrap}>
                <table style={table}>
                  <thead>
                    <tr>
                      <th style={th}>שם</th>
                      <th style={th}>סכום הלוואה</th>
                      <th style={th}>יתרה</th>
                      <th style={th}>תדירות החזר</th>
                      <th style={th}>תאריך סיום</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loanDetails.map((loan, index) => (
                      <tr key={loan.id || index}>
                        <td style={td}>
                          {[loan.firstName, loan.familyName]
                            .filter(Boolean)
                            .join(" ") ||
                            loan.name ||
                            "—"}
                        </td>
                        <td style={td}>{formatCurrency(loan.amount)}</td>
                        <td style={td}>{formatCurrency(loan.balance)}</td>
                        <td style={td}>{loan.repaymentFrequency || "—"}</td>
                        <td style={td}>{formatDate(loan.endDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <EmptyText>לא התקבל מידע על הלוואות להצגה.</EmptyText>
          )}
        </SectionCard>

        <SectionCard title="סיכום מהיר" icon="🧾">
          <div className="family-summary-grid" style={summaryStatsGrid}>
            <SmallStat title="מוצרים" value={products.length} />
            <SmallStat title="גופים מנהלים" value={managers.length} />
            <SmallStat title="בני משפחה" value={members.length} />
            <SmallStat
              title="חשיפה מנייתית"
              value={formatPercent(exposures.equity)}
            />
          </div>

          <InfoBox
            label="קצבה חודשית צפויה"
            value={formatCurrency(summary.monthlyPensionWithDeposits)}
          />

          <InfoBox
            label="צבירה צפויה בגיל פרישה"
            value={formatCurrency(summary.projectedLumpSumWithDeposits)}
          />

          <InfoBox
            label="יחס הלוואות לנכסים"
            value={`${loanRatioToAssets.toFixed(1)}%`}
          />
        </SectionCard>

        <SectionCard title="סיכום והמלצות" icon="🧾">
          <div className="family-explanation" style={explanation}>
            הסיכום וההמלצות נכתבים במסך ה־REPORT ומוצגים כאן ללקוח כקריאה בלבד.
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
            <div>
              <div style={readonlyBlockTitle}>סיכום</div>
              {summaryText ? (
                <ReadOnlyRecommendations text={summaryText} />
              ) : (
                <EmptyText>לא הוזן סיכום בדוח.</EmptyText>
              )}
            </div>

            <div>
              <div style={readonlyBlockTitle}>המלצות לפעולה</div>
              {recommendationsText ? (
                <ReadOnlyRecommendations text={recommendationsText} />
              ) : (
                <EmptyText>לא הוזנו המלצות לפעולה בדוח.</EmptyText>
              )}
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function getClientConversationSummaryText(clientModel, linkedReportData = null) {
  const sourceReportData = linkedReportData || clientModel?.sourceReportData || {};

  const candidates = [
    sourceReportData?.conversationSummary,
    sourceReportData?.clientConversationSummary,
    sourceReportData?.summaryText,
    clientModel?.conversationSummary,
    clientModel?.clientConversationSummary,
    clientModel?.summaryText,
    sourceReportData?.family?.conversationSummary,
    sourceReportData?.family?.clientConversationSummary,
    sourceReportData?.family?.summaryText,
  ];

  return candidates
    .map((value) => String(value || "").trim())
    .find(Boolean) || "";
}

function getClientRecommendationsText(clientModel, linkedReportData = null) {
  const sourceReportData = linkedReportData || clientModel?.sourceReportData || {};

  const candidates = [
    sourceReportData?.actionRecommendations,
    sourceReportData?.clientActionRecommendations,
    sourceReportData?.recommendationsText,
    sourceReportData?.recommendations,
    clientModel?.actionRecommendations,
    clientModel?.clientActionRecommendations,
    clientModel?.recommendationsText,
    clientModel?.recommendations,
    clientModel?.clientRecommendations,
    sourceReportData?.clientRecommendations,
    sourceReportData?.family?.actionRecommendations,
    sourceReportData?.family?.recommendationsText,
    sourceReportData?.family?.recommendations,
  ];

  return candidates
    .map((value) => String(value || "").trim())
    .find(Boolean) || "";
}

function ReadOnlyRecommendations({ text }) {
  return <div style={recommendationsReadOnlyBox}>{text}</div>;
}

function normalizeClientInsuranceName(value) {
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

function parseClientReportNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const clean = String(value || "")
    .replace(/[₪,\s]/g, "")
    .replace(/[^\d.-]/g, "");

  const number = Number(clean);

  return Number.isFinite(number) ? number : 0;
}

function formatClientReportNumber(value, decimals = 0) {
  const number = Number(value || 0);

  if (!Number.isFinite(number)) {
    return "—";
  }

  return number.toLocaleString("he-IL", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function isClientVestedTotalRow(row) {
  return (
    String(row?.fundName || "")
      .replace(/[״"]/g, "")
      .includes("סהכ") ||
    String(row?.fundName || "").includes('סה"כ') ||
    String(row?.fundName || "").includes("סה״כ")
  );
}

function getClientPdfExemptPaymentsTotal(rows) {
  const pdfRows = Array.isArray(rows) ? rows : [];

  if (!pdfRows.length) {
    return 0;
  }

  const totalRows = pdfRows.filter(isClientVestedTotalRow);
  const totalRowValues = totalRows
    .map((row) => parseClientReportNumber(row.exemptPayments))
    .filter((value) => value > 0);

  if (totalRowValues.length) {
    return Math.max(...totalRowValues);
  }

  const nonTotalValues = pdfRows
    .filter((row) => !isClientVestedTotalRow(row))
    .map((row) => parseClientReportNumber(row.exemptPayments))
    .filter((value) => value > 0);

  return nonTotalValues.reduce((sum, value) => sum + value, 0);
}

function getClientManualRecognizedPensionRows(adjustments) {
  return Array.isArray(adjustments)
    ? adjustments
        .filter((item) => item?.companyName && Number(item?.amount || 0) > 0)
        .map((item, index) => ({
          id: `manual-recognized-pension-${index}`,
          companyName: normalizeClientInsuranceName(item.companyName),
          amount: Number(item.amount || 0),
        }))
    : [];
}

function ClientVestedBalanceSection({ table, adjustments }) {
  const pdfRows = Array.isArray(table?.rows) ? table.rows : [];
  const manualRows = getClientManualRecognizedPensionRows(adjustments);
  const pdfTotal = getClientPdfExemptPaymentsTotal(pdfRows);
  const manualTotal = manualRows.reduce(
    (sum, row) => sum + Number(row.amount || 0),
    0
  );

  return (
    <div>
      {pdfRows.length ? (
        <ClientVestedPdfTable rows={pdfRows} pdfTotal={pdfTotal} />
      ) : null}

      {manualRows.length ? (
        <ClientManualPensionTable rows={manualRows} manualTotal={manualTotal} />
      ) : null}

      {pdfTotal > 0 && manualTotal > 0 ? (
        <ClientTaxSavingGapSummary pdfTotal={pdfTotal} manualTotal={manualTotal} />
      ) : null}
    </div>
  );
}

function ClientVestedPdfTable({ rows, pdfTotal }) {
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

  return (
    <div style={{ marginBottom: 22 }}>
      <div style={clientVestedHeaderRow}>
        <div>
          <div style={clientVestedTitle}>טבלת חישוב מתוך PDF</div>
          <div style={clientVestedSub}>
            הטבלה מציגה את נתוני הצבירה המוכרת כפי שנקראו מהמסמך.
          </div>
        </div>
      </div>

      <div style={clientVestedTableWrap}>
        <table style={clientVestedTable}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} style={clientVestedTh}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((row, index) => {
              const rowStyle = isClientVestedTotalRow(row)
                ? clientVestedTotalTd
                : clientVestedTd;

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
                <td key={column.key} style={clientVestedTotalTd}>
                  {column.key === "fundName"
                    ? 'סה"כ טבלת PDF'
                    : column.key === "exemptPayments"
                    ? formatClientReportNumber(pdfTotal)
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

function ClientManualPensionTable({ rows, manualTotal }) {
  return (
    <div style={{ marginTop: 20 }}>
      <div style={clientVestedHeaderRow}>
        <div>
          <div style={clientVestedTitle}>קצבה מוכרת שהוזנה ידנית</div>
          <div style={clientVestedSub}>
            הטבלה מציגה את הסכומים שהוזנו במסך ההעלאה לפי חברת ביטוח.
          </div>
        </div>
      </div>

      <div style={clientVestedTableWrap}>
        <table style={{ ...clientVestedTable, minWidth: 520 }}>
          <thead>
            <tr>
              <th style={clientVestedTh}>חברת ביטוח</th>
              <th style={clientVestedTh}>קצבה מוכרת שהוזנה</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td style={clientVestedManualTd}>{row.companyName}</td>
                <td style={clientVestedManualTd}>
                  {formatClientReportNumber(row.amount)}
                </td>
              </tr>
            ))}

            <tr>
              <td style={clientVestedTotalTd}>סה"כ</td>
              <td style={clientVestedTotalTd}>
                {formatClientReportNumber(manualTotal)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-start" }}>
        <div style={clientManualSummaryPill}>
          סה"כ קצבה מוכרת: {formatClientReportNumber(manualTotal)}
        </div>
      </div>
    </div>
  );
}

function ClientTaxSavingGapSummary({ pdfTotal, manualTotal }) {
  const gap = pdfTotal - manualTotal;
  const gapColor = gap >= 0 ? theme.navy : "#B42318";

  return (
    <div style={clientGapSummaryBox}>
      <div>
        <div style={clientGapTitle}>פער הצבירה לחיסכון במס</div>
        <div style={clientGapSub}>
          חישוב לפי סה"כ טבלת ה־PDF פחות סה"כ הקצבה המוכרת שהוזנה ידנית.
        </div>
      </div>

      <div style={{ ...clientGapValue, color: gapColor }}>
        {formatClientReportNumber(gap)}
      </div>
    </div>
  );
}

function buildCompareBars(withDeposits, withoutDeposits, formatCurrency) {
  const withValue = Number(withDeposits || 0);
  const withoutValue = Number(withoutDeposits || 0);
  const maxValue = Math.max(withValue, withoutValue, 1);

  return [
    {
      label: "עם הפקדות",
      value: withValue,
      display: formatCurrency(withValue),
      ratio: (withValue / maxValue) * 100,
      tone: "primary",
    },
    {
      label: "ללא הפקדות",
      value: withoutValue,
      display: formatCurrency(withoutValue),
      ratio: (withoutValue / maxValue) * 100,
      tone: "muted",
    },
  ];
}

function Header({ eyebrow, title, subtitle, lastUpdated }) {
  return (
    <section className="family-hero" style={heroHeader}>
      <div style={heroLogoWrap}>
        <ZviranLogo light />
      </div>

      <div style={heroCenter}>
        <div style={heroEyebrow}>{eyebrow}</div>
        <h1 style={heroTitle}>{title}</h1>
        <div style={heroSubtitle}>{subtitle}</div>
      </div>

      <div style={heroMeta}>
        <div style={heroMetaLabel}>תאריך עדכון</div>
        <div style={heroMetaValue}>
          {lastUpdated || new Intl.DateTimeFormat("he-IL").format(new Date())}
        </div>
      </div>
    </section>
  );
}

function KpiCard({ icon, title, value, subtext }) {
  return (
    <div className="family-kpi-card" style={kpiCard}>
      <div style={kpiIconWrap}>{icon}</div>
      <div style={kpiTitle}>{title}</div>
      <div className="family-kpi-value" style={kpiValue}>
        {value}
      </div>
      <div style={kpiSub}>{subtext}</div>
    </div>
  );
}

function SectionCard({ title, icon, children }) {
  return (
    <section className="family-section-card" style={sectionCard}>
      <div style={sectionHeader}>
        <div style={titleWithIcon}>
          {icon ? <span>{icon}</span> : null}
          <h2 style={h2}>{title}</h2>
        </div>
      </div>
      {children}
    </section>
  );
}

function ExposureMetricBlock({ value, valueText, label, explanationText }) {
  return (
    <>
      <div className="family-explanation" style={explanation}>
        {explanationText}
      </div>

      <div style={equityValueWrap}>
        <div style={equityValue}>{valueText}</div>
        <div style={equityLabel}>{label}</div>
      </div>

      <ModernBar value={value} />
    </>
  );
}

function ComparisonChartCard({ title, explanation, bars }) {
  return (
    <section className="family-compare-card" style={compareCard}>
      <div style={compareTitle}>{title}</div>
      <div style={compareDesc}>{explanation}</div>

      <div style={compareBarList}>
        {bars.map((bar) => (
          <div key={bar.label} style={compareBarItem}>
            <div style={compareBarTop}>
              <div style={compareBarLabel}>{bar.label}</div>
              <div style={compareBarValue}>{bar.display}</div>
            </div>

            <div style={compareTrack}>
              <div
                style={{
                  ...(bar.tone === "primary"
                    ? compareFillPrimary
                    : compareFillMuted),
                  width: `${Math.max(bar.ratio, 6)}%`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function DonutSummaryCard({ title, subtitle, items, formatCurrency }) {
  const data = buildSegments(items);

  return (
    <section className="family-donut-card" style={donutCard}>
      <h3 style={donutTitle}>{title}</h3>
      <div style={{ ...smallText, marginTop: 6 }}>{subtitle}</div>

      {!data.segments.length ? (
        <EmptyText>אין נתונים להצגה</EmptyText>
      ) : (
        <div style={donutLayout}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <DonutVisual
              gradient={data.gradient}
              size={102}
              holeInset="31%"
              soft
            />
          </div>

          <div style={legendList}>
            {data.segments.slice(0, 5).map((seg, index) => (
              <LegendRow
                key={`${seg.id || seg.name}-${index}`}
                seg={seg}
                formatCurrency={formatCurrency}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function FullWidthDonutCard({ items, formatCurrency, emptyText }) {
  const data = buildSegments(items);

  if (!data.segments.length) {
    return <EmptyText>{emptyText}</EmptyText>;
  }

  const total = data.segments.reduce(
    (sum, seg) => sum + Number(seg.value || 0),
    0
  );

  return (
    <div className="family-main-breakdown" style={mainBreakdownCardLayout}>
      <div style={mainDonutWrap}>
        <div
          className="family-main-donut"
          style={{
            width: 285,
            height: 285,
            borderRadius: "50%",
            background: `conic-gradient(${data.gradient})`,
            position: "relative",
            flexShrink: 0,
            boxShadow:
              "inset 0 0 0 3px rgba(255,255,255,0.95), inset 0 -10px 16px rgba(0,0,0,0.10), 0 12px 24px rgba(0,33,93,0.10)",
          }}
        >
          <div style={donutGloss} />
          <div
            style={{
              position: "absolute",
              inset: "30%",
              background: "#fff",
              borderRadius: "50%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              boxShadow:
                "inset 0 5px 10px rgba(0,33,93,0.05), 0 0 0 2px rgba(255,255,255,0.9)",
            }}
          >
            <div
              style={{
                color: theme.textSoft,
                fontSize: 12,
                fontWeight: 700,
                marginBottom: 6,
              }}
            >
              סה"כ נכסים
            </div>
            <div
              style={{
                color: theme.navy,
                fontSize: 24,
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

      <div style={mainLegendWrap}>
        {data.segments.map((seg, index) => (
          <div
            className="family-main-legend-row"
            key={`${seg.id || seg.name}-${index}`}
            style={mainLegendRow}
          >
            <span style={{ ...mainLegendDot, background: seg.color }} />

            <div style={mainLegendName} title={seg.name}>
              {seg.name}
            </div>

            <div style={mainLegendValue}>{formatCurrency(seg.value)}</div>

            <div style={mainLegendPercent}>{Math.round(seg.percent)}%</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DonutVisual({ gradient, size = 110, holeInset = "31%", soft = true }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        position: "relative",
        flexShrink: 0,
        background: `conic-gradient(${gradient})`,
        boxShadow: soft
          ? "inset 0 0 0 2px rgba(255,255,255,0.95), inset 0 -7px 10px rgba(0,0,0,0.12), 0 7px 14px rgba(0,33,93,0.10)"
          : "inset 0 0 0 3px rgba(255,255,255,0.95), inset 0 -10px 16px rgba(0,0,0,0.13), 0 12px 22px rgba(0,33,93,0.12)",
        transform: soft
          ? "perspective(700px) rotateX(4deg)"
          : "perspective(850px) rotateX(4deg)",
      }}
    >
      <div style={donutGloss} />
      <div
        style={{
          position: "absolute",
          inset: holeInset,
          background: "#fff",
          borderRadius: "50%",
          boxShadow:
            "inset 0 5px 10px rgba(0,33,93,0.05), 0 0 0 2px rgba(255,255,255,0.9)",
          transform: "rotateX(-4deg)",
        }}
      />
    </div>
  );
}

function buildSegments(items) {
  const safeItems = Array.isArray(items)
    ? items.filter((item) => Number(item.value || 0) > 0)
    : [];

  const total = safeItems.reduce(
    (sum, item) => sum + Number(item.value || 0),
    0
  );

  if (!safeItems.length || total <= 0) {
    return { segments: [], gradient: "#D7DEE7 0% 100%" };
  }

  let current = 0;

  const segments = safeItems.map((item, index) => {
    const value = Number(item.value || 0);
    const percent = (value / total) * 100;
    const start = current;
    const end = current + percent;
    current = end;

    return {
      ...item,
      value,
      percent,
      start,
      end,
      color: chartColors[index % chartColors.length],
    };
  });

  const gradient = segments
    .map((seg) => `${seg.color} ${seg.start}% ${seg.end}%`)
    .join(", ");

  return { segments, gradient };
}

function LegendRow({ seg, formatCurrency }) {
  return (
    <div style={legendRow}>
      <span style={{ ...legendDot, background: seg.color }} />
      <div style={{ minWidth: 0 }}>
        <div style={legendName}>{seg.name}</div>
        <div style={legendSub}>{formatCurrency(seg.value)}</div>
      </div>
      <div style={legendPercent}>{Math.round(seg.percent)}%</div>
    </div>
  );
}

function MemberCard({ member, formatCurrency }) {
  const summary = member.summary || {};
  const insurance = member.insurance || {};

  return (
    <div className="family-member-card" style={memberCard}>
      <div style={memberTop}>
        <div>
          <div style={memberName}>{member.name}</div>
        </div>

        <div style={chip}>
          הפקדה חודשית: {formatCurrency(summary.monthlyDeposits)}
        </div>
      </div>

      <div style={centerCard}>
        <div style={centerLabel}>סך צבירה</div>
        <div className="family-center-value" style={centerValue}>
          {formatCurrency(summary.totalAssets)}
        </div>
      </div>

      <div style={miniGrid}>
        <CompareMiniCard
          title="קצבה חודשית צפויה"
          leftLabel="עם הפקדות"
          leftValue={formatCurrency(summary.monthlyPensionWithDeposits)}
          rightLabel="ללא הפקדות"
          rightValue={formatCurrency(summary.monthlyPensionWithoutDeposits)}
        />

        <CompareMiniCard
          title="סכום חד הוני לפרישה"
          leftLabel="עם הפקדות"
          leftValue={formatCurrency(summary.projectedLumpSumWithDeposits)}
          rightLabel="ללא הפקדות"
          rightValue={formatCurrency(summary.projectedLumpSumWithoutDeposits)}
        />
      </div>

      <div style={insuranceGrid}>
        <div style={insuranceCard}>
          <div style={insuranceLabel}>🛡️ ביטוח חיים</div>
          <div style={insuranceValue}>
            {formatCurrency(insurance.deathCoverage)}
          </div>
        </div>

        <div style={insuranceCard}>
          <div style={insuranceLabel}>🧍 אובדן כושר עבודה</div>
          <div style={insuranceValue}>
            {formatCurrency(insurance.disabilityValue)} (
            {Math.round(Number(insurance.disabilityPercent || 0))}%)
          </div>
        </div>
      </div>
    </div>
  );
}

function CompareMiniCard({ title, leftLabel, leftValue, rightLabel, rightValue }) {
  return (
    <div style={compareMiniCard}>
      <div style={compareMiniTitle}>{title}</div>

      <div style={compareMiniInner}>
        <div style={compareMiniSide}>
          <div style={compareMiniSideLabel}>{leftLabel}</div>
          <div style={compareMiniSideValue}>{leftValue}</div>
        </div>

        <div style={dividerLine} />

        <div style={compareMiniSide}>
          <div style={compareMiniSideLabel}>{rightLabel}</div>
          <div style={compareMiniSideValue}>{rightValue}</div>
        </div>
      </div>
    </div>
  );
}

function SmallStat({ title, value }) {
  return (
    <div style={statCard}>
      <div style={statLabel}>{title}</div>
      <div style={statValue}>{value}</div>
    </div>
  );
}

function InfoBox({ label, value }) {
  return (
    <div style={simpleInfoBox}>
      <div style={infoLabel}>{label}</div>
      <div style={infoValue}>{value}</div>
    </div>
  );
}

function EmptyText({ children }) {
  return <div style={emptyState}>{children}</div>;
}

function ModernBar({ value }) {
  const safe = Math.max(0, Math.min(100, Number(value || 0)));

  return (
    <div style={{ paddingTop: 6 }}>
      <div style={modernTrack}>
        <div style={{ ...modernFill, width: `${safe}%` }} />
      </div>

      <div style={barScale}>
        <span>0%</span>
        <span>25%</span>
        <span>50%</span>
        <span>75%</span>
        <span>100%</span>
      </div>
    </div>
  );
}

function getExposureLabel(value) {
  const num = Number(value || 0);
  if (num <= 30) return "חשיפה נמוכה";
  if (num <= 60) return "חשיפה בינונית";
  return "חשיפה גבוהה";
}

function getForeignExposureLabel(value) {
  const num = Number(value || 0);
  if (num <= 25) return "חשיפה נמוכה לחו״ל";
  if (num <= 50) return "חשיפה בינונית לחו״ל";
  return "חשיפה גבוהה לחו״ל";
}

function formatDate(value) {
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
}

function ZviranLogo({ light = false }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        direction: "ltr",
      }}
    >
      <div
        style={{
          width: 54,
          height: 54,
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
            width: 24,
            height: 8,
            background: "#FF2756",
            borderRadius: 999,
            top: 15,
            left: 16,
            transform: "rotate(-35deg)",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: 24,
            height: 8,
            background: "#ffffff",
            borderRadius: 999,
            top: 24,
            left: 12,
            transform: "rotate(-35deg)",
          }}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
        <div
          style={{
            fontSize: 36,
            fontWeight: 300,
            letterSpacing: "-1px",
            color: light ? "#fff" : "#0A2668",
          }}
        >
          zviran
        </div>
        <div
          style={{
            marginTop: 6,
            fontSize: 12,
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

function GiftIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="7" width="16" height="13" rx="2" stroke="#00215D" strokeWidth="2" />
      <path d="M12 7V20" stroke="#00215D" strokeWidth="2" />
      <path d="M4 11H20" stroke="#00215D" strokeWidth="2" />
      <path d="M9 7C7.8 7 7 6.2 7 5C7 3.8 7.8 3 9 3C10.8 3 12 5 12 7" stroke="#00215D" strokeWidth="2" />
      <path d="M15 7C16.2 7 17 6.2 17 5C17 3.8 16.2 3 15 3C13.2 3 12 5 12 7" stroke="#00215D" strokeWidth="2" />
    </svg>
  );
}

function DepositIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
      <path d="M12 3V14" stroke="#FF2756" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M8.5 6.5L12 3L15.5 6.5" stroke="#FF2756" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="4" y="14" width="16" height="6" rx="2" stroke="#FF2756" strokeWidth="2.2" />
    </svg>
  );
}

// ─── Theme ───────────────────────────────────────────────────────────────────

const theme = {
  pageBg: "#F9F7F3",
  surface: "#FFFFFF",
  surfaceAlt: "#FCFBF8",
  border: "#E2D1BF",
  divider: "#EEE4D8",
  text: "#102A43",
  textSoft: "#627D98",
  navy: "#00215D",
  navyDark: "#001845",
  accent: "#FF2756",
  softBlue: "#EAF1FB",
  mutedBar: "#C7D1E2",
};

const chartColors = [
  "#00215D", "#FF2756", "#1F77B4", "#43B5D9", "#8F63C9",
  "#F0B43C", "#9FD0E6", "#8FB996", "#C08497", "#7B8CBF",
];

// ─── Styles ──────────────────────────────────────────────────────────────────

const page = {
  direction: "rtl",
  fontFamily: 'Calibri, "Arial", sans-serif',
  fontSize: 12,
  lineHeight: 1.6,
  color: theme.text,
};

const heroHeader = {
  background: `linear-gradient(135deg, ${theme.navy}, ${theme.navyDark})`,
  color: "#fff",
  borderRadius: 24,
  padding: "24px 26px",
  boxShadow: "0 8px 28px rgba(0,33,93,0.14)",
  marginBottom: 18,
  display: "grid",
  gridTemplateColumns: "1fr 2fr 1fr",
  alignItems: "center",
  gap: 16,
  direction: "ltr",
};

const heroLogoWrap = { justifySelf: "start", direction: "ltr" };
const heroCenter = { textAlign: "center", direction: "rtl" };
const heroMeta = {
  display: "flex", flexDirection: "column", gap: 4,
  alignItems: "flex-end", justifySelf: "end", direction: "rtl",
};
const heroMetaLabel = { fontSize: 12, color: "rgba(255,255,255,0.75)" };
const heroMetaValue = { fontSize: 14, fontWeight: 700, color: "#fff" };
const heroEyebrow = { fontSize: 12, color: "rgba(255,255,255,0.78)", marginBottom: 8, fontWeight: 700 };
const heroTitle = { margin: 0, fontSize: 30, fontWeight: 700, lineHeight: 1.2, color: "#fff" };
const heroSubtitle = { margin: "12px auto 0", maxWidth: 760, fontSize: 12, lineHeight: 1.8, color: "rgba(255,255,255,0.9)" };

const topGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 18,
  marginBottom: 18,
};

const compareGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 18,
  marginBottom: 18,
};

const lowerTwoGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 18,
  marginBottom: 18,
};

const kpiCard = {
  background: theme.surface,
  border: `1px solid ${theme.border}`,
  borderRadius: 20,
  padding: 20,
  minHeight: 188,
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  textAlign: "center",
  boxShadow: "0 2px 10px rgba(16,42,67,0.05)",
};

const kpiIconWrap = {
  width: 74, height: 74, borderRadius: 22,
  background: "#F4F7FB",
  display: "flex", alignItems: "center", justifyContent: "center",
  flexShrink: 0, marginBottom: 14,
};

const kpiTitle = { fontSize: 14, color: theme.textSoft, fontWeight: 700, marginBottom: 10 };
const kpiValue = { fontSize: 34, lineHeight: 1.1, fontWeight: 700, color: theme.navy, marginBottom: 10 };
const kpiSub = { fontSize: 12, color: "#7A8CA8", lineHeight: 1.7, maxWidth: 260, margin: "0 auto" };

const sectionCard = {
  background: theme.surface,
  border: `1px solid ${theme.border}`,
  borderRadius: 20,
  padding: 20,
  boxShadow: "0 2px 10px rgba(16,42,67,0.05)",
  marginBottom: 18,
};

const sectionHeader = {
  display: "flex", justifyContent: "space-between",
  alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10,
};

const titleWithIcon = { display: "flex", alignItems: "center", gap: 10 };
const h2 = { margin: 0, fontSize: 14, color: theme.navy, fontWeight: 700, lineHeight: 1.4 };
const explanation = { fontSize: 12, color: theme.textSoft, lineHeight: 1.7, marginBottom: 16 };

const donutCard = {
  background: theme.surface,
  border: `1px solid ${theme.border}`,
  borderRadius: 20,
  padding: 18,
  minHeight: 188,
  boxShadow: "0 2px 10px rgba(16,42,67,0.05)",
};

const donutTitle = { margin: 0, color: theme.navy, fontSize: 14, fontWeight: 700 };
const smallText = { fontSize: 12, color: theme.textSoft, lineHeight: 1.6 };
const donutLayout = {
  display: "grid", gridTemplateColumns: "110px 1fr",
  gap: 14, alignItems: "center", marginTop: 12,
};

const legendList = { display: "flex", flexDirection: "column", gap: 8 };
const legendRow = { display: "grid", gridTemplateColumns: "10px 1fr auto", gap: 8, alignItems: "center", fontSize: 12 };
const legendDot = { width: 10, height: 10, borderRadius: "50%", display: "inline-block" };
const legendName = { color: theme.text, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const legendSub = { color: theme.textSoft, fontSize: 11, marginTop: 2 };
const legendPercent = { color: theme.text, fontWeight: 700 };

const compareCard = {
  background: theme.surface,
  border: `1px solid ${theme.border}`,
  borderRadius: 20,
  padding: 20,
  minHeight: 210,
  boxShadow: "0 2px 10px rgba(16,42,67,0.05)",
};

const compareTitle = { fontSize: 14, fontWeight: 700, color: theme.navy, marginBottom: 8 };
const compareDesc = { fontSize: 12, color: theme.textSoft, lineHeight: 1.7, marginBottom: 18 };
const compareBarList = { display: "flex", flexDirection: "column", gap: 18 };
const compareBarItem = { display: "flex", flexDirection: "column", gap: 8 };
const compareBarTop = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 };
const compareBarLabel = { fontSize: 12, color: "#4A5D7A", fontWeight: 700 };
const compareBarValue = { fontSize: 18, color: theme.navy, fontWeight: 700 };
const compareTrack = { width: "100%", height: 18, borderRadius: 999, background: theme.softBlue, overflow: "hidden" };
const compareFillPrimary = { height: "100%", borderRadius: 999, background: `linear-gradient(90deg, ${theme.accent}, ${theme.navy})` };
const compareFillMuted = { height: "100%", borderRadius: 999, background: theme.mutedBar };

const mainBreakdownCardLayout = {
  display: "grid",
  gridTemplateColumns: "minmax(260px, 0.9fr) minmax(360px, 1.1fr)",
  gap: 28,
  alignItems: "center",
  direction: "ltr",
};

const mainDonutWrap = { display: "flex", justifyContent: "center", alignItems: "center", minWidth: 0 };
const mainLegendWrap = { display: "flex", flexDirection: "column", gap: 0, minWidth: 0, direction: "rtl" };
const mainLegendRow = {
  display: "grid",
  gridTemplateColumns: "14px 1fr 96px 46px",
  gap: 10,
  alignItems: "center",
  minHeight: 44,
  padding: "9px 0",
  borderBottom: "1px solid #E8E1D7",
};

const mainLegendDot = { width: 14, height: 14, borderRadius: "50%", display: "inline-block", boxShadow: "0 1px 3px rgba(16,42,67,0.15)" };
const mainLegendName = { color: theme.navy, fontWeight: 800, fontSize: 13, textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const mainLegendValue = { color: theme.navy, fontWeight: 800, fontSize: 12, textAlign: "right", direction: "ltr", whiteSpace: "nowrap" };
const mainLegendPercent = { color: theme.navy, fontWeight: 800, fontSize: 13, textAlign: "left", direction: "ltr" };

const donutGloss = {
  position: "absolute", inset: 0, borderRadius: "50%",
  background: "linear-gradient(145deg, rgba(255,255,255,0.22), rgba(255,255,255,0) 42%, rgba(0,0,0,0.10) 100%)",
  pointerEvents: "none",
};

const equityValueWrap = {
  display: "flex", alignItems: "baseline", justifyContent: "space-between",
  gap: 12, flexWrap: "wrap", marginBottom: 18,
};
const equityValue = { fontSize: 34, lineHeight: 1.1, fontWeight: 700, color: theme.navy };
const equityLabel = { fontSize: 14, fontWeight: 700, color: theme.textSoft };

const modernTrack = {
  position: "relative", height: 16, borderRadius: 999,
  background: "linear-gradient(90deg, #F9F7F3 0%, #EAF1FB 45%, #E2D1BF 75%, #00215D 100%)",
  overflow: "hidden",
};
const modernFill = { height: "100%", borderRadius: 999, background: `linear-gradient(90deg, ${theme.accent} 0%, ${theme.navy} 100%)` };
const barScale = { display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 12, color: theme.textSoft, direction: "ltr" };

const membersGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 18,
  alignItems: "start",
};

const memberCard = {
  background: theme.surface,
  border: `1px solid ${theme.border}`,
  borderRadius: 20,
  padding: 18,
  boxShadow: "0 2px 10px rgba(16,42,67,0.05)",
};

const memberTop = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 14 };
const memberName = { fontSize: 18, fontWeight: 700, color: theme.navy };
const chip = { display: "inline-block", padding: "8px 12px", border: `1px solid ${theme.divider}`, borderRadius: 999, background: theme.surfaceAlt, fontSize: 12, color: "#486581", fontWeight: 700 };
const centerCard = { background: theme.surfaceAlt, border: `1px solid ${theme.divider}`, borderRadius: 16, padding: 18, textAlign: "center", marginBottom: 12 };
const centerLabel = { fontSize: 12, color: theme.textSoft, marginBottom: 8 };
const centerValue = { fontSize: 24, fontWeight: 700, color: theme.navy };

const miniGrid = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, marginBottom: 12 };
const compareMiniCard = { background: theme.surfaceAlt, border: `1px solid ${theme.divider}`, borderRadius: 16, padding: 14 };
const compareMiniTitle = { fontSize: 12, color: theme.textSoft, marginBottom: 10, fontWeight: 700 };
const compareMiniInner = { display: "grid", gridTemplateColumns: "1fr 1px 1fr", gap: 10 };
const dividerLine = { background: theme.divider, width: 1 };
const compareMiniSide = { textAlign: "center" };
const compareMiniSideLabel = { fontSize: 11, color: theme.textSoft, marginBottom: 6 };
const compareMiniSideValue = { fontSize: 16, fontWeight: 700, color: theme.navy };

const insuranceGrid = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 };
const insuranceCard = { background: theme.surfaceAlt, border: `1px solid ${theme.divider}`, borderRadius: 14, padding: 12 };
const insuranceLabel = { fontSize: 12, color: theme.textSoft, marginBottom: 6 };
const insuranceValue = { fontSize: 16, fontWeight: 700, color: theme.navy };

const summaryStatsGrid = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, marginBottom: 14 };
const statCard = { background: theme.surfaceAlt, border: `1px solid ${theme.divider}`, borderRadius: 14, padding: 14 };
const statLabel = { fontSize: 12, color: theme.textSoft, marginBottom: 8 };
const statValue = { fontSize: 18, fontWeight: 700, color: theme.navy };

const simpleInfoBox = { background: theme.surfaceAlt, border: `1px solid ${theme.divider}`, borderRadius: 14, padding: 16, marginTop: 12 };
const infoLabel = { fontSize: 12, color: theme.textSoft, marginBottom: 8 };
const infoValue = { fontSize: 16, fontWeight: 700, color: theme.navy };

const tableWrap = { overflowX: "auto", borderRadius: 14, border: `1px solid ${theme.divider}`, background: "#fff" };
const table = { width: "100%", borderCollapse: "collapse", minWidth: 760, background: "#fff" };
const th = { textAlign: "right", padding: 12, fontSize: 12, color: theme.textSoft, borderBottom: `1px solid ${theme.divider}`, whiteSpace: "nowrap", fontWeight: 700, background: "#FAF8F4" };
const td = { textAlign: "right", padding: 12, fontSize: 12, color: theme.text, borderBottom: "1px solid #F0E6DA", whiteSpace: "nowrap" };
const emptyState = { background: theme.surfaceAlt, border: `1px dashed ${theme.border}`, borderRadius: 14, padding: 18, fontSize: 12, color: theme.textSoft };

const readonlyBlockTitle = {
  color: theme.navy,
  fontSize: 13,
  fontWeight: 900,
  marginBottom: 8,
};

const recommendationsReadOnlyBox = {
  background: "#FFFDFB",
  border: `1px solid ${theme.border}`,
  borderRadius: 16,
  padding: 18,
  minHeight: 130,
  color: theme.text,
  fontSize: 13,
  lineHeight: 1.9,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};


const clientVestedHeaderRow = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 10,
  flexWrap: "wrap",
};

const clientVestedTitle = {
  color: theme.navy,
  fontSize: 14,
  fontWeight: 900,
};

const clientVestedSub = {
  color: theme.textSoft,
  fontSize: 12,
  marginTop: 4,
};

const clientVestedTableWrap = {
  overflowX: "auto",
  marginTop: 12,
  borderRadius: 16,
  border: `1px solid ${theme.divider}`,
  background: "#fff",
};

const clientVestedTable = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 980,
  background: "#fff",
};

const clientVestedTh = {
  textAlign: "center",
  fontSize: 12,
  color: "#fff",
  background: theme.navy,
  borderLeft: "1px solid rgba(255,255,255,0.15)",
  padding: "12px 10px",
  fontWeight: 800,
  whiteSpace: "normal",
  lineHeight: 1.35,
};

const clientVestedTd = {
  textAlign: "center",
  fontSize: 12,
  color: theme.text,
  borderBottom: "1px solid #F0E6DA",
  borderLeft: "1px solid #F0E6DA",
  padding: "12px 10px",
  whiteSpace: "nowrap",
  background: "#fff",
};

const clientVestedTotalTd = {
  textAlign: "center",
  fontSize: 12,
  color: theme.navy,
  borderBottom: "1px solid #D8DEE9",
  borderLeft: "1px solid #D8DEE9",
  padding: "12px 10px",
  whiteSpace: "nowrap",
  background: "#EEF2FA",
  fontWeight: 900,
};

const clientVestedManualTd = {
  textAlign: "center",
  fontSize: 12,
  color: theme.navy,
  borderBottom: "1px solid #E2D1BF",
  borderLeft: "1px solid #E2D1BF",
  padding: "12px 10px",
  whiteSpace: "nowrap",
  background: "#FFF7E8",
  fontWeight: 900,
};

const clientManualSummaryPill = {
  background: "#FFF7E8",
  color: theme.navy,
  border: `1px solid ${theme.border}`,
  borderRadius: 999,
  padding: "8px 14px",
  fontSize: 12,
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const clientGapSummaryBox = {
  marginTop: 22,
  padding: "18px 20px",
  borderRadius: 18,
  border: `1px solid ${theme.border}`,
  background:
    "linear-gradient(135deg, rgba(255,255,255,1) 0%, rgba(255,247,232,1) 100%)",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 16,
  flexWrap: "wrap",
};

const clientGapTitle = {
  color: theme.navy,
  fontSize: 15,
  fontWeight: 900,
};

const clientGapSub = {
  color: theme.textSoft,
  fontSize: 12,
  marginTop: 5,
};

const clientGapValue = {
  fontSize: 22,
  fontWeight: 900,
  direction: "ltr",
  whiteSpace: "nowrap",
};


export default ClientFamilyView;
