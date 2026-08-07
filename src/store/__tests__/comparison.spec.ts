import { beforeEach, describe, expect, it } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';

import { useComparisonStore } from '@/src/store/comparison';
import { useDatasetStore } from '@/src/store/datasets';
import { useDICOMStore } from '@/src/store/datasets-dicom';
import { useImageStore } from '@/src/store/datasets-images';
import { useViewStore } from '@/src/store/views';
import {
  ComparisonLayoutNames,
  ComparisonLayouts,
  ComparisonViewNames,
  comparisonPaneSpec,
} from '@/src/core/comparison/layout';

const seatImage = (id: string) => {
  const image = vtkImageData.newInstance();
  image.setDimensions(2, 2, 2);
  image.getPointData().setScalars(
    vtkDataArray.newInstance({
      name: 'scalars',
      numberOfComponents: 1,
      values: new Uint8Array(8),
    })
  );
  return useImageStore().addVTKImageData(id, image, { id });
};

/** Registers a DICOM volume with the metadata the pair selection reads. */
const seatDicomVolume = (
  volumeID: string,
  studyKey: string,
  studyDate: string,
  kind: 'volume' | 'cine',
  patientID = 'PATIENT-1'
) => {
  const dicomStore = useDICOMStore();
  dicomStore.volumeInfo[volumeID] = {
    NumberOfSlices: 10,
    VolumeID: volumeID,
    Modality: 'MR',
    SeriesInstanceUID: volumeID,
    SeriesNumber: '1',
    SeriesDescription: volumeID,
    WindowLevel: '',
    WindowWidth: '',
    kind,
  };
  dicomStore.volumeStudy[volumeID] = studyKey;
  dicomStore.studyInfo[studyKey] = {
    StudyID: studyKey,
    StudyInstanceUID: studyKey,
    StudyDate: studyDate,
    StudyTime: '',
    AccessionNumber: '',
    StudyDescription: studyKey,
  };
  dicomStore.studyPatient[studyKey] = patientID;
  dicomStore.patientInfo[patientID] = {
    PatientID: patientID,
    PatientName: patientID,
    PatientBirthDate: '',
    PatientSex: '',
  };
};

/** Makes the view showing `dataID` the active one, as clicking a pane does. */
const readImageIn = (dataID: string) => {
  const viewStore = useViewStore();
  const [viewID] = viewStore.viewIDs;
  viewStore.setDataForView(viewID, dataID);
  viewStore.setActiveView(viewID);
};

describe('comparison store — mode detection', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('follows the panes on screen, not the remembered layout name', () => {
    const comparison = useComparisonStore();
    const viewStore = useViewStore();
    viewStore.setNamedLayoutsFromConfig(ComparisonLayouts);
    expect(comparison.isComparisonLayout).toBe(false);

    viewStore.switchToNamedLayout(ComparisonLayoutNames.pair);
    expect(comparison.isComparisonLayout).toBe(true);

    // A restored session brings the named views back without the layout name.
    viewStore.currentLayoutName = 'Four Up';
    expect(comparison.isComparisonLayout).toBe(true);
  });

  it('ends when the reader builds a grid out of the comparison panes', () => {
    const comparison = useComparisonStore();
    const viewStore = useViewStore();
    viewStore.setNamedLayoutsFromConfig(ComparisonLayouts);
    viewStore.switchToNamedLayout(ComparisonLayoutNames.pair);
    expect(comparison.isComparisonLayout).toBe(true);

    viewStore.setLayoutFromGrid([2, 1]);

    expect(comparison.isComparisonLayout).toBe(false);
    expect(viewStore.visibleViews.map((view) => view.name)).toEqual([
      'Axial',
      'Axial',
    ]);
  });

  it('leaves no comparison pane behind in the slots a smaller layout drops', () => {
    const viewStore = useViewStore();
    viewStore.setNamedLayoutsFromConfig(ComparisonLayouts);
    viewStore.switchToNamedLayout(ComparisonLayoutNames.quad);

    viewStore.switchToNamedLayout(ComparisonLayoutNames.pair);

    // The two panes the pair does not use are off screen; a comparison name
    // left on one of them would re-arm the mode if it ever came back.
    expect(
      viewStore.viewIDs
        .map((viewID) => viewStore.getView(viewID)?.name)
        .filter((name) => !!comparisonPaneSpec(name))
        .sort()
    ).toEqual(
      [ComparisonViewNames.currentAxial, ComparisonViewNames.priorAxial].sort()
    );
  });

  it('is off when the layout name is the only thing left of a comparison', () => {
    const comparison = useComparisonStore();
    const viewStore = useViewStore();
    viewStore.currentLayoutName = ComparisonLayoutNames.pair;
    expect(comparison.isComparisonLayout).toBe(false);
  });
});

describe('comparison store — pair selection', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    seatImage('img-a');
    seatImage('img-b');
    seatImage('img-c');
  });

  it('keeps the prior in its role when the current study is closed', () => {
    const comparison = useComparisonStore();
    comparison.setCurrentImageID('img-a');
    comparison.setPriorImageID('img-b');
    // The reader clicked the prior pane, so it holds the active view.
    readImageIn('img-b');

    useDatasetStore().remove('img-a');
    comparison.autoSelectStudies();

    expect(comparison.priorImageID).toBe('img-b');
    expect(comparison.currentImageID).toBe('img-c');
  });

  it('adopts the study being read as current when it is not the prior', () => {
    const comparison = useComparisonStore();
    comparison.setCurrentImageID('img-a');
    comparison.setPriorImageID('img-b');
    readImageIn('img-c');

    useDatasetStore().remove('img-a');
    comparison.autoSelectStudies();

    expect(comparison.currentImageID).toBe('img-c');
    expect(comparison.priorImageID).toBe('img-b');
  });

  it('corrects one pair without moving the other', () => {
    const comparison = useComparisonStore();
    const viewStore = useViewStore();
    viewStore.setNamedLayoutsFromConfig(ComparisonLayouts);
    viewStore.switchToNamedLayout(ComparisonLayoutNames.quad);
    comparison.setCurrentImageID('img-a');
    comparison.setPriorImageID('img-b');

    const coronal = viewStore.visibleViews.find(
      (view) => view?.name === ComparisonViewNames.currentCoronal
    );
    viewStore.setActiveView(coronal!.id);
    comparison.nudgeSliceOffset(2);

    expect(comparison.nudgeAxis).toBe('Coronal');
    expect(comparison.sliceOffsetFor('Coronal')).toBe(2);
    // The axial pair was aligned already, and a coronal correction is not a
    // statement about it.
    expect(comparison.sliceOffsetFor('Axial')).toBe(0);
  });

  it('claims no alignment when no pane is taking part', () => {
    const comparison = useComparisonStore();
    const viewStore = useViewStore();
    viewStore.setNamedLayoutsFromConfig(ComparisonLayouts);
    viewStore.switchToNamedLayout(ComparisonLayoutNames.pair);
    comparison.setCurrentImageID('img-a');
    comparison.setPriorImageID('img-b');
    expect(comparison.alignment).not.toBeNull();

    // A restored manifest can bring back a pane whose name and orientation
    // contradict each other. Such a pane is left out of the pair, and with
    // none left nothing is being mapped for the chip to describe.
    viewStore.visibleViews.forEach((view) => {
      if (view.type === '2D') view.options.orientation = 'Sagittal';
    });

    expect(comparison.active).toBe(true);
    expect(comparison.panes).toEqual([]);
    expect(comparison.alignment).toBeNull();
  });

  it('forgets a deleted study and the nudge that aligned it', () => {
    const comparison = useComparisonStore();
    comparison.setCurrentImageID('img-a');
    comparison.setPriorImageID('img-b');
    comparison.setSliceOffset(3);
    expect(comparison.sliceOffset).toBe(3);

    useDatasetStore().remove('img-b');

    expect(comparison.priorImageID).toBeNull();
    expect(comparison.sliceOffsetByPair).toEqual({});
  });
});

describe('comparison store — cine series', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('leaves the prior unset rather than pairing against a cine series', () => {
    const comparison = useComparisonStore();
    seatDicomVolume('vol-3d', 'study-2019', '20190430', 'volume');
    seatDicomVolume('vol-cine', 'study-2019', '20190430', 'cine');
    comparison.setCurrentImageID('vol-3d');

    comparison.autoSelectStudies();

    // The only other series on screen is one the picker will not offer.
    expect(comparison.priorImageID).toBeNull();

    seatDicomVolume('vol-prior', 'study-2018', '20181031', 'volume');
    comparison.autoSelectStudies();

    expect(comparison.priorImageID).toBe('vol-prior');
  });

  it('reads the surviving study when the current one is closed beside a cine', () => {
    const comparison = useComparisonStore();
    seatDicomVolume('vol-2019', 'study-2019', '20190430', 'volume');
    seatDicomVolume('vol-2018', 'study-2018', '20181031', 'volume');
    seatDicomVolume('vol-cine', 'study-2019', '20190430', 'cine');
    comparison.autoSelectStudies();
    expect(comparison.currentImageID).toBe('vol-2019');
    expect(comparison.priorImageID).toBe('vol-2018');

    // Closed the way it was seated: what the pair reads is the volume list.
    const dicomStore = useDICOMStore();
    delete dicomStore.volumeInfo['vol-2019'];
    delete dicomStore.volumeStudy['vol-2019'];
    comparison.autoSelectStudies();

    // The cine is no stand-in for the closed study, so the prior is promoted
    // rather than the pair collapsing with a readable study still loaded.
    expect(comparison.currentImageID).toBe('vol-2018');
    expect(comparison.priorImageID).toBeNull();
  });

  it('lets go of a study that turns out to be a cine after it was paired', () => {
    const comparison = useComparisonStore();
    seatDicomVolume('vol-2019', 'study-2019', '20190430', 'volume');
    seatDicomVolume('vol-2018', 'study-2018', '20181031', 'volume');
    seatDicomVolume('vol-2017', 'study-2017', '20171031', 'volume');
    comparison.autoSelectStudies();
    expect(comparison.priorImageID).toBe('vol-2018');

    // Kind is read off metadata that arrives with the pixels, so a series can
    // resolve to a cine after the pair already holds it.
    useDICOMStore().volumeInfo['vol-2018'].kind = 'cine';
    comparison.autoSelectStudies();

    expect(comparison.priorImageID).toBe('vol-2017');
  });

  it('leaves both roles empty in a workspace holding only cine series', () => {
    const comparison = useComparisonStore();
    seatDicomVolume('vol-cine', 'study-2019', '20190430', 'cine');

    comparison.autoSelectStudies();

    expect(comparison.currentImageID).toBeNull();
    expect(comparison.priorImageID).toBeNull();
  });
});

describe('comparison store — patient identity', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('flags a pair that names two different patients', () => {
    const comparison = useComparisonStore();
    seatDicomVolume('vol-a', 'study-a', '20190430', 'volume', 'PATIENT-A');
    seatDicomVolume('vol-b', 'study-b', '20181031', 'volume', 'PATIENT-B');

    comparison.autoSelectStudies();

    expect(comparison.patientMismatch).toBe(true);
  });

  it('says nothing about data that carries no patient identity', () => {
    const comparison = useComparisonStore();
    seatImage('img-one');
    seatImage('img-two');

    comparison.autoSelectStudies();

    expect(comparison.patientMismatch).toBe(false);
  });

  it('leaves two studies of the same patient unflagged', () => {
    const comparison = useComparisonStore();
    seatDicomVolume('vol-2019', 'study-2019', '20190430', 'volume');
    seatDicomVolume('vol-2018', 'study-2018', '20181031', 'volume');

    comparison.autoSelectStudies();

    expect(comparison.patientMismatch).toBe(false);
  });
});

describe('comparison store — candidate order', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('lists an undated image behind the dated studies', () => {
    const comparison = useComparisonStore();
    seatImage('img-imported');
    seatDicomVolume('vol-2018', 'study-2018', '20181031', 'volume');
    seatDicomVolume('vol-2019', 'study-2019', '20190430', 'volume');

    expect(comparison.candidates.map((study) => study.imageID)).toEqual([
      'vol-2019',
      'vol-2018',
      'img-imported',
    ]);

    comparison.autoSelectStudies();

    expect(comparison.currentImageID).toBe('vol-2019');
    expect(comparison.priorImageID).toBe('vol-2018');
  });
});
