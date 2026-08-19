export interface LayoutMenuItem {
  /** The named layout to activate. */
  name: string;
  /** Short label shown in the menu. */
  label: string;
}

export type LayoutMenuEntry =
  | ({ kind: 'layout' } & LayoutMenuItem)
  | { kind: 'group'; label: string; items: LayoutMenuItem[] };

interface GroupSpec {
  label: string;
  /** Layout name -> label inside the submenu, in display order. */
  members: Array<[string, string]>;
}

/**
 * Groups the built-in named layouts into one level of submenus.
 *
 * Layouts that aren't part of a group (including any layout added through the
 * config file) stay as top-level entries, so every named layout remains
 * reachable.
 */
const GROUPS: GroupSpec[] = [
  {
    label: 'Single Slice View',
    members: [
      ['Axial Only', 'Axial'],
      ['Coronal Only', 'Coronal'],
      ['Sagittal Only', 'Sagittal'],
    ],
  },
  {
    label: 'Focused View',
    members: [
      ['Axial Coronal Sagittal', 'Axial'],
      ['Coronal Primary', 'Coronal'],
      ['Sagittal Primary', 'Sagittal'],
      ['3D Primary', '3D'],
    ],
  },
];

export function groupLayoutNames(names: string[]): LayoutMenuEntry[] {
  const available = new Set(names);
  const grouped = new Set<string>();

  const groups = GROUPS.map((group) => {
    const items = group.members
      .filter(([name]) => available.has(name))
      .map(([name, label]) => ({ name, label }));
    items.forEach(({ name }) => grouped.add(name));
    return { kind: 'group' as const, label: group.label, items };
  }).filter((group) => group.items.length > 0);

  const ungrouped = names
    .filter((name) => !grouped.has(name))
    .map((name) => ({ kind: 'layout' as const, name, label: name }));

  return [...groups, ...ungrouped];
}
