<script setup lang="ts">
/* global __VERSIONS__ */

import { useDisplay } from 'vuetify';
import GskFullLogo from '@/src/components/icons/GskFullLogo.vue';
import { Brand, copyright } from '@/src/branding';
import { useKeyboardShortcutsStore } from '@/src/store/keyboard-shortcuts';

const display = useDisplay();
const mobile = display.xs;

const keyboardStore = useKeyboardShortcutsStore();
const openKeyboardShortcuts = () => {
  keyboardStore.settingsOpen = true;
};

const versions = {
  app: __VERSIONS__.app,
  'vtk.js': __VERSIONS__['vtk.js'],
  'itk-wasm': __VERSIONS__['itk-wasm'],
};
</script>

<template>
  <v-card>
    <v-card-title class="d-flex flex-row justify-center">
      <gsk-full-logo />
    </v-card-title>
    <v-alert color="secondary" variant="tonal" class="notice">
      For investigational use only
    </v-alert>
    <v-card-text>
      <v-btn
        class="my-2"
        @click="openKeyboardShortcuts"
        prepend-icon="mdi-keyboard"
        color="secondary"
      >
        Keyboard Shortcuts and View Controls
      </v-btn>
      <h2 class="mt-2">About {{ Brand.productName }}</h2>
      <v-divider class="mb-2" />
      <p class="float-right">
        <v-img
          v-show="!mobile"
          src="../assets/HeadAndNeckRendering.jpg"
          alt="Head and neck CT rendering"
          width="200px"
          class="ma-1"
          align="center"
        /><br />
      </p>
      <p>
        <a
          rel="noopener noreferrer"
          target="_blank"
          :href="Brand.urls.healthcare"
        >
          <span>{{ Brand.productName }}</span>
        </a>
        is a web application from
        <a rel="noopener noreferrer" target="_blank" :href="Brand.urls.company">
          <span>{{ Brand.company }}</span>
        </a>
        for visualizing and annotating medical images. Its key features include:
      </p>

      <ul>
        <li>Fast: Drag-and-drop DICOM files for quick viewing</li>
        <li>
          Flexible: Designed to be easily integrated into existing systems
        </li>
        <li>
          Beautiful: Cinematic volume rendering to generate high-quality 3D
          visualizations
        </li>
        <li>
          Friendly: Familiar radiological image visualization and annotation
          tools
        </li>
        <li>
          Secure: Your data stays on your machine. No cloud services or data
          servers are used.
        </li>
      </ul>
      <br />
      {{ Brand.productName }} is built on a variety of open-source toolkits,
      such as
      <a
        rel="noopener noreferrer"
        target="_blank"
        href="https://github.com/InsightSoftwareConsortium/itk-wasm/"
      >
        <span>itk-wasm</span>
      </a>
      for DICOM I/O and image processing, and
      <a
        rel="noopener noreferrer"
        target="_blank"
        href="https://github.com/Kitware/vtk-js"
      >
        <span>vtk.js</span>
      </a>
      for in-browser scientific visualization. It derives from the open-source
      <a
        rel="noopener noreferrer"
        target="_blank"
        href="https://github.com/Kitware/VolView"
      >
        <span>VolView</span>
      </a>
      project by Kitware, Inc.
      <h2 class="mt-2">Useful Links</h2>
      <v-divider class="mb-2" />
      <ul>
        <li>
          <span>Documentation: </span>
          <a
            rel="noopener noreferrer"
            target="_blank"
            :href="Brand.urls.documentation"
          >
            {{ Brand.urls.documentation }}
          </a>
        </li>
        <li>
          <span>Source code repository: </span>
          <a
            rel="noopener noreferrer"
            target="_blank"
            :href="Brand.urls.sourceCode"
          >
            {{ Brand.urls.sourceCode }}
          </a>
        </li>
        <li>
          <span>File a bug report or feature request: </span>
          <a
            rel="noopener noreferrer"
            target="_blank"
            :href="Brand.urls.issues"
          >
            {{ Brand.urls.issues }}
          </a>
        </li>
        <li>
          <span>{{ Brand.company }} R&amp;D: </span>
          <a
            rel="noopener noreferrer"
            target="_blank"
            :href="Brand.urls.healthcare"
          >
            {{ Brand.urls.healthcare }}
          </a>
        </li>
      </ul>
      <h2>Version Info</h2>
      <v-divider class="mb-2" />
      <ul>
        <li>
          <div class="d-flex flex-flow align-center text-no-wrap">
            <span>{{ Brand.productShortName }}: </span>
            <v-badge inline :content="versions.app" />
          </div>
        </li>
        <li>
          <div class="d-flex flex-flow align-center text-no-wrap">
            <span>vtk.js: </span>
            <v-badge inline :content="versions['vtk.js']" />
          </div>
        </li>
        <li>
          <div class="d-flex flex-flow align-center text-no-wrap">
            <span>itk-wasm: </span>
            <v-badge inline :content="versions['itk-wasm']" />
          </div>
        </li>
      </ul>
      <h2 class="mt-2">Acknowledgments</h2>
      <v-divider class="mb-2" />
      {{ Brand.productName }} builds on VolView, whose development was funded,
      in part, by the NIH via NIBIB and NIGMS R01EB021396, NIBIB R01EB014955,
      NCI R01CA220681, and NINDS R42NS086295
      <br />
      <br />
      Sample data provided by the following sources:
      <ul>
        <li>
          PROSTATEx Challenge Data: Geert Litjens, Oscar Debats, Jelle Barentsz,
          Nico Karssemeijer, and Henkjan Huisman. "ProstateX Challenge data",
          The Cancer Imaging Archive (2017). DOI: 10.7937/K9TCIA.2017.MURS5CL
          (<a
            rel="noopener noreferrer"
            target="_blank"
            href="https://wiki.cancerimagingarchive.net/pages/viewpage.action?pageId=23691656"
            >TCIA</a
          >)
        </li>
        <li>
          MRA Head and Neck: Test case 98890234 from the "Patient Contributed
          Image Repository" (<a
            rel="noopener noreferrer"
            target="_blank"
            href="http://www.pcir.org/researchers/98890234_20030505_MR.html"
            >PCIR.org</a
          >)
        </li>
        <li>
          3D ultrasound of a fetus: Sample data from
          <a
            rel="noopener noreferrer"
            target="_blank"
            href="http://tomovision.com"
            >tomovision.com</a
          >
        </li>
      </ul>
      <p class="mt-4 text-caption">{{ copyright() }}</p>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.notice {
  width: fit-content;
  margin: 0 auto;
  text-transform: uppercase;
}
</style>
