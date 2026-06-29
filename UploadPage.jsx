// src/UploadPage.jsx

import React, { useRef, useState } from "react";
import {
  parseMultiplePensionXmlFiles,
  buildLegacyReportData,
} from "./pensionXmlParser";


const SECTION_28_CAPPING_GROUPS = [
  {
    id: "base",
    title: "נתוני בסיס",
    fields: [
      "גיל פרישה",
      "גיל הלקוח",
      "שכר פנסיוני על פי סעיף 28 לחוק קופות הגמל",
      "עלות אובדן כושר עבודה",
      "מס שולי",
      "שכר מלא",
    ],
  },
  {
    id: "employer-cost",
    title: "פירוט עלויות שכר מעסיק/עובד",
    fields: [
      "השתלמות מעל תקרה",
      "פיצויים מעל לתקרה",
      "תגמולים מעל לתקרה",
      "סכום קיטום מעל לסעיף 28 ברוטו",
      "סכום נטו לאחר ניכוי מס שולי -חלק מעסיק לחיסכון",
      "גידול בנטו בעקבות קיטום בפיצויים",
      "גידול בנטו בעקבות קיטום תגמולים",
      "גידול בנטו בעקבות קיטום קה\"ל מעל לתקרה (15,712 ₪)",
      "הפרשות עובד קה\"ל מעל תקרה (2.5%) נטו",
      "הפרשות עובד תגמולים (6%) מעל לתקרה נטו",
      "סה\"כ גידול נטו",
      "סכום חודשי נטו שמועבר לחיסכון אישי",
    ],
  },
  {
    id: "saving-simulation",
    title: "סימולציה לחיסכון",
    fields: [
      "צבירת סכום נטו בחיסכון אישי",
      "סכום צבירה ברוטו",
      "הפקדות נומינליות",
      "צבירת נטו בקרן השתלמות ( ממועד הקיטום ועד לפרישה)",
      "צבירה עד גיל פרישה לפי שכר עדכני",
      "צבירה עד גיל פרישה לפי תקרת מס",
      "צבירה עדכנית בקרן ההשתלמות ( מהוונת לגיל 67)",
      "הפקדות נומינליות ממעוד הקיטום ועד גיל פרישה",
      "צבירת קופות הוניות ( גמל וביטוחי חיים וקרנות השתלמות לא פעילות) מהוון לגיל 67",
    ],
  },
  {
    id: "retirement",
    title: "סימולציה לגיל פרישה",
    fields: [
      "תגמול נדחה כקצבה לפי תוחלת חיים ממוצעת (17 שנים מגיל 67)",
      "חישוב תשלום חודשי לפרק זמן נתון",
      "ריבית שנתית:",
      "סכום חסכון קיים",
      "תקופת משיכה בשנים:",
      "סכום משיכה:",
    ],
  },
];

const SECTION_28_COMPARISON_ROWS = [
  "קצבה",
  "הוני ( קה\"ש , גמל וביטוחי מנהלים )",
  "קופת גמל להשקעה ( קיטום סעיף 28) לאחר מס רווחי הון",
  "סה\"כ קצבה",
  "סה\"כ הון",
];

const SECTION_28_ALL_FIELD_NAMES = [
  ...SECTION_28_CAPPING_GROUPS.flatMap((group) => group.fields),
  ...SECTION_28_COMPARISON_ROWS,
];

const ISRAEL_INSURANCE_COMPANIES = [
  "כלל",
  "מגדל",
  "הראל",
  "מנורה מבטחים",
  "הפניקס",
  "איילון",
  "הכשרה",
  "ביטוח ישיר",
  "שלמה ביטוח",
  "שומרה",
  "ליברה",
  "ווישור",
];


const CAPITAL_CLASSIFICATION_OWNER_OPTIONS = [
  { value: "spouseA", label: "מבוטח/ת ראשית" },
  { value: "spouseB", label: "בן/בת זוג" },
];


function getFamilyOwnerLabel(owner) {
  return owner === "spouseB" ? "בן/בת זוג" : "מבוטח/ת ראשית";
}

function createSection28CappingUpload(owner = "spouseA") {
  return {
    id: `section-28-capping-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}`,
    owner,
    file: null,
    fileName: "",
    loading: false,
    error: "",
    data: null,
  };
}

const CAPITAL_CLASSIFICATION_NUMERIC_FIELDS = [
  "totalSeverance",
  "totalRewards",
  "totalBalance",
  "capitalSeverance",
  "annuitySeverance",
  "currentEmployerSeveranceTaxable",
  "previousEmployersSeveranceRightsSequence",
  "liquidExemptSeverance",
  "capitalRewards",
  "annuityRewardsUntil2000",
  "annuityRewards",
  "pension",
  "coefficient",
  "redemptionValue",
  "totalCapital",
  "totalPension",
];

function createCapitalClassificationUpload() {
  return {
    id: `capital-classification-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}`,
    owner: "spouseA",
    file: null,
    fileName: "",
    loading: false,
    error: "",
    data: null,
  };
}

function normalizeCapitalClassificationHeader(value) {
  return String(value || "")
    .replace(/[״”"]/g, '"')
    .replace(/[׳’']/g, "'")
    .replace(/\s+/g, " ")
    .replace(/[\u200e\u200f]/g, "")
    .trim();
}

function normalizeCapitalClassificationKey(value) {
  return normalizeCapitalClassificationHeader(value)
    .replace(/[\s_\-:()\/\\.]/g, "")
    .replace(/[₪,%]/g, "")
    .toLowerCase();
}

function parseCapitalClassificationNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const clean = String(value || "")
    .replace(/[₪,%\s]/g, "")
    .replace(/,/g, "")
    .replace(/[−–—]/g, "-")
    .replace(/[^\d.-]/g, "");

  const number = Number(clean);
  return Number.isFinite(number) ? number : 0;
}

function formatCapitalClassificationCell(value, cell) {
  if (value === null || value === undefined) return "";

  if (cell?.w && String(cell.w).trim()) {
    return String(cell.w).replace(/\s+/g, " ").trim();
  }

  if (typeof value === "number") {
    return value;
  }

  return String(value).replace(/\s+/g, " ").trim();
}

function findCapitalClassificationColumnIndex(headers, candidates) {
  const normalizedCandidates = candidates.map(normalizeCapitalClassificationKey);

  return headers.findIndex((header) => {
    const normalizedHeader = normalizeCapitalClassificationKey(header);
    return normalizedCandidates.some(
      (candidate) =>
        normalizedHeader === candidate ||
        normalizedHeader.includes(candidate) ||
        candidate.includes(normalizedHeader)
    );
  });
}

function getCapitalClassificationOwnerLabel(owner) {
  return (
    CAPITAL_CLASSIFICATION_OWNER_OPTIONS.find((option) => option.value === owner)
      ?.label || "בן זוג"
  );
}

function getCapitalClassificationUniqueText(values) {
  return Array.from(
    new Set(
      values
        .map((value) => normalizeCapitalClassificationHeader(value))
        .filter(Boolean)
    )
  );
}

function getCapitalClassificationGroupInfo(row) {
  const productType = normalizeCapitalClassificationHeader(row?.productType);
  const planName = normalizeCapitalClassificationHeader(row?.planName);
  const combined = `${productType} ${planName}`;

  if (combined.includes("קלאסית")) {
    return {
      key: `classic-${row?.policyNumber || row?.planName || row?.managerName || Math.random()}`,
      label: planName || "פוליסה קלאסית",
      shouldKeepSingle: true,
    };
  }

  if (combined.includes("השתלמות")) {
    return { key: "study-funds", label: "קרנות השתלמות", shouldKeepSingle: false };
  }

  if (combined.includes("ותיקה")) {
    return { key: "legacy-pension", label: "קרן פנסיה ותיקה", shouldKeepSingle: false };
  }

  if (combined.includes("פנסיה") || combined.includes("מקיפה") || combined.includes("קרפ")) {
    return { key: "pension-funds", label: "קרנות פנסיה", shouldKeepSingle: false };
  }

  if (combined.includes("גמל")) {
    return { key: "provident-funds", label: "קופות גמל", shouldKeepSingle: false };
  }

  if (combined.includes("מנהלים") || combined.includes("פוליסה") || combined.includes("ביטוח")) {
    return { key: "managers-insurance", label: "ביטוח מנהלים", shouldKeepSingle: false };
  }

  return {
    key: normalizeCapitalClassificationKey(productType || planName || "other"),
    label: productType || planName || "מוצרים נוספים",
    shouldKeepSingle: false,
  };
}

function enrichCapitalClassificationTotals(row) {
  const totalCapital =
    Number(row.capitalRewards || 0) +
    Number(row.capitalSeverance || 0) +
    Number(row.liquidExemptSeverance || 0) +
    Number(row.currentEmployerSeveranceTaxable || 0);

  const totalPension =
    Number(row.annuityRewards || 0) +
    Number(row.annuityRewardsUntil2000 || 0) +
    Number(row.annuitySeverance || 0) +
    Number(row.previousEmployersSeveranceRightsSequence || 0) +
    Number(row.pension || 0);

  return {
    ...row,
    totalCapital,
    totalPension,
  };
}

function groupCapitalClassificationRows(rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const groupedMap = new Map();

  safeRows.forEach((rawRow, index) => {
    const row = enrichCapitalClassificationTotals(rawRow);
    const groupInfo = getCapitalClassificationGroupInfo(row);
    const key = groupInfo.shouldKeepSingle ? `${groupInfo.key}-${index}` : groupInfo.key;

    if (!groupedMap.has(key)) {
      groupedMap.set(key, {
        ...row,
        id: `capital-group-${key}`,
        policyNumber: groupInfo.shouldKeepSingle ? row.policyNumber : "",
        planName: groupInfo.label,
        productType: groupInfo.label,
        sourceRows: [],
        sourcePolicies: [],
        isGrouped: !groupInfo.shouldKeepSingle,
      });
    }

    const target = groupedMap.get(key);
    target.sourceRows.push(row);
    target.sourcePolicies = getCapitalClassificationUniqueText([
      ...target.sourcePolicies,
      row.policyNumber,
    ]);

    target.managerName = getCapitalClassificationUniqueText([
      target.managerName,
      row.managerName,
    ]).join(" + ");

    CAPITAL_CLASSIFICATION_NUMERIC_FIELDS.forEach((field) => {
      if (field === "coefficient") {
        target[field] = Number(target[field] || 0) || Number(row[field] || 0) || 0;
        return;
      }

      target[field] = Number(target[field] || 0) + Number(row[field] || 0);
    });

    const enriched = enrichCapitalClassificationTotals(target);
    Object.assign(target, {
      totalCapital: enriched.totalCapital,
      totalPension: enriched.totalPension,
    });
  });

  return Array.from(groupedMap.values()).map((row, index) => ({
    ...row,
    id: row.id || `capital-group-row-${index}`,
  }));
}

function buildEmptyReportDataForManualInputs() {
  const today = new Intl.DateTimeFormat("he-IL").format(new Date());

  return {
    lastUpdated: today,
    family: {
      lastUpdated: today,
      totalAssets: 0,
      monthlyDeposits: 0,
      projectedLumpSumWithDeposits: 0,
      projectedLumpSumWithoutDeposits: 0,
      monthlyPensionWithDeposits: 0,
      monthlyPensionWithoutDeposits: 0,
    },
    members: [],
    products: [],
    managers: [],
    mainGroupAllocation: [],
    foreignExposureAllocation: [],
    weightedForeignExposure: 0,
    weightedEquityExposure: 0,
    loans: { hasData: false, details: [] },
  };
}

function formatAmountInput(value) {
  const clean = String(value || "").replace(/[^0-9.]/g, "");
  const parts = clean.split(".");
  if (parts.length <= 1) return clean;
  return `${parts[0]}.${parts.slice(1).join("")}`;
}

function normalizeAmountForReport(value) {
  const number = Number(String(value || "").replace(/,/g, ""));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export default function UploadPage({ setReportData }) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);

  const [clientLogoFile, setClientLogoFile] = useState(null);
  const [clientLogoPreview, setClientLogoPreview] = useState(null);
  const [logoError, setLogoError] = useState("");

  const [section28CappingUploads, setSection28CappingUploads] = useState([
    createSection28CappingUpload("spouseA"),
  ]);

  const [vestedPdfFile, setVestedPdfFile] = useState(null);
  const [vestedPdfTable, setVestedPdfTable] = useState(null);
  const [vestedPdfLoading, setVestedPdfLoading] = useState(false);
  const [vestedPdfError, setVestedPdfError] = useState("");
  const [recognizedPensionOwner, setRecognizedPensionOwner] = useState("spouseA");


  const [capitalClassificationUploads, setCapitalClassificationUploads] =
    useState([createCapitalClassificationUpload()]);

  const [recognizedPensionAdjustments, setRecognizedPensionAdjustments] =
    useState([
      {
        id: "recognized-pension-1",
        companyName: "",
        amount: "",
      },
    ]);

  const [hoveredExcelId, setHoveredExcelId] = useState(null);

  const fileInputRef = useRef(null);
  const logoInputRef = useRef(null);
  const vestedPdfInputRef = useRef(null);
  const dragCounterRef = useRef(0);

  const addFiles = (files) => {
    const xmlFiles = Array.from(files || []).filter((file) =>
      file.name.toLowerCase().endsWith(".xml")
    );

    if (!xmlFiles.length) {
      setError("יש לבחור קבצי XML בלבד");
      return;
    }

    setError("");

    setSelectedFiles((prev) => {
      const existingKeys = new Set(
        prev.map((file) => `${file.name}_${file.size}_${file.lastModified}`)
      );

      const newFiles = xmlFiles.filter((file) => {
        const key = `${file.name}_${file.size}_${file.lastModified}`;
        return !existingKeys.has(key);
      });

      return [...prev, ...newFiles];
    });
  };

  const handleFileSelection = (event) => {
    addFiles(event.target.files);
    event.target.value = "";
  };

  const handleLogoSelection = (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const allowedImageTypes = [
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/svg+xml",
      "image/webp",
    ];

    if (!allowedImageTypes.includes(file.type)) {
      setLogoError("יש לבחור קובץ תמונה מסוג PNG / JPG / SVG / WEBP");
      event.target.value = "";
      return;
    }

    const maxLogoSizeMb = 3;
    const maxLogoSizeBytes = maxLogoSizeMb * 1024 * 1024;

    if (file.size > maxLogoSizeBytes) {
      setLogoError(`גודל הלוגו חייב להיות עד ${maxLogoSizeMb}MB`);
      event.target.value = "";
      return;
    }

    setLogoError("");
    setClientLogoFile(file);

    const reader = new FileReader();

    reader.onload = () => {
      setClientLogoPreview(reader.result);
    };

    reader.onerror = () => {
      setLogoError("לא ניתן היה לקרוא את קובץ הלוגו");
      setClientLogoFile(null);
      setClientLogoPreview(null);
    };

    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const removeClientLogo = () => {
    setClientLogoFile(null);
    setClientLogoPreview(null);
    setLogoError("");
  };

  const openLogoPicker = () => {
    logoInputRef.current?.click();
  };

  const updateRecognizedPensionOwner = (owner) => {
    const safeOwner = owner === "spouseB" ? "spouseB" : "spouseA";
    setRecognizedPensionOwner(safeOwner);
    setVestedPdfTable((prev) =>
      prev
        ? {
            ...prev,
            owner: safeOwner,
            ownerLabel: getFamilyOwnerLabel(safeOwner),
          }
        : prev
    );
  };

  const openVestedPdfPicker = () => {
    vestedPdfInputRef.current?.click();
  };


  const normalizeSection28Label = (value) =>
    String(value || "")
      .replace(/[״"]/g, '"')
      .replace(/[׳']/g, "'")
      .replace(/\s+/g, " ")
      .replace(/\s*:\s*$/g, ":")
      .trim();

  const isEmptySection28Value = (value) =>
    value === null || value === undefined || String(value).trim() === "";

  const formatSection28ExcelValue = (value, cell) => {
    if (isEmptySection28Value(value)) return "";

    if (cell?.w && String(cell.w).trim()) {
      return String(cell.w).replace(/\s+/g, " ").trim();
    }

    if (typeof value === "number") {
      return value;
    }

    return String(value).replace(/\s+/g, " ").trim();
  };

  const findSection28ValueNextToLabel = (worksheet, XLSX, label) => {
    const ref = worksheet["!ref"];
    if (!ref) return "";

    const range = XLSX.utils.decode_range(ref);
    const wanted = normalizeSection28Label(label);

    for (let row = range.s.r; row <= range.e.r; row += 1) {
      for (let col = range.s.c; col <= range.e.c; col += 1) {
        const address = XLSX.utils.encode_cell({ r: row, c: col });
        const cell = worksheet[address];
        const cellText = normalizeSection28Label(cell?.v);

        if (!cellText || cellText !== wanted) continue;

        const preferredCells = [
          { r: row, c: col + 1 },
          { r: row, c: col - 1 },
          { r: row + 1, c: col },
          { r: row, c: col + 2 },
          { r: row, c: col + 3 },
        ];

        for (const position of preferredCells) {
          if (
            position.r < range.s.r ||
            position.r > range.e.r ||
            position.c < range.s.c ||
            position.c > range.e.c
          ) {
            continue;
          }

          const valueAddress = XLSX.utils.encode_cell(position);
          const valueCell = worksheet[valueAddress];
          const value = valueCell?.v;

          if (!isEmptySection28Value(value)) {
            return formatSection28ExcelValue(value, valueCell);
          }
        }
      }
    }

    return "";
  };

  const findSection28ComparisonRows = (worksheet, XLSX) => {
    const ref = worksheet["!ref"];
    if (!ref) return [];

    const range = XLSX.utils.decode_range(ref);
    const comparisonRows = [];

    for (const label of SECTION_28_COMPARISON_ROWS) {
      const wanted = normalizeSection28Label(label);

      for (let row = range.s.r; row <= range.e.r; row += 1) {
        let found = false;

        for (let col = range.s.c; col <= range.e.c; col += 1) {
          const address = XLSX.utils.encode_cell({ r: row, c: col });
          const cell = worksheet[address];
          const cellText = normalizeSection28Label(cell?.v);

          if (cellText !== wanted) continue;

          const getValue = (offset) => {
            const valueAddress = XLSX.utils.encode_cell({ r: row, c: col + offset });
            const valueCell = worksheet[valueAddress];
            return formatSection28ExcelValue(valueCell?.v, valueCell);
          };

          comparisonRows.push({
            label,
            before: getValue(1),
            after: getValue(2),
            gap: getValue(3),
          });

          found = true;
          break;
        }

        if (found) break;
      }
    }

    return comparisonRows.filter(
      (row) => row.before !== "" || row.after !== "" || row.gap !== ""
    );
  };

  const loadXlsx = () =>
    new Promise((resolve, reject) => {
      if (window.XLSX) {
        resolve(window.XLSX);
        return;
      }

      const existingScript = document.querySelector(
        'script[data-xlsx-loader="true"]'
      );

      if (existingScript) {
        existingScript.addEventListener("load", () => resolve(window.XLSX));
        existingScript.addEventListener("error", reject);
        return;
      }

      const script = document.createElement("script");
      script.src = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
      script.async = true;
      script.dataset.xlsxLoader = "true";

      script.onload = () => {
        if (!window.XLSX) {
          reject(new Error("ספריית קריאת Excel לא נטענה"));
          return;
        }

        resolve(window.XLSX);
      };

      script.onerror = () =>
        reject(new Error("לא ניתן היה לטעון את ספריית קריאת ה־Excel"));

      document.body.appendChild(script);
    });

  const extractSection28CappingFromExcel = async (file) => {
    const XLSX = await loadXlsx();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellStyles: true, cellDates: true });

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) {
      return null;
    }

    const fields = SECTION_28_ALL_FIELD_NAMES.reduce((acc, label) => {
      acc[label] = findSection28ValueNextToLabel(worksheet, XLSX, label);
      return acc;
    }, {});

    const groups = SECTION_28_CAPPING_GROUPS.map((group) => ({
      ...group,
      rows: group.fields
        .map((label) => ({ label, value: fields[label] }))
        .filter((row) => row.value !== ""),
    })).filter((group) => group.rows.length > 0);

    const comparisonRows = findSection28ComparisonRows(worksheet, XLSX);

    if (!groups.length && !comparisonRows.length) {
      return null;
    }

    return {
      sourceFileName: file.name,
      sheetName,
      groups,
      comparisonRows,
    };
  };


  const extractCapitalClassificationFromExcel = async (file, owner) => {
    const XLSX = await loadXlsx();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, {
      type: "array",
      cellStyles: true,
      cellDates: true,
    });

    const sheetName =
      workbook.SheetNames.find((name) =>
        normalizeCapitalClassificationHeader(name).includes("RAW")
      ) || workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet?.["!ref"]) {
      return null;
    }

    const range = XLSX.utils.decode_range(worksheet["!ref"]);
    const rows = [];

    for (let row = range.s.r; row <= range.e.r; row += 1) {
      const values = [];
      for (let col = range.s.c; col <= range.e.c; col += 1) {
        const address = XLSX.utils.encode_cell({ r: row, c: col });
        const cell = worksheet[address];
        values.push(formatCapitalClassificationCell(cell?.v, cell));
      }
      rows.push(values);
    }

    const headerCandidates = rows
      .map((row, index) => {
        const text = row.map(normalizeCapitalClassificationHeader).join(" ");
        const score = [
          /מספר/.test(text) && /(פוליסה|קופה)/.test(text),
          /(חברה מנהלת|שם יצרן|יצרן)/.test(text),
          /(סוג מוצר|מוצר)/.test(text),
          /תגמולים/.test(text),
          /פיצויים/.test(text) || /פיצוים/.test(text),
          /סהכ|סה"כ|סה״כ/.test(text),
        ].filter(Boolean).length;
        return { row, index, score };
      })
      .filter((item) => item.score >= 2)
      .sort((a, b) => b.score - a.score || a.index - b.index);

    const headerInfo = headerCandidates[0];
    if (!headerInfo) {
      return null;
    }

    const headers = headerInfo.row.map(normalizeCapitalClassificationHeader);

    const columnMap = {
      policyNumber: findCapitalClassificationColumnIndex(headers, [
        "מספר פוליסה",
        "מספר קופה",
        "מספר תוכנית",
      ]),
      managerName: findCapitalClassificationColumnIndex(headers, [
        "חברה מנהלת",
        "שם יצרן",
        "יצרן",
      ]),
      planName: findCapitalClassificationColumnIndex(headers, [
        "שם תוכנית",
        "שם תכנית",
        "שם מסלול",
      ]),
      productType: findCapitalClassificationColumnIndex(headers, [
        "סוג מוצר",
        "מוצר",
      ]),
      totalSeverance: findCapitalClassificationColumnIndex(headers, [
        "סהכ פיצוים",
        "סהכ פיצויים",
        "סה\"כ פיצויים",
      ]),
      totalRewards: findCapitalClassificationColumnIndex(headers, [
        "סהכ תגמולים",
        "סה\"כ תגמולים",
      ]),
      totalBalance: findCapitalClassificationColumnIndex(headers, [
        "סהכ קופה",
        "סה\"כ קופה",
        "סהכ צבירה",
      ]),
      capitalSeverance: findCapitalClassificationColumnIndex(headers, [
        "פיצוים הונים",
        "פיצויים הוניים",
      ]),
      annuitySeverance: findCapitalClassificationColumnIndex(headers, [
        "פיצוים קצבתיים",
        "פיצויים קצבתיים",
      ]),
      currentEmployerSeveranceTaxable: findCapitalClassificationColumnIndex(headers, [
        "פיצויים למס",
        "פיצוים למס",
        "פיצויים מעסיק נוכחי",
        "פיצוים מעסיק נוכחי",
        "מעסיק נוכחי",
      ]),
      previousEmployersSeveranceRightsSequence: findCapitalClassificationColumnIndex(headers, [
        "פיצויים ממעסיקים קודמים ברצף זכויות",
        "פיצוים ממעסיקים קודמים ברצף זכויות",
        "רצף זכויות",
      ]),
      liquidExemptSeverance: findCapitalClassificationColumnIndex(headers, [
        "פיצויים הוניים פטורים נזילים",
        "פיצוים הונים פטורים נזילים",
        "פטורים נזילים",
      ]),
      capitalRewards: findCapitalClassificationColumnIndex(headers, [
        "תגמולים הוניים",
        "תגמולים הונים",
      ]),
      annuityRewardsUntil2000: findCapitalClassificationColumnIndex(headers, [
        "תגמולים קצבתיים עד 1.1.2000",
        "תגמולים קצבתיים עד שנת 2000",
        "עד 1.1.2000",
        "עד שנת 2000",
      ]),
      annuityRewards: findCapitalClassificationColumnIndex(headers, [
        "תגמולים קצבתיים",
      ]),
      pension: findCapitalClassificationColumnIndex(headers, ["פנסיה", "קצבה"]),
      coefficient: findCapitalClassificationColumnIndex(headers, ["מקדם"]),
      redemptionValue: findCapitalClassificationColumnIndex(headers, [
        "ערך פדיון",
        "פדיון",
      ]),
    };

    const getValue = (row, key) => {
      const index = columnMap[key];
      if (index < 0 || index === undefined) return "";
      return row[index] ?? "";
    };

    const normalizedRows = rows
      .slice(headerInfo.index + 1)
      .map((row, index) => {
        const item = {
          id: `capital-row-${index}`,
          owner,
          ownerLabel: getCapitalClassificationOwnerLabel(owner),
          policyNumber: getValue(row, "policyNumber"),
          managerName: getValue(row, "managerName"),
          planName: getValue(row, "planName"),
          productType: getValue(row, "productType"),
          totalSeverance: parseCapitalClassificationNumber(getValue(row, "totalSeverance")),
          totalRewards: parseCapitalClassificationNumber(getValue(row, "totalRewards")),
          totalBalance: parseCapitalClassificationNumber(getValue(row, "totalBalance")),
          capitalSeverance: parseCapitalClassificationNumber(getValue(row, "capitalSeverance")),
          annuitySeverance: parseCapitalClassificationNumber(getValue(row, "annuitySeverance")),
          currentEmployerSeveranceTaxable: parseCapitalClassificationNumber(
            getValue(row, "currentEmployerSeveranceTaxable")
          ),
          previousEmployersSeveranceRightsSequence: parseCapitalClassificationNumber(
            getValue(row, "previousEmployersSeveranceRightsSequence")
          ),
          liquidExemptSeverance: parseCapitalClassificationNumber(
            getValue(row, "liquidExemptSeverance")
          ),
          capitalRewards: parseCapitalClassificationNumber(getValue(row, "capitalRewards")),
          annuityRewardsUntil2000: parseCapitalClassificationNumber(
            getValue(row, "annuityRewardsUntil2000")
          ),
          annuityRewards: parseCapitalClassificationNumber(getValue(row, "annuityRewards")),
          pension: parseCapitalClassificationNumber(getValue(row, "pension")),
          coefficient: parseCapitalClassificationNumber(getValue(row, "coefficient")),
          redemptionValue: parseCapitalClassificationNumber(getValue(row, "redemptionValue")),
        };

        return item;
      })
      .filter((row) => {
        const hasIdentity =
          String(row.policyNumber || "").trim() ||
          String(row.managerName || "").trim() ||
          String(row.planName || "").trim() ||
          String(row.productType || "").trim();

        const hasAmount = CAPITAL_CLASSIFICATION_NUMERIC_FIELDS.some(
          (field) => Number(row[field] || 0) > 0
        );

        return hasIdentity || hasAmount;
      });

    if (!normalizedRows.length) {
      return null;
    }

    const enrichedRows = normalizedRows.map(enrichCapitalClassificationTotals);

    const groupedRows = groupCapitalClassificationRows(enrichedRows);

    const pensionPolicies = groupedRows.filter(
      (row) => !normalizeCapitalClassificationHeader(row.productType).includes("השתלמות")
    );

    const studyFunds = groupedRows.filter((row) =>
      normalizeCapitalClassificationHeader(row.productType).includes("השתלמות")
    );

    const sumField = (items, field) =>
      items.reduce((sum, row) => sum + Number(row[field] || 0), 0);

    return {
      owner,
      ownerLabel: getCapitalClassificationOwnerLabel(owner),
      sourceFileName: file.name,
      sheetName,
      headers,
      columnMap,
      allRows: groupedRows,
      rawRows: enrichedRows,
      pensionPolicies,
      studyFunds,
      totals: {
        totalBalance: sumField(groupedRows, "totalBalance"),
        totalRewards: sumField(groupedRows, "totalRewards"),
        totalSeverance: sumField(groupedRows, "totalSeverance"),
        totalCapital: sumField(groupedRows, "totalCapital"),
        totalPension: sumField(groupedRows, "totalPension"),
        pensionPoliciesBalance: sumField(pensionPolicies, "totalBalance"),
        studyFundsBalance: sumField(studyFunds, "redemptionValue") || sumField(studyFunds, "totalBalance"),
      },
    };
  };

  const updateCapitalClassificationOwner = (id, owner) => {
    setCapitalClassificationUploads((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              owner,
              data: item.data
                ? {
                    ...item.data,
                    owner,
                    ownerLabel: getCapitalClassificationOwnerLabel(owner),
                    allRows: (item.data.allRows || []).map((row) => ({
                      ...row,
                      owner,
                      ownerLabel: getCapitalClassificationOwnerLabel(owner),
                    })),
                    pensionPolicies: (item.data.pensionPolicies || []).map((row) => ({
                      ...row,
                      owner,
                      ownerLabel: getCapitalClassificationOwnerLabel(owner),
                    })),
                    studyFunds: (item.data.studyFunds || []).map((row) => ({
                      ...row,
                      owner,
                      ownerLabel: getCapitalClassificationOwnerLabel(owner),
                    })),
                  }
                : item.data,
            }
          : item
      )
    );
  };

  const handleCapitalClassificationExcelSelection = async (id, event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const isExcel =
      fileName.endsWith(".xlsx") ||
      fileName.endsWith(".xls") ||
      file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.type === "application/vnd.ms-excel";

    if (!isExcel) {
      setCapitalClassificationUploads((prev) =>
        prev.map((item) =>
          item.id === id
            ? { ...item, error: "יש לבחור קובץ Excel מסוג XLSX / XLS בלבד" }
            : item
        )
      );
      event.target.value = "";
      return;
    }

    const currentOwner =
      capitalClassificationUploads.find((item) => item.id === id)?.owner || "spouseA";

    setCapitalClassificationUploads((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              file,
              fileName: file.name,
              loading: true,
              error: "",
              data: null,
            }
          : item
      )
    );

    try {
      const parsed = await extractCapitalClassificationFromExcel(file, currentOwner);

      if (!parsed) {
        setCapitalClassificationUploads((prev) =>
          prev.map((item) =>
            item.id === id
              ? {
                  ...item,
                  loading: false,
                  error: "לא נמצאו נתוני סיווג כספים בקובץ האקסל.",
                  data: null,
                }
              : item
          )
        );
      } else {
        setCapitalClassificationUploads((prev) =>
          prev.map((item) =>
            item.id === id
              ? {
                  ...item,
                  loading: false,
                  error: "",
                  data: parsed,
                }
              : item
          )
        );
      }
    } catch (err) {
      console.error(err);
      setCapitalClassificationUploads((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                loading: false,
                error: `שגיאה בקריאת קובץ סיווג הכספים: ${err?.message || err}`,
                data: null,
              }
            : item
        )
      );
    } finally {
      event.target.value = "";
    }
  };

  const addCapitalClassificationUpload = () => {
    setCapitalClassificationUploads((prev) => [
      ...prev,
      {
        ...createCapitalClassificationUpload(),
        owner: prev.some((item) => item.owner === "spouseA") ? "spouseB" : "spouseA",
      },
    ]);
  };

  const removeCapitalClassificationUpload = (id) => {
    setCapitalClassificationUploads((prev) =>
      prev.length <= 1 ? prev : prev.filter((item) => item.id !== id)
    );
  };

  const clearCapitalClassificationUpload = (id) => {
    setCapitalClassificationUploads((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              file: null,
              fileName: "",
              loading: false,
              error: "",
              data: null,
            }
          : item
      )
    );
  };

  const getCleanCapitalClassificationData = () => {
    const entries = capitalClassificationUploads
      .filter((item) => item.data?.allRows?.length)
      .map((item) => ({
        ...item.data,
        owner: item.owner,
        ownerLabel: getCapitalClassificationOwnerLabel(item.owner),
      }));

    const byOwner = {
      spouseA: {
        pensionPolicies: [],
        studyFunds: [],
      },
      spouseB: {
        pensionPolicies: [],
        studyFunds: [],
      },
    };

    entries.forEach((entry) => {
      const owner = entry.owner === "spouseB" ? "spouseB" : "spouseA";
      byOwner[owner].pensionPolicies.push(...(entry.pensionPolicies || []));
      byOwner[owner].studyFunds.push(...(entry.studyFunds || []));
    });

    return {
      entries,
      spouseA_pension_funds: byOwner.spouseA.pensionPolicies,
      spouseA_study_funds: byOwner.spouseA.studyFunds,
      spouseB_pension_funds: byOwner.spouseB.pensionPolicies,
      spouseB_study_funds: byOwner.spouseB.studyFunds,
    };
  };

  const updateSection28CappingOwner = (id, owner) => {
    setSection28CappingUploads((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              owner,
              data: item.data
                ? {
                    ...item.data,
                    owner,
                    ownerLabel: getFamilyOwnerLabel(owner),
                  }
                : item.data,
            }
          : item
      )
    );
  };

  const handleSection28ExcelSelection = async (id, event) => {
    const file = event.target.files?.[0];

    if (!file) return;

    const fileName = file.name.toLowerCase();
    const isExcel =
      fileName.endsWith(".xlsx") ||
      fileName.endsWith(".xls") ||
      file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.type === "application/vnd.ms-excel";

    if (!isExcel) {
      setSection28CappingUploads((prev) =>
        prev.map((item) =>
          item.id === id
            ? { ...item, error: "יש לבחור קובץ Excel מסוג XLSX / XLS בלבד" }
            : item
        )
      );
      event.target.value = "";
      return;
    }

    const currentOwner =
      section28CappingUploads.find((item) => item.id === id)?.owner || "spouseA";

    setSection28CappingUploads((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              file,
              fileName: file.name,
              loading: true,
              error: "",
              data: null,
            }
          : item
      )
    );

    try {
      const parsed = await extractSection28CappingFromExcel(file);

      if (!parsed) {
        setSection28CappingUploads((prev) =>
          prev.map((item) =>
            item.id === id
              ? {
                  ...item,
                  loading: false,
                  error:
                    "לא נמצאו שדות קיטום לפי סעיף 28 באקסל. ניתן להפיק דוח ללא החלק הזה.",
                  data: null,
                }
              : item
          )
        );
      } else {
        setSection28CappingUploads((prev) =>
          prev.map((item) =>
            item.id === id
              ? {
                  ...item,
                  loading: false,
                  error: "",
                  data: {
                    ...parsed,
                    owner: currentOwner,
                    ownerLabel: getFamilyOwnerLabel(currentOwner),
                  },
                }
              : item
          )
        );
      }
    } catch (err) {
      console.error(err);
      setSection28CappingUploads((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                loading: false,
                error: `שגיאה בקריאת קובץ ה־Excel: ${err?.message || err}`,
                data: null,
              }
            : item
        )
      );
    } finally {
      event.target.value = "";
    }
  };

  const addSection28CappingUpload = () => {
    setSection28CappingUploads((prev) => [
      ...prev,
      createSection28CappingUpload(
        prev.some((item) => item.owner === "spouseA") ? "spouseB" : "spouseA"
      ),
    ]);
  };

  const removeSection28CappingUpload = (id) => {
    setSection28CappingUploads((prev) =>
      prev.length <= 1 ? prev : prev.filter((item) => item.id !== id)
    );
  };

  const clearSection28CappingUpload = (id) => {
    setSection28CappingUploads((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              file: null,
              fileName: "",
              loading: false,
              error: "",
              data: null,
            }
          : item
      )
    );
  };

  const getCleanSection28CappingData = () =>
    section28CappingUploads
      .filter((item) => item.data?.groups?.length || item.data?.comparisonRows?.length)
      .map((item) => ({
        ...item.data,
        owner: item.owner,
        ownerLabel: getFamilyOwnerLabel(item.owner),
      }));

  const loadPdfJs = () =>
    new Promise((resolve, reject) => {
      if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          window.pdfjsLib.GlobalWorkerOptions.workerSrc ||
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        resolve(window.pdfjsLib);
        return;
      }

      const existingScript = document.querySelector(
        'script[data-pdfjs-loader="true"]'
      );

      if (existingScript) {
        existingScript.addEventListener("load", () => resolve(window.pdfjsLib));
        existingScript.addEventListener("error", reject);
        return;
      }

      const script = document.createElement("script");
      script.src =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      script.async = true;
      script.dataset.pdfjsLoader = "true";

      script.onload = () => {
        if (!window.pdfjsLib) {
          reject(new Error("ספריית PDF לא נטענה"));
          return;
        }

        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

        resolve(window.pdfjsLib);
      };

      script.onerror = () =>
        reject(new Error("לא ניתן היה לטעון את ספריית קריאת ה־PDF"));

      document.body.appendChild(script);
    });

  const normalizeTableText = (value) =>
    String(value || "")
      .replace(/\s+/g, " ")
      .replace(/[₪]/g, "")
      .trim();

  const parseNumberText = (value) => {
    const clean = normalizeTableText(value).replace(/,/g, "");
    if (!clean || clean === "-") return "";
    const number = Number(clean);
    return Number.isFinite(number) ? number : "";
  };

  const formatPdfNumber = (value, decimals = 0) => {
    const number = parseNumberText(value);
    if (number === "") return "";
    return number.toLocaleString("he-IL", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const groupPdfItemsToRows = (items) => {
    const sorted = [...items].sort((a, b) => {
      if (a.page !== b.page) return a.page - b.page;
      if (Math.abs(b.y - a.y) > 3) return b.y - a.y;
      return a.x - b.x;
    });

    const rows = [];

    sorted.forEach((item) => {
      if (!normalizeTableText(item.text)) return;

      const lastRow = rows[rows.length - 1];

      if (
        lastRow &&
        lastRow.page === item.page &&
        Math.abs(lastRow.y - item.y) <= 3
      ) {
        lastRow.items.push(item);
        lastRow.y = (lastRow.y + item.y) / 2;
      } else {
        rows.push({
          page: item.page,
          y: item.y,
          items: [item],
        });
      }
    });

    return rows.map((row) => ({
      ...row,
      items: row.items.sort((a, b) => a.x - b.x),
      text: row.items
        .sort((a, b) => a.x - b.x)
        .map((item) => item.text)
        .join(" "),
    }));
  };

  const detectPdfColumnCenters = (rows) => {
    const allItems = rows.flatMap((row) => row.items || []);

    if (!allItems.length) {
      return [];
    }

    const minX = Math.min(...allItems.map((item) => item.x));
    const maxX = Math.max(...allItems.map((item) => item.x));

    const columnKeys = [
      "pension",
      "coefficient",
      "exemptPayments",
      "severanceFrom2017",
      "rewardsFrom2012",
      "rewardsUntil2011",
      "depositFee",
      "balanceFee",
      "fundName",
    ];

    const fallback = {};

    columnKeys.forEach((key, index) => {
      fallback[key] = minX + ((maxX - minX) / (columnKeys.length - 1)) * index;
    });

    const scoreHeaderRow = (row) => {
      const text = normalizeTableText(row.text);

      return [
        /שם/.test(text) && /קופה/.test(text),
        /צבירה/.test(text),
        /הפקדות/.test(text),
        /תגמולים/.test(text),
        /2011/.test(text),
        /2012/.test(text),
        /פיצויים/.test(text),
        /2017/.test(text),
        /פטורים/.test(text),
        /מקדם/.test(text),
        /קצבה/.test(text),
        /ניהול/.test(text),
      ].filter(Boolean).length;
    };

    const headerCandidates = rows
      .map((row) => ({ row, score: scoreHeaderRow(row) }))
      .filter((item) => item.score >= 3)
      .sort((a, b) => b.score - a.score);

    const bestHeaderRow = headerCandidates[0]?.row;

    if (!bestHeaderRow) {
      return columnKeys.map((key) => ({
        key,
        x: fallback[key],
      }));
    }

    // PDF.js can split one visual header into several nearby text rows.
    // Use only the local header cluster, not every line in the PDF, so words
    // such as "קצבה" or "מקדם" from other parts of the document cannot shift
    // the table one column to the left.
    const headerItems = rows
      .filter(
        (row) =>
          row.page === bestHeaderRow.page && Math.abs(row.y - bestHeaderRow.y) <= 28
      )
      .flatMap((row) => row.items || []);

    const findHeaderX = (matcher) => {
      const matches = headerItems.filter((item) =>
        matcher(normalizeTableText(item.text))
      );

      if (!matches.length) return undefined;

      // If the same header phrase is split into duplicated fragments, use the
      // average x value so assignment remains stable.
      const sum = matches.reduce((total, item) => total + Number(item.x || 0), 0);
      return sum / matches.length;
    };

    const detected = {
      pension: findHeaderX((text) => text.includes("קצבה")),
      coefficient: findHeaderX((text) => text.includes("מקדם")),
      exemptPayments: findHeaderX((text) => text.includes("פטורים")),
      severanceFrom2017: findHeaderX(
        (text) => text.includes("פיצויים") || text.includes("2017")
      ),
      rewardsFrom2012: findHeaderX(
        (text) => text.includes("2012") || text.includes("מ־2012") || text.includes("מ2012")
      ),
      rewardsUntil2011: findHeaderX(
        (text) => text.includes("2011") || text.includes("עד 2011")
      ),
      depositFee: findHeaderX((text) => text.includes("הפקדות")),
      balanceFee: findHeaderX((text) => text.includes("צבירה")),
      fundName: findHeaderX((text) => text.includes("שם") || text.includes("קופה")),
    };

    return columnKeys.map((key) => ({
      key,
      x: Number.isFinite(detected[key]) ? detected[key] : fallback[key],
    }));
  };

  const assignItemsToPdfColumns = (rowItems, columns) => {
    const result = columns.reduce((acc, column) => {
      acc[column.key] = [];
      return acc;
    }, {});

    rowItems.forEach((item) => {
      const nearestColumn = columns.reduce((nearest, column) => {
        const distance = Math.abs(item.x - column.x);
        if (!nearest || distance < nearest.distance) {
          return { column, distance };
        }
        return nearest;
      }, null);

      if (nearestColumn?.column) {
        result[nearestColumn.column.key].push(item.text);
      }
    });

    return Object.fromEntries(
      Object.entries(result).map(([key, values]) => [
        key,
        normalizeTableText(values.join(" ")),
      ])
    );
  };

  const buildVestedBalanceTableFromPdfRows = (rows, fileName) => {
    const dataRows = rows.filter((row) => {
      const text = normalizeTableText(row.text);
      const numericCount = (text.match(/\d[\d,.]*/g) || []).length;
      const hasRelevantText = /סה|חסר|מקדם|קופה|גמל|פנסיה|ביטוח|השתלמות/.test(
        text
      );

      return numericCount >= 3 && hasRelevantText && !/שם\s*הקופה/.test(text);
    });

    if (!dataRows.length) {
      return null;
    }

    const columns = detectPdfColumnCenters(rows);

    const parsedRows = dataRows
      .map((row, index) => {
        const byColumn = assignItemsToPdfColumns(row.items, columns);
        const rowText = normalizeTableText(row.text);
        const numbers = rowText.match(/\d[\d,.]*/g) || [];

        const fallbackNumbers = [...numbers].reverse();

        const fundName =
          byColumn.fundName ||
          (rowText.includes('סה"כ') || rowText.includes("סה״כ")
            ? 'סה"כ'
            : "");

        const pension =
          byColumn.pension && /חסר|מקדם/.test(byColumn.pension)
            ? byColumn.pension
            : byColumn.pension || (rowText.includes("חסר") ? "חסר מקדם" : "");

        return {
          id: `vested-row-${index}`,
          fundName,
          balanceFee:
            formatPdfNumber(byColumn.balanceFee, 2) ||
            formatPdfNumber(fallbackNumbers[0], 2),
          depositFee:
            formatPdfNumber(byColumn.depositFee, 2) ||
            formatPdfNumber(fallbackNumbers[1], 2),
          rewardsUntil2011:
            formatPdfNumber(byColumn.rewardsUntil2011) ||
            formatPdfNumber(fallbackNumbers[2]),
          rewardsFrom2012:
            formatPdfNumber(byColumn.rewardsFrom2012) ||
            formatPdfNumber(fallbackNumbers[3]),
          severanceFrom2017:
            formatPdfNumber(byColumn.severanceFrom2017) ||
            formatPdfNumber(fallbackNumbers[4]),
          exemptPayments:
            formatPdfNumber(byColumn.exemptPayments) ||
            formatPdfNumber(fallbackNumbers[5]),
          coefficient:
            formatPdfNumber(byColumn.coefficient, 2) ||
            formatPdfNumber(fallbackNumbers[6], 2),
          pension,
        };
      })
      .filter((row) =>
        Object.values(row).some((value) =>
          String(value || "").replace("vested-row-", "").trim()
        )
      );

    if (!parsedRows.length) {
      return null;
    }

    return {
      sourceFileName: fileName,
      rows: parsedRows,
    };
  };

  const extractVestedBalanceTableFromPdf = async (file) => {
    const pdfjsLib = await loadPdfJs();
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) })
      .promise;

    const items = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();

      textContent.items.forEach((item) => {
        const transform = item.transform || [];
        const x = Number(transform[4] || 0);
        const y = Number(transform[5] || 0);

        items.push({
          page: pageNumber,
          text: item.str,
          x,
          y,
        });
      });
    }

    const rows = groupPdfItemsToRows(items);
    return buildVestedBalanceTableFromPdfRows(rows, file.name);
  };

  const handleVestedPdfSelection = async (event) => {
    const file = event.target.files?.[0];

    if (!file) return;

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setVestedPdfError("יש לבחור קובץ PDF בלבד");
      event.target.value = "";
      return;
    }

    setVestedPdfLoading(true);
    setVestedPdfError("");
    setVestedPdfFile(file);
    setVestedPdfTable(null);

    try {
      const table = await extractVestedBalanceTableFromPdf(file);

      if (!table?.rows?.length) {
        setVestedPdfError(
          "לא נמצאה טבלת צבירה מוכרת בקובץ. ניתן להפיק דוח ללא הטבלה."
        );
        setVestedPdfTable(null);
      } else {
        setVestedPdfTable({
          ...table,
          owner: recognizedPensionOwner,
          ownerLabel: getFamilyOwnerLabel(recognizedPensionOwner),
        });
      }
    } catch (err) {
      console.error(err);
      setVestedPdfError(
        `שגיאה בקריאת קובץ ה־PDF: ${err?.message || err}`
      );
      setVestedPdfTable(null);
    } finally {
      setVestedPdfLoading(false);
      event.target.value = "";
    }
  };

  const removeVestedPdf = () => {
    setVestedPdfFile(null);
    setVestedPdfTable(null);
    setVestedPdfError("");
  };

  const updateRecognizedPensionAdjustment = (id, field, value) => {
    setRecognizedPensionAdjustments((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              [field]: field === "amount" ? formatAmountInput(value) : value,
            }
          : item
      )
    );
  };

  const addRecognizedPensionAdjustment = () => {
    setRecognizedPensionAdjustments((prev) => [
      ...prev,
      {
        id: `recognized-pension-${Date.now()}`,
        companyName: "",
        amount: "",
      },
    ]);
  };

  const removeRecognizedPensionAdjustment = (id) => {
    setRecognizedPensionAdjustments((prev) =>
      prev.length <= 1 ? prev : prev.filter((item) => item.id !== id)
    );
  };

  const getCleanRecognizedPensionAdjustments = () =>
    recognizedPensionAdjustments
      .map((item) => ({
        owner: recognizedPensionOwner,
        ownerLabel: getFamilyOwnerLabel(recognizedPensionOwner),
        companyName: item.companyName,
        amount: normalizeAmountForReport(item.amount),
      }))
      .filter((item) => item.companyName && item.amount > 0);

  const handleDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();

    dragCounterRef.current = 0;
    setIsDragging(false);

    addFiles(event.dataTransfer.files);
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";

    if (!isDragging) {
      setIsDragging(true);
    }
  };

  const handleDragEnter = (event) => {
    event.preventDefault();
    event.stopPropagation();

    dragCounterRef.current += 1;
    if (!isDragging) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (event) => {
    event.preventDefault();
    event.stopPropagation();

    dragCounterRef.current -= 1;

    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragging(false);
    }
  };

  const handleDragEnd = (event) => {
    event.preventDefault();
    event.stopPropagation();

    dragCounterRef.current = 0;
    setIsDragging(false);
  };

  const removeFile = (fileToRemove) => {
    setSelectedFiles((prev) =>
      prev.filter(
        (file) =>
          !(
            file.name === fileToRemove.name &&
            file.size === fileToRemove.size &&
            file.lastModified === fileToRemove.lastModified
          )
      )
    );
  };

  const clearAllFiles = () => {
    setSelectedFiles([]);
    setError("");
    dragCounterRef.current = 0;
    setIsDragging(false);
  };

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const handleAnalyzeFiles = async () => {
    try {
      setError("");

      const capitalClassificationData = getCleanCapitalClassificationData();
      const hasCapitalClassificationData =
        capitalClassificationData.entries.length > 0;

      if (!selectedFiles.length && !hasCapitalClassificationData) {
        setError("יש לבחור לפחות קובץ XML אחד או להעלות אקסל סיווג כספים");
        return;
      }

      setLoading(true);

      const parsedFiles = selectedFiles.length
        ? await parseMultiplePensionXmlFiles(selectedFiles)
        : [];
      const reportData = selectedFiles.length
        ? buildLegacyReportData(parsedFiles)
        : buildEmptyReportDataForManualInputs();

      reportData.clientLogo = clientLogoPreview || null;
      reportData.clientLogoFileName = clientLogoFile?.name || "";
      const section28CappingData = getCleanSection28CappingData();
      reportData.section28Capping = section28CappingData.length
        ? section28CappingData
        : null;
      reportData.spouseA_section28Capping = section28CappingData.filter(
        (item) => item.owner === "spouseA"
      );
      reportData.spouseB_section28Capping = section28CappingData.filter(
        (item) => item.owner === "spouseB"
      );
      const recognizedPensionAdjustmentsData =
        getCleanRecognizedPensionAdjustments();
      const vestedBalanceTableData = vestedPdfTable?.rows?.length
        ? {
            ...vestedPdfTable,
            owner: recognizedPensionOwner,
            ownerLabel: getFamilyOwnerLabel(recognizedPensionOwner),
          }
        : null;

      reportData.vestedBalanceTable = vestedBalanceTableData;
      reportData.recognizedPensionAdjustments =
        recognizedPensionAdjustmentsData;
      reportData.recognizedPensionOwner = recognizedPensionOwner;
      reportData.recognizedPensionOwnerLabel =
        getFamilyOwnerLabel(recognizedPensionOwner);
      reportData.spouseA_vestedBalanceTable =
        vestedBalanceTableData?.owner === "spouseA" ? vestedBalanceTableData : null;
      reportData.spouseB_vestedBalanceTable =
        vestedBalanceTableData?.owner === "spouseB" ? vestedBalanceTableData : null;
      reportData.spouseA_recognizedPensionAdjustments =
        recognizedPensionAdjustmentsData.filter((item) => item.owner === "spouseA");
      reportData.spouseB_recognizedPensionAdjustments =
        recognizedPensionAdjustmentsData.filter((item) => item.owner === "spouseB");
      reportData.capitalClassification = capitalClassificationData;
      reportData.spouseA_pension_funds =
        capitalClassificationData.spouseA_pension_funds;
      reportData.spouseA_study_funds = capitalClassificationData.spouseA_study_funds;
      reportData.spouseB_pension_funds =
        capitalClassificationData.spouseB_pension_funds;
      reportData.spouseB_study_funds = capitalClassificationData.spouseB_study_funds;

      setReportData(reportData);
    } catch (err) {
      console.error(err);
      setError(`שגיאה בקריאת הקבצים: ${err?.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        direction: "rtl",
        background: "#f7f8fc",
        padding: "40px 20px",
        fontFamily: "Calibri, sans-serif",
        fontSize: 12,
      }}
    >
      <div
        style={{
          maxWidth: 980,
          margin: "0 auto",
          background: "#ffffff",
          borderRadius: 28,
          padding: 32,
          boxShadow: "0 12px 36px rgba(0,0,0,0.08)",
          border: "1px solid #e7ebf3",
        }}
      >
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <h1
              style={{
                margin: 0,
                color: "#0d2c6c",
                fontSize: 32,
                fontWeight: 900,
              }}
            >
              העלאת קבצי XML
            </h1>
            <div style={{ lineHeight: 1.2, textAlign: "left", direction: "ltr", flexShrink: 0 }}>
              <div style={{ color: "#00215D", fontSize: 20, fontWeight: 900, letterSpacing: "-0.5px" }}>zviran</div>
              <div style={{ color: "#627D98", fontSize: 10, fontWeight: 700 }}>Total Rewards Experts</div>
            </div>
          </div>

          <p
            style={{
              marginTop: 12,
              marginBottom: 0,
              color: "#5f6b85",
              fontSize: 12,
              lineHeight: 1.8,
            }}
          >
            אפשר להעלות קבצים אחד-אחד, לבחור כמה יחד, או פשוט לגרור לכאן. המערכת
            תשמור את כל הקבצים שנבחרו עד שתלחץ על “הפק דוח”.
          </p>
        </div>

        <div
          style={{
            background: "#f9fbff",
            border: "1px solid #e4e9f5",
            borderRadius: 24,
            padding: "22px 24px",
            marginBottom: 20,
          }}
        >
          <input
            ref={logoInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
            onChange={handleLogoSelection}
            style={{ display: "none" }}
          />

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 18,
              alignItems: "center",
            }}
          >
            <div>
              <div
                style={{
                  color: "#0d2c6c",
                  fontSize: 18,
                  fontWeight: 900,
                  marginBottom: 8,
                }}
              >
                לוגו חברה לדוח (אופציונלי)
              </div>

              <div
                style={{
                  color: "#69758e",
                  fontSize: 12,
                  lineHeight: 1.7,
                }}
              >
                ניתן להעלות לוגו PNG / JPG / SVG / WEBP. הלוגו יוצג בהמשך
                בראש הדוח, לצד לוגו Zviran.
              </div>

              {clientLogoFile && (
                <div
                  style={{
                    color: "#0d2c6c",
                    fontSize: 12,
                    fontWeight: 700,
                    marginTop: 8,
                    wordBreak: "break-word",
                  }}
                >
                  נבחר לוגו: {clientLogoFile.name}
                </div>
              )}

              {logoError && (
                <div
                  style={{
                    color: "#b42318",
                    fontSize: 12,
                    fontWeight: 700,
                    marginTop: 8,
                  }}
                >
                  {logoError}
                </div>
              )}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                flexWrap: "wrap",
                justifyContent: "flex-end",
              }}
            >
              <div
                style={{
                  width: 132,
                  height: 76,
                  borderRadius: 18,
                  border: "1px solid #d7deed",
                  background: clientLogoPreview ? "#ffffff" : "#eef2fa",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  color: "#7b879d",
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                {clientLogoPreview ? (
                  <img
                    src={clientLogoPreview}
                    alt="תצוגת לוגו"
                    style={{
                      maxWidth: "100%",
                      maxHeight: "100%",
                      objectFit: "contain",
                      padding: 8,
                    }}
                  />
                ) : (
                  "לוגו"
                )}
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <button
                  type="button"
                  onClick={openLogoPicker}
                  style={{
                    background: "#ffffff",
                    color: "#0d2c6c",
                    border: "1px solid #cbd4e6",
                    borderRadius: 12,
                    padding: "10px 14px",
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: "pointer",
                    minWidth: 120,
                  }}
                >
                  בחירת לוגו
                </button>

                {clientLogoPreview && (
                  <button
                    type="button"
                    onClick={removeClientLogo}
                    style={{
                      background: "#fff5f5",
                      color: "#c81e1e",
                      border: "1px solid #f3c2c2",
                      borderRadius: 12,
                      padding: "10px 14px",
                      fontSize: 14,
                      fontWeight: 800,
                      cursor: "pointer",
                      minWidth: 120,
                    }}
                  >
                    הסר לוגו
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            background: "#f9fbff",
            border: "1px solid #e4e9f5",
            borderRadius: 24,
            padding: "22px 24px",
            marginBottom: 20,
          }}
        >
          <div
            style={{
              color: "#0d2c6c",
              fontSize: 18,
              fontWeight: 900,
              marginBottom: 8,
            }}
          >
            דוח קיטום לפי סעיף 28 לפי בן/בת זוג (אופציונלי)
          </div>

          <div
            style={{
              color: "#69758e",
              fontSize: 12,
              lineHeight: 1.7,
              marginBottom: 16,
            }}
          >
            ניתן להעלות EXCEL קיטום ולשייך אותו ידנית לבן זוג או בת זוג. כל קובץ
            יישמר בדוח עם שיוך נפרד, כדי שסעיף 28 לא יוצג כנתון משפחתי כללי.
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {section28CappingUploads.map((item, index) => {
              const hasParsedData = Boolean(
                item.data?.groups?.length || item.data?.comparisonRows?.length
              );

              return (
                <div
                  key={item.id}
                  style={{
                    border: "1px solid #dce4f2",
                    background: "#ffffff",
                    borderRadius: 20,
                    padding: 16,
                  }}
                >
                  <input
                    type="file"
                    accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    onChange={(event) =>
                      handleSection28ExcelSelection(item.id, event)
                    }
                    style={{ display: "none" }}
                    id={`${item.id}-input`}
                  />

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(160px, 220px) 1fr auto",
                      gap: 12,
                      alignItems: "center",
                    }}
                  >
                    <select
                      value={item.owner}
                      onChange={(event) =>
                        updateSection28CappingOwner(item.id, event.target.value)
                      }
                      style={{
                        height: 42,
                        border: "1px solid #cbd4e6",
                        borderRadius: 12,
                        padding: "0 12px",
                        color: "#0d2c6c",
                        fontWeight: 800,
                        background: "#fff",
                        fontFamily: "Calibri, sans-serif",
                      }}
                    >
                      {CAPITAL_CLASSIFICATION_OWNER_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>

                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          color: "#0d2c6c",
                          fontSize: 13,
                          fontWeight: 900,
                          wordBreak: "break-word",
                        }}
                      >
                        {item.fileName || `קובץ סעיף 28 ${index + 1}`}
                      </div>

                      {item.loading ? (
                        <div style={{ color: "#69758e", fontSize: 12, marginTop: 4 }}>
                          קורא Excel...
                        </div>
                      ) : hasParsedData ? (
                        <div
                          style={{
                            color: "#247a3d",
                            fontSize: 12,
                            fontWeight: 800,
                            marginTop: 4,
                          }}
                        >
                          נקלטו נתוני קיטום עבור {getFamilyOwnerLabel(item.owner)}
                        </div>
                      ) : (
                        <div style={{ color: "#69758e", fontSize: 12, marginTop: 4 }}>
                          טרם נבחר קובץ
                        </div>
                      )}

                      {item.error && (
                        <div
                          style={{
                            color: "#b42318",
                            fontSize: 12,
                            fontWeight: 700,
                            marginTop: 4,
                          }}
                        >
                          {item.error}
                        </div>
                      )}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                        justifyContent: "flex-end",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          document.getElementById(`${item.id}-input`)?.click()
                        }
                        disabled={item.loading}
                        style={{
                          background: "#ffffff",
                          color: "#0d2c6c",
                          border: "1px solid #cbd4e6",
                          borderRadius: 12,
                          padding: "10px 14px",
                          fontSize: 12,
                          fontWeight: 800,
                          cursor: item.loading ? "not-allowed" : "pointer",
                          minWidth: 110,
                          fontFamily: "Calibri, sans-serif",
                        }}
                      >
                        בחירת Excel
                      </button>

                      {item.fileName && (
                        <button
                          type="button"
                          onClick={() => clearSection28CappingUpload(item.id)}
                          disabled={item.loading}
                          style={{
                            background: "#fff5f5",
                            color: "#c81e1e",
                            border: "1px solid #f3c2c2",
                            borderRadius: 12,
                            padding: "10px 14px",
                            fontSize: 12,
                            fontWeight: 800,
                            cursor: item.loading ? "not-allowed" : "pointer",
                            fontFamily: "Calibri, sans-serif",
                          }}
                        >
                          נקה קובץ
                        </button>
                      )}

                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={addSection28CappingUpload}
            style={{
              marginTop: 14,
              background: "#ffffff",
              color: "#0d2c6c",
              border: "1px solid #cbd4e6",
              borderRadius: 12,
              padding: "10px 14px",
              fontSize: 12,
              fontWeight: 800,
              cursor: "pointer",
              fontFamily: "Calibri, sans-serif",
            }}
          >
            הוסף קובץ סעיף 28 נוסף
          </button>
        </div>

        <div
          style={{
            background: "#f9fbff",
            border: "1px solid #e4e9f5",
            borderRadius: 24,
            padding: "22px 24px",
            marginBottom: 20,
          }}
        >
          <input
            ref={vestedPdfInputRef}
            type="file"
            accept="application/pdf,.pdf"
            onChange={handleVestedPdfSelection}
            style={{ display: "none" }}
          />

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 18,
              alignItems: "center",
            }}
          >
            <div>
              <div
                style={{
                  color: "#0d2c6c",
                  fontSize: 18,
                  fontWeight: 900,
                  marginBottom: 8,
                }}
              >
                טבלת צבירה מוכרת לפי תגמולים ופיצויים (אופציונלי)
              </div>

              <div
                style={{
                  color: "#69758e",
                  fontSize: 12,
                  lineHeight: 1.7,
                }}
              >
                ניתן להעלות PDF שמכיל את טבלת הצבירה המוכרת. אם לא הועלה PDF או
                שלא נמצאה טבלה, הדוח יוצג ללא הטבלה.
              </div>

              <div
                style={{
                  marginTop: 14,
                  display: "grid",
                  gridTemplateColumns: "minmax(180px, 240px) minmax(0, 1fr)",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <select
                  value={recognizedPensionOwner}
                  onChange={(event) =>
                    updateRecognizedPensionOwner(event.target.value)
                  }
                  style={{
                    height: 42,
                    border: "1px solid #cbd4e6",
                    borderRadius: 12,
                    padding: "0 12px",
                    color: "#0d2c6c",
                    fontWeight: 800,
                    background: "#fff",
                    fontFamily: "Calibri, sans-serif",
                  }}
                >
                  <option value="spouseA">מבוטח/ת ראשית</option>
                  <option value="spouseB">בן/בת זוג</option>
                </select>

                <div
                  style={{
                    color: "#69758e",
                    fontSize: 12,
                    lineHeight: 1.5,
                  }}
                >
                  שיוך קצבה מוכרת: ה־PDF וההזנות הידניות בריבוע זה יישמרו עבור {getFamilyOwnerLabel(recognizedPensionOwner)}.
                </div>
              </div>

              {vestedPdfFile && (
                <div
                  style={{
                    color: "#0d2c6c",
                    fontSize: 12,
                    fontWeight: 700,
                    marginTop: 8,
                    wordBreak: "break-word",
                  }}
                >
                  קובץ PDF: {vestedPdfFile.name} · שייך ל{getFamilyOwnerLabel(recognizedPensionOwner)}
                </div>
              )}

              {vestedPdfTable?.rows?.length ? (
                <div
                  style={{
                    color: "#247a3d",
                    fontSize: 12,
                    fontWeight: 800,
                    marginTop: 8,
                  }}
                >
                  נמצאו {vestedPdfTable.rows.length} שורות בטבלה
                </div>
              ) : null}

              {vestedPdfError && (
                <div
                  style={{
                    color: "#b42318",
                    fontSize: 12,
                    fontWeight: 700,
                    marginTop: 8,
                  }}
                >
                  {vestedPdfError}
                </div>
              )}

              <div
                style={{
                  marginTop: 18,
                  paddingTop: 16,
                  borderTop: "1px solid #e4e9f5",
                }}
              >
                <div
                  style={{
                    color: "#0d2c6c",
                    fontSize: 14,
                    fontWeight: 900,
                    marginBottom: 8,
                  }}
                >
                  עדכון קצבה מוכרת לפי חברת ביטוח
                </div>

                <div
                  style={{
                    color: "#69758e",
                    fontSize: 12,
                    lineHeight: 1.7,
                    marginBottom: 12,
                  }}
                >
                  ניתן לבחור חברת ביטוח ולהזין סכום. הסכום יעודכן בעמודת
                  הקצבה המוכרת עבור אותה חברה בדוח.
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {recognizedPensionAdjustments.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "minmax(180px, 240px) minmax(160px, 220px) auto",
                        gap: 10,
                        alignItems: "center",
                      }}
                    >
                      <select
                        value={item.companyName}
                        onChange={(event) =>
                          updateRecognizedPensionAdjustment(
                            item.id,
                            "companyName",
                            event.target.value
                          )
                        }
                        style={{
                          height: 42,
                          border: "1px solid #cbd4e6",
                          borderRadius: 12,
                          padding: "0 12px",
                          color: "#0d2c6c",
                          fontWeight: 800,
                          background: "#fff",
                          fontFamily: "Calibri, sans-serif",
                        }}
                      >
                        <option value="">בחר חברת ביטוח</option>
                        {ISRAEL_INSURANCE_COMPANIES.map((company) => (
                          <option key={company} value={company}>
                            {company}
                          </option>
                        ))}
                      </select>

                      <input
                        type="text"
                        inputMode="decimal"
                        value={item.amount}
                        onChange={(event) =>
                          updateRecognizedPensionAdjustment(
                            item.id,
                            "amount",
                            event.target.value
                          )
                        }
                        placeholder="סכום קצבה מוכרת"
                        style={{
                          height: 42,
                          border: "1px solid #cbd4e6",
                          borderRadius: 12,
                          padding: "0 12px",
                          color: "#0d2c6c",
                          fontWeight: 800,
                          background: "#fff",
                          fontFamily: "Calibri, sans-serif",
                        }}
                      />

                      <button
                        type="button"
                        onClick={() => removeRecognizedPensionAdjustment(item.id)}
                        disabled={recognizedPensionAdjustments.length <= 1}
                        style={{
                          height: 42,
                          border: "1px solid #f0c7c2",
                          borderRadius: 12,
                          padding: "0 12px",
                          background:
                            recognizedPensionAdjustments.length <= 1
                              ? "#f4f6fb"
                              : "#fff5f5",
                          color:
                            recognizedPensionAdjustments.length <= 1
                              ? "#9aa5b8"
                              : "#c81e1e",
                          fontWeight: 800,
                          cursor:
                            recognizedPensionAdjustments.length <= 1
                              ? "not-allowed"
                              : "pointer",
                          fontFamily: "Calibri, sans-serif",
                        }}
                      >
                        הסר
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={addRecognizedPensionAdjustment}
                  style={{
                    marginTop: 12,
                    background: "#ffffff",
                    color: "#0d2c6c",
                    border: "1px solid #cbd4e6",
                    borderRadius: 12,
                    padding: "10px 14px",
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: "pointer",
                    fontFamily: "Calibri, sans-serif",
                  }}
                >
                  הוסף חברה נוספת
                </button>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                flexWrap: "wrap",
                justifyContent: "flex-end",
              }}
            >
              <div
                style={{
                  width: 132,
                  height: 76,
                  borderRadius: 18,
                  border: "1px solid #d7deed",
                  background: vestedPdfTable?.rows?.length ? "#eefaf1" : "#eef2fa",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  color: vestedPdfTable?.rows?.length ? "#247a3d" : "#7b879d",
                  fontSize: 13,
                  fontWeight: 800,
                  textAlign: "center",
                  padding: 8,
                }}
              >
                {vestedPdfLoading
                  ? "קורא PDF..."
                  : vestedPdfTable?.rows?.length
                  ? "טבלה מוכנה"
                  : "PDF"}
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <button
                  type="button"
                  onClick={openVestedPdfPicker}
                  disabled={vestedPdfLoading}
                  style={{
                    background: "#ffffff",
                    color: "#0d2c6c",
                    border: "1px solid #cbd4e6",
                    borderRadius: 12,
                    padding: "10px 14px",
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: vestedPdfLoading ? "not-allowed" : "pointer",
                    minWidth: 120,
                  }}
                >
                  בחירת PDF
                </button>

                {vestedPdfFile && (
                  <button
                    type="button"
                    onClick={removeVestedPdf}
                    disabled={vestedPdfLoading}
                    style={{
                      background: "#fff5f5",
                      color: "#c81e1e",
                      border: "1px solid #f3c2c2",
                      borderRadius: 12,
                      padding: "10px 14px",
                      fontSize: 14,
                      fontWeight: 800,
                      cursor: vestedPdfLoading ? "not-allowed" : "pointer",
                      minWidth: 120,
                    }}
                  >
                    הסר PDF
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>


        <div
          style={{
            background: "#f9fbff",
            border: "1px solid #e4e9f5",
            borderRadius: 24,
            padding: "22px 24px",
            marginBottom: 20,
          }}
        >
          <div
            style={{
              color: "#0d2c6c",
              fontSize: 18,
              fontWeight: 900,
              marginBottom: 8,
            }}
          >
            פירוט פוליסות וקרנות לפי EXCEL סיווג כספים (אופציונלי)
          </div>

          <div
            style={{
              color: "#69758e",
              fontSize: 12,
              lineHeight: 1.7,
              marginBottom: 16,
            }}
          >
            ניתן להעלות EXCEL סיווג כספים ולשייך אותו ידנית לבן זוג או בת זוג.
            הנתון של פיצויים אצל מעסיק נוכחי נשמר במערכת כשדה פיצויים למס.
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {capitalClassificationUploads.map((item, index) => {
              const pensionCount = item.data?.pensionPolicies?.length || 0;
              const studyFundCount = item.data?.studyFunds?.length || 0;
              const hasParsedData = Boolean(item.data?.allRows?.length);

              return (
                <div
                  key={item.id}
                  style={{
                    border: "1px solid #dce4f2",
                    background: "#ffffff",
                    borderRadius: 20,
                    padding: 16,
                  }}
                >
                  <input
                    type="file"
                    accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    onChange={(event) =>
                      handleCapitalClassificationExcelSelection(item.id, event)
                    }
                    style={{ display: "none" }}
                    id={`${item.id}-input`}
                  />

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(160px, 220px) 1fr auto",
                      gap: 12,
                      alignItems: "center",
                    }}
                  >
                    <select
                      value={item.owner}
                      onChange={(event) =>
                        updateCapitalClassificationOwner(item.id, event.target.value)
                      }
                      style={{
                        height: 42,
                        border: "1px solid #cbd4e6",
                        borderRadius: 12,
                        padding: "0 12px",
                        color: "#0d2c6c",
                        fontWeight: 800,
                        background: "#fff",
                        fontFamily: "Calibri, sans-serif",
                      }}
                    >
                      {CAPITAL_CLASSIFICATION_OWNER_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>

                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          color: "#0d2c6c",
                          fontSize: 13,
                          fontWeight: 900,
                          wordBreak: "break-word",
                        }}
                      >
                        {item.fileName || `קובץ סיווג כספים ${index + 1}`}
                      </div>

                      {item.loading ? (
                        <div style={{ color: "#69758e", fontSize: 12, marginTop: 4 }}>
                          קורא Excel...
                        </div>
                      ) : hasParsedData ? (
                        <div style={{ color: "#247a3d", fontSize: 12, fontWeight: 800, marginTop: 4 }}>
                          נקלטו {pensionCount} פוליסות/קופות ו־{studyFundCount} קרנות השתלמות
                        </div>
                      ) : (
                        <div style={{ color: "#69758e", fontSize: 12, marginTop: 4 }}>
                          טרם נבחר קובץ
                        </div>
                      )}

                      {item.error && (
                        <div style={{ color: "#b42318", fontSize: 12, fontWeight: 700, marginTop: 4 }}>
                          {item.error}
                        </div>
                      )}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                        justifyContent: "flex-end",
                      }}
                    >
                      <div style={{ position: "relative", display: "inline-block" }}>
                        <button
                          type="button"
                          onClick={() =>
                            document.getElementById(`${item.id}-input`)?.click()
                          }
                          disabled={item.loading}
                          onMouseEnter={() => setHoveredExcelId(`cc-${item.id}`)}
                          onMouseLeave={() => setHoveredExcelId(null)}
                          style={{
                            background: "#ffffff",
                            color: "#0d2c6c",
                            border: "1px solid #cbd4e6",
                            borderRadius: 12,
                            padding: "10px 14px",
                            fontSize: 12,
                            fontWeight: 800,
                            cursor: item.loading ? "not-allowed" : "pointer",
                            minWidth: 110,
                            fontFamily: "Calibri, sans-serif",
                          }}
                        >
                          בחירת Excel
                        </button>
                        {hoveredExcelId === `cc-${item.id}` && (
                          <div style={{
                            position: "absolute",
                            bottom: "calc(100% + 8px)",
                            right: 0,
                            background: "#0d2c6c",
                            color: "#fff",
                            fontSize: 11,
                            fontWeight: 700,
                            fontFamily: "Calibri, sans-serif",
                            padding: "6px 10px",
                            borderRadius: 8,
                            whiteSpace: "nowrap",
                            zIndex: 10,
                            boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
                          }}>
                            מקור הנתונים קובץ הורדה מפקדיקט
                          </div>
                        )}
                      </div>

                      {item.fileName && (
                        <button
                          type="button"
                          onClick={() => clearCapitalClassificationUpload(item.id)}
                          disabled={item.loading}
                          style={{
                            background: "#fff5f5",
                            color: "#c81e1e",
                            border: "1px solid #f3c2c2",
                            borderRadius: 12,
                            padding: "10px 14px",
                            fontSize: 12,
                            fontWeight: 800,
                            cursor: item.loading ? "not-allowed" : "pointer",
                            fontFamily: "Calibri, sans-serif",
                          }}
                        >
                          נקה קובץ
                        </button>
                      )}

                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={addCapitalClassificationUpload}
            style={{
              marginTop: 14,
              background: "#ffffff",
              color: "#0d2c6c",
              border: "1px solid #cbd4e6",
              borderRadius: 12,
              padding: "10px 14px",
              fontSize: 12,
              fontWeight: 800,
              cursor: "pointer",
              fontFamily: "Calibri, sans-serif",
            }}
          >
            הוסף דוח פירוק נכסים נוסף
          </button>
        </div>

        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragEnd={handleDragEnd}
          style={{
            border: isDragging ? "2px solid #0d2c6c" : "2px dashed #cbd4e6",
            background: isDragging ? "#eef4ff" : "#f9fbff",
            borderRadius: 24,
            padding: "34px 24px",
            textAlign: "center",
            transition: "all 0.2s ease",
            marginBottom: 20,
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".xml"
            onChange={handleFileSelection}
            style={{ display: "none" }}
          />

          <div style={{ fontSize: 42, marginBottom: 10 }}>📂</div>

          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: "#0d2c6c",
              marginBottom: 10,
            }}
          >
            גרור קבצי XML לכאן
          </div>

          <div
            style={{
              color: "#69758e",
              fontSize: 12,
              marginBottom: 18,
            }}
          >
            או בחר קבצים ידנית מהמחשב
          </div>

          <button
            type="button"
            onClick={openFilePicker}
            style={{
              background: "#0d2c6c",
              color: "#fff",
              border: "none",
              borderRadius: 14,
              padding: "12px 20px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            בחירת קבצים
          </button>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 14,
          }}
        >
          <div
            style={{
              color: "#0d2c6c",
              fontWeight: 800,
              fontSize: 12,
            }}
          >
            {selectedFiles.length
              ? `נבחרו ${selectedFiles.length} קבצים`
              : "עדיין לא נבחרו קבצים"}
          </div>

          {selectedFiles.length > 0 && (
            <button
              type="button"
              onClick={clearAllFiles}
              style={{
                background: "#fff",
                color: "#b42318",
                border: "1px solid #f0c7c2",
                borderRadius: 12,
                padding: "10px 14px",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              נקה הכל
            </button>
          )}
        </div>

        {selectedFiles.length > 0 && (
          <div
            style={{
              background: "#fff",
              border: "1px solid #e4e9f5",
              borderRadius: 20,
              overflow: "hidden",
              marginBottom: 20,
            }}
          >
            {selectedFiles.map((file, index) => (
              <div
                key={`${file.name}_${file.size}_${file.lastModified}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  padding: "14px 16px",
                  borderBottom:
                    index !== selectedFiles.length - 1
                      ? "1px solid #eef2fa"
                      : "none",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 700,
                      color: "#0d2c6c",
                      marginBottom: 4,
                      wordBreak: "break-word",
                    }}
                  >
                    {file.name}
                  </div>

                  <div
                    style={{
                      color: "#6b7280",
                      fontSize: 12,
                    }}
                  >
                    {(file.size / 1024).toFixed(1)} KB
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => removeFile(file)}
                  style={{
                    background: "#fff5f5",
                    color: "#c81e1e",
                    border: "1px solid #f3c2c2",
                    borderRadius: 10,
                    padding: "8px 12px",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  הסר
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
          <button
            type="button"
            onClick={handleAnalyzeFiles}
            disabled={loading || selectedFiles.length === 0}
            style={{
              padding: "16px 52px",
              background:
                loading || selectedFiles.length === 0
                  ? "#c3cbdd"
                  : "linear-gradient(135deg, #0d2c6c 0%, #1a4fa8 100%)",
              color: "#fff",
              border: "none",
              borderRadius: 20,
              fontSize: 18,
              fontWeight: 900,
              fontFamily: "Calibri, sans-serif",
              cursor:
                loading || selectedFiles.length === 0 ? "not-allowed" : "pointer",
              transition: "all 0.2s ease",
              boxShadow:
                loading || selectedFiles.length === 0
                  ? "none"
                  : "0 8px 24px rgba(13,44,108,0.32)",
              letterSpacing: "0.5px",
            }}
          >
            {loading ? "מנתח קבצים..." : "הפק דוח"}
          </button>
        </div>

        {loading && (
          <div
            style={{
              marginTop: 16,
              background: "#eef4ff",
              border: "1px solid #d7e3ff",
              borderRadius: 14,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: 10,
                width: "100%",
                background:
                  "linear-gradient(90deg, #0d2c6c 0%, #3f67c6 50%, #0d2c6c 100%)",
                backgroundSize: "200% 100%",
                animation: "loadingBar 1.4s linear infinite",
              }}
            />
            <div
              style={{
                padding: 12,
                color: "#0d2c6c",
                fontWeight: 700,
                fontSize: 12,
              }}
            >
              הקבצים נטענים ומנותחים...
            </div>
          </div>
        )}

        {error && (
          <div
            style={{
              marginTop: 16,
              background: "#fff5f5",
              color: "#b42318",
              border: "1px solid #f3c2c2",
              borderRadius: 14,
              padding: 14,
              fontWeight: 700,
            }}
          >
            {error}
          </div>
        )}
      </div>

      <style>
        {`
          @keyframes loadingBar {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }

          @media (max-width: 760px) {
            div[style*="grid-template-columns: 1fr auto"],
            div[style*="grid-template-columns: minmax(180px, 240px)"] {
              grid-template-columns: 1fr !important;
            }
          }
        `}
      </style>
    </div>
  );
}
