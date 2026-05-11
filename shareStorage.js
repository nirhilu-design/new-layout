const SHARE_PREFIX = "clientShare_";
const DEFAULT_EXPIRATION_HOURS = 24;

export function createClientShare(reportData, options = {}) {
  if (!reportData) {
    return {
      success: false,
      error: "אין נתוני דוח לשמירה",
    };
  }

  const token = createShareToken();

  const createdAt = new Date().toISOString();
  const expiresAt = createExpirationDate(
    options.expirationHours || DEFAULT_EXPIRATION_HOURS
  );

  const clientName =
    options.clientName ||
    buildClientNameFromReport(reportData) ||
    "לקוח ללא שם";

  const payload = {
    token,
    clientName,
    createdAt,
    expiresAt,
    storageType: "localStorage",
    version: 2,
    status: "active",
    reportData,
  };

  try {
    localStorage.setItem(`${SHARE_PREFIX}${token}`, JSON.stringify(payload));

    return {
      success: true,
      token,
      clientName,
      createdAt,
      expiresAt,
      payload,
    };
  } catch (err) {
    return {
      success: false,
      error: err?.message || "שגיאה בשמירת קישור",
    };
  }
}

export function loadClientShare(token) {
  if (!token) {
    return {
      success: false,
      error: "לא התקבל מזהה קישור",
    };
  }

  try {
    const raw = localStorage.getItem(`${SHARE_PREFIX}${token}`);

    if (!raw) {
      return {
        success: false,
        error: "הקישור לא נמצא בדפדפן זה או שפג תוקפו.",
        reason: "not_found",
      };
    }

    const payload = JSON.parse(raw);

    if (!payload?.reportData) {
      return {
        success: false,
        error: "הקישור קיים אך הנתונים אינם תקינים.",
        reason: "invalid_payload",
      };
    }

    if (payload.status === "revoked") {
      return {
        success: false,
        error: "הקישור בוטל ואינו זמין יותר.",
        reason: "revoked",
      };
    }

    if (isExpired(payload.expiresAt)) {
      return {
        success: false,
        error: "תוקף הקישור פג.",
        reason: "expired",
        payload,
      };
    }

    return {
      success: true,
      payload,
      reportData: payload.reportData,
      token: payload.token,
      clientName: payload.clientName,
      createdAt: payload.createdAt,
      expiresAt: payload.expiresAt,
    };
  } catch (err) {
    return {
      success: false,
      error: err?.message || "שגיאה בקריאת הקישור",
      reason: "read_error",
    };
  }
}

export function revokeClientShare(token) {
  if (!token) {
    return {
      success: false,
      error: "לא התקבל מזהה קישור לביטול",
    };
  }

  try {
    const raw = localStorage.getItem(`${SHARE_PREFIX}${token}`);

    if (!raw) {
      return {
        success: false,
        error: "הקישור לא נמצא",
      };
    }

    const payload = JSON.parse(raw);

    const updatedPayload = {
      ...payload,
      status: "revoked",
      revokedAt: new Date().toISOString(),
    };

    localStorage.setItem(
      `${SHARE_PREFIX}${token}`,
      JSON.stringify(updatedPayload)
    );

    return {
      success: true,
      payload: updatedPayload,
    };
  } catch (err) {
    return {
      success: false,
      error: err?.message || "שגיאה בביטול הקישור",
    };
  }
}

export function deleteClientShare(token) {
  if (!token) {
    return {
      success: false,
      error: "לא התקבל מזהה קישור למחיקה",
    };
  }

  try {
    localStorage.removeItem(`${SHARE_PREFIX}${token}`);

    return {
      success: true,
    };
  } catch (err) {
    return {
      success: false,
      error: err?.message || "שגיאה במחיקת הקישור",
    };
  }
}

export function listClientShares() {
  try {
    const shares = [];

    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);

      if (!key || !key.startsWith(SHARE_PREFIX)) continue;

      const raw = localStorage.getItem(key);
      if (!raw) continue;

      try {
        const payload = JSON.parse(raw);

        shares.push({
          token: payload.token,
          clientName: payload.clientName || "לקוח ללא שם",
          createdAt: payload.createdAt,
          expiresAt: payload.expiresAt,
          status: payload.status || "active",
          isExpired: isExpired(payload.expiresAt),
        });
      } catch {
        // מתעלמים מרשומה פגומה אחת כדי לא לשבור את כל הרשימה
      }
    }

    return {
      success: true,
      shares: shares.sort(
        (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
      ),
    };
  } catch (err) {
    return {
      success: false,
      error: err?.message || "שגיאה בקריאת רשימת הקישורים",
      shares: [],
    };
  }
}

export function buildShareUrl(token) {
  const url = new URL(window.location.href);
  url.searchParams.set("share", token);
  return url.toString();
}

export function getShareModeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("share");
}

export function formatShareDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("he-IL", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function isShareExpired(expiresAt) {
  return isExpired(expiresAt);
}

function createShareToken() {
  return (
    "share_" +
    Date.now().toString(36) +
    "_" +
    Math.random().toString(36).slice(2, 12)
  );
}

function createExpirationDate(hours) {
  const safeHours = Number(hours || DEFAULT_EXPIRATION_HOURS);
  const expires = new Date();
  expires.setHours(expires.getHours() + safeHours);
  return expires.toISOString();
}

function isExpired(expiresAt) {
  if (!expiresAt) return false;

  const expiryDate = new Date(expiresAt);

  if (Number.isNaN(expiryDate.getTime())) return false;

  return Date.now() > expiryDate.getTime();
}

function buildClientNameFromReport(reportData) {
  const members = Array.isArray(reportData?.members) ? reportData.members : [];

  const names = members
    .map((member) => member?.name)
    .filter(Boolean)
    .map((name) => String(name).trim())
    .filter(Boolean);

  if (!names.length) return "";

  if (names.length === 1) return names[0];

  return `משפחת ${extractLikelyFamilyName(names)}`;
}

function extractLikelyFamilyName(names) {
  const lastWords = names
    .map((name) => {
      const parts = String(name).trim().split(/\s+/);
      return parts.length > 1 ? parts[parts.length - 1] : "";
    })
    .filter(Boolean);

  if (!lastWords.length) return names.join(" ו־");

  const counts = new Map();

  lastWords.forEach((word) => {
    counts.set(word, (counts.get(word) || 0) + 1);
  });

  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);

  return sorted[0]?.[0] || names.join(" ו־");
}
