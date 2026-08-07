import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { FindingID } from '@/src/types/finding';

/**
 * Where the findings dialogs live. The editor and the report are opened from
 * the side panel and from the promote prompt over a view, so their state is
 * shared rather than owned by either.
 */
export const useFindingsUIStore = defineStore('findings-ui', () => {
  const editingFindingID = ref<FindingID | null>(null);
  const reportOpen = ref(false);

  const editFinding = (id: FindingID) => {
    editingFindingID.value = id;
  };
  const closeEditor = () => {
    editingFindingID.value = null;
  };
  const openReport = () => {
    reportOpen.value = true;
  };
  const closeReport = () => {
    reportOpen.value = false;
  };

  return {
    editingFindingID,
    reportOpen,
    editFinding,
    closeEditor,
    openReport,
    closeReport,
  };
});
