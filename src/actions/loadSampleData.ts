import {
  convertSuccessResultToDataSelection,
  importDataSources,
} from '@/src/io/import/importDataSources';
import { remoteFileToDataSource } from '@/src/io/import/dataSource';
import useVolumeColoringStore from '@/src/store/view-configs/volume-coloring';
import { useMessageStore } from '@/src/store/messages';
import { useViewStore } from '@/src/store/views';
import { useAnnouncementStore } from '@/src/store/announcements';
import { SampleDataset } from '@/src/types';
import { fetchFile } from '@/src/utils/fetch';

/**
 * Downloads a sample dataset and shows it in every view.
 *
 * Shared by the sample data browser and the command palette so a sample can be
 * opened without a pointer.
 */
export async function loadSample(
  sample: SampleDataset,
  onProgress?: (percent: number) => void
) {
  const announcements = useAnnouncementStore();
  announcements.announce(`Loading ${sample.name}`);

  try {
    const sampleFile = await fetchFile(sample.url, sample.filename, {
      progress: onProgress,
    });

    const [loadResult] = await importDataSources([
      remoteFileToDataSource(sampleFile, sample.url),
    ]);

    if (!loadResult) {
      throw new Error('Did not receive a load result');
    }
    if (loadResult.type === 'error') {
      throw loadResult.error;
    }

    const selection = convertSuccessResultToDataSelection(loadResult);
    if (selection) {
      useVolumeColoringStore().setDefaults(selection, {
        transferFunction: {
          preset: sample.defaults?.colorPreset,
        },
      });
    }
    useViewStore().setDataForAllViews(selection);
    announcements.announce(`${sample.name} loaded`);
    return selection;
  } catch (error) {
    // Naming the sample in the notification title is enough: the live
    // announcer speaks new errors, so announcing here as well says it twice.
    useMessageStore().addError(`Failed to load ${sample.name}`, {
      error: error as Error,
    });
    throw error;
  }
}
