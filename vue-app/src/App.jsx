import { defineComponent, onMounted, ref } from "vue";
import UploadPage from "./UploadPage";
import ReportPage from "./ReportPage";
import ClientDashboardPage from "./ClientDashboardPage";
import {
  buildShareUrl,
  createClientShare,
  getShareModeFromUrl,
  loadClientShare,
} from "./shareStorage";

const PrintStyles = defineComponent({
  name: "PrintStyles",
  setup() {
    return () => (
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
  },
});

const App = defineComponent({
  name: "App",
  setup() {
    const currentPage = ref("upload");
    const reportData = ref(null);
    const shareError = ref("");
    const isSharedMode = ref(false);
    const sharePayload = ref(null);
    const clientViewMode = ref("family");
    const selectedMemberId = ref(null);

    onMounted(() => {
      const shareToken = getShareModeFromUrl();

      if (!shareToken) return;

      const result = loadClientShare(shareToken);

      isSharedMode.value = true;

      if (!result.success) {
        shareError.value = result.error;
        sharePayload.value = result.payload || null;
        currentPage.value = "share-error";
        return;
      }

      reportData.value = result.reportData;
      sharePayload.value = result.payload || null;
      clientViewMode.value = "family";
      selectedMemberId.value = null;
      currentPage.value = "client";
    });

    const handleSetReportData = (data) => {
      reportData.value = data;
      clientViewMode.value = "family";
      selectedMemberId.value = null;
      currentPage.value = "report";
    };

    const handleOpenClientDashboard = (options = {}) => {
      const view = options.view || "family";

      clientViewMode.value = view;
      selectedMemberId.value = options.memberId || null;
      currentPage.value = "client";
    };

    const handleCreateShareLink = (options = {}) => {
      const dataForShare = options.reportData || reportData.value;

      if (!dataForShare) return null;

      reportData.value = dataForShare;

      const result = createClientShare(dataForShare, {
        expirationHours: options.expirationHours || 24,
        clientModel: options.clientModel || null,
      });

      if (!result.success) {
        console.error(result.error);
        return {
          success: false,
          error: result.error,
        };
      }

      sharePayload.value = result.payload || null;

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

    return () => {
      if (currentPage.value === "share-error") {
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
                class="report-block"
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

                <p style={{ color: "#627D98", lineHeight: 1.8 }}>{shareError.value}</p>

                <p style={{ color: "#627D98", lineHeight: 1.8, fontSize: 13 }}>
                  בשלב הנוכחי הקישור נשמר מקומית בדפדפן שבו הוא נוצר. זהו שלב בדיקות
                  בלבד לפני מעבר לאחסון ענן מאובטח.
                </p>
              </div>
            </div>
          </>
        );
      }

      if (currentPage.value === "upload") {
        return (
          <>
            <PrintStyles />
            <UploadPage setReportData={handleSetReportData} />
          </>
        );
      }

      if (currentPage.value === "report") {
        return (
          <>
            <PrintStyles />

            <ReportPage
              reportData={reportData.value}
              onBack={() => (currentPage.value = "upload")}
              onResetAll={() => {
                reportData.value = null;
                sharePayload.value = null;
                isSharedMode.value = false;
                clientViewMode.value = "family";
                selectedMemberId.value = null;
                currentPage.value = "upload";
              }}
              onOpenClientDashboard={handleOpenClientDashboard}
              onCreateShareLink={handleCreateShareLink}
            />
          </>
        );
      }

      if (currentPage.value === "client") {
        return (
          <>
            <PrintStyles />

            <ClientDashboardPage
              reportData={reportData.value}
              onBack={() => (currentPage.value = "report")}
              onCreateShareLink={handleCreateShareLink}
              isSharedMode={isSharedMode.value}
              sharePayload={sharePayload.value}
              viewMode={clientViewMode.value}
              selectedMemberId={selectedMemberId.value}
              onChangeView={(view, memberId = null) => {
                clientViewMode.value = view;
                selectedMemberId.value = memberId;
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
    };
  },
});

export default App;
