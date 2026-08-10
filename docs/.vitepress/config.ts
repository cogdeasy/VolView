import { defineConfig } from 'vitepress';

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: 'Philips Volume Viewer',
  base: '/VolView',
  description:
    'Radiological viewer that runs in your web browser and provides photo-realistic, interactive, 3D visualizations.',

  ignoreDeadLinks: 'localhostLinks',

  head: [['link', { rel: 'icon', href: '/favicon.ico' }]],

  themeConfig: {
    logo: './logo.svg',
    nav: [
      {
        text: 'Philips Healthcare',
        link: 'https://www.philips.com/healthcare',
      },
    ],

    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'What is Volume Viewer?', link: '/' },
          { text: 'Quick Start Guide', link: '/quick_start_guide' },
          { text: 'Screenshots', link: '/gallery' },
        ],
      },
      {
        text: 'Features &amp; Operation',
        items: [
          { text: 'Welcome Screen', link: '/welcome_screen' },
          { text: 'Loading Data', link: '/loading_data' },
          { text: 'Toolbar', link: '/toolbar' },
          { text: 'Mouse/Keyboard Controls', link: '/mouse_controls' },
          { text: 'Cinematic Rendering', link: '/rendering' },
          { text: 'State Files', link: '/state_files' },
          { text: 'Remote Server Capabilities', link: '/server' },
          { text: 'Configuration File', link: '/configuration_file' },
        ],
      },
      {
        text: 'Deployment',
        items: [
          { text: 'Overview', link: '/deployment_overview' },
          { text: 'Building for Production', link: '/building_for_production' },
          { text: 'Deploying Volume Viewer', link: '/deploying_volview' },
          { text: 'Authentication & Authorization', link: '/authentication' },
          { text: 'Cross Origin Resource Sharing (CORS)', link: '/cors' },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/cogdeasy/VolView' },
    ],

    footer: {
      copyright:
        'Copyright © <strong>Koninklijke Philips N.V.</strong> Derived from VolView by Kitware, Inc.',
    },
  },
});
