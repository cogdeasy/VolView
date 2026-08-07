<script setup lang="ts">
import { VtkRenderWindowParentContext } from '@/src/components/vtk/context';
import { useRendererHealthMonitor } from '@/src/composables/useRendererHealthMonitor';
import vtkRenderWindow from '@kitware/vtk.js/Rendering/Core/RenderWindow';
import vtkOpenGLRenderWindow from '@kitware/vtk.js/Rendering/OpenGL/RenderWindow';
import { releaseWebGLContext } from '@/src/utils/webglInfo';
import { effectScope, onScopeDispose, onUnmounted, provide } from 'vue';

const scope = effectScope(true);

const api = scope.run(() => {
  const renderWindow = vtkRenderWindow.newInstance();
  const rwView = renderWindow.newAPISpecificView('WebGL');
  renderWindow.addView(rwView);
  rwView.initialize();

  const parentApi = {
    renderWindow,
    renderWindowView: rwView as vtkOpenGLRenderWindow,
  };

  // Every view blits from this one WebGL context, so its health is monitored
  // here rather than per view.
  useRendererHealthMonitor(parentApi);

  // Registered after the monitor so its listeners are gone before the context
  // is dropped. Matters when the tree is rebuilt for renderer recovery.
  onScopeDispose(() => {
    releaseWebGLContext(rwView.getCanvas());
    rwView.delete();
    renderWindow.delete();
  });

  return parentApi;
})!;

onUnmounted(() => {
  scope.stop();
});

provide(VtkRenderWindowParentContext, api);
</script>

<template><slot /></template>
