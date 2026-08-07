import {
  convertSuccessResultToDataSelection,
  importDataSources,
} from '@/src/io/import/importDataSources';
import { remoteFileToDataSource } from '@/src/io/import/dataSource';
import useVolumeColoringStore from '@/src/store/view-configs/volume-coloring';
import { useViewStore } from '@/src/store/views';
import { SampleDataset } from '@/src/types';
import { fetchFile } from '@/src/utils/fetch';

export interface LoadSampleCallbacks {
  /** Download progress, as a fraction. May be Infinity when unknown. */
  progress?: (percent: number) => void;
  /** Called once the bytes are down and the (slower) import starts. */
  downloaded?: () => void;
}

/**
 * Downloads a sample dataset, imports it and shows it in every view.
 *
 * @returns the data selection for the imported dataset, if there is one.
 * @throws when the download or the import fails.
 */
export async function loadSampleData(
  sample: SampleDataset,
  callbacks: LoadSampleCallbacks = {}
) {
  const sampleFile = await fetchFile(sample.url, sample.filename, {
    progress: callbacks.progress,
  });
  callbacks.downloaded?.();

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
  // An import that produced nothing openable leaves the views alone, rather
  // than unbinding the study the reader already had up.
  if (selection) {
    useVolumeColoringStore().setDefaults(selection, {
      transferFunction: {
        preset: sample.defaults?.colorPreset,
      },
    });
    useViewStore().setDataForAllViews(selection);
  }
  return selection;
}
