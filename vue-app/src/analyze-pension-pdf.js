import pdfParse from "pdf-parse";

function extractNumber(value) {
  if (!value) return 0;
  return Number(String(value).replace(/[^\d]/g, "")) || 0;
}

function normalizeText(text) {
  return String(text || "")
    .replace(/\u00A0/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function splitLines(text) {
  return normalizeText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function findLine(lines, phrase) {
  return lines.find((line) => line.includes(phrase)) || "";
}

function findSection(lines, startPhrase, endPhrases = [], maxLines = 40) {
  const startIndex = lines.findIndex((line) => line.includes(startPhrase));
  if (startIndex === -1) return [];

  let endIndex = Math.min(lines.length, startIndex + maxLines);

  for (let i = startIndex + 1; i < Math.min(lines.length, startIndex + maxLines); i++) {
    if (endPhrases.some((phrase) => lines[i].includes(phrase))) {
      endIndex = i;
      break;
    }
  }

  return lines.slice(startIndex, endIndex);
}

function findNumbers(text, min = 0) {
  return (String(text || "").match(/[\d,]+/g) || [])
    .map(extractNumber)
    .filter((num) => num >= min);
}

function parseProducts(lines) {
  const section = findSection(
    lines,
    "סוג המוצר",
    ["חלוקה לפי מוצר", "חלוקה לפי חברה", "כמה כסף מופקד עבורי?"],
    25
  );

  const products = [];

  for (const line of section) {
    const numbers = findNumbers(line, 1);
    if (!numbers.length) continue;

    const value = numbers[numbers.length - 1];

    if (line.includes("פנסיה חדשה מקיפה")) {
      products.push({ name: "פנסיה חדשה מקיפה", value });
    } else if (line.includes("פנסיה כללית מקיפה")) {
      products.push({ name: "פנסיה כללית מקיפה", value });
    } else if (line.includes("קופת גמל")) {
      products.push({ name: "קופות גמל", value });
    } else if (line.includes("קרן השתלמות")) {
      products.push({ name: "קרנות השתלמות", value });
    } else if (line.includes("גמל להשקעה")) {
      products.push({ name: "גמל להשקעה", value });
    }
  }

  return products.filter((product) => product.value > 0);
}

function parseTotalAssetsFromProducts(products) {
  return products.reduce((sum, product) => sum + (product.value || 0), 0);
}

function parseMonthlyDeposit(lines) {
  const line = findLine(lines, "הופקדו");
  const numbers = findNumbers(line, 1000);
  return numbers[0] || 0;
}

function parseRetirement(lines) {
  const section = findSection(
    lines,
    "כמה כסף יהיה לי בגיל הפרישה?",
    ["כמה כסף יהיה לי אם לא אוכל לעבוד?", "עכשיו... בואו נדבר", "מה יקרה אם"],
    30
  );

  const numbers = section.flatMap((line) => findNumbers(line, 1000));

  return {
    lumpSumWithoutDeposits: numbers[0] || 0,
    monthlyPensionWithoutDeposits: numbers[1] || 0,
    lumpSumWithDeposits: numbers[2] || 0,
    monthlyPensionWithDeposits: numbers[3] || 0,
  };
}

function parseDisability(lines) {
  const section = findSection(
    lines,
    "כמה כסף יהיה לי אם לא אוכל לעבוד?",
    ["כמה כסף יהיה למשפחתי אם אמות?"],
    20
  );

  const joined = section.join(" ");
  const numbers = findNumbers(joined, 1000);
  const percentMatch = joined.match(/(\d{1,3})%/);

  return {
    disabilityValue: numbers[0] || 0,
    disabilityPercent: percentMatch ? extractNumber(percentMatch[1]) : 0,
  };
}

function parseDeathCoverage(lines) {
  const section = findSection(
    lines,
    "כמה כסף יהיה למשפחתי אם אמות?",
    ["בנוסף לסכום ההוני", "רוצה לשמוע על התשואות שלך?", "אז כמה כל זה עולה לי?"],
    30
  );

  const numbers = section.flatMap((line) => findNumbers(line, 1000));
  return numbers[0] || 0;
}

function parseFamilyCoverage(lines) {
  const section = findSection(
    lines,
    "בנוסף לסכום ההוני",
    ["רוצה לשמוע על התשואות שלך?", "אז כמה כל זה עולה לי?"],
    25
  );

  let spouseCoverageMonthly = 0;
  let childCoverageMonthly = 0;

  for (const line of section) {
    if (line.includes("לאישה / הבעל")) {
      const numbers = findNumbers(line, 1000);
      spouseCoverageMonthly = numbers[0] || spouseCoverageMonthly;
    }

    if (line.includes("לכל ילד")) {
      const numbers = findNumbers(line, 1000);
      childCoverageMonthly = numbers[0] || childCoverageMonthly;
    }
  }

  if (!spouseCoverageMonthly || !childCoverageMonthly) {
    const allNumbers = section.flatMap((line) => findNumbers(line, 1000));
    if (allNumbers.length >= 2) {
      spouseCoverageMonthly ||= Math.max(allNumbers[0], allNumbers[1]);
      childCoverageMonthly ||= Math.min(allNumbers[0], allNumbers[1]);
    }
  }

  return {
    spouseCoverageMonthly,
    childCoverageMonthly,
  };
}

function parseInsuranceCosts(lines) {
  const disabilityCostLine = findLine(lines, "עלות חודשית אבדן כושר עבודה");
  const lifeCostLine = findLine(lines, "עלות חודשית ביטוח חיים");
  const managementFeesLine =
    findLine(lines, "החודשים האחרונים שילמת") ||
    findLine(lines, "החודשים האחרונים שילם");

  const insuranceCostMonthly = findNumbers(disabilityCostLine, 1).slice(-1)[0] || 0;
  const lifeInsuranceCostMonthly = findNumbers(lifeCostLine, 1).slice(-1)[0] || 0;
  const annualManagementFees = findNumbers(managementFeesLine, 1).slice(-1)[0] || 0;

  return {
    insuranceCostMonthly,
    lifeInsuranceCostMonthly,
    annualManagementFees,
  };
}

function parseManagementFeeRates(lines) {
  const section = findSection(lines, "דמי ניהול מצבירה", [], 40);
  const joined = section.join(" ");
  const percents = (joined.match(/\d+(?:\.\d+)?%/g) || []).map((p) =>
    Number(p.replace("%", ""))
  );

  return {
    managementFeeBalance: percents[0] || 0,
    managementFeeDeposit: percents[1] || 0,
    managementFeeProfit: percents[2] || 0,
  };
}

function detectLoans(rawText) {
  return /הלוואה|הלוואות/.test(rawText);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed",
    });
  }

  try {
    const { owner, fileName, fileBase64 } = req.body || {};

    if (!fileBase64) {
      return res.status(400).json({
        success: false,
        error: "לא התקבל קובץ לניתוח",
      });
    }

    const buffer = Buffer.from(fileBase64, "base64");
    const pdfData = await pdfParse(buffer);
    const rawText = normalizeText(pdfData.text || "");
    const lines = splitLines(pdfData.text || "");

    const extractedProducts = parseProducts(lines);
    const balance = parseTotalAssetsFromProducts(extractedProducts);
    const monthlyDeposit = parseMonthlyDeposit(lines);
    const retirement = parseRetirement(lines);
    const disability = parseDisability(lines);
    const deathCoverage = parseDeathCoverage(lines);
    const familyCoverage = parseFamilyCoverage(lines);
    const insuranceCosts = parseInsuranceCosts(lines);
    const feeRates = parseManagementFeeRates(lines);

    const parsedData = {
      owner: owner || "self",
      fileName: fileName || "",
      fullName: owner === "self" ? "בן זוג" : "בת זוג",
      provider: "מסלקה פנסיונית",
      productType: extractedProducts[0]?.name || "פנסיה",
      balance: balance || 0,
      monthlyDeposit: monthlyDeposit || 0,
      monthlyPensionWithDeposits: retirement.monthlyPensionWithDeposits || 0,
      monthlyPensionWithoutDeposits: retirement.monthlyPensionWithoutDeposits || 0,
      lumpSumWithDeposits: retirement.lumpSumWithDeposits || 0,
      lumpSumWithoutDeposits: retirement.lumpSumWithoutDeposits || 0,
      managementFeeBalance: feeRates.managementFeeBalance || 0,
      managementFeeDeposit: feeRates.managementFeeDeposit || 0,
      managementFeeProfit: feeRates.managementFeeProfit || 0,
      annualManagementFees: insuranceCosts.annualManagementFees || 0,
      disabilityValue: disability.disabilityValue || 0,
      disabilityPercent: disability.disabilityPercent || 0,
      lifeCoverage: deathCoverage || 0,
      deathCoverage: deathCoverage || 0,
      spouseCoverageMonthly: familyCoverage.spouseCoverageMonthly || 0,
      childCoverageMonthly: familyCoverage.childCoverageMonthly || 0,
      insuranceCostMonthly: insuranceCosts.insuranceCostMonthly || 0,
      lifeInsuranceCostMonthly: insuranceCosts.lifeInsuranceCostMonthly || 0,
      trackName: "כללי",
      equityPercent: 45,
      extractedProducts: extractedProducts || [],
      hasLoans: detectLoans(rawText),
      rawTextPreview: rawText.slice(0, 4000),
    };

    return res.status(200).json({
      success: true,
      parsedData,
    });
  } catch (error) {
    console.error("PDF parse error:", error);

    return res.status(500).json({
      success: false,
      error: "שגיאה בניתוח PDF",
      details: error.message,
    });
  }
}