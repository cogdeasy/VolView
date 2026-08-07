import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import JSZip from 'jszip';

import { useFindingsStore } from '@/src/store/findings';
import { useRulerStore } from '@/src/store/tools/rulers';
import { AnnotationToolType } from '@/src/store/tools/types';
import { ManifestSchema } from '@/src/io/state-file/schema';
import { migrateManifest } from '@/src/io/state-file/migrations';
import { MANIFEST_VERSION } from '@/src/io/state-file/serialize';
import type { FileEntry } from '@/src/io/types';
import type { ToolID } from '@/src/types/annotation-tool';

// ---------------------------------------------------------------------------
// Findings are the only state that references BOTH a dataset and an annotation
// by id, and both are renumbered on restore. These specs pin the round trip
// through the manifest, and that a pre-findings `.volview.zip` still opens.
// ---------------------------------------------------------------------------

const KEY_IMAGE_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const addRuler = (imageID: string, labelName = 'Lesion') => {
  const store = useRulerStore();
  const id = store.addRuler({
    firstPoint: [0, 0, 5],
    secondPoint: [3, 4, 5],
    imageID,
    name: 'Ruler',
    labelName,
    frameOfReference: { planeNormal: [0, 0, 1], planeOrigin: [0, 0, 5] },
    slice: 5,
    placing: false,
  });
  store.updateRuler(id, { labelName });
  return id;
};

const serializeFindings = async () => {
  const zip = new JSZip();
  const manifest = {
    version: MANIFEST_VERSION,
    dataSources: [],
  } as unknown as Parameters<
    ReturnType<typeof useFindingsStore>['serialize']
  >[0]['manifest'];
  useFindingsStore().serialize({ zip, manifest });
  // Round-trip through JSON + zod, exactly like a real save/load.
  const parsed = ManifestSchema.parse(JSON.parse(JSON.stringify(manifest)));
  const stateFiles: FileEntry[] = await Promise.all(
    Object.values(zip.files)
      .filter((entry) => !entry.dir)
      .map(async ({ name: path }) => ({
        archivePath: path,
        // extractFilesFromZip yields typeless files, like a real restore.
        file: new File([await zip.file(path)!.async('blob')], path),
      }))
  );
  return { manifest: parsed, stateFiles };
};

describe('findings store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('promotes a measurement, carrying over what the annotation knows', () => {
    const toolID = addRuler('image-1');
    const store = useFindingsStore();

    const id = store.promoteMeasurement(AnnotationToolType.Ruler, toolID)!;

    const finding = store.findingByID[id];
    expect(finding.imageID).toBe('image-1');
    expect(finding.title).toBe('Lesion');
    expect(finding.slice).toBe(5);
    expect(finding.frameOfReference.planeNormal).toEqual([0, 0, 1]);
    expect(finding.measurements).toEqual([
      { toolType: AnnotationToolType.Ruler, toolID },
    ]);
    // +x is the patient's left in LPS.
    expect(finding.laterality).toBe('midline');
    expect(store.findingForTool(toolID)?.id).toBe(id);
  });

  it('round-trips findings, the impression, custom types and key images', async () => {
    const toolID = addRuler('image-1');
    const store = useFindingsStore();
    const id = store.promoteMeasurement(AnnotationToolType.Ruler, toolID)!;
    const typeID = store.addFindingType({
      label: 'Papillary muscle',
      modalities: ['MR'],
      defaultBodySite: 'Left ventricle',
      categoryScale: 'severity',
    });
    store.updateFinding(id, {
      typeID,
      bodySite: 'Left ventricle',
      category: 'Moderate',
      description: 'Prominent muscle',
      laterality: 'left',
    });
    store.setKeyImage(id, {
      dataURL: KEY_IMAGE_DATA_URL,
      viewName: 'Axial',
      slice: 5,
      capturedAt: '2026-01-02T00:00:00.000Z',
    });
    store.impression = 'Enlarged left ventricle.';

    const { manifest, stateFiles } = await serializeFindings();
    expect(manifest.findings?.types).toHaveLength(1);

    // A restore renumbers datasets and annotations.
    setActivePinia(createPinia());
    const restored = useFindingsStore();
    const restoredToolID = 'ruler-99' as ToolID;
    await restored.deserialize(
      manifest,
      { 'image-1': 'image-77' },
      { [toolID]: restoredToolID },
      stateFiles
    );

    expect(restored.impression).toBe('Enlarged left ventricle.');
    expect(restored.findingTypeByID[typeID]?.label).toBe('Papillary muscle');
    expect(restored.findings).toHaveLength(1);

    const finding = restored.findings[0];
    expect(finding.imageID).toBe('image-77');
    expect(finding.bodySite).toBe('Left ventricle');
    expect(finding.category).toBe('Moderate');
    expect(finding.laterality).toBe('left');
    expect(finding.measurements).toEqual([
      { toolType: AnnotationToolType.Ruler, toolID: restoredToolID },
    ]);
    expect(finding.keyImage?.viewName).toBe('Axial');
    // A typeless archive member must still restore as a usable <img> source.
    expect(finding.keyImage?.dataURL).toBe(KEY_IMAGE_DATA_URL);
  });

  it('reports a key image the archive did not carry', async () => {
    const store = useFindingsStore();
    const id = store.addFinding({ imageID: 'image-1', title: 'LV long axis' });
    store.setKeyImage(id, {
      dataURL: KEY_IMAGE_DATA_URL,
      viewName: 'Axial',
      slice: 5,
      capturedAt: '2026-01-02T00:00:00.000Z',
    });
    const { manifest } = await serializeFindings();

    setActivePinia(createPinia());
    const restored = useFindingsStore();
    // A JSON-only manifest restores without any archive members.
    const { missingKeyImages } = await restored.deserialize(
      manifest,
      { 'image-1': 'image-77' },
      {},
      []
    );

    expect(missingKeyImages).toEqual(['LV long axis']);
    expect(restored.findings[0].keyImage).toBeUndefined();
  });

  it('reorders a finding past a sibling, skipping other images', () => {
    const store = useFindingsStore();
    const first = store.promoteMeasurement(
      AnnotationToolType.Ruler,
      addRuler('image-1', 'First')
    )!;
    const other = store.promoteMeasurement(
      AnnotationToolType.Ruler,
      addRuler('image-2', 'Other image')
    )!;
    const second = store.promoteMeasurement(
      AnnotationToolType.Ruler,
      addRuler('image-1', 'Second')
    )!;

    // The panel shows first, second - moving "second" up must swap those two
    // rather than step onto the hidden other-image finding.
    store.moveFindingRelative(second, first, 'before');

    expect(store.findingIDs).toEqual([second, first, other]);
    expect(store.findingsForImage('image-1').map((f) => f.id)).toEqual([
      second,
      first,
    ]);

    store.moveFindingRelative(second, first, 'after');
    expect(store.findingsForImage('image-1').map((f) => f.id)).toEqual([
      first,
      second,
    ]);
  });

  it('mints custom type ids that cannot collide with restored ones', async () => {
    const store = useFindingsStore();
    const typeID = store.addFindingType({
      label: 'Papillary muscle',
      modalities: ['MR'],
      defaultBodySite: 'Left ventricle',
      categoryScale: 'severity',
    });
    const { manifest, stateFiles } = await serializeFindings();

    // A fresh session restores the saved type without advancing the id store.
    setActivePinia(createPinia());
    const restored = useFindingsStore();
    await restored.deserialize(manifest, {}, {}, stateFiles);
    const newID = restored.addFindingType({
      label: 'Trabecula',
      modalities: ['MR'],
      defaultBodySite: 'Left ventricle',
      categoryScale: 'severity',
    });

    expect(newID).not.toBe(typeID);
    expect(restored.findingTypeByID[typeID].label).toBe('Papillary muscle');
    expect(restored.findingTypeByID[newID].label).toBe('Trabecula');
  });

  it('drops a measurement whose annotation did not restore', async () => {
    const toolID = addRuler('image-1');
    const store = useFindingsStore();
    store.promoteMeasurement(AnnotationToolType.Ruler, toolID);
    const { manifest, stateFiles } = await serializeFindings();

    setActivePinia(createPinia());
    const restored = useFindingsStore();
    await restored.deserialize(
      manifest,
      { 'image-1': 'image-77' },
      {},
      stateFiles
    );

    expect(restored.findings).toHaveLength(1);
    expect(restored.findings[0].measurements).toEqual([]);
  });

  it('ignores a link to an annotation the user deleted', async () => {
    const toolID = addRuler('image-1');
    const store = useFindingsStore();
    const id = store.promoteMeasurement(AnnotationToolType.Ruler, toolID)!;
    useRulerStore().removeRuler(toolID);

    expect(store.liveMeasurements(store.findingByID[id])).toEqual([]);
    expect(store.measurementPoints(store.findingByID[id])).toEqual([]);

    const { manifest } = await serializeFindings();
    expect(manifest.findings?.findings?.[0].measurements).toEqual([]);
  });

  it('skips a finding whose image did not restore', async () => {
    const toolID = addRuler('image-1');
    useFindingsStore().promoteMeasurement(AnnotationToolType.Ruler, toolID);
    const { manifest, stateFiles } = await serializeFindings();

    setActivePinia(createPinia());
    const restored = useFindingsStore();
    await restored.deserialize(manifest, {}, {}, stateFiles);

    expect(restored.findings).toHaveLength(0);
  });

  it('opens a pre-findings state file unchanged', async () => {
    const legacy = JSON.stringify({
      version: '6.3.0',
      dataSources: [],
      datasets: [{ id: 'image-1', dataSourceId: 1 }],
    });

    const migrated = migrateManifest(legacy);
    expect(migrated.version).toBe(MANIFEST_VERSION);

    const manifest = ManifestSchema.parse(migrated);
    expect(manifest.findings).toBeUndefined();

    const store = useFindingsStore();
    await store.deserialize(manifest, { 'image-1': 'image-77' }, {}, []);
    expect(store.findings).toHaveLength(0);
    expect(store.impression).toBe('');
    // The built-in taxonomy is still whole.
    expect(store.findingTypes.every((type) => type.builtin)).toBe(true);
  });
});
