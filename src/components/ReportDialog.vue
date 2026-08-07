<script setup lang="ts">
import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useTheme } from 'vuetify';
import { saveAs } from 'file-saver';
import { useFindingsStore } from '@/src/store/findings';
import { useFindingsUIStore } from '@/src/store/findings-ui';
import { useMessageStore } from '@/src/store/messages';
import { useReportModel } from '@/src/composables/useReportModel';
import { renderReportHtml, renderReportText } from '@/src/core/findings/report';
import { Brand } from '@/src/branding';

const findingsStore = useFindingsStore();
const uiStore = useFindingsUIStore();
const { reportOpen } = storeToRefs(uiStore);
const { impression } = storeToRefs(findingsStore);
const { report } = useReportModel();
const theme = useTheme();

const documentTheme = computed<'dark' | 'light'>(() =>
  theme.global.current.value.dark ? 'dark' : 'light'
);

// The preview is the exported document itself, rendered in a sandboxed frame,
// so what the radiologist signs off is byte-for-byte what leaves the app.
const previewHtml = computed(() =>
  renderReportHtml(report.value, { theme: documentTheme.value })
);

const fileStem = computed(() => {
  const patientID =
    report.value.patient.find((field) => field.label === 'ID')?.value ?? '';
  const date = new Date().toISOString().slice(0, 10);
  const parts = ['findings-report', patientID, date].filter(Boolean);
  return parts.join('-').replace(/[^\w.-]+/g, '_');
});

async function copyText() {
  const messageStore = useMessageStore();
  try {
    await navigator.clipboard.writeText(renderReportText(report.value));
    messageStore.addSuccess('Report copied to clipboard');
  } catch (err) {
    messageStore.addError('Could not copy the report', {
      error: err instanceof Error ? err : new Error(String(err)),
    });
  }
}

function downloadHtml() {
  const blob = new Blob([renderReportHtml(report.value, { theme: 'light' })], {
    type: 'text/html;charset=utf-8',
  });
  saveAs(blob, `${fileStem.value}.html`);
}

const printing = ref(false);

/**
 * PDF via the browser's own print pipeline: a hidden frame holding the print
 * rendering of the same document. This avoids shipping a PDF engine, and the
 * user picks "Save as PDF" in the print dialog.
 */
function printReport() {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  frame.srcdoc = renderReportHtml(report.value, {
    theme: 'light',
    forPrint: true,
  });
  printing.value = true;
  frame.onload = () => {
    const frameWindow = frame.contentWindow;
    frameWindow?.focus();
    frameWindow?.print();
    printing.value = false;
    // Give the print dialog time to take its snapshot of the document.
    window.setTimeout(() => frame.remove(), 60000);
  };
  document.body.appendChild(frame);
}
</script>

<template>
  <v-dialog
    v-model="reportOpen"
    fullscreen
    transition="dialog-bottom-transition"
  >
    <v-card class="d-flex flex-column">
      <v-toolbar color="primary" density="comfortable">
        <v-btn icon @click="uiStore.closeReport()" aria-label="Close report">
          <v-icon>mdi-close</v-icon>
        </v-btn>
        <v-toolbar-title>
          {{ Brand.productShortName }} — Findings report
        </v-toolbar-title>
        <v-spacer />
        <v-btn
          variant="text"
          @click="copyText"
          data-testid="copy-report-button"
        >
          <v-icon start>mdi-content-copy</v-icon>
          Copy text
        </v-btn>
        <v-btn
          variant="text"
          @click="downloadHtml"
          data-testid="download-report-button"
        >
          <v-icon start>mdi-download</v-icon>
          Download
        </v-btn>
        <v-btn variant="text" :loading="printing" @click="printReport">
          <v-icon start>mdi-printer</v-icon>
          Print / PDF
        </v-btn>
      </v-toolbar>

      <div class="report-body flex-grow-1 d-flex flex-column pa-4 ga-3">
        <v-textarea
          v-model="impression"
          label="Impression"
          placeholder="Summarize the findings for the referring clinician."
          rows="2"
          auto-grow
          max-rows="6"
          density="comfortable"
          hide-details
          data-testid="impression-field"
        />
        <iframe
          class="report-preview flex-grow-1"
          title="Report preview"
          sandbox="allow-same-origin"
          :srcdoc="previewHtml"
          data-testid="report-preview"
        ></iframe>
      </div>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.report-body {
  min-height: 0;
  overflow: hidden;
}

.report-preview {
  width: 100%;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 2px;
  background: rgb(var(--v-theme-surface));
}
</style>
