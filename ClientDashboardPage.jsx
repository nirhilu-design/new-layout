import React, { useMemo, useState } from "react";

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

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function formatCurrency(value) {
  return `₪${Math.round(Number(value || 0)).toLocaleString("en-US")}`;
}

function formatOptionalCurrency(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? formatCurrency(number) : "—";
}

function formatPercent(value) {
  return `${Math.round(Number(value || 0))}%`;
}

function formatDate(value) {
  if (!value) return "—";
  const str = String(value).trim();
  if (!str) return "—";
  if (/^\d{8}$/.test(str)) return `${str.slice(6, 8)}/${str.slice(4, 6)}/${str.slice(0, 4)}`;
  const date = new Date(str);
  return Number.isNaN(date.getTime()) ? str : new Intl.DateTimeFormat("he-IL").format(date);
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

function getFirstPositiveNumber(values) {
  return values.map((value) => Number(value || 0)).find((value) => Number.isFinite(value) && value > 0) || 0;
}

function getFirstText(values) {
  return values
    .map((value) => (value === null || value === undefined ? "" : String(value).trim()))
    .find((value) => value && value !== "—" && value !== "-") || "";
}

function getPolicyDeathCoverage(policy) {
  return getFirstPositiveNumber([
    policy?.insurance?.deathCoverage,
    policy?.insurance?.lifeInsurance,
    policy?.coverage?.deathCoverage,
    policy?.coverage?.lifeInsurance,
    policy?.risk?.deathCoverage,
    policy?.risk?.lifeInsurance,
    policy?.deathCoverage,
    policy?.lifeInsurance,
    policy?.sumInsured,
    policy?.insuredAmount,
  ]);
}

function getPolicyDisabilityValue(policy) {
  return getFirstPositiveNumber([
    policy?.insurance?.disabilityValue,
    policy?.insurance?.disabilityCoverage,
    policy?.coverage?.disabilityValue,
    policy?.coverage?.disabilityCoverage,
    policy?.risk?.disabilityValue,
    policy?.risk?.disabilityCoverage,
    policy?.disabilityValue,
    policy?.disabilityCoverage,
  ]);
}

function getPlanWeightedExposure(policy, key) {
  const plans = safeArray(policy?.investPlans);
  if (!plans.length) return 0;
  return plans.reduce((sum, plan) => sum + Number(key === "equity" ? plan?.equityExposure || 0 : plan?.foreignExposure || 0), 0) / plans.length;
}

function getRawMemberDetails(rawFile) {
  const parsed = rawFile?.parsedData || {};
  return parsed?.memberDetails || parsed?.MemberDetails || parsed?.member || parsed?.insured || parsed?.personalDetails || rawFile?.memberDetails || {};
}

function getPersonalDetailsFromSources(member, rawFile) {
  const rawDetails = getRawMemberDetails(rawFile);
  const policies = safeArray(rawFile?.parsedData?.policies);
  const firstPolicy = policies[0] || {};
  const firstEmployerPolicy = policies.find((policy) => getFirstText([
    policy?.employerName,
    policy?.companyName,
    policy?.CompanyName,
    policy?.employer?.name,
    policy?.employment?.employerName,
    policy?.details?.employerName,
  ])) || firstPolicy;

  const name = getFirstText([
    member?.personalDetails?.name,
    member?.name,
    rawDetails?.name,
    rawDetails?.fullName,
    rawDetails?.memberName,
    rawDetails?.firstName && rawDetails?.lastName ? `${rawDetails.firstName} ${rawDetails.lastName}` : "",
    rawFile?.memberName,
  ]) || "ללא שם";

  const birthDate = getFirstText([
    member?.personalDetails?.birthDate,
    member?.birthDate,
    member?.dateOfBirth,
    rawDetails?.birthDate,
    rawDetails?.dateOfBirth,
    rawDetails?.BirthDate,
    rawDetails?.DOB,
    rawDetails?.birthdate,
  ]);

  const lastWorkplace = getFirstText([
    member?.personalDetails?.lastWorkplace,
    member?.personalDetails?.employerName,
    member?.lastWorkplace,
    member?.employerName,
    member?.currentEmployer,
    rawDetails?.lastWorkplace,
    rawDetails?.employerName,
    rawDetails?.currentEmployer,
    rawDetails?.workplace,
    firstEmployerPolicy?.employerName,
    firstEmployerPolicy?.companyName,
    firstEmployerPolicy?.CompanyName,
    firstEmployerPolicy?.employer?.name,
    firstEmployerPolicy?.employment?.employerName,
    firstEmployerPolicy?.details?.employerName,
  ]);

  const currentSalary = getFirstPositiveNumber([
    member?.personalDetails?.currentSalary,
    member?.personalDetails?.salary,
    member?.currentSalary,
    member?.salary,
    member?.income,
    rawDetails?.currentSalary,
    rawDetails?.salary,
    rawDetails?.income,
    rawDetails?.Income,
    firstPolicy?.memberDetails?.Income,
    firstPolicy?.MemberDetails?.Income,
    firstPolicy?.income,
    firstPolicy?.salary,
  ]);

  return {
    name,
    birthDate,
    lastWorkplace,
    currentSalary,
  };
}

function buildMemberProductsFromRawFile(rawFile) {
  const policies = safeArray(rawFile?.parsedData?.policies);

  return policies.map((policy, index) => {
    const currentValue = Number(policy?.savings?.totalAccumulated || 0);
    return {
      id: policy?.policyNo || `${rawFile?.memberName || "member"}-${policy?.rowNum || index}`,
      planName: policy?.planName || policy?.details?.proposeName || policy?.productType || "מוצר ללא שם",
      managerName: policy?.managerName || "לא ידוע",
      productType: policy?.productType || "ללא סוג",
      policyNo: policy?.policyNo || "",
      currentValue,
      monthlyDeposit: Number(policy?.monthlyDeposits?.sumCost || 0),
      projectedMonthlyPension: Number(policy?.savings?.projectedMonthlyPension || policy?.savings?.pensionRetire || 0),
      managementFeeFromBalance: Number(policy?.details?.managementFeeFromBalance || 0),
      equityExposure: getPlanWeightedExposure(policy, "equity"),
      foreignExposure: getPlanWeightedExposure(policy, "foreign"),
      deathCoverage: getPolicyDeathCoverage(policy),
      disabilityValue: getPolicyDisabilityValue(policy),
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
  return Array.from(map.entries()).map(([name, value]) => ({ id: name, name, value })).sort((a, b) => b.value - a.value);
}

function buildDeathCoverageRows(products) {
  return safeArray(products)
    .filter((product) => {
      const typeText = String(product?.productType || product?.planName || "");
      const isPensionFund = typeText.includes("קרן פנסיה") || typeText.includes("פנסיה מקיפה") || typeText.includes("פנסיה כללית");
      return !isPensionFund;
    })
    .map((product, index) => ({
      id: product.id || `${product.planName}-${index}`,
      planName: product.planName || "מוצר ללא שם",
      managerName: product.managerName || "לא ידוע",
      productType: product.productType || "ללא סוג",
      policyNo: product.policyNo || "",
      currentValue: Number(product.currentValue || 0),
      deathCoverage: Number(product.deathCoverage || 0),
    }))
    .filter((row) => row.currentValue > 0 || row.deathCoverage > 0)
    .sort((a, b) => Number(b.deathCoverage || 0) + Number(b.currentValue || 0) - (Number(a.deathCoverage || 0) + Number(a.currentValue || 0)));
}

function buildClientModelFromReportData(reportData) {
  const data = reportData || {};
  const family = data.family || {};
  const products = normalizeDistributionItems(data.products);
  const managers = normalizeDistributionItems(data.managers);
  const mainGroupAllocation = normalizeDistributionItems(data.mainGroupAllocation);

  return {
    lastUpdated: family.lastUpdated || data.lastUpdated || new Intl.DateTimeFormat("he-IL").format(new Date()),
    previousReports: safeArray(data.previousReports || data.clientPreviousReports),
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
      personalDetails: getPersonalDetailsFromSources(member, null),
      summary: {
        totalAssets: Number(member?.assets || member?.totalAssets || 0),
        monthlyDeposits: Number(member?.monthlyDeposits || 0),
        monthlyPensionWithDeposits: Number(member?.monthlyPensionWithDeposits || 0),
        monthlyPensionWithoutDeposits: Number(member?.monthlyPensionWithoutDeposits || 0),
        projectedLumpSumWithDeposits: Number(member?.lumpSumWithDeposits || member?.projectedLumpSumWithDeposits || 0),
        projectedLumpSumWithoutDeposits: Number(member?.lumpSumWithoutDeposits || member?.projectedLumpSumWithoutDeposits || 0),
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
    conversationSummary: data.conversationSummary || data.clientConversationSummary || data.summaryText || "",
    actionRecommendations: data.actionRecommendations || data.recommendationsText || data.recommendations || "",
    sourceReportData: data,
  };
}

function buildDetailedMembers(reportData, clientModel) {
  const summaryMembers = safeArray(clientModel?.members);
  const rawFiles = safeArray(reportData?.rawParsedFiles);

  return summaryMembers.map((summaryMember, index) => {
    const rawFile = rawFiles.find((file) => file?.memberName === summaryMember?.name) || rawFiles[index] || null;
    const products = buildMemberProductsFromRawFile(rawFile);
    const totalProductsValue = products.reduce((sum, product) => sum + Number(product.currentValue || 0), 0);
    const weightedEquity = totalProductsValue > 0 ? products.reduce((sum, product) => sum + Number(product.currentValue || 0) * Number(product.equityExposure || 0), 0) / totalProductsValue : 0;
    const weightedForeign = totalProductsValue > 0 ? products.reduce((sum, product) => sum + Number(product.currentValue || 0) * Number(product.foreignExposure || 0), 0) / totalProductsValue : 0;

    return {
      ...summaryMember,
      id: summaryMember?.id || summaryMember?.name || `member-${index}`,
      name: summaryMember?.name || rawFile?.memberName || "ללא שם",
      personalDetails: getPersonalDetailsFromSources(summaryMember, rawFile),
      products,
      managers: groupItemsByValue(products, (product) => product.managerName, (product) => product.currentValue),
      productTypes: groupItemsByValue(products, (product) => product.productType, (product) => product.currentValue),
      deathCoverageProducts: buildDeathCoverageRows(products),
      exposures: {
        equity: Math.round(weightedEquity),
        foreign: Math.round(weightedForeign),
      },
    };
  });
}

function aggregateInsurance(members) {
  return safeArray(members).reduce((acc, member) => ({
    deathCoverage: acc.deathCoverage + Number(member?.insurance?.deathCoverage || 0),
    disabilityValue: acc.disabilityValue + Number(member?.insurance?.disabilityValue || 0),
    disabilityPercent: Math.max(acc.disabilityPercent, Number(member?.insurance?.disabilityPercent || 0)),
  }), { deathCoverage: 0, disabilityValue: 0, disabilityPercent: 0 });
}

function aggregateDeathCoverageRows(members) {
  return safeArray(members)
    .flatMap((member) => safeArray(member.deathCoverageProducts).map((row) => ({ ...row, memberName: member.name })))
    .sort((a, b) => Number(b.deathCoverage || 0) + Number(b.currentValue || 0) - (Number(a.deathCoverage || 0) + Number(a.currentValue || 0)));
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
      managers: clientModel.distributions.managers,
      productTypes: clientModel.distributions.products,
      deathCoverageProducts: aggregateDeathCoverageRows(detailedMembers),
    };
  }

  const member = detailedMembers.find((item) => String(item.id || item.name) === String(selectedScopeId)) || detailedMembers[0];
  if (!member) return getSelectedScope(clientModel, [], "family");

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
    deathCoverageProducts: member.deathCoverageProducts || [],
  };
}

function EmptyDashboardState({ onBack }) {
  return (
    <div style={styles.emptyPage}>
      <div style={styles.emptyCard}>
        <h1 style={styles.emptyTitle}>אין נתוני דוח להצגה</h1>
        <p style={styles.emptyText}>מסך הלקוח מקבל את הנתונים מתוך הדוח שנוצר במערכת. חזור למסך הדוח או הפק דוח חדש.</p>
        <button type="button" onClick={onBack} style={styles.secondaryButton}>חזרה</button>
      </div>
    </div>
  );
}

const NAV_ITEMS = [
  { id: "pension", label: "סיכום פנסיוני", icon: "▥" },
  { id: "personal", label: "פרטים אישיים", icon: "☷" },
  { id: "allocation", label: "התפלגות נכסים", icon: "◔" },
  { id: "insurance", label: "פירוט ביטוחים", icon: "🛡" },
  { id: "loans", label: "הלוואות", icon: "🏦" },
  { id: "summary", label: "סיכום שיחה והמלצות פעולה", icon: "✎" },
];

export default function ClientDashboardPage({
  reportData,
  onBack = () => {},
  isSharedMode = false,
  viewMode = "family",
  selectedMemberId = null,
  onChangeView = () => {},
  onOpenPreviousReports = () => {},
}) {
  const [activeSection, setActiveSection] = useState("pension");
  const initialScopeId = viewMode === "member" && selectedMemberId ? selectedMemberId : "family";
  const [localScopeId, setLocalScopeId] = useState(initialScopeId);

  const clientModel = useMemo(() => buildClientModelFromReportData(reportData), [reportData]);
  const detailedMembers = useMemo(() => buildDetailedMembers(reportData, clientModel), [reportData, clientModel]);
  const scope = getSelectedScope(clientModel, detailedMembers, localScopeId);

  if (!reportData || !reportData.family) return <EmptyDashboardState onBack={onBack} />;

  const handleScopeChange = (event) => {
    const nextScopeId = event.target.value;
    setLocalScopeId(nextScopeId);
    if (nextScopeId === "family") onChangeView("family", null);
    else onChangeView("member", nextScopeId);
  };

  return (
    <div className="client-web-shell">
      <style>{clientDashboardCss}</style>

      <aside className="client-sidebar">
        <div className="client-sidebar-brand">
          <ZviranMark />
          <div>
            <div className="client-brand-title">הפנסיה שלי</div>
            <div className="client-brand-subtitle">דוח פנסיוני משפחתי</div>
          </div>
        </div>

        <nav className="client-sidebar-nav" aria-label="ניווט במסך הלקוח">
          {NAV_ITEMS.map((item) => (
            <button key={item.id} type="button" onClick={() => setActiveSection(item.id)} className={activeSection === item.id ? "client-nav-item active" : "client-nav-item"}>
              <span className="client-nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="client-main">
        <header className="client-topbar">
          <div className="client-topbar-title-wrap">
            <div className="client-topbar-eyebrow">מסך לקוח · תצוגת WEB</div>
            <h1 className="client-page-title">דוח פנסיוני משפחתי מאוחד</h1>
            <div className="client-page-subtitle">{scope.isFamily ? "תצוגה מאוחדת לכל המשפחה" : `תצוגה אישית עבור ${scope.name}`}</div>
          </div>

          <div className="client-topbar-actions">
            <button type="button" className="client-history-button" onClick={onOpenPreviousReports} title="הכנה לצפייה בנתונים קודמים">
              <span className="client-history-icon">↺</span>
              <span><strong>נתונים קודמים</strong><small>הכנה לגרסאות דוח קודמות</small></span>
            </button>

            <div className="client-updated-box"><span>עודכן לאחרונה:</span><strong>{clientModel.lastUpdated || "—"}</strong></div>

            <label className="client-scope-select-wrap">
              <span>תצוגה</span>
              <select value={localScopeId} onChange={handleScopeChange} className="client-scope-select">
                <option value="family">משפחה מאוחדת</option>
                {detailedMembers.map((member) => <option key={member.id || member.name} value={member.id || member.name}>{member.name || "ללא שם"}</option>)}
              </select>
            </label>

            {!isSharedMode ? <button type="button" onClick={onBack} className="client-back-button">חזרה ל־REPORT</button> : null}
          </div>
        </header>

        <section className="client-content-card">
          {activeSection === "pension" ? <PensionSection scope={scope} /> : null}
          {activeSection === "personal" ? <PersonalDetailsSection members={detailedMembers} /> : null}
          {activeSection === "allocation" ? <AllocationSection scope={scope} /> : null}
          {activeSection === "insurance" ? <InsuranceSection scope={scope} /> : null}
          {activeSection === "loans" ? <LoansSection scope={scope} /> : null}
          {activeSection === "summary" ? <ConversationSummarySection scope={scope} clientModel={clientModel} reportData={reportData} /> : null}
        </section>
      </main>
    </div>
  );
}

function PensionSection({ scope }) {
  const summary = scope.summary || {};
  return (
    <div>
      <SectionTitle title="סיכום פנסיוני" subtitle="ריכוז נתוני הצבירה, ההפקדות והתחזית לגיל פרישה — ללא רכיבי פאי בעמוד הראשי." />
      <div className="client-kpi-grid">
        <KpiCard icon={<PiggyIcon />} title="הפקדה חודשית כוללת" value={formatCurrency(summary.monthlyDeposits)} subtext="לפי התצוגה שנבחרה" />
        <KpiCard icon={<GrowthIcon />} title="סך נכסים" value={formatCurrency(summary.totalAssets)} subtext="סך הצבירה הקיימת" />
        <KpiCard icon={<WalletIcon />} title="קצבה חודשית צפויה" value={formatCurrency(summary.monthlyPensionWithDeposits)} subtext="עם המשך הפקדות" />
        <KpiCard icon={<BankIcon />} title="צבירה צפויה" value={formatCurrency(summary.projectedLumpSumWithDeposits)} subtext="עם המשך הפקדות" />
      </div>
      <div className="client-grid-2 client-margin-top">
        <ComparisonCard title="השוואת צבירה צפויה" explanation="פער בין צבירה עתידית עם המשך הפקדות לבין מצב ללא המשך הפקדות." withValue={summary.projectedLumpSumWithDeposits} withoutValue={summary.projectedLumpSumWithoutDeposits} />
        <ComparisonCard title="השוואת קצבה חודשית צפויה" explanation="פער בין קצבה עתידית עם המשך הפקדות לבין מצב ללא המשך הפקדות." withValue={summary.monthlyPensionWithDeposits} withoutValue={summary.monthlyPensionWithoutDeposits} />
      </div>
      <div className="client-grid-2 client-margin-top">
        <ExposurePanel title="חשיפה מנייתית משוקללת" value={scope.exposures?.equity} description={getExposureLabel(scope.exposures?.equity)} />
        <ExposurePanel title='חשיפה לחו"ל' value={scope.exposures?.foreign} description={getForeignExposureLabel(scope.exposures?.foreign)} />
      </div>
    </div>
  );
}

function PersonalDetailsSection({ members }) {
  const displayMembers = safeArray(members).slice(0, 2);
  return (
    <div>
      <SectionTitle title="פרטים אישיים" subtitle="ריכוז פרטי הלקוח/ה לפי הנתונים שנקראו מהמסלקה ומהקבצים שהועלו. הנתונים מוצגים לבעל ולאישה בשני כרטיסים נפרדים." />
      {displayMembers.length ? (
        <div className="client-personal-grid">
          {displayMembers.map((member, index) => (
            <PersonalDetailsCard key={member.id || member.name || index} member={member} index={index} />
          ))}
        </div>
      ) : (
        <div className="client-empty-state">לא נמצאו בני משפחה להצגת פרטים אישיים.</div>
      )}
    </div>
  );
}

function PersonalDetailsCard({ member, index }) {
  const details = member?.personalDetails || {};
  const title = index === 0 ? "בעל" : index === 1 ? "אישה" : "בן/בת משפחה";
  return (
    <div className="client-personal-card">
      <div className="client-personal-card-header">
        <div className="client-personal-avatar">{String(details.name || member?.name || "?").trim().slice(0, 1)}</div>
        <div>
          <div className="client-personal-card-kicker">{title}</div>
          <h3>{details.name || member?.name || "ללא שם"}</h3>
        </div>
      </div>

      <div className="client-personal-fields">
        <PersonalField label="שם לקוח" value={details.name || member?.name || "—"} />
        <PersonalField label="תאריך לידה" value={formatDate(details.birthDate)} />
        <PersonalField label="מקום עבודה אחרון מעודכן" value={details.lastWorkplace || "—"} />
        <PersonalField label="שכר נוכחי" value={formatOptionalCurrency(details.currentSalary)} />
      </div>
    </div>
  );
}

function PersonalField({ label, value }) {
  return (
    <div className="client-personal-field">
      <span>{label}</span>
      <strong>{value || "—"}</strong>
    </div>
  );
}

function AllocationSection({ scope }) {
  return (
    <div>
      <SectionTitle title="התפלגות נכסים" subtitle="פיזור התיק לפי מוצרים, גופים מנהלים ואפיקים — מוצג במסך נפרד ולא בעמוד הסיכום הראשי." />
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
  const deathCoverageRows = safeArray(scope.deathCoverageProducts);

  return (
    <div>
      <SectionTitle title="פירוט ביטוחים" subtitle="ריכוז הכיסויים הביטוחיים לפי התצוגה שנבחרה, כולל פירוט ביטוח חיים לפי מוצרים וצבירה." />

      <div className="client-grid-3">
        <MetricBox title="ביטוח חיים / הון למוטבים" value={formatCurrency(insurance.deathCoverage)} icon={<ShieldIcon />} />
        <MetricBox title="אובדן כושר עבודה" value={formatCurrency(insurance.disabilityValue)} icon={<PersonIcon />} />
        <MetricBox title="שיעור אובדן כושר עבודה" value={formatPercent(insurance.disabilityPercent)} icon="%" />
      </div>

      <div className="client-panel client-margin-top">
        <h3>פירוט ביטוח חיים לפי מוצרים וצבירה</h3>
        <p className="client-panel-subtitle">
          ברמת משפחה מוצגת עמודת בן משפחה. בתצוגת לקוח פרטית העמודה מוסרת לגמרי כדי שלא תיווצר הזזת עמודות בטבלה.
        </p>

        <InsuranceProductsTable rows={deathCoverageRows} isFamily={Boolean(scope.isFamily)} />
      </div>
    </div>
  );
}

function InsuranceProductsTable({ rows, isFamily }) {
  const safeRows = safeArray(rows);

  if (!safeRows.length) {
    return (
      <div className="client-empty-state client-margin-top">
        אין עדיין פירוט מוצרי להצגה. המבנה קיים, ונדרש לחבר את שדות ביטוח החיים מה־parser לפי מוצר/פוליסה.
      </div>
    );
  }

  const columns = isFamily
    ? [
        { key: "memberName", label: "בן משפחה", className: "text-col", render: (row) => row.memberName || "—" },
        { key: "planName", label: "מוצר", className: "wide-col", render: (row) => row.planName || "—" },
        { key: "managerName", label: "גוף מנהל", className: "text-col", render: (row) => row.managerName || "—" },
        { key: "productType", label: "סוג מוצר", className: "text-col", render: (row) => row.productType || "—" },
        { key: "policyNo", label: "מספר פוליסה", className: "policy-col", render: (row) => row.policyNo || "—" },
        { key: "currentValue", label: "צבירה", className: "money-col", render: (row) => formatCurrency(row.currentValue) },
        { key: "deathCoverage", label: "ביטוח חיים", className: "money-col", render: (row) => formatCurrency(row.deathCoverage) },
      ]
    : [
        { key: "planName", label: "מוצר", className: "wide-col", render: (row) => row.planName || "—" },
        { key: "managerName", label: "גוף מנהל", className: "text-col", render: (row) => row.managerName || "—" },
        { key: "productType", label: "סוג מוצר", className: "text-col", render: (row) => row.productType || "—" },
        { key: "policyNo", label: "מספר פוליסה", className: "policy-col", render: (row) => row.policyNo || "—" },
        { key: "currentValue", label: "צבירה", className: "money-col", render: (row) => formatCurrency(row.currentValue) },
        { key: "deathCoverage", label: "ביטוח חיים", className: "money-col", render: (row) => formatCurrency(row.deathCoverage) },
      ];

  return (
    <div className="client-table-wrap client-margin-top">
      <table className={isFamily ? "client-table client-insurance-table family" : "client-table client-insurance-table member"}>
        <colgroup>
          {columns.map((column) => (
            <col key={column.key} className={`client-insurance-col-${column.key}`} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={column.className}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {safeRows.map((row, rowIndex) => (
            <tr key={row.id || `${row.policyNo || "policy"}-${rowIndex}`}>
              {columns.map((column) => (
                <td key={column.key} className={column.className} title={String(column.render(row) || "")}>{column.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
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
        <MetricBox title='סה"כ הלוואות' value={formatCurrency(totalAmount)} icon={<BankIcon />} />
        <MetricBox title="יתרת הלוואות" value={formatCurrency(totalBalance)} icon="◔" />
        <MetricBox title="שיעור מתוך הנכסים" value={`${ratio.toFixed(1)}%`} icon="%" />
      </div>
      <div className="client-table-wrap client-margin-top">
        {loans.length ? <table className="client-table"><thead><tr><th>שם</th><th>סכום הלוואה</th><th>יתרה</th><th>תדירות החזר</th><th>תאריך סיום</th></tr></thead><tbody>{loans.map((loan, index) => <tr key={loan.id || index}><td>{[loan.firstName, loan.familyName].filter(Boolean).join(" ") || loan.name || "—"}</td><td>{formatCurrency(loan.amount)}</td><td>{formatCurrency(loan.balance)}</td><td>{loan.repaymentFrequency || "—"}</td><td>{formatDate(loan.endDate)}</td></tr>)}</tbody></table> : <div className="client-empty-state">לא התקבל מידע על הלוואות להצגה.</div>}
      </div>
    </div>
  );
}

function ConversationSummarySection({ scope, clientModel, reportData }) {
  const savedSummary = reportData?.conversationSummary || reportData?.clientConversationSummary || clientModel?.conversationSummary || "";
  const savedActions = reportData?.actionRecommendations || reportData?.recommendationsText || clientModel?.actionRecommendations || "";
  return (
    <div>
      <SectionTitle title="סיכום שיחה והמלצות פעולה" subtitle="אזור ייעודי להצגת סיכום פגישה, תובנות והמלצות פעולה ללקוח." />
      <div className="client-grid-2">
        <TextPanel title="סיכום שיחה" text={savedSummary || `כאן יוצג סיכום השיחה עם הלקוח עבור ${scope.name}. בשלב זה זהו אזור הכנה, וניתן לחבר אליו בהמשך שדה טקסט מה־REPORT או ממנגנון שמירת הדוח.`} />
        <TextPanel title="המלצות פעולה" text={savedActions || "כאן יוצגו המלצות פעולה, נקודות לבדיקה, החלטות שהתקבלו או משימות להמשך טיפול."} />
      </div>
    </div>
  );
}

function SectionTitle({ title, subtitle }) {
  return <div className="client-section-title-row"><div><h2>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div></div>;
}

function KpiCard({ icon, title, value, subtext }) {
  return <div className="client-kpi-card"><div className="client-kpi-icon">{icon}</div><div className="client-kpi-title">{title}</div><div className="client-kpi-value">{value}</div>{subtext ? <div className="client-kpi-sub">{subtext}</div> : null}</div>;
}

function MetricBox({ title, value, icon }) {
  return <div className="client-metric-box"><div className="client-metric-icon">{icon}</div><div><div className="client-metric-title">{title}</div><div className="client-metric-value">{value}</div></div></div>;
}

function ComparisonCard({ title, explanation, withValue, withoutValue }) {
  const withNum = Number(withValue || 0);
  const withoutNum = Number(withoutValue || 0);
  const maxValue = Math.max(withNum, withoutNum, 1);
  return <div className="client-panel"><h3>{title}</h3>{explanation ? <p className="client-panel-subtitle">{explanation}</p> : null}<CompareBar label="עם המשך הפקדות" value={withNum} maxValue={maxValue} primary /><CompareBar label="ללא המשך הפקדות" value={withoutNum} maxValue={maxValue} /></div>;
}

function CompareBar({ label, value, maxValue, primary = false }) {
  const ratio = Math.max((Number(value || 0) / Number(maxValue || 1)) * 100, value ? 5 : 0);
  return <div className="client-compare-row"><div className="client-compare-top"><span>{label}</span><strong>{formatCurrency(value)}</strong></div><div className="client-compare-track"><div className={primary ? "client-compare-fill primary" : "client-compare-fill muted"} style={{ width: `${ratio}%` }} /></div></div>;
}

function ExposurePanel({ title, value, description }) {
  const safe = Math.max(0, Math.min(100, Number(value || 0)));
  return <div className="client-panel"><div className="client-exposure-top"><div><h3>{title}</h3><p className="client-panel-subtitle">{description}</p></div><strong>{formatPercent(safe)}</strong></div><div className="client-exposure-track"><div className="client-exposure-fill" style={{ width: `${safe}%` }} /></div><div className="client-exposure-scale"><span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div></div>;
}

function DonutCard({ title, items }) {
  const segments = buildSegments(items);
  const gradient = segments.length ? segments.map((seg) => `${seg.color} ${seg.start}% ${seg.end}%`).join(", ") : "#D7DEE7 0% 100%";
  return <div className="client-panel client-donut-panel"><h3>{title}</h3>{segments.length ? <div className="client-donut-layout"><div className="client-donut" style={{ background: `conic-gradient(${gradient})` }}><div className="client-donut-hole" /></div><div className="client-legend">{segments.slice(0, 7).map((seg) => <div key={seg.id || seg.name} className="client-legend-row"><span className="client-legend-dot" style={{ background: seg.color }} /><span className="client-legend-name">{seg.name}</span><strong>{Math.round(seg.percent)}%</strong></div>)}</div></div> : <div className="client-empty-state">אין נתונים להצגה</div>}</div>;
}

function TextPanel({ title, text }) {
  return <div className="client-panel"><h3>{title}</h3><div className="client-text-panel">{text}</div></div>;
}

function buildSegments(items) {
  const colors = ["#00215D", "#FF2756", "#1F77B4", "#43B5D9", "#8F63C9", "#F0B43C", "#9FD0E6", "#8FB996"];
  const safeItems = safeArray(items).filter((item) => Number(item?.value || 0) > 0);
  const total = safeItems.reduce((sum, item) => sum + Number(item.value || 0), 0);
  if (!safeItems.length || total <= 0) return [];
  let current = 0;
  return safeItems.map((item, index) => {
    const value = Number(item.value || 0);
    const percent = (value / total) * 100;
    const start = current;
    const end = current + percent;
    current = end;
    return { ...item, id: item.id || item.name || `segment-${index}`, name: item.name || item.label || "ללא שם", percent, start, end, color: colors[index % colors.length] };
  });
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

function ZviranMark() {
  return <div className="client-zviran-mark" aria-hidden="true"><span className="client-zviran-mark-red" /><span className="client-zviran-mark-white" /></div>;
}

function PiggyIcon() { return <svg width="30" height="30" viewBox="0 0 24 24" fill="none"><path d="M4 13C4 9.7 6.9 7 10.8 7H15.3C18.1 7 20 8.9 20 11.6V17H17.4L16.7 19H8.2L7.5 17H4V13Z" stroke="#00215D" strokeWidth="2" strokeLinejoin="round"/><path d="M8 7L6.7 4.8H10.3L11.4 7" stroke="#FF2756" strokeWidth="2" strokeLinejoin="round"/><path d="M16.2 10.8H16.25" stroke="#FF2756" strokeWidth="3" strokeLinecap="round"/></svg>; }
function GrowthIcon() { return <svg width="30" height="30" viewBox="0 0 24 24" fill="none"><path d="M4 18V9" stroke="#00215D" strokeWidth="2.2" strokeLinecap="round"/><path d="M10 18V5" stroke="#00215D" strokeWidth="2.2" strokeLinecap="round"/><path d="M16 18V12" stroke="#00215D" strokeWidth="2.2" strokeLinecap="round"/><path d="M3 19H21" stroke="#FF2756" strokeWidth="2.2" strokeLinecap="round"/></svg>; }
function WalletIcon() { return <svg width="30" height="30" viewBox="0 0 24 24" fill="none"><rect x="4" y="7" width="16" height="11" rx="3" stroke="#00215D" strokeWidth="2.2"/><path d="M17 12H20V16H17C15.9 16 15 15.1 15 14C15 12.9 15.9 12 17 12Z" stroke="#FF2756" strokeWidth="2.2"/><path d="M7 7L15 4" stroke="#00215D" strokeWidth="2.2" strokeLinecap="round"/></svg>; }
function BankIcon() { return <svg width="30" height="30" viewBox="0 0 24 24" fill="none"><path d="M4 10L12 5L20 10" stroke="#00215D" strokeWidth="2.2" strokeLinejoin="round"/><path d="M6 10V18" stroke="#00215D" strokeWidth="2.2" strokeLinecap="round"/><path d="M10 10V18" stroke="#00215D" strokeWidth="2.2" strokeLinecap="round"/><path d="M14 10V18" stroke="#00215D" strokeWidth="2.2" strokeLinecap="round"/><path d="M18 10V18" stroke="#00215D" strokeWidth="2.2" strokeLinecap="round"/><path d="M4 19H20" stroke="#FF2756" strokeWidth="2.2" strokeLinecap="round"/></svg>; }
function ShieldIcon() { return <svg width="30" height="30" viewBox="0 0 24 24" fill="none"><path d="M12 4L19 7V12C19 16.6 16.1 19.4 12 21C7.9 19.4 5 16.6 5 12V7L12 4Z" stroke="#00215D" strokeWidth="2.2" strokeLinejoin="round"/><path d="M9 12L11 14L15.5 9.5" stroke="#FF2756" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function PersonIcon() { return <svg width="30" height="30" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="7.5" r="3.5" stroke="#00215D" strokeWidth="2.2"/><path d="M5 20C5.7 16.7 8.2 14.8 12 14.8C15.8 14.8 18.3 16.7 19 20" stroke="#FF2756" strokeWidth="2.2" strokeLinecap="round"/></svg>; }

const clientDashboardCss = `
  * { box-sizing: border-box; }
  .client-web-shell { min-height: 100vh; background: ${theme.pageBg}; color: ${theme.text}; direction: rtl; font-family: Calibri, Arial, sans-serif; display: grid; grid-template-columns: 292px minmax(0, 1fr); }
  .client-sidebar { position: sticky; top: 0; height: 100vh; background: linear-gradient(180deg, ${theme.navyDark} 0%, ${theme.navy} 52%, #001733 100%); color: #fff; padding: 24px 16px; border-left: 1px solid rgba(255,255,255,0.08); overflow-y: auto; }
  .client-sidebar-brand { display: grid; grid-template-columns: 58px minmax(0, 1fr); gap: 12px; align-items: center; padding: 0 8px 24px; margin-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.14); }
  .client-zviran-mark { width: 54px; height: 54px; border-radius: 50%; background: rgba(255,255,255,0.14); border: 1px solid rgba(255,255,255,0.24); position: relative; flex-shrink: 0; }
  .client-zviran-mark-red, .client-zviran-mark-white { position: absolute; width: 24px; height: 8px; border-radius: 999px; left: 15px; transform: rotate(-35deg); }
  .client-zviran-mark-red { top: 15px; background: ${theme.accent}; } .client-zviran-mark-white { top: 25px; background: #fff; }
  .client-brand-title { font-size: 21px; line-height: 1.2; font-weight: 900; } .client-brand-subtitle { margin-top: 4px; font-size: 12px; color: rgba(255,255,255,0.72); }
  .client-sidebar-nav { display: flex; flex-direction: column; gap: 8px; padding-top: 8px; }
  .client-nav-item { width: 100%; min-height: 58px; border: 0; border-radius: 14px; padding: 0 14px; background: transparent; color: rgba(255,255,255,0.82); cursor: pointer; display: grid; grid-template-columns: 30px minmax(0, 1fr); gap: 12px; align-items: center; text-align: right; font-family: Calibri, Arial, sans-serif; font-size: 15px; font-weight: 800; transition: 0.18s ease; }
  .client-nav-item:hover, .client-nav-item.active { background: linear-gradient(135deg, ${theme.accent} 0%, ${theme.navy} 100%); color: #fff; box-shadow: 0 10px 24px rgba(255,39,86,0.18); transform: translateX(-2px); }
  .client-nav-icon { font-size: 21px; text-align: center; }
  .client-main { min-width: 0; padding: 24px 28px 36px; }
  .client-topbar { min-height: 108px; background: linear-gradient(135deg, ${theme.navy}, ${theme.navyDark}); color: #fff; border: 1px solid rgba(0,33,93,0.20); border-radius: 24px; padding: 20px 22px; box-shadow: 0 8px 28px rgba(0,33,93,0.14); display: flex; justify-content: space-between; gap: 18px; align-items: center; margin-bottom: 18px; }
  .client-topbar-eyebrow { color: rgba(255,255,255,0.76); font-size: 12px; font-weight: 800; margin-bottom: 7px; }
  .client-page-title { margin: 0; font-size: 30px; line-height: 1.2; color: #fff; font-weight: 900; } .client-page-subtitle { margin-top: 7px; color: rgba(255,255,255,0.86); font-size: 13px; font-weight: 700; }
  .client-topbar-actions { display: flex; align-items: stretch; gap: 12px; flex-wrap: wrap; justify-content: flex-end; }
  .client-history-button, .client-updated-box, .client-scope-select-wrap, .client-back-button { min-height: 54px; border-radius: 16px; background: rgba(255,255,255,0.11); border: 1px solid rgba(255,255,255,0.18); color: #fff; font-family: Calibri, Arial, sans-serif; }
  .client-history-button { min-width: 188px; padding: 8px 12px; display: grid; grid-template-columns: 34px minmax(0, 1fr); gap: 10px; align-items: center; text-align: right; cursor: pointer; }
  .client-history-button strong { display: block; color: #fff; font-size: 13px; line-height: 1.2; } .client-history-button small { display: block; color: rgba(255,255,255,0.72); margin-top: 3px; font-size: 10px; line-height: 1.2; }
  .client-history-icon { width: 34px; height: 34px; border-radius: 12px; background: rgba(255,255,255,0.14); display: flex; align-items: center; justify-content: center; color: ${theme.accent}; font-size: 20px; font-weight: 900; }
  .client-updated-box { padding: 8px 12px; display: flex; flex-direction: column; justify-content: center; gap: 3px; color: rgba(255,255,255,0.72); font-size: 11px; } .client-updated-box strong { color: #fff; font-size: 13px; }
  .client-scope-select-wrap { padding: 7px 12px; display: grid; grid-template-columns: auto minmax(150px, 1fr); gap: 10px; align-items: center; color: rgba(255,255,255,0.72); font-size: 12px; font-weight: 800; }
  .client-scope-select { min-height: 32px; border: 0; outline: 0; color: #fff; font-family: Calibri, Arial, sans-serif; font-size: 14px; font-weight: 900; background: transparent; cursor: pointer; } .client-scope-select option { color: ${theme.text}; background: #fff; }
  .client-back-button { padding: 0 16px; font-size: 13px; font-weight: 900; cursor: pointer; }
  .client-content-card { background: #fff; border: 1px solid ${theme.border}; border-radius: 24px; padding: 22px; box-shadow: 0 8px 26px rgba(16,42,67,0.05); min-height: calc(100vh - 174px); }
  .client-section-title-row { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; margin-bottom: 18px; } .client-section-title-row h2 { margin: 0; color: ${theme.navy}; font-size: 22px; line-height: 1.25; font-weight: 900; }
  .client-section-title-row p, .client-panel-subtitle { margin: 6px 0 0; color: ${theme.textSoft}; font-size: 13px; line-height: 1.6; }
  .client-kpi-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 14px; } .client-grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; } .client-grid-3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; } .client-margin-top { margin-top: 14px; }
  .client-kpi-card, .client-panel, .client-metric-box, .client-personal-card { border: 1px solid #E7D9CA; border-radius: 20px; background: linear-gradient(180deg, #fff 0%, ${theme.surfaceAlt} 100%); box-shadow: 0 2px 10px rgba(16,42,67,0.04); }
  .client-kpi-card { min-height: 184px; padding: 18px; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 8px; text-align: center; }
  .client-kpi-icon { width: 74px; height: 74px; border-radius: 22px; background: #F4F7FB; display: flex; align-items: center; justify-content: center; } .client-kpi-title { color: ${theme.textSoft}; font-size: 14px; font-weight: 800; } .client-kpi-value { color: ${theme.navy}; font-size: 32px; line-height: 1.1; font-weight: 900; direction: ltr; } .client-kpi-sub { color: #7A8CA8; font-size: 12px; line-height: 1.45; }
  .client-personal-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
  .client-personal-card { padding: 22px; min-height: 290px; }
  .client-personal-card-header { display: grid; grid-template-columns: 66px minmax(0, 1fr); gap: 14px; align-items: center; padding-bottom: 16px; margin-bottom: 16px; border-bottom: 1px solid ${theme.divider}; }
  .client-personal-avatar { width: 66px; height: 66px; border-radius: 22px; background: linear-gradient(135deg, ${theme.accent}, ${theme.navy}); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 900; }
  .client-personal-card-kicker { color: ${theme.textSoft}; font-size: 12px; font-weight: 900; margin-bottom: 4px; }
  .client-personal-card h3 { margin: 0; color: ${theme.navy}; font-size: 22px; line-height: 1.25; font-weight: 900; }
  .client-personal-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .client-personal-field { min-height: 76px; border: 1px solid ${theme.divider}; border-radius: 16px; background: #FFFFFF; padding: 13px 14px; display: flex; flex-direction: column; justify-content: center; gap: 6px; }
  .client-personal-field span { color: ${theme.textSoft}; font-size: 12px; font-weight: 800; }
  .client-personal-field strong { color: ${theme.navy}; font-size: 17px; font-weight: 900; line-height: 1.25; word-break: break-word; }
  .client-panel { padding: 18px; min-width: 0; } .client-panel h3 { margin: 0 0 10px; color: ${theme.navy}; font-size: 16px; line-height: 1.3; font-weight: 900; }
  .client-compare-row { margin-top: 14px; } .client-compare-top { display: flex; justify-content: space-between; gap: 12px; align-items: center; margin-bottom: 8px; color: ${theme.textSoft}; font-size: 13px; font-weight: 800; } .client-compare-top strong { color: ${theme.navy}; font-size: 17px; direction: ltr; }
  .client-compare-track, .client-exposure-track { height: 18px; border-radius: 999px; background: ${theme.softBlue}; overflow: hidden; } .client-compare-fill, .client-exposure-fill { height: 100%; border-radius: 999px; } .client-compare-fill.primary, .client-exposure-fill { background: linear-gradient(90deg, ${theme.accent}, ${theme.navy}); } .client-compare-fill.muted { background: ${theme.mutedBar}; }
  .client-exposure-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; margin-bottom: 14px; } .client-exposure-top strong { color: ${theme.navy}; font-size: 30px; line-height: 1; direction: ltr; } .client-exposure-scale { display: flex; justify-content: space-between; margin-top: 10px; color: ${theme.textSoft}; font-size: 12px; direction: ltr; }
  .client-metric-box { min-height: 126px; padding: 18px; display: grid; grid-template-columns: 58px minmax(0, 1fr); gap: 14px; align-items: center; } .client-metric-icon { width: 58px; height: 58px; border-radius: 18px; background: #F4F7FB; color: ${theme.navy}; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 900; } .client-metric-title { color: ${theme.textSoft}; font-size: 13px; font-weight: 800; margin-bottom: 8px; } .client-metric-value { color: ${theme.navy}; font-size: 23px; line-height: 1.15; font-weight: 900; direction: ltr; text-align: right; }
  .client-donut-layout { display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 18px; align-items: center; } .client-donut { width: 142px; height: 142px; border-radius: 50%; position: relative; box-shadow: inset 0 0 0 3px rgba(255,255,255,0.95), inset 0 -9px 16px rgba(0,0,0,0.08), 0 10px 20px rgba(0,33,93,0.08); } .client-donut-hole { position: absolute; inset: 30%; border-radius: 50%; background: #fff; box-shadow: inset 0 4px 8px rgba(0,33,93,0.04); }
  .client-legend { display: flex; flex-direction: column; gap: 9px; min-width: 0; } .client-legend-row { display: grid; grid-template-columns: 10px minmax(0, 1fr) auto; gap: 8px; align-items: center; color: ${theme.text}; font-size: 12px; } .client-legend-dot { width: 10px; height: 10px; border-radius: 50%; } .client-legend-name { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .client-table-wrap { overflow-x: auto; border: 1px solid ${theme.divider}; border-radius: 18px; background: #fff; }
  .client-table { width: 100%; min-width: 760px; border-collapse: collapse; table-layout: auto; }
  .client-table th { background: ${theme.navy}; color: #fff; padding: 12px 10px; font-size: 12px; text-align: right; white-space: nowrap; }
  .client-table td { padding: 12px 10px; border-bottom: 1px solid ${theme.divider}; color: ${theme.text}; font-size: 12px; white-space: nowrap; }
  .client-insurance-table { table-layout: fixed; min-width: 0; }
  .client-insurance-table.family { min-width: 860px; }
  .client-insurance-table.member { min-width: 720px; }
  .client-insurance-table th, .client-insurance-table td { vertical-align: middle; }
  .client-insurance-table .wide-col, .client-insurance-table .text-col { white-space: normal; overflow-wrap: anywhere; line-height: 1.45; }
  .client-insurance-table .policy-col, .client-insurance-table .money-col { direction: ltr; text-align: center; white-space: nowrap; }
  .client-insurance-table .client-insurance-col-memberName { width: 13%; }
  .client-insurance-table .client-insurance-col-planName { width: 22%; }
  .client-insurance-table .client-insurance-col-managerName { width: 19%; }
  .client-insurance-table .client-insurance-col-productType { width: 16%; }
  .client-insurance-table .client-insurance-col-policyNo { width: 13%; }
  .client-insurance-table .client-insurance-col-currentValue { width: 13%; }
  .client-insurance-table .client-insurance-col-deathCoverage { width: 12%; }
  .client-insurance-table.member .client-insurance-col-planName { width: 25%; }
  .client-insurance-table.member .client-insurance-col-managerName { width: 22%; }
  .client-insurance-table.member .client-insurance-col-productType { width: 17%; }
  .client-insurance-table.member .client-insurance-col-policyNo { width: 14%; }
  .client-insurance-table.member .client-insurance-col-currentValue { width: 11%; }
  .client-insurance-table.member .client-insurance-col-deathCoverage { width: 11%; }
  .client-empty-state { border: 1px dashed ${theme.border}; border-radius: 16px; background: ${theme.surfaceAlt}; padding: 18px; color: ${theme.textSoft}; font-size: 13px; text-align: center; line-height: 1.7; } .client-text-panel { min-height: 210px; border: 1px solid ${theme.divider}; border-radius: 16px; background: #FFFDFB; padding: 16px; color: ${theme.text}; font-size: 13px; line-height: 1.9; white-space: pre-wrap; }
  @media print { .client-web-shell { display: none !important; } }
  @media (max-width: 1180px) { .client-web-shell { grid-template-columns: 1fr; } .client-sidebar { position: relative; height: auto; display: block; border-left: 0; border-bottom: 1px solid rgba(255,255,255,0.12); } .client-sidebar-nav { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); } .client-main { padding: 18px; } .client-topbar { flex-direction: column; align-items: stretch; } .client-topbar-actions { justify-content: flex-start; } .client-kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .client-grid-3, .client-grid-2, .client-personal-grid { grid-template-columns: 1fr; } }
  @media (max-width: 720px) { .client-main { padding: 12px; } .client-sidebar { padding: 16px 12px; } .client-sidebar-nav { grid-template-columns: 1fr; } .client-kpi-grid { grid-template-columns: 1fr; } .client-content-card { padding: 16px; border-radius: 18px; } .client-topbar { padding: 16px; border-radius: 18px; } .client-page-title { font-size: 22px; } .client-donut-layout { grid-template-columns: 1fr; justify-items: center; } .client-scope-select-wrap, .client-history-button { grid-template-columns: 1fr; width: 100%; } .client-personal-fields { grid-template-columns: 1fr; } }
`;

const styles = {
  emptyPage: { minHeight: "100vh", direction: "rtl", fontFamily: 'Calibri, "Arial", sans-serif', background: theme.pageBg, color: theme.text, padding: 32, display: "flex", alignItems: "center", justifyContent: "center" },
  emptyCard: { width: "100%", maxWidth: 760, background: "#FFFFFF", border: `1px solid ${theme.border}`, borderRadius: 22, padding: 32, boxShadow: "0 10px 28px rgba(16,42,67,0.08)", textAlign: "center" },
  emptyTitle: { margin: "0 0 12px", color: theme.navy, fontSize: 28, lineHeight: 1.25, fontWeight: 800 },
  emptyText: { margin: "0 auto 22px", maxWidth: 560, color: theme.textSoft, fontSize: 15, lineHeight: 1.8 },
  secondaryButton: { minWidth: 150, minHeight: 42, padding: "10px 16px", borderRadius: 12, border: "1px solid #D9DDE8", background: "#FFFFFF", color: theme.text, fontWeight: 800, fontFamily: 'Calibri, "Arial", sans-serif', cursor: "pointer" },
};
