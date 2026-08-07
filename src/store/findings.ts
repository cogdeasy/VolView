import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { Vector3 } from '@kitware/vtk.js/types';

import { useIdStore } from '@/src/store/id';
import { useAnnotationToolStore } from '@/src/store/tools';
import { AnnotationToolType } from '@/src/store/tools/types';
import { onImageDeleted } from '@/src/composables/onImageDeleted';
import { declareManifestRefs } from '@/src/core/manifestRefs';
import { applyLocator } from '@/src/core/annotations/locator';
import { isRecord, removeFromArray } from '@/src/utils';
import type { Manifest, StateFile } from '@/src/io/state-file/schema';
import type { FileEntry } from '@/src/io/types';
import type { ToolID } from '@/src/types/annotation-tool';
import type {
  Finding,
  FindingID,
  FindingKeyImage,
  FindingMeasurement,
  FindingType,
} from '@/src/types/finding';
import { BUILTIN_FINDING_TYPES } from '@/src/core/findings/taxonomy';
import {
  centroid,
  lateralityFromPoints,
} from '@/src/core/findings/measurements';

export const KEY_IMAGE_DIR = 'findings';

const keyImagePath = (id: FindingID) => `${KEY_IMAGE_DIR}/${id}.png`;

// The dataset references this store keeps clean through its onImageDeleted
// cascade, declared for the dev-only save backstop.
declareManifestRefs('findings', (manifest) => {
  const section = isRecord(manifest.findings) ? manifest.findings : {};
  if (!Array.isArray(section.findings)) return [];
  return section.findings.flatMap((entry, index) =>
    isRecord(entry) && typeof entry.imageID === 'string'
      ? [
          {
            kind: 'dataset' as const,
            id: entry.imageID,
            where: `findings.findings[${index}].imageID`,
          },
        ]
      : []
  );
});

const blobToDataURL = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

const dataURLToBase64 = (dataURL: string) => dataURL.split(',')[1] ?? '';

/** Two taxonomy entries a user would read as the same type. */
const sameFindingType = (a: FindingType, b: FindingType) =>
  a.label === b.label &&
  a.defaultBodySite === b.defaultBodySite &&
  a.categoryScale === b.categoryScale;

export type NewFinding = Partial<Omit<Finding, 'id' | 'createdAt'>> &
  Pick<Finding, 'imageID'>;

export const useFindingsStore = defineStore('findings', () => {
  const findingIDs = ref<FindingID[]>([]);
  const findingByID = ref<Record<FindingID, Finding>>(Object.create(null));
  const findingTypes = ref<FindingType[]>([...BUILTIN_FINDING_TYPES]);
  /** The report-level impression. One per session, as a report has one. */
  const impression = ref('');

  const findings = computed(() =>
    findingIDs.value.map((id) => findingByID.value[id])
  );

  const findingsForImage = (imageID: string | null | undefined) =>
    findings.value.filter((finding) => finding.imageID === imageID);

  function getToolPoints(measurement: FindingMeasurement): Vector3[] {
    const store = useAnnotationToolStore(measurement.toolType);
    if (!(measurement.toolID in store.toolByID)) return [];
    return store.getPoints(measurement.toolID);
  }

  /**
   * The measurements whose annotation still exists. Deleting an annotation
   * only unlinks it from its finding, and nothing walks the findings on the
   * way, so dead links are filtered where they are read.
   */
  const liveMeasurements = (finding: Finding) =>
    finding.measurements.filter(
      (measurement) =>
        measurement.toolID in
        useAnnotationToolStore(measurement.toolType).toolByID
    );

  function addFinding(patch: NewFinding): FindingID {
    const id = useIdStore().nextId() as FindingID;
    const measurements = patch.measurements ?? [];
    const points = measurements.flatMap(getToolPoints);
    findingByID.value[id] = {
      title: '',
      typeID: '',
      bodySite: '',
      laterality: points.length > 0 ? lateralityFromPoints(points) : 'unknown',
      category: '',
      description: '',
      measurements: [],
      slice: 0,
      frameOfReference: { planeOrigin: [0, 0, 0], planeNormal: [0, 0, 1] },
      ...patch,
      id,
      createdAt: new Date().toISOString(),
    };
    findingIDs.value.push(id);
    return id;
  }

  function updateFinding(id: FindingID, patch: Partial<Omit<Finding, 'id'>>) {
    if (!(id in findingByID.value)) return;
    findingByID.value[id] = { ...findingByID.value[id], ...patch, id };
  }

  function removeFinding(id: FindingID) {
    if (!(id in findingByID.value)) return;
    removeFromArray(findingIDs.value, id);
    delete findingByID.value[id];
  }

  /**
   * Moves a finding next to a sibling in the report order. The panel lists one
   * image at a time, so an offset in the global order would step over findings
   * the user cannot see.
   */
  function moveFindingRelative(
    id: FindingID,
    siblingID: FindingID,
    placement: 'before' | 'after'
  ) {
    const from = findingIDs.value.indexOf(id);
    if (from === -1 || id === siblingID) return;
    const [moved] = findingIDs.value.splice(from, 1);
    const siblingIndex = findingIDs.value.indexOf(siblingID);
    if (siblingIndex === -1) {
      findingIDs.value.splice(from, 0, moved);
      return;
    }
    findingIDs.value.splice(
      placement === 'before' ? siblingIndex : siblingIndex + 1,
      0,
      moved
    );
  }

  function attachMeasurement(id: FindingID, measurement: FindingMeasurement) {
    const finding = findingByID.value[id];
    if (!finding) return;
    if (finding.measurements.some((m) => m.toolID === measurement.toolID))
      return;
    updateFinding(id, { measurements: [...finding.measurements, measurement] });
  }

  function detachMeasurement(id: FindingID, toolID: ToolID) {
    const finding = findingByID.value[id];
    if (!finding) return;
    updateFinding(id, {
      measurements: finding.measurements.filter((m) => m.toolID !== toolID),
    });
  }

  const findingForTool = (toolID: ToolID) =>
    findings.value.find((finding) =>
      finding.measurements.some((m) => m.toolID === toolID)
    );

  /**
   * Wraps an existing measurement in a new finding, carrying over everything
   * the annotation already knows: its label, slice, plane and laterality.
   */
  function promoteMeasurement(
    toolType: AnnotationToolType,
    toolID: ToolID
  ): FindingID | null {
    const store = useAnnotationToolStore(toolType);
    const tool = store.toolByID[toolID];
    if (!tool) return null;
    const points = store.getPoints(toolID);
    return addFinding({
      imageID: tool.imageID,
      title: tool.labelName || `${toolType} finding`,
      measurements: [{ toolType, toolID }],
      slice: tool.slice,
      frameOfReference: tool.frameOfReference,
      ...(tool.frame != null ? { frame: tool.frame } : {}),
      laterality: lateralityFromPoints(points),
    });
  }

  /** Navigates every 2D view to the finding's slice. */
  function jumpToFinding(id: FindingID) {
    const finding = findingByID.value[id];
    if (!finding) return;
    applyLocator(finding.imageID, {
      id: id as unknown as ToolID,
      imageID: finding.imageID,
      slice: finding.slice,
      frameOfReference: finding.frameOfReference,
      frame: finding.frame,
      color: '',
      name: 'finding',
    });
  }

  function setKeyImage(id: FindingID, keyImage: FindingKeyImage | undefined) {
    updateFinding(id, { keyImage });
  }

  const measurementPoints = (finding: Finding) =>
    finding.measurements.flatMap(getToolPoints);

  const measurementCentroid = (finding: Finding) =>
    centroid(measurementPoints(finding));

  // --- taxonomy --- //

  function upsertFindingType(type: FindingType) {
    const index = findingTypes.value.findIndex((t) => t.id === type.id);
    if (index === -1) findingTypes.value.push(type);
    else findingTypes.value[index] = { ...findingTypes.value[index], ...type };
  }

  function addFindingType(type: Omit<FindingType, 'id' | 'builtin'>) {
    const idStore = useIdStore();
    // A restored session re-seats saved type ids without advancing the id
    // store, so the next minted id can collide with one of them.
    let id = `custom-${idStore.nextId()}`;
    while (findingTypes.value.some((existing) => existing.id === id)) {
      id = `custom-${idStore.nextId()}`;
    }
    findingTypes.value.push({ ...type, id });
    return id;
  }

  function removeFindingType(id: string) {
    const type = findingTypes.value.find((t) => t.id === id);
    if (!type || type.builtin) return;
    findingTypes.value = findingTypes.value.filter((t) => t.id !== id);
  }

  const findingTypeByID = computed(() =>
    Object.fromEntries(findingTypes.value.map((type) => [type.id, type]))
  );

  // Findings are bound to an image just like annotations are, so they follow
  // the same delete cascade — an orphaned imageID must never reach a save.
  onImageDeleted((deletedIDs) => {
    const deleted = new Set(deletedIDs);
    findingIDs.value
      .filter((id) => deleted.has(findingByID.value[id].imageID))
      .forEach((id) => removeFinding(id));
  });

  // --- serialization --- //

  function serialize(state: StateFile) {
    const { zip, manifest } = state;
    // Built-ins come from code, so only user edits need to travel.
    const types = findingTypes.value.filter((type) => !type.builtin);
    // The root stays additive: a session that never used the feature saves the
    // manifest it would have saved before findings existed.
    if (
      findingIDs.value.length === 0 &&
      types.length === 0 &&
      !impression.value
    )
      return;
    manifest.findings = {
      impression: impression.value,
      types,
      findings: findingIDs.value.map((id) => {
        const { keyImage, ...finding } = findingByID.value[id];
        // A link to a deleted annotation is not worth saving.
        finding.measurements = liveMeasurements(findingByID.value[id]);
        if (!keyImage) return finding;
        const path = keyImagePath(id);
        zip.file(path, dataURLToBase64(keyImage.dataURL), { base64: true });
        return {
          ...finding,
          keyImage: {
            path,
            viewName: keyImage.viewName,
            slice: keyImage.slice,
            capturedAt: keyImage.capturedAt,
          },
        };
      }),
    };
  }

  /**
   * @param dataIDMap saved dataset id -> restored image id
   * @param toolIDMap saved annotation id -> restored annotation id
   * @returns the findings whose key image was not in the archive, so the
   *   restore notice can say so rather than losing them silently.
   */
  async function deserialize(
    manifest: Manifest,
    dataIDMap: Record<string, string>,
    toolIDMap: Record<string, ToolID>,
    stateFiles: FileEntry[]
  ) {
    const missingKeyImages: string[] = [];
    const section = manifest.findings;
    if (!section) return { missingKeyImages };

    impression.value = section.impression ?? '';

    // A saved custom type id comes from the counter of the session that wrote
    // it, so it can name a different type this session already minted.
    // Re-seat those under a fresh id and re-point the restored findings, the
    // same way annotations are remapped.
    const typeIDMap: Record<string, string> = {};
    (section.types ?? []).forEach((type) => {
      const clash = findingTypes.value.find(
        (existing) => existing.id === type.id
      );
      if (clash && !sameFindingType(clash, type)) {
        typeIDMap[type.id] = addFindingType({
          label: type.label,
          modalities: type.modalities,
          defaultBodySite: type.defaultBodySite,
          categoryScale: type.categoryScale,
        });
        return;
      }
      upsertFindingType(type);
    });

    const fileByPath = new Map(
      stateFiles.map((entry) => [entry.archivePath, entry.file])
    );

    for (const saved of section.findings ?? []) {
      const imageID = dataIDMap[saved.imageID];
      // A finding whose image did not restore has nothing to point at; the
      // restore warning for the missing dataset already covers it.
      if (!imageID) continue;

      let keyImage: FindingKeyImage | undefined;
      if (saved.keyImage) {
        const file = fileByPath.get(saved.keyImage.path);
        if (file) {
          keyImage = {
            // Archive members carry no MIME type, and the data URL of a
            // typeless blob is not a usable <img> source in the exported report.
            dataURL: await blobToDataURL(file.slice(0, file.size, 'image/png')),
            viewName: saved.keyImage.viewName,
            slice: saved.keyImage.slice,
            capturedAt: saved.keyImage.capturedAt,
          };
        } else {
          // A JSON-only manifest carries no archive members at all.
          missingKeyImages.push(saved.title || 'Untitled finding');
        }
      }

      const id = addFinding({
        ...saved,
        imageID,
        typeID: typeIDMap[saved.typeID] ?? saved.typeID,
        // Annotations are re-added under fresh ids on restore; drop a
        // measurement whose tool did not come back rather than dangling.
        measurements: saved.measurements.flatMap((measurement) => {
          const toolID = toolIDMap[measurement.toolID];
          return toolID ? [{ toolType: measurement.toolType, toolID }] : [];
        }),
        keyImage,
      });
      // The saved timestamp is part of the record, not of this restore.
      updateFinding(id, { createdAt: saved.createdAt });
    }

    return { missingKeyImages };
  }

  return {
    findingIDs,
    findingByID,
    findings,
    findingTypes,
    findingTypeByID,
    impression,
    findingsForImage,
    findingForTool,
    addFinding,
    updateFinding,
    removeFinding,
    moveFindingRelative,
    attachMeasurement,
    detachMeasurement,
    promoteMeasurement,
    jumpToFinding,
    setKeyImage,
    measurementCentroid,
    measurementPoints,
    liveMeasurements,
    getToolPoints,
    addFindingType,
    upsertFindingType,
    removeFindingType,
    serialize,
    deserialize,
  };
});
