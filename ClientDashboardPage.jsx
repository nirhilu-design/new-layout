import React, { useMemo, useState } from "react";

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function formatCurrency(value) {
  return `₪${Math.round(Number(value || 0)).toLocaleString("en-US")}`;
}

function formatPercent(value) {
  return `${Math.round(Number(value || 0))}%`;
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
  if (!Number.isNaN(date.getTime())) {
    return new Intl.DateTimeFormat("he-IL").format(date);
  }

  return str;
}

function normalizeDistributionItems(items) {
  return safeArray(items)
    .map((item, index) => ({
      id: item?.id || item?.name || item?.label || `distribution-${index}`,
      name: item?.name || item?.label || item?.title || "ללא שם",
      value: Number(item?.value || item?.amount || item?.assets || 0),
      percent: Number(item?.percent || item?.percentage || 0),
    }))
    .filter((item) => item.value > 0 || item.percent > 0);
}

function buildClientModelFromReportData(reportData) {
  const data = reportData || {};
  const family = data.family || {};
  const products = normalizeDistributionItems(data.products);
  const managers = normalizeDistributionItems(data.managers);
  const mainGroupAllocation = normalizeDistributionItems(data.mainGroupAllocation);

  return {
    lastUpdated:
      family.lastUpdated ||
      data.lastUpdated ||
      new Intl.DateTimeFormat("he-IL").format(new Date()),

    summary: {
      totalAssets: Number(family.totalAssets || 0),
      monthlyDeposits: Number(family.monthlyDeposits || 0),
      projectedLumpSumWithDeposits: Number(family.projectedLumpSumWithDeposits || 0),
      projectedLumpSumWithoutDeposits: Number(family.projectedLumpSumWithoutDeposits || 0),
      monthlyPensionWithDeposits: Number(family.monthlyPensionWithDeposits || 0),
      monthlyPensionWithoutDeposits: Number(family.monthlyPensionWithoutDeposits || 0),
    },

    exposures: {
      equity: Number(data.weightedEquityExposure || 0),
      foreign: Number(data.weightedForeignExposure || 0),
    },

    distributions: {
      products,
      managers,
      mainGroups: mainGroupAllocation,
      mainGroupAllocation,
      assetClasses: mainGroupAllocation,
      foreignExposureAllocation: normalizeDistributionItems(data.foreignExposureAllocation),
    },

    members: safeArray(data.members).map((member, index) => ({
      id: member?.id || member?.name || `member-${index}`,
      name: member?.name || "ללא שם",
      summary: {
        totalAssets: Number(member?.assets || member?.totalAssets || 0),
        monthlyDeposits: Number(member?.monthlyDeposits || 0),
        monthlyPensionWithDeposits: Number(member?.monthlyPensionWithDeposits || 0),
        monthlyPensionWithoutDeposits: Number(member?.monthlyPensionWithoutDeposits || 0),
        projectedLumpSumWithDeposits: Number(
          member?.lumpSumWithDeposits || member?.projectedLumpSumWithDeposits || 0
        ),
        projectedLumpSumWithoutDeposits: Number(
          member?.lumpSumWithoutDeposits || member?.projectedLumpSumWithoutDeposits || 0
        ),
      },
      insurance: {
        deathCoverage: Number(member?.deathCoverage || 0),
        disabilityValue: Number(member?.disabilityValue || 0),
        disabilityPercent: Number(member?.disabilityPercent || 0),
      },
    })),

    loans: {
      hasData: Boolean(data.loans?.hasData),
      details: safeArray(data.loans?.details),
    },

    sourceReportData: data,
  };
}

function getPlanWeightedExposure(policy, key) {
  const plans = safeArray(policy?.investPlans);
  if (!plans.length) return 0;

  const total = plans.reduce((sum, plan) => {
    const value = Number(
      key === "equity" ? plan?.equityExposure || 0 : plan?.foreignExposure || 0
    );
    return sum + value;
  }, 0);

  return total / plans.length;
}

function buildMemberProductsFromRawFile(rawFile) {
  const policies = safeArray(rawFile?.parsedData?.policies);

  return policies.map((policy, index) => {
    const currentValue = Number(policy?.savings?.totalAccumulated || 0);

    return {
      id: policy?.policyNo || `${rawFile?.memberName || "member"}-${policy?.rowNum || index}`,
      planName:
        policy?.planName ||
        policy?.details?.proposeName ||
        policy?.productType ||
        "מוצר ללא שם",
      managerName: policy?.managerName || "לא ידוע",
      productType: policy?.productType || "ללא סוג",
      policyNo: policy?.policyNo || "",
      currentValue,
      monthlyDeposit: Number(policy?.monthlyDeposits?.sumCost || 0),
      projectedMonthlyPension: Number(
        policy?.savings?.projectedMonthlyPension || policy?.savings?.pensionRetire || 0
      ),
      managementFeeFromBalance: Number(policy?.details?.managementFeeFromBalance || 0),
      equityExposure: getPlanWeightedExposure(policy, "equity"),
      foreignExposure: getPlanWeightedExposure(policy, "foreign"),
    };
  });
}

function groupItemsByValue(items, getName, getValue) {
  const map = new Map();

  safeArray(items).forEach((item) => {
    const name = getName(item) || "אחר";
    const value = Number(getValue(item) || 0);
    if (value <= 0) return;
    map.set(name, (map.get(name) || 0) + value);
  });

  return Array.from(map.entries())
    .map(([name, value]) => ({ id: name, name, value }))
    .sort((a, b) => b.value - a.value);
}

function buildDetailedMembers(reportData, clientModel) {
  const summaryMembers = safeArray(clientModel?.members);
  const rawFiles = safeArray(reportData?.rawParsedFiles);

  return summaryMembers.map((summaryMember, index) => {
    const rawFile =
      rawFiles.find((file) => file?.memberName === summaryMember?.name) ||
      rawFiles[index] ||
      null;

    const products = buildMemberProductsFromRawFile(rawFile);
    const totalProductsValue = products.reduce(
      (sum, product) => sum + Number(product.currentValue || 0),
      0
    );

    const weightedEquity =
      totalProductsValue > 0
        ? products.reduce(
            (sum, product) =>
              sum + Number(product.currentValue || 0) * Number(product.equityExposure || 0),
            0
          ) / totalProductsValue
        : 0;

    const weightedForeign =
      totalProductsValue > 0
        ? products.reduce(
            (sum, product) =>
              sum + Number(product.currentValue || 0) * Number(product.foreignExposure || 0),
            0
          ) / totalProductsValue
        : 0;

    return {
      ...summaryMember,
      id: summaryMember?.id || summaryMember?.name || `member-${index}`,
      name: summaryMember?.name || rawFile?.memberName || "ללא שם",
      products,
      managers: groupItemsByValue(
        products,
        (product) => product.managerName,
        (product) => product.currentValue
      ),
      productTypes: groupItemsByValue(
        products,
        (product) => product.productType,
        (product) => product.currentValue
      ),
      exposures: {
        equity: Math.round(weightedEquity),
        foreign: Math.round(weightedForeign),
      },
    };
  });
}

function getSelectedScope(clientModel, detailedMembers, selectedScopeId) {
  if (selectedScopeId === "family") {
    return {
      id: "family",
      name: "משפחה מאוחדת",
      isFamily: true,
      summary: clientModel.summary,
      exposures: clientModel.exposures,
      insurance: aggregateInsurance(detailedMembers),
      loans: clientModel.loans,
      distributions: clientModel.distributions,
      products: [],
      managers: clientModel.distributions.managers,
      productTypes: clientModel.distributions.products,
    };
  }

  const member =
    detailedMembers.find((item) => String(item.id || item.name) === String(selectedScopeId)) ||
    detailedMembers[0];

  if (!member) {
    return {
      id: "family",
      name: "משפחה מאוחדת",
      isFamily: true,
      summary: clientModel.summary,
      exposures: clientModel.exposures,
      insurance: aggregateInsurance([]),
      loans: clientModel.loans,
      distributions: clientModel.distributions,
      products: [],
      managers: clientModel.distributions.managers,
      productTypes: clientModel.distributions.products,
    };
  }

  return {
    ...member,
    isFamily: false,
    loans: {
      hasData: Boolean(clientModel.loans?.hasData),
      details: safeArray(clientModel.loans?.details).filter((loan) => {
        const loanName = [loan?.firstName, loan?.familyName].filter(Boolean).join(" ").trim();
        return !loanName || loanName === member.name || String(loan?.name || "") === member.name;
      }),
    },
    distributions: {
      products: member.productTypes || [],
      managers: member.managers || [],
      mainGroups: member.productTypes || [],
      mainGroupAllocation: member.productTypes || [],
      foreignExposureAllocation: [],
    },
  };
}

function aggregateInsurance(members) {
  return safeArray(members).reduce(
    (acc, member) => ({
      deathCoverage: acc.deathCoverage + Number(member?.insurance?.deathCoverage || 0),
      disabilityValue: acc.disabilityValue + Number(member?.insurance?.disabilityValue || 0),
      disabilityPercent: Math.max(acc.disabilityPercent, Number(member?.insurance?.disabilityPercent || 0)),
    }),
    { deathCoverage: 0, disabilityValue: 0, disabilityPercent: 0 }
  );
}

function EmptyDashboardState({ onBack }) {
  return (
    <div style={styles.emptyPage}>
      <div style={styles.emptyCard}>
        <h1 style={styles.emptyTitle}>אין נתוני דוח להצגה</h1>
        <p style={styles.emptyText}>
          מסך הלקוח מקבל את הנתונים מתוך הדוח שנוצר במערכת. חזור למסך הדוח או הפק דוח חדש.
        </p>
        <button type="button" onClick={onBack} style={styles.secondaryButton}>
          חזרה
        </button>
      </div>
    </div>
  );
}

const NAV_ITEMS = [
  { id: "overview", label: "סקירה כללית", icon: "⌂" },
  { id: "pension", label: "סיכום פנסיוני", icon: "▥" },
  { id: "comparison", label: "השוואות קצבאות", icon: "⚖" },
  { id: "allocation", label: "התפלגות נכסים", icon: "◔" },
  { id: "insurance", label: "ביטוחים", icon: "🛡" },
  { id: "loans", label: "הלוואות", icon: "🏦" },
  { id: "info", label: "מידע כללי", icon: "i" },
];

export default function ClientDashboardPage({
  reportData,
  onBack = () => {},
  isSharedMode = false,
  viewMode = "family",
  selectedMemberId = null,
  onChangeView = () => {},
}) {
  const [activeSection, setActiveSection] = useState("overview");
  const initialScopeId = viewMode === "member" && selectedMemberId ? selectedMemberId : "family";
  const [localScopeId, setLocalScopeId] = useState(initialScopeId);

  const clientModel = useMemo(() => buildClientModelFromReportData(reportData), [reportData]);
  const detailedMembers = useMemo(
    () => buildDetailedMembers(reportData, clientModel),
    [reportData, clientModel]
  );

  const scope = getSelectedScope(clientModel, detailedMembers, localScopeId);

  if (!reportData || !reportData.family) {
    return <EmptyDashboardState onBack={onBack} />;
  }

  const handleScopeChange = (event) => {
    const nextScopeId = event.target.value;
    setLocalScopeId(nextScopeId);

    if (nextScopeId === "family") {
      onChangeView("family", null);
    } else {
      onChangeView("member", nextScopeId);
    }
  };

  return (
    <div className="client-web-shell">
      <style>{clientDashboardCss}</style>

      <aside className="client-sidebar">
        <div className="client-sidebar-brand">
          <div className="client-brand-icon">👥</div>
          <div>
            <div className="client-brand-title">הפנסיה שלי</div>
            <div className="client-brand-subtitle">דוח פנסיוני משפחתי</div>
          </div>
        </div>

        <nav className="client-sidebar-nav" aria-label="ניווט במסך הלקוח">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveSection(item.id)}
              className={activeSection === item.id ? "client-nav-item active" : "client-nav-item"}
            >
              <span className="client-nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="client-main">
        <header className="client-topbar">
          <div className="client-topbar-title-wrap">
            <h1 className="client-page-title">דוח פנסיוני משפחתי מאוחד</h1>
            <div className="client-page-subtitle">
              {scope.isFamily ? "תצוגה מאוחדת לכל המשפחה" : `תצוגה אישית עבור ${scope.name}`}
            </div>
          </div>

          <div className="client-topbar-actions">
            <div className="client-updated-box">
              <span>עודכן לאחרונה:</span>
              <strong>{clientModel.lastUpdated || "—"}</strong>
            </div>

            <label className="client-scope-select-wrap">
              <span>תצוגה</span>
              <select value={localScopeId} onChange={handleScopeChange} className="client-scope-select">
                <option value="family">משפחה מאוחדת</option>
                {detailedMembers.map((member) => (
                  <option key={member.id || member.name} value={member.id || member.name}>
                    {member.name || "ללא שם"}
                  </option>
                ))}
              </select>
            </label>

            {!isSharedMode ? (
              <button type="button" onClick={onBack} className="client-back-button">
                חזרה ל־REPORT
              </button>
            ) : null}
          </div>
        </header>

        <section className="client-content-card">
          {activeSection === "overview" ? <OverviewSection scope={scope} /> : null}
          {activeSection === "pension" ? <PensionSection scope={scope} /> : null}
          {activeSection === "comparison" ? <ComparisonSection scope={scope} /> : null}
          {activeSection === "allocation" ? <AllocationSection scope={scope} /> : null}
          {activeSection === "insurance" ? <InsuranceSection scope={scope} /> : null}
          {activeSection === "loans" ? <LoansSection scope={scope} /> : null}
          {activeSection === "info" ? <InfoSection scope={scope} clientModel={clientModel} /> : null}
        </section>
      </main>
    </div>
  );
}

function OverviewSection({ scope }) {
  const summary = scope.summary || {};

  return (
    <div>
      <SectionTitle title="סקירה כללית" subtitle="תמונת מצב מהירה לפי התצוגה שנבחרה." />

      <div className="client-kpi-grid">
        <KpiCard icon="🐷" title="הפקדה חודשית כוללת" value={formatCurrency(summary.monthlyDeposits)} />
        <KpiCard icon="📈" title="סך נכסים" value={formatCurrency(summary.totalAssets)} tone="green" />
        <KpiCard icon="💼" title="קצבה חודשית צפויה" value={formatCurrency(summary.monthlyPensionWithDeposits)} tone="purple" />
        <KpiCard icon="🏛" title="צבירה צפויה" value={formatCurrency(summary.projectedLumpSumWithDeposits)} />
      </div>

      <div className="client-grid-3">
        <DonutCard
          title="חשיפה למניות"
          center={formatPercent(scope.exposures?.equity)}
          subtitle="חשיפה כוללת"
          items={[
            { name: "מניות", value: Number(scope.exposures?.equity || 0) },
            { name: "אחר", value: Math.max(0, 100 - Number(scope.exposures?.equity || 0)) },
          ]}
          percentMode
        />
        <DonutCard
          title="התפלגות נכסים לפי קבוצות עיקריות"
          items={scope.distributions?.mainGroups || []}
        />
        <DonutCard
          title='חשיפה לחו"ל'
          center={formatPercent(scope.exposures?.foreign)}
          subtitle="חשיפה כוללת"
          items={[
            { name: 'חו"ל', value: Number(scope.exposures?.foreign || 0) },
            { name: "ישראל", value: Math.max(0, 100 - Number(scope.exposures?.foreign || 0)) },
          ]}
          percentMode
        />
      </div>

      <div className="client-grid-2 client-margin-top">
        <ComparisonCard title="השוואת צבירה צפויה" withValue={summary.projectedLumpSumWithDeposits} withoutValue={summary.projectedLumpSumWithoutDeposits} />
        <ComparisonCard title="השוואת קצבה חודשית צפויה" withValue={summary.monthlyPensionWithDeposits} withoutValue={summary.monthlyPensionWithoutDeposits} />
      </div>
    </div>
  );
}

function PensionSection({ scope }) {
  const summary = scope.summary || {};

  return (
    <div>
      <SectionTitle title="סיכום פנסיוני" subtitle="ריכוז נתוני הצבירה, ההפקדות והתחזית לגיל פרישה." />

      <div className="client-grid-2">
        <InfoPanel
          title="נתוני חיסכון"
          rows={[
            ["סך נכסים", formatCurrency(summary.totalAssets)],
            ["הפקדה חודשית", formatCurrency(summary.monthlyDeposits)],
            ["צבירה צפויה עם הפקדות", formatCurrency(summary.projectedLumpSumWithDeposits)],
            ["צבירה צפויה ללא הפקדות", formatCurrency(summary.projectedLumpSumWithoutDeposits)],
          ]}
        />
        <InfoPanel
          title="תחזית קצבה"
          rows={[
            ["קצבה חודשית עם הפקדות", formatCurrency(summary.monthlyPensionWithDeposits)],
            ["קצבה חודשית ללא הפקדות", formatCurrency(summary.monthlyPensionWithoutDeposits)],
            ["פער חודשי", formatCurrency(Number(summary.monthlyPensionWithDeposits || 0) - Number(summary.monthlyPensionWithoutDeposits || 0))],
          ]}
        />
      </div>
    </div>
  );
}

function ComparisonSection({ scope }) {
  const summary = scope.summary || {};

  return (
    <div>
      <SectionTitle title="השוואות קצבאות" subtitle="השוואה בין המשך הפקדות לבין מצב ללא המשך הפקדות." />

      <div className="client-grid-2">
        <ComparisonCard title="צבירה צפויה בגיל פרישה" withValue={summary.projectedLumpSumWithDeposits} withoutValue={summary.projectedLumpSumWithoutDeposits} />
        <ComparisonCard title="קצבה חודשית בגיל פרישה" withValue={summary.monthlyPensionWithDeposits} withoutValue={summary.monthlyPensionWithoutDeposits} />
      </div>
    </div>
  );
}

function AllocationSection({ scope }) {
  return (
    <div>
      <SectionTitle title="התפלגות נכסים" subtitle="פיזור התיק לפי מוצרים, גופים מנהלים ואפיקים." />

      <div className="client-grid-3">
        <DonutCard title="חלוקה לפי מוצרים" items={scope.distributions?.products || scope.productTypes || []} />
        <DonutCard title="חלוקה לפי גופים מנהלים" items={scope.distributions?.managers || scope.managers || []} />
        <DonutCard title="חלוקה לפי אפיקים ראשיים" items={scope.distributions?.mainGroups || []} />
      </div>
    </div>
  );
}

function InsuranceSection({ scope }) {
  const insurance = scope.insurance || {};

  return (
    <div>
      <SectionTitle title="ביטוחים" subtitle="ריכוז הכיסויים הביטוחיים לפי התצוגה שנבחרה." />

      <div className="client-grid-3">
        <MetricBox title="ביטוח חיים / הון למוטבים" value={formatCurrency(insurance.deathCoverage)} icon="🛡" />
        <MetricBox title="אובדן כושר עבודה" value={formatCurrency(insurance.disabilityValue)} icon="🧍" />
        <MetricBox title="שיעור אובדן כושר עבודה" value={formatPercent(insurance.disabilityPercent)} icon="%" />
      </div>
    </div>
  );
}

function LoansSection({ scope }) {
  const loans = safeArray(scope.loans?.details);
  const totalAmount = loans.reduce((sum, loan) => sum + Number(loan.amount || loan.balance || 0), 0);
  const totalBalance = loans.reduce((sum, loan) => sum + Number(loan.balance || 0), 0);
  const ratio = Number(scope.summary?.totalAssets || 0) > 0 ? (totalAmount / Number(scope.summary.totalAssets || 0)) * 100 : 0;

  return (
    <div>
      <SectionTitle title="הלוואות" subtitle="פירוט הלוואות על חשבון מוצרים פנסיוניים." />

      <div className="client-grid-3">
        <MetricBox title='סה"כ הלוואות' value={formatCurrency(totalAmount)} icon="🏦" />
        <MetricBox title="יתרת הלוואות" value={formatCurrency(totalBalance)} icon="◔" />
        <MetricBox title="שיעור מתוך הנכסים" value={`${ratio.toFixed(1)}%`} icon="%" />
      </div>

      <div className="client-table-wrap client-margin-top">
        {loans.length ? (
          <table className="client-table">
            <thead>
              <tr>
                <th>שם</th>
                <th>סכום הלוואה</th>
                <th>יתרה</th>
                <th>תדירות החזר</th>
                <th>תאריך סיום</th>
              </tr>
            </thead>
            <tbody>
              {loans.map((loan, index) => (
                <tr key={loan.id || index}>
                  <td>{[loan.firstName, loan.familyName].filter(Boolean).join(" ") || loan.name || "—"}</td>
                  <td>{formatCurrency(loan.amount)}</td>
                  <td>{formatCurrency(loan.balance)}</td>
                  <td>{loan.repaymentFrequency || "—"}</td>
                  <td>{formatDate(loan.endDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="client-empty-state">לא התקבל מידע על הלוואות להצגה.</div>
        )}
      </div>
    </div>
  );
}

function InfoSection({ scope, clientModel }) {
  return (
    <div>
      <SectionTitle title="מידע כללי" subtitle="פרטים כלליים על התצוגה והנתונים שהוצגו במסך הלקוח." />

      <InfoPanel
        title="פרטי תצוגה"
        rows={[
          ["תצוגה נוכחית", scope.name],
          ["תאריך עדכון", clientModel.lastUpdated || "—"],
          ["סוג תצוגה", scope.isFamily ? "מאוחד" : "אישי"],
        ]}
      />
    </div>
  );
}

function SectionTitle({ title, subtitle }) {
  return (
    <div className="client-section-title-row">
      <div>
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
    </div>
  );
}

function KpiCard({ icon, title, value, tone = "blue" }) {
  return (
    <div className="client-kpi-card">
      <div className={`client-kpi-icon ${tone}`}>{icon}</div>
      <div className="client-kpi-title">{title}</div>
      <div className={`client-kpi-value ${tone}`}>{value}</div>
    </div>
  );
}

function MetricBox({ title, value, icon }) {
  return (
    <div className="client-metric-box">
      <div className="client-metric-icon">{icon}</div>
      <div>
        <div className="client-metric-title">{title}</div>
        <div className="client-metric-value">{value}</div>
      </div>
    </div>
  );
}

function InfoPanel({ title, rows }) {
  return (
    <div className="client-panel">
      <h3>{title}</h3>
      <div className="client-info-list">
        {rows.map(([label, value]) => (
          <div key={label} className="client-info-row">
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function ComparisonCard({ title, withValue, withoutValue }) {
  const withNum = Number(withValue || 0);
  const withoutNum = Number(withoutValue || 0);
  const maxValue = Math.max(withNum, withoutNum, 1);

  return (
    <div className="client-panel">
      <h3>{title}</h3>
      <CompareBar label="עם המשך הפקדות" value={withNum} maxValue={maxValue} primary />
      <CompareBar label="ללא המשך הפקדות" value={withoutNum} maxValue={maxValue} />
    </div>
  );
}

function CompareBar({ label, value, maxValue, primary = false }) {
  const ratio = Math.max((Number(value || 0) / Number(maxValue || 1)) * 100, value ? 5 : 0);

  return (
    <div className="client-compare-row">
      <div className="client-compare-top">
        <span>{label}</span>
        <strong>{formatCurrency(value)}</strong>
      </div>
      <div className="client-compare-track">
        <div
          className={primary ? "client-compare-fill primary" : "client-compare-fill muted"}
          style={{ width: `${ratio}%` }}
        />
      </div>
    </div>
  );
}

function DonutCard({ title, items, center, subtitle, percentMode = false }) {
  const segments = buildSegments(items, percentMode);
  const gradient = segments.length
    ? segments.map((seg) => `${seg.color} ${seg.start}% ${seg.end}%`).join(", ")
    : "#D7DEE7 0% 100%";

  return (
    <div className="client-panel client-donut-panel">
      <h3>{title}</h3>

      {segments.length ? (
        <div className="client-donut-layout">
          <div className="client-donut" style={{ background: `conic-gradient(${gradient})` }}>
            <div className="client-donut-hole">
              <strong>{center || ""}</strong>
              <span>{subtitle || ""}</span>
            </div>
          </div>

          <div className="client-legend">
            {segments.slice(0, 6).map((seg) => (
              <div key={seg.id || seg.name} className="client-legend-row">
                <span className="client-legend-dot" style={{ background: seg.color }} />
                <span className="client-legend-name">{seg.name}</span>
                <strong>{Math.round(seg.percent)}%</strong>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="client-empty-state">אין נתונים להצגה</div>
      )}
    </div>
  );
}

function buildSegments(items, percentMode) {
  const colors = ["#00215D", "#0B7FEA", "#22A35A", "#43B5D9", "#8F63C9", "#F0B43C", "#9FD0E6", "#8FB996"];
  const safeItems = safeArray(items).filter((item) => Number(item?.value || 0) > 0);
  const total = percentMode ? 100 : safeItems.reduce((sum, item) => sum + Number(item.value || 0), 0);

  if (!safeItems.length || total <= 0) return [];

  let current = 0;

  return safeItems.map((item, index) => {
    const value = Number(item.value || 0);
    const percent = percentMode ? value : (value / total) * 100;
    const start = current;
    const end = current + percent;
    current = end;

    return {
      ...item,
      id: item.id || item.name || `segment-${index}`,
      name: item.name || item.label || "ללא שם",
      percent,
      start,
      end,
      color: colors[index % colors.length],
    };
  });
}

const clientDashboardCss = `
  * { box-sizing: border-box; }

  .client-web-shell {
    min-height: 100vh;
    background: #F9F7F3;
    color: #102A43;
    direction: rtl;
    font-family: Calibri, Arial, sans-serif;
    display: grid;
    grid-template-columns: 276px minmax(0, 1fr);
  }

  .client-sidebar {
    position: sticky;
    top: 0;
    height: 100vh;
    background: linear-gradient(180deg, #001845 0%, #00215D 52%, #001733 100%);
    color: #FFFFFF;
    padding: 24px 16px;
    border-left: 1px solid rgba(255,255,255,0.08);
    overflow-y: auto;
  }

  .client-sidebar-brand {
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr);
    gap: 12px;
    align-items: center;
    padding: 0 8px 24px;
    margin-bottom: 10px;
    border-bottom: 1px solid rgba(255,255,255,0.14);
  }

  .client-brand-icon {
    width: 48px;
    height: 48px;
    border-radius: 16px;
    background: rgba(255,255,255,0.12);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 25px;
  }

  .client-brand-title {
    font-size: 20px;
    line-height: 1.2;
    font-weight: 900;
  }

  .client-brand-subtitle {
    margin-top: 4px;
    font-size: 12px;
    color: rgba(255,255,255,0.72);
  }

  .client-sidebar-nav {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 8px;
  }

  .client-nav-item {
    width: 100%;
    min-height: 56px;
    border: 0;
    border-radius: 14px;
    padding: 0 14px;
    background: transparent;
    color: rgba(255,255,255,0.82);
    cursor: pointer;
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr);
    gap: 12px;
    align-items: center;
    text-align: right;
    font-family: Calibri, Arial, sans-serif;
    font-size: 15px;
    font-weight: 800;
    transition: 0.18s ease;
  }

  .client-nav-item:hover,
  .client-nav-item.active {
    background: linear-gradient(135deg, #0B7FEA 0%, #0062D6 100%);
    color: #FFFFFF;
    box-shadow: 0 10px 24px rgba(0, 98, 214, 0.24);
    transform: translateX(-2px);
  }

  .client-nav-icon {
    font-size: 22px;
    text-align: center;
  }

  .client-main {
    min-width: 0;
    padding: 24px 28px 36px;
  }

  .client-topbar {
    min-height: 84px;
    background: rgba(255,255,255,0.86);
    border: 1px solid #E2D1BF;
    border-radius: 24px;
    padding: 18px 22px;
    box-shadow: 0 8px 26px rgba(16,42,67,0.05);
    display: flex;
    justify-content: space-between;
    gap: 18px;
    align-items: center;
    margin-bottom: 18px;
  }

  .client-page-title {
    margin: 0;
    font-size: 28px;
    line-height: 1.2;
    color: #00215D;
    font-weight: 900;
  }

  .client-page-subtitle {
    margin-top: 6px;
    color: #627D98;
    font-size: 13px;
    font-weight: 700;
  }

  .client-topbar-actions {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .client-updated-box {
    min-height: 44px;
    padding: 8px 12px;
    border-radius: 14px;
    background: #FFFFFF;
    border: 1px solid #EEE4D8;
    display: flex;
    flex-direction: column;
    gap: 2px;
    color: #627D98;
    font-size: 11px;
  }

  .client-updated-box strong { color: #00215D; font-size: 13px; }

  .client-scope-select-wrap {
    min-height: 44px;
    padding: 6px 12px;
    border-radius: 14px;
    background: #FFFFFF;
    border: 1px solid #EEE4D8;
    display: grid;
    grid-template-columns: auto minmax(150px, 1fr);
    gap: 10px;
    align-items: center;
    color: #627D98;
    font-size: 12px;
    font-weight: 800;
  }

  .client-scope-select {
    min-height: 30px;
    border: 0;
    outline: 0;
    color: #00215D;
    font-family: Calibri, Arial, sans-serif;
    font-size: 14px;
    font-weight: 900;
    background: transparent;
    cursor: pointer;
  }

  .client-back-button,
  .client-web-shell button.client-back-button {
    min-height: 44px;
    border-radius: 14px;
    border: 1px solid #D9DDE8;
    background: #FFFFFF;
    color: #00215D;
    padding: 0 16px;
    font-family: Calibri, Arial, sans-serif;
    font-size: 13px;
    font-weight: 900;
    cursor: pointer;
  }

  .client-content-card {
    background: #FFFFFF;
    border: 1px solid #E2D1BF;
    border-radius: 24px;
    padding: 22px;
    box-shadow: 0 8px 26px rgba(16,42,67,0.05);
    min-height: calc(100vh - 150px);
  }

  .client-section-title-row {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: flex-start;
    margin-bottom: 18px;
  }

  .client-section-title-row h2 {
    margin: 0;
    color: #00215D;
    font-size: 22px;
    line-height: 1.25;
    font-weight: 900;
  }

  .client-section-title-row p {
    margin: 6px 0 0;
    color: #627D98;
    font-size: 13px;
    line-height: 1.6;
  }

  .client-kpi-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
    margin-bottom: 14px;
  }

  .client-kpi-card,
  .client-panel,
  .client-metric-box {
    border: 1px solid #E7D9CA;
    border-radius: 20px;
    background: linear-gradient(180deg, #FFFFFF 0%, #FCFBF8 100%);
    box-shadow: 0 2px 10px rgba(16,42,67,0.04);
  }

  .client-kpi-card {
    min-height: 148px;
    padding: 18px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
  }

  .client-kpi-icon {
    width: 54px;
    height: 54px;
    border-radius: 18px;
    background: #EAF1FB;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 12px;
    font-size: 22px;
  }

  .client-kpi-icon.green { background: #E9F8EF; }
  .client-kpi-icon.purple { background: #F1EAFF; }

  .client-kpi-title {
    color: #102A43;
    font-size: 14px;
    font-weight: 900;
    margin-bottom: 8px;
  }

  .client-kpi-value {
    color: #0B7FEA;
    font-size: 29px;
    line-height: 1.1;
    font-weight: 900;
    direction: ltr;
  }

  .client-kpi-value.green { color: #149447; }
  .client-kpi-value.purple { color: #6F3FD9; }

  .client-grid-2 {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }

  .client-grid-3 {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
  }

  .client-margin-top { margin-top: 14px; }

  .client-panel {
    padding: 18px;
    min-width: 0;
  }

  .client-panel h3 {
    margin: 0 0 14px;
    color: #00215D;
    font-size: 16px;
    line-height: 1.3;
    font-weight: 900;
  }

  .client-donut-layout {
    display: grid;
    grid-template-columns: 150px minmax(0, 1fr);
    gap: 18px;
    align-items: center;
  }

  .client-donut {
    width: 142px;
    height: 142px;
    border-radius: 50%;
    position: relative;
    box-shadow: inset 0 0 0 3px rgba(255,255,255,0.95), inset 0 -9px 16px rgba(0,0,0,0.08), 0 10px 20px rgba(0,33,93,0.08);
  }

  .client-donut-hole {
    position: absolute;
    inset: 30%;
    border-radius: 50%;
    background: #FFFFFF;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    box-shadow: inset 0 4px 8px rgba(0,33,93,0.04);
  }

  .client-donut-hole strong {
    color: #00215D;
    font-size: 20px;
    line-height: 1.1;
  }

  .client-donut-hole span {
    color: #627D98;
    font-size: 10px;
    margin-top: 3px;
  }

  .client-legend {
    display: flex;
    flex-direction: column;
    gap: 9px;
    min-width: 0;
  }

  .client-legend-row {
    display: grid;
    grid-template-columns: 10px minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
    color: #102A43;
    font-size: 12px;
  }

  .client-legend-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  .client-legend-name {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .client-info-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .client-info-row {
    min-height: 44px;
    padding: 10px 12px;
    border: 1px solid #EEE4D8;
    border-radius: 14px;
    background: #FFFFFF;
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
  }

  .client-info-row span {
    color: #627D98;
    font-size: 13px;
    font-weight: 800;
  }

  .client-info-row strong {
    color: #00215D;
    font-size: 15px;
    font-weight: 900;
    direction: ltr;
  }

  .client-compare-row {
    margin-top: 14px;
  }

  .client-compare-top {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
    margin-bottom: 8px;
    color: #627D98;
    font-size: 13px;
    font-weight: 800;
  }

  .client-compare-top strong {
    color: #00215D;
    font-size: 17px;
    direction: ltr;
  }

  .client-compare-track {
    height: 18px;
    border-radius: 999px;
    background: #EAF1FB;
    overflow: hidden;
  }

  .client-compare-fill {
    height: 100%;
    border-radius: 999px;
  }

  .client-compare-fill.primary { background: linear-gradient(90deg, #0B7FEA, #00215D); }
  .client-compare-fill.muted { background: #C7D1E2; }

  .client-metric-box {
    min-height: 126px;
    padding: 18px;
    display: grid;
    grid-template-columns: 54px minmax(0, 1fr);
    gap: 14px;
    align-items: center;
  }

  .client-metric-icon {
    width: 54px;
    height: 54px;
    border-radius: 18px;
    background: #EAF1FB;
    color: #00215D;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    font-weight: 900;
  }

  .client-metric-title {
    color: #627D98;
    font-size: 13px;
    font-weight: 800;
    margin-bottom: 8px;
  }

  .client-metric-value {
    color: #00215D;
    font-size: 23px;
    line-height: 1.15;
    font-weight: 900;
    direction: ltr;
    text-align: right;
  }

  .client-table-wrap {
    overflow-x: auto;
    border: 1px solid #EEE4D8;
    border-radius: 18px;
    background: #FFFFFF;
  }

  .client-table {
    width: 100%;
    min-width: 760px;
    border-collapse: collapse;
  }

  .client-table th {
    background: #00215D;
    color: #FFFFFF;
    padding: 12px 10px;
    font-size: 12px;
    text-align: right;
    white-space: nowrap;
  }

  .client-table td {
    padding: 12px 10px;
    border-bottom: 1px solid #EEE4D8;
    color: #102A43;
    font-size: 12px;
    white-space: nowrap;
  }

  .client-empty-state {
    border: 1px dashed #E2D1BF;
    border-radius: 16px;
    background: #FCFBF8;
    padding: 18px;
    color: #627D98;
    font-size: 13px;
    text-align: center;
  }

  @media print {
    .client-web-shell { display: none !important; }
  }

  @media (max-width: 1180px) {
    .client-web-shell { grid-template-columns: 1fr; }
    .client-sidebar {
      position: relative;
      height: auto;
      display: block;
      border-left: 0;
      border-bottom: 1px solid rgba(255,255,255,0.12);
    }
    .client-sidebar-nav {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .client-main { padding: 18px; }
    .client-topbar { flex-direction: column; align-items: stretch; }
    .client-topbar-actions { justify-content: flex-start; }
    .client-kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .client-grid-3 { grid-template-columns: 1fr; }
    .client-grid-2 { grid-template-columns: 1fr; }
  }

  @media (max-width: 720px) {
    .client-main { padding: 12px; }
    .client-sidebar { padding: 16px 12px; }
    .client-sidebar-nav { grid-template-columns: 1fr; }
    .client-kpi-grid { grid-template-columns: 1fr; }
    .client-content-card { padding: 16px; border-radius: 18px; }
    .client-topbar { padding: 16px; border-radius: 18px; }
    .client-page-title { font-size: 22px; }
    .client-donut-layout { grid-template-columns: 1fr; justify-items: center; }
    .client-scope-select-wrap { grid-template-columns: 1fr; width: 100%; }
  }
`;

const styles = {
  emptyPage: {
    minHeight: "100vh",
    direction: "rtl",
    fontFamily: 'Calibri, "Arial", sans-serif',
    background: "#F9F7F3",
    color: "#102A43",
    padding: 32,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyCard: {
    width: "100%",
    maxWidth: 760,
    background: "#FFFFFF",
    border: "1px solid #E2D1BF",
    borderRadius: 22,
    padding: 32,
    boxShadow: "0 10px 28px rgba(16,42,67,0.08)",
    textAlign: "center",
  },
  emptyTitle: {
    margin: "0 0 12px",
    color: "#00215D",
    fontSize: 28,
    lineHeight: 1.25,
    fontWeight: 800,
  },
  emptyText: {
    margin: "0 auto 22px",
    maxWidth: 560,
    color: "#627D98",
    fontSize: 15,
    lineHeight: 1.8,
  },
  secondaryButton: {
    minWidth: 150,
    minHeight: 42,
    padding: "10px 16px",
    borderRadius: 12,
    border: "1px solid #D9DDE8",
    background: "#FFFFFF",
    color: "#102A43",
    fontWeight: 800,
    fontFamily: 'Calibri, "Arial", sans-serif',
    cursor: "pointer",
  },
};
