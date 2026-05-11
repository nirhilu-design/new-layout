import { useEffect, useState } from "react";
import UploadPage from "./UploadPage";
import ReportPage from "./ReportPage";
import ClientDashboardPage from "./ClientDashboardPage";
import {
  buildShareUrl,
  createClientShare,
  getShareModeFromUrl,
  loadClientShare,
} from "./shareStorage";

function PrintStyles() {
  return (
    <style>
      {`
        @media print {
          @page {
            size: A4 portrait;
            margin: 6mm;
          }

          html,
          body {
            width: 210mm !important;
            min-height: 297mm !important;
            margin: 0 !important;
            padding: 0 !important;
            direction: rtl !important;
            background: #ffffff !important;
            font-family: Calibri, Arial, sans-serif !important;
            overflow: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          body {
            zoom: 1 !important;
          }

          * {
            box-sizing: border-box !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          button,
          input,
          select,
          textarea,
          .no-print,
          .print-hide,
          .client-no-print,
          .member-filter-print-hide {
            display: none !important;
          }

          main,
          section,
          article {
            max-width: 100% !important;
            overflow: visible !important;
          }

          .card,
          .box,
          .section,
          .report-block,
          .summary-card,
          .member-card,
          .chart-card,
          .table-card,
          .dashboard-card,
          .family-card,
          .family-section-card,
          .family-kpi-card,
          .family-donut-card,
          .family-compare-card,
          .family-member-card,
          .member-section-card,
          .member-kpi-card,
          .member-donut-card {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            box-shadow: none !important;
          }

          table,
          thead,
          tbody,
          tr,
          td,
          th,
          img,
          svg,
          canvas {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          .print-page:last-child,
          .client-print-section:last-child,
          .family-print-page:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
        }
      `}
    </style>
  );
}

function App() {
  const [currentPage, setCurrentPage] = useState("upload");
  const [reportData, setReportData] = useState(null);
  const [shareError, setShareError] = useState("");
  const [isSharedMode, setIsSharedMode] = useState(false);
  const [sharePayload, setSharePayload] = useState(null);
  const [clientViewMode, setClientViewMode] = useState("family");
  const [selectedMemberId, setSelectedMemberId] = useState(null);

  useEffect(() => {
    const shareToken = getShareModeFromUrl();

    if (!shareToken) return;

    const result = loadClientShare(shareToken);

    setIsSharedMode(true);

    if (!result.success) {
      setShareError(result.error);
      setSharePayload(result.payload || null);
      setCurrentPage("share-error");
      return;
    }

    setReportData(result.reportData);
    setSharePayload(result.payload || null);
    setClientViewMode("family");
    setSelectedMemberId(null);
    setCurrentPage("client");
  }, []);

  const handleSetReportData = (data) => {
    setReportData(data);
    setClientViewMode("family");
    setSelectedMemberId(null);
    setCurrentPage("report");
  };

  const handleOpenClientDashboard = (options = {}) => {
    const view = options.view || "family";

    setClientViewMode(view);
    setSelectedMemberId(options.memberId || null);
    setCurrentPage("client");
  };

  const handleCreateShareLink = (options = {}) => {
    if (!reportData) return null;

    const result = createClientShare(reportData, {
      expirationHours: options.expirationHours || 24,
    });

    if (!result.success) {
      console.error(result.error);
      return {
        success: false,
        error: result.error,
      };
    }

    return {
      success: true,
      url: buildShareUrl(result.token),
      token: result.token,
      clientName: result.clientName,
      createdAt: result.createdAt,
      expiresAt: result.expiresAt,
      payload: result.payload,
    };
  };

  if (currentPage === "share-error") {
    return (
      <>
        <PrintStyles />

        <div
          style={{
            minHeight: "100vh",
            direction: "rtl",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#F7F5F1",
            fontFamily: 'Calibri, "Arial", sans-serif',
            padding: 24,
          }}
        >
          <div
            className="report-block"
            style={{
              background: "#fff",
              border: "1px solid #DCCDBA",
              borderRadius: 22,
              padding: 28,
              maxWidth: 560,
              textAlign: "center",
            }}
          >
            <h1 style={{ color: "#00215D", marginTop: 0 }}>הקישור לא זמין</h1>

            <p style={{ color: "#627D98", lineHeight: 1.8 }}>{shareError}</p>

            <p style={{ color: "#627D98", lineHeight: 1.8, fontSize: 13 }}>
              בשלב הנוכחי הקישור נשמר מקומית בדפדפן שבו הוא נוצר. זהו שלב בדיקות
              בלבד לפני מעבר לאחסון ענן מאובטח.
            </p>
          </div>
        </div>
      </>
    );
  }

  if (currentPage === "upload") {
    return (
      <>
        <PrintStyles />
        <UploadPage setReportData={handleSetReportData} />
      </>
    );
  }

  if (currentPage === "report") {
    return (
      <>
        <PrintStyles />

        <ReportPage
          reportData={reportData}
          onBack={() => setCurrentPage("upload")}
          onResetAll={() => {
            setReportData(null);
            setSharePayload(null);
            setIsSharedMode(false);
            setClientViewMode("family");
            setSelectedMemberId(null);
            setCurrentPage("upload");
          }}
          onOpenClientDashboard={handleOpenClientDashboard}
          onCreateShareLink={handleCreateShareLink}
        />
      </>
    );
  }

  if (currentPage === "client") {
    return (
      <>
        <PrintStyles />

        <ClientDashboardPage
          reportData={reportData}
          onBack={() => setCurrentPage("report")}
          onCreateShareLink={handleCreateShareLink}
          isSharedMode={isSharedMode}
          sharePayload={sharePayload}
          viewMode={clientViewMode}
          selectedMemberId={selectedMemberId}
          onChangeView={(view, memberId = null) => {
            setClientViewMode(view);
            setSelectedMemberId(memberId);
          }}
        />
      </>
    );
  }

  return (
    <>
      <PrintStyles />
    </>
  );
}

export default App;
