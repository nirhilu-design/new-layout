import {
  defineComponent,
  ref,
  computed,
  watch,
  onMounted,
  onBeforeUnmount,
  nextTick,
  Fragment,
} from "vue";
import { px } from "../px";
import { PrintReportA4 } from "./ReportPage.jsx";

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

function formatSignedPercent(value, decimals = 2) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "—";
  return `${number.toLocaleString("he-IL", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}%`;
}

function formatDecimal(value, decimals = 2) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "—";
  return number.toLocaleString("he-IL", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function weightedAverage(items, valueKey, weightKey = "allocatedValue") {
  const rows = safeArray(items).filter((item) => Number(item?.[weightKey] || 0) > 0 && Number.isFinite(Number(item?.[valueKey])));
  const totalWeight = rows.reduce((sum, item) => sum + Number(item[weightKey] || 0), 0);
  if (totalWeight <= 0) return 0;
  return rows.reduce((sum, item) => sum + Number(item[valueKey] || 0) * Number(item[weightKey] || 0), 0) / totalWeight;
}

function formatDate(value) {
  if (!value) return "—";
  const str = String(value).trim();
  if (!str) return "—";
  // YYYYMMDD
  if (/^\d{8}$/.test(str)) return `${str.slice(6, 8)}/${str.slice(4, 6)}/${str.slice(0, 4)}`;
  // ISO YYYY-MM-DD (optionally with time) — parse as string to avoid timezone shifts
  const iso = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[3].padStart(2, "0")}/${iso[2].padStart(2, "0")}/${iso[1]}`;
  // D.M.YYYY / D-M-YYYY / D/M/YYYY — normalize the separator to a slash
  const parts = str.split(/[.\-/]/).filter(Boolean);
  if (parts.length === 3 && parts.every((part) => /^\d+$/.test(part))) {
    return `${parts[0].padStart(2, "0")}/${parts[1].padStart(2, "0")}/${parts[2]}`;
  }
  const date = new Date(str);
  if (Number.isNaN(date.getTime())) return str;
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
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


function hasMeaningfulValue(value, depth = 0) {
  if (value === null || value === undefined || depth > 5) return false;
  if (typeof value === "number") return Number.isFinite(value) && value !== 0;
  if (typeof value === "string") {
    const clean = value.trim();
    if (!clean || clean === "—" || clean === "-") return false;
    const numeric = Number(clean.replace(/[₪,%\s,]/g, ""));
    return clean.length > 0 && (Number.isNaN(numeric) || numeric !== 0);
  }
  if (typeof value === "boolean") return value === true;
  if (Array.isArray(value)) return value.some((item) => hasMeaningfulValue(item, depth + 1));
  if (typeof value === "object") return Object.values(value).some((item) => hasMeaningfulValue(item, depth + 1));
  return false;
}

function findFirstMeaningfulValueByPath(source, paths) {
  for (const path of paths) {
    const value = path.split(".").reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), source);
    if (hasMeaningfulValue(value)) return value;
  }
  return null;
}

function findFirstObjectByKeyHints(source, keyHints, depth = 0, visited = new Set()) {
  if (!source || typeof source !== "object" || depth > 5 || visited.has(source)) return null;
  visited.add(source);

  if (!Array.isArray(source)) {
    for (const [key, value] of Object.entries(source)) {
      const normalizedKey = String(key || "").toLowerCase();
      if (keyHints.some((hint) => normalizedKey.includes(String(hint).toLowerCase())) && hasMeaningfulValue(value)) {
        return value;
      }
    }
  }

  const children = Array.isArray(source) ? source : Object.values(source);
  for (const child of children) {
    const found = findFirstObjectByKeyHints(child, keyHints, depth + 1, visited);
    if (found) return found;
  }

  return null;
}


function getOwnerLabelFromKey(owner, fallbackLabel = "בן/בת זוג") {
  if (owner === "spouseA") return "מבוטח/ת ראשית";
  if (owner === "spouseB") return "בן/בת זוג";
  return fallbackLabel || "בן/בת זוג";
}

function hasSection28Rows(entry) {
  return safeArray(entry?.groups).length > 0 || safeArray(entry?.comparisonRows).length > 0;
}

function normalizeSection28SectionsForClient(data) {
  const sourceData = data?.sourceReportData || {};
  const raw = data?.section28Capping || sourceData?.section28Capping || null;

  const normalizeEntry = (entry, fallbackOwner = "spouseA") => {
    const owner = entry?.owner === "spouseB" || fallbackOwner === "spouseB" ? "spouseB" : "spouseA";
    return {
      ...(entry || {}),
      owner,
      ownerLabel: entry?.ownerLabel || getOwnerLabelFromKey(owner),
      sourceFileName: entry?.sourceFileName || "",
      sheetName: entry?.sheetName || "",
      groups: safeArray(entry?.groups),
      comparisonRows: safeArray(entry?.comparisonRows),
    };
  };

  const direct = Array.isArray(raw)
    ? raw.map((entry) => normalizeEntry(entry)).filter(hasSection28Rows)
    : raw && typeof raw === "object" && hasSection28Rows(raw)
    ? [normalizeEntry(raw, raw.owner === "spouseB" ? "spouseB" : "spouseA")]
    : [];

  if (direct.length) return direct;

  return [
    ...safeArray(data?.spouseA_section28Capping || sourceData?.spouseA_section28Capping).map((entry) => normalizeEntry(entry, "spouseA")),
    ...safeArray(data?.spouseB_section28Capping || sourceData?.spouseB_section28Capping).map((entry) => normalizeEntry(entry, "spouseB")),
  ].filter(hasSection28Rows);
}

function hasRecognizedPensionRows(entry) {
  return safeArray(entry?.vestedBalanceTable?.rows).length > 0 || safeArray(entry?.recognizedPensionAdjustments).length > 0;
}

function normalizeRecognizedPensionSectionsForClient(data) {
  const sourceData = data?.sourceReportData || {};
  const topTable = data?.vestedBalanceTable || sourceData?.vestedBalanceTable || null;
  const topAdjustments = safeArray(data?.recognizedPensionAdjustments || sourceData?.recognizedPensionAdjustments);

  const normalizeEntry = (entry, fallbackOwner = "spouseA") => {
    const table = entry?.vestedBalanceTable || entry?.table || entry || null;
    const owner =
      entry?.owner === "spouseB" ||
      table?.owner === "spouseB" ||
      fallbackOwner === "spouseB"
        ? "spouseB"
        : "spouseA";
    return {
      owner,
      ownerLabel: entry?.ownerLabel || table?.ownerLabel || getOwnerLabelFromKey(owner),
      vestedBalanceTable: table && safeArray(table?.rows).length ? { ...table, owner, ownerLabel: entry?.ownerLabel || table?.ownerLabel || getOwnerLabelFromKey(owner) } : null,
      recognizedPensionAdjustments: safeArray(entry?.recognizedPensionAdjustments || entry?.adjustments),
    };
  };

  const entries = [];
  const spouseATable = data?.spouseA_vestedBalanceTable || sourceData?.spouseA_vestedBalanceTable || null;
  const spouseBTable = data?.spouseB_vestedBalanceTable || sourceData?.spouseB_vestedBalanceTable || null;
  const spouseAAdjustments = safeArray(data?.spouseA_recognizedPensionAdjustments || sourceData?.spouseA_recognizedPensionAdjustments);
  const spouseBAdjustments = safeArray(data?.spouseB_recognizedPensionAdjustments || sourceData?.spouseB_recognizedPensionAdjustments);

  if (spouseATable || spouseAAdjustments.length) {
    entries.push(normalizeEntry({ vestedBalanceTable: spouseATable, recognizedPensionAdjustments: spouseAAdjustments, owner: "spouseA" }, "spouseA"));
  }
  if (spouseBTable || spouseBAdjustments.length) {
    entries.push(normalizeEntry({ vestedBalanceTable: spouseBTable, recognizedPensionAdjustments: spouseBAdjustments, owner: "spouseB" }, "spouseB"));
  }

  if (entries.filter(hasRecognizedPensionRows).length) return entries.filter(hasRecognizedPensionRows);

  if (topTable || topAdjustments.length) {
    const owner = topTable?.owner || data?.recognizedPensionOwner || sourceData?.recognizedPensionOwner || "spouseA";
    const ownerLabel = topTable?.ownerLabel || data?.recognizedPensionOwnerLabel || sourceData?.recognizedPensionOwnerLabel || getOwnerLabelFromKey(owner);
    const filteredAdjustments = topAdjustments.filter((item) => !item?.owner || item.owner === owner);
    return [
      {
        owner,
        ownerLabel,
        vestedBalanceTable: topTable ? { ...topTable, owner, ownerLabel } : null,
        recognizedPensionAdjustments: filteredAdjustments.length ? filteredAdjustments : topAdjustments,
      },
    ].filter(hasRecognizedPensionRows);
  }

  return [];
}

function buildSpecialSectionsModel(reportData) {
  const data = reportData || {};
  const sourceData = data.sourceReportData || {};
  const capitalClassification = data.capitalClassification || sourceData.capitalClassification || [];
  const spouseAPensionFunds = data.spouseA_pension_funds || sourceData.spouseA_pension_funds || [];
  const spouseAStudyFunds = data.spouseA_study_funds || sourceData.spouseA_study_funds || [];
  const spouseBPensionFunds = data.spouseB_pension_funds || sourceData.spouseB_pension_funds || [];
  const spouseBStudyFunds = data.spouseB_study_funds || sourceData.spouseB_study_funds || [];

  const section28Entries = normalizeSection28SectionsForClient(data);
  const recognizedPensionEntries = normalizeRecognizedPensionSectionsForClient(data);
  const capitalSections = normalizeCapitalClassificationSections({
    capitalClassification,
    spouseAPensionFunds,
    spouseAStudyFunds,
    spouseBPensionFunds,
    spouseBStudyFunds,
  });

  const hasSection28 = section28Entries.length > 0;
  const hasRecognizedPension = recognizedPensionEntries.length > 0;
  const hasCapitalClassification = capitalSections.some(
    (section) => safeArray(section.pensionPolicies).length > 0 || safeArray(section.studyFunds).length > 0
  );

  return {
    hasSection28,
    hasRecognizedPension,
    hasCapitalClassification,
    hasAny: hasSection28 || hasRecognizedPension || hasCapitalClassification,
    section28Capping: section28Entries,
    vestedBalanceTable: recognizedPensionEntries[0]?.vestedBalanceTable || null,
    recognizedPensionAdjustments: recognizedPensionEntries[0]?.recognizedPensionAdjustments || [],
    recognizedPensionEntries,
    capitalClassification: capitalSections,
    section28Data: section28Entries,
    recognizedPensionData: recognizedPensionEntries,
  };
}

function formatTechnicalLabel(key) {
  const labels = {
    exemptPayments: "תשלומים פטורים",
    exemptPaymentsTotal: "סה״כ תשלומים פטורים",
    recognizedPension: "קצבה מוכרת",
    section28: "סעיף 28",
    employee: "עובד",
    employer: "מעסיק",
    total: "סה״כ",
    gap: "פער",
    difference: "הפרש",
    company: "חברה",
    insuranceCompany: "חברת ביטוח",
    manualValue: "נתון ידני",
    calculatedValue: "נתון מחושב",
    hasSection28: "קיים סעיף 28",
    hasRecognizedPension: "קיימת קצבה מוכרת",
    note: "הערה",
  };

  return labels[key] || String(key || "")
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .trim();
}

function formatDisplayValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "כן" : "לא";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "—";
    return Math.abs(value) >= 1000 ? formatCurrency(value) : value.toLocaleString("he-IL");
  }
  if (typeof value === "string") return value;
  return "";
}

function extractPrimitiveRows(data, maxRows = 14) {
  const rows = [];

  function walk(value, prefix = "", depth = 0) {
    if (rows.length >= maxRows || value === null || value === undefined || depth > 3) return;

    if (typeof value !== "object") {
      if (hasMeaningfulValue(value)) rows.push({ key: prefix || "value", value });
      return;
    }

    if (Array.isArray(value)) {
      value.slice(0, 4).forEach((item, index) => walk(item, `${prefix} ${index + 1}`.trim(), depth + 1));
      return;
    }

    Object.entries(value).forEach(([key, child]) => {
      const nextKey = prefix ? `${prefix} · ${formatTechnicalLabel(key)}` : formatTechnicalLabel(key);
      if (child !== null && typeof child === "object") {
        walk(child, nextKey, depth + 1);
      } else if (hasMeaningfulValue(child)) {
        rows.push({ key: nextKey, value: child });
      }
    });
  }

  walk(data);
  return rows;
}

function extractArrayTables(data) {
  const tables = [];

  function walk(value, prefix = "", depth = 0) {
    if (!value || depth > 3) return;

    if (Array.isArray(value) && value.length && value.some((item) => item && typeof item === "object")) {
      const rows = value.filter((item) => item && typeof item === "object").slice(0, 12);
      const columns = Array.from(
        new Set(rows.flatMap((row) => Object.keys(row || {}).filter((key) => typeof row[key] !== "object").slice(0, 8)))
      ).slice(0, 8);

      if (columns.length) {
        tables.push({
          title: prefix || "פירוט",
          columns,
          rows,
        });
      }
      return;
    }

    if (typeof value === "object" && !Array.isArray(value)) {
      Object.entries(value).forEach(([key, child]) => {
        if (Array.isArray(child) || (child && typeof child === "object")) {
          walk(child, prefix ? `${prefix} · ${formatTechnicalLabel(key)}` : formatTechnicalLabel(key), depth + 1);
        }
      });
    }
  }

  walk(data);
  return tables.slice(0, 4);
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

function hasActivePolicyDeposits(policy) {
  const deposits = policy?.monthlyDeposits || {};
  return [deposits.sumCost, deposits.worker, deposits.employer, deposits.compensation].some(
    (value) => Number(value || 0) > 0
  );
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

  const rawGender = getFirstText([
    member?.personalDetails?.gender,
    member?.gender,
    rawDetails?.gender,
    rawDetails?.Gender,
    rawDetails?.sex,
    rawDetails?.Sex,
  ]).toLowerCase();
  const gender =
    rawGender === "female" || rawGender === "נקבה" || rawGender === "f" || rawGender === "2"
      ? "female"
      : rawGender === "male" || rawGender === "זכר" || rawGender === "m" || rawGender === "1"
      ? "male"
      : "";

  return {
    name,
    birthDate,
    lastWorkplace,
    currentSalary,
    gender,
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
      managementFeeFromDeposit: Number(policy?.details?.managementFeeFromDeposit || 0),
      expectedReturn: Number(policy?.details?.expectedReturn || 0),
      equityExposure: getPlanWeightedExposure(policy, "equity"),
      foreignExposure: getPlanWeightedExposure(policy, "foreign"),
      investmentRoutes: safeArray(policy?.investPlans).map((plan, planIndex) => ({
        id: plan?.mofid || `${policy?.policyNo || index}-${planIndex}`,
        mofid: plan?.mofid || "",
        assetName: plan?.trackName || plan?.planName || policy?.planName || policy?.productType || "מסלול ללא שם",
        return12: Number(plan?.totalRate12 ?? plan?.avgRate12 ?? 0),
        return36: Number(plan?.totalRate36 ?? plan?.avgRate36 ?? 0),
        return60: Number(plan?.totalRate60 ?? plan?.avgRate60 ?? 0),
        st36: Number(plan?.standardDeviation36 ?? 0),
        sharp36: Number(plan?.sharp ?? 0),
        equityExposure: Number(plan?.equityExposure || 0),
        foreignExposure: Number(plan?.foreignExposure || 0),
      })),
      deathCoverage: getPolicyDeathCoverage(policy),
      disabilityValue: getPolicyDisabilityValue(policy),
      widowPension: Number(policy?.coverage?.widowPension || 0),
      orphanPension: Number(policy?.coverage?.orphanPension || 0),
      hasActiveDeposits: hasActivePolicyDeposits(policy),
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

function isPensionFundProduct(product) {
  const text = `${product?.productType || ""} ${product?.planName || ""}`;
  return (
    text.includes("קרן פנסיה") ||
    text.includes("פנסיה מקיפה") ||
    text.includes("פנסיה כללית") ||
    text.includes("פנסיה חדשה") ||
    text.includes("פנסיה ותיקה")
  );
}

function buildDeathCoverageRows(products) {
  return safeArray(products)
    .filter((product) => !isPensionFundProduct(product))
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

function buildPensionDeathBenefitRows(products) {
  return safeArray(products)
    .filter((product) => isPensionFundProduct(product))
    .map((product, index) => {
      const widowPension = Number(product.widowPension || 0);
      const orphanPension = Number(product.orphanPension || 0);
      return {
        id: product.id || `${product.planName}-pension-${index}`,
        planName: product.planName || "מוצר ללא שם",
        active: Boolean(product.hasActiveDeposits),
        widowPension,
        orphanPension,
        totalPension: widowPension + orphanPension,
      };
    })
    .filter((row) => row.totalPension > 0)
    .sort(
      (a, b) =>
        Number(b.active) - Number(a.active) ||
        Number(b.totalPension || 0) - Number(a.totalPension || 0)
    );
}


function buildProductAssetTables(products) {
  const groupedProducts = new Map();

  safeArray(products).forEach((product) => {
    const productName = product?.productType || product?.planName || "ללא סוג מוצר";
    const productValue = Number(product?.currentValue || 0);
    const routes = safeArray(product?.investmentRoutes);
    const effectiveRoutes = routes.length
      ? routes
      : [{
          id: product?.id || product?.policyNo || productName,
          mofid: "—",
          assetName: product?.planName || productName,
          return12: 0,
          return36: 0,
          return60: 0,
          st36: 0,
          sharp36: 0,
          equityExposure: Number(product?.equityExposure || 0),
          foreignExposure: Number(product?.foreignExposure || 0),
        }];

    const routeWeight = productValue > 0 ? productValue / Math.max(effectiveRoutes.length, 1) : 0;

    if (!groupedProducts.has(productName)) {
      groupedProducts.set(productName, {
        id: productName,
        productName,
        totalAssets: 0,
        routeMap: new Map(),
      });
    }

    const group = groupedProducts.get(productName);
    group.totalAssets += productValue;

    effectiveRoutes.forEach((route) => {
      const key = `${route?.mofid || "—"}|${route?.assetName || "מסלול ללא שם"}`;
      const current = group.routeMap.get(key) || {
        id: key,
        mofid: route?.mofid || "—",
        assetName: route?.assetName || "מסלול ללא שם",
        allocatedValue: 0,
        weightedReturn12: 0,
        weightedReturn36: 0,
        weightedReturn60: 0,
        weightedSt36: 0,
        weightedSharp36: 0,
        weightedEquityExposure: 0,
      };

      current.allocatedValue += routeWeight;
      current.weightedReturn12 += Number(route?.return12 || 0) * routeWeight;
      current.weightedReturn36 += Number(route?.return36 || 0) * routeWeight;
      current.weightedReturn60 += Number(route?.return60 || 0) * routeWeight;
      current.weightedSt36 += Number(route?.st36 || 0) * routeWeight;
      current.weightedSharp36 += Number(route?.sharp36 || 0) * routeWeight;
      current.weightedEquityExposure += Number(route?.equityExposure || 0) * routeWeight;
      group.routeMap.set(key, current);
    });
  });

  const PRODUCT_SORT_ORDER = [
    "פנסיה מקיפה",
    "פנסיה משלימה כללית",
    "ביטוח מנהלים",
    "אובדן כושר עבודה",
    "קרן השתלמות",
    "קופת גמל",
    "קופת גמל להשקעה",
    "ביטוח חיים",
  ];

  const getProductSortIndex = (name) => {
    const idx = PRODUCT_SORT_ORDER.findIndex((order) => String(name || "").includes(order));
    return idx >= 0 ? idx : PRODUCT_SORT_ORDER.length;
  };

  return Array.from(groupedProducts.values())
    .map((group) => {
      const rows = Array.from(group.routeMap.values())
        .map((row) => {
          const weight = Number(row.allocatedValue || 0);
          return {
            id: row.id,
            mofid: row.mofid,
            assetName: row.assetName,
            allocatedValue: weight,
            return12: weight > 0 ? row.weightedReturn12 / weight : 0,
            return36: weight > 0 ? row.weightedReturn36 / weight : 0,
            return60: weight > 0 ? row.weightedReturn60 / weight : 0,
            st36: weight > 0 ? row.weightedSt36 / weight : 0,
            sharp36: weight > 0 ? row.weightedSharp36 / weight : 0,
            equityExposure: weight > 0 ? row.weightedEquityExposure / weight : 0,
          };
        })
        .filter((row) => row.allocatedValue > 0 || row.mofid !== "—")
        .sort((a, b) => Number(b.allocatedValue || 0) - Number(a.allocatedValue || 0));

      return {
        id: group.id,
        productName: group.productName,
        totalAssets: group.totalAssets,
        weightedReturn12: weightedAverage(rows, "return12"),
        weightedReturn36: weightedAverage(rows, "return36"),
        weightedReturn60: weightedAverage(rows, "return60"),
        weightedSt36: weightedAverage(rows, "st36"),
        weightedSharp36: weightedAverage(rows, "sharp36"),
        weightedEquityExposure: weightedAverage(rows, "equityExposure"),
        rows,
      };
    })
    .filter((group) => group.totalAssets > 0 || group.rows.length > 0)
    .sort((a, b) => {
      const ai = getProductSortIndex(a.productName);
      const bi = getProductSortIndex(b.productName);
      if (ai !== bi) return ai - bi;
      return Number(b.totalAssets || 0) - Number(a.totalAssets || 0);
    });
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
      assetProductTables: buildProductAssetTables(products),
      deathCoverageProducts: buildDeathCoverageRows(products),
      pensionDeathBenefitProducts: buildPensionDeathBenefitRows(products),
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

function aggregatePensionDeathBenefitRows(members) {
  return safeArray(members)
    .flatMap((member) => safeArray(member.pensionDeathBenefitProducts).map((row) => ({ ...row, memberName: member.name })))
    .sort((a, b) => Number(b.totalPension || 0) - Number(a.totalPension || 0));
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
      products: detailedMembers.flatMap((member) =>
        safeArray(member.products).map((product) => ({
          ...product,
          memberName: member.name,
        }))
      ),
      assetProductTables: buildProductAssetTables(detailedMembers.flatMap((member) => safeArray(member.products))),
      deathCoverageProducts: aggregateDeathCoverageRows(detailedMembers),
      pensionDeathBenefitProducts: aggregatePensionDeathBenefitRows(detailedMembers),
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
    assetProductTables: member.assetProductTables || [],
    deathCoverageProducts: member.deathCoverageProducts || [],
    pensionDeathBenefitProducts: member.pensionDeathBenefitProducts || [],
  };
}

function EmptyDashboardState({ onBack }) {
  return (
    <div style={px(styles.emptyPage)}>
      <div style={px(styles.emptyCard)}>
        <h1 style={px(styles.emptyTitle)}>אין נתוני דוח להצגה</h1>
        <p style={px(styles.emptyText)}>מסך הלקוח מקבל את הנתונים מתוך הדוח שנוצר במערכת. חזור למסך הדוח או הפק דוח חדש.</p>
        <button type="button" onClick={onBack} style={px(styles.secondaryButton)}>חזרה</button>
      </div>
    </div>
  );
}

const BASE_NAV_ITEMS = [
  { id: "personal", label: "פרטים אישיים", icon: "☷" },
  { id: "pension", label: "סיכום פנסיוני", icon: "▥" },
  { id: "allocation", label: "התפלגות נכסים", icon: "◔" },
  { id: "managementFees", label: "דמי ניהול", icon: "%" },
  { id: "insurance", label: "סכומים למקרה פטירה", icon: "🛡" },
  { id: "loans", label: "הלוואות", icon: "🏦" },
  { id: "summary", label: "סיכום שיחה", icon: "✎" },
];

function buildNavItems(specialSections) {
  if (!specialSections?.hasAny) return BASE_NAV_ITEMS;

  const summaryIndex = BASE_NAV_ITEMS.findIndex((item) => item.id === "summary");
  const specialItems = [
    specialSections.hasCapitalClassification ? { id: "capitalClassification", label: "פירוק נכסים", icon: "▦" } : null,
    specialSections.hasSection28 ? { id: "section28", label: "קיטום סעיף 28", icon: "§" } : null,
    specialSections.hasRecognizedPension ? { id: "recognizedPension", label: "קצבה מוכרת", icon: "₪" } : null,
  ].filter(Boolean);

  if (summaryIndex < 0) return [...BASE_NAV_ITEMS, ...specialItems];
  return [
    ...BASE_NAV_ITEMS.slice(0, summaryIndex),
    ...specialItems,
    ...BASE_NAV_ITEMS.slice(summaryIndex),
  ];
}

const ClientDashboardPage = defineComponent({
  name: "ClientDashboardPage",
  props: {
    reportData: { type: Object, default: null },
    onBack: { type: Function, default: () => {} },
    isSharedMode: { type: Boolean, default: false },
    viewMode: { type: String, default: "family" },
    selectedMemberId: { type: String, default: null },
    onChangeView: { type: Function, default: () => {} },
    onOpenPreviousReports: { type: Function, default: () => {} },
    onUpdateReportData: { type: Function, default: () => {} },
  },
  setup(props) {
    const activeSectionRef = ref("personal");
    const selectedPieSegmentRef = ref(null);
    const showPdfModalRef = ref(false);
    const localScopeIdRef = ref(
      props.viewMode === "member" && props.selectedMemberId
        ? props.selectedMemberId
        : "family"
    );

    const clientModelC = computed(() => buildClientModelFromReportData(props.reportData));
    const detailedMembersC = computed(() =>
      buildDetailedMembers(props.reportData, clientModelC.value)
    );
    const specialSectionsC = computed(() => buildSpecialSectionsModel(props.reportData));
    const navItemsC = computed(() => buildNavItems(specialSectionsC.value));

    return () => {
      const reportData = props.reportData;
      const onBack = props.onBack;
      const isSharedMode = props.isSharedMode;
      const onChangeView = props.onChangeView;
      const onOpenPreviousReports = props.onOpenPreviousReports;
      const onUpdateReportData = props.onUpdateReportData;

      const activeSection = activeSectionRef.value;
      const selectedPieSegment = selectedPieSegmentRef.value;
      const showPdfModal = showPdfModalRef.value;
      const localScopeId = localScopeIdRef.value;
      const setActiveSection = (v) => {
        activeSectionRef.value = typeof v === "function" ? v(activeSectionRef.value) : v;
      };
      const setSelectedPieSegment = (v) => {
        selectedPieSegmentRef.value =
          typeof v === "function" ? v(selectedPieSegmentRef.value) : v;
      };
      const setShowPdfModal = (v) => {
        showPdfModalRef.value = typeof v === "function" ? v(showPdfModalRef.value) : v;
      };
      const setLocalScopeId = (v) => {
        localScopeIdRef.value = typeof v === "function" ? v(localScopeIdRef.value) : v;
      };

      const clientModel = clientModelC.value;
      const detailedMembers = detailedMembersC.value;
      const specialSections = specialSectionsC.value;
      const navItems = navItemsC.value;
      const scope = getSelectedScope(clientModel, detailedMembers, localScopeId);

      const handleOpenPieDrawer = (payload) => {
        setSelectedPieSegment({
          ...payload,
          details: buildPieSegmentDetails(scope, payload),
        });
      };

      const handleClosePieDrawer = () => {
        setSelectedPieSegment(null);
      };

      if (!reportData || !reportData.family)
        return <EmptyDashboardState onBack={onBack} />;

      const handleSelectScope = (nextScopeId) => {
        setLocalScopeId(nextScopeId);
        if (nextScopeId === "family") onChangeView("family", null);
        else onChangeView("member", nextScopeId);
      };

      return (
    <div class="client-web-shell">
      <style>{clientDashboardCss}</style>

      <aside class="client-sidebar">
        <div class="client-sidebar-brand">
          <ZviranMark />
          <div>
            <div class="client-brand-title">דוח פנסיוני מאוחד</div>
            <div class="client-brand-subtitle">דוח פנסיוני משפחתי</div>
          </div>
        </div>

        <nav class="client-sidebar-nav" aria-label="ניווט במסך הלקוח">
          <div class="client-nav-pill" style={px({ top: navItems.findIndex((i) => i.id === activeSection) * 58 + 6 })} />
          {navItems.map((item) => (
            <button key={item.id} type="button" onClick={() => setActiveSection(item.id)} class={activeSection === item.id ? "client-nav-item active" : "client-nav-item"}>
              <span class="client-nav-icon">{item.icon}</span>
              <span class="client-nav-label">{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main class="client-main">
        <header class="client-topbar">
          <div class="client-topbar-title-wrap">
            <div class="client-topbar-eyebrow">מסך לקוח · תצוגת WEB</div>
            <h1 class="client-page-title">{scope.isFamily ? "מבט משפחתי" : (scope.name || "דוח אישי")}</h1>
            <div class="client-page-subtitle">{scope.isFamily ? "תצוגה מאוחדת לכל המשפחה" : `תצוגה אישית עבור ${scope.name}`}</div>
            <div class="client-updated-inline"><span class="client-updated-label">תאריך עדכון</span><span class="client-updated-value">{clientModel.lastUpdated || "—"}</span></div>
          </div>

          <div class="client-topbar-actions">
            <ScopeDropdown
              members={detailedMembers}
              valueId={localScopeId}
              onSelect={handleSelectScope}
            />

            <button type="button" class="client-history-button" onClick={onOpenPreviousReports} title="הכנה לצפייה בנתונים קודמים">
              <span class="client-history-icon">↺</span>
              <span><strong>נתונים קודמים</strong><small>הכנה לגרסאות דוח קודמות</small></span>
            </button>

            <button type="button" class="client-pdf-button" onClick={() => setShowPdfModal(true)} title="ייצוא לדוח PDF">
              <PdfIcon />
            </button>

            {!isSharedMode ? (
              <button type="button" onClick={onBack} class="client-back-button client-back-icon-btn" title="חזרה למסך העלאה">
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <path d="M19 11H5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  <path d="M10 6L5 11L10 16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            ) : null}

            {reportData?.clientLogo ? (
              <div class="client-topbar-logo">
                <img src={reportData.clientLogo} alt="לוגו" />
              </div>
            ) : null}
          </div>
        </header>

        <section class="client-content-card">
          {activeSection === "pension" ? <PensionSection scope={scope} /> : null}
          {activeSection === "personal" ? <PersonalDetailsSection members={detailedMembers} /> : null}
          {activeSection === "allocation" ? <AllocationSection scope={scope} onSegmentClick={handleOpenPieDrawer} /> : null}
          {activeSection === "managementFees" ? <ManagementFeesSection scope={scope} detailedMembers={detailedMembers} /> : null}
          {activeSection === "insurance" ? <InsuranceSection scope={scope} /> : null}
          {activeSection === "loans" ? <LoansSection scope={scope} /> : null}
          {activeSection === "capitalClassification" ? <CapitalClassificationSection sections={specialSections.capitalClassification} /> : null}
          {activeSection === "section28" ? <Section28Section section28Capping={specialSections.section28Capping} /> : null}
          {activeSection === "recognizedPension" ? <RecognizedPensionSection entries={specialSections.recognizedPensionEntries} /> : null}
          {activeSection === "summary" ? (
            <ConversationSummarySection
              scope={scope}
              clientModel={clientModel}
              reportData={reportData}
              isSharedMode={isSharedMode}
              onUpdateReportData={onUpdateReportData}
            />
          ) : null}
        </section>
      </main>

      <PieSegmentDrawer selected={selectedPieSegment} onClose={handleClosePieDrawer} />

      {showPdfModal ? (
        <PdfExportModal
          navItems={navItems}
          onClose={() => setShowPdfModal(false)}
          scope={scope}
          detailedMembers={detailedMembers}
          specialSections={specialSections}
          clientModel={clientModel}
          reportData={reportData}
        />
      ) : null}
    </div>
  );
    };
  },
});

export default ClientDashboardPage;

function PdfIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={px({ flexShrink: 0 })}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
      <polyline points="14,2 14,8 20,8" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
      <line x1="8" y1="13" x2="16" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <line x1="8" y1="17" x2="13" y2="17" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </svg>
  );
}

function renderSectionContent(sectionId, { scope, detailedMembers, specialSections, clientModel, reportData }) {
  if (sectionId === "pension") return <PensionSection scope={scope} />;
  if (sectionId === "personal") return <PersonalDetailsSection members={detailedMembers} />;
  if (sectionId === "allocation") return <AllocationSection scope={scope} onSegmentClick={() => {}} printMode />;
  if (sectionId === "insurance") return <InsuranceSection scope={scope} />;
  if (sectionId === "loans") return <LoansSection scope={scope} />;
  if (sectionId === "capitalClassification") return <CapitalClassificationSection sections={specialSections.capitalClassification} />;
  if (sectionId === "section28") return <Section28Section section28Capping={specialSections.section28Capping} />;
  if (sectionId === "recognizedPension") return <RecognizedPensionSection entries={specialSections.recognizedPensionEntries} />;
  if (sectionId === "summary") return <ConversationSummarySection scope={scope} clientModel={clientModel} reportData={reportData} printMode />;
  return null;
}

const PdfExportModal = defineComponent({
  name: "PdfExportModal",
  props: {
    navItems: { type: Array, default: () => [] },
    onClose: { type: Function, default: () => {} },
    scope: { type: Object, default: null },
    detailedMembers: { type: Array, default: () => [] },
    specialSections: { type: Object, default: null },
    clientModel: { type: Object, default: null },
    reportData: { type: Object, default: null },
  },
  setup(props) {
    const selectedRef = ref(new Set(props.navItems.map((item) => item.id)));
    const printingRef = ref(false);

    watch(printingRef, (printing, _old, onCleanup) => {
      if (!printing) return;
      const raf = requestAnimationFrame(() => {
        setTimeout(() => {
          window.print();
          printingRef.value = false;
        }, 80);
      });
      onCleanup(() => cancelAnimationFrame(raf));
    });

    return () => {
      const { navItems, onClose, scope, detailedMembers, specialSections, clientModel, reportData } = props;
      const selected = selectedRef.value;
      const printing = printingRef.value;
      const setSelected = (u) => {
        selectedRef.value = typeof u === "function" ? u(selectedRef.value) : u;
      };
      const setPrinting = (v) => {
        printingRef.value = typeof v === "function" ? v(printingRef.value) : v;
      };

  const toggleItem = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handlePrint = () => {
    setPrinting(true);
  };

  const selectedItems = navItems.filter((item) => selected.has(item.id));
  const printProps = { scope, detailedMembers, specialSections, clientModel, reportData };

  // Individual policies with weighted returns, for the new-design "נכסים ברמת מוצר" page.
  const productFunds = safeArray(scope?.products)
    .map((p) => {
      const routes = safeArray(p.investmentRoutes);
      const avg = (k) => (routes.length ? routes.reduce((s, r) => s + Number(r?.[k] || 0), 0) / routes.length : 0);
      return {
        name: p.planName || p.productType || "מוצר",
        policyNo: p.policyNo || "",
        productType: p.productType || "אחר",
        value: Number(p.currentValue || 0),
        return12: avg("return12"), return36: avg("return36"), return60: avg("return60"),
        st36: avg("st36"), sharp36: avg("sharp36"),
      };
    })
    .filter((f) => f.value > 0);

  // Monthly pension death-benefit rows (widow/orphan) — same source as the WEB table.
  const deathBenefit = { pensionRows: safeArray(scope?.pensionDeathBenefitProducts) };

  return (
    <>
      <div class="pdf-modal-overlay" onClick={onClose} />
      <div class="pdf-modal">
        <div class="pdf-modal-header">
          <h2>ייצוא דוח PDF</h2>
          <button type="button" class="pdf-modal-close" onClick={onClose}>×</button>
        </div>

        <p class="pdf-modal-subtitle">בחר את הטאבים שיופיעו בדוח המודפס</p>

        <div class="pdf-modal-items">
          {navItems.map((item) => (
            <label key={item.id} class={`pdf-modal-item ${selected.has(item.id) ? "checked" : ""}`}>
              <input
                type="checkbox"
                checked={selected.has(item.id)}
                onChange={() => toggleItem(item.id)}
                class="pdf-modal-checkbox"
              />
              <span class="pdf-modal-icon">{item.icon}</span>
              <span>{item.label}</span>
            </label>
          ))}
        </div>

        <div class="pdf-modal-footer">
          <button type="button" class="pdf-modal-cancel" onClick={onClose}>ביטול</button>
          <button
            type="button"
            class="pdf-modal-export"
            onClick={handlePrint}
            disabled={selected.size === 0 || printing}
          >
            <PdfIcon />
            {printing ? "מכין..." : `ייצא ${selected.size} טאבים`}
          </button>
        </div>
      </div>

      {printing ? (
        <div class="pdf-print-container pdf-print-container--report">
          <PrintReportA4
            reportData={reportData}
            sections={selected}
            productFunds={productFunds}
            deathBenefit={deathBenefit}
            conversationSummary={reportData?.conversationSummary || reportData?.clientConversationSummary || ""}
            actionRecommendations={reportData?.actionRecommendations || reportData?.recommendationsText || ""}
          />
        </div>
      ) : null}
    </>
  );
    };
  },
});

function PensionSection({ scope }) {
  const summary = scope.summary || {};
  return (
    <div>
      <SectionTitle title="סיכום פנסיוני" subtitle="ריכוז נתוני הצבירה, ההפקדות והתחזית לגיל פרישה — ללא רכיבי פאי בעמוד הראשי." />
      <div class="client-kpi-grid">
        <KpiCard icon={<CalendarDepositIcon />} title="הפקדה חודשית כוללת" value={formatCurrency(summary.monthlyDeposits)} />
        <KpiCard icon={<CoinsStackIcon />} title="סך נכסים" value={formatCurrency(summary.totalAssets)} subtext="סך הצבירה הקיימת" />
        <KpiCard icon={<SafePensionIcon />} title="קצבה חודשית צפויה" value={formatCurrency(summary.monthlyPensionWithDeposits)} />
        <KpiCard icon={<SavingsGrowthIcon />} title="צבירה צפויה" value={formatCurrency(summary.projectedLumpSumWithDeposits)} />
      </div>
      <div class="client-grid-2 client-margin-top">
        <ComparisonCard title="השוואת צבירה צפויה" explanation="פער בין צבירה עתידית עם המשך הפקדות לבין מצב ללא המשך הפקדות." withValue={summary.projectedLumpSumWithDeposits} withoutValue={summary.projectedLumpSumWithoutDeposits} />
        <ComparisonCard title="השוואת קצבה חודשית צפויה" explanation="פער בין קצבה עתידית עם המשך הפקדות לבין מצב ללא המשך הפקדות." withValue={summary.monthlyPensionWithDeposits} withoutValue={summary.monthlyPensionWithoutDeposits} />
      </div>
      <div class="client-grid-2 client-margin-top">
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
      <SectionTitle title="פרטים אישיים" />
      {displayMembers.length ? (
        <div class="client-personal-grid">
          {displayMembers.map((member, index) => (
            <PersonalDetailsCard key={member.id || member.name || index} member={member} index={index} />
          ))}
        </div>
      ) : (
        <div class="client-empty-state">לא נמצאו בני משפחה להצגת פרטים אישיים.</div>
      )}
    </div>
  );
}

function ScopeFamilyGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="5" cy="5.5" r="2.2" fill="currentColor" />
      <circle cx="11" cy="5.5" r="2.2" fill="currentColor" />
      <path d="M1 14c0-2.4 1.8-4 4-4s4 1.6 4 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
      <path d="M7 14c0-2.4 1.8-4 4-4s4 1.6 4 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
    </svg>
  );
}

function ScopePersonGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="5.5" r="2.6" fill="currentColor" />
      <path d="M2.5 14c0-3 2.5-5 5.5-5s5.5 2 5.5 5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
    </svg>
  );
}

const ScopeDropdown = defineComponent({
  name: "ScopeDropdown",
  props: {
    members: { type: Array, default: () => [] },
    valueId: { default: null },
    onSelect: { type: Function, default: () => {} },
  },
  setup(props) {
    const openRef = ref(false);
    const containerRef = ref(null);

    watch(openRef, (open, _old, onCleanup) => {
      if (!open) return;
      const onDocClick = (event) => {
        if (containerRef.value && !containerRef.value.contains(event.target))
          openRef.value = false;
      };
      const onKey = (event) => {
        if (event.key === "Escape") openRef.value = false;
      };
      document.addEventListener("mousedown", onDocClick);
      document.addEventListener("keydown", onKey);
      onCleanup(() => {
        document.removeEventListener("mousedown", onDocClick);
        document.removeEventListener("keydown", onKey);
      });
    });

    return () => {
      const { members, valueId, onSelect } = props;
      const open = openRef.value;
      const setOpen = (u) => {
        openRef.value = typeof u === "function" ? u(openRef.value) : u;
      };

  const options = [
    { id: "family", name: "משפחה מאוחדת", isFamily: true },
    ...safeArray(members).map((member) => ({
      id: member.id || member.name,
      name: member.name || "ללא שם",
      isFamily: false,
    })),
  ];
  const current = options.find((option) => String(option.id) === String(valueId)) || options[0];

  return (
    <div class={`client-scope-dd ${open ? "open" : ""}`} ref={containerRef}>
      <button
        type="button"
        class="client-scope-dd-trigger"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span class="client-scope-dd-icon">{current.isFamily ? <ScopeFamilyGlyph /> : <ScopePersonGlyph />}</span>
        <span class="client-scope-dd-text">
          <span class="client-scope-dd-label">תצוגה</span>
          <span class="client-scope-dd-value">{current.name}</span>
        </span>
        <svg class="client-scope-dd-chevron" width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M3 5L7 9L11 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>

      {open ? (
        <div class="client-scope-dd-menu" role="listbox">
          {options.map((option) => {
            const active = String(option.id) === String(current.id);
            return (
              <button
                type="button"
                key={option.id}
                role="option"
                aria-selected={active}
                class={`client-scope-dd-item ${active ? "active" : ""}`}
                onClick={() => {
                  onSelect(option.id);
                  setOpen(false);
                }}
              >
                <span class="client-scope-dd-item-icon">{option.isFamily ? <ScopeFamilyGlyph /> : <ScopePersonGlyph />}</span>
                <span class="client-scope-dd-item-name">{option.name}</span>
                {active ? (
                  <svg class="client-scope-dd-check" width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M2.5 7.5L6 11L11.5 4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
    };
  },
});

function GenderIcon({ gender }) {
  const female = gender === "female";
  const bg = female ? "#FFF0F3" : "#EEF3FB";
  const fg = female ? "#FF2756" : "#1E5FAD";
  return (
    <svg
      width="66"
      height="66"
      viewBox="0 0 66 66"
      role="img"
      aria-label={female ? "נקבה" : "זכר"}
      style={px({ display: "block", flexShrink: 0 })}
    >
      <circle cx="33" cy="33" r="33" fill={bg} />
      <circle cx="33" cy="24" r="8.5" fill={fg} />
      {female ? (
        // אישה — צללית עם שמלה משולשת
        <path
          d="M33 30.5 L21.5 52.8 A2 2 0 0 0 23.3 55.7 H42.7 A2 2 0 0 0 44.5 52.8 Z"
          fill={fg}
        />
      ) : (
        // גבר — צללית עם כתפיים מעוגלות
        <path
          d="M19.5 55.5 V47 a13.5 13.5 0 0 1 27 0 V55.5 a1 1 0 0 1 -1 1 H20.5 a1 1 0 0 1 -1 -1 Z"
          fill={fg}
        />
      )}
    </svg>
  );
}

function PersonalDetailsCard({ member, index }) {
  const details = member?.personalDetails || {};
  const gender = details.gender || member?.gender || (index === 1 ? "female" : "male");
  return (
    <div class="client-personal-card">
      <div class="client-personal-card-header">
        <div class="client-personal-avatar"><GenderIcon gender={gender} /></div>
        <div>
          <h3>
            {details.name || member?.name || "ללא שם"}
            {(details.retireAge || member?.retireAge) ? (
              <span style={px({ fontSize: 13, fontWeight: 600, color: "#627D98", marginRight: 8 })}>
                {` (פרישה בגיל ${details.retireAge || member?.retireAge})`}
              </span>
            ) : null}
          </h3>
        </div>
      </div>

      <div class="client-personal-fields">
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
    <div class="client-personal-field">
      <span>{label}</span>
      <strong>{value || "—"}</strong>
    </div>
  );
}

function AllocationSection({ scope, onSegmentClick, printMode = false }) {
  const total = Number(scope?.summary?.totalAssets || scope?.totalAssets || 0);
  const totalLabel = total > 0 ? ` (${formatCurrency(total)})` : "";
  return (
    <div>
      <SectionTitle title={`התפלגות נכסים${totalLabel}`} />
      <div class="client-allocation-top-pies">
        <DonutCard
          title="חלוקה לפי מוצרים"
          items={scope.distributions?.products || scope.productTypes || []}
          type="product"
          scope={scope}
          onSegmentClick={onSegmentClick}
        />
        <DonutCard
          title="חלוקה לפי גופים מנהלים"
          items={scope.distributions?.managers || scope.managers || []}
          type="manager"
          scope={scope}
          onSegmentClick={onSegmentClick}
        />
      </div>

      <div class="client-main-groups-wide client-margin-top">
        <DonutCard
          title="חלוקה לפי אפיקים ראשיים"
          items={scope.distributions?.mainGroups || []}
          type="mainGroup"
          scope={scope}
          onSegmentClick={onSegmentClick}
          wide
        />
      </div>

      <AssetProductTablesSection productTables={scope.assetProductTables} printMode={printMode} />
    </div>
  );
}

const AssetProductTablesSection = defineComponent({
  name: "AssetProductTablesSection",
  props: {
    productTables: { default: null },
    printMode: { type: Boolean, default: false },
  },
  setup(props) {
    const initTables = safeArray(props.productTables);
    const openIdsRef = ref(
      props.printMode
        ? new Set(initTables.map((t) => t.id))
        : new Set(initTables[0]?.id ? [initTables[0].id] : [])
    );

    return () => {
      const { productTables, printMode } = props;
      const tables = safeArray(productTables);
      const openIds = openIdsRef.value;
      const setOpenIds = (u) => {
        openIdsRef.value = typeof u === "function" ? u(openIdsRef.value) : u;
      };
      const toggleOpen = (id) => {
        setOpenIds((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      };

  if (!tables.length) {
    return (
      <div class="client-panel client-margin-top">
        <h3>נכסים ברמת מוצר</h3>
        <div class="client-empty-state">לא נמצאו מסלולי השקעה מתוך ה־XML להצגה.</div>
      </div>
    );
  }

  return (
    <div class="client-asset-products client-margin-top">
      <div class="client-section-title-row compact">
        <div>
          <h2>נכסים ברמת מוצר</h2>
          <p>כל מוצר מוצג ככרטיס נפרד. נתוני הסטריפ בכל מוצר משוקללים לפי כמות הנכסים במסלולים שבתוך אותו מוצר.</p>
        </div>
      </div>

      {tables.map((table) => {
        const isOpen = openIds.has(table.id);
        return (
          <div key={table.id} class="client-product-accordion">
            <button type="button" class="client-product-summary" onClick={() => toggleOpen(table.id)}>
              <span class="client-product-chevron">{isOpen ? "⌃" : "⌄"}</span>
              <strong class="client-product-title">{table.productName}</strong>
              <span class="client-product-strip-item"><small>סך צבירה</small><b>{formatCurrency(table.totalAssets)}</b></span>
              <span class="client-product-strip-item"><small>תשואה 12 מצטברת</small><b>{formatSignedPercent(table.weightedReturn12)}</b></span>
              <span class="client-product-strip-item"><small>תשואה 36 מצטברת</small><b>{formatSignedPercent(table.weightedReturn36)}</b></span>
              <span class="client-product-strip-item"><small>תשואה 60 מצטברת</small><b>{formatSignedPercent(table.weightedReturn60)}</b></span>
              <span class="client-product-strip-item"><small>סטיית תקן 36</small><b>{formatSignedPercent(table.weightedSt36)}</b></span>
              <span class="client-product-strip-item"><small>שארפ 36</small><b>{formatDecimal(table.weightedSharp36, 2)}</b></span>
            </button>

            {isOpen ? <AssetProductRoutesTable rows={table.rows} /> : null}
          </div>
        );
      })}
    </div>
  );
    };
  },
});

function AssetProductRoutesTable({ rows }) {
  const safeRows = safeArray(rows);

  if (!safeRows.length) {
    return <div class="client-empty-state">אין מסלולים להצגה עבור מוצר זה.</div>;
  }

  return (
    <div class="client-table-wrap client-margin-top">
      <table class="client-table client-product-assets-table">
        <thead>
          <tr>
            <th>מספר באוצר</th>
            <th>שם נכס / מסלול</th>
            <th>סך צבירה</th>
            <th>תשואה 12 חודשים</th>
            <th>תשואה 36 חודשים</th>
            <th>תשואה 60 חודשים</th>
            <th>סטיית תקן 36</th>
            <th>שארפ 36</th>
          </tr>
        </thead>
        <tbody>
          {safeRows.map((row, index) => (
            <tr key={row.id || index}>
              <td>{row.mofid || "—"}</td>
              <td>{row.assetName || "—"}</td>
              <td>{formatCurrency(row.allocatedValue)}</td>
              <td class="positive-number">{formatSignedPercent(row.return12)}</td>
              <td class="positive-number">{formatSignedPercent(row.return36)}</td>
              <td class="positive-number">{formatSignedPercent(row.return60)}</td>
              <td>{formatSignedPercent(row.st36)}</td>
              <td>{formatDecimal(row.sharp36, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InsuranceSection({ scope }) {
  const insurance = scope.insurance || {};
  const deathCoverageRows = safeArray(scope.deathCoverageProducts);
  const pensionDeathBenefitRows = safeArray(scope.pensionDeathBenefitProducts);

  return (
    <div>
      <SectionTitle title="סכומים למקרה פטירה" />

      {scope.isFamily ? (
        <div class="client-kpi-grid" style={px({ gridTemplateColumns: "1fr" })}>
          <MetricBox title="ביטוח חיים / הון למוטבים" value={formatCurrency(insurance.deathCoverage)} icon={<FamilyUmbrellaIcon />} />
        </div>
      ) : (
        <div class="client-grid-2">
          <MetricBox title="ביטוח חיים / הון למוטבים" value={formatCurrency(insurance.deathCoverage)} icon={<FamilyUmbrellaIcon />} />
          <MetricBox
            title="אובדן כושר עבודה"
            value={`${formatCurrency(insurance.disabilityValue)}${insurance.disabilityPercent > 0 ? ` (${formatPercent(insurance.disabilityPercent)})` : ""}`}
            icon={<DisabilityIcon />}
          />
        </div>
      )}

      <div class="client-panel client-margin-top">
        <h3>סכומים חד פעמיים במקרה פטירה</h3>
        <InsuranceProductsTable rows={deathCoverageRows} isFamily={Boolean(scope.isFamily)} />
      </div>

      <div class="client-panel client-margin-top">
        <h3>סכום פיצוי חודשי מקרן הפנסיה</h3>
        <PensionDeathBenefitTable rows={pensionDeathBenefitRows} isFamily={Boolean(scope.isFamily)} />
        <div class="client-empty-state client-margin-top">
          סך הקצבה החודשית לאלמנה וליתומים אינה יכולה לעלות על השכר המבוטח; הפיצוי לכל יתום משולם עד גיל 21.
        </div>
      </div>
    </div>
  );
}

function PensionDeathBenefitTable({ rows, isFamily }) {
  const safeRows = safeArray(rows);

  if (!safeRows.length) {
    return (
      <div class="client-empty-state client-margin-top">
        אין נתוני פיצוי חודשי מקרן פנסיה להצגה.
      </div>
    );
  }

  const statusColumn = { key: "status", label: "סטטוס", className: "text-col", render: (row) => (row.active ? "פעילה" : "לא פעילה") };
  const columns = isFamily
    ? [
        { key: "memberName", label: "בן משפחה", className: "text-col", render: (row) => row.memberName || "—" },
        { key: "planName", label: "שם מוצר", className: "wide-col", render: (row) => row.planName || "—" },
        statusColumn,
        { key: "widowPension", label: "סכום לאלמנה", className: "money-col", render: (row) => formatCurrency(row.widowPension) },
        { key: "orphanPension", label: "סכום ליתום", className: "money-col", render: (row) => formatCurrency(row.orphanPension) },
        { key: "totalPension", label: "סך קצבה", className: "money-col", render: (row) => formatCurrency(row.totalPension) },
      ]
    : [
        { key: "planName", label: "שם מוצר", className: "wide-col", render: (row) => row.planName || "—" },
        statusColumn,
        { key: "widowPension", label: "סכום לאלמנה", className: "money-col", render: (row) => formatCurrency(row.widowPension) },
        { key: "orphanPension", label: "סכום ליתום", className: "money-col", render: (row) => formatCurrency(row.orphanPension) },
        { key: "totalPension", label: "סך קצבה", className: "money-col", render: (row) => formatCurrency(row.totalPension) },
      ];

  return (
    <div class="client-table-wrap client-margin-top">
      <table class={isFamily ? "client-table client-insurance-table family" : "client-table client-insurance-table member"}>
        <colgroup>
          {columns.map((column) => (
            <col key={column.key} class={`client-insurance-col-${column.key}`} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} class={column.className}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {safeRows.map((row, rowIndex) => (
            <tr key={row.id || `${row.planName || "plan"}-${rowIndex}`}>
              {columns.map((column) => (
                <td key={column.key} class={column.className} title={String(column.render(row) || "")}>{column.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InsuranceProductsTable({ rows, isFamily }) {
  const safeRows = safeArray(rows);

  if (!safeRows.length) {
    return (
      <div class="client-empty-state client-margin-top">
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
    <div class="client-table-wrap client-margin-top">
      <table class={isFamily ? "client-table client-insurance-table family" : "client-table client-insurance-table member"}>
        <colgroup>
          {columns.map((column) => (
            <col key={column.key} class={`client-insurance-col-${column.key}`} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} class={column.className}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {safeRows.map((row, rowIndex) => (
            <tr key={row.id || `${row.policyNo || "policy"}-${rowIndex}`}>
              {columns.map((column) => (
                <td key={column.key} class={column.className} title={String(column.render(row) || "")}>{column.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Old participating / guaranteed-yield policies carry a real-return spread
// ("מרווח ריאלי", ~15%) instead of ordinary management fees. We flag them by a
// positive guaranteed yield, or by classic-policy keywords in the product name.
function isOldGuaranteedPolicy(product) {
  const guaranteedYield = Number(product?.expectedReturn || 0);
  const text = `${product?.productType || ""} ${product?.planName || ""}`;
  return guaranteedYield > 0 || /משתתפת|עדיף|מבטח|קלאסי|ותיק|ישן/.test(text);
}

function computeWeightedFees(products) {
  const list = safeArray(products);
  const totalBalance = list.reduce((sum, p) => sum + Number(p.currentValue || 0), 0);
  const totalDeposit = list.reduce((sum, p) => sum + Number(p.monthlyDeposit || 0), 0);
  const feeFromBalance =
    totalBalance > 0
      ? list.reduce((sum, p) => sum + Number(p.managementFeeFromBalance || 0) * Number(p.currentValue || 0), 0) / totalBalance
      : 0;
  const feeFromDeposit =
    totalDeposit > 0
      ? list.reduce((sum, p) => sum + Number(p.managementFeeFromDeposit || 0) * Number(p.monthlyDeposit || 0), 0) / totalDeposit
      : 0;
  return { feeFromBalance, feeFromDeposit, totalBalance };
}

const formatFeePct = (value) => `${Number(value || 0).toFixed(2)}%`;

function ManagementFeesSection({ scope, detailedMembers }) {
  const members = safeArray(detailedMembers);
  const allProducts = members.flatMap((m) => safeArray(m.products));

  const weightedRows = [
    ...members.map((m) => ({ name: m.name, ...computeWeightedFees(m.products) })),
    { name: "תא משפחתי", isTotal: true, ...computeWeightedFees(allProducts) },
  ];

  const tableProducts = safeArray(scope?.products).filter(
    (p) => Number(p.currentValue || 0) > 0 || Number(p.managementFeeFromBalance || 0) > 0
  );

  return (
    <div>
      <SectionTitle
        title="דמי ניהול"
        subtitle="דמי ניהול משוקללים לפי צבירה לכל בן זוג ולתא המשפחתי, ופירוט דמי הניהול והמרווחים לכל מוצר."
      />

      <div class="client-panel">
        <h3>דמי ניהול משוקללים לפי צבירה</h3>
        <p class="client-panel-subtitle">ממוצע משוקלל לפי הצבירה בכל מוצר — לכל בן זוג ולתא המשפחתי.</p>
        <div class="client-table-wrap">
          <table class="client-table">
            <thead>
              <tr>
                <th>שיוך</th>
                <th>סך צבירה</th>
                <th>דמי ניהול מצבירה (משוקלל)</th>
                <th>דמי ניהול מהפקדה (משוקלל)</th>
              </tr>
            </thead>
            <tbody>
              {weightedRows.map((row, index) => (
                <tr key={index} class={row.isTotal ? "total-row" : ""}>
                  <td>{row.name}</td>
                  <td>{formatCurrency(row.totalBalance)}</td>
                  <td>{formatFeePct(row.feeFromBalance)}</td>
                  <td>{formatFeePct(row.feeFromDeposit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div class="client-panel client-margin-top">
        <h3>דמי ניהול לפי מוצר</h3>
        <p class="client-panel-subtitle">
          פירוט לכל פוליסה: דמי ניהול מצבירה ומהפקדה, מרווח ריאלי (לפוליסות ישנות — 15%) ומבטיחת תשואה.
        </p>
        {tableProducts.length ? (
          <div class="client-table-wrap">
            <table class="client-table">
              <thead>
                <tr>
                  <th>מוצר</th>
                  <th>גוף מנהל</th>
                  <th>מספר פוליסה</th>
                  <th>צבירה</th>
                  <th>דמי ניהול מצבירה</th>
                  <th>דמי ניהול מהפקדה</th>
                  <th>מרווח ריאלי</th>
                  <th>מבטיחת תשואה</th>
                </tr>
              </thead>
              <tbody>
                {tableProducts.map((product, index) => {
                  const guaranteedYield = Number(product.expectedReturn || 0);
                  const isOld = isOldGuaranteedPolicy(product);
                  return (
                    <tr key={product.id || index}>
                      <td>{product.planName || "—"}</td>
                      <td>{product.managerName || "—"}</td>
                      <td>{product.policyNo || "—"}</td>
                      <td>{formatCurrency(product.currentValue)}</td>
                      <td>{formatFeePct(product.managementFeeFromBalance)}</td>
                      <td>{formatFeePct(product.managementFeeFromDeposit)}</td>
                      <td>{isOld ? "15%" : "—"}</td>
                      <td>{guaranteedYield > 0 ? formatFeePct(guaranteedYield) : isOld ? "כן" : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div class="client-empty-state">לא נמצאו מוצרים עם נתוני דמי ניהול.</div>
        )}
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
      <div class="client-grid-2">
        <MetricBox title='סה"כ הלוואות' value={`${formatCurrency(totalAmount)}${ratio > 0 ? ` (${ratio.toFixed(1)}%)` : ""}`} icon={<BankIcon />} />
        <MetricBox title="יתרת הלוואות" value={formatCurrency(totalBalance)} icon="◔" />
      </div>
      <div class="client-table-wrap client-margin-top">
        {loans.length ? <table class="client-table"><thead><tr><th>שם</th><th>סכום הלוואה</th><th>יתרה</th><th>תדירות החזר</th><th>תאריך סיום</th></tr></thead><tbody>{loans.map((loan, index) => <tr key={loan.id || index}><td>{[loan.firstName, loan.familyName].filter(Boolean).join(" ") || loan.name || "—"}</td><td>{formatCurrency(loan.amount)}</td><td>{formatCurrency(loan.balance)}</td><td>{loan.repaymentFrequency || "—"}</td><td>{formatDate(loan.endDate)}</td></tr>)}</tbody></table> : <div class="client-empty-state">לא התקבל מידע על הלוואות להצגה.</div>}
      </div>
    </div>
  );
}



function normalizeCapitalClassificationSections(input = {}) {
  const directSections = safeArray(input.capitalClassification)
    .map((section, index) => ({
      owner: section?.owner || section?.ownerKey || section?.memberType || `capital-${index}`,
      ownerLabel: section?.ownerLabel || getCapitalOwnerLabel(section?.owner || section?.ownerKey || section?.memberType, index),
      sourceFileName: section?.sourceFileName || section?.fileName || "",
      pensionPolicies: safeArray(section?.pensionPolicies || section?.pensionFunds || section?.policies || section?.funds),
      studyFunds: safeArray(section?.studyFunds || section?.trainingFunds || section?.hishtalmutFunds),
    }))
    .filter((section) => section.pensionPolicies.length || section.studyFunds.length);

  if (directSections.length) return directSections;

  return [
    {
      owner: "spouseA",
      ownerLabel: "בן זוג",
      pensionPolicies: safeArray(input.spouseAPensionFunds),
      studyFunds: safeArray(input.spouseAStudyFunds),
    },
    {
      owner: "spouseB",
      ownerLabel: "בת זוג",
      pensionPolicies: safeArray(input.spouseBPensionFunds),
      studyFunds: safeArray(input.spouseBStudyFunds),
    },
  ].filter((section) => section.pensionPolicies.length || section.studyFunds.length);
}

function getCapitalOwnerLabel(owner, index = 0) {
  const text = String(owner || "").toLowerCase();
  if (text.includes("spouseb") || text.includes("wife") || text.includes("female") || text.includes("בת")) return "בת זוג";
  if (text.includes("spousea") || text.includes("husband") || text.includes("male") || text.includes("בן")) return "בן זוג";
  return index === 1 ? "בת זוג" : "בן זוג";
}

function getCapitalNumber(row, keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (value === null || value === undefined || value === "") continue;
    const number = parseReportNumber(value);
    if (Number.isFinite(number) && number !== 0) return number;
  }
  return 0;
}

function getCapitalText(row, keys) {
  return getFirstText(keys.map((key) => row?.[key]));
}

function getCapitalRowFundValue(row) {
  return getCapitalNumber(row, [
    "totalBalance",
    "totalFund",
    "totalFundValue",
    "fundValue",
    "accumulation",
    "balance",
    "totalBalanceValue",
    "סהכ קופה",
    "סה״כ קופה",
    "סהכ צבירה",
    "צבירה",
  ]);
}

function getCapitalSum(row, keys) {
  return keys.reduce((sum, key) => sum + getCapitalNumber(row, [key]), 0);
}

function getCapitalRowCompensationValue(row) {
  const explicit = getCapitalNumber(row, [
    "totalSeverance",
    "totalCompensation",
    "compensationTotal",
    "severanceTotal",
    "סהכ פיצוים",
    "סהכ פיצויים",
    "סה\"כ פיצויים",
  ]);

  if (explicit) return explicit;

  return getCapitalSum(row, [
    "capitalSeverance",
    "annuitySeverance",
    "currentEmployerSeveranceTaxable",
    "previousEmployersSeveranceRightsSequence",
    "liquidExemptSeverance",
    "capitalCompensation",
    "pensionCompensation",
    "taxableCompensation",
    "פיצויים הוניים",
    "פיצוים הונים",
    "פיצויים קצבתיים",
    "פיצוים קצבתיים",
    "פיצויים מעסיק נוכחי למס",
    "פיצויים ממעסיקים קודמים ברצף זכויות",
  ]);
}

function getCapitalRowPensionValue(row) {
  const components = getCapitalSum(row, [
    "annuityRewards",
    "pensionRewards",
    "annuitySeverance",
    "pensionCompensation",
    "previousEmployersSeveranceRightsSequence",
    "currentEmployerSeveranceTaxable",
    "taxableCompensation",
    "pension",
    "תגמולים קצבתיים",
    "פיצויים קצבתיים",
    "פיצויים מעסיק נוכחי למס",
    "פיצויים ממעסיקים קודמים ברצף זכויות",
    "פנסיה",
  ]);

  if (components) return components;

  return getCapitalNumber(row, ["totalPension", "pensionTotal", "סהכ קצבה", "סה״כ קצבה"]);
}

function getCapitalRowCapitalValue(row, isStudyFund = false) {
  if (isStudyFund) return getCapitalRowFundValue(row);

  const components = getCapitalSum(row, [
    "capitalRewards",
    "annuityRewardsUntil2000",
    "pre2000Rewards",
    "rewardsBefore2000",
    "capitalSeverance",
    "liquidExemptSeverance",
    "capitalCompensation",
    "liquidCompensation",
    "exemptCompensation",
    "תגמולים הוניים",
    "תגמולים קצבתיים עד 1.1.2000",
    "פיצויים הוניים",
  ]);

  if (components) return components;

  return getCapitalNumber(row, ["totalCapital", "capitalTotal", "סהכ הון", "סה״כ הון"]);
}

function getCapitalSummary(sections) {
  const rows = safeArray(sections).flatMap((section) => [
    ...safeArray(section.pensionPolicies).map((row) => ({ row, isStudyFund: false })),
    ...safeArray(section.studyFunds).map((row) => ({ row, isStudyFund: true })),
  ]);

  return rows.reduce((acc, item) => {
    const row = item.row || {};
    acc.totalFund += getCapitalRowFundValue(row);
    acc.totalRewards += getCapitalNumber(row, ["totalRewards", "rewardsTotal", "סהכ תגמולים", "סה\"כ תגמולים"]) || getCapitalSum(row, ["capitalRewards", "annuityRewardsUntil2000", "annuityRewards", "תגמולים הוניים", "תגמולים קצבתיים", "תגמולים קצבתיים עד 1.1.2000"]);
    acc.totalCompensation += getCapitalRowCompensationValue(row);
    acc.totalCapital += getCapitalRowCapitalValue(row, item.isStudyFund);
    acc.totalPension += item.isStudyFund ? 0 : getCapitalRowPensionValue(row);
    return acc;
  }, { totalFund: 0, totalRewards: 0, totalCompensation: 0, totalCapital: 0, totalPension: 0 });
}

function CapitalClassificationSection({ sections }) {
  const capitalSections = safeArray(sections);
  const summary = getCapitalSummary(capitalSections);

  if (!capitalSections.length) {
    return (
      <div>
        <SectionTitle title="פירוק נכסים" subtitle="בדוח הנוכחי לא נמצאו נתוני פירוק נכסים להצגה." />
        <div class="client-empty-state">אין נתונים להצגה באזור זה.</div>
      </div>
    );
  }

  return (
    <div>
      <SectionTitle
        title="פירוק נכסים"
        subtitle="פירוק מרכז של פוליסות, גמל, פנסיה וקרנות השתלמות לפי סיווג הוני / קצבתי, כפי שהועבר מה־REPORT."
      />

      <div class="client-report-like-shell client-capital-shell">
        <div class="client-capital-kpi-row">
          <CapitalKpi title="סה״כ קופה" value={summary.totalFund} />
          <CapitalKpi title="סה״כ תגמולים" value={summary.totalRewards} />
          <CapitalKpi title="סה״כ פיצויים" value={summary.totalCompensation} />
          <CapitalKpi title="סה״כ הון" value={summary.totalCapital} tone="capital" />
          <CapitalKpi title="סה״כ קצבה" value={summary.totalPension} tone="pension" />
        </div>

        <div class="client-capital-legend">
          <strong>מקרא סיווג כספים</strong>
          <span><i class="capital-dot pension" /> כספים קצבתיים / מיועדים לקצבה חודשית</span>
          <span><i class="capital-dot capital" /> כספים הוניים / נזילים / תגמולים עד 1.1.2000</span>
        </div>

        {capitalSections.map((section, index) => (
          <CapitalOwnerBlock key={`${section.owner || section.ownerLabel || "owner"}-${index}`} section={section} />
        ))}

        <div class="client-capital-note">
          כספים הוניים כוללים רכיבי הון, תגמולים הוניים ותגמולים קצבתיים עד שנת 1.1.2000. קרנות השתלמות מוצגות כצבירה בלבד.
        </div>
      </div>
    </div>
  );
}

function CapitalKpi({ title, value, tone = "default" }) {
  return (
    <div class={`client-capital-kpi ${tone}`}>
      <span>{title}</span>
      <strong>{formatCurrency(value)}</strong>
    </div>
  );
}

function getCapitalPensionTableTotals(rows) {
  return safeArray(rows).reduce((acc, row) => {
    acc.capitalRewards += getCapitalNumber(row, ["capitalRewards", "תגמולים הוניים"]);
    acc.pre2000Rewards += getCapitalNumber(row, ["annuityRewardsUntil2000", "pre2000Rewards", "rewardsBefore2000", "תגמולים קצבתיים עד 1.1.2000"]);
    acc.previousEmployerContinuity += getCapitalNumber(row, ["previousEmployersSeveranceRightsSequence", "previousEmployerContinuity", "previousEmployerSeveranceRights", "פיצויים ממעסיקים קודמים ברצף זכויות"]);
    acc.currentEmployerTax += getCapitalNumber(row, ["currentEmployerSeveranceTaxable", "taxableCompensation", "currentEmployerCompensationTax", "פיצויים מעסיק נוכחי למס"]);
    acc.totalPension += getCapitalRowPensionValue(row);
    acc.totalCapital += getCapitalRowCapitalValue(row, false);
    return acc;
  }, {
    capitalRewards: 0,
    pre2000Rewards: 0,
    previousEmployerContinuity: 0,
    currentEmployerTax: 0,
    totalPension: 0,
    totalCapital: 0,
  });
}

const CapitalOwnerBlock = defineComponent({
  name: "CapitalOwnerBlock",
  props: { section: { type: Object, default: null } },
  setup(props) {
    const openRowsRef = ref({});
    return () => {
      const { section } = props;
      const openRows = openRowsRef.value;
      const setOpenRows = (u) => {
        openRowsRef.value = typeof u === "function" ? u(openRowsRef.value) : u;
      };
      const pensionRows = safeArray(section?.pensionPolicies);
      const studyRows = safeArray(section?.studyFunds);
      const pensionTotals = getCapitalPensionTableTotals(pensionRows);
      const studyTotal = studyRows.reduce((sum, row) => sum + getCapitalRowFundValue(row), 0);

      const toggleRow = (row, index) => {
        const key = row?.id || `${row?.productType || "capital"}-${index}`;
        setOpenRows((prev) => ({ ...prev, [key]: !prev[key] }));
      };

  return (
    <div class="client-report-panel client-capital-owner-panel">
      <div class="client-report-table-heading">
        <div>
          <div class="client-report-panel-title">פירוק נכסים ללקוח {section?.ownerLabel || "—"}</div>
          <p>{section?.sourceFileName ? `מקור הנתונים: ${section.sourceFileName}` : "חלוקה לפי פוליסות, גמל, פנסיה וקרנות השתלמות."}</p>
        </div>
      </div>

      {pensionRows.length ? (
        <div class="client-margin-top">
          <div class="client-capital-subtitle">פוליסות / גמל / פנסיה</div>
          <div class="client-table-wrap">
            <table class="client-table client-capital-table">
              <thead>
                <tr>
                  <th>מוצר / קבוצה</th>
                  <th>תגמולים הוניים</th>
                  <th>תגמולים קצבתיים עד 1.1.2000</th>
                  <th>פיצויים ממעסיקים קודמים ברצף זכויות</th>
                  <th>פיצויים מעסיק נוכחי למס</th>
                  <th>סה״כ קצבה</th>
                  <th>סה״כ הון</th>
                </tr>
              </thead>
              <tbody>
                {pensionRows.map((row, index) => {
                  const key = row?.id || `${row?.productType || "capital"}-${index}`;
                  return (
                    <Fragment key={key}>
                      <CapitalPensionRow row={row} index={index} isOpen={Boolean(openRows[key])} onToggle={() => toggleRow(row, index)} />
                      {openRows[key] ? <CapitalGroupedDetailsRow row={row} /> : null}
                    </Fragment>
                  );
                })}
                <tr class="total-row client-capital-total-row">
                  <td>סה״כ</td>
                  <td>{formatCurrency(pensionTotals.capitalRewards)}</td>
                  <td>{formatCurrency(pensionTotals.pre2000Rewards)}</td>
                  <td>{formatCurrency(pensionTotals.previousEmployerContinuity)}</td>
                  <td>{formatCurrency(pensionTotals.currentEmployerTax)}</td>
                  <td class="pension-total">{formatCurrency(pensionTotals.totalPension)}</td>
                  <td class="capital-total">{formatCurrency(pensionTotals.totalCapital)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {studyRows.length ? (
        <div class="client-margin-top">
          <div class="client-capital-subtitle">קרנות השתלמות</div>
          <div class="client-table-wrap client-capital-study-wrap">
            <table class="client-table client-capital-study-table">
              <thead>
                <tr>
                  <th>קופה / קבוצה</th>
                  <th>צבירה</th>
                </tr>
              </thead>
              <tbody>
                {studyRows.map((row, index) => <CapitalStudyRow key={row?.id || index} row={row} index={index} />)}
                <tr class="total-row">
                  <td>סה״כ</td>
                  <td>{formatCurrency(studyTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
    };
  },
});

function CapitalPensionRow({ row, index = 0, isOpen = false, onToggle = () => {} }) {
  const productType = getCapitalText(row, ["productType", "productGroup", "productName", "type", "מוצר / קבוצה", "סוג מוצר"]) || "—";
  const sourceRows = safeArray(row?.sourceRows);
  const hasDetails = sourceRows.length > 0;
  const capitalRewards = getCapitalNumber(row, ["capitalRewards", "תגמולים הוניים"]);
  const pre2000Rewards = getCapitalNumber(row, ["annuityRewardsUntil2000", "pre2000Rewards", "rewardsBefore2000", "תגמולים קצבתיים עד 1.1.2000"]);
  const previousEmployerContinuity = getCapitalNumber(row, ["previousEmployersSeveranceRightsSequence", "previousEmployerContinuity", "previousEmployerSeveranceRights", "פיצויים ממעסיקים קודמים ברצף זכויות"]);
  const currentEmployerTax = getCapitalNumber(row, ["currentEmployerSeveranceTaxable", "taxableCompensation", "currentEmployerCompensationTax", "פיצויים מעסיק נוכחי למס"]);
  const totalPension = getCapitalRowPensionValue(row);
  const totalCapital = getCapitalRowCapitalValue(row, false);

  return (
    <tr>
      <td class="client-capital-product-cell">
        {hasDetails ? (
          <button type="button" class="client-capital-expand-button" onClick={onToggle} aria-expanded={isOpen} title="הצגת התוכניות המקובצות">
            <span>{isOpen ? "−" : "+"}</span>
          </button>
        ) : null}
        <strong>{productType}</strong>
        {hasDetails ? <small>{sourceRows.length} תוכניות מקובצות</small> : null}
      </td>
      <td>{capitalRewards ? formatCurrency(capitalRewards) : "—"}</td>
      <td>{pre2000Rewards ? formatCurrency(pre2000Rewards) : "—"}</td>
      <td>{previousEmployerContinuity ? formatCurrency(previousEmployerContinuity) : "—"}</td>
      <td>{currentEmployerTax ? formatCurrency(currentEmployerTax) : "—"}</td>
      <td>{totalPension ? formatCurrency(totalPension) : "—"}</td>
      <td>{totalCapital ? formatCurrency(totalCapital) : "—"}</td>
    </tr>
  );
}

function CapitalGroupedDetailsRow({ row }) {
  const sourceRows = safeArray(row?.sourceRows);

  if (!sourceRows.length) return null;

  return (
    <tr class="client-capital-details-row">
      <td colspan={7}>
        <div class="client-capital-details-box">
          <div class="client-capital-details-title">התוכניות שנכללו בקבוצה</div>
          <div class="client-table-wrap client-capital-inner-wrap">
            <table class="client-table client-capital-inner-table">
              <thead>
                <tr>
                  <th>חברה מנהלת</th>
                  <th>שם תוכנית</th>
                  <th>מספר פוליסה / קופה</th>
                  <th>סה״כ קופה</th>
                  <th>סה״כ תגמולים</th>
                  <th>סה״כ פיצויים</th>
                </tr>
              </thead>
              <tbody>
                {sourceRows.map((item, index) => (
                  <tr key={item?.id || index}>
                    <td>{getCapitalText(item, ["managerName", "managingCompany", "companyName", "issuerName", "חברה מנהלת", "שם יצרן"]) || "—"}</td>
                    <td>{getCapitalText(item, ["planName", "productName", "שם תוכנית", "שם תכנית"]) || "—"}</td>
                    <td>{getCapitalText(item, ["policyNumber", "policyNo", "fundNumber", "מספר פוליסה", "מספר קופה"]) || "—"}</td>
                    <td>{formatCurrency(getCapitalRowFundValue(item))}</td>
                    <td>{formatCurrency(getCapitalNumber(item, ["totalRewards", "rewardsTotal", "סהכ תגמולים", "סה\"כ תגמולים"]) || getCapitalSum(item, ["capitalRewards", "annuityRewardsUntil2000", "annuityRewards"]))}</td>
                    <td>{formatCurrency(getCapitalRowCompensationValue(item))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </td>
    </tr>
  );
}

const CapitalStudyRow = defineComponent({
  name: "CapitalStudyRow",
  props: {
    row: { type: Object, default: null },
    index: { type: Number, default: 0 },
  },
  setup(props) {
    const isOpenRef = ref(false);
    return () => {
      const { row, index } = props;
      const isOpen = isOpenRef.value;
      const setIsOpen = (u) => {
        isOpenRef.value = typeof u === "function" ? u(isOpenRef.value) : u;
      };
      const sourceRows = safeArray(row?.sourceRows);
      const hasDetails = sourceRows.length > 0;
      const policyNumber = getCapitalText(row, ["policyNumber", "fundNumber", "policyNo", "מספר קופה", "מספר פוליסה"]) || getCapitalText(row, ["productType", "productGroup", "productName", "type", "מוצר / קבוצה", "סוג מוצר"]) || "קרן השתלמות";
      const totalFund = getCapitalRowFundValue(row);

  return (
    <>
      <tr>
        <td class="client-capital-product-cell">
          {hasDetails ? (
            <button type="button" class="client-capital-expand-button" onClick={() => setIsOpen((prev) => !prev)} aria-expanded={isOpen} title="הצגת הקרנות המקובצות">
              <span>{isOpen ? "−" : "+"}</span>
            </button>
          ) : null}
          <strong>{policyNumber}</strong>
          {hasDetails ? <small>{sourceRows.length} קרנות מקובצות</small> : null}
        </td>
        <td>{totalFund ? formatCurrency(totalFund) : "—"}</td>
      </tr>
      {isOpen ? <CapitalStudyDetailsRow row={row} /> : null}
    </>
  );
    };
  },
});

function CapitalStudyDetailsRow({ row }) {
  const sourceRows = safeArray(row?.sourceRows);

  if (!sourceRows.length) return null;

  return (
    <tr class="client-capital-details-row">
      <td colspan={2}>
        <div class="client-capital-details-box">
          <div class="client-capital-details-title">הקרנות שנכללו בקבוצה</div>
          <div class="client-table-wrap client-capital-inner-wrap">
            <table class="client-table client-capital-inner-table">
              <thead>
                <tr>
                  <th>חברה מנהלת</th>
                  <th>שם תוכנית</th>
                  <th>מספר קופה</th>
                  <th>צבירה</th>
                </tr>
              </thead>
              <tbody>
                {sourceRows.map((item, index) => (
                  <tr key={item?.id || index}>
                    <td>{getCapitalText(item, ["managerName", "managingCompany", "companyName", "issuerName", "חברה מנהלת", "שם יצרן"]) || "—"}</td>
                    <td>{getCapitalText(item, ["planName", "productName", "שם תוכנית", "שם תכנית"]) || "—"}</td>
                    <td>{getCapitalText(item, ["policyNumber", "fundNumber", "policyNo", "מספר קופה", "מספר פוליסה"]) || "—"}</td>
                    <td>{formatCurrency(getCapitalRowFundValue(item))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </td>
    </tr>
  );
}


function normalizeSection28Text(value) {
  return String(value || "")
    .replace(/[״”"]/g, '"')
    .replace(/[׳’']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function section28NumericValue(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

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

function formatSection28DisplayValue(value) {
  if (value === null || value === undefined || String(value).trim() === "") return "—";

  if (typeof value === "number" && Number.isFinite(value)) {
    const abs = Math.abs(value);
    if (abs > 0 && abs < 1) {
      return `${(value * 100).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;
    }
    return `₪${Math.round(value).toLocaleString("en-US")}`;
  }

  const text = String(value).trim();
  if (/^-?\d+(\.\d+)?$/.test(text)) {
    const number = Number(text);
    if (Math.abs(number) > 0 && Math.abs(number) < 1) {
      return `${(number * 100).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;
    }
    return `₪${Math.round(number).toLocaleString("en-US")}`;
  }

  if (/[₪%\d]/.test(text)) return text;
  return "אין נתון";
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

function pickSection28Rows(rows, labelParts) {
  return labelParts
    .map((part) => rows.find((row) => normalizeSection28Text(row.label).includes(part)))
    .filter(Boolean);
}

function Section28Section({ section28Capping }) {
  const entries = Array.isArray(section28Capping)
    ? section28Capping
    : section28Capping
    ? [section28Capping]
    : [];

  if (!entries.length) {
    return (
      <div>
        <SectionTitle title="קיטום סעיף 28" subtitle="בדוח הנוכחי לא נמצאו נתוני קיטום סעיף 28 להצגה." />
        <div class="client-empty-state">אין נתונים להצגה באזור זה.</div>
      </div>
    );
  }

  return (
    <div>
      <SectionTitle title="קיטום סעיף 28" />

      <div class="client-report-like-shell">
        {entries.map((entry, entryIndex) => {
          const groups = safeArray(entry?.groups);
          const comparisonRows = safeArray(entry?.comparisonRows);
          const costGroup = getSection28Group(groups, "employer-cost", "עלויות");
          const savingGroup = getSection28Group(groups, "saving-simulation", "סימולציה לחיסכון");
          const retirementGroup = getSection28Group(groups, "retirement", "סימולציה לגיל פרישה");
          const renderedGroupIds = new Set([costGroup?.id, savingGroup?.id, retirementGroup?.id, "base"].filter(Boolean));
          const otherGroups = groups.filter(
            (group) => !renderedGroupIds.has(group?.id) && !normalizeSection28Text(group?.title).includes("נתוני בסיס")
          );

          return (
            <div class="client-report-owner-block" key={`${entry?.owner || "owner"}-${entry?.sourceFileName || entryIndex}`}>
              <div class="client-owner-block-title">קיטום סעיף 28 — {entry?.ownerLabel || "בן/בת זוג"}</div>


              {costGroup ? <Section28CostSplit group={costGroup} /> : null}
              {savingGroup ? <Section28SavingSimulation group={savingGroup} /> : null}
              {comparisonRows.length ? <Section28ComparisonTable rows={comparisonRows} /> : null}
              {retirementGroup ? <Section28RetirementSimulation group={retirementGroup} /> : null}

              {otherGroups.length ? (
                <div class="client-special-grid client-margin-top">
                  {otherGroups.map((group) => (
                    <Section28GenericGroup key={group.id || group.title} group={group} />
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Section28CostSplit({ group }) {
  const rows = safeArray(group?.rows).filter((row) => isMeaningfulSection28Value(row.value));
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
    "גידול בנטו בעקבות קיטום קה\"ש מעל לתקרה",
    "הפרשות עובד קה\"ש מעל תקרה",
    "הפרשות עובד תגמולים",
  ]);

  const employeeSummaryRows = pickSection28Rows(rows, [
    'סה"כ גידול נטו',
    "סה״כ גידול נטו",
    "סך הכל גידול נטו",
  ]);

  return (
    <div class="client-report-panel">
      <div class="client-report-panel-title">פירוט עלויות עובד / מעסיק</div>
      <div class="client-section28-two-cols">
        <div class="client-section28-subcard">
          <div class="client-section28-subtitle">חלק מעסיק</div>
          {employerRows.map((row, index) => <Section28DataRow key={`${row.label}-${index}`} row={row} />)}
          {employerSummaryRows.map((row, index) => <Section28DataRow key={`${row.label}-summary-${index}`} row={row} forceHighlight />)}
          {!employerRows.length && !employerSummaryRows.length ? <Section28EmptyNote /> : null}
        </div>

        <div class="client-section28-subcard">
          <div class="client-section28-subtitle">חלק עובד</div>
          {employeeRows.map((row, index) => <Section28DataRow key={`${row.label}-${index}`} row={row} />)}
          {employeeSummaryRows.map((row, index) => <Section28DataRow key={`${row.label}-summary-${index}`} row={row} forceHighlight />)}
          {!employeeRows.length && !employeeSummaryRows.length ? <Section28EmptyNote /> : null}
        </div>
      </div>

      {monthlyRow ? <Section28MonthlySavingRow row={monthlyRow} /> : null}
    </div>
  );
}

function Section28SavingSimulation({ group }) {
  const rows = safeArray(group?.rows).filter((row) => isMeaningfulSection28Value(row.value));
  const wanted = ["סכום צבירה ברוטו", "הפקדות נומינליות", "צבירת סכום נטו בחיסכון אישי"];
  const selectedRows = wanted
    .map((label) => rows.find((row) => normalizeSection28Text(row.label).includes(label)))
    .filter(Boolean);

  if (!selectedRows.length) return null;

  return (
    <div class="client-report-panel client-margin-top">
      <div class="client-report-panel-title">סימולציה לחיסכון</div>
      <div class="client-section28-metric-grid">
        {selectedRows.map((row, index) => (
          <Section28KpiBox
            key={`${row.label}-${index}`}
            row={row}
            highlight={normalizeSection28Text(row.label).includes("צבירת סכום נטו בחיסכון אישי")}
          />
        ))}
      </div>
    </div>
  );
}

function Section28RetirementSimulation({ group }) {
  const rows = safeArray(group?.rows).filter((row) => isMeaningfulSection28Value(row.value));
  const interestRow = rows.find((row) => normalizeSection28Text(row.label).includes("ריבית שנתית"));
  const yearsRow = rows.find((row) => normalizeSection28Text(row.label).includes("תקופת משיכה בשנים"));
  const displayRows = rows
    .filter((row) => {
      const label = normalizeSection28Text(row.label);
      return !label.includes("תגמול נדחה") && !label.includes("ריבית שנתית") && !label.includes("תקופת משיכה בשנים");
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
    <div class="client-report-panel client-margin-top">
      <div class="client-report-panel-title">סימולציה לגיל פרישה{meta ? ` (${meta})` : ""}</div>
      <div class="client-section28-metric-grid">
        {displayRows.map((row, index) => <Section28KpiBox key={`${row.label}-${index}`} row={row} />)}
      </div>
    </div>
  );
}

function Section28GenericGroup({ group }) {
  const rows = safeArray(group?.rows).filter((row) => isMeaningfulSection28Value(row.value));
  if (!rows.length) return null;

  return (
    <div class="client-report-panel">
      <div class="client-report-panel-title">{group.title || "פירוט נוסף"}</div>
      {rows.map((row, index) => (
        <Section28DataRow key={`${row.label}-${index}`} row={row} forceHighlight={isSection28ImportantRow(row.label)} />
      ))}
    </div>
  );
}

function Section28DataRow({ row, forceHighlight = false }) {
  const isHighlighted = forceHighlight || isSection28ImportantRow(row.label);
  return (
    <div class={isHighlighted ? "client-section28-row highlighted" : "client-section28-row"}>
      <div class="client-section28-row-label">{row.label || "—"}</div>
      <div class="client-section28-row-value">{formatSection28DisplayValue(row.value)}</div>
    </div>
  );
}

function Section28KpiBox({ row, highlight = false }) {
  return (
    <div class={highlight ? "client-report-kpi-box highlighted" : "client-report-kpi-box"}>
      <span>{row.label || "—"}</span>
      <strong>{formatSection28DisplayValue(row.value)}</strong>
    </div>
  );
}

function Section28MonthlySavingRow({ row }) {
  return (
    <div class="client-section28-monthly">
      <span>{row.label}</span>
      <strong>{formatSection28DisplayValue(row.value)}</strong>
    </div>
  );
}

function Section28EmptyNote() {
  return <div class="client-empty-state compact">אין נתון להצגה</div>;
}

function Section28ComparisonTable({ rows }) {
  return (
    <div class="client-report-panel client-margin-top">
      <div class="client-report-panel-title">השוואה בין תרחישים</div>
      <div class="client-table-wrap">
        <table class="client-table client-section28-table" style={px({ width: "100%" })}>
          <thead>
            <tr>
              <th>סעיף</th>
              <th>לפני קיטום</th>
              <th>אחרי קיטום</th>
              <th>פער בין תרחישים</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const isTotal = normalizeSection28Text(row.label).includes('סה"כ') || normalizeSection28Text(row.label).includes("סה״כ");
              return (
                <tr key={`${row.label}-${index}`} class={isTotal ? "total-row" : ""}>
                  <td>{row.label || "—"}</td>
                  <td>{section28NumericValue(row.before) !== 0 ? formatSection28DisplayValue(row.before) : ""}</td>
                  <td>{section28NumericValue(row.after) !== 0 ? formatSection28DisplayValue(row.after) : ""}</td>
                  <td>{section28NumericValue(row.gap) !== 0 ? formatSection28DisplayValue(row.gap) : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Section28ComparisonBars rows={rows} />
    </div>
  );
}

function Section28ComparisonBars({ rows }) {
  const chartRows = rows.filter((row) => {
    const label = normalizeSection28Text(row.label).replace(/סהכ/g, 'סה"כ');
    const isWantedRow = label === "קצבה" || label.includes('סה"כ הון') || label.includes("סה״כ הון");
    return isWantedRow && (isMeaningfulSection28Value(row.before) || isMeaningfulSection28Value(row.after));
  });

  if (!chartRows.length) return <div class="client-empty-state">אין נתונים לגרף השוואה.</div>;

  return (
    <div class="client-section28-bars-card">
      <div class="client-report-panel-title small">גרף השוואה</div>
      {chartRows.map((row, index) => {
        const before = Math.abs(section28NumericValue(row.before));
        const after = Math.abs(section28NumericValue(row.after));
        const rowMaxValue = Math.max(before, after, 1);
        const isPensionRow = normalizeSection28Text(row.label) === "קצבה";
        const beforeClass = before >= after ? "primary" : "muted";
        const afterClass = after >= before ? "primary" : "muted";
        const beforeBar = { value: before, displayValue: row.before, className: beforeClass };
        const afterBar = { value: after, displayValue: row.after, className: afterClass };
        const orderedBars = beforeClass === "primary" ? [beforeBar, afterBar] : [afterBar, beforeBar];

        return (
          <div class="client-section28-bar-group" key={`${row.label}-${index}`}>
            <div class="client-section28-bar-title">{row.label}</div>
            {orderedBars.map((bar, barIndex) => (
              <div key={barIndex} class="client-section28-bar-row">
                <strong>{formatSection28DisplayValue(bar.displayValue)}</strong>
                <div class="client-section28-bar-track">
                  <div class={`client-section28-bar-fill ${bar.className}`} style={px({ width: `${Math.max((bar.value / rowMaxValue) * 100, bar.value ? 4 : 0)}%` })} />
                </div>
              </div>
            ))}
          </div>
        );
      })}
      <div class="client-section28-bar-legend"><span>■ לפני</span><span>■ אחרי</span></div>
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
  return text || "—";
}

function parseReportNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const clean = String(value || "").replace(/[₪,\s]/g, "").replace(/[^\d.-]/g, "");
  const number = Number(clean);
  return Number.isFinite(number) ? number : 0;
}

function formatReportNumber(value, decimals = 0) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "—";
  return number.toLocaleString("he-IL", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function isVestedTotalRow(row) {
  const name = String(row?.fundName || "").replace(/[״"]/g, "");
  return name.includes("סהכ") || name.includes('סה"כ') || name.includes("סה״כ");
}

function getPdfExemptPaymentsTotal(rows) {
  const pdfRows = safeArray(rows);
  if (!pdfRows.length) return 0;

  const totalRowValues = pdfRows
    .filter(isVestedTotalRow)
    .map((row) => parseReportNumber(row.exemptPayments))
    .filter((value) => value > 0);

  if (totalRowValues.length) return Math.max(...totalRowValues);

  return pdfRows
    .filter((row) => !isVestedTotalRow(row))
    .map((row) => parseReportNumber(row.exemptPayments))
    .filter((value) => value > 0)
    .reduce((sum, value) => sum + value, 0);
}

function getManualRecognizedPensionRows(adjustments) {
  return safeArray(adjustments)
    .filter((item) => item?.companyName && Number(item?.amount || 0) > 0)
    .map((item, index) => ({
      id: `manual-recognized-pension-${index}`,
      companyName: normalizeInsuranceName(item.companyName),
      amount: Number(item.amount || 0),
    }));
}

function RecognizedPensionSection({ entries = [] }) {
  const safeEntries = safeArray(entries).filter(hasRecognizedPensionRows);

  if (!safeEntries.length) {
    return (
      <div>
        <SectionTitle title="קצבה מוכרת" subtitle="בדוח הנוכחי לא נמצאו נתוני קצבה מוכרת להצגה." />
        <div class="client-empty-state">אין נתונים להצגה באזור זה.</div>
      </div>
    );
  }

  return (
    <div>
      <SectionTitle title="קצבה מוכרת" />

      <div class="client-report-like-shell">
        {safeEntries.map((entry, entryIndex) => {
          const vestedBalanceTable = entry?.vestedBalanceTable || null;
          const recognizedPensionAdjustments = safeArray(entry?.recognizedPensionAdjustments);
          const pdfRows = safeArray(vestedBalanceTable?.rows);
          const manualRows = getManualRecognizedPensionRows(recognizedPensionAdjustments);
          const pdfTotal = getPdfExemptPaymentsTotal(pdfRows);
          const manualTotal = manualRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);

          return (
            <div class="client-report-owner-block" key={`${entry?.owner || "owner"}-${entryIndex}`}>
              <div class="client-owner-block-title">קצבה מוכרת — {entry?.ownerLabel || "בן/בת זוג"}</div>


              {pdfRows.length ? <VestedPdfCalculationTable rows={pdfRows} pdfTotal={pdfTotal} /> : null}
              {manualRows.length ? <ManualRecognizedPensionTable rows={manualRows} manualTotal={manualTotal} /> : null}
              {pdfTotal > 0 && manualTotal > 0 ? <TaxSavingGapSummary pdfTotal={pdfTotal} manualTotal={manualTotal} /> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function VestedPdfCalculationTable({ rows, pdfTotal }) {
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
    <div class="client-report-panel">
      <div class="client-report-table-heading">
        <div>
          <div class="client-report-panel-title">טבלת חישוב מתוך PDF</div>
          <p>הטבלה מציגה את נתוני הצבירה המוכרת כפי שנקראו מהמסמך.</p>
        </div>
        <div class="client-report-pill">סה״כ תשלומים פטורים: {formatReportNumber(pdfTotal)}</div>
      </div>

      <div class="client-table-wrap">
        <table class="client-table client-vested-table">
          <thead>
            <tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id || index} class={isVestedTotalRow(row) ? "total-row" : ""}>
                {columns.map((column) => <td key={column.key}>{row[column.key] || "—"}</td>)}
              </tr>
            ))}
            <tr class="total-row">
              {columns.map((column) => (
                <td key={column.key}>{column.key === "fundName" ? "סה״כ טבלת PDF" : column.key === "exemptPayments" ? formatReportNumber(pdfTotal) : "—"}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ManualRecognizedPensionTable({ rows, manualTotal }) {
  return (
    <div class="client-report-panel client-margin-top">
      <div class="client-report-table-heading">
        <div>
          <div class="client-report-panel-title">קצבה מוכרת שהוזנה ידנית</div>
          <p>הטבלה מציגה את הסכומים שהוזנו במסך ההעלאה לפי חברת ביטוח.</p>
        </div>
        <div class="client-report-pill gold">סה״כ קצבה מוכרת: {formatReportNumber(manualTotal)}</div>
      </div>

      <div class="client-table-wrap client-manual-table-wrap">
        <table class="client-table client-manual-recognized-table">
          <thead><tr><th>חברת ביטוח</th><th>קצבה מוכרת שהוזנה</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}><td>{row.companyName}</td><td>{formatReportNumber(row.amount)}</td></tr>
            ))}
            <tr class="total-row"><td>סה״כ</td><td>{formatReportNumber(manualTotal)}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TaxSavingGapSummary({ pdfTotal, manualTotal }) {
  const gap = pdfTotal - manualTotal;
  return (
    <div class="client-tax-gap-summary">
      <div>
        <h3>פער הצבירה לחיסכון במס</h3>
        <p>חישוב לפי סה״כ טבלת ה־PDF פחות סה״כ הקצבה המוכרת שהוזנה ידנית.</p>
      </div>
      <strong>{formatReportNumber(gap)}</strong>
    </div>
  );
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function handleMockEmailSend() {
  alert("שליחת מייל תתווסף בהמשך. כרגע זה כפתור דמה בלבד.");
}

function openRichTextPdf(title, htmlContent, scopeName) {
  const printWindow = window.open("", "_blank", "width=900,height=700");

  if (!printWindow) {
    alert("הדפדפן חסם את חלון ההדפסה. יש לאפשר popups ולנסות שוב.");
    return;
  }

  const safeHtml = htmlContent && htmlContent.trim() ? htmlContent : "<p>לא הוזן תוכן.</p>";
  const today = new Intl.DateTimeFormat("he-IL").format(new Date());

  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4 portrait; margin: 14mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    html, body { margin: 0; padding: 0; direction: rtl; font-family: Calibri, Arial, sans-serif; color: #102A43; background: #ffffff; }
    .rt-brand { display: flex; align-items: center; gap: 14px; padding-bottom: 16px; border-bottom: 3px solid #00215D; margin-bottom: 22px; }
    .rt-logo { width: 54px; height: 54px; border-radius: 50%; background: #00215D; position: relative; box-shadow: 0 8px 20px rgba(0,33,93,.16); flex: 0 0 54px; }
    .rt-logo::before, .rt-logo::after { content: ""; position: absolute; width: 26px; height: 8px; border-radius: 999px; right: 14px; transform: rotate(-35deg); }
    .rt-logo::before { top: 17px; background: #FF2756; }
    .rt-logo::after { top: 28px; background: #ffffff; }
    .rt-brand-title { color: #00215D; font-size: 22px; font-weight: 900; line-height: 1.15; }
    .rt-brand-subtitle { color: #627D98; font-size: 12px; font-weight: 700; margin-top: 4px; }
    h1 { margin: 0 0 6px; color: #00215D; font-size: 26px; line-height: 1.25; font-weight: 900; }
    .rt-meta { color: #627D98; font-size: 13px; margin: 0 0 18px; }
    .rt-box { border: 1px solid #E2D1BF; border-radius: 16px; padding: 18px; background: #FCFBF8; font-size: 14.5px; line-height: 1.8; word-break: break-word; }
    .rt-box p { margin: 0 0 10px; }
    .rt-box ul, .rt-box ol { margin: 0 0 10px; padding-inline-start: 22px; }
    .rt-box b, .rt-box strong { font-weight: 900; }
  </style>
</head>
<body>
  <header class="rt-brand">
    <div class="rt-logo" aria-hidden="true"></div>
    <div>
      <div class="rt-brand-title">צבירן</div>
      <div class="rt-brand-subtitle">דוח פנסיוני משפחתי מאוחד</div>
    </div>
  </header>
  <h1>${escapeHtml(title)}</h1>
  <p class="rt-meta">${escapeHtml(scopeName || "")} · ${today}</p>
  <div class="rt-box">${safeHtml}</div>
  <script>
    window.onload = function () {
      window.focus();
      window.print();
    };
  </script>
</body>
</html>`);
  printWindow.document.close();
}

function downloadSummaryPdf(html, scopeName) {
  openRichTextPdf("סיכום שיחה", html, scopeName);
}

function downloadAgentNotePdf(html, scopeName) {
  openRichTextPdf("נקודה לטיפול סוכן", html, scopeName);
}

function RichTextToolbar({ onCommand }) {
  const buttons = [
    { command: "bold", label: "מודגש", icon: <b>B</b> },
    { command: "italic", label: "נטוי", icon: <i>I</i> },
    { command: "underline", label: "קו תחתון", icon: <u>U</u> },
    { command: "insertUnorderedList", label: "רשימת תבליטים", icon: "•" },
    { command: "insertOrderedList", label: "רשימה ממוספרת", icon: "1." },
  ];

  return (
    <div class="client-rich-toolbar">
      {buttons.map((btn) => (
        <button
          key={btn.command}
          type="button"
          title={btn.label}
          class="client-rich-toolbar-button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onCommand(btn.command)}
        >
          {btn.icon}
        </button>
      ))}
    </div>
  );
}

const RichTextEditor = defineComponent({
  name: "RichTextEditor",
  props: {
    value: { default: "" },
    onChange: { type: Function, default: () => {} },
    placeholder: { default: "" },
  },
  setup(props) {
    const editableRef = ref(null);

    onMounted(() => {
      if (editableRef.value) {
        editableRef.value.innerHTML = props.value || "";
      }
    });

    return () => {
      const { onChange, placeholder } = props;

      const handleInput = () => {
        onChange(editableRef.value?.innerHTML || "");
      };

      const handleCommand = (command) => {
        editableRef.value?.focus();
        document.execCommand(command, false, null);
        handleInput();
      };

      const handlePaste = (event) => {
        event.preventDefault();
        const text = event.clipboardData.getData("text/plain");
        document.execCommand("insertText", false, text);
      };

      return (
        <div class="client-rich-editor">
          <RichTextToolbar onCommand={handleCommand} />
          <div
            ref={editableRef}
            class="client-rich-editable"
            contenteditable="true"
            onInput={handleInput}
            onPaste={handlePaste}
            data-placeholder={placeholder}
          />
        </div>
      );
    };
  },
});

const ConversationSummarySection = defineComponent({
  name: "ConversationSummarySection",
  props: {
    scope: { type: Object, default: null },
    clientModel: { type: Object, default: null },
    reportData: { type: Object, default: null },
    isSharedMode: { type: Boolean, default: false },
    onUpdateReportData: { type: Function, default: () => {} },
    printMode: { type: Boolean, default: false },
  },
  setup(props) {
    const summaryDraftRef = ref(
      props.reportData?.conversationSummary ||
        props.reportData?.clientConversationSummary ||
        props.clientModel?.conversationSummary ||
        ""
    );
    const agentNoteDraftRef = ref(props.reportData?.agentHandlingNote || "");

    return () => {
      const { scope, clientModel, reportData, isSharedMode, onUpdateReportData, printMode } = props;
      const savedSummary = reportData?.conversationSummary || reportData?.clientConversationSummary || clientModel?.conversationSummary || "";
      const savedAgentNote = reportData?.agentHandlingNote || "";
      const fallbackSummary = `כאן יוצג סיכום השיחה עם הלקוח עבור ${scope.name}. בשלב זה זהו אזור הכנה, וניתן לחבר אליו בהמשך שדה טקסט מה־REPORT או ממנגנון שמירת הדוח.`;

      const summaryDraft = summaryDraftRef.value;
      const agentNoteDraft = agentNoteDraftRef.value;
      const setSummaryDraft = (v) => {
        summaryDraftRef.value = v;
      };
      const setAgentNoteDraft = (v) => {
        agentNoteDraftRef.value = v;
      };

  const handleSummaryChange = (html) => {
    setSummaryDraft(html);
    onUpdateReportData({ conversationSummary: html, clientConversationSummary: html, summaryText: html });
  };

  const handleAgentNoteChange = (html) => {
    setAgentNoteDraft(html);
    onUpdateReportData({ agentHandlingNote: html });
  };

  if (isSharedMode || printMode) {
    return (
      <div>
        <SectionTitle title="סיכום שיחה" subtitle="אזור ייעודי להצגת סיכום פגישה ותובנות ללקוח." />
        <div class="client-panel">
          <h3>סיכום שיחה</h3>
          {savedSummary ? (
            <div class="client-rich-readonly" innerHTML={savedSummary} />
          ) : (
            <div class="client-rich-readonly">{fallbackSummary}</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <SectionTitle title="סיכום שיחה" subtitle="כתיבה ישירה מהמסך — סיכום השיחה יתעדכן בדוח ה־PDF המלא." />
      <div class="client-panel">
        <h3>סיכום שיחה</h3>
        <RichTextEditor value={summaryDraft} onChange={handleSummaryChange} placeholder={fallbackSummary} />
        <div class="client-action-buttons">
          <button type="button" class="client-action-button primary" onClick={() => downloadSummaryPdf(summaryDraft, scope.name)}>הורדת PDF</button>
          <button type="button" class="client-action-button" onClick={handleMockEmailSend}>שליחת מייל</button>
        </div>
      </div>

      <div class="client-panel client-margin-top">
        <h3>נקודה לטיפול סוכן</h3>
        <p class="client-panel-badge">גלוי ליועץ בלבד — לא מוצג ללקוח ואינו נכלל בדוח ה־PDF המלא.</p>
        <RichTextEditor
          value={agentNoteDraft}
          onChange={handleAgentNoteChange}
          placeholder="כתוב כאן נקודה לטיפול הסוכן, לצורך ייצוא ל־PDF ייעודי ושליחה נפרדת."
        />
        <div class="client-action-buttons">
          <button type="button" class="client-action-button primary" onClick={() => downloadAgentNotePdf(agentNoteDraft, scope.name)}>ייצוא ל־PDF ייעודי</button>
          <button type="button" class="client-action-button" onClick={handleMockEmailSend}>שליחת מייל</button>
        </div>
      </div>
    </div>
  );
    };
  },
});


function SectionTitle({ title, subtitle }) {
  return <div class="client-section-title-row"><div><h2>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div></div>;
}

function KpiCard({ icon, title, value, subtext }) {
  return <div class="client-kpi-card"><div class="client-kpi-icon">{icon}</div><div class="client-kpi-title">{title}</div><div class="client-kpi-value">{value}</div>{subtext ? <div class="client-kpi-sub">{subtext}</div> : null}</div>;
}

function MetricBox({ title, value, icon }) {
  return <div class="client-metric-box"><div class="client-metric-icon">{icon}</div><div><div class="client-metric-title">{title}</div><div class="client-metric-value">{value}</div></div></div>;
}

function ComparisonCard({ title, explanation, withValue, withoutValue }) {
  const withNum = Number(withValue || 0);
  const withoutNum = Number(withoutValue || 0);
  const maxValue = Math.max(withNum, withoutNum, 1);
  const withIsPrimary = withNum >= withoutNum;
  return <div class="client-panel"><h3>{title}</h3>{explanation ? <p class="client-panel-subtitle">{explanation}</p> : null}<CompareBar label="עם המשך הפקדות" value={withNum} maxValue={maxValue} primary={withIsPrimary} /><CompareBar label="ללא המשך הפקדות" value={withoutNum} maxValue={maxValue} primary={!withIsPrimary} /></div>;
}

function CompareBar({ label, value, maxValue, primary = false }) {
  const ratio = Math.max((Number(value || 0) / Number(maxValue || 1)) * 100, value ? 5 : 0);
  return <div class="client-compare-row"><div class="client-compare-top"><span>{label}</span><strong>{formatCurrency(value)}</strong></div><div class="client-compare-track"><div class={primary ? "client-compare-fill primary" : "client-compare-fill muted"} style={px({ width: `${ratio}%` })} /></div></div>;
}

function ExposurePanel({ title, value, description }) {
  const safe = Math.max(0, Math.min(100, Number(value || 0)));
  return <div class="client-panel"><div class="client-exposure-top"><div><h3>{title}</h3><p class="client-panel-subtitle">{description}</p></div><strong>{formatPercent(safe)}</strong></div><div class="client-exposure-track"><div class="client-exposure-fill" style={px({ width: `${safe}%` })} /></div><div class="client-exposure-scale"><span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div></div>;
}

function DonutCard({ title, items, wide = false, type = "segment", scope = null, onSegmentClick }) {
  const segments = buildSegments(items);
  return (
    <div class={wide ? "client-panel client-donut-panel wide" : "client-panel client-donut-panel"}>
      <h3>{title}</h3>

      {segments.length ? (
        <div class={wide ? "client-donut-layout wide" : "client-donut-layout"}>
          <InteractiveDonut
            title={title}
            segments={segments}
            type={type}
            scope={scope}
            onSegmentClick={onSegmentClick}
            wide={wide}
          />

          <div class="client-legend">
            {segments.map((seg) => (
              <button
                key={seg.id || seg.name}
                type="button"
                class="client-legend-row client-legend-button"
                onClick={() =>
                  typeof onSegmentClick === "function"
                    ? onSegmentClick({ title, type, segment: seg, scope })
                    : null
                }
                title={`${seg.name} · ${Math.round(seg.percent)}% · ${formatCurrency(seg.value)}`}
              >
                <span class="client-legend-dot" style={px({ background: seg.color })} />
                <span class="client-legend-name">{seg.name}</span>
                <strong>{Math.round(seg.percent)}%</strong>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div class="client-empty-state">אין נתונים להצגה</div>
      )}
    </div>
  );
}


function InteractiveDonut({ title, segments, type, scope, onSegmentClick, wide = false }) {
  const size = wide ? 190 : 154;
  const strokeWidth = wide ? 36 : 30;
  const radius = (size - strokeWidth - 12) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const clickable = typeof onSegmentClick === "function";

  return (
    <svg
      class={wide ? "client-donut-svg wide" : "client-donut-svg"}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={title}
    >
      <circle cx={center} cy={center} r={radius} fill="none" stroke="#EEF2FA" stroke-width={strokeWidth} />

      {segments.map((seg, index) => {
        const dash = Math.max((seg.percent / 100) * circumference - 2, 0);
        const gap = circumference - dash;
        const offset = circumference * (1 - seg.start / 100);

        return (
          <circle
            key={`${seg.id || seg.name}-${index}`}
            class="client-donut-slice"
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={seg.color}
            stroke-width={strokeWidth}
            stroke-dasharray={`${dash} ${gap}`}
            stroke-dashoffset={offset}
            stroke-linecap="butt"
            transform={`rotate(-90 ${center} ${center})`}
            tabIndex={clickable ? 0 : -1}
            onClick={() =>
              clickable
                ? onSegmentClick({ title, type, segment: seg, scope })
                : null
            }
            onKeyDown={(event) => {
              if (!clickable) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSegmentClick({ title, type, segment: seg, scope });
              }
            }}
          >
            <title>{`${seg.name} · ${Math.round(seg.percent)}% · ${formatCurrency(seg.value)}`}</title>
          </circle>
        );
      })}

      <circle cx={center} cy={center} r={Math.max(radius - strokeWidth / 2 + 2, 18)} fill="#fff" class="client-donut-center" />
    </svg>
  );
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

function rowValue(row) {
  return Number(
    row?.currentValue ||
    row?.value ||
    row?.amount ||
    row?.assets ||
    row?.totalAssets ||
    row?.balance ||
    row?.allocatedValue ||
    0
  );
}

function rowMatchesSegment(row, segment, type) {
  const wanted = normalizeForCompare(segment?.name);
  if (!wanted) return false;

  if (type === "product") {
    return [
      row?.productType,
      row?.productName,
      row?.product,
      row?.type,
      row?.name,
      row?.label,
    ].some((value) => normalizeForCompare(value).includes(wanted));
  }

  if (type === "manager") {
    return [
      row?.managerName,
      row?.companyName,
      row?.insuranceCompany,
      row?.provider,
      row?.manufacturer,
      row?.name,
      row?.label,
    ].some((value) => normalizeForCompare(value).includes(wanted));
  }

  if (type === "mainGroup") {
    return [
      row?.mainGroup,
      row?.assetClass,
      row?.assetCategory,
      row?.category,
      row?.group,
      row?.afik,
      row?.productType,
      row?.productName,
      row?.name,
      row?.label,
    ].some((value) => normalizeForCompare(value).includes(wanted));
  }

  return false;
}

function buildPieSegmentDetails(scope, payload) {
  const segment = payload?.segment || {};
  const type = payload?.type || "segment";

  const productRows = safeArray(scope?.products).map((row) => ({
    ...row,
    sourceType: "product",
  }));

  const routeRows = safeArray(scope?.assetProductTables).flatMap((table) =>
    safeArray(table.rows).map((row) => ({
      ...row,
      name: row.assetName,
      productType: table.productName,
      currentValue: row.allocatedValue,
      sourceType: "route",
    }))
  );

  const deathRows = safeArray(scope?.deathCoverageProducts).map((row) => ({
    ...row,
    sourceType: "insurance",
  }));

  const candidates = [...productRows, ...deathRows];

  const matched = candidates
    .filter((row) => rowMatchesSegment(row, segment, type))
    .map((row, index) => ({
      id: row.id || `${segment.name}-${index}`,
      name: row.planName || row.assetName || row.productName || row.productType || row.name || "מוצר",
      value: rowValue(row),
      memberName: row.memberName || row.ownerName || "",
      managerName: row.managerName || row.companyName || "—",
      productType: row.productType || "—",
      policyNo: row.policyNo || row.mofid || "—",
      monthlyDeposit: Number(row.monthlyDeposit || row.monthlyDeposits || 0),
      managementFeeFromBalance: Number(row.managementFeeFromBalance || 0),
    }))
    .filter((row, index, arr) => {
      const key = `${row.name}|${row.value}|${row.memberName}|${row.managerName}|${row.productType}|${row.policyNo}`;
      return arr.findIndex(
        (item) =>
          `${item.name}|${item.value}|${item.memberName}|${item.managerName}|${item.productType}|${item.policyNo}` === key
      ) === index;
    })
    .sort((a, b) => Number(b.value || 0) - Number(a.value || 0));

  if (matched.length) return matched;

  return [
    {
      id: "summary",
      name: segment.name || "החלק הנבחר",
      value: Number(segment.value || 0),
      memberName: scope?.isFamily ? "משפחה מאוחדת" : scope?.name || "",
      managerName: "—",
      productType: type === "product" ? segment.name : "—",
      policyNo: "—",
      monthlyDeposit: 0,
    },
  ];
}

function PieSegmentDrawer({ selected, onClose }) {
  if (!selected) return null;

  const segment = selected.segment || {};
  const details = safeArray(selected.details);
  const total = Number(segment.value || 0);
  const isMainGroup = selected.type === "mainGroup";
  const typeTitle =
    selected.type === "product"
      ? "פירוט לפי מוצר"
      : selected.type === "manager"
      ? "פירוט לפי גוף מנהל"
      : isMainGroup
      ? "פירוט לפי אפיק ראשי"
      : "פירוט";

  return (
    <div class="client-drawer-overlay" onClick={onClose}>
      <aside class="client-drawer" onClick={(event) => event.stopPropagation()}>
        <div class="client-drawer-header">
          <div>
            <div class="client-drawer-eyebrow">{typeTitle}</div>
            <h2>{segment.name || "פירוט"}</h2>
            <p>{Math.round(Number(segment.percent || 0))}% · {formatCurrency(total)}</p>
          </div>
          <button type="button" class="client-drawer-close" onClick={onClose}>×</button>
        </div>

        <div class="client-drawer-stats" style={px(isMainGroup ? { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" } : {})}>
          <div><span>שווי</span><strong>{formatCurrency(total)}</strong></div>
          <div><span>משקל</span><strong>{Math.round(Number(segment.percent || 0))}%</strong></div>
          {!isMainGroup ? <div><span>כמות פוליסות / קרנות</span><strong>{details.length}</strong></div> : null}
        </div>

        {isMainGroup ? (
          <div class="client-drawer-maingroup-summary">
            <span>סך נכסים מנוהלים באפיק זה</span>
            <strong>{formatCurrency(total)}</strong>
          </div>
        ) : (
          <div class="client-table-wrap">
            <table class="client-table client-drawer-table">
              <thead>
                <tr>
                  <th>גוף מנהל</th>
                  <th>שייכות</th>
                  <th>צבירה</th>
                  <th>דמי ניהול</th>
                </tr>
              </thead>
              <tbody>
                {details.map((row) => (
                  <tr key={row.id}>
                    <td>{row.managerName || "—"}</td>
                    <td>{row.memberName || "—"}</td>
                    <td>{formatCurrency(row.value)}</td>
                    <td>{row.managementFeeFromBalance > 0 ? `${row.managementFeeFromBalance}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </aside>
    </div>
  );
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
    return { ...item, id: item.id || item.name || `segment-${index}`, name: item.name || item.label || "ללא שם", value, percent, start, end, color: colors[index % colors.length] };
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
  return <div class="client-zviran-mark" aria-hidden="true"><span class="client-zviran-mark-red" /><span class="client-zviran-mark-white" /></div>;
}

function FamilyUmbrellaIcon() {
  return <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
    <path d="M15 4C9 4 4.5 8.5 4 14H26C25.5 8.5 21 4 15 4Z" fill="#C8EDD8" stroke="#00215D" stroke-width="1.5" stroke-linejoin="round"/>
    <line x1="15" y1="4" x2="15" y2="21" stroke="#00215D" stroke-width="1.5"/>
    <path d="M15 21C15 23 13 24 12 23" stroke="#00215D" stroke-width="1.5" stroke-linecap="round"/>
    <circle cx="9" cy="24" r="2.2" fill="#4DB87A" stroke="#00215D" stroke-width="1.2"/>
    <circle cx="15" cy="23" r="2.5" fill="#4DB87A" stroke="#00215D" stroke-width="1.2"/>
    <circle cx="21" cy="24" r="2.2" fill="#4DB87A" stroke="#00215D" stroke-width="1.2"/>
    <path d="M6.5 28C7 26 8 25.5 9 25.5" stroke="#00215D" stroke-width="1.1" stroke-linecap="round"/>
    <path d="M12.5 27.5C13 25.5 14 25 15 25" stroke="#00215D" stroke-width="1.1" stroke-linecap="round"/>
    <path d="M18.5 28C19 26 20 25.5 21 25.5" stroke="#00215D" stroke-width="1.1" stroke-linecap="round"/>
  </svg>;
}
function DisabilityIcon() {
  return <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
    <circle cx="11" cy="5" r="2.5" fill="#4DB87A" stroke="#00215D" stroke-width="1.3"/>
    <path d="M11 8L9 14L7.5 22" stroke="#00215D" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M11 8L13 13" stroke="#00215D" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M8.5 11.5H13.5" stroke="#00215D" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M15.5 9.5V21.5" stroke="#00215D" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M12.5 9.5H15.5" stroke="#00215D" stroke-width="1.3" stroke-linecap="round"/>
    <path d="M15.5 21.5L13.5 26" stroke="#00215D" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M18 23C20 21 24 22 25 25C26 28 21 29 19 27.5" fill="#C8EDD8" stroke="#00215D" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M21 13L27 9" stroke="#4DB87A" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M24 7.5L27 9L25.5 12" stroke="#4DB87A" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>;
}
function SavingsGrowthIcon() {
  // 4B · ascending bars (projected accumulation) — project colors (navy + pink)
  return <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
    <path d="M4 20H20" stroke="#00215D" stroke-width="2" stroke-linecap="round"/>
    <rect x="5" y="13" width="3.3" height="6" rx="1" stroke="#00215D" stroke-width="2"/>
    <rect x="10.3" y="9" width="3.3" height="10" rx="1" stroke="#00215D" stroke-width="2"/>
    <rect x="15.6" y="5" width="3.3" height="14" rx="1" fill="#FF2756"/>
  </svg>;
}
function CoinsStackIcon() {
  // 2B · wallet (total assets) — project colors (navy + pink)
  return <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
    <path d="M4 7C4 6 4.8 5 6 5H17C18 5 19 6 19 7V8" stroke="#00215D" stroke-width="2" stroke-linecap="round"/>
    <rect x="3" y="7" width="17" height="12" rx="2.5" stroke="#00215D" stroke-width="2"/>
    <path d="M20 11H16.5C15.4 11 14.7 11.9 14.7 13C14.7 14.1 15.4 15 16.5 15H20" stroke="#FF2756" stroke-width="2"/>
    <circle cx="16.6" cy="13" r="1" fill="#FF2756"/>
  </svg>;
}
function VaultSavingsIcon() {
  return <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
    <rect x="2" y="5" width="22" height="20" rx="3" fill="#C8EDD8" stroke="#00215D" stroke-width="1.5"/>
    <rect x="5" y="8" width="16" height="14" rx="2" fill="#fff" stroke="#00215D" stroke-width="1.2"/>
    <circle cx="13" cy="15" r="3.5" fill="none" stroke="#00215D" stroke-width="1.3"/>
    <circle cx="13" cy="15" r="1.5" fill="#4DB87A"/>
    <line x1="24" y1="11" x2="27" y2="11" stroke="#00215D" stroke-width="1.3" stroke-linecap="round"/>
    <line x1="24" y1="19" x2="27" y2="19" stroke="#00215D" stroke-width="1.3" stroke-linecap="round"/>
    <line x1="8" y1="25" x2="8" y2="28" stroke="#00215D" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="18" y1="25" x2="18" y2="28" stroke="#00215D" stroke-width="1.5" stroke-linecap="round"/>
    <ellipse cx="26" cy="22" rx="3.2" ry="4.5" fill="#4DB87A" stroke="#00215D" stroke-width="1.2"/>
    <line x1="26" y1="20" x2="26" y2="21.5" stroke="#00215D" stroke-width="1.1" stroke-linecap="round"/>
    <ellipse cx="31" cy="24" rx="2.5" ry="3.5" fill="#C8EDD8" stroke="#00215D" stroke-width="1.1"/>
  </svg>;
}
function CalendarDepositIcon() {
  // 1B · deposit arrow (monthly deposit) — project colors (navy + pink)
  return <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
    <path d="M12 3V12" stroke="#FF2756" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M8.5 8.5L12 12L15.5 8.5" stroke="#FF2756" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M4 13V19A2 2 0 0 0 6 21H18A2 2 0 0 0 20 19V13" stroke="#00215D" stroke-width="2" stroke-linecap="round"/>
  </svg>;
}
function SafePensionIcon() {
  // 3A · recurring pension payment (₪ inside refresh arrow) — project colors
  return <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
    <path d="M20 12A8 8 0 1 1 17.5 6.3" stroke="#00215D" stroke-width="2" stroke-linecap="round"/>
    <path d="M17 3.5V6.5H14" stroke="#00215D" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M12 8.4V15.6M9.8 9.7H13C13.7 9.7 14.2 10.2 14.2 11C14.2 11.8 13.7 12.3 13 12.3H10.4" stroke="#FF2756" stroke-width="1.7" stroke-linecap="round"/>
  </svg>;
}
function PercentArrowIcon() {
  return <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
    <circle cx="9" cy="10" r="4" fill="#C8EDD8" stroke="#00215D" stroke-width="1.5"/>
    <circle cx="21" cy="21" r="4" fill="#C8EDD8" stroke="#00215D" stroke-width="1.5"/>
    <line x1="7" y1="24" x2="23" y2="7" stroke="#00215D" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M18 6L24 4L24 10" stroke="#4DB87A" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>;
}
function BankIcon() { return <svg width="30" height="30" viewBox="0 0 24 24" fill="none"><path d="M4 10L12 5L20 10" stroke="#00215D" stroke-width="2.2" stroke-linejoin="round"/><path d="M6 10V18" stroke="#00215D" stroke-width="2.2" stroke-linecap="round"/><path d="M10 10V18" stroke="#00215D" stroke-width="2.2" stroke-linecap="round"/><path d="M14 10V18" stroke="#00215D" stroke-width="2.2" stroke-linecap="round"/><path d="M18 10V18" stroke="#00215D" stroke-width="2.2" stroke-linecap="round"/><path d="M4 19H20" stroke="#FF2756" stroke-width="2.2" stroke-linecap="round"/></svg>; }

const clientDashboardCss = `
  * { box-sizing: border-box; }
  .client-web-shell { min-height: 100vh; background: ${theme.pageBg}; color: ${theme.text}; direction: rtl; font-family: Calibri, Arial, sans-serif; display: grid; grid-template-columns: 292px minmax(0, 1fr); }
  .client-sidebar { position: sticky; top: 0; height: 100vh; background: linear-gradient(180deg, ${theme.navyDark} 0%, ${theme.navy} 52%, #001733 100%); color: #fff; padding: 24px 16px; border-left: 1px solid rgba(255,255,255,0.08); overflow-y: auto; }
  .client-sidebar-brand { display: grid; grid-template-columns: 58px minmax(0, 1fr); gap: 12px; align-items: center; padding: 0 8px 24px; margin-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.14); }
  .client-zviran-mark { width: 58px; height: 58px; border-radius: 50%; background: #00215D; border: 2px solid rgba(255,255,255,0.30); box-shadow: 0 4px 14px rgba(0,0,0,0.25); position: relative; flex-shrink: 0; }
  .client-zviran-mark-red, .client-zviran-mark-white { position: absolute; width: 28px; height: 9px; border-radius: 999px; left: 50%; transform: translateX(-50%) rotate(-35deg); }
  .client-zviran-mark-red { top: 16px; background: ${theme.accent}; } .client-zviran-mark-white { top: 30px; background: #fff; }
  .client-brand-title { font-size: 21px; line-height: 1.2; font-weight: 900; } .client-brand-subtitle { margin-top: 4px; font-size: 12px; color: rgba(255,255,255,0.72); }
  .client-sidebar-nav { display: flex; flex-direction: column; gap: 4px; padding: 6px; margin-top: 8px; position: relative; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.15); border-radius: 18px; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
  .client-nav-pill { position: absolute; right: 0; left: 0; height: 54px; border-radius: 14px; background: linear-gradient(135deg, ${theme.accent} 0%, ${theme.navy} 100%); box-shadow: 0 8px 22px rgba(255,39,86,0.22); transition: top 0.3s cubic-bezier(0.4, 0, 0.2, 1); pointer-events: none; z-index: 0; }
  .client-nav-item { position: relative; z-index: 1; width: 100%; height: 54px; border: 0; border-radius: 14px; padding: 0 14px; background: transparent; color: rgba(255,255,255,0.72); cursor: pointer; display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 10px; align-items: center; text-align: right; font-family: Calibri, Arial, sans-serif; font-size: 14px; font-weight: 800; transition: color 0.18s ease; }
  .client-nav-item:hover { color: #fff; }
  .client-nav-item.active { color: #fff; }
  .client-nav-icon { font-size: 19px; text-align: center; }
  .client-nav-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .client-main { min-width: 0; padding: 24px 28px 36px; }
  .client-topbar { min-height: 108px; background: linear-gradient(135deg, ${theme.navy}, ${theme.navyDark}); color: #fff; border: 1px solid rgba(0,33,93,0.20); border-radius: 24px; padding: 20px 22px; box-shadow: 0 8px 28px rgba(0,33,93,0.14); display: flex; justify-content: space-between; gap: 18px; align-items: center; margin-bottom: 18px; }
  .client-topbar-eyebrow { color: rgba(255,255,255,0.76); font-size: 12px; font-weight: 800; margin-bottom: 7px; }
  .client-page-title { margin: 0; font-size: 30px; line-height: 1.2; color: #fff; font-weight: 900; } .client-page-subtitle { margin-top: 7px; color: rgba(255,255,255,0.86); font-size: 13px; font-weight: 700; }
  .client-topbar-actions { display: flex; align-items: stretch; gap: 12px; flex-wrap: wrap; justify-content: flex-end; }
  .client-history-button, .client-scope-select-wrap, .client-back-button { min-height: 54px; border-radius: 16px; background: rgba(255,255,255,0.11); border: 1px solid rgba(255,255,255,0.18); color: #fff; font-family: Calibri, Arial, sans-serif; }
  .client-updated-inline { display: flex; flex-direction: column; justify-content: center; gap: 2px; padding: 0 4px; }
  .client-updated-inline { margin-top: 8px; display: flex; flex-direction: column; gap: 1px; }
  .client-updated-label { color: rgba(255,255,255,0.55); font-size: 11px; font-weight: 700; }
  .client-updated-value { color: rgba(255,255,255,0.92); font-size: 13px; font-weight: 800; }
  .client-history-button { min-width: 188px; padding: 8px 12px; display: grid; grid-template-columns: 34px minmax(0, 1fr); gap: 10px; align-items: center; text-align: right; cursor: pointer; }
  .client-history-button strong { display: block; color: #fff; font-size: 13px; line-height: 1.2; } .client-history-button small { display: block; color: rgba(255,255,255,0.72); margin-top: 3px; font-size: 10px; line-height: 1.2; }
  .client-history-icon { width: 34px; height: 34px; border-radius: 12px; background: rgba(255,255,255,0.14); display: flex; align-items: center; justify-content: center; color: ${theme.accent}; font-size: 20px; font-weight: 900; }
  .client-updated-box { padding: 8px 12px; display: flex; flex-direction: column; justify-content: center; gap: 3px; color: rgba(255,255,255,0.72); font-size: 11px; } .client-updated-box strong { color: #fff; font-size: 13px; }
  .client-scope-select-wrap { padding: 8px 14px; position: relative; display: flex; align-items: center; gap: 10px; min-width: 180px; }
  .client-scope-label { color: rgba(255,255,255,0.60); font-size: 11px; font-weight: 800; white-space: nowrap; flex-shrink: 0; }
  .client-scope-select { flex: 1; min-height: 32px; border: 0; outline: 0; color: #fff; font-family: Calibri, Arial, sans-serif; font-size: 14px; font-weight: 900; background: transparent; cursor: pointer; -webkit-appearance: none; appearance: none; }
  .client-scope-select option { color: ${theme.navy}; background: #fff; font-weight: 700; font-size: 13px; }
  .client-scope-chevron { color: rgba(255,255,255,0.70); flex-shrink: 0; pointer-events: none; }
  .client-scope-dd { position: relative; }
  .client-scope-dd-trigger { min-height: 54px; min-width: 210px; width: 100%; border-radius: 16px; background: rgba(255,255,255,0.11); border: 1px solid rgba(255,255,255,0.18); color: #fff; font-family: Calibri, Arial, sans-serif; display: flex; align-items: center; gap: 10px; padding: 8px 14px; cursor: pointer; text-align: right; transition: background .16s ease, border-color .16s ease; }
  .client-scope-dd-trigger:hover { background: rgba(255,255,255,0.17); border-color: rgba(255,255,255,0.30); }
  .client-scope-dd.open .client-scope-dd-trigger { background: rgba(255,255,255,0.18); border-color: rgba(255,255,255,0.42); }
  .client-scope-dd-icon { width: 30px; height: 30px; border-radius: 10px; background: rgba(255,255,255,0.14); color: #fff; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .client-scope-dd-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
  .client-scope-dd-label { color: rgba(255,255,255,0.55); font-size: 10px; font-weight: 800; letter-spacing: .3px; }
  .client-scope-dd-value { color: #fff; font-size: 14px; font-weight: 900; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .client-scope-dd-chevron { color: rgba(255,255,255,0.75); flex-shrink: 0; transition: transform .18s ease; }
  .client-scope-dd.open .client-scope-dd-chevron { transform: rotate(180deg); }
  .client-scope-dd-menu { position: absolute; top: calc(100% + 8px); right: 0; left: 0; background: #fff; border: 1px solid ${theme.border}; border-radius: 16px; box-shadow: 0 16px 36px rgba(16,42,67,0.22); padding: 6px; z-index: 60; max-height: 320px; overflow-y: auto; animation: scopeDdIn .14s ease; }
  @keyframes scopeDdIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
  .client-scope-dd-item { width: 100%; display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 0; background: transparent; border-radius: 11px; cursor: pointer; text-align: right; font-family: Calibri, Arial, sans-serif; color: ${theme.navy}; transition: background .12s ease; }
  .client-scope-dd-item:hover { background: ${theme.surfaceAlt}; }
  .client-scope-dd-item.active { background: #EAF1FB; }
  .client-scope-dd-item-icon { width: 30px; height: 30px; border-radius: 9px; background: #EAF1FB; color: ${theme.navy}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .client-scope-dd-item.active .client-scope-dd-item-icon { background: #fff; }
  .client-scope-dd-item-name { flex: 1; font-size: 13.5px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .client-scope-dd-check { color: ${theme.navy}; flex-shrink: 0; }
  .client-back-button { padding: 0 16px; font-size: 13px; font-weight: 900; cursor: pointer; }
  .client-back-icon-btn { min-width: 54px; width: 54px; padding: 0; display: flex; align-items: center; justify-content: center; font-size: 22px; position: relative; }
  .client-back-icon-btn:hover::after { content: attr(title); position: absolute; bottom: calc(100% + 8px); left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.82); color: #fff; font-size: 12px; font-weight: 700; white-space: nowrap; padding: 5px 10px; border-radius: 8px; pointer-events: none; z-index: 100; }
  .client-topbar-logo { min-height: 54px; display: flex; align-items: center; justify-content: center; }
  .client-topbar-logo img { max-height: 64px; max-width: 120px; object-fit: contain; filter: drop-shadow(0 2px 6px rgba(0,0,0,0.18)); }
  .client-content-card { background: #fff; border: 1px solid ${theme.border}; border-radius: 24px; padding: 22px; box-shadow: 0 8px 26px rgba(16,42,67,0.05); min-height: calc(100vh - 174px); }
  .client-section-title-row { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; margin-bottom: 18px; } .client-section-title-row h2 { margin: 0; color: ${theme.navy}; font-size: 22px; line-height: 1.25; font-weight: 900; }
  .client-section-title-row p, .client-panel-subtitle { margin: 6px 0 0; color: ${theme.textSoft}; font-size: 13px; line-height: 1.6; }
  .client-kpi-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 14px; } .client-grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; } .client-grid-3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; } .client-margin-top { margin-top: 14px; }
  .client-kpi-card, .client-panel, .client-metric-box, .client-personal-card { border: 1px solid #E7D9CA; border-radius: 20px; background: linear-gradient(180deg, #fff 0%, ${theme.surfaceAlt} 100%); box-shadow: 0 2px 10px rgba(16,42,67,0.04); }
  .client-kpi-card { min-height: 220px; padding: 22px 18px; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 12px; text-align: center; }
  .client-kpi-icon { width: 80px; height: 80px; border-radius: 22px; background: #F4F7FB; display: flex; align-items: center; justify-content: center; } .client-kpi-title { color: ${theme.textSoft}; font-size: 16px; font-weight: 800; } .client-kpi-value { color: ${theme.navy}; font-size: 36px; line-height: 1.1; font-weight: 900; direction: ltr; } .client-kpi-sub { color: #7A8CA8; font-size: 13px; line-height: 1.45; }
  .client-personal-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
  .client-personal-card { padding: 22px; min-height: 290px; }
  .client-personal-card-header { display: grid; grid-template-columns: 66px minmax(0, 1fr); gap: 14px; align-items: center; padding-bottom: 16px; margin-bottom: 16px; border-bottom: 1px solid ${theme.divider}; }
  .client-personal-avatar { width: 66px; height: 66px; border-radius: 50%; background: transparent; display: flex; align-items: center; justify-content: center; overflow: hidden; }
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
  .client-donut-layout { display: grid; grid-template-columns: 170px minmax(0, 1fr); gap: 18px; align-items: center; }
  .client-donut-layout.wide { grid-template-columns: 210px minmax(0, 1fr); }
  .client-donut-panel.wide .client-legend { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 18px; row-gap: 10px; }
  .client-allocation-top-pies { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
  .client-main-groups-wide { width: 100%; }
  .client-donut-svg { overflow: visible; filter: drop-shadow(0 10px 18px rgba(0,33,93,0.10)); }
  .client-donut-slice { cursor: pointer; transition: stroke-width .18s ease, filter .18s ease, opacity .18s ease; outline: none; }
  .client-donut-slice:hover, .client-donut-slice:focus { stroke-width: 44px; filter: drop-shadow(0 5px 8px rgba(0,33,93,0.24)); }
  .client-donut-svg.wide .client-donut-slice:hover, .client-donut-svg.wide .client-donut-slice:focus { stroke-width: 52px; }
  .client-donut-svg:hover .client-donut-slice:not(:hover) { opacity: .62; }
  .client-donut-center { pointer-events: none; filter: drop-shadow(0 1px 4px rgba(0,33,93,0.06)); }
  .client-legend { display: flex; flex-direction: column; gap: 9px; min-width: 0; }
  .client-legend-row { display: flex; align-items: center; gap: 7px; color: ${theme.text}; font-size: 12px; }
  .client-legend-row strong { flex-shrink: 0; }
  .client-legend-button { width: 100%; border: 0; background: transparent; padding: 5px 2px; text-align: right; cursor: pointer; border-radius: 10px; font-family: Calibri, Arial, sans-serif; }
  .client-legend-button:hover, .client-legend-button:focus { background: #F4F7FB; outline: 0; }
  .client-legend-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; } .client-legend-name { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; min-width: 0; flex: 0 1 auto; }
  .client-table-wrap { overflow-x: auto; border: 1px solid ${theme.divider}; border-radius: 18px; background: #fff; }
  .client-table { width: 100%; min-width: 760px; border-collapse: collapse; table-layout: auto; }
  .client-table th { background: ${theme.navy}; color: #fff; padding: 12px 10px; font-size: 12px; text-align: right; white-space: nowrap; }
  .client-table td { padding: 12px 10px; border-bottom: 1px solid ${theme.divider}; color: ${theme.text}; font-size: 12px; white-space: nowrap; }
  .client-insurance-table { table-layout: fixed; min-width: 0; width: 100%; }
  .client-insurance-table th { padding: 9px 7px; font-size: 11px; }
  .client-insurance-table td { padding: 8px 7px; font-size: 12px; }
  .client-insurance-table th, .client-insurance-table td { vertical-align: middle; }
  .client-insurance-table .wide-col { white-space: normal; word-break: break-word; overflow-wrap: anywhere; line-height: 1.4; max-width: 160px; }
  .client-insurance-table .text-col { white-space: normal; overflow-wrap: anywhere; line-height: 1.4; }
  .client-insurance-table .policy-col, .client-insurance-table .money-col { direction: ltr; text-align: center; white-space: nowrap; }
  .client-insurance-table .client-insurance-col-memberName { width: 12%; }
  .client-insurance-table .client-insurance-col-planName { width: 18%; }
  .client-insurance-table .client-insurance-col-managerName { width: 16%; }
  .client-insurance-table .client-insurance-col-productType { width: 15%; }
  .client-insurance-table .client-insurance-col-policyNo { width: 13%; }
  .client-insurance-table .client-insurance-col-currentValue { width: 13%; }
  .client-insurance-table .client-insurance-col-deathCoverage { width: 13%; }
  .client-insurance-table.member .client-insurance-col-planName { width: 20%; }
  .client-insurance-table.member .client-insurance-col-managerName { width: 19%; }
  .client-insurance-table.member .client-insurance-col-productType { width: 17%; }
  .client-insurance-table.member .client-insurance-col-policyNo { width: 15%; }
  .client-insurance-table.member .client-insurance-col-currentValue { width: 14%; }
  .client-insurance-table.member .client-insurance-col-deathCoverage { width: 15%; }
  .client-insurance-table .client-insurance-col-widowPension { width: 20%; }
  .client-insurance-table .client-insurance-col-orphanPension { width: 20%; }
  .client-insurance-table .client-insurance-col-totalPension { width: 20%; }
  .client-insurance-table.member .client-insurance-col-widowPension { width: 25%; }
  .client-insurance-table.member .client-insurance-col-orphanPension { width: 25%; }
  .client-insurance-table.member .client-insurance-col-totalPension { width: 25%; }
  .client-empty-state { border: 1px dashed ${theme.border}; border-radius: 16px; background: ${theme.surfaceAlt}; padding: 18px; color: ${theme.textSoft}; font-size: 13px; text-align: center; line-height: 1.7; }
  .client-rich-readonly { min-height: 210px; border: 1px solid ${theme.divider}; border-radius: 16px; background: #FFFDFB; padding: 16px; color: ${theme.text}; font-size: 13px; line-height: 1.9; white-space: pre-wrap; }
  .client-rich-readonly p { margin: 0 0 10px; }
  .client-rich-readonly ul, .client-rich-readonly ol { margin: 0 0 10px; padding-inline-start: 22px; }
  .client-panel-badge { margin: -4px 0 10px; color: ${theme.textSoft}; font-size: 11.5px; font-weight: 800; }
  .client-rich-editor { border: 1px solid ${theme.divider}; border-radius: 16px; background: #FFFDFB; overflow: hidden; }
  .client-rich-toolbar { display: flex; gap: 6px; padding: 8px; border-bottom: 1px solid ${theme.divider}; background: ${theme.surfaceAlt}; }
  .client-rich-toolbar-button { width: 32px; height: 32px; border-radius: 10px; border: 1px solid ${theme.divider}; background: #FFFFFF; color: ${theme.navy}; font-size: 13px; font-family: Calibri, Arial, sans-serif; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: .15s ease; }
  .client-rich-toolbar-button:hover { border-color: ${theme.navy}; background: #EAF1FB; }
  .client-rich-editable { min-height: 210px; padding: 16px; color: ${theme.text}; font-size: 13px; line-height: 1.9; font-family: Calibri, Arial, sans-serif; outline: none; }
  .client-rich-editable p { margin: 0 0 10px; }
  .client-rich-editable ul, .client-rich-editable ol { margin: 0 0 10px; padding-inline-start: 22px; }
  .client-rich-editable:empty:before { content: attr(data-placeholder); color: ${theme.textSoft}; }
  .client-rich-editor:focus-within { border-color: ${theme.navy}; box-shadow: 0 0 0 3px rgba(0,33,93,.10); }

  .client-section-title-row.compact { margin-top: 18px; margin-bottom: 12px; }
  .client-asset-products { display: flex; flex-direction: column; gap: 12px; }
  .client-product-accordion { border: 1px solid #E7D9CA; border-radius: 20px; background: #FFFFFF; overflow: hidden; box-shadow: 0 2px 10px rgba(16,42,67,0.04); }
  .client-product-summary { width: 100%; min-height: 72px; border: 0; background: #FFFFFF; color: ${theme.navy}; cursor: pointer; font-family: Calibri, Arial, sans-serif; display: grid; grid-template-columns: 30px minmax(124px, 1.05fr) repeat(6, minmax(72px, .72fr)); gap: 6px; align-items: center; padding: 10px 12px; text-align: right; }
  .client-product-summary:hover { background: #FCFBF8; }
  .client-product-chevron { width: 28px; height: 28px; border-radius: 50%; border: 1px solid #D8DEE9; display: inline-flex; align-items: center; justify-content: center; color: ${theme.navy}; font-size: 14px; line-height: 1; padding-bottom: 1px; }
  .client-product-title { color: ${theme.navy}; font-size: 16px; line-height: 1.2; font-weight: 900; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .client-product-strip-item { min-height: 46px; border-right: 1px solid #EEE4D8; padding-right: 8px; display: flex; flex-direction: column; justify-content: center; gap: 3px; min-width: 0; overflow: hidden; }
  .client-product-strip-item small { color: ${theme.textSoft}; font-size: 10px; font-weight: 800; line-height: 1.15; white-space: normal; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .client-product-strip-item b { color: ${theme.navy}; font-size: 14px; font-weight: 900; direction: ltr; text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .client-product-assets-table { min-width: unset; width: 100%; }
  .client-product-assets-table th, .client-product-assets-table td { text-align: center; }
  .client-product-assets-table th:nth-child(2), .client-product-assets-table td:nth-child(2) { text-align: right; max-width: 140px; min-width: 100px; white-space: normal; word-break: break-word; }
  .positive-number { color: #07864E !important; font-weight: 900; }

  .client-drawer-overlay { position: fixed; inset: 0; z-index: 9999; background: rgba(0, 24, 69, .24); display: flex; justify-content: flex-start; direction: rtl; }
  .client-drawer { width: min(680px, 94vw); height: 100vh; overflow-y: auto; background: #fff; border-left: 1px solid ${theme.border}; box-shadow: 24px 0 54px rgba(0,33,93,.22); padding: 22px; animation: clientDrawerIn .18s ease-out; }
  @keyframes clientDrawerIn { from { transform: translateX(-26px); opacity: .65; } to { transform: translateX(0); opacity: 1; } }
  .client-drawer-header { background: linear-gradient(135deg, ${theme.navy}, ${theme.navyDark}); color: #fff; border-radius: 22px; padding: 18px 18px 18px 14px; margin-bottom: 18px; display: flex; justify-content: space-between; gap: 14px; align-items: flex-start; }
  .client-drawer-close { width: 36px; height: 36px; flex-shrink: 0; border-radius: 999px; border: 1px solid rgba(255,255,255,.28); background: rgba(255,255,255,.12); color: #fff; font-size: 28px; line-height: 1; cursor: pointer; align-self: flex-start; }
  .client-drawer-eyebrow { font-size: 12px; color: rgba(255,255,255,.76); font-weight: 800; margin-bottom: 4px; }
  .client-drawer-header h2 { margin: 0; color: #fff; font-size: 24px; line-height: 1.25; }
  .client-drawer-header p { margin: 8px 0 0; color: rgba(255,255,255,.84); font-size: 13px; }
  .client-drawer-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-bottom: 18px; }
  .client-drawer-stats > div { background: ${theme.surfaceAlt}; border: 1px solid ${theme.divider}; border-radius: 16px; padding: 13px; }
  .client-drawer-stats span { display: block; color: ${theme.textSoft}; font-size: 11px; font-weight: 800; margin-bottom: 6px; }
  .client-drawer-stats strong { color: ${theme.navy}; font-size: 16px; direction: ltr; }
  .client-drawer-table { min-width: 500px; }
  .client-drawer-maingroup-summary { background: ${theme.softBlue}; border: 1px solid ${theme.border}; border-radius: 16px; padding: 22px 20px; display: flex; flex-direction: column; gap: 8px; } .client-drawer-maingroup-summary span { color: ${theme.textSoft}; font-size: 13px; font-weight: 800; } .client-drawer-maingroup-summary strong { color: ${theme.navy}; font-size: 28px; font-weight: 900; }


  .client-special-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; align-items: start; }
  .client-special-panel { min-height: 260px; }
  .client-special-metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 14px; }
  .client-special-metric { min-height: 72px; border: 1px solid ${theme.divider}; border-radius: 16px; background: #FFFFFF; padding: 12px 14px; display: flex; flex-direction: column; justify-content: center; gap: 6px; }
  .client-special-metric span { color: ${theme.textSoft}; font-size: 11px; font-weight: 800; line-height: 1.25; }
  .client-special-metric strong { color: ${theme.navy}; font-size: 16px; font-weight: 900; line-height: 1.25; direction: rtl; word-break: break-word; }
  .client-special-table { min-width: 760px; }
  .client-special-note { margin-top: 14px; background: #EEF2FA; border: 1px solid #D8DEE9; border-radius: 14px; padding: 12px 14px; color: ${theme.textSoft}; font-size: 12px; line-height: 1.7; }

  .client-action-buttons { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
  .client-action-button { min-height: 42px; border-radius: 14px; border: 1px solid #D8DEE9; background: #FFFFFF; color: ${theme.navy}; padding: 0 18px; font-family: Calibri, Arial, sans-serif; font-size: 13px; font-weight: 900; cursor: pointer; transition: .18s ease; }
  .client-action-button:hover { transform: translateY(-1px); box-shadow: 0 8px 18px rgba(0,33,93,.10); }
  .client-action-button.primary { border-color: ${theme.navy}; background: ${theme.navy}; color: #FFFFFF; }


  .client-report-like-shell { display: flex; flex-direction: column; gap: 14px; }
  .client-report-owner-block { border: 1px solid #E7D9CA; border-radius: 22px; background: #FFFFFF; padding: 16px; display: flex; flex-direction: column; gap: 14px; }
  .client-owner-block-title { color: #00215D; font-size: 18px; line-height: 1.3; font-weight: 900; padding-bottom: 10px; border-bottom: 1px solid #EEE4D8; }
  .client-source-strip { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: flex-start; border: 1px solid #E2D1BF; border-radius: 18px; background: #FCFBF8; padding: 12px 14px; color: #627D98; font-size: 12px; font-weight: 800; }
  .client-source-strip strong { color: #00215D; font-size: 13px; }
  .client-report-panel { border: 1px solid #E7D9CA; border-radius: 20px; background: linear-gradient(180deg, #FFFFFF 0%, #FCFBF8 100%); box-shadow: 0 2px 10px rgba(16,42,67,0.04); padding: 18px; min-width: 0; }
  .client-report-panel-title { color: #00215D; font-size: 16px; line-height: 1.3; font-weight: 900; margin-bottom: 12px; }
  .client-report-panel-title.small { font-size: 13px; margin-bottom: 10px; }
  .client-section28-two-cols { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; align-items: start; }
  .client-section28-subcard { background: #FFFFFF; border: 1px solid #EEE4D8; border-radius: 18px; padding: 14px; min-width: 0; }
  .client-section28-subtitle { color: #00215D; font-size: 13px; font-weight: 900; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid #EEE4D8; }
  .client-section28-row { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(96px, 0.55fr); gap: 10px; align-items: center; padding: 9px 0; border-bottom: 1px solid #F0E6DA; }
  .client-section28-row.highlighted { border: 1px solid #E2D1BF; border-radius: 16px; padding: 11px 12px; margin-top: 10px; background: linear-gradient(135deg, #FFF7E8 0%, #EEF2FA 100%); box-shadow: 0 4px 12px rgba(0,33,93,0.05); }
  .client-section28-row-label { color: #627D98; font-size: 12px; font-weight: 800; line-height: 1.45; }
  .client-section28-row.highlighted .client-section28-row-label { color: #00215D; font-weight: 900; }
  .client-section28-row-value { color: #00215D; font-size: 13px; font-weight: 900; text-align: left; direction: ltr; white-space: nowrap; }
  .client-section28-row.highlighted .client-section28-row-value { color: #FF2756; }
  .client-section28-monthly { margin-top: 14px; border: 1px solid #D8DEE9; border-radius: 18px; background: linear-gradient(135deg, #00215D 0%, #001845 100%); color: #fff; padding: 14px 16px; text-align: center; box-shadow: 0 6px 14px rgba(0,33,93,0.10); }
  .client-section28-monthly span { display: block; color: rgba(255,255,255,.82); font-size: 12px; font-weight: 800; margin-bottom: 5px; }
  .client-section28-monthly strong { display: block; color: #fff; font-size: 17px; font-weight: 900; direction: ltr; }
  .client-section28-metric-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
  .client-report-kpi-box { min-height: 92px; border: 1px solid #EEE4D8; border-radius: 18px; background: #FFFFFF; padding: 14px; display: flex; flex-direction: column; justify-content: center; gap: 8px; }
  .client-report-kpi-box.highlighted { background: linear-gradient(135deg, #FFF7E8 0%, #EEF2FA 100%); border-color: #E2D1BF; }
  .client-report-kpi-box span { color: #627D98; font-size: 12px; font-weight: 800; line-height: 1.35; }
  .client-report-kpi-box strong { color: #00215D; font-size: 18px; font-weight: 900; direction: ltr; text-align: right; }
  .client-report-kpi-box.highlighted strong { color: #FF2756; }
  .client-section28-comparison-layout { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(280px, 0.75fr); gap: 14px; align-items: stretch; }
  .client-section28-table { min-width: 680px; }
  .client-section28-table th, .client-section28-table td { text-align: center; }
  .client-table tr.total-row td { background: #EEF2FA; color: #00215D; font-weight: 900; }
  .client-section28-bars-card { background: #FFFFFF; border: 1px solid #EEE4D8; border-radius: 18px; padding: 14px; min-width: 0; margin-top: 14px; }
  .client-section28-bar-group { margin-top: 12px; }
  .client-section28-bar-title { color: #627D98; font-size: 12px; font-weight: 900; margin-bottom: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .client-section28-bar-row { margin-bottom: 8px; }
  .client-section28-bar-row strong { display: block; color: #00215D; font-size: 12px; font-weight: 900; margin-bottom: 4px; direction: ltr; text-align: left; }
  .client-section28-bar-track { height: 10px; border-radius: 999px; background: #EAF1FB; overflow: hidden; }
  .client-section28-bar-fill { height: 100%; border-radius: 999px; }
  .client-section28-bar-fill.primary { background: linear-gradient(90deg, #FF2756, #00215D); }
  .client-section28-bar-fill.muted { background: linear-gradient(90deg, #C7D1E2, #EAF1FB); }
  .client-section28-bar-legend { display: flex; gap: 12px; margin-top: 12px; color: #627D98; font-size: 11px; font-weight: 800; }
  .client-report-table-heading { display: flex; justify-content: space-between; gap: 14px; align-items: flex-start; flex-wrap: wrap; margin-bottom: 12px; }
  .client-report-table-heading p { margin: 4px 0 0; color: #627D98; font-size: 12px; line-height: 1.55; }
  .client-report-pill { background: #EEF2FA; color: #00215D; border: 1px solid #D8DEE9; border-radius: 999px; padding: 8px 14px; font-size: 12px; font-weight: 900; white-space: nowrap; }
  .client-report-pill.gold { background: #FFF7E8; border-color: #E2D1BF; }
  .client-vested-table { min-width: 1080px; table-layout: auto; }
  .client-vested-table th, .client-vested-table td { text-align: center; }
  .client-manual-table-wrap { max-width: 680px; }
  .client-manual-recognized-table { min-width: 520px; }
  .client-manual-recognized-table th, .client-manual-recognized-table td { text-align: center; }
  .client-tax-gap-summary { margin-top: 14px; padding: 18px 20px; border-radius: 20px; border: 1px solid #E2D1BF; background: linear-gradient(135deg, rgba(255,255,255,1) 0%, rgba(255,247,232,1) 100%); display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; }
  .client-tax-gap-summary h3 { margin: 0; color: #00215D; font-size: 17px; font-weight: 900; }
  .client-tax-gap-summary p { margin: 6px 0 0; color: #627D98; font-size: 12px; line-height: 1.55; }
  .client-tax-gap-summary strong { color: #00215D; font-size: 26px; font-weight: 900; direction: ltr; white-space: nowrap; }
  .client-empty-state.compact { padding: 12px; font-size: 12px; }

  .client-capital-shell { gap: 16px; }
  .client-capital-kpi-row { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
  .client-capital-kpi { min-height: 78px; border: 1px solid #E7D9CA; border-radius: 18px; background: #FFFFFF; padding: 13px 14px; display: flex; flex-direction: column; justify-content: center; gap: 7px; }
  .client-capital-kpi.capital { background: #FFFDF7; border-color: #F1E4C5; }
  .client-capital-kpi.pension { background: #F8FBFF; border-color: #DCEAFE; }
  .client-capital-kpi span { color: #627D98; font-size: 12px; font-weight: 900; }
  .client-capital-kpi strong { color: #00215D; font-size: 19px; font-weight: 900; direction: ltr; text-align: right; }
  .client-capital-legend { border: 1px solid #E7D9CA; border-radius: 18px; background: #FFFDFB; padding: 13px 16px; display: flex; gap: 20px; align-items: center; flex-wrap: wrap; color: #31445F; font-size: 12px; font-weight: 800; }
  .client-capital-legend strong { color: #00215D; font-size: 13px; font-weight: 900; }
  .capital-dot { width: 15px; height: 15px; border-radius: 5px; display: inline-block; vertical-align: middle; margin-left: 7px; border: 1px solid transparent; }
  .capital-dot.pension { background: #F8FBFF; border-color: #DCEAFE; }
  .capital-dot.capital { background: #FFFDF7; border-color: #F1E4C5; }
  .client-capital-owner-panel { padding: 18px; }
  .client-capital-subtitle { margin-bottom: 10px; color: #00215D; font-size: 15px; font-weight: 900; }
  .client-capital-table { min-width: 1040px; }
  .client-capital-table th, .client-capital-table td { text-align: center; white-space: normal; line-height: 1.45; }
  .client-capital-table th:first-child, .client-capital-table td:first-child { text-align: right; }

  .client-capital-product-cell { min-width: 190px; display: grid; grid-template-columns: 30px minmax(0, 1fr); gap: 7px; align-items: center; }
  .client-capital-product-cell strong { color: #00215D; font-size: 12px; font-weight: 900; line-height: 1.3; }
  .client-capital-product-cell small { grid-column: 2; color: #627D98; font-size: 10px; font-weight: 800; margin-top: 2px; }
  .client-capital-expand-button { width: 26px; height: 26px; border-radius: 9px; border: 1px solid #D8DEE9; background: #FFFFFF; color: #00215D; cursor: pointer; font-family: Calibri, Arial, sans-serif; font-weight: 900; font-size: 16px; line-height: 1; display: inline-flex; align-items: center; justify-content: center; }
  .client-capital-expand-button:hover { background: #EEF2FA; border-color: #B8C7DE; }
  .client-capital-details-row td { background: #FCFBF8 !important; padding: 12px !important; }
  .client-capital-details-box { border: 1px solid #E7D9CA; border-radius: 16px; background: #FFFFFF; padding: 12px; }
  .client-capital-details-title { color: #00215D; font-size: 13px; font-weight: 900; margin-bottom: 10px; }
  .client-capital-inner-wrap { border-radius: 14px; }
  .client-capital-inner-table { min-width: 760px; }
  .client-capital-inner-table th { background: #EEF2FA; color: #00215D; }
  .client-capital-inner-table th, .client-capital-inner-table td { text-align: center; font-size: 11px; }
  .client-capital-inner-table th:first-child, .client-capital-inner-table td:first-child,
  .client-capital-inner-table th:nth-child(2), .client-capital-inner-table td:nth-child(2) { text-align: right; }
  .client-capital-total-row .capital-total { background: #FFFDF7 !important; border-right: 1px solid #F1E4C5; color: #00215D; font-weight: 900; }
  .client-capital-total-row .pension-total { background: #F8FBFF !important; border-right: 1px solid #DCEAFE; color: #00215D; font-weight: 900; }
  .client-capital-study-wrap { max-width: 720px; }
  .client-capital-study-table { min-width: 460px; }
  .client-capital-study-table th, .client-capital-study-table td { text-align: center; }
  .client-capital-study-table th:first-child, .client-capital-study-table td:first-child { text-align: right; }
  .client-capital-note { border: 1px solid #D8DEE9; border-radius: 16px; background: #F8FBFF; color: #627D98; font-size: 12px; line-height: 1.7; padding: 12px 14px; }

  .client-pdf-button { min-height: 54px; width: 54px; padding: 0; border-radius: 16px; background: rgba(255,255,255,0.11); border: 1px solid rgba(255,255,255,0.18); color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; position: relative; }
  .client-pdf-button:hover { background: rgba(255,255,255,0.18); }
  .client-pdf-button::after { content: attr(title); position: absolute; bottom: calc(100% + 8px); left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.82); color: #fff; font-size: 12px; font-weight: 700; white-space: nowrap; padding: 5px 10px; border-radius: 8px; pointer-events: none; z-index: 100; opacity: 0; transition: opacity .15s; }
  .client-pdf-button:hover::after { opacity: 1; }

  .pdf-modal-overlay { position: fixed; inset: 0; z-index: 10000; background: rgba(0,24,69,0.48); }
  .pdf-modal { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 10001; background: #fff; border-radius: 24px; padding: 28px; width: min(520px, 94vw); box-shadow: 0 24px 64px rgba(0,33,93,0.22); direction: rtl; font-family: Calibri, Arial, sans-serif; }
  .pdf-modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
  .pdf-modal-header h2 { margin: 0; color: ${theme.navy}; font-size: 22px; font-weight: 900; }
  .pdf-modal-close { width: 36px; height: 36px; border-radius: 999px; border: 1px solid ${theme.border}; background: ${theme.surfaceAlt}; color: ${theme.text}; font-size: 24px; line-height: 1; cursor: pointer; }
  .pdf-modal-subtitle { margin: 0 0 18px; color: ${theme.textSoft}; font-size: 13px; font-weight: 700; }
  .pdf-modal-items { display: flex; flex-direction: column; gap: 8px; margin-bottom: 22px; max-height: 360px; overflow-y: auto; }
  .pdf-modal-item { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 14px; border: 1px solid ${theme.divider}; background: ${theme.surfaceAlt}; cursor: pointer; font-size: 14px; font-weight: 800; color: ${theme.text}; transition: 0.15s ease; }
  .pdf-modal-item.checked { background: ${theme.softBlue}; border-color: #BFCFE8; color: ${theme.navy}; }
  .pdf-modal-item:hover { border-color: ${theme.border}; }
  .pdf-modal-checkbox { display: none; }
  .pdf-modal-item::before { content: ""; width: 20px; height: 20px; border-radius: 6px; border: 2px solid ${theme.border}; background: #fff; flex-shrink: 0; order: -1; }
  .pdf-modal-item.checked::before { background: ${theme.navy}; border-color: ${theme.navy}; background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 12 10' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 5l3.5 3.5L11 1' stroke='%23fff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"); background-size: 12px; background-repeat: no-repeat; background-position: center; }
  .pdf-modal-icon { font-size: 18px; }
  .pdf-modal-footer { display: flex; gap: 10px; justify-content: flex-end; }
  .pdf-modal-cancel { min-height: 44px; padding: 0 20px; border-radius: 12px; border: 1px solid ${theme.border}; background: #fff; color: ${theme.text}; font-family: Calibri, Arial, sans-serif; font-size: 14px; font-weight: 800; cursor: pointer; }
  .pdf-modal-export { min-height: 44px; padding: 0 22px; border-radius: 12px; border: 0; background: linear-gradient(135deg, ${theme.accent} 0%, ${theme.navy} 100%); color: #fff; font-family: Calibri, Arial, sans-serif; font-size: 14px; font-weight: 900; cursor: pointer; display: flex; align-items: center; gap: 8px; }
  .pdf-modal-export:disabled { opacity: 0.5; cursor: not-allowed; }

  .pdf-print-container { visibility: hidden; position: absolute; top: -9999px; left: -9999px; width: 0; height: 0; overflow: hidden; pointer-events: none; }

  @media print {
    @page { size: A4 landscape; margin: 10mm; }
    /* Override App-level portrait PrintStyles that clamp body to 210mm and leave a wide empty band on this landscape export */
    html, body { direction: rtl !important; font-family: Calibri, Arial, sans-serif !important; background: #fff !important; width: auto !important; max-width: none !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; }
    .client-sidebar, .client-main, .pdf-modal-overlay, .pdf-modal { display: none !important; }
    .client-web-shell { display: block !important; background: #fff !important; padding: 0 !important; width: auto !important; max-width: none !important; }
    .pdf-print-container { visibility: visible !important; position: static !important; top: auto !important; left: auto !important; width: auto !important; height: auto !important; overflow: visible !important; display: block !important; }
    .pdf-print-header { margin-bottom: 10mm; border-bottom: 2px solid #00215D; padding-bottom: 5mm; }
    .pdf-print-title { font-size: 20pt; font-weight: 900; color: #00215D; }
    .pdf-print-subtitle { font-size: 10pt; color: #627D98; margin-top: 2mm; }
    /* Let sections flow across pages so content fills each sheet instead of jumping whole sections to a new page and leaving big gaps. Atomic cards/tables below stay unbreakable. */
    .pdf-print-section { margin-bottom: 8mm; }
    .pdf-print-section-title { font-size: 13pt; font-weight: 900; color: #00215D; border-right: 4px solid #FF2756; padding-right: 7px; margin-bottom: 5mm; break-after: avoid; page-break-after: avoid; }
    .client-section-title-row { break-inside: avoid; }
    .client-margin-top { margin-top: 6mm !important; }
    .client-kpi-grid { margin-bottom: 6mm !important; }
    /* Let a long table flow across pages (header repeats) instead of jumping whole onto the next sheet and stranding its heading on an empty page. Rows stay atomic. */
    table { break-inside: auto; page-break-inside: auto; width: 100%; border-collapse: collapse; font-size: 8.5pt; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    th, td { border: 1px solid #E2D1BF; padding: 3px 5px; }
    thead { display: table-header-group; }
    /* shrink wide tables to fit the sheet instead of overflowing/being clipped by the scroll wrapper */
    .client-table-wrap { overflow: visible !important; }
    table, .client-table, .client-insurance-table, .client-product-assets-table, .client-drawer-table, .client-special-table, .client-section28-table, .client-vested-table, .client-manual-recognized-table, .client-capital-table, .client-capital-inner-table, .client-capital-study-table { min-width: 0 !important; width: 100% !important; table-layout: fixed !important; }
    td, th { word-break: break-word; overflow-wrap: anywhere; }
    .client-kpi-grid { display: grid !important; grid-template-columns: repeat(4, 1fr) !important; }
    .client-grid-2, .client-allocation-top-pies { display: grid !important; grid-template-columns: repeat(2, 1fr) !important; }
    .client-grid-3 { display: grid !important; grid-template-columns: repeat(3, 1fr) !important; }
    .client-personal-grid { display: grid !important; grid-template-columns: repeat(2, 1fr) !important; }
    .client-panel, .client-product-accordion, .client-personal-card, .client-kpi-card, .client-donut-panel { break-inside: avoid; page-break-inside: avoid; }
    /* a panel/accordion wrapping a long table must be allowed to break, otherwise its heading gets stranded on its own page */
    .client-panel:has(table), .client-product-accordion:has(table) { break-inside: auto !important; page-break-inside: auto !important; }
    .client-panel:has(table) h3 { break-after: avoid; page-break-after: avoid; }
    button, .client-topbar, .client-drawer-overlay, .pdf-modal { display: none !important; }
    .client-content-card { box-shadow: none !important; border: none !important; }
    svg, canvas { max-width: 100% !important; }
  }
  @media (max-width: 1180px) { .client-product-summary { grid-template-columns: 28px minmax(0, 1fr) repeat(2, minmax(110px, .8fr)); } .client-product-strip-item { border-right: 0; padding-right: 0; } .client-web-shell { grid-template-columns: 1fr; } .client-sidebar { position: relative; height: auto; display: block; border-left: 0; border-bottom: 1px solid rgba(255,255,255,0.12); } .client-sidebar-nav { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); } .client-main { padding: 18px; } .client-topbar { flex-direction: column; align-items: stretch; } .client-topbar-actions { justify-content: flex-start; } .client-kpi-grid, .client-capital-kpi-row { grid-template-columns: repeat(2, minmax(0, 1fr)); } .client-grid-3, .client-grid-2, .client-personal-grid, .client-allocation-top-pies, .client-special-grid { grid-template-columns: 1fr; } }
  @media (max-width: 720px) { .client-product-summary { grid-template-columns: 28px minmax(0, 1fr); align-items: start; } .client-product-strip-item { grid-column: 1 / -1; min-height: auto; } .client-main { padding: 12px; } .client-sidebar { padding: 16px 12px; } .client-sidebar-nav { grid-template-columns: 1fr; } .client-kpi-grid { grid-template-columns: 1fr; } .client-content-card { padding: 16px; border-radius: 18px; } .client-topbar { padding: 16px; border-radius: 18px; } .client-page-title { font-size: 22px; } .client-donut-layout, .client-donut-layout.wide { grid-template-columns: 1fr; justify-items: center; } .client-drawer-stats { grid-template-columns: 1fr; } .client-donut-panel.wide .client-legend { grid-template-columns: 1fr; } .client-scope-select-wrap, .client-history-button { grid-template-columns: 1fr; width: 100%; } .client-personal-fields, .client-special-metrics, .client-capital-kpi-row { grid-template-columns: 1fr; } }
`;

const styles = {
  emptyPage: { minHeight: "100vh", direction: "rtl", fontFamily: 'Calibri, "Arial", sans-serif', background: theme.pageBg, color: theme.text, padding: 32, display: "flex", alignItems: "center", justifyContent: "center" },
  emptyCard: { width: "100%", maxWidth: 760, background: "#FFFFFF", border: `1px solid ${theme.border}`, borderRadius: 22, padding: 32, boxShadow: "0 10px 28px rgba(16,42,67,0.08)", textAlign: "center" },
  emptyTitle: { margin: "0 0 12px", color: theme.navy, fontSize: 28, lineHeight: 1.25, fontWeight: 800 },
  emptyText: { margin: "0 auto 22px", maxWidth: 560, color: theme.textSoft, fontSize: 15, lineHeight: 1.8 },
  secondaryButton: { minWidth: 150, minHeight: 42, padding: "10px 16px", borderRadius: 12, border: "1px solid #D9DDE8", background: "#FFFFFF", color: theme.text, fontWeight: 800, fontFamily: 'Calibri, "Arial", sans-serif', cursor: "pointer" },
};
