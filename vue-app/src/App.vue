<script setup>
import UploadPage from "./components/UploadPage.vue";

// POC: render the Upload screen. The full router/flow is added when the
// remaining screens (Report / ClientDashboard / …) are converted.
const handleSetReportData = (reportData) => {
  console.log("reportData ready:", reportData);
};
</script>

<template>
  <UploadPage :set-report-data="handleSetReportData" />
</template>
