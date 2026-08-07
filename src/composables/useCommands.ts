import { computed } from 'vue';
import { useTheme } from 'vuetify';

import {
  ACTIONS,
  Action,
  ActionGroup,
  DarkTheme,
  LightTheme,
  ThemeStorageKey,
  WLPresetsCT,
} from '@/src/constants';
import { SAMPLE_DATA } from '@/src/config';
import { ACTION_TO_FUNC } from '@/src/composables/actions';
import { actionToKey } from '@/src/composables/useKeyboardShortcuts';
import { useCurrentImage } from '@/src/composables/useCurrentImage';
import { loadSample } from '@/src/actions/loadSampleData';
import { loadUserPromptedFiles } from '@/src/actions/loadUserFiles';
import { useDialogStore } from '@/src/store/dialogs';
import { useKeyboardShortcutsStore } from '@/src/store/keyboard-shortcuts';
import { useAnnouncementStore } from '@/src/store/announcements';
import { useViewStore } from '@/src/store/views';
import { useWindowingStore } from '@/src/store/view-configs/windowing';
import { getEntries } from '@/src/utils';

export interface Command {
  id: string;
  title: string;
  group: ActionGroup;
  /** Extra search terms; never displayed. */
  keywords?: string;
  icon?: string;
  /** Set when the command is also a bindable keyboard action. */
  action?: Action;
  disabled?: boolean;
  run: () => void;
}

const GROUP_ICONS: Record<ActionGroup, string> = {
  navigation: 'mdi-arrow-up-down',
  windowing: 'mdi-circle-half-full',
  tools: 'mdi-ruler',
  layout: 'mdi-view-dashboard',
  data: 'mdi-folder-open',
  app: 'mdi-application-cog',
};

/**
 * Every user-facing command in the app, in one list.
 *
 * Commands that are bound to a key carry their `action`, so the palette shows
 * the shortcut and the shortcut editor stays the only place a key is declared.
 */
export function useCommands() {
  const dialogStore = useDialogStore();
  const keyboardStore = useKeyboardShortcutsStore();
  const viewStore = useViewStore();
  const windowingStore = useWindowingStore();
  const announcements = useAnnouncementStore();
  const theme = useTheme();
  const { currentImageID } = useCurrentImage();

  const actionCommands = computed<Command[]>(() =>
    getEntries(ACTIONS)
      // Hold-to-modify keys are not runnable commands.
      .filter(([, info]) => !('hold' in info && info.hold))
      .map(([action, info]) => ({
        id: `action.${action}`,
        title: info.readable,
        group: info.group,
        keywords: 'keywords' in info ? info.keywords : undefined,
        icon: GROUP_ICONS[info.group],
        action,
        run: ACTION_TO_FUNC[action],
      }))
  );

  const layoutCommands = computed<Command[]>(() =>
    Object.keys(viewStore.namedLayouts).map((name) => ({
      id: `layout.${name}`,
      title: `Layout: ${name}`,
      group: 'layout',
      keywords: 'hanging protocol views grid',
      icon: 'mdi-view-dashboard-outline',
      run: () => {
        viewStore.switchToNamedLayout(name);
        announcements.announce(`Layout ${name}`);
      },
    }))
  );

  const viewTypeCommands = computed<Command[]>(() =>
    viewStore.availableViewsForSwitcher.map((view) => ({
      id: `viewType.${view.name}`,
      title: `Show ${view.name} in the active view`,
      group: 'layout',
      keywords: 'orientation plane axial coronal sagittal oblique volume',
      icon: 'mdi-axis-arrow',
      disabled: !viewStore.activeView,
      run: () => {
        if (!viewStore.activeView) return;
        viewStore.replaceView(viewStore.activeView, {
          ...view,
          dataID: currentImageID.value,
        });
        announcements.announce(`Active view showing ${view.name}`);
      },
    }))
  );

  const windowPresetCommands = computed<Command[]>(() =>
    Object.entries(WLPresetsCT).map(([name, preset]) => ({
      id: `windowPreset.${name}`,
      title: `Window preset: ${name} (W ${preset.width} / L ${preset.level})`,
      group: 'windowing',
      keywords: 'contrast brightness ct hounsfield',
      icon: 'mdi-circle-half-full',
      disabled: !currentImageID.value || !viewStore.activeView,
      run: () => {
        const viewID = viewStore.activeView;
        const imageID = currentImageID.value;
        if (!viewID || !imageID) return;
        windowingStore.updateConfig(viewID, imageID, { ...preset }, true);
        announcements.announce(`Window preset ${name}`);
      },
    }))
  );

  const sampleCommands = computed<Command[]>(() =>
    SAMPLE_DATA.map((sample) => ({
      id: `sample.${sample.name}`,
      title: `Load sample data: ${sample.name}`,
      group: 'data',
      keywords: 'open study dataset demo dicom',
      icon: 'mdi-database-import',
      run: () => {
        loadSample(sample).catch(() => {
          // errors surface through the message store
        });
      },
    }))
  );

  const dataCommands = computed<Command[]>(() => [
    {
      id: 'data.openFiles',
      title: 'Open files…',
      group: 'data',
      keywords: 'load import dicom browse',
      icon: 'mdi-folder-open',
      run: () => loadUserPromptedFiles(),
    },
  ]);

  const appCommands = computed<Command[]>(() => [
    {
      id: 'app.settings',
      title: 'Open settings',
      group: 'app',
      keywords: 'preferences options configuration',
      icon: 'mdi-cog',
      run: () => {
        dialogStore.settingsOpen = true;
      },
    },
    {
      id: 'app.shortcutEditor',
      title: 'Customize keyboard shortcuts',
      group: 'app',
      keywords: 'keys bindings remap edit',
      icon: 'mdi-keyboard-settings-outline',
      run: () => keyboardStore.openEditor(),
    },
    {
      id: 'app.notifications',
      title: 'Open notifications',
      group: 'app',
      keywords: 'messages errors warnings log',
      icon: 'mdi-bell-outline',
      run: () => {
        dialogStore.notificationsOpen = true;
      },
    },
    {
      id: 'app.about',
      title: 'About this application',
      group: 'app',
      keywords: 'version help credits philips',
      icon: 'mdi-information-outline',
      run: () => {
        dialogStore.aboutOpen = true;
      },
    },
    {
      id: 'app.themeDark',
      title: 'Switch to dark theme',
      group: 'app',
      keywords: 'appearance night reading room',
      icon: 'mdi-weather-night',
      disabled: theme.global.name.value === DarkTheme,
      run: () => setTheme(DarkTheme),
    },
    {
      id: 'app.themeLight',
      title: 'Switch to light theme',
      group: 'app',
      keywords: 'appearance day bright',
      icon: 'mdi-white-balance-sunny',
      disabled: theme.global.name.value === LightTheme,
      run: () => setTheme(LightTheme),
    },
  ]);

  function setTheme(name: string) {
    theme.global.name.value = name;
    localStorage.setItem(ThemeStorageKey, name);
    announcements.announce(
      `${name === DarkTheme ? 'Dark' : 'Light'} theme enabled`
    );
  }

  const commands = computed<Command[]>(() => [
    ...actionCommands.value,
    ...layoutCommands.value,
    ...viewTypeCommands.value,
    ...windowPresetCommands.value,
    ...sampleCommands.value,
    ...dataCommands.value,
    ...appCommands.value,
  ]);

  const shortcutForCommand = (command: Command) =>
    command.action ? actionToKey.value[command.action] : undefined;

  return { commands, shortcutForCommand };
}
