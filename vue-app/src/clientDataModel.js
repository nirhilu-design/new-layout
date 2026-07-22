export function buildClientFamilyDataModel(reportData) {
  const safe = reportData || {};

  const family = safe.family || {};
  const members = Array.isArray(safe.members) ? safe.members : [];
  const products = Array.isArray(safe.products) ? safe.products : [];
  const managers = Array.isArray(safe.managers) ? safe.managers : [];

  const weightedEquityExposure = Number(safe.weightedEquityExposure || 0);
  const weightedForeignExposure = Number(safe.weightedForeignExposure || 0);

  return {
    id: "family",
    type: "family",
    title: "תמונה משפחתית מאוחדת",
    lastUpdated: family.lastUpdated || "",
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
      totalInsurance: Number(family.totalInsurance || 0),
    },
    exposures: {
      equity: weightedEquityExposure,
      foreign: weightedForeignExposure,
    },
    distributions: {
      products: normalizeDistribution(products),
      managers: normalizeDistribution(managers),
      mainGroups: normalizeDistribution(safe.mainGroupAllocation || []),
      foreignExposure: normalizeDistribution(
        safe.foreignExposureAllocation || []
      ),
    },
    members: members.map((member, index) =>
      buildClientMemberModel(member, index, safe)
    ),
    loans: safe.loans || { hasData: false, details: [] },
    rawReportData: safe,
  };
}

function buildClientMemberModel(member, index, reportData) {
  const memberName = member?.name || `לקוח ${index + 1}`;

  const products = extractMemberProducts(memberName, reportData);
  const managers = buildManagersFromProducts(products);
  const mainGroups = buildMainGroupsFromProducts(products);
  const exposures = buildMemberExposures(products);

  const deathCoverage =
    member?.deathCoverage !== undefined && member?.deathCoverage !== null
      ? Number(member.deathCoverage || 0)
      : buildLifeCoverageDisplayAmount(products);

  return {
    id: createStableMemberId(memberName, index),
    type: "member",
    name: memberName,
    order: index + 1,
    summary: {
      totalAssets: Number(member?.assets || 0),
      monthlyDeposits: Number(member?.monthlyDeposits || 0),
      projectedLumpSumWithDeposits: Number(member?.lumpSumWithDeposits || 0),
      projectedLumpSumWithoutDeposits: Number(
        member?.lumpSumWithoutDeposits || 0
      ),
      monthlyPensionWithDeposits: Number(
        member?.monthlyPensionWithDeposits || 0
      ),
      monthlyPensionWithoutDeposits: Number(
        member?.monthlyPensionWithoutDeposits || 0
      ),
    },
    insurance: {
      deathCoverage,
      disabilityValue: Number(member?.disabilityValue || 0),
      disabilityPercent: Number(member?.disabilityPercent || 0),
    },
    exposures,
    distributions: {
      mainGroups,
    },
    products,
    managers,
    rawMember: member,
  };
}

function normalizeDistribution(items) {
  const safeItems = Array.isArray(items) ? items : [];

  const total = safeItems.reduce(
    (sum, item) => sum + Number(item?.value || 0),
    0
  );

  return safeItems.map((item, index) => {
    const value = Number(item?.value || 0);

    return {
      id: item?.id || `${item?.name || "item"}_${index}`,
      name: item?.name || "ללא שם",
      value,
      percent: total > 0 ? (value / total) * 100 : Number(item?.percent || 0),
    };
  });
}

function extractMemberProducts(memberName, reportData) {
  const rawFiles = Array.isArray(reportData?.rawParsedFiles)
    ? reportData.rawParsedFiles
    : [];

  const allPolicies = rawFiles.flatMap((file) => {
    const fileMemberName = file?.memberName || "";
    const fileMemberId = file?.parsedData?.member?.id || "";

    const policies = Array.isArray(file?.parsedData?.policies)
      ? file.parsedData.policies
      : [];

    return policies.map((policy, index) => ({
      ...policy,
      ownerName: fileMemberName,
      ownerId: fileMemberId,
      internalIndex: index,
    }));
  });

  const memberPolicies = allPolicies.filter(
    (policy) =>
      String(policy.ownerName || "").trim() === String(memberName || "").trim()
  );

  return memberPolicies.map((policy, index) => {
    const currentValue = Number(policy?.savings?.totalAccumulated || 0);

    const monthlyDeposit = Number(
      policy?.monthlyDeposits?.sumCost ||
        policy?.monthlyDeposits?.worker ||
        0
    );

    const hCoeff = policy?.savings?.hCoeff;

    return {
      id:
        policy.policyNo ||
        `${createStableMemberId(memberName, index)}_${policy.rowNum || index}`,

      planName:
        policy.planName ||
        policy.productType ||
        policy.details?.proposeName ||
        "מוצר פנסיוני",

      managerName: policy.managerName || "—",

      productType: policy.productType || policy.details?.proposeName || "—",

      policyNo: policy.policyNo || "—",

      currentValue,

      monthlyDeposit,

      projectedLumpSumWithDeposits: Number(policy?.savings?.totalPidions || 0),

      projectedLumpSumWithoutDeposits: Number(
        policy?.savings?.retireCurrBalance || 0
      ),

      projectedMonthlyPension: Number(
        policy?.savings?.pensionRetire ||
          policy?.savings?.projectedMonthlyPension ||
          0
      ),

      hCoeff,

      joinDate: policy.joinDate || null,

      retireAge: policy?.details?.retireAge || null,

      managementFeeFromDeposit: Number(
        policy?.details?.managementFeeFromDeposit || 0
      ),

      managementFeeFromBalance: Number(
        policy?.details?.managementFeeFromBalance || 0
      ),

      equityExposure: getPolicyEquityExposure(policy),

      foreignExposure: getPolicyForeignExposure(policy),

      coverage: {
        totalInsurance: Number(policy?.coverage?.totalInsurance || 0),
        totalRisk: Number(policy?.coverage?.totalRisk || 0),
        disabilityPension: Number(policy?.coverage?.disabilityPension || 0),
      },

      mainGroups: getPolicyMainGroups(policy),

      isNoCoeff: isNoCoeffPolicy(policy),

      isPensionFund: isPensionFundPolicy(policy),

      isLifeInsurance: isLifeInsurancePolicy(policy),

      raw: policy,
    };
  });
}

function buildManagersFromProducts(products) {
  const safeProducts = Array.isArray(products) ? products : [];
  const map = new Map();

  safeProducts.forEach((product) => {
    const name = product.managerName || "—";
    const value = Number(product.currentValue || 0);

    if (!map.has(name)) {
      map.set(name, {
        id: name,
        name,
        value: 0,
      });
    }

    map.get(name).value += value;
  });

  const managers = Array.from(map.values());
  const total = managers.reduce((sum, manager) => sum + manager.value, 0);

  return managers.map((manager) => ({
    ...manager,
    percent: total > 0 ? (manager.value / total) * 100 : 0,
  }));
}

function buildMainGroupsFromProducts(products) {
  const safeProducts = Array.isArray(products) ? products : [];
  const map = new Map();

  safeProducts.forEach((product) => {
    const productValue = Number(product.currentValue || 0);
    if (productValue <= 0) return;

    const groups = Array.isArray(product.mainGroups) ? product.mainGroups : [];
    if (!groups.length) return;

    groups.forEach((group) => {
      const rate = Number(group.rate || 0);
      if (!group.name || rate <= 0) return;

      const value = productValue * (rate / 100);
      const key = `${group.id || ""}|${group.name}`;

      if (!map.has(key)) {
        map.set(key, {
          id: group.id || key,
          name: group.name,
          value: 0,
        });
      }

      map.get(key).value += value;
    });
  });

  const items = Array.from(map.values()).filter((item) => item.value > 0);
  const total = items.reduce((sum, item) => sum + item.value, 0);

  return items
    .map((item) => ({
      ...item,
      percent: total > 0 ? (item.value / total) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);
}

function buildMemberExposures(products) {
  const safeProducts = Array.isArray(products) ? products : [];

  const totalValue = safeProducts.reduce(
    (sum, product) => sum + Number(product.currentValue || 0),
    0
  );

  if (totalValue <= 0) {
    return {
      equity: 0,
      foreign: 0,
    };
  }

  const weightedEquity =
    safeProducts.reduce(
      (sum, product) =>
        sum +
        Number(product.currentValue || 0) * Number(product.equityExposure || 0),
      0
    ) / totalValue;

  const weightedForeign =
    safeProducts.reduce(
      (sum, product) =>
        sum +
        Number(product.currentValue || 0) * Number(product.foreignExposure || 0),
      0
    ) / totalValue;

  return {
    equity: weightedEquity,
    foreign: weightedForeign,
  };
}

function getPolicyEquityExposure(policy) {
  const investPlans = Array.isArray(policy?.investPlans)
    ? policy.investPlans
    : [];

  if (!investPlans.length) return 0;

  const total = investPlans.reduce(
    (sum, plan) => sum + Number(plan?.equityExposure || 0),
    0
  );

  return total / investPlans.length;
}

function getPolicyForeignExposure(policy) {
  const investPlans = Array.isArray(policy?.investPlans)
    ? policy.investPlans
    : [];

  if (!investPlans.length) return 0;

  const total = investPlans.reduce(
    (sum, plan) => sum + Number(plan?.foreignExposure || 0),
    0
  );

  return total / investPlans.length;
}

function getPolicyMainGroups(policy) {
  const investPlans = Array.isArray(policy?.investPlans)
    ? policy.investPlans
    : [];

  return investPlans.flatMap((plan) =>
    Array.isArray(plan?.mainGroups) ? plan.mainGroups : []
  );
}

function getPolicyText(policyOrProduct) {
  return [
    policyOrProduct?.productType,
    policyOrProduct?.planName,
    policyOrProduct?.details?.proposeName,
    policyOrProduct?.details?.targetPlan,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function isPensionFundPolicy(policyOrProduct) {
  const text = getPolicyText(policyOrProduct);

  return (
    text.includes("קרן פנסיה") ||
    text.includes("פנסיה מקיפה") ||
    text.includes("פנסיה כללית") ||
    text.includes("פנסיה חדשה") ||
    text.includes("פנסיה ותיקה")
  );
}

function isLifeInsurancePolicy(policyOrProduct) {
  if (isPensionFundPolicy(policyOrProduct)) return false;

  const text = getPolicyText(policyOrProduct).toLowerCase();

  return (
    text.includes("ביטוח חיים") ||
    text.includes("ריסק") ||
    text.includes("risk")
  );
}

function isNoCoeffPolicy(policyOrProduct) {
  const coeff =
    policyOrProduct?.hCoeff ??
    policyOrProduct?.savings?.hCoeff ??
    policyOrProduct?.raw?.savings?.hCoeff;

  return coeff === null || coeff === undefined || Number(coeff) === 0;
}

/**
 * כלל ביטוח חיים להצגה:
 * 1. TotalPidions לכל מוצר שאין לו HCoff
 * 2. ועוד TotalBituah רק למוצר שנקרא ביטוח חיים / ריסק
 */
function buildLifeCoverageDisplayAmount(products) {
  const safeProducts = Array.isArray(products) ? products : [];

  const noCoeffPidions = safeProducts.reduce((sum, product) => {
    if (!isNoCoeffPolicy(product)) return sum;
    return sum + Number(product.projectedLumpSumWithDeposits || 0);
  }, 0);

  const actualLifeInsurance = safeProducts.reduce((sum, product) => {
    if (!product.isLifeInsurance) return sum;
    return sum + Number(product.coverage?.totalInsurance || 0);
  }, 0);

  return noCoeffPidions + actualLifeInsurance;
}

function createStableMemberId(name, index) {
  const cleanName = String(name || "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\u0590-\u05FFa-zA-Z0-9_]/g, "");

  return cleanName ? `member_${cleanName}` : `member_${index + 1}`;
}
