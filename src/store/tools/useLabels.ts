import { Maybe, UnwrapAll } from '@/src/types';
import { computed, ref, watch, type Ref } from 'vue';
import { defineStore, storeToRefs } from 'pinia';
import { TOOL_COLORS } from '@/src/config';
import { useIdStore } from '../id';

const labelDefault = Object.freeze({
  labelName: 'New Label' as string,
  color: TOOL_COLORS[0] as string,
});

export type Label<Props> = Partial<Props & typeof labelDefault>;
export type Labels<Props> = Record<string, Label<Props>>;

type LabelID = string;

// The mutable state behind a label picker. Annotation tools point at the shared
// set (see useSharedLabelSetStore) so a label added with one tool exists for the
// others, including a single color cursor so new labels never collide. A tool
// only gets its own set when a config JSON gives it tool-specific labels.
type LabelSet = {
  labels: Ref<Labels<any>>;
  // Flag to indicate if should clear existing labels
  defaultLabels: Ref<boolean>;
  nextColorIndex: Ref<number>;
};

const makeLabelSet = (): LabelSet => ({
  labels: ref<Labels<any>>({}),
  defaultLabels: ref(true),
  nextColorIndex: ref(0),
});

// A store (not a module-level ref) so the shared labels are scoped to the
// active pinia, like every other piece of session state.
export const useSharedLabelSetStore = defineStore('sharedLabelSet', () =>
  makeLabelSet()
);

const sharedLabelSet = (): LabelSet => storeToRefs(useSharedLabelSetStore());

// param newLabelDefault should contain all label controlled props
// of the tool so placing tool does hold any last active label props.
export const useLabels = <Props>(newLabelDefault: Props) => {
  type ToolLabel = Label<Props>;
  type ToolLabels = Labels<Props>;

  const ownLabelSet = makeLabelSet();
  const detached = ref(false);
  const labelSet = () => (detached.value ? ownLabelSet : sharedLabelSet());

  // Detach from the shared registry: this tool keeps its own label set from
  // here on. Only for config-supplied tool-specific labels.
  const useOwnLabels = () => {
    detached.value = true;
  };

  // A label from another tool does not carry this tool's controlled props
  // (a ruler label has no fillColor), so they are filled in on read.
  const labels = computed<ToolLabels>(() =>
    Object.fromEntries(
      Object.entries(labelSet().labels.value).map(([id, label]) => [
        id,
        { ...labelDefault, ...newLabelDefault, ...label } as ToolLabel,
      ])
    )
  );

  const activeLabel = ref<string | undefined>();
  // Accepts undefined so a caller that must not disturb the picker — applying a
  // job's annotations result — can put back an activeLabel that was never set.
  const setActiveLabel = (id: string | undefined) => {
    activeLabel.value = id;
  };

  // Another tool may delete the label this tool has selected.
  watch(labels, (current) => {
    const active = activeLabel.value;
    if (active === undefined || active === '' || active in current) return;
    const [first] = Object.keys(current);
    setActiveLabel(first ?? '');
  });

  const addLabel = (label: ToolLabel = {}) => {
    const set = labelSet();
    const id = useIdStore().nextId();
    set.labels.value = {
      ...set.labels.value,
      [id]: {
        ...labelDefault,
        ...newLabelDefault,
        color: TOOL_COLORS[set.nextColorIndex.value],
        ...label,
      },
    };

    set.nextColorIndex.value =
      (set.nextColorIndex.value + 1) % TOOL_COLORS.length;

    setActiveLabel(id);
    return id;
  };

  const deleteLabel = (id: LabelID) => {
    const set = labelSet();
    if (!(id in set.labels.value)) throw new Error('Label does not exist');

    const rest = { ...set.labels.value };
    delete rest[id];
    set.labels.value = rest; // new object triggers measurement list update

    // pick another active label if deleted was active
    if (id === activeLabel.value) {
      const labelIDs = Object.keys(set.labels.value);
      if (labelIDs.length !== 0) setActiveLabel(labelIDs[0]);
      else setActiveLabel('');
    }
  };

  const updateLabel = (id: LabelID, patch: ToolLabel) => {
    const set = labelSet();
    if (!(id in set.labels.value)) throw new Error('Label does not exist');

    set.labels.value = {
      ...set.labels.value,
      [id]: { ...set.labels.value[id], ...patch },
    };
  };

  const clearDefaultLabels = () => {
    const set = labelSet();
    if (set.defaultLabels.value) set.labels.value = {};
    set.defaultLabels.value = false;
  };

  const findLabel = (name: Maybe<string>) => {
    return Object.entries(labels.value).find(
      ([, { labelName }]) => name === labelName
    );
  };

  /*
   * If input label has the same name as existing label, update existing label with input label properties.
   *
   * param label: label to merge
   * param clearDefault: if true, clear initial labels, do nothing if initial labels already cleared
   */
  const mergeLabel = (label: ToolLabel) => {
    const { labelName } = label;
    const matchingName = findLabel(labelName);

    if (matchingName) {
      const [existingID] = matchingName;
      updateLabel(existingID, label);
      // A merge is as much a pick as an add: the label another tool already
      // created must become this tool's active label too.
      setActiveLabel(existingID);
      return existingID;
    }

    return addLabel(label);
  };

  /*
   * If input label has the same name as existing label, update existing label with input label properties.
   *
   * param newLabels: each key is the label name
   * param clearDefault: if true, clear initial labels, do nothing if initial labels already cleared
   */
  const mergeLabels = (newLabels: Maybe<ToolLabels>) => {
    Object.entries(newLabels ?? {}).forEach(([labelName, props]) =>
      mergeLabel({ ...props, labelName })
    );
  };

  /*
   * Seed a tool's built-in default labels.
   *
   * Tool stores are created lazily, so a store can come up after a config or a
   * restored session has already replaced the shared labels — its defaults
   * must not resurrect a label set the user never asked for.
   */
  const mergeDefaultLabels = (initialLabels: Maybe<ToolLabels>) => {
    if (labelSet().defaultLabels.value) {
      mergeLabels(initialLabels);
      return;
    }
    const [first] = Object.keys(labels.value);
    if (first) setActiveLabel(first);
  };

  return {
    labels,
    activeLabel,
    setActiveLabel,
    addLabel,
    deleteLabel,
    updateLabel,
    // Exposed for callers that need the merged label's id back — applying a
    // job's annotations result maps wire label NAMES to store label ids.
    mergeLabel,
    mergeLabels,
    mergeDefaultLabels,
    findLabel,
    clearDefaultLabels,
    useOwnLabels,
  };
};

export type LabelsStore<Tool> = UnwrapAll<ReturnType<typeof useLabels<Tool>>>;
