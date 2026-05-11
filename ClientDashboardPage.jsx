import React, { useEffect, useMemo, useRef, useState } from "react";
import ClientFamilyView from "./ClientFamilyView";
import ClientMemberView from "./ClientMemberView";

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeDistributionItems(items) {
  return safeArray(items)
    .map((item, index) => ({
      id: item?.id || item?.name || `distribution-${index}`,
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
      products,
      managers,
      mainGroups: mainGroupAllocation,
      mainGroupAllocation,
      assetClasses: mainGroupAllocation,
      foreignExposureAllocation: normalizeDistributionItems(
        data.foreignExposureAllocation
      ),
    },

    members: safeArray(data.members).map((member, index) => ({
      id: member?.id || member?.name || `member-${index}`,
      name: member?.name || "ללא שם",

      summary: {
        totalAssets: Number(member?.assets || member?.totalAssets || 0),
        monthlyDeposits: Number(member?.monthlyDeposits || 0),
        monthlyPensionWithDeposits: Number(
          member?.monthlyPensionWithDeposits || 0
        ),
        monthlyPensionWithoutDeposits: Number(
          member?.monthlyPensionWithoutDeposits || 0
        ),
        projectedLumpSumWithDeposits: Number(
          member?.lumpSumWithDeposits ||
            member?.projectedLumpSumWithDeposits ||
            0
        ),
        projectedLumpSumWithoutDeposits: Number(
          member?.lumpSumWithoutDeposits ||
            member?.projectedLumpSumWithoutDeposits ||
            0
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

  if (!plans.length) {
    return 0;
  }

  const total = plans.reduce((sum, plan) => {
    const value = Number(
      key === "equity"
        ? plan?.equityExposure || 0
        : plan?.foreignExposure || 0
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
      id:
        policy?.policyNo ||
        `${rawFile?.memberName || "member"}-${policy?.rowNum || index}`,
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
        policy?.savings?.projectedMonthlyPension ||
          policy?.savings?.pensionRetire ||
          0
      ),
      managementFeeFromBalance: Number(
        policy?.details?.managementFeeFromBalance || 0
      ),
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
              sum +
              Number(product.currentValue || 0) *
                Number(product.equityExposure || 0),
            0
          ) / totalProductsValue
        : 0;

    const weightedForeign =
      totalProductsValue > 0
        ? products.reduce(
            (sum, product) =>
              sum +
              Number(product.currentValue || 0) *
                Number(product.foreignExposure || 0),
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
      exposures: {
        equity: Math.round(weightedEquity),
        foreign: Math.round(weightedForeign),
      },
    };
  });
}

function findSelectedMember(members, selectedMemberId) {
  if (!members.length) return null;

  if (!selectedMemberId) return members[0];

  const wanted = String(selectedMemberId);

  return (
    members.find(
      (member) =>
        String(member?.id || "") === wanted ||
        String(member?.name || "") === wanted
    ) || members[0]
  );
}

function EmptyDashboardState({ onBack }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        direction: "rtl",
        fontFamily: 'Calibri, "Arial", sans-serif',
        background: "#F9F7F3",
        color: "#102A43",
        padding: 32,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 760,
          background: "#FFFFFF",
          border: "1px solid #E2D1BF",
          borderRadius: 22,
          padding: 32,
          boxShadow: "0 10px 28px rgba(16,42,67,0.08)",
          boxSizing: "border-box",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            margin: "0 0 12px",
            color: "#00215D",
            fontSize: 28,
            lineHeight: 1.25,
            fontWeight: 800,
          }}
        >
          אין נתוני דוח להצגה
        </h1>

        <p
          style={{
            margin: "0 auto 22px",
            maxWidth: 560,
            color: "#627D98",
            fontSize: 15,
            lineHeight: 1.8,
          }}
        >
          מסך הלקוח מקבל את הנתונים ישירות מהדוח שנוצר במערכת. חזור למסך הדוח
          או הפק דוח חדש.
        </p>

        <button type="button" onClick={onBack} style={topButton}>
          חזרה
        </button>
      </div>
    </div>
  );
}

function ClientNavigationMenu({
  viewMode,
  members,
  selectedMemberId,
  onBack,
  onChangeView,
  isSharedMode,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const closeOnOutsideClick = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("touchstart", closeOnOutsideClick);

    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("touchstart", closeOnOutsideClick);
    };
  }, []);

  const selectedLabel =
    viewMode === "member"
      ? members.find(
          (member) =>
            String(member?.id || member?.name) === String(selectedMemberId)
        )?.name || "דוח פרט"
      : "דוח משפחתי";

  return (
    <div className="client-nav-bar">
      {!isSharedMode ? (
        <button type="button" onClick={onBack} className="client-nav-button">
          חזרה לדוח הראשי
        </button>
      ) : null}

      <div className="client-menu-wrap" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((value) => !value)}
          className="client-nav-button client-nav-menu-button"
          aria-label="בחירת דוח"
          title="בחירת דוח"
        >
          <span className="client-hamburger-lines" aria-hidden="true" />
          <span>{selectedLabel}</span>
        </button>

        {menuOpen ? (
          <div className="client-menu-panel">
            <div className="client-menu-title">בחירת דוח</div>
            <div className="client-menu-subtitle">
              אפשר לעבור בין הדוח המשפחתי לדוחות הפרט.
            </div>

            <button
              type="button"
              className="client-menu-member-row"
              onClick={() => {
                onChangeView("family", null);
                setMenuOpen(false);
              }}
            >
              <span className="client-menu-member-name">דוח משפחתי</span>
              <span className="client-menu-member-arrow">›</span>
            </button>

            {members.length ? (
              members.map((member) => (
                <button
                  key={member.id || member.name}
                  type="button"
                  className="client-menu-member-row"
                  onClick={() => {
                    onChangeView("member", member.id || member.name);
                    setMenuOpen(false);
                  }}
                >
                  <span className="client-menu-member-name">
                    {member.name || "ללא שם"}
                  </span>
                  <span className="client-menu-member-arrow">›</span>
                </button>
              ))
            ) : (
              <div className="client-menu-empty">אין בני משפחה להצגה.</div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

const topButton = {
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
};

export default function ClientDashboardPage({
  reportData,
  onBack = () => {},
  isSharedMode = false,
  viewMode = "family",
  selectedMemberId = null,
  onChangeView = () => {},
}) {
  const clientModel = useMemo(
    () => buildClientModelFromReportData(reportData),
    [reportData]
  );

  const detailedMembers = useMemo(
    () => buildDetailedMembers(reportData, clientModel),
    [reportData, clientModel]
  );

  const selectedMember = findSelectedMember(detailedMembers, selectedMemberId);

  if (!reportData || !reportData.family) {
    return <EmptyDashboardState onBack={onBack} />;
  }

  return (
    <div className="client-dashboard-shell">
      <style>
        {`
          .client-dashboard-shell {
            background: #F9F7F3;
            min-height: 100vh;
            padding: 16px;
            direction: rtl;
            font-family: Calibri, Arial, sans-serif;
          }

          .client-nav-bar {
            max-width: 1280px;
            margin: 0 auto 16px;
            padding: 0 8px;
            display: flex;
            justify-content: flex-start;
            align-items: center;
            gap: 12px;
            flex-wrap: wrap;
            direction: rtl;
          }

          .client-nav-button {
            min-width: 150px;
            min-height: 42px;
            padding: 10px 16px;
            border-radius: 12px;
            border: 1px solid #D9DDE8;
            background: #FFFFFF;
            color: #102A43;
            font-weight: 800;
            font-family: Calibri, Arial, sans-serif;
            cursor: pointer;
            transition: all 0.18s ease;
          }

          .client-nav-button:hover {
            border-color: #00215D;
            color: #00215D;
            transform: translateY(-1px);
          }

          .client-nav-menu-button {
            min-width: 190px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
          }

          .client-menu-wrap {
            position: relative;
            display: inline-flex;
            z-index: 10000;
          }

          .client-hamburger-lines {
            width: 20px;
            height: 14px;
            display: inline-block;
            flex: 0 0 auto;
            background:
              linear-gradient(#00215D, #00215D) 0 0 / 20px 2px no-repeat,
              linear-gradient(#00215D, #00215D) 0 6px / 20px 2px no-repeat,
              linear-gradient(#00215D, #00215D) 0 12px / 20px 2px no-repeat;
          }

          .client-menu-panel {
            position: absolute;
            top: 54px;
            right: 0;
            left: auto;
            width: 292px;
            max-width: calc(100vw - 28px);
            background: #FFFFFF;
            border: 1px solid #E7D9CA;
            border-radius: 22px;
            box-shadow: 0 24px 54px rgba(0, 33, 93, 0.18);
            padding: 14px;
            z-index: 99999;
            text-align: right;
            direction: rtl;
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
            color: #00215D;
            font-size: 14px;
            font-weight: 900;
            margin: 0 0 4px;
            padding: 2px 2px 0;
          }

          .client-menu-subtitle {
            color: #627D98;
            font-size: 11px;
            line-height: 1.55;
            margin: 0 0 12px;
            padding: 0 2px 10px;
            border-bottom: 1px solid #EEE4D8;
          }

          .client-menu-member-row {
            width: 100%;
            border: 1px solid #EEE4D8;
            background: linear-gradient(180deg, #FFFFFF 0%, #FCFBF8 100%);
            border-radius: 14px;
            min-height: 48px;
            padding: 0 14px;
            margin: 0 0 9px;
            display: grid;
            grid-template-columns: minmax(0, 1fr) 24px;
            gap: 10px;
            align-items: center;
            cursor: pointer;
            font-family: Calibri, Arial, sans-serif;
            text-align: right;
            transition: all 0.16s ease;
          }

          .client-menu-member-row:hover {
            border-color: #00215D;
            background: #F4F7FB;
            transform: translateY(-1px);
            box-shadow: 0 8px 18px rgba(0, 33, 93, 0.08);
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
            font-size: 14px;
            font-weight: 900;
          }

          .client-menu-member-arrow {
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background: #EAF1FB;
            color: #00215D;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
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

          @media print {
            .client-no-print,
            .client-nav-bar {
              display: none !important;
            }

            .client-dashboard-shell {
              padding: 0 !important;
              background: #FFFFFF !important;
            }
          }
        `}
      </style>

      <ClientNavigationMenu
        viewMode={viewMode}
        members={detailedMembers}
        selectedMemberId={selectedMemberId}
        onBack={onBack}
        onChangeView={onChangeView}
        isSharedMode={isSharedMode}
      />

      {viewMode === "member" ? (
        <ClientMemberView member={selectedMember} />
      ) : (
        <ClientFamilyView clientModel={clientModel} />
      )}
    </div>
  );
}
