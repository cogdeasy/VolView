<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { refDebounced } from '@vueuse/core';
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
const { report, buildReport, findings } = useReportModel();
const theme = useTheme();

// The report covers the selected series, so findings recorded on another one
// are silently absent. Saying how many keeps that from being a surprise.
const outOfScopeCount = computed(
  () => findingsStore.findings.length - findings.value.length
);

/** How long the hidden print frame outlives the print() call. */
const PRINT_FRAME_LIFETIME_MS = 60000;
/** How long a print frame may take to load before it is given up on. */
const PRINT_FRAME_LOAD_TIMEOUT_MS = 10000;
/** Keeps typing in the impression box from re-rendering the preview frame. */
const PREVIEW_DEBOUNCE_MS = 300;

const documentTheme = computed<'dark' | 'light'>(() =>
  theme.global.current.value.dark ? 'dark' : 'light'
);

// The preview is the exported document itself, rendered in a sandboxed frame,
// so its content and layout are what leaves the app. Only the surface differs:
// the preview follows the session theme, while an export is always the
// print-safe light one.
// Debounced because every srcdoc change reloads the frame and its inline
// key images; the exports re-render from live state regardless. Only rendered
// while the dialog is open, so editing findings costs nothing.

// The generation time is stamped once per opening, so it does not tick while
// the report is edited. An export stamps its own.
const openedAt = ref('');
watch(
  reportOpen,
  (open) => {
    if (open) openedAt.value = new Date().toLocaleString();
  },
  // A report already open when this mounts still gets its stamp.
  { immediate: true }
);

const previewHtml = refDebounced(
  computed(() =>
    reportOpen.value
      ? renderReportHtml(
          { ...report.value, generatedAt: openedAt.value },
          { theme: documentTheme.value }
        )
      : ''
  ),
  PREVIEW_DEBOUNCE_MS
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
    await navigator.clipboard.writeText(renderReportText(buildReport()));
    messageStore.addSuccess('Report copied to clipboard');
  } catch (err) {
    messageStore.addError('Could not copy the report', {
      error: err instanceof Error ? err : new Error(String(err)),
    });
  }
}

function downloadHtml() {
  const blob = new Blob([renderReportHtml(buildReport(), { theme: 'light' })], {
    type: 'text/html;charset=utf-8',
  });
  saveAs(blob, `${fileStem.value}.html`);
}

const printing = ref(false);
let printFrame: HTMLIFrameElement | null = null;

function disposePrintFrame() {
  printFrame?.remove();
  printFrame = null;
  printing.value = false;
}

/**
 * PDF via the browser's own print pipeline: a hidden frame holding the print
 * rendering of the same document. This avoids shipping a PDF engine, and the
 * user picks "Save as PDF" in the print dialog.
 */
function printReport() {
  // One frame at a time: each holds a full inline copy of the report.
  disposePrintFrame();
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  // Same containment as the preview, minus what printing needs: same-origin so
  // this window can drive print(), modals so the frame may open the dialog.
  // Scripts stay off, so a gap in the report's escaping cannot execute.
  frame.setAttribute('sandbox', 'allow-same-origin allow-modals');
  frame.srcdoc = renderReportHtml(buildReport(), {
    theme: 'light',
    forPrint: true,
  });
  printing.value = true;
  printFrame = frame;
  // Every timer checks identity first, so a stale one cannot take down the
  // frame of a later print.
  const disposeIfCurrent = () => {
    if (printFrame === frame) disposePrintFrame();
  };
  frame.onload = () => {
    const frameWindow = frame.contentWindow;
    // The document inlines every key image, so it goes as soon as the dialog
    // is done with it; the timer is only the backstop for a browser that
    // never fires afterprint.
    frameWindow?.addEventListener('afterprint', disposeIfCurrent);
    frameWindow?.focus();
    frameWindow?.print();
    if (printFrame === frame) printing.value = false;
    // The print dialog needs the document to outlive this handler.
    window.setTimeout(disposeIfCurrent, PRINT_FRAME_LIFETIME_MS);
  };
  frame.onerror = disposeIfCurrent;
  // A frame that never loads must not leave the button spinning.
  window.setTimeout(() => {
    if (printFrame === frame && printing.value) disposePrintFrame();
  }, PRINT_FRAME_LOAD_TIMEOUT_MS);
  document.body.appendChild(frame);
}

onBeforeUnmount(disposePrintFrame);
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
        <div
          v-if="outOfScopeCount > 0"
          class="text-caption text-medium-emphasis"
          data-testid="out-of-scope-notice"
        >
          <v-icon size="small" class="mr-1">mdi-information-outline</v-icon>
          {{ outOfScopeCount }}
          {{ outOfScopeCount === 1 ? 'finding' : 'findings' }} on other series
          {{ outOfScopeCount === 1 ? 'is' : 'are' }} not in this report.
        </div>
        <iframe
          class="report-preview flex-grow-1"
          title="Report preview"
          sandbox=""
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
