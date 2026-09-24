# Creative Optimizations VS Code Extension

The **Creative Optimizations VS Code Extension** helps you create, develop, preview, QA, and export HTML5 advertising templates directly from Visual Studio Code.

It is designed to keep the repetitive setup out of your workflow so you can focus on the creative itself.

---

## Index

- [Getting started](#getting-started)
  - [Installation](#installation)
  - [Connect to Creative Optimizations](#connect-to-creative-optimizations)

- [Create your first template](#create-your-first-template)
  - [1. Template name](#1-template-name)
  - [2. Dimensions](#2-dimensions)
  - [3. Placeholders](#3-placeholders)
  - [4. Fonts](#4-fonts)
  - [5. Create boilerplate](#5-create-boilerplate)

- [Working with a template](#working-with-a-template)
  - [Template settings](#template-settings)
  - [Adding your creative](#adding-your-creative)
  - [Placeholders](#placeholders)
  - [Multiple dimensions](#multiple-dimensions)
  - [Multiple frames](#multiple-frames)

- [Preview](#preview)
  - [Opening the preview](#opening-the-preview)
  - [Selecting variants](#selecting-variants)
  - [Selecting sizes](#selecting-sizes)
  - [QA mode](#qa-mode)
  - [Storyboards](#storyboards)
  - [Overlay](#overlay)
  - [Zoom](#zoom)
  - [Reloading previews](#reloading-previews)

- [Export](#export)
  - [ZIP export](#zip-export)
  - [Creative Optimizations export](#creative-optimizations-export)

- [Project structure](#project-structure)
- [Requirements](#requirements)

---

# Getting started

## Installation

1. Open **Visual Studio Code**.
2. Open the **Extensions** panel.
3. Search for the LemonPi / Creative Optimizations extension.
4. Install the extension.
5. The extension will add its own view to the Visual Studio Code interface.

> **Tip:** You can move the extension view within Visual Studio Code just like other built-in views.

---

## Connect to Creative Optimizations

Connecting to Creative Optimizations is optional when starting a project.

You only need to log in when you want to use CO-connected functionality, such as importing placeholders from a CO ad set or loading advertiser-specific fonts and other platform data.

To connect, choose **Connect to Creative Optimizations** from the extension sidebar and complete the WPP login in your browser.

---

# Create your first template

Choose **Create New Template** from the extension sidebar to open the template wizard.

You do **not** need to connect to Creative Optimizations before starting a project. You can create the project first and connect your Creative Optimizations account later when you need to import platform data, fonts, or use other CO-connected features.

The wizard is made up of five steps.

## 1. Template name

Enter the name you want to use for the template.

The extension automatically uses the **currently open VS Code folder** as the project workspace.

If no folder is currently open, the wizard gives you an option to **open or select a folder** before continuing.

The template name is also used when exporting the template.

## 2. Dimensions

First, select the template type: **Single size** or **Responsive**.

Then select the creative sizes your template needs to support.

The wizard includes these default dimensions:

- `300x250`
- `300x600`
- `160x600`
- `320x50`
- `728x90`
- `970x250`

You can select multiple dimensions for the same project.

You can also use **Add custom size** to enter your own width and height when the required size is not included in the default list.

## 3. Placeholders

Define the dynamic content your template will use by importing placeholders from either a CSV feed or Creative Optimizations (CO).

### Import from feed

Use **Import from feed** to create placeholders from a local CSV file or a remote feed URL.

The feed import allows you to:

- Select the column used as the **identifier**.
- Optionally select a **dimensions** column to define which creative sizes each variant supports.
- Select which feed columns should be used as placeholders.
- Assign placeholder types such as text, image, video, audio, click, or collection.
- Use **Auto-map** to automatically detect placeholder types based on the values in each column.
- Configure collection placeholders and map their fields to product-store fields.

The **Identifier** column is automatically detected when the feed contains a column named:

- `variantID`
- `variantId`
- `variant-name`
- `variantName`

The **Dimensions** column is automatically detected when the feed contains a column named:

- `dimensions`
- `template_dimensions`
- `template_dimension`
- `templateDimension`
- `templateDimensions`

If no dimensions column is provided, the placeholders will use the dimensions selected in the previous step.

### Auto-map

**Auto-map** determines the placeholder type by examining the first non-empty value in each selected column.

The following rules are used:

- A URL ending in a recognised image extension is mapped as **image**:
  - `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.svg`, `.avif`, `.bmp`, `.tif`, `.tiff`

- A URL ending in a recognised video extension is mapped as **video**:
  - `.mp4`, `.webm`, `.mov`, `.m4v`

- A URL ending in a recognised audio extension is mapped as **audio**:
  - `.mp3`, `.wav`, `.ogg`, `.m4a`, `.aac`, `.flac`

- An `http://` or `https://` URL that does not match a recognised media extension is mapped as **click**.
- A column named `product-selector_id`, `product-selector`, `product_selector`, or `productselector` is mapped as **collection**.
- All other values are mapped as **text**.

You can review and change the automatically detected type for any placeholder before finishing the import.

### Collection placeholders

When a placeholder is mapped as a **collection**, you can configure the collection and map its fields to product data.

After mapping a collection placeholder:

1. Connect to **Creative Optimizations**.
2. The product-store fields for the selected advertiser are loaded.
3. Map each collection placeholder field to the corresponding product-store field.
4. Define the collection name, intent, and required number of items.

This allows collection placeholders in the template to be populated from the advertiser's product store.

> **Note:** Mapping collection fields to product-store fields requires an active Creative Optimizations connection.

### Import placeholders from CO

Use **Import placeholders from CO** to import existing placeholder and content definitions from a Creative Optimizations ad set.

The import requires you to:

1. Connect to Creative Optimizations.
2. Select an **agency**.
3. Select an **advertiser**.
4. Select the **ad set** to import from.

Imported placeholders and their content are then available in the wizard and can be reviewed for each variant and dimension.

> **Note:** Importing placeholders from Creative Optimizations requires an active Creative Optimizations connection.

## 4. Fonts

Select the fonts required by the template.

Where available, fonts can be loaded from Creative Optimizations for the selected advertiser and included in the project setup.

> **Note:** Importing fonts from an advertiser requires you to connect to Creative Optimizations.

## 5. Create boilerplate

The final step creates the template boilerplate and generates the project files.

This step includes options for:

- **Number of frames** — choose how many animation frames the creative should contain.
- **Auto-fill placeholder content** — automatically generate code that fills the creative with the placeholder content selected during setup.

For example, selecting three frames generates the corresponding frame structure so you can build a three-frame animation directly in the project.

Once the boilerplate has been created, the project is ready for development in VS Code.

---

# Working with a template

Once the wizard has created a project, work on the creative files normally in Visual Studio Code.

The generated project separates:

- creative source files
- template settings
- preview content
- dimension-specific styles
- exported files

You can edit the HTML, CSS, JavaScript, images, and other assets just like any other local web project.

## Template settings

The template configuration is stored in:

```text
settings/settings.json
```

This contains the project-level information used by the extension, including items such as:

- template name
- dimensions
- agency
- advertiser
- ad set
- fonts
- placeholders

Dynamic example content is stored separately in:

```text
settings/content.json
```

You normally do not need to edit these files manually unless you have a specific reason to do so.

## Adding your creative

The main source files are inside:

```text
src/
```

The standard generated project includes:

```text
src/
├── index.html
├── script.js
├── styles.css
└── Creative.js
```

Use these files for the creative's markup, styling, animation, and LemonPi helper functionality.

You can add additional files and folders as needed.

## Placeholders

Placeholders allow the same template to receive different dynamic content.

A project can contain common types such as:

- text
- image
- video
- audio
- click
- collection

The generated content configuration keeps the placeholder name and type so the template can use the correct content at preview and export time.

### Auto-filled content

When auto-fill is enabled during template creation, the generated `script.js` can populate placeholder content for you.

For example, image placeholders can be assigned to image elements and text placeholders can be inserted into text elements.

You can then replace or extend the generated implementation with your own creative logic.

## Multiple dimensions

A single project can support multiple creative sizes.

Dimension-specific CSS can be placed in:

```text
src/dimensions/
```

For example:

```text
src/
├── styles.css
└── dimensions/
    ├── 300x250.css
    ├── 320x50.css
    └── 728x90.css
```

The base styles remain in `styles.css`.

When a dimension has its own CSS file, the extension uses that file for the relevant size during export.

This lets you share common styling while keeping size-specific changes isolated.

## Multiple frames

Templates can contain multiple animation frames.

The generated project creates a GSAP timeline for each frame, for example:

```js
const frame1Timeline = gsap.timeline();
const frame2Timeline = gsap.timeline();
const frame3Timeline = gsap.timeline();
```

Frame animations are combined into the main creative timeline in sequence.

Each individual frame timeline includes a `preview-ready` label. This label marks the point where that frame has finished its entrance animation and is in its intended final state.

For example:

```js
frame1Timeline.addLabel("preview-ready", 4);
```

This means that `frame1Timeline` is considered ready for preview at 4 seconds.

When the individual frame timelines are added to the main timeline, the corresponding `preview-ready` position is used to create a frame-specific preview label:

```text
frame1-preview
frame2-preview
frame3-preview
```

These labels point to the correct position in the **main creative timeline**, regardless of where the individual frame starts.

For example:

```js
mainTimeline.addLabel(
  "frame1-preview",
  frame1Start + frame1Timeline.labels["preview-ready"],
);
```

The preview uses these labels to pause the creative at the correct point for QA mode.

This means you only need to define where each frame is **preview-ready** in its own timeline. The preview system handles the rest.

---

# Preview

## Opening the preview

Use **Launch Preview** / **Preview** from the extension.

The extension starts a local preview server for the current workspace and opens the preview in your browser.

The preview reads:

- project settings
- example content
- creative source files
- available dimensions
- available variants

Changes to the local project can then be checked in the preview.

## Selecting variants

The preview includes a variant list.

Use the variant list to switch between the available content variants.

A search field is available when you need to find a specific variant quickly.

The selected variant is applied to the preview cards.

## Selecting sizes

The preview includes size controls for the dimensions configured in the project.

Use the size buttons to:

- show one size
- show several sizes
- show all configured sizes
- hide sizes you do not currently need to review

This is useful when testing a project that contains many dimensions.

## QA mode

Enable **QA mode** in the preview header when you want to inspect the individual animation frames.

Instead of showing one normal creative preview per dimension, QA mode creates a preview for each detected frame.

For example, a three-frame creative can show:

```text
Frame 1
Frame 2
Frame 3
```

Each frame is automatically paused at its corresponding preview point.

This makes it easier to inspect:

- frame composition
- text placement
- assets
- animation state
- transitions between frames
- storyboard alignment

You do not need to manually change animation timings in the preview to inspect a frame.

## Storyboards

When storyboard images are available in the project's `storyboards/` folder, the preview can display them alongside the relevant QA frame.

Storyboard files are matched to:

- creative width
- creative height
- frame number

This allows you to compare the rendered HTML5 creative against the intended storyboard.

A project may therefore contain files such as:

```text
storyboards/
├── 300x250-frame1.png
├── 300x250-frame2.png
├── 300x250-frame3.png
└── ...
```

The exact filename does not have to follow this example, but the preview uses the dimension and frame information when locating the storyboard.

## Overlay

QA mode includes an **Overlay** control for a frame.

Enable it to place the storyboard over the creative so you can compare the two visually.

An opacity control appears when the overlay is enabled.

This is useful for checking:

- alignment
- spacing
- typography
- image positioning
- element dimensions
- overall composition

The overlay is only a preview/QA tool; it does not modify the creative source files.

## Zoom

Use the preview's zoom slider to change the size of the entire preview card.

The zoom applies to the complete card rather than only the iframe, so the following scale together:

- creative preview
- frame label
- storyboard
- QA controls
- overlay

The preview layout also recalculates around the resized cards, making it easier to inspect several creatives at once.

## Reloading previews

Use **Reload all** when you want to reload every preview iframe at the same time.

This is useful after making changes that you want to test across all currently displayed sizes and frames.

---

# Export

## ZIP export

The extension can export the local template as ZIP files.

Before exporting, make sure the project contains:

```text
src/
settings/settings.json
```

The project must also have at least one configured dimension.

For a project with multiple dimensions, the extension creates one ZIP per dimension in:

```text
export/
```

The files are named using the project name and creative dimensions.

For example:

```text
export/
├── MyTemplate_300x250.zip
├── MyTemplate_320x50.zip
└── MyTemplate_728x90.zip
```

### What is included

The ZIP contains the exportable contents of `src/`.

Dimension-specific CSS is merged into the exported `styles.css` for that size.

The `src/dimensions/` directory itself is not included as a separate export directory.

The export also contains a `template.json` containing the configured placeholder definitions.

The extension updates the `ad.size` metadata in `index.html` for the exported dimension.

This means the exported package is prepared for upload without requiring you to manually create a separate package for every size.

## Creative Optimizations export

The extension can upload your template directly to **Creative Optimizations**.

Connect to Creative Optimizations, then configure the export:

- **Advertiser** — select the advertiser to upload to.
- **Folder** — select the destination folder, including nested folders.
- **Sizes** — select which template dimensions to upload.

The filename is generated automatically from the project name and dimension:

```text
MyTemplate_300x250
MyTemplate_300x600
```

The dimension is always added using `_`. To change the filename, edit the **Adset Details**.

Click **Upload to Creative Optimizations** to upload the selected sizes.

# Project structure

A newly generated project follows this general structure:

```text
MyTemplate/
│
├── src/
│   ├── index.html
│   ├── script.js
│   ├── styles.css
│   ├── Creative.js
│   └── dimensions/
│       ├── 300x250.css
│       ├── 320x50.css
│       └── ...
│
├── settings/
│   ├── settings.json
│   └── content.json
│
├── storyboards/
│   └── ...
│
└── export/
    └── ...
```

You can add your own assets and source files to the project.

---

# Requirements

The extension is intended to be used with:

- Visual Studio Code
- a local template workspace
- a Creative Optimizations account for platform-connected features

Some features, such as advertiser-specific data, platform fonts, folders, and placeholder imports, require Creative Optimizations authentication.
