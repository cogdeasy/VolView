# Philips Volume Viewer

![A screenshot of a sample Volume Viewer session](./docs/assets/VolView-Overview.jpg)

## Introduction

Philips Volume Viewer is a radiological viewer developed for clinical professionals. With Volume Viewer, you can have a deeper visual understanding of your data through interactive, cinematic volume rendering and easily visualize your DICOM data in 3D. Since Volume Viewer runs in your browser, you don’t need to install software and your data stays securely on your machine.

Major features of Volume Viewer include:

1. Drag-and-drop DICOM: Drag DICOM images onto Volume Viewer, and they will be quickly parsed and presented as thumbnails. Click on a thumbnail, and the data is quickly loaded and presented as 2D slices and a 3D cinematic volume rendering.

2. Cinematic Volume Rendering: Create beautiful renderings and gain new insights into your data with only a few clicks. Volume Viewer provides three cinematic volume rendering modes and intuitive controls for each. We've also provides simple ways to control lighting and multiple presets to get you started.

3. Annotations and measures: We have provided a small set of tools for painting, measuring, and cropping, and that toolset will be rapidly expanding. If you have suggestions for new tools or for improving Volume Viewer in general, please leave feedback at our [Issue Tracker](https://github.com/cogdeasy/VolView/issues).

4. Simple, Scalable, and Secure: Simply visit a website to install Volume Viewer. Once it is running, all data handling, processing, and visualization occurs on your machine. Data you load into Volume Viewer never leaves your machine. And Volume Viewer is designed to run on any web browser: from the one on your phone to the one running on your most powerful workstations. It will take advantage of local GPU resources to accelerate its rendering processes, but if none is available, it will still generate the same high quality renderings, albeit a bit slower.

5. A foundation for the future: Volume Viewer serves as a foundation for future Philips imaging products, supporting client-server workflows and streamlined, task-specific interfaces.

## Documentation

Visit: https://cogdeasy.github.io/VolView to read the documentation.

# Branding

All user-visible product naming, links, and brand colors are defined in a single
module, [`src/branding.ts`](src/branding.ts). Editing that file (plus the logo
components in `src/components/icons/` and the favicons in `public/`) re-skins the
whole application.

# Origins and Citation

Philips Volume Viewer is derived from [VolView](https://github.com/Kitware/VolView), the open-source radiological viewer developed by Kitware, Inc. The cinematic rendering technique it uses is described in:

[Jiayi Xu, Gaspard Thevenon, Timothee Chabat, Matthew McCormick, Forrest Li,Tom Birdsong,Ken Martin, Yueh Lee, and Stephen Aylward, "Interactive, in-browser cinematic volume rendering of medical images", MICCAI 2022 AE-CAI Workshop, Singapore, Sept 19, 2022, Journal version accepted for publication in Computer Methods in Computer Methods in Biomechanics and Biomedical Engineering](https://workshops.ap-lab.ca/aecai2022/wp-content/uploads/sites/10/2022/09/Paper48_IICVR_camera_ready_paper.pdf):

To include a reference to the source code of VolView 4.0, please use this DOI:
[![DOI](https://zenodo.org/badge/248073292.svg)](https://zenodo.org/badge/latestdoi/248073292)

# Customizing Volume Viewer

See the [Contributing.md](CONTRIBUTING.md) document.

# Acknowledgements

The upstream VolView project was funded, in part, by the NIH via NIBIB and NIGMS R01EB021396, NIBIB R01EB014955, NCI R01CA220681, and NINDS R42NS086295.
