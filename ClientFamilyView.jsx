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
  const [selectedPieSegment, setSelectedPieSegment] = useState(null);
  const [activeClientTab, setActiveClientTab] = useState("overview");

  useEffect(() => {
    const syncReportData = (event) => {
      if (event?.detail?.reportData || event?.detail?.clientModel) {
        if (event.detail.reportData) setLinkedReportData(event.detail.reportData);
        if (event.detail.clientModel) setLinkedClientModel(event.detail.clientModel);
        return;
      }

      setLinkedReportData(readLinkedReportData());
      setLinkedClientModel(readLinkedClientModel());
    };

    window.addEventListener("familyPensionReportDataUpdated", syncReportData);
    window.addEventListener("storage", syncReportData);

    syncReportData();

    return () => {
      window.removeEventListener("familyPensionReportDataUpdated", syncReportData);
      window.removeEventListener("storage", syncReportData);
    };
  }, []);

  const model = linkedClientModel || clientModel || {};
  const sourceReportData = linkedReportData || model.sourceReportData || clientModel?.sourceReportData || {};

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

  const conversationSummaryText =
    sourceReportData?.conversationSummary ||
    sourceReportData?.clientConversationSummary ||
    sourceReportData?.summaryText ||
    model?.conversationSummary ||
    "";

  const actionRecommendationsText =
    sourceReportData?.actionRecommendations ||
    sourceReportData?.clientActionRecommendations ||
    sourceReportData?.recommendationsText ||
    sourceReportData?.recommendations ||
    model?.actionRecommendations ||
    model?.recommendationsText ||
    "";

  const openPieDrawer = (payload) => {
    setSelectedPieSegment({
      ...payload,
      details: buildPieSegmentDetails(payload, {
        sourceReportData,
        model,
        members,
        products,
        managers,
        mainGroups,
      }),
    });
  };

  const closePieDrawer = () => {
    setSelectedPieSegment(null);
  };

  const section28Capping =
    clientModel.section28Capping || sourceReportData.section28Capping || null;
  const hasSection28Data =
    Array.isArray(section28Capping?.groups) && section28Capping.groups.length > 0;

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

  const capitalClassification = normalizeClientCapitalClassification(
    sourceReportData?.capitalClassification ||
      model?.capitalClassification ||
      clientModel?.capitalClassification ||
      null
  );

  const hasCapitalClassificationData = capitalClassification.some(
    (section) =>
      section.pensionPolicies.length > 0 ||
      section.studyFunds.length > 0
  );

  useEffect(() => {
    if (!hasCapitalClassificationData && activeClientTab === "capital") {
      setActiveClientTab("overview");
    }
  }, [hasCapitalClassificationData, activeClientTab]);

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
          @keyframes familyDrawerIn {
            from { transform: translateX(-24px); opacity: 0.65; }
            to { transform: translateX(0); opacity: 1; }
          }

          .family-client-shell {
            min-height: 100vh;
            display: grid;
            grid-template-columns: 236px minmax(0, 1fr);
            gap: 18px;
            align-items: start;
            background: #F9F7F3;
            padding: 18px;
            box-sizing: border-box;
          }

          .family-client-sidebar {
            position: sticky;
            top: 18px;
            background: #FFFFFF;
            border: 1px solid #E2D1BF;
            border-radius: 22px;
            padding: 14px;
            box-shadow: 0 8px 24px rgba(16,42,67,0.06);
            z-index: 20;
          }

          .family-client-sidebar-title {
            color: #00215D;
            font-size: 15px;
            font-weight: 900;
            margin: 0 0 4px;
          }

          .family-client-sidebar-subtitle {
            color: #627D98;
            font-size: 11px;
            line-height: 1.55;
            margin: 0 0 12px;
            padding-bottom: 12px;
            border-bottom: 1px solid #EEE4D8;
          }

          .family-client-side-tab {
            width: 100%;
            min-height: 46px;
            border: 1px solid #EEE4D8;
            background: linear-gradient(180deg, #FFFFFF 0%, #FCFBF8 100%);
            border-radius: 14px;
            padding: 0 12px;
            margin: 0 0 9px;
            display: grid;
            grid-template-columns: 24px minmax(0, 1fr);
            gap: 10px;
            align-items: center;
            cursor: pointer;
            font-family: Calibri, Arial, sans-serif;
            text-align: right;
            color: #102A43;
            font-size: 13px;
            font-weight: 900;
            transition: all 0.16s ease;
          }

          .family-client-side-tab:hover {
            border-color: #00215D;
            background: #F4F7FB;
            transform: translateY(-1px);
            box-shadow: 0 8px 18px rgba(0, 33, 93, 0.08);
          }

          .family-client-side-tab.active {
            border-color: #00215D;
            background: #EAF1FB;
            color: #00215D;
            box-shadow: inset 4px 0 0 #00215D, 0 8px 18px rgba(0, 33, 93, 0.08);
          }

          .family-client-side-icon {
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background: #EAF1FB;
            color: #00215D;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 13px;
            font-weight: 900;
          }

          .family-client-content {
            min-width: 0;
          }

          .family-tab-panel {
            display: none;
          }

          .family-tab-panel.active {
            display: block;
          }

          @media (max-width: 980px) {
            .family-client-shell {
              grid-template-columns: 1fr;
              padding: 12px;
            }

            .family-client-sidebar {
              position: relative;
              top: auto;
              display: flex;
              gap: 8px;
              overflow-x: auto;
              align-items: center;
            }

            .family-client-sidebar-title,
            .family-client-sidebar-subtitle {
              display: none;
            }

            .family-client-side-tab {
              min-width: 150px;
              margin: 0;
            }
          }

          @media (max-width: 900px) {
            .family-wide-donut-grid [style*="grid-template-columns"] {
              grid-template-columns: 1fr !important;
            }
          }

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

            /* Wide donut grid - one donut per full row */
            .family-wide-donut-grid {
              display: grid !important;
              grid-template-columns: 1fr !important;
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
              grid-template-columns: 135px minmax(0, 1fr) !important;
              gap: 8px !important;
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

            .no-print,
            .family-client-sidebar { display: none !important; }

            .family-client-shell {
              display: block !important;
              padding: 0 !important;
              background: #ffffff !important;
            }

            .family-client-content {
              display: block !important;
              width: 100% !important;
            }

            .family-tab-panel {
              display: block !important;
            }
          }
        `}
      </style>

      <div className="family-client-shell">
        <aside className="family-client-sidebar no-print" aria-label="תפריט אזורי הדוח">
          <div className="family-client-sidebar-title">תפריט לקוח</div>
          <div className="family-client-sidebar-subtitle">מעבר בין אזורי הדוח המשפחתי</div>

          <button
            type="button"
            className={`family-client-side-tab ${activeClientTab === "overview" ? "active" : ""}`}
            onClick={() => setActiveClientTab("overview")}
          >
            <span className="family-client-side-icon">⌂</span>
            <span>סקירה משפחתית</span>
          </button>

          {hasCapitalClassificationData ? (
            <button
              type="button"
              className={`family-client-side-tab ${activeClientTab === "capital" ? "active" : ""}`}
              onClick={() => setActiveClientTab("capital")}
            >
              <span className="family-client-side-icon">₪</span>
              <span>פירוק נכסים</span>
            </button>
          ) : null}
        </aside>

        <main className="family-client-content">
          <div className={`family-tab-panel ${activeClientTab === "overview" ? "active" : ""}`}>
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
        </section>

        <section className="family-wide-donut-grid" style={wideDonutGrid}>
          <DonutSummaryCard
            title="חלוקה לפי מוצרים"
            subtitle="התפלגות הנכסים בין סוגי החיסכון הקיימים בתיק."
            items={products}
            formatCurrency={formatCurrency}
            wide
            drawerType="product"
            onSegmentClick={openPieDrawer}
          />

          <DonutSummaryCard
            title="חלוקה לפי גופים מנהלים"
            subtitle="התפלגות הניהול בין החברות והגופים המנהלים."
            items={managers}
            formatCurrency={formatCurrency}
            wide
            drawerType="manager"
            onSegmentClick={openPieDrawer}
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

        {hasSection28Data ? (
          <SectionCard title="קיטום על פי סעיף 28" icon="§">
            <div className="family-explanation" style={explanation}>
              אזור זה מוצג רק כאשר קיימים נתוני קיטום סעיף 28 שהועברו מה־REPORT.
            </div>

            <ClientSection28CappingSection data={section28Capping} />
          </SectionCard>
        ) : null}
      </div>

      <div className="family-print-page family-print-page-2">
        {hasVestedBalanceData ? (
          <SectionCard title="קצבה מוכרת" icon="📋">
            <div className="family-explanation" style={explanation}>
              אזור זה מוצג רק כאשר קיימים נתוני קצבה מוכרת מתוך PDF או הזנה ידנית.
            </div>

            <ClientVestedBalanceSection
              table={vestedBalanceTable}
              adjustments={recognizedPensionAdjustments}
            />
          </SectionCard>
        ) : null}
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
            drawerType="mainGroup"
            onSegmentClick={openPieDrawer}
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
          </div>

          {hasCapitalClassificationData ? (
            <div className={`family-tab-panel ${activeClientTab === "capital" ? "active" : ""}`}>
              <div className="family-print-page family-print-page-capital">
                <SectionCard title="פירוק נכסים" icon="📑">
                  <div className="family-explanation" style={explanation}>
                    פירוט זה מציג את אותו מידע שעבר מה־REPORT: פוליסות / גמל / פנסיה,
                    קרנות השתלמות, סיכומי הון וקצבה ומקרא סיווג כספים.
                  </div>

                  <ClientCapitalClassificationSection
                    sections={capitalClassification}
                    formatCurrency={formatCurrency}
                  />
                </SectionCard>
              </div>
            </div>
          ) : null}

          <div className={`family-tab-panel ${activeClientTab === "overview" ? "active" : ""}`}>
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
                <>
                  <ReadOnlyRecommendations text={recommendationsText} />
                  <div style={recommendationsActionsRow} className="no-print">
                    <button
                      type="button"
                      style={recommendationsPrimaryButton}
                      onClick={() => downloadOperationalActionsPdf(recommendationsText)}
                    >
                      הורדת PDF
                    </button>
                    <button
                      type="button"
                      style={recommendationsSecondaryButton}
                      onClick={handleMockSendEmail}
                    >
                      שליחת מייל
                    </button>
                  </div>
                </>
              ) : (
                <EmptyText>לא הוזנו המלצות לפעולה בדוח.</EmptyText>
              )}
            </div>
          </div>
        </SectionCard>
      </div>
          </div>
        </main>
      </div>

      <PieSegmentDrawer
        segment={selectedPieSegment}
        onClose={closePieDrawer}
        formatCurrency={formatCurrency}
      />
    </div>
  );
}


function normalizeClientCapitalClassification(value) {
  const rawSections = Array.isArray(value) ? value : [];

  return rawSections
    .map((section, index) => {
      const pensionPolicies = Array.isArray(section?.pensionPolicies)
        ? section.pensionPolicies
        : Array.isArray(section?.pensionFunds)
        ? section.pensionFunds
        : Array.isArray(section?.policies)
        ? section.policies
        : [];

      const studyFunds = Array.isArray(section?.studyFunds)
        ? section.studyFunds
        : Array.isArray(section?.trainingFunds)
        ? section.trainingFunds
        : [];

      return {
        id: section?.id || section?.owner || `capital-section-${index}`,
        owner: section?.owner || "",
        ownerLabel:
          section?.ownerLabel ||
          section?.memberLabel ||
          (section?.owner === "spouseB" ? "בת זוג" : "בן זוג"),
        sourceFileName: section?.sourceFileName || "",
        pensionPolicies,
        studyFunds,
      };
    })
    .filter((section) => section.pensionPolicies.length || section.studyFunds.length);
}

function clientCapitalNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const clean = String(value || "")
    .replace(/[₪,\s]/g, "")
    .replace(/[^\d.-]/g, "");

  const number = Number(clean);
  return Number.isFinite(number) ? number : 0;
}

function pickClientCapitalValue(row, keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      return clientCapitalNumber(value);
    }
  }

  return 0;
}

function pickClientCapitalText(row, keys, fallback = "—") {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      return String(value);
    }
  }

  return fallback;
}

function formatClientCapitalCurrency(value) {
  const number = clientCapitalNumber(value);
  if (!number) return "-";
  return `₪${Math.round(number).toLocaleString("en-US")}`;
}

function getClientCapitalRowValues(row) {
  const capitalRewards = pickClientCapitalValue(row, [
    "capitalRewards",
    "rewardsCapital",
    "totalRewardsCapital",
    "תגמולים הוניים",
  ]);

  const pensionRewards = pickClientCapitalValue(row, [
    "pensionRewards",
    "rewardsPension",
    "totalRewardsPension",
    "תגמולים קצבתיים",
  ]);

  const pre2000Rewards = pickClientCapitalValue(row, [
    "pre2000Rewards",
    "rewardsUntil2000",
    "pensionRewardsUntil2000",
    "תגמולים קצבתיים עד 1.1.2000",
  ]);

  const previousEmployerSeverance = pickClientCapitalValue(row, [
    "previousEmployerSeverance",
    "previousEmployerSeverancePension",
    "severancePreviousEmployerPension",
    "פיצויים ממעסיקים קודמים ברצף זכויות",
  ]);

  const currentEmployerSeveranceTaxable = pickClientCapitalValue(row, [
    "currentEmployerSeveranceTaxable",
    "currentEmployerSeverance",
    "currentEmployerSeveranceForTax",
    "פיצויים מעסיק נוכחי למס",
  ]);

  const exemptSeverance = pickClientCapitalValue(row, [
    "exemptSeverance",
    "liquidSeverance",
    "capitalCompensation",
    "severanceCapital",
    "פיצויים הוניים פטורים",
    "פיצויים הוניים",
  ]);

  const totalPension = pickClientCapitalValue(row, ["totalPension", "סהכ קצבה", "סה״כ קצבה"]);
  const totalCapital = pickClientCapitalValue(row, ["totalCapital", "סהכ הון", "סה״כ הון"]);

  return {
    capitalRewards,
    pensionRewards,
    pre2000Rewards,
    previousEmployerSeverance,
    currentEmployerSeveranceTaxable,
    exemptSeverance,
    totalPension:
      totalPension ||
      pensionRewards + previousEmployerSeverance,
    totalCapital:
      totalCapital ||
      capitalRewards + pre2000Rewards + exemptSeverance,
  };
}

function getClientStudyFundValue(row) {
  return pickClientCapitalValue(row, [
    "totalFund",
    "fundValue",
    "accumulation",
    "value",
    "totalAssets",
    "balance",
    "סהכ קופה",
    "סה״כ קופה",
  ]);
}

function ClientCapitalClassificationSection({ sections, formatCurrency }) {
  const safeSections = Array.isArray(sections) ? sections : [];

  const allPensionRows = safeSections.flatMap((section) => section.pensionPolicies || []);
  const allStudyRows = safeSections.flatMap((section) => section.studyFunds || []);

  const totals = allPensionRows.reduce(
    (acc, row) => {
      const values = getClientCapitalRowValues(row);
      acc.totalCapital += values.totalCapital;
      acc.totalPension += values.totalPension;
      acc.totalRewards += values.capitalRewards + values.pensionRewards + values.pre2000Rewards;
      acc.totalSeverance +=
        values.previousEmployerSeverance +
        values.currentEmployerSeveranceTaxable +
        values.exemptSeverance;
      return acc;
    },
    { totalCapital: 0, totalPension: 0, totalRewards: 0, totalSeverance: 0 }
  );

  const studyTotal = allStudyRows.reduce(
    (sum, row) => sum + getClientStudyFundValue(row),
    0
  );

  const totalFund = totals.totalCapital + totals.totalPension + studyTotal;

  return (
    <div style={clientCapitalWrap}>
      <div style={clientCapitalKpiGrid}>
        <ClientCapitalKpi title="סה״כ קופה" value={formatCurrency(totalFund)} />
        <ClientCapitalKpi title="סה״כ תגמולים" value={formatCurrency(totals.totalRewards)} />
        <ClientCapitalKpi title="סה״כ פיצויים" value={formatCurrency(totals.totalSeverance)} />
        <ClientCapitalKpi title="סה״כ הון" value={formatCurrency(totals.totalCapital + studyTotal)} tone="capital" />
        <ClientCapitalKpi title="סה״כ קצבה" value={formatCurrency(totals.totalPension)} tone="pension" />
      </div>

      <div style={clientCapitalLegendBox}>
        <div style={clientCapitalLegendTitle}>מקרא סיווג כספים</div>
        <div style={clientCapitalLegendItems}>
          <ClientCapitalLegendItem
            color="#F8FBFF"
            border="#DCEAFE"
            label="כספים קצבתיים"
            text="מיועדים לקצבה חודשית"
          />
          <ClientCapitalLegendItem
            color="#FFFDF7"
            border="#F3E7C3"
            label="כספים הוניים"
            text="במעמד הון / נזילים / עד 1.1.2000"
          />
        </div>
      </div>

      {safeSections.map((section, index) => (
        <div key={section.id || index} style={clientCapitalOwnerBlock}>
          <div style={clientCapitalOwnerHeader}>
            <div>
              <div style={clientCapitalOwnerTitle}>{section.ownerLabel}</div>
              {section.sourceFileName ? (
                <div style={clientCapitalOwnerSub}>מקור הנתונים: {section.sourceFileName}</div>
              ) : null}
            </div>
          </div>

          <ClientCapitalPensionTable rows={section.pensionPolicies} />
          <ClientCapitalStudyFundsTable rows={section.studyFunds} />
        </div>
      ))}

      <div style={clientCapitalNoteBox}>
        כספים הוניים כוללים רכיבי הון, תגמולים הוניים ותגמולים קצבתיים עד שנת 1.1.2000.
        כספים קצבתיים כוללים רכיבים המיועדים לקצבה חודשית. קרנות השתלמות מוצגות כצבירה בלבד.
      </div>
    </div>
  );
}

function ClientCapitalKpi({ title, value, tone }) {
  const style = {
    ...clientCapitalKpi,
    ...(tone === "capital" ? clientCapitalKpiCapital : {}),
    ...(tone === "pension" ? clientCapitalKpiPension : {}),
  };

  return (
    <div style={style}>
      <div style={clientCapitalKpiLabel}>{title}</div>
      <div style={clientCapitalKpiValue}>{value}</div>
    </div>
  );
}

function ClientCapitalLegendItem({ color, border, label, text }) {
  return (
    <div style={clientCapitalLegendItem}>
      <span style={{ ...clientCapitalLegendSwatch, background: color, borderColor: border }} />
      <div>
        <div style={clientCapitalLegendLabel}>{label}</div>
        <div style={clientCapitalLegendText}>{text}</div>
      </div>
    </div>
  );
}

function ClientCapitalPensionTable({ rows }) {
  const safeRows = Array.isArray(rows) ? rows : [];

  if (!safeRows.length) {
    return null;
  }

  const totals = safeRows.reduce(
    (acc, row) => {
      const values = getClientCapitalRowValues(row);
      Object.keys(acc).forEach((key) => {
        acc[key] += Number(values[key] || 0);
      });
      return acc;
    },
    {
      capitalRewards: 0,
      pensionRewards: 0,
      pre2000Rewards: 0,
      previousEmployerSeverance: 0,
      currentEmployerSeveranceTaxable: 0,
      exemptSeverance: 0,
      totalPension: 0,
      totalCapital: 0,
    }
  );

  return (
    <div style={clientCapitalTableSection}>
      <div style={clientCapitalTableTitle}>פוליסות / גמל / פנסיה</div>
      <div style={clientCapitalTableWrap}>
        <table style={clientCapitalTable}>
          <thead>
            <tr>
              <th style={clientCapitalTh}>מוצר / קבוצה</th>
              <th style={clientCapitalTh}>חברה מנהלת</th>
              <th style={clientCapitalTh}>תגמולים הוניים</th>
              <th style={clientCapitalTh}>תגמולים קצבתיים</th>
              <th style={clientCapitalTh}>תגמולים קצבתיים עד 1.1.2000</th>
              <th style={clientCapitalTh}>פיצויים ממעסיקים קודמים ברצף זכויות</th>
              <th style={clientCapitalTh}>פיצויים מעסיק נוכחי למס</th>
              <th style={clientCapitalTh}>פיצויים הוניים פטורים</th>
              <th style={clientCapitalTh}>סה״כ קצבה</th>
              <th style={clientCapitalTh}>סה״כ הון</th>
            </tr>
          </thead>
          <tbody>
            {safeRows.map((row, index) => {
              const values = getClientCapitalRowValues(row);
              return (
                <tr key={row.id || index}>
                  <td style={clientCapitalTdStrong}>{pickClientCapitalText(row, ["productGroup", "groupName", "productType", "productName", "name"], "—")}</td>
                  <td style={clientCapitalTd}>{pickClientCapitalText(row, ["managingCompany", "companyName", "managerName", "issuerName"], "—")}</td>
                  <td style={clientCapitalTd}>{formatClientCapitalCurrency(values.capitalRewards)}</td>
                  <td style={clientCapitalTd}>{formatClientCapitalCurrency(values.pensionRewards)}</td>
                  <td style={clientCapitalTd}>{formatClientCapitalCurrency(values.pre2000Rewards)}</td>
                  <td style={clientCapitalTd}>{formatClientCapitalCurrency(values.previousEmployerSeverance)}</td>
                  <td style={clientCapitalTd}>{formatClientCapitalCurrency(values.currentEmployerSeveranceTaxable)}</td>
                  <td style={clientCapitalTd}>{formatClientCapitalCurrency(values.exemptSeverance)}</td>
                  <td style={clientCapitalTdStrong}>{formatClientCapitalCurrency(values.totalPension)}</td>
                  <td style={clientCapitalTdStrong}>{formatClientCapitalCurrency(values.totalCapital)}</td>
                </tr>
              );
            })}
            <tr>
              <td style={clientCapitalTotalLabel} colSpan={2}>סה״כ</td>
              <td style={clientCapitalTotalTd}>{formatClientCapitalCurrency(totals.capitalRewards)}</td>
              <td style={clientCapitalTotalTd}>{formatClientCapitalCurrency(totals.pensionRewards)}</td>
              <td style={clientCapitalTotalTd}>{formatClientCapitalCurrency(totals.pre2000Rewards)}</td>
              <td style={clientCapitalTotalTd}>{formatClientCapitalCurrency(totals.previousEmployerSeverance)}</td>
              <td style={clientCapitalTotalTd}>{formatClientCapitalCurrency(totals.currentEmployerSeveranceTaxable)}</td>
              <td style={clientCapitalTotalTd}>{formatClientCapitalCurrency(totals.exemptSeverance)}</td>
              <td style={{ ...clientCapitalTotalTd, ...clientCapitalTotalPension }}>{formatClientCapitalCurrency(totals.totalPension)}</td>
              <td style={{ ...clientCapitalTotalTd, ...clientCapitalTotalCapital }}>{formatClientCapitalCurrency(totals.totalCapital)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ClientCapitalStudyFundsTable({ rows }) {
  const safeRows = Array.isArray(rows) ? rows : [];

  if (!safeRows.length) {
    return null;
  }

  const total = safeRows.reduce((sum, row) => sum + getClientStudyFundValue(row), 0);

  return (
    <div style={clientCapitalTableSection}>
      <div style={clientCapitalTableTitle}>קרנות השתלמות</div>
      <div style={clientCapitalTableWrapNarrow}>
        <table style={clientCapitalTable}>
          <thead>
            <tr>
              <th style={clientCapitalTh}>חברה מנהלת</th>
              <th style={clientCapitalTh}>מספר קופה</th>
              <th style={clientCapitalTh}>צבירה</th>
            </tr>
          </thead>
          <tbody>
            {safeRows.map((row, index) => (
              <tr key={row.id || index}>
                <td style={clientCapitalTd}>{pickClientCapitalText(row, ["managingCompany", "companyName", "managerName", "issuerName"], "—")}</td>
                <td style={clientCapitalTd}>{pickClientCapitalText(row, ["policyNumber", "fundNumber", "accountNumber", "kupatNumber", "planNumber"], "—")}</td>
                <td style={clientCapitalTdStrong}>{formatClientCapitalCurrency(getClientStudyFundValue(row))}</td>
              </tr>
            ))}
            <tr>
              <td style={clientCapitalTotalLabel} colSpan={2}>סה״כ</td>
              <td style={clientCapitalTotalTd}>{formatClientCapitalCurrency(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}


function normalizeSection28Text(value) {
  return String(value || "")
    .replace(/[״”"]/g, '"')
    .replace(/[׳’']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseFamilyReportNumber(value) {
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

function formatFamilyReportCurrency(value) {
  return `₪${Math.round(parseFamilyReportNumber(value)).toLocaleString("en-US")}`;
}

function formatFamilyReportValue(value) {
  if (value === null || value === undefined || String(value).trim() === "") return "—";
  const text = String(value).trim();
  if (text.includes("%")) return text;

  const numeric = parseFamilyReportNumber(value);
  if (numeric !== 0 || /^-?[\d,.\s₪]+$/.test(text)) {
    return formatFamilyReportCurrency(numeric);
  }

  return text;
}

function getClientSection28Group(groups, id, titlePart) {
  return Array.isArray(groups)
    ? groups.find(
        (group) =>
          group?.id === id ||
          normalizeSection28Text(group?.title).includes(titlePart)
      )
    : null;
}

function pickClientSection28Rows(rows, labelParts) {
  return labelParts
    .map((part) => rows.find((row) => normalizeSection28Text(row?.label).includes(part)))
    .filter(Boolean);
}

function isSection28DisplayValue(value) {
  if (value === null || value === undefined) return false;
  const text = String(value).trim();
  if (!text || text === "—" || text === "-") return false;
  return parseFamilyReportNumber(value) !== 0 || /[^₪,%\s0.,-]/.test(text);
}

function ClientSection28CappingSection({ data }) {
  const groups = Array.isArray(data?.groups) ? data.groups : [];

  if (!groups.length) {
    return <EmptyText>קיימים נתוני סעיף 28 אך לא נמצאו קבוצות להצגה.</EmptyText>;
  }

  const costGroup = getClientSection28Group(groups, "employer-cost", "עלויות") || groups[0];
  const savingGroup = getClientSection28Group(groups, "saving-simulation", "סימולציה לחיסכון");
  const retirementGroup = getClientSection28Group(groups, "retirement", "סימולציה לגיל פרישה");
  const comparisonRows = Array.isArray(data?.comparisonRows) ? data.comparisonRows : [];
  const costRows = Array.isArray(costGroup?.rows)
    ? costGroup.rows.filter((row) => isSection28DisplayValue(row?.value))
    : [];

  const monthlyRow = costRows.find((row) =>
    normalizeSection28Text(row?.label).includes("סכום חודשי נטו שמועבר לחיסכון אישי")
  );

  const employerRows = pickClientSection28Rows(costRows, [
    "השתלמות מעל תקרה",
    "פיצויים מעל לתקרה",
    "תגמולים מעל לתקרה",
  ]);

  const employerSummaryRows = pickClientSection28Rows(costRows, [
    "סכום קיטום מעל לסעיף 28 ברוטו",
    "סכום נטו לאחר ניכוי מס שולי",
  ]);

  const employeeRows = pickClientSection28Rows(costRows, [
    "גידול בנטו בעקבות קיטום בפיצויים",
    "גידול בנטו בעקבות קיטום תגמולים",
    "גידול בנטו בעקבות קיטום קה\"ל מעל לתקרה",
    "הפרשות עובד קה\"ל מעל תקרה",
    "הפרשות עובד תגמולים",
  ]);

  const employeeSummaryRows = pickClientSection28Rows(costRows, [
    'סה"כ גידול נטו',
    "סה״כ גידול נטו",
    "סך הכל גידול נטו",
  ]);

  return (
    <div>
      <div style={section28SplitGrid}>
        <ClientSection28SideBox
          title="חלק מעסיק"
          rows={employerRows}
          summaryRows={employerSummaryRows}
        />

        <ClientSection28SideBox
          title="חלק עובד"
          rows={employeeRows}
          summaryRows={employeeSummaryRows}
        />
      </div>

      {monthlyRow ? (
        <div style={section28MonthlyBox}>
          <div style={section28MonthlyLabel}>{monthlyRow.label}</div>
          <div style={section28MonthlyValue}>{formatFamilyReportValue(monthlyRow.value)}</div>
        </div>
      ) : null}

      <div style={section28SmallCardsGrid}>
        {savingGroup ? <ClientSection28SimpleGroup title="סימולציה לחיסכון" group={savingGroup} /> : null}
        {retirementGroup ? <ClientSection28SimpleGroup title="סימולציה לגיל פרישה" group={retirementGroup} /> : null}
      </div>

      {comparisonRows.length ? (
        <ClientSection28ComparisonTable rows={comparisonRows} />
      ) : null}
    </div>
  );
}

function ClientSection28SideBox({ title, rows, summaryRows }) {
  const allRows = [...(Array.isArray(rows) ? rows : []), ...(Array.isArray(summaryRows) ? summaryRows : [])];

  return (
    <div style={section28SideBox}>
      <div style={section28SideTitle}>{title}</div>

      {allRows.length ? (
        allRows.map((row, index) => (
          <div
            key={`${row.label}-${index}`}
            style={index >= (rows?.length || 0) ? section28RowHighlight : section28Row}
          >
            <span style={section28RowLabel}>{row.label}</span>
            <strong style={section28RowValue}>{formatFamilyReportValue(row.value)}</strong>
          </div>
        ))
      ) : (
        <EmptyText>אין נתונים להצגה</EmptyText>
      )}
    </div>
  );
}

function ClientSection28SimpleGroup({ title, group }) {
  const rows = Array.isArray(group?.rows)
    ? group.rows.filter((row) => isSection28DisplayValue(row?.value)).slice(0, 6)
    : [];

  if (!rows.length) return null;

  return (
    <div style={section28MiniCard}>
      <div style={section28SideTitle}>{title}</div>
      {rows.map((row, index) => (
        <div
          key={`${row.label}-${index}`}
          style={normalizeSection28Text(row.label).includes("צבירת סכום נטו") ? section28RowHighlight : section28Row}
        >
          <span style={section28RowLabel}>{row.label}</span>
          <strong style={section28RowValue}>{formatFamilyReportValue(row.value)}</strong>
        </div>
      ))}
    </div>
  );
}

function ClientSection28ComparisonTable({ rows }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={clientVestedTitle}>השוואה בין תרחישים</div>
      <div style={clientVestedTableWrap}>
        <table style={{ ...clientVestedTable, minWidth: 760 }}>
          <thead>
            <tr>
              <th style={clientVestedTh}>סעיף</th>
              <th style={clientVestedTh}>לפני קיטום</th>
              <th style={clientVestedTh}>אחרי קיטום</th>
              <th style={clientVestedTh}>פער בין תרחישים</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.label}-${index}`}>
                <td style={clientVestedTd}>{row.label || "—"}</td>
                <td style={clientVestedTd}>{formatFamilyReportValue(row.before)}</td>
                <td style={clientVestedTd}>{formatFamilyReportValue(row.after)}</td>
                <td style={clientVestedTotalTd}>{formatFamilyReportValue(row.gap)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function splitOperationalActionItems(text) {
  const clean = String(text || "").trim();
  if (!clean) return [];

  const lines = clean
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length > 1) {
    return lines
      .map((line) =>
        line
          .replace(/^\d+[\).\-\s]+/, "")
          .replace(/^[א-ת][\).\-\s]+/, "")
          .replace(/^[-•*]\s*/, "")
          .trim()
      )
      .filter(Boolean);
  }

  return clean
    .split(/(?:\s*;\s*)|(?:\s*\|\s*)/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getHebrewListLetter(index) {
  const letters = ["א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט", "י", "יא", "יב", "יג", "יד", "טו", "טז", "יז", "יח", "יט", "כ"];
  return letters[index] || String(index + 1);
}

function escapeOperationalHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildOperationalActionsPdfHtml(text) {
  const items = splitOperationalActionItems(text);
  const rows = items.length
    ? items.map((item, index) => `<li><span>${getHebrewListLetter(index)}.</span><p>${escapeOperationalHtml(item)}</p></li>`).join("")
    : `<li><span>א.</span><p>לא הוזנו המלצות פעולה בדוח.</p></li>`;

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>פעולות אופרטיביות לביצוע</title>
  <style>
    @page { size: A4; margin: 18mm; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #fff; color: #102A43; font-family: Calibri, Arial, sans-serif; direction: rtl; }
    .page { min-height: 257mm; border: 1px solid #E2D1BF; border-radius: 18px; padding: 26px 30px; background: linear-gradient(180deg, #FFFFFF 0%, #FCFBF8 100%); }
    .header { display: flex; align-items: center; justify-content: space-between; gap: 18px; border-bottom: 2px solid #EEE4D8; padding-bottom: 18px; margin-bottom: 24px; }
    .brand { display: flex; align-items: center; gap: 12px; direction: ltr; }
    .logo { width: 54px; height: 54px; border-radius: 50%; background: #00215D; position: relative; }
    .logo:before, .logo:after { content: ""; position: absolute; width: 24px; height: 8px; border-radius: 999px; left: 15px; transform: rotate(-35deg); }
    .logo:before { top: 15px; background: #FF2756; }
    .logo:after { top: 26px; background: #FFFFFF; }
    .brand-text strong { display: block; color: #00215D; font-size: 22px; line-height: 1.1; }
    .brand-text span { display: block; color: #627D98; font-size: 12px; margin-top: 4px; }
    h1 { margin: 0; color: #00215D; font-size: 30px; line-height: 1.2; font-weight: 900; }
    .subtitle { margin: 8px 0 0; color: #627D98; font-size: 14px; }
    .actions { margin: 0; padding: 0; list-style: none; }
    .actions li { display: grid; grid-template-columns: 42px minmax(0, 1fr); gap: 12px; align-items: start; border: 1px solid #EEE4D8; border-radius: 14px; padding: 14px 16px; margin-bottom: 12px; background: #FFFFFF; break-inside: avoid; }
    .actions span { width: 34px; height: 34px; border-radius: 12px; background: #00215D; color: #FFFFFF; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 15px; }
    .actions p { margin: 4px 0 0; font-size: 15px; line-height: 1.75; color: #102A43; white-space: pre-wrap; }
    .footer { margin-top: 28px; padding-top: 14px; border-top: 1px solid #EEE4D8; color: #627D98; font-size: 11px; text-align: center; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .page { border-radius: 0; min-height: auto; } }
  </style>
</head>
<body>
  <main class="page">
    <header class="header">
      <div>
        <h1>פעולות אופרטיביות לביצוע</h1>
        <p class="subtitle">ריכוז משימות והמלצות פעולה מתוך הדוח הפנסיוני המשפחתי המאוחד</p>
      </div>
      <div class="brand">
        <div class="logo" aria-hidden="true"></div>
        <div class="brand-text"><strong>צבירן</strong><span>Total Rewards Experts</span></div>
      </div>
    </header>
    <ol class="actions">${rows}</ol>
    <div class="footer">מסמך זה הופק מתוך מערכת הדוח הפנסיוני המשפחתי המאוחד</div>
  </main>
  <script>window.onload = function () { setTimeout(function () { window.print(); }, 250); };</script>
</body>
</html>`;
}

function downloadOperationalActionsPdf(text) {
  const printWindow = window.open("", "_blank", "width=900,height=1100");

  if (!printWindow) {
    alert("הדפדפן חסם פתיחת חלון חדש. יש לאפשר Popups כדי להפיק PDF.");
    return;
  }

  printWindow.document.open();
  printWindow.document.write(buildOperationalActionsPdfHtml(text));
  printWindow.document.close();
}

function handleMockSendEmail() {
  alert("כפתור דמה: בשלב הבא ניתן לחבר שליחת מייל דרך Backend / CRM / שירות מייל.");
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


function normalizeForCompare(value) {
  return String(value || "")
    .replace(/[״"]/g, "")
    .replace(/[׳']/g, "")
    .replace(/בע"מ/g, "")
    .replace(/בעמ/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function collectCandidateRows(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(collectCandidateRows);
  if (typeof value !== "object") return [];

  const directRows = [
    value.details,
    value.rows,
    value.items,
    value.assets,
    value.products,
    value.policies,
    value.funds,
    value.children,
    value.breakdown,
    value.allocations,
    value.investPlans,
    value.investments,
  ]
    .filter(Array.isArray)
    .flat();

  const nestedRows = Object.values(value)
    .filter((item) => item && typeof item === "object")
    .flatMap((item) => (Array.isArray(item) ? item : collectCandidateRows(item)));

  return [...directRows, ...nestedRows].filter((row) => row && typeof row === "object");
}

function rowMatchesSegment(row, segment, type) {
  const wanted = normalizeForCompare(segment?.name);
  if (!wanted) return false;

  const keysByType = {
    product: ["productType", "productName", "type", "product", "category", "name", "label"],
    manager: ["managerName", "companyName", "insuranceCompany", "provider", "manufacturer", "managingCompany", "name", "label"],
    mainGroup: ["mainGroup", "assetClass", "assetCategory", "category", "group", "afik", "name", "label"],
  };

  const keys = keysByType[type] || ["name", "label", "category", "type", "productType", "managerName", "companyName", "mainGroup", "assetClass"];
  return keys.some((key) => normalizeForCompare(row?.[key]).includes(wanted));
}

function pickRowName(row) {
  return (
    row?.name ||
    row?.label ||
    row?.productName ||
    row?.productType ||
    row?.policyName ||
    row?.fundName ||
    row?.trackName ||
    row?.planName ||
    row?.managerName ||
    row?.companyName ||
    row?.mainGroup ||
    row?.assetClass ||
    "פריט"
  );
}

function pickRowValue(row) {
  const candidates = [
    row?.value,
    row?.amount,
    row?.balance,
    row?.assets,
    row?.totalAssets,
    row?.accumulation,
    row?.currentBalance,
    row?.saving,
  ];

  return candidates
    .map((value) => Number(value || 0))
    .find((value) => Number.isFinite(value) && value > 0) || 0;
}

function buildPieSegmentDetails(payload, context) {
  const segment = payload?.segment || {};
  const type = payload?.type || "segment";

  const directRows = [
    segment.details,
    segment.rows,
    segment.items,
    segment.assets,
    segment.products,
    segment.policies,
    segment.children,
    segment.breakdown,
  ]
    .filter(Array.isArray)
    .flat();

  const sourceRows = collectCandidateRows(context?.sourceReportData);
  const modelRows = collectCandidateRows(context?.model);

  const matchedRows = [...directRows, ...sourceRows, ...modelRows]
    .filter((row) => rowMatchesSegment(row, segment, type))
    .map((row, index) => ({
      id: row.id || `${type}-${segment.name}-${index}`,
      name: pickRowName(row),
      value: pickRowValue(row),
      member: row.memberName || row.ownerName || row.clientName || row.familyMember || row.nameMember || "",
      manager: row.managerName || row.companyName || row.insuranceCompany || row.provider || row.manufacturer || "",
      product: row.productType || row.productName || row.product || row.type || "",
      track: row.trackName || row.planName || row.investmentTrack || row.routeName || "",
    }))
    .filter((row, index, arr) => {
      const key = `${row.name}|${row.value}|${row.member}|${row.manager}|${row.product}|${row.track}`;
      return arr.findIndex((item) => `${item.name}|${item.value}|${item.member}|${item.manager}|${item.product}|${item.track}` === key) === index;
    })
    .sort((a, b) => Number(b.value || 0) - Number(a.value || 0));

  if (matchedRows.length) return matchedRows;

  return [
    {
      id: "summary",
      name: segment.name || "החלק הנבחר",
      value: Number(segment.value || 0),
      member: "",
      manager: "",
      product: "",
      track: "",
    },
  ];
}

function PieSegmentDrawer({ segment, onClose, formatCurrency }) {
  if (!segment) return null;

  const selected = segment.segment || {};
  const details = Array.isArray(segment.details) ? segment.details : [];
  const totalValue = Number(selected.value || 0);
  const typeLabel =
    segment.type === "product"
      ? "מוצר"
      : segment.type === "manager"
      ? "גוף מנהל"
      : segment.type === "mainGroup"
      ? "אפיק השקעה"
      : "נתון";

  return (
    <div style={drawerOverlay} onClick={onClose}>
      <aside style={drawerPanel} onClick={(event) => event.stopPropagation()}>
        <div style={drawerHeader}>
          <button type="button" onClick={onClose} style={drawerCloseButton}>
            ×
          </button>

          <div>
            <div style={drawerEyebrow}>{typeLabel}</div>
            <div style={drawerTitle}>{selected.name || "פירוט"}</div>
            <div style={drawerSub}>
              {Math.round(Number(selected.percent || 0))}% מתוך הדוח · {formatCurrency(totalValue)}
            </div>
          </div>
        </div>

        <div style={drawerStatsGrid}>
          <div style={drawerStat}>
            <div style={drawerStatLabel}>שווי כולל</div>
            <div style={drawerStatValue}>{formatCurrency(totalValue)}</div>
          </div>

          <div style={drawerStat}>
            <div style={drawerStatLabel}>משקל</div>
            <div style={drawerStatValue}>{Math.round(Number(selected.percent || 0))}%</div>
          </div>

          <div style={drawerStat}>
            <div style={drawerStatLabel}>רשומות</div>
            <div style={drawerStatValue}>{details.length}</div>
          </div>
        </div>

        <div style={drawerSectionTitle}>פירוט הנתונים שנכללו בחלק זה</div>

        <div style={drawerTableWrap}>
          <table style={drawerTable}>
            <thead>
              <tr>
                <th style={drawerTh}>שם</th>
                <th style={drawerTh}>שווי</th>
                <th style={drawerTh}>בן משפחה</th>
                <th style={drawerTh}>מוצר / מסלול</th>
              </tr>
            </thead>
            <tbody>
              {details.map((row) => (
                <tr key={row.id}>
                  <td style={drawerTd}>{row.name || "—"}</td>
                  <td style={drawerTd}>{formatCurrency(row.value)}</td>
                  <td style={drawerTd}>{row.member || "—"}</td>
                  <td style={drawerTd}>
                    {[row.product, row.track, row.manager].filter(Boolean).join(" · ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={drawerNote}>
          הנתונים מוצגים לפי המידע שעבר ל־Family Dashboard. אם נדרש פירוט עמוק יותר לפי נכס בודד, צריך לוודא שה־parser שומר breakdown ברמת נכס/פוליסה.
        </div>
      </aside>
    </div>
  );
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

function DonutSummaryCard({
  title,
  subtitle,
  items,
  formatCurrency,
  wide = false,
  drawerType = "segment",
  onSegmentClick,
}) {
  const data = buildSegments(items);

  return (
    <section className="family-donut-card" style={donutCard}>
      <h3 style={donutTitle}>{title}</h3>
      <div style={{ ...smallText, marginTop: 6 }}>{subtitle}</div>

      {!data.segments.length ? (
        <EmptyText>אין נתונים להצגה</EmptyText>
      ) : (
        <div style={wide ? wideDonutLayout : donutLayout}>
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
            <DonutVisual
              gradient={data.gradient}
              segments={data.segments}
              size={wide ? 182 : 122}
              holeInset="31%"
              soft
              title={title}
              drawerType={drawerType}
              onSegmentClick={onSegmentClick}
            />
          </div>

          <div style={wide ? wideLegendList : legendList}>
            {data.segments.slice(0, wide ? 8 : 5).map((seg, index) => (
              <LegendRow
                key={`${seg.id || seg.name}-${index}`}
                seg={seg}
                formatCurrency={formatCurrency}
                wide={wide}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function FullWidthDonutCard({
  items,
  formatCurrency,
  emptyText,
  drawerType = "mainGroup",
  onSegmentClick,
}) {
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
        <div style={{ position: "relative", width: 285, height: 285 }}>
          <DonutVisual
            gradient={data.gradient}
            segments={data.segments}
            size={285}
            holeInset="30%"
            soft={false}
            title="חלוקה לפי אפיקים ראשיים"
            drawerType={drawerType}
            onSegmentClick={onSegmentClick}
            className="family-main-donut"
          />

          <div
            style={{
              position: "absolute",
              inset: "30%",
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

function DonutVisual({
  gradient,
  segments = [],
  size = 110,
  holeInset = "31%",
  soft = true,
  title = "",
  drawerType = "segment",
  onSegmentClick,
  className,
}) {
  const strokeWidth = Math.max(18, Math.round(size * 0.22));
  const radius = (size - strokeWidth - 12) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const gap = Math.min(0.9, 100 / Math.max(segments.length * 24, 1));

  if (!segments.length) {
    return (
      <div
        className={className}
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

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={title}
      style={{
        display: "block",
        overflow: "visible",
        filter: "drop-shadow(0 10px 18px rgba(0,33,93,0.12))",
        transform: soft
          ? "perspective(700px) rotateX(4deg)"
          : "perspective(850px) rotateX(4deg)",
      }}
    >
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="#EEF2FA"
        strokeWidth={strokeWidth}
      />

      {segments.map((seg, index) => {
        const dash = Math.max((seg.percent - gap) / 100, 0) * circumference;
        const empty = circumference - dash;
        const offset = circumference * (1 - seg.start / 100);
        const clickable = typeof onSegmentClick === "function";

        return (
          <circle
            key={`${seg.name}-${index}`}
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={seg.color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${dash} ${empty}`}
            strokeDashoffset={offset}
            strokeLinecap="butt"
            transform={`rotate(-90 ${center} ${center})`}
            tabIndex={clickable ? 0 : -1}
            onClick={() =>
              clickable
                ? onSegmentClick({
                    title,
                    type: drawerType,
                    segment: seg,
                  })
                : null
            }
            onKeyDown={(event) => {
              if (!clickable) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSegmentClick({
                  title,
                  type: drawerType,
                  segment: seg,
                });
              }
            }}
            style={{
              cursor: clickable ? "pointer" : "default",
              transition: "stroke-width 180ms ease, opacity 180ms ease, filter 180ms ease",
              outline: "none",
            }}
            onMouseEnter={(event) => {
              event.currentTarget.setAttribute("stroke-width", String(strokeWidth + 7));
              event.currentTarget.style.filter = "drop-shadow(0 5px 8px rgba(0,33,93,0.25))";
            }}
            onMouseLeave={(event) => {
              event.currentTarget.setAttribute("stroke-width", String(strokeWidth));
              event.currentTarget.style.filter = "none";
            }}
          >
            <title>{`${seg.name}: ${Math.round(seg.percent)}%`}</title>
          </circle>
        );
      })}

      <circle
        cx={center}
        cy={center}
        r={Math.max(radius - strokeWidth / 2, 12)}
        fill="#fff"
        style={{ pointerEvents: "none" }}
      />
    </svg>
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

function LegendRow({ seg, formatCurrency, wide = false }) {
  return (
    <div style={wide ? wideLegendRow : legendRow}>
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
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 18,
  marginBottom: 18,
};

const wideDonutGrid = {
  display: "grid",
  gridTemplateColumns: "1fr",
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
  padding: 22,
  minHeight: 250,
  boxShadow: "0 2px 10px rgba(16,42,67,0.05)",
};

const donutTitle = { margin: 0, color: theme.navy, fontSize: 14, fontWeight: 700 };
const smallText = { fontSize: 12, color: theme.textSoft, lineHeight: 1.6 };
const donutLayout = {
  display: "grid",
  gridTemplateColumns: "140px minmax(0, 1fr)",
  gap: 20,
  alignItems: "center",
  marginTop: 12,
};

const wideDonutLayout = {
  display: "grid",
  gridTemplateColumns: "220px minmax(0, 1fr)",
  gap: 28,
  alignItems: "center",
  marginTop: 18,
  direction: "rtl",
};

const legendList = { display: "flex", flexDirection: "column", gap: 8 };
const wideLegendList = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  columnGap: 22,
  rowGap: 10,
  alignItems: "start",
};
const legendRow = { display: "grid", gridTemplateColumns: "10px 1fr auto", gap: 8, alignItems: "center", fontSize: 12 };
const wideLegendRow = {
  display: "grid",
  gridTemplateColumns: "12px minmax(0, 1fr) 54px",
  gap: 10,
  alignItems: "center",
  fontSize: 13,
  minWidth: 0,
};
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



const drawerOverlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(0, 24, 69, 0.24)",
  zIndex: 9999,
  display: "flex",
  justifyContent: "flex-start",
  direction: "rtl",
};

const drawerPanel = {
  width: "min(520px, 92vw)",
  height: "100vh",
  background: "#fff",
  boxShadow: "24px 0 54px rgba(0, 33, 93, 0.22)",
  borderLeft: `1px solid ${theme.border}`,
  padding: 22,
  overflowY: "auto",
  animation: "familyDrawerIn 180ms ease-out",
};

const drawerHeader = {
  display: "flex",
  alignItems: "flex-start",
  gap: 14,
  justifyContent: "space-between",
  background: `linear-gradient(135deg, ${theme.navy}, ${theme.navyDark})`,
  color: "#fff",
  borderRadius: 20,
  padding: 18,
  marginBottom: 18,
};

const drawerCloseButton = {
  width: 34,
  height: 34,
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.25)",
  background: "rgba(255,255,255,0.12)",
  color: "#fff",
  fontSize: 26,
  lineHeight: 1,
  cursor: "pointer",
};

const drawerEyebrow = {
  fontSize: 12,
  color: "rgba(255,255,255,0.72)",
  fontWeight: 800,
  marginBottom: 4,
};

const drawerTitle = {
  fontSize: 22,
  fontWeight: 900,
  lineHeight: 1.25,
};

const drawerSub = {
  marginTop: 8,
  color: "rgba(255,255,255,0.82)",
  fontSize: 13,
};

const drawerStatsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 10,
  marginBottom: 18,
};

const drawerStat = {
  background: theme.surfaceAlt,
  border: `1px solid ${theme.divider}`,
  borderRadius: 16,
  padding: 13,
};

const drawerStatLabel = {
  color: theme.textSoft,
  fontSize: 11,
  fontWeight: 800,
  marginBottom: 6,
};

const drawerStatValue = {
  color: theme.navy,
  fontSize: 15,
  fontWeight: 900,
  direction: "ltr",
};

const drawerSectionTitle = {
  color: theme.navy,
  fontSize: 15,
  fontWeight: 900,
  margin: "4px 0 12px",
};

const drawerTableWrap = {
  overflowX: "auto",
  border: `1px solid ${theme.divider}`,
  borderRadius: 16,
  background: "#fff",
};

const drawerTable = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 620,
};

const drawerTh = {
  background: theme.navy,
  color: "#fff",
  fontSize: 12,
  fontWeight: 900,
  padding: "11px 10px",
  textAlign: "right",
  whiteSpace: "nowrap",
};

const drawerTd = {
  color: theme.text,
  fontSize: 12,
  padding: "11px 10px",
  borderBottom: "1px solid #F0E6DA",
  whiteSpace: "nowrap",
};

const drawerNote = {
  marginTop: 14,
  background: "#EEF2FA",
  border: "1px solid #D8DEE9",
  borderRadius: 14,
  padding: 13,
  color: theme.textSoft,
  fontSize: 12,
  lineHeight: 1.7,
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


const section28SplitGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 14,
  alignItems: "start",
};

const section28SideBox = {
  background: "#FFFFFF",
  border: `1px solid ${theme.divider}`,
  borderRadius: 16,
  padding: 14,
};

const section28SideTitle = {
  color: theme.navy,
  fontSize: 14,
  fontWeight: 900,
  marginBottom: 10,
  paddingBottom: 8,
  borderBottom: `1px solid ${theme.divider}`,
};

const section28Row = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(110px, .42fr)",
  gap: 10,
  alignItems: "center",
  padding: "9px 0",
  borderBottom: "1px solid #F0E6DA",
};

const section28RowHighlight = {
  ...section28Row,
  border: `1px solid ${theme.border}`,
  borderRadius: 14,
  padding: "10px 12px",
  marginTop: 8,
  background: "linear-gradient(135deg, #FFF7E8 0%, #EEF2FA 100%)",
};

const section28RowLabel = {
  color: theme.textSoft,
  fontSize: 12,
  fontWeight: 800,
  lineHeight: 1.45,
};

const section28RowValue = {
  color: theme.navy,
  fontSize: 13,
  fontWeight: 900,
  direction: "ltr",
  textAlign: "left",
  whiteSpace: "nowrap",
};

const section28MonthlyBox = {
  marginTop: 14,
  border: "1px solid #D8DEE9",
  borderRadius: 16,
  background: `linear-gradient(135deg, ${theme.navy} 0%, ${theme.navyDark} 100%)`,
  color: "#fff",
  padding: "12px 16px",
  textAlign: "center",
};

const section28MonthlyLabel = {
  fontSize: 12,
  fontWeight: 800,
  color: "rgba(255,255,255,0.82)",
  marginBottom: 5,
};

const section28MonthlyValue = {
  fontSize: 17,
  fontWeight: 900,
  direction: "ltr",
};

const section28SmallCardsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 14,
  marginTop: 14,
};

const section28MiniCard = {
  background: "#FFFFFF",
  border: `1px solid ${theme.divider}`,
  borderRadius: 16,
  padding: 14,
};


const clientCapitalWrap = {
  display: "flex",
  flexDirection: "column",
  gap: 18,
};

const clientCapitalKpiGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
  gap: 10,
};

const clientCapitalKpi = {
  background: "#FFFFFF",
  border: "1px solid #D8DEE9",
  borderRadius: 14,
  padding: "12px 14px",
  minHeight: 74,
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
};

const clientCapitalKpiCapital = {
  background: "#FFFDF7",
  borderColor: "#F3E7C3",
};

const clientCapitalKpiPension = {
  background: "#F8FBFF",
  borderColor: "#DCEAFE",
};

const clientCapitalKpiLabel = {
  color: theme.textSoft,
  fontSize: 11,
  fontWeight: 900,
  marginBottom: 6,
};

const clientCapitalKpiValue = {
  color: theme.navy,
  fontSize: 17,
  fontWeight: 900,
  direction: "ltr",
};

const clientCapitalLegendBox = {
  border: `1px solid ${theme.divider}`,
  borderRadius: 16,
  background: "#FFFFFF",
  padding: "13px 16px",
};

const clientCapitalLegendTitle = {
  color: theme.navy,
  fontSize: 13,
  fontWeight: 900,
  marginBottom: 10,
};

const clientCapitalLegendItems = {
  display: "flex",
  gap: 24,
  flexWrap: "wrap",
};

const clientCapitalLegendItem = {
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const clientCapitalLegendSwatch = {
  width: 18,
  height: 18,
  borderRadius: 6,
  border: "1px solid transparent",
  flexShrink: 0,
};

const clientCapitalLegendLabel = {
  color: theme.navy,
  fontSize: 12,
  fontWeight: 900,
};

const clientCapitalLegendText = {
  color: theme.textSoft,
  fontSize: 11,
  marginTop: 2,
};

const clientCapitalOwnerBlock = {
  borderTop: `1px solid ${theme.divider}`,
  paddingTop: 16,
};

const clientCapitalOwnerHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  marginBottom: 12,
};

const clientCapitalOwnerTitle = {
  color: theme.navy,
  fontSize: 16,
  fontWeight: 900,
};

const clientCapitalOwnerSub = {
  color: theme.textSoft,
  fontSize: 11,
  marginTop: 4,
};

const clientCapitalTableSection = {
  marginTop: 14,
};

const clientCapitalTableTitle = {
  color: theme.navy,
  fontSize: 14,
  fontWeight: 900,
  marginBottom: 9,
};

const clientCapitalTableWrap = {
  overflowX: "auto",
  border: `1px solid ${theme.divider}`,
  borderRadius: 16,
  background: "#fff",
};

const clientCapitalTableWrapNarrow = {
  overflowX: "auto",
  border: `1px solid ${theme.divider}`,
  borderRadius: 16,
  background: "#fff",
  maxWidth: 680,
};

const clientCapitalTable = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 760,
  background: "#fff",
};

const clientCapitalTh = {
  textAlign: "center",
  fontSize: 11,
  color: theme.navy,
  background: "#F4F7FB",
  borderBottom: `1px solid ${theme.divider}`,
  borderLeft: `1px solid ${theme.divider}`,
  padding: "10px 8px",
  fontWeight: 900,
  whiteSpace: "normal",
  lineHeight: 1.35,
};

const clientCapitalTd = {
  textAlign: "center",
  fontSize: 11,
  color: theme.text,
  borderBottom: "1px solid #F0E6DA",
  borderLeft: "1px solid #F0E6DA",
  padding: "10px 8px",
  whiteSpace: "normal",
  lineHeight: 1.45,
};

const clientCapitalTdStrong = {
  ...clientCapitalTd,
  color: theme.navy,
  fontWeight: 900,
};

const clientCapitalTotalLabel = {
  ...clientCapitalTd,
  color: theme.navy,
  background: "#EEF2FA",
  fontWeight: 900,
  textAlign: "right",
};

const clientCapitalTotalTd = {
  ...clientCapitalTd,
  color: theme.navy,
  background: "#EEF2FA",
  fontWeight: 900,
};

const clientCapitalTotalCapital = {
  background: "#FFFDF7",
  borderColor: "#F3E7C3",
};

const clientCapitalTotalPension = {
  background: "#F8FBFF",
  borderColor: "#DCEAFE",
};

const clientCapitalNoteBox = {
  background: "#FFFFFF",
  border: `1px solid ${theme.divider}`,
  borderRadius: 14,
  padding: "12px 14px",
  color: theme.textSoft,
  fontSize: 12,
  lineHeight: 1.7,
};

const recommendationsActionsRow = {
  marginTop: 12,
  paddingTop: 12,
  borderTop: `1px solid ${theme.divider}`,
  display: "flex",
  justifyContent: "flex-start",
  gap: 8,
  alignItems: "center",
};

const recommendationsPrimaryButton = {
  minHeight: 34,
  borderRadius: 11,
  padding: "0 13px",
  fontFamily: 'Calibri, "Arial", sans-serif',
  fontSize: 12,
  fontWeight: 900,
  cursor: "pointer",
  border: `1px solid ${theme.navy}`,
  background: theme.navy,
  color: "#fff",
};

const recommendationsSecondaryButton = {
  minHeight: 34,
  borderRadius: 11,
  padding: "0 13px",
  fontFamily: 'Calibri, "Arial", sans-serif',
  fontSize: 12,
  fontWeight: 900,
  cursor: "pointer",
  border: "1px solid #D8DEE9",
  background: "#FFFFFF",
  color: theme.navy,
};



export default ClientFamilyView;
