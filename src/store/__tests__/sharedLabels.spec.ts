import { describe, it, beforeEach, expect } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { nextTick } from 'vue';

import { useRulerStore } from '@/src/store/tools/rulers';
import { useRectangleStore } from '@/src/store/tools/rectangles';
import { usePolygonStore } from '@/src/store/tools/polygons';
import { applyPostStateConfig } from '@/src/io/import/configJson';

const nameOf = (labels: Record<string, { labelName?: string }>) =>
  Object.values(labels).map((label) => label.labelName);

describe('labels shared across annotation tools', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('starts with one shared default label, not one per tool', () => {
    expect(nameOf(useRulerStore().labels)).toEqual(['Label 1']);
    expect(Object.keys(useRectangleStore().labels)).toEqual(
      Object.keys(useRulerStore().labels)
    );
    expect(Object.keys(usePolygonStore().labels)).toEqual(
      Object.keys(useRulerStore().labels)
    );
  });

  it('shows a label added with one tool in the other tools', () => {
    const id = useRulerStore().addLabel({ labelName: 'tumour' });

    expect(useRectangleStore().labels[id]).toMatchObject({
      labelName: 'tumour',
    });
    expect(usePolygonStore().labels[id]).toMatchObject({
      labelName: 'tumour',
    });
  });

  it('fills in a tool controlled prop the sharing tool never set', () => {
    const id = useRulerStore().addLabel({ labelName: 'tumour' });

    // fillColor is a rectangle-only prop, so the ruler-created label has none;
    // it is not in the store's declared label type either, hence the cast.
    const label = useRectangleStore().labels[id] as Record<string, unknown>;
    expect(label.fillColor).toBe('transparent');
  });

  it('propagates a rename and a recolor to the other tools', () => {
    const rulers = useRulerStore();
    const id = rulers.addLabel({ labelName: 'tumour' });

    useRectangleStore().updateLabel(id, {
      labelName: 'lesion',
      color: '#123456',
    });

    expect(rulers.labels[id]).toMatchObject({
      labelName: 'lesion',
      color: '#123456',
    });
    expect(usePolygonStore().labels[id]).toMatchObject({
      labelName: 'lesion',
      color: '#123456',
    });
  });

  it('propagates a delete and moves the other tools off the dead label', async () => {
    const rulers = useRulerStore();
    const polygons = usePolygonStore();
    const id = rulers.addLabel({ labelName: 'tumour' });
    polygons.setActiveLabel(id);

    useRectangleStore().deleteLabel(id);
    await nextTick();

    expect(rulers.labels).not.toHaveProperty(id);
    expect(polygons.labels).not.toHaveProperty(id);
    expect(polygons.activeLabel).not.toBe(id);
    expect(polygons.labels).toHaveProperty(polygons.activeLabel!);
  });

  it('cycles colors from one cursor, so tools do not repeat each other', () => {
    const first = useRulerStore().addLabel({ labelName: 'a' });
    const second = useRectangleStore().addLabel({ labelName: 'b' });
    const third = usePolygonStore().addLabel({ labelName: 'c' });

    const labels = useRulerStore().labels;
    const colors = [first, second, third].map((id) => labels[id].color);
    expect(new Set(colors).size).toBe(3);
  });

  it('keeps a config tool-specific label set out of the shared registry', () => {
    applyPostStateConfig({
      labels: {
        defaultLabels: { shared: { color: '#ffffff' } },
        rulerLabels: { rulerOnly: { color: '#ff0000' } },
      },
    });

    expect(nameOf(useRulerStore().labels)).toEqual(['rulerOnly']);
    expect(nameOf(useRectangleStore().labels)).toEqual(['shared']);
    expect(nameOf(usePolygonStore().labels)).toEqual(['shared']);

    // A label added with a tool that fell back to defaultLabels stays out of
    // the tool that was given its own set.
    const id = useRectangleStore().addLabel({ labelName: 'added' });
    expect(usePolygonStore().labels).toHaveProperty(id);
    expect(useRulerStore().labels).not.toHaveProperty(id);
  });

  it('restores a session that saved the same label name under each tool as one label', () => {
    const savedLabels = (id: string) => ({
      [id]: { labelName: 'tumour', color: 'green', strokeWidth: 2 },
    });
    const manifest = {
      tools: {
        rulers: {
          labels: savedLabels('ruler-label-1'),
          tools: [
            {
              imageID: 'saved-image',
              label: 'ruler-label-1',
              firstPoint: [0, 0, 0],
              secondPoint: [1, 1, 1],
              frameOfReference: {
                planeNormal: [0, 0, 1],
                planeOrigin: [0, 0, 0],
              },
              slice: 0,
              placing: false,
            },
          ],
        },
        rectangles: {
          labels: savedLabels('rectangle-label-1'),
          tools: [
            {
              imageID: 'saved-image',
              label: 'rectangle-label-1',
              firstPoint: [0, 0, 0],
              secondPoint: [1, 1, 1],
              frameOfReference: {
                planeNormal: [0, 0, 1],
                planeOrigin: [0, 0, 0],
              },
              slice: 0,
              placing: false,
            },
          ],
        },
      },
    } as any;
    const dataIDMap = { 'saved-image': 'image-1' };

    const rulers = useRulerStore();
    const rectangles = useRectangleStore();
    rulers.deserialize(manifest, dataIDMap);
    rectangles.deserialize(manifest, dataIDMap);

    expect(nameOf(rulers.labels)).toEqual(['tumour']);
    const [labelID] = Object.keys(rulers.labels);
    expect(rulers.tools[0].label).toBe(labelID);
    expect(rectangles.tools[0].label).toBe(labelID);
    expect(rulers.tools[0].color).toBe('green');
  });
});
