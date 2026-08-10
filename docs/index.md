# What is Philips Volume Viewer?

Philips Volume Viewer is a radiological viewer developed for clinical professionals. With Volume Viewer, you can gain a deeper understanding of your data through high-quality, interactive visualizations, including cinematic volume renderings. Since Volume Viewer runs in your browser, you do not need to install software, and your data stays securely on your machine.

![Welcome](./assets/VolView-Overview.jpg)

## Features

Major features of Volume Viewer include:

1. **Cinematic Volume Rendering**: Create beautiful renderings and gain new insights into your data with only a few clicks. Volume Viewer provides three cinematic volume rendering modes and intuitive controls for each. We've also provides simple ways to control lighting and multiple presets to get you started.

2. **Drag-and-Drop DICOM**: Drag DICOM images onto Volume Viewer, and they will be quickly parsed and presented as thumbnails. Click on a thumbnail, and the data is quickly loaded and presented as 2D slices and a 3D cinematic volume rendering.

3. **Annotations and Measures**: We have provided a small set of tools for painting, measuring, and cropping, and we are actively working to expand that toolset. If you have suggestions for new tools or for improving Volume Viewer in general, please leave feedback at our [Issue Tracker](https://github.com/cogdeasy/VolView/issues).

4. **Simple, Scalable, and Secure**: Simply visit a website to install Volume Viewer. Once it is running, all data handling, processing, and visualization occurs on your machine. Data you load into Volume Viewer never leaves your machine. And Volume Viewer is designed to run on any web browser: from the one on your phone to the one running on your most powerful workstations. It will take advantage of local GPU resources to accelerate its rendering processes, but if none is available, it will still generate the same high quality renderings, albeit a bit slower.

5. **Foundation for the Future**: Volume Viewer is meant to serve as a foundation for future Philips imaging products, supporting client-server workflows and streamlined, task-specific interfaces.

Volume Viewer is **not FDA approved for any purpose**. For more information, visit [Philips Healthcare](https://www.philips.com/healthcare).

## Origins

Philips Volume Viewer is derived from [VolView](https://github.com/Kitware/VolView), the open-source radiological viewer developed by Kitware, Inc.

VolView version 1.1 was released on Sept. 21, 1999 to provide clinical professionals with an intuitive interface to industry-leading volume rendering capabilities. Built using [VTK](https://vtk.org), it was extremely innovative at the time. It provided interactive volume renderings that did not require dedicated systems purchased for big-name medical device manufacturers.

VolView 4.0, released in 2022, is built using the javascript version of VTK (i.e., [vtk.js](https://kitware.github.io/vtk-js/index.html)), runs in web browsers, and provides cinematic volume rendering capabilities that are only broadly available in dedicated systems. Philips Volume Viewer continues that platform with plans to support WebXR for holographic and AR/VR devices as well as companion libraries for advanced image analysis (e.g., [itk.wasm](https://github.com/InsightSoftwareConsortium/itk-wasm)) and AI algorithms (e.g., via [MONAI](https://monai.io)).

## Roadmap

Details and progress on our roadmap are tracked in the issue tracker on Github: https://github.com/cogdeasy/VolView/issues

## Citation

The cinematic rendering technique underlying Volume Viewer is described in:

[Xu J, Thevenon G, Chabat T, McCormick M, Li F, Birdsong T, Martin K, Lee Y, and Aylward S, "Interactive, in-browser cinematic volume rendering of medical images", Computer Methods in Computer Methods in Biomechanics and Biomedical Engineering: Imaging & Visualization](https://www.tandfonline.com/doi/full/10.1080/21681163.2022.2145239)

To refer to the upstream VolView source code, please provide a link to https://github.com/Kitware/VolView and cite [DOI:10.5281/zendo.7328066](https://zenodo.org/badge/latestdoi/248073292)

## Acknowledgements

The upstream VolView project was funded, in part, by the NIH via NIBIB and NIGMS R01EB021396, NIBIB R01EB014955, NCI R01CA220681, and NINDS R42NS086295.

## Related Work

- Glance: General purpose scientific visualization in web browsers
  - https://kitware.github.io/glance/index.html
- 3D Slicer: Desktop (C++ and Python), extensible radiological viewer
  - https://slicer.org
- trame: Python framework for quickly creating web application involving server-side rendering and computation.
  - https://kitware.github.io/trame/index.html
- itk.wasm: Web-assembly version of ITK for in-browser image segmentation and registration, with outstanding DICOM support.
  - https://github.com/InsightSoftwareConsortium/itk-wasm
- vtk.js: A pure javascript library for advanced, interactive, scientific visualization in web browsers.
  - https://kitware.github.io/vtk-js/index.html
