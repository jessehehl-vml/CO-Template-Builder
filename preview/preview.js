const previewData = window.__PREVIEW_DATA__;
const app = document.getElementById("app");

if (!app) {
  throw new Error("Preview app container not found.");
}

const dimensions = previewData?.dimensions ?? [];
const variants = previewData?.variants ?? [];

let selectedVariant = 0;
let zoom = 100;

const qaToggle = document.createElement("label");
qaToggle.className = "qa-toggle";

const qaCheckbox = document.createElement("input");
qaCheckbox.type = "checkbox";

const qaLabel = document.createElement("span");
qaLabel.textContent = "QA mode";

qaToggle.appendChild(qaCheckbox);
qaToggle.appendChild(qaLabel);

let qaMode = false;

qaCheckbox.addEventListener("change", () => {
  qaMode = qaCheckbox.checked;

  render();
});
function applyZoom() {
  const scale = zoom / 100;

  document.querySelectorAll(".preview-card").forEach((card) => {
    card.style.zoom = scale;
    card.style.transform = "";
  });

  // Remove any old iframe/stage scaling.
  document.querySelectorAll(".preview-frame").forEach((iframe) => {
    iframe.style.transform = "";
  });

  document.querySelectorAll(".qa-preview-stage").forEach((stage) => {
    stage.style.transform = "";
  });
}
function createQaFrames(width, height, exportContent) {
  console.log("[QA] createQaFrames()", {
    width,
    height,
    zoom,
    exportContent,
  });

  const container = document.createElement("div");
  container.className = "qa-frames";
  container.dataset.overlayEnabled = "false";
  container.dataset.overlayOpacity = "50";

  const sourceIframe = document.createElement("iframe");

  sourceIframe.className = "preview-frame";
  sourceIframe.src = `/src/index.html?_lemonpiPreview&width=${width}&height=${height}`;

  console.log("[QA] Creating source iframe:", sourceIframe.src);

  sourceIframe.addEventListener("load", () => {
    console.log("[QA] Source iframe loaded", {
      src: sourceIframe.src,
      contentWindow: !!sourceIframe.contentWindow,
      Creative: sourceIframe.contentWindow?.Creative,
      frames: sourceIframe.contentWindow?.Creative?.frames,
    });

    const frameCount = sourceIframe.contentWindow?.Creative?.frames || 1;

    console.log("[QA] Detected frame count:", frameCount);

    container.innerHTML = "";

    let row = document.createElement("div");
    row.className = "qa-frame-row";

    for (let frame = 1; frame <= frameCount; frame++) {
      console.log(`[QA] Creating frame ${frame}/${frameCount}`);

      const frameContainer = document.createElement("div");
      frameContainer.className = "qa-frame-container";

      const label = document.createElement("div");
      label.className = "qa-frame-label";
      label.textContent = `Frame ${frame}`;

      // Shared iframe/storyboard container
      const previewStage = document.createElement("div");
      previewStage.className = "qa-preview-stage";

      previewStage.style.width = `${width}px`;
      previewStage.style.height = `${height}px`;

      const iframe = document.createElement("iframe");

      iframe.className = "preview-frame qa-frame";

      iframe.width = width;
      iframe.height = height;

      iframe.style.width = `${width}px`;
      iframe.style.height = `${height}px`;
      iframe.style.visibility = "hidden";

      iframe.dataset.qaFrame = frame;

      iframe.src =
        `/src/index.html?_lemonpiPreview` +
        `&width=${width}` +
        `&height=${height}`;

      console.log(`[QA] Frame ${frame} iframe created`, {
        src: iframe.src,
        qaFrame: iframe.dataset.qaFrame,
      });

      iframeConfigs.set(iframe, exportContent);

      console.log(`[QA] Frame ${frame} added to iframeConfigs`, {
        config: iframeConfigs.get(iframe),
      });

      iframe.addEventListener("load", () => {
        console.log(`[QA] Frame ${frame} iframe loaded`, {
          src: iframe.src,
          qaFrame: iframe.dataset.qaFrame,
          Creative: iframe.contentWindow?.Creative,
        });

        iframe.style.visibility = "visible";
      });

      iframe.addEventListener("error", (error) => {
        console.error(`[QA] Frame ${frame} iframe ERROR`, error);
      });

      iframe.setAttribute("frameborder", "0");

      // --------------------------------------------------
      // STORYBOARD
      // --------------------------------------------------

      const storyboardSection = document.createElement("div");
      storyboardSection.className = "storyboard-section";
      storyboardSection.dataset.storyboard = "true";

      const storyboardTitle = document.createElement("div");
      storyboardTitle.className = "storyboard-title";
      storyboardTitle.textContent = "Storyboard";

      const storyboardImage = document.createElement("img");
      storyboardImage.className = "storyboard-image";

      storyboardImage.alt = `${width}x${height} storyboard frame ${frame}`;

      console.log(`[QA] Frame ${frame} looking for storyboard`, {
        width,
        height,
        frame,
      });

      fetch(`/storyboards/find?width=${width}&height=${height}&frame=${frame}`)
        .then(async (response) => {
          if (!response.ok) {
            const error = await response.json().catch(() => ({}));

            throw new Error(
              error.error || `Storyboard lookup failed (${response.status})`,
            );
          }

          return response.json();
        })
        .then((result) => {
          console.log(`[QA] Frame ${frame} storyboard found`, result);

          storyboardImage.src = result.path;

          storyboardImage.addEventListener("load", () => {
            console.log(`[QA] Frame ${frame} storyboard IMAGE LOADED`, {
              fileName: result.fileName,
              path: result.path,
            });
          });

          storyboardImage.addEventListener("error", (error) => {
            console.error(
              `[QA] Frame ${frame} storyboard IMAGE FAILED TO LOAD`,
              {
                fileName: result.fileName,
                path: result.path,
                error,
              },
            );

            storyboardSection.remove();
          });
        })
        .catch((error) => {
          console.warn(`[QA] Frame ${frame} storyboard lookup FAILED`, {
            width,
            height,
            frame,
            error: error.message,
          });

          storyboardSection.remove();
        });

      storyboardSection.appendChild(storyboardTitle);
      storyboardSection.appendChild(storyboardImage);

      // --------------------------------------------------
      // FRAME + STORYBOARD
      // --------------------------------------------------

      previewStage.appendChild(iframe);

      frameContainer.appendChild(label);
      frameContainer.appendChild(previewStage);
      frameContainer.appendChild(storyboardSection);

      row.appendChild(frameContainer);

      console.log(`[QA] Frame ${frame} appended to row`);

      // Wide creatives: one frame per row
      if (width >= 700) {
        container.appendChild(row);

        row = document.createElement("div");
        row.className = "qa-frame-row";
      }
    }
    // Append any remaining row
    if (row.children.length > 0) {
      container.appendChild(row);
    }
    console.log("[QA] Finished creating all QA frames", {
      frameCount,
      children: container.children.length,
    });

    sourceIframe.remove();

    console.log("[QA] Removed source iframe");
  });

  sourceIframe.addEventListener("error", (error) => {
    console.error("[QA] SOURCE iframe ERROR", {
      src: sourceIframe.src,
      error,
    });
  });

  container.appendChild(sourceIframe);

  console.log("[QA] Source iframe appended");

  return container;
}
function reloadAllIframes() {
  document.querySelectorAll(".preview-frame").forEach((iframe) => {
    iframe.contentWindow?.location.reload();
  });
}
const selectedDimensions = new Set(
  dimensions.map(({ width, height }) => `${width}x${height}`),
);
function dimensionKey(dimension) {
  return `${dimension.width}x${dimension.height}`;
}

const iframeConfigs = new WeakMap();
function getIframeForSource(source) {
  return [...document.querySelectorAll("iframe")].find(
    (iframe) => iframe.contentWindow === source,
  );
}

function getExportContent(variant, width, height) {
  const dimension = variant?.dimensions?.find(
    (dimension) => dimension.width === width && dimension.height === height,
  );

  if (!dimension) {
    console.warn("[PREVIEW] No content found for size:", width, height);
    return {};
  }

  return Object.fromEntries(
    dimension.placeholders
      .filter((placeholder) => placeholder.type !== "not used")
      .map((placeholder) => [
        placeholder.name,
        {
          type: placeholder.type,
          value: placeholder.value,
        },
      ]),
  );
}
window.addEventListener("message", (event) => {
  if (event.data?.type === "creative-ready") {
    const iframe = getIframeForSource(event.source);

    if (!iframe) {
      return;
    }

    const frame = iframe.dataset.qaFrame;

    if (frame) {
      console.log("[PREVIEW] Creative ready, pausing on frame:", frame);

      iframe.contentWindow?.postMessage(
        {
          type: "preview-pause",
          frame: Number(frame),
        },
        "*",
      );
    }

    return;
  }
  if (event.data?.type !== "lemonpi-awaiting-config") {
    return;
  }

  const iframe = getIframeForSource(event.source);

  if (!iframe) {
    console.warn("[PREVIEW] Could not find iframe for message");
    return;
  }

  const config = iframeConfigs.get(iframe);

  if (!config) {
    console.warn("[PREVIEW] No config found for iframe");
    return;
  }

  console.log("[PREVIEW] Sending config:", config);

  event.source.postMessage(
    {
      type: "lemonpi-config",
      config: {
        exportContent: config,
      },
    },
    "*",
  );
});

function render() {
  app.innerHTML = "";

  const root = document.createElement("div");
  root.className = "preview-app";

  // --------------------------------------------------
  // Top bar
  // --------------------------------------------------

  const topbar = document.createElement("header");
  topbar.className = "preview-topbar";

  const previewTitle = document.createElement("span");
  previewTitle.className = "preview-title";
  previewTitle.textContent = `${previewData?.projectName ?? "Preview"} | Preview`;

  topbar.appendChild(previewTitle);
  topbar.appendChild(qaToggle);
  // --------------------------------------------------
  // Body
  // --------------------------------------------------

  const body = document.createElement("div");
  body.className = "preview-body";

  // --------------------------------------------------
  // Sidebar
  // --------------------------------------------------

  const sidebar = document.createElement("aside");
  sidebar.className = "preview-sidebar";

  const searchWrapper = document.createElement("div");
  searchWrapper.className = "variant-search";

  const search = document.createElement("input");
  search.type = "search";
  search.placeholder = "Search variants";

  const searchIcon = document.createElement("span");
  searchIcon.className = "variant-search-icon";
  searchIcon.textContent = "⌕";

  searchWrapper.appendChild(search);
  searchWrapper.appendChild(searchIcon);

  const toolbar = document.createElement("div");
  toolbar.className = "variant-toolbar";

  const count = document.createElement("span");
  count.className = "variant-count";
  count.textContent = `${variants.length} variants`;

  toolbar.appendChild(count);

  const variantList = document.createElement("div");
  variantList.className = "variant-list";

  function renderVariants(filter = "") {
    variantList.innerHTML = "";

    variants.forEach((variant, index) => {
      const name = variant.contentId ?? `Variant ${index + 1}`;

      if (filter && !name.toLowerCase().includes(filter.toLowerCase())) {
        return;
      }

      const item = document.createElement("button");
      item.className = "variant-item";

      if (index === selectedVariant) {
        item.classList.add("selected");
      }

      const checkbox = document.createElement("input");
      checkbox.type = "radio";
      checkbox.name = "variant";
      checkbox.className = "variant-checkbox";
      checkbox.checked = index === selectedVariant;

      const label = document.createElement("span");
      label.className = "variant-name";
      label.textContent = name;

      item.appendChild(checkbox);
      item.appendChild(label);

      item.addEventListener("click", () => {
        selectedVariant = index;
        render();
      });

      variantList.appendChild(item);
    });
  }

  search.addEventListener("input", () => {
    renderVariants(search.value);
  });

  renderVariants();

  sidebar.appendChild(searchWrapper);
  sidebar.appendChild(toolbar);
  sidebar.appendChild(variantList);

  // --------------------------------------------------
  // Content
  // --------------------------------------------------

  const content = document.createElement("main");
  content.className = "preview-content";

  // --------------------------------------------------
  // Floating bottom toolbar
  // --------------------------------------------------

  const bottomToolbar = document.createElement("div");
  bottomToolbar.className = "preview-bottom-toolbar";

  const reloadAllButton = document.createElement("button");
  reloadAllButton.className = "reload-all-button";
  reloadAllButton.type = "button";
  reloadAllButton.textContent = "↻ Reload all";

  reloadAllButton.addEventListener("click", reloadAllIframes);

  const zoomControl = document.createElement("div");
  zoomControl.className = "zoom-control";

  const zoomSlider = document.createElement("input");
  zoomSlider.type = "range";
  zoomSlider.min = "50";
  zoomSlider.max = "100";
  zoomSlider.step = "5";
  zoomSlider.value = String(zoom);
  zoomSlider.className = "zoom-slider";

  const zoomLabel = document.createElement("span");
  zoomLabel.className = "zoom-label";
  zoomLabel.textContent = `${zoom}%`;

  zoomSlider.addEventListener("input", () => {
    zoom = Number(zoomSlider.value);
    zoomLabel.textContent = `${zoom}%`;

    applyZoom();
  });

  zoomControl.appendChild(zoomSlider);
  zoomControl.appendChild(zoomLabel);

  bottomToolbar.appendChild(reloadAllButton);
  bottomToolbar.appendChild(zoomControl);

  content.appendChild(bottomToolbar);
  const contentHeader = document.createElement("div");
  contentHeader.className = "preview-content-header";

  const contentTitle = document.createElement("span");
  contentTitle.className = "preview-content-title";
  contentTitle.textContent = "HTML5";

  const contentCount = document.createElement("span");
  contentCount.className = "preview-content-count";
  contentCount.textContent = `• ${variants.length} Ad variants`;

  contentHeader.appendChild(contentTitle);
  contentHeader.appendChild(contentCount);

  // --------------------------------------------------
  // Size toolbar
  // --------------------------------------------------

  const sizeToolbar = document.createElement("div");
  sizeToolbar.className = "size-toolbar";

  const allSelected =
    dimensions.length > 0 &&
    dimensions.every((dimension) =>
      selectedDimensions.has(dimensionKey(dimension)),
    );

  const allButton = document.createElement("button");
  allButton.className = "size-chip size-chip-all";
  allButton.type = "button";
  allButton.textContent = "All";

  if (allSelected) {
    allButton.classList.add("selected");
  }

  allButton.title = allSelected ? "Deselect all sizes" : "Select all sizes";

  allButton.addEventListener("click", () => {
    if (allSelected) {
      selectedDimensions.clear();
    } else {
      dimensions.forEach((dimension) => {
        selectedDimensions.add(dimensionKey(dimension));
      });
    }

    render();
  });

  sizeToolbar.appendChild(allButton);

  dimensions.forEach((dimension) => {
    const key = dimensionKey(dimension);

    const chip = document.createElement("button");
    chip.className = "size-chip";

    if (selectedDimensions.has(key)) {
      chip.classList.add("selected");
    }

    chip.textContent = `${dimension.width} × ${dimension.height}`;

    chip.addEventListener("click", () => {
      if (selectedDimensions.has(key)) {
        selectedDimensions.delete(key);
      } else {
        selectedDimensions.add(key);
      }

      render();
    });

    sizeToolbar.appendChild(chip);
  });

  // --------------------------------------------------
  // Preview cards
  // --------------------------------------------------

  const grid = document.createElement("div");
  grid.className = "preview-grid";

  const selectedVariantData = variants[selectedVariant];

  dimensions.forEach((dimension) => {
    const key = dimensionKey(dimension);

    if (!selectedDimensions.has(key)) {
      return;
    }
    const card = document.createElement("article");
    card.className = "preview-card";
    card.style.zoom = zoom / 100;

    const cardHeader = document.createElement("div");
    cardHeader.className = "preview-card-header";

    const title = document.createElement("span");
    title.className = "preview-card-size";
    title.textContent = `${dimension.width}x${dimension.height}`;

    const overlayControls = document.createElement("div");
    overlayControls.className = "qa-overlay-controls";

    const overlayLabel = document.createElement("label");
    overlayLabel.className = "qa-overlay-toggle";

    const overlayCheckbox = document.createElement("input");
    overlayCheckbox.type = "checkbox";

    const overlayText = document.createElement("span");
    overlayText.textContent = "Overlay";

    overlayLabel.appendChild(overlayCheckbox);
    overlayLabel.appendChild(overlayText);

    const opacityWrapper = document.createElement("div");
    opacityWrapper.className = "qa-overlay-opacity";
    opacityWrapper.style.display = "none";

    const frameWrapper = document.createElement("div");
    frameWrapper.className = "preview-frame-wrapper";

    const opacitySlider = document.createElement("input");
    opacitySlider.type = "range";
    opacitySlider.min = "0";
    opacitySlider.max = "100";
    opacitySlider.value = "50";

    const opacityValue = document.createElement("span");
    opacityValue.textContent = "50%";

    overlayCheckbox.addEventListener("change", () => {
      const enabled = overlayCheckbox.checked;

      console.log(
        `[QA] Overlay ${enabled ? "enabled" : "disabled"} for ${dimension.width}x${dimension.height}`,
      );

      const qaFrames = frameWrapper.querySelector(".qa-frames");

      if (!qaFrames) {
        console.warn("[QA] No QA frames found for overlay");
        return;
      }

      qaFrames.dataset.overlayEnabled = String(enabled);

      qaFrames.querySelectorAll(".storyboard-section").forEach((storyboard) => {
        storyboard.classList.toggle("storyboard-overlay", enabled);

        const image = storyboard.querySelector(".storyboard-image");

        if (image) {
          image.style.opacity = enabled
            ? Number(opacitySlider.value) / 100
            : "1";
        }
      });

      opacityWrapper.style.display = enabled ? "flex" : "none";
    });

    opacitySlider.addEventListener("input", () => {
      const opacity = Number(opacitySlider.value);

      opacityValue.textContent = `${opacity}%`;

      console.log(
        `[QA] Storyboard opacity: ${opacity}% for ${dimension.width}x${dimension.height}`,
      );

      const qaFrames = frameWrapper.querySelector(".qa-frames");

      if (!qaFrames) {
        return;
      }

      qaFrames.querySelectorAll(".storyboard-image").forEach((image) => {
        image.style.opacity = opacity / 100;
      });

      qaFrames.dataset.overlayOpacity = String(opacity);
    });

    opacityWrapper.appendChild(opacitySlider);
    opacityWrapper.appendChild(opacityValue);

    overlayControls.appendChild(overlayLabel);
    overlayControls.appendChild(opacityWrapper);

    cardHeader.appendChild(title);

    if (qaMode) {
      cardHeader.appendChild(overlayControls);
    }

    card.appendChild(cardHeader);

    const cardSize = document.createElement("span");
    cardSize.className = "preview-card-size";
    cardSize.textContent = key;

    const exportContent = getExportContent(
      selectedVariantData,
      dimension.width,
      dimension.height,
    );

    if (qaMode) {
      frameWrapper.appendChild(
        createQaFrames(dimension.width, dimension.height, exportContent),
      );
    } else {
      const iframe = document.createElement("iframe");

      iframe.className = "preview-frame";

      iframe.width = dimension.width;
      iframe.height = dimension.height;

      iframe.style.width = `${dimension.width}px`;
      iframe.style.height = `${dimension.height}px`;

      iframe.src =
        `/src/index.html?_lemonpiPreview` +
        `&width=${dimension.width}` +
        `&height=${dimension.height}`;

      iframe.addEventListener("load", () => {
        iframe.style.visibility = "visible";
      });

      iframe.setAttribute("frameborder", "0");

      iframeConfigs.set(iframe, exportContent);

      frameWrapper.appendChild(iframe);
    }

    card.appendChild(cardHeader);
    card.appendChild(frameWrapper);

    grid.appendChild(card);
  });

  content.appendChild(contentHeader);
  content.appendChild(sizeToolbar);
  content.appendChild(grid);

  body.appendChild(sidebar);
  body.appendChild(content);

  root.appendChild(topbar);
  root.appendChild(body);

  app.appendChild(root);
}

render();
