import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import AnnotationTextSVG2D from '@/src/components/tools/AnnotationTextSVG2D.vue';
import { useAnnotationDisplayStore } from '@/src/store/tools/annotationDisplay';

const mountText = (props: Record<string, unknown>) =>
  mount(AnnotationTextSVG2D, {
    props: { x: 10, y: 20, lines: ['Tumor', '12.00 mm'], ...props },
  });

describe('AnnotationTextSVG2D', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useAnnotationDisplayStore().overlayTextVisible = true;
  });

  it('renders one tspan per non-empty line', () => {
    const spans = mountText({}).findAll('tspan');
    expect(spans.map((span) => span.text())).toEqual(['Tumor', '12.00 mm']);
  });

  it('drops empty lines, e.g. an unlabeled annotation', () => {
    const spans = mountText({ lines: ['', '12.00 mm'] }).findAll('tspan');
    expect(spans.map((span) => span.text())).toEqual(['12.00 mm']);
  });

  it('stacks lines upwards so the last line hugs the annotation', () => {
    const spans = mountText({ textSize: 10 }).findAll('tspan');
    expect(spans[0].attributes('dy')).toBe('-11.5');
    expect(spans[1].attributes('dy')).toBe('11.5');
  });

  it('stacks lines downwards when above is false', () => {
    const spans = mountText({ textSize: 10, above: false }).findAll('tspan');
    expect(spans[0].attributes('dy')).toBe('0');
    expect(spans[1].attributes('dy')).toBe('11.5');
  });

  it('renders nothing when the overlay text is toggled off', async () => {
    const wrapper = mountText({});
    useAnnotationDisplayStore().overlayTextVisible = false;
    await nextTick();
    expect(wrapper.find('text').exists()).toBe(false);
  });
});
