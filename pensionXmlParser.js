// src/utils/pensionXmlParser.js

function sanitizeXml(rawXml) {
  let text = String(rawXml || "");
  text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  text = text.replace(/&(?!amp;|lt;|gt;|quot;|apos;)/g, "&amp;");
  return text;
}

function parseXmlDocument(rawXml) {
  const sanitized = sanitizeXml(rawXml);
  const parser = new DOMParser();
  const doc = parser.parseFromString(sanitized, "application/xml");

  const parserError = doc.querySelector("parsererror");
  if (parserError) {
    throw new Error("XML parse error: " + parserError.textContent);
  }

  return doc;
}

function getFirst(root, tag) {
  return root?.querySelector?.(tag) || null;
}

function getText(root, tag) {
  return getFirst(root, tag)?.textContent?.trim() || "";
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]*>/g, "").trim();
}

function normalizeText(value) {
  return stripHtml(value).replace(/\s+/g, " ").trim();
}

function normalizeManagerName(value) {
  const raw = normalizeText(value);
  const text = raw
    .replace(/[״"]/g, "")
    .replace(/[׳']/g, "")
    .replace(/בע"מ/g, "בעמ")
    .replace(/בע\s*מ/g, "בעמ")
    .trim();

  if (!text || text === "לא ידוע" || text === "ללא שם") {
    return "אחר";
  }

  const lowerText = text.toLowerCase();

  if (text.includes("כלל")) return "כלל";
  if (text.includes("הראל")) return "הראל";
  if (text.includes("מגדל")) return "מגדל";
  if (text.includes("מנורה")) return "מנורה";
  if (text.includes("הפניקס") || text.includes("פניקס")) return "הפניקס";
  if (text.includes("מיטב")) return "מיטב";
  if (text.includes("אלטשולר")) return "אלטשולר שחם";
  if (text.includes("מור")) return "מור";
  if (text.includes("ילין")) return "ילין לפידות";
  if (text.includes("אנליסט")) return "אנליסט";
  if (text.includes("אינפיניטי")) return "אינפיניטי";
  if (text.includes("איילון")) return "איילון";
  if (text.includes("הכשרה")) return "הכשרה";
  if (text.includes("פסגות")) return "פסגות";
  if (text.includes("עמיתים")) return "עמיתים";
  if (text.includes("גלובלנט")) return "גלובלנט";
  if (text.includes("סלייס")) return "סלייס";
  if (text.includes("קל גמל")) return "קל גמל";

  const looksLikeKnownFinancialEntity =
    lowerText.includes("insurance") ||
    lowerText.includes("pension") ||
    lowerText.includes("gemel") ||
    text.includes("ביטוח") ||
    text.includes("פנסיה") ||
    text.includes("גמל") ||
    text.includes("השתלמות") ||
    text.includes("חברה מנהלת") ||
    text.includes("ניהול") ||
    text.includes("בית השקעות");

  if (looksLikeKnownFinancialEntity) {
    return text;
  }

  return "אחר";
}

function parseNumber(value) {
  if (value === null || value === undefined) return null;

  const clean = normalizeText(value)
    .replace(/₪/g, "")
    .replace(/%/g, "")
    .replace(/,/g, "")
    .trim();

  if (!clean || clean === "-" || clean === "לא פעילה") return null;

  const num = Number(clean);
  return Number.isFinite(num) ? num : null;
}

function parseIntSafe(value) {
  const num = parseNumber(value);
  return num === null ? null : Math.round(num);
}

function sumNullable(values) {
  return values.reduce((acc, val) => acc + (val ?? 0), 0);
}

function formatDateForReport(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function pickFirstText(sectionRoots, tag) {
  for (const section of sectionRoots) {
    if (!section) continue;
    const value = getText(section, tag);
    if (value) return value;
  }
  return "";
}

function parseInvestProperties(root, selector) {
  if (!root) return [];

  return Array.from(root.querySelectorAll(selector)).map((node) => ({
    id: getText(node, "PropertyID"),
    name: getText(node, "PropertyName"),
    rate: parseNumber(getText(node, "rate")),
  }));
}

function inferEquityFromTrackName(name = "") {
  const text = String(name).toLowerCase();

  if (
    text.includes("מניות") ||
    text.includes("s&p") ||
    text.includes("מחקה") ||
    text.includes("מניית")
  ) {
    return 90;
  }

  if (
    text.includes("כללי") ||
    text.includes("general") ||
    text.includes('אג"ח + מניות') ||
    text.includes("משולב")
  ) {
    return 45;
  }

  if (
    text.includes('אג"ח') ||
    text.includes("bond") ||
    text.includes("שקלי") ||
    text.includes("כספי")
  ) {
    return 10;
  }

  return 25;
}

function parseInvestPlans(policyNode) {
  const plansRoot = policyNode.querySelector("InvestPlans");
  if (!plansRoot) return [];

  const planNodes = Array.from(plansRoot.querySelectorAll("InvestPlan"));

  return planNodes.map((plan) => {
    const exposures = parseInvestProperties(
      plan,
      "Properties > Exposures > Property"
    );

    const mainGroups = parseInvestProperties(
      plan,
      "Properties > MainGroups > Property"
    );

    const equityExposure =
      exposures.find(
        (p) => p.id === "4751" || (p.name || "").includes("מניות")
      )?.rate ??
      mainGroups.find((p) => (p.name || "").includes("מניות"))?.rate ??
      inferEquityFromTrackName(getText(plan, "PlanNameAfik"));

    const foreignExposure =
      exposures.find(
        (p) => p.id === "4752" || (p.name || "").includes('חו"ל')
      )?.rate ?? 0;

    return {
      mofid: getText(plan, "MOFID"),
      proposeType: getText(plan, "ProposeType"),
      planName: getText(plan, "PlanName"),
      trackName: getText(plan, "PlanNameAfik"),
      avgRate12: parseNumber(getText(plan, "AvgRate12")),
      avgRate36: parseNumber(getText(plan, "AvgRate36")),
      avgRate60: parseNumber(getText(plan, "AvgRate60")),
      totalRate12: parseNumber(getText(plan, "RateTotal12Months")),
      totalRate36: parseNumber(getText(plan, "RateTotal36Months")),
      totalRate60: parseNumber(getText(plan, "RateTotal60Months")),
      standardDeviation36: parseNumber(getText(plan, "ST36Months")),
      sharp: parseNumber(getText(plan, "SharpAnaf")),
      directExpenses: parseNumber(getText(plan, "DirectExpences")),
      totalExpenses: parseNumber(getText(plan, "TotalExpenses")),
      mainGroups,
      exposures,
      equityExposure,
      foreignExposure,
    };
  });
}

function parseLoans(policyNode) {
  const loansRoot = policyNode.querySelector("Loans");
  if (!loansRoot) return [];

  const loanNodes = Array.from(loansRoot.querySelectorAll("Loan"));

  return loanNodes
    .map((loanNode, index) => ({
      rowNum: index + 1,
      amount: parseNumber(getText(loanNode, "SCHUM-HALVAA")),
      repaymentFrequency: normalizeText(
        getText(loanNode, "TADIRUT-HECHZER-HALVAA")
      ),
      balance: parseNumber(getText(loanNode, "YITRAT-HALVAA")),
      endDate: normalizeText(getText(loanNode, "TAARICH-SIYUM-HALVAA")),
    }))
    .filter(
      (loan) =>
        loan.amount !== null ||
        loan.balance !== null ||
        !!loan.repaymentFrequency ||
        !!loan.endDate
    );
}

function parsePolicy(policyNode) {
  const budgets = policyNode.querySelector("Budgets");
  const covers = policyNode.querySelector("Covers");
  const save = policyNode.querySelector("Save");
  const details = policyNode.querySelector("PolicyDetails");

  const sectionRoots = [budgets, covers, save, details];

  const productType = pickFirstText(sectionRoots, "ProposeName2");
  const planName = pickFirstText(sectionRoots, "PlanName");

  const rawManagerName =
    pickFirstText(sectionRoots, "CompanyName") ||
    pickFirstText(sectionRoots, "YeshutName") ||
    pickFirstText(sectionRoots, "ProducerName") ||
    pickFirstText(sectionRoots, "MenahelName") ||
    pickFirstText(sectionRoots, "FundName") ||
    planName ||
    "לא ידוע";

  const managerName = normalizeManagerName(rawManagerName);

  return {
    rowNum: Number(policyNode.getAttribute("RowNum") || 0),
    policyNo: pickFirstText(sectionRoots, "PolicyNo"),
    productType,
    planName,
    managerName,
    memberType: pickFirstText([budgets, save], "MemberTypeName"),
    joinDate: pickFirstText(sectionRoots, "JoinDate") || null,
    dateOfRights: pickFirstText(sectionRoots, "DateOfRights") || null,
    salary: parseNumber(getText(budgets || policyNode, "Salary")),

    monthlyDeposits: {
      worker: parseNumber(getText(budgets || policyNode, "TotalTagWorker")),
      employer: parseNumber(getText(budgets || policyNode, "TotalTagEmployer")),
      compensation: parseNumber(
        getText(budgets || policyNode, "TotalCompensetion")
      ),
      sumCost: parseNumber(getText(budgets || policyNode, "SumCost")),
      disabilityWorkerCost: parseNumber(
        getText(budgets || policyNode, "DisCost1")
      ),
      disabilityEmployerCost: parseNumber(
        getText(budgets || policyNode, "DisCostEmployer1")
      ),
      rateWorker: parseNumber(getText(budgets || policyNode, "RateTagWorker")),
      rateEmployer: parseNumber(
        getText(budgets || policyNode, "RateTagEmployer")
      ),
      rateCompensation: parseNumber(
        getText(budgets || policyNode, "RateCompensetion")
      ),
    },

    coverage: {
      totalInsurance: parseNumber(getText(covers || policyNode, "TotalBituah")),
      totalRisk: parseNumber(getText(covers || policyNode, "TotalRisk")),
      disabilityPension: parseNumber(
        getText(covers || policyNode, "PensionDisability")
      ),
      disabilityCost: parseNumber(
        getText(covers || policyNode, "CostForDisability")
      ),
      orphanPension: parseNumber(getText(covers || policyNode, "PensionOrphan")),
      widowPension: parseNumber(getText(covers || policyNode, "PensionAlmana")),
      relativesPension: parseNumber(
        getText(covers || policyNode, "PensionRelatives")
      ),
      totalMonthlyCoverCost: parseNumber(
        getText(covers || policyNode, "TotalSum")
      ),
    },

    savings: {
      before2000: parseNumber(
        getText(save || policyNode, "ItraZvuraTotalTagBefore2000")
      ),
      after2000: parseNumber(
        getText(save || policyNode, "ItraZvuraTotalTagAfter2000")
      ),
      compensation: parseNumber(
        getText(save || policyNode, "ItraZvuraCompensetion")
      ),
      totalAccumulated: parseNumber(
        getText(save || policyNode, "TotalItraZvura")
      ),
      retireCurrBalance: parseNumber(
        getText(save || policyNode, "RetireCurrBalance")
      ),
      totalPidions: parseNumber(getText(save || policyNode, "TotalPidions")),
      retireCurrBalancePension: parseNumber(
        getText(save || policyNode, "RetireCurrBalancePension")
      ),
      pensionRetire: parseNumber(getText(save || policyNode, "PensionRetire")),
      projectedRetirementBalance: parseNumber(
        getText(save || policyNode, "RetireCurrBalance")
      ),
      projectedMonthlyPension: parseNumber(
        getText(save || policyNode, "PensionRetire")
      ),
      totalRedemptions: parseNumber(getText(save || policyNode, "TotalPidions")),
      hCoeff: parseNumber(getText(save || policyNode, "HCoff")),
    },

    details: {
      proposeName: getText(details || policyNode, "ProposeName"),
      targetPlan: getText(details || policyNode, "TargetPlan"),
      annuityType: getText(details || policyNode, "AnnuityType"),
      retireAge: parseIntSafe(getText(details || policyNode, "RetireAge")),
      agePremiaYear: parseIntSafe(getText(details || policyNode, "AgePremiaYear")),
      managementFeeFromDeposit: parseNumber(
        getText(details || policyNode, "DNihulPremia")
      ),
      managementFeeFromBalance: parseNumber(
        getText(details || policyNode, "DNFromHon")
      ),
      expectedReturn: parseNumber(getText(details || policyNode, "GetYield")),
    },

    investPlans: parseInvestPlans(policyNode),
    loans: parseLoans(policyNode),
  };
}

function parseSummary(doc) {
  const budget = doc.querySelector("Summary > Budget");
  const cover = doc.querySelector("Summary > Cover");
  const brutoSave = doc.querySelector("Summary > Save > Bruto");
  const netoSave = doc.querySelector("Summary > Save > Neto");

  return {
    budget: {
      worker: parseNumber(getText(budget || doc, "TotalTagWorker")),
      employer: parseNumber(getText(budget || doc, "TotalTagEmployer")),
      compensation: parseNumber(getText(budget || doc, "TotalCompensetion")),
      sumCost: parseNumber(getText(budget || doc, "SumCost")),
      disabilityWorkerCost: parseNumber(getText(budget || doc, "DisCost1")),
      disabilityEmployerCost: parseNumber(
        getText(budget || doc, "DisCostEmployer1")
      ),
    },
    cover: {
      totalInsurance: parseNumber(getText(cover || doc, "TotalBituah")),
      totalRisk: parseNumber(getText(cover || doc, "TotalRisk")),
      disabilityPension: parseNumber(getText(cover || doc, "PensionDisability")),
      disabilityCost: parseNumber(getText(cover || doc, "CostForDisability")),
      orphanPension: parseNumber(getText(cover || doc, "PensionOrphan")),
      widowPension: parseNumber(getText(cover || doc, "PensionAlmana")),
      relativesPension: parseNumber(getText(cover || doc, "PensionRelatives")),
      totalMonthlyCoverCost: parseNumber(getText(cover || doc, "TotalSum")),
    },
    save: {
      totalAccumulated: parseNumber(getText(brutoSave || doc, "TotalItraZvura")),
      withDepositsLumpSumField: parseNumber(
        getText(brutoSave || doc, "TotalPidions")
      ),
      withoutDepositsLumpSumField: parseNumber(
        getText(netoSave || brutoSave || doc, "RetireCurrBalance")
      ),
      withDepositsMonthlyPensionField: parseNumber(
        getText(brutoSave || doc, "PensionRetire")
      ),
      withoutDepositsMonthlyPensionField: parseNumber(
        getText(brutoSave || doc, "RetireCurrBalancePension")
      ),
      projectedRetirementBalance: parseNumber(
        getText(brutoSave || doc, "RetireCurrBalance")
      ),
      projectedMonthlyPension: parseNumber(
        getText(brutoSave || doc, "PensionRetire")
      ),
      totalRedemptions: parseNumber(getText(brutoSave || doc, "TotalPidions")),
      retireCurrBalancePension: parseNumber(
        getText(netoSave || brutoSave || doc, "RetireCurrBalancePension")
      ),
      before2000: parseNumber(
        getText(brutoSave || doc, "ItraZvuraTotalTagBefore2000")
      ),
      after2000: parseNumber(
        getText(brutoSave || doc, "ItraZvuraTotalTagAfter2000")
      ),
      compensation: parseNumber(
        getText(brutoSave || doc, "ItraZvuraCompensetion")
      ),
    },
  };
}

export function parsePensionXml(rawXml, fileName = "") {
  const doc = parseXmlDocument(rawXml);

  const memberNode = doc.querySelector("MemberDetails");
  if (!memberNode) {
    throw new Error("MemberDetails not found in XML");
  }

  const firstName = normalizeText(getText(memberNode, "FirstName"));
  const lastName = normalizeText(getText(memberNode, "FamilyName"));

  const member = {
    id: normalizeText(getText(memberNode, "ID")),
    firstName,
    lastName,
    fullName: [firstName, lastName].filter(Boolean).join(" "),
    companyName: normalizeText(getText(memberNode, "CompanyName")),
    income: parseNumber(getText(memberNode, "Income")),
  };

  const policyNodes = Array.from(doc.querySelectorAll("Policies > Policy"));
  const policies = policyNodes
    .map(parsePolicy)
    .sort((a, b) => a.rowNum - b.rowNum);

  const summary = parseSummary(doc);

  return {
    fileName,
    rawXmlPreview: sanitizeXml(rawXml).slice(0, 3000),
    member,
    policies,
    summary,
  };
}

export async function parsePensionXmlFile(file) {
  const rawXml = await file.text();
  return parsePensionXml(rawXml, file.name);
}

export async function parseMultiplePensionXmlFiles(files) {
  return Promise.all(files.map(parsePensionXmlFile));
}

function groupBySum(items, getKey, getValue) {
  const map = new Map();

  items.forEach((item) => {
    const key = getKey(item) || "לא ידוע";
    const value = getValue(item) || 0;
    map.set(key, (map.get(key) || 0) + value);
  });

  return Array.from(map.entries())
    .map(([name, value]) => ({ name, value }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);
}

function uniquePolicies(policies) {
  const seen = new Set();

  return policies.filter((policy) => {
    const key = [
      policy.ownerId || "",
      policy.rowNum || "",
      policy.policyNo || "",
      policy.productType || "",
      policy.planName || "",
    ].join("|");

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getPolicyText(policy) {
  return [
    policy?.productType,
    policy?.planName,
    policy?.details?.proposeName,
    policy?.details?.targetPlan,
    policy?.details?.annuityType,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function isPensionFundPolicy(policy) {
  const text = getPolicyText(policy);

  return (
    text.includes("קרן פנסיה") ||
    text.includes("פנסיה מקיפה") ||
    text.includes("פנסיה כללית") ||
    text.includes("פנסיה חדשה") ||
    text.includes("פנסיה ותיקה") ||
    text.includes("פנסיה מקיפה חדשה") ||
    text.includes("פנסיה כללית משלימה")
  );
}

function isNoCoeffPolicy(policy) {
  const coeff = policy?.savings?.hCoeff;
  return coeff === null || coeff === undefined || coeff === 0;
}

/**
 * סכום למוטבים / פטירה להצגה:
 * לפי הדוח המקורי, יש לכלול את עמודת TotalBituah מכל מוצר שאינו קרן פנסיה.
 * כלומר: ביטוחי מנהלים, קופות גמל, קרנות השתלמות, ריסק וכל מוצר אחר שאינו קרן פנסיה.
 * קרן פנסיה לא נכנסת לחישוב הזה.
 */
function getBeneficiaryDeathAmount(policy) {
  if (isPensionFundPolicy(policy)) return 0;
  return Number(policy?.coverage?.totalInsurance || 0);
}

function buildLifeCoverageDisplayAmount(policies) {
  const safePolicies = Array.isArray(policies) ? policies : [];
  const unique = uniquePolicies(safePolicies);

  return sumNullable(unique.map(getBeneficiaryDeathAmount));
}

function buildTracks(flatPolicies) {
  const tracksRaw = [];

  flatPolicies.forEach((policy) => {
    const plans = policy.investPlans || [];
    const policyValue = policy.savings.totalAccumulated || 0;

    if (!plans.length && policyValue > 0) {
      tracksRaw.push({
        name: policy.planName || policy.productType || "מסלול לא ידוע",
        value: policyValue,
        equityPercent: inferEquityFromTrackName(
          policy.planName || policy.productType || ""
        ),
      });
      return;
    }

    const divisor = plans.length || 1;

    plans.forEach((plan) => {
      tracksRaw.push({
        name:
          plan.trackName ||
          plan.planName ||
          policy.planName ||
          "מסלול לא ידוע",
        value: policyValue / divisor,
        equityPercent:
          plan.equityExposure ??
          inferEquityFromTrackName(plan.trackName || plan.planName || ""),
      });
    });
  });

  const grouped = new Map();

  tracksRaw.forEach((track) => {
    const current = grouped.get(track.name) || {
      name: track.name,
      value: 0,
      weightedEquity: 0,
    };

    current.value += track.value || 0;
    current.weightedEquity +=
      (track.value || 0) * (track.equityPercent || 0);

    grouped.set(track.name, current);
  });

  return Array.from(grouped.values())
    .map((track) => ({
      name: track.name,
      value: track.value,
      equityPercent:
        track.value > 0 ? Math.round(track.weightedEquity / track.value) : 0,
    }))
    .filter((track) => track.value > 0)
    .sort((a, b) => b.value - a.value);
}

function buildMainGroupAllocation(flatPolicies) {
  const grouped = new Map();

  flatPolicies.forEach((policy) => {
    const policyValue = Number(policy?.savings?.totalAccumulated || 0);
    if (policyValue <= 0) return;

    const plans = Array.isArray(policy.investPlans) ? policy.investPlans : [];
    if (!plans.length) return;

    const divisor = plans.length || 1;
    const planWeight = policyValue / divisor;

    plans.forEach((plan) => {
      const mainGroups = Array.isArray(plan.mainGroups) ? plan.mainGroups : [];

      mainGroups.forEach((group) => {
        const rate = Number(group?.rate || 0);
        if (!group?.name || rate <= 0) return;

        const weightedValue = planWeight * (rate / 100);
        const key = `${group.id || ""}|${group.name}`;

        const current = grouped.get(key) || {
          id: group.id || "",
          name: group.name,
          value: 0,
        };

        current.value += weightedValue;
        grouped.set(key, current);
      });
    });
  });

  const items = Array.from(grouped.values())
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);

  const total = items.reduce((sum, item) => sum + item.value, 0);

  return items.map((item) => ({
    ...item,
    percent: total > 0 ? (item.value / total) * 100 : 0,
  }));
}

function buildForeignExposureAllocation(flatPolicies) {
  let totalTrackedValue = 0;
  let abroadWeightedValue = 0;

  flatPolicies.forEach((policy) => {
    const policyValue = Number(policy?.savings?.totalAccumulated || 0);
    if (policyValue <= 0) return;

    const plans = Array.isArray(policy.investPlans) ? policy.investPlans : [];

    if (!plans.length) {
      totalTrackedValue += policyValue;
      return;
    }

    const divisor = plans.length || 1;
    const planWeight = policyValue / divisor;

    plans.forEach((plan) => {
      const rate = Math.max(0, Math.min(100, Number(plan?.foreignExposure || 0)));
      totalTrackedValue += planWeight;
      abroadWeightedValue += planWeight * (rate / 100);
    });
  });

  if (totalTrackedValue <= 0) {
    return {
      weightedForeignExposure: 0,
      items: [
        { name: 'חו"ל', value: 0, percent: 0 },
        { name: "ישראל", value: 100, percent: 100 },
      ],
    };
  }

  const abroadPercent = (abroadWeightedValue / totalTrackedValue) * 100;
  const israelPercent = Math.max(0, 100 - abroadPercent);

  return {
    weightedForeignExposure: abroadPercent,
    items: [
      { name: 'חו"ל', value: abroadPercent, percent: abroadPercent },
      { name: "ישראל", value: israelPercent, percent: israelPercent },
    ],
  };
}

export function buildLegacyReportData(parsedFiles) {
  const files = Array.isArray(parsedFiles) ? parsedFiles : [];

  const flatPolicies = files.flatMap((file) =>
    (file.policies || []).map((policy) => ({
      ...policy,
      ownerName: file.member.fullName,
      ownerId: file.member.id,
      ownerFile: file.fileName,
      ownerFirstName: file.member.firstName,
      ownerLastName: file.member.lastName,
    }))
  );

  const noCoeffPolicies = flatPolicies.filter(isNoCoeffPolicy);

  const totalAssets = sumNullable(
    files.map((f) => f.summary?.save?.totalAccumulated)
  );

  const monthlyDeposits = sumNullable(
    files.map((f) => f.summary?.budget?.sumCost)
  );

  const monthlyPensionWithDeposits = sumNullable(
    files.map((f) => f.summary?.save?.withDepositsMonthlyPensionField)
  );

  const monthlyPensionWithoutDeposits = sumNullable(
    files.map((f) => f.summary?.save?.withoutDepositsMonthlyPensionField)
  );

  const projectedLumpSumWithoutDeposits = sumNullable(
    noCoeffPolicies.map((p) => p.savings?.retireCurrBalance)
  );

  const projectedLumpSumWithDeposits = sumNullable(
    noCoeffPolicies.map((p) => p.savings?.totalPidions)
  );

  const totalInsurance = buildLifeCoverageDisplayAmount(flatPolicies);

  const retirementAges = Array.from(
    new Set(
      flatPolicies
        .map((p) => p.details?.retireAge)
        .filter((v) => Number.isFinite(v) && v > 0)
    )
  ).sort((a, b) => a - b);

  const retirementAgeLabel = retirementAges.length
    ? `התחזית מבוססת על גילי הפרישה שהוגדרו בדוחות (${retirementAges.join(
        ", "
      )}).`
    : "התחזית מבוססת על גילי הפרישה שהוגדרו בדוחות.";

  const members = files.map((file) => {
    const memberPolicies = flatPolicies.filter(
      (policy) => policy.ownerId === file.member.id
    );

    const memberNoCoeff = memberPolicies.filter(isNoCoeffPolicy);

    const assets = file.summary?.save?.totalAccumulated || 0;
    const monthlyDepositsMember = file.summary?.budget?.sumCost || 0;

    const deathCoverage = buildLifeCoverageDisplayAmount(memberPolicies);

    const disabilityValue = sumNullable(
      memberPolicies.map(
        (p) => p.coverage?.disabilityPension ?? p.coverage?.totalRisk ?? 0
      )
    );

    const incomeBase = Number(file.member.income || 0);

    const disabilityPercent =
      incomeBase > 0 ? Math.round((disabilityValue / incomeBase) * 100) : 0;

    return {
      name: file.member.fullName || "ללא שם",
      shareOfFamilyAssets:
        totalAssets > 0 ? Math.round((assets / totalAssets) * 100) : 0,
      monthlyDeposits: monthlyDepositsMember,
      assets,
      monthlyPensionWithDeposits:
        file.summary?.save?.withDepositsMonthlyPensionField || 0,
      monthlyPensionWithoutDeposits:
        file.summary?.save?.withoutDepositsMonthlyPensionField || 0,
      lumpSumWithDeposits: sumNullable(
        memberNoCoeff.map((p) => p.savings?.totalPidions)
      ),
      lumpSumWithoutDeposits: sumNullable(
        memberNoCoeff.map((p) => p.savings?.retireCurrBalance)
      ),
      deathCoverage,
      disabilityValue,
      disabilityPercent,
    };
  });

  const products = groupBySum(
    flatPolicies,
    (p) => p.productType || "ללא סוג",
    (p) => p.savings?.totalAccumulated || 0
  );

  const managers = groupBySum(
    flatPolicies,
    (p) => normalizeManagerName(p.managerName),
    (p) => p.savings?.totalAccumulated || 0
  );

  const tracks = buildTracks(flatPolicies);
  const mainGroupAllocation = buildMainGroupAllocation(flatPolicies);
  const foreignExposureResult = buildForeignExposureAllocation(flatPolicies);

  const totalProducts = sumNullable(products.map((p) => p.value));
  const totalManagers = sumNullable(managers.map((p) => p.value));
  const totalTracks = sumNullable(tracks.map((t) => t.value));

  const weightedEquityExposure =
    totalTracks > 0
      ? Math.round(
          tracks.reduce(
            (acc, track) =>
              acc + (track.value || 0) * (track.equityPercent || 0),
            0
          ) / totalTracks
        )
      : 0;

  const loanDetails = flatPolicies.flatMap((policy) =>
    (policy.loans || []).map((loan, index) => ({
      id: [
        policy.ownerId || "",
        policy.policyNo || "",
        policy.rowNum || "",
        index,
        loan.amount ?? "",
        loan.balance ?? "",
        loan.endDate || "",
      ].join("|"),
      firstName: policy.ownerFirstName || "",
      familyName: policy.ownerLastName || "",
      amount: loan.amount ?? 0,
      repaymentFrequency: loan.repaymentFrequency || "",
      balance: loan.balance ?? 0,
      endDate: loan.endDate || "",
      policyNo: policy.policyNo || "",
      productType: policy.productType || "",
      planName: policy.planName || "",
    }))
  );

  const uniqueLoanMap = new Map();

  loanDetails.forEach((loan) => {
    const key = [
      loan.firstName,
      loan.familyName,
      loan.amount,
      loan.balance,
      loan.repaymentFrequency,
      loan.endDate,
      loan.policyNo,
    ].join("|");

    if (!uniqueLoanMap.has(key)) {
      uniqueLoanMap.set(key, loan);
    }
  });

  const uniqueLoanDetails = Array.from(uniqueLoanMap.values());

  return {
    family: {
      lastUpdated: formatDateForReport(new Date()),
      totalAssets,
      monthlyDeposits,
      monthlyPensionWithDeposits,
      projectedLumpSumWithDeposits,
      monthlyPensionWithoutDeposits,
      projectedLumpSumWithoutDeposits,
      retirementAgeLabel,
      totalInsurance,
    },
    members,
    products,
    managers,
    tracks,
    mainGroupAllocation,
    foreignExposureAllocation: foreignExposureResult.items,
    weightedForeignExposure: foreignExposureResult.weightedForeignExposure,
    loans: {
      hasData: uniqueLoanDetails.length > 0,
      details: uniqueLoanDetails,
    },
    beneficiaries: {
      hasData: totalInsurance > 0,
      coverageAmount: totalInsurance,
      summary:
        totalInsurance > 0
          ? 'סכום למוטבים / פטירה מחושב לפי TotalBituah מכל מוצר שאינו קרן פנסיה'
          : "לא התקבל מידע",
    },
    weightedEquityExposure,
    totalProducts,
    totalManagers,
    totalTracks,
    rawParsedFiles: files.map((file) => ({
      fileName: file.fileName,
      memberName: file.member.fullName,
      parsedData: {
        member: file.member,
        summary: file.summary,
        policies: file.policies,
        rawTextPreview: file.rawXmlPreview,
      },
    })),
  };
}
