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

let qaPanelOpen = false;

const codeReviewButton = document.createElement("button");
codeReviewButton.type = "button";
codeReviewButton.className = "code-review-button";
codeReviewButton.textContent = "Code review";
codeReviewButton.addEventListener("click", () =>
  setReviewPanelOpen(!qaPanelOpen),
);

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
// --------------------------------------------------
// Code review
// --------------------------------------------------

function setReviewPanelOpen(open) {
  qaPanelOpen = open;
  codeReviewButton.classList.toggle("active", open);

  if (open) {
    renderQaPanel();
  } else {
    document.querySelector(".qa-panel")?.remove();
    syncTopbar();
  }
}

function previewTitleText() {
  const mode = qaPanelOpen && qaView.expanded ? "Code Review" : "Preview";

  return `${previewData?.projectName ?? "Preview"} | ${mode}`;
}

function syncTopbar() {
  const title = document.querySelector(".preview-title");
  const fullScreen = qaPanelOpen && qaView.expanded;

  if (title) {
    title.textContent = previewTitleText();
  }

  qaToggle.hidden = fullScreen;
  codeReviewButton.hidden = fullScreen;
  topbarResize.hidden = !fullScreen;
  topbarClose.hidden = !fullScreen;
}

function createTopbarIcon(text, title, onClick) {
  const button = document.createElement("button");

  button.type = "button";
  button.className = "qa-panel-close";
  button.textContent = text;
  button.title = title;
  button.hidden = true;
  button.addEventListener("click", onClick);

  return button;
}

const topbarResize = createTopbarIcon("⤡", "Exit full screen", () => {
  qaView.expanded = false;
  renderQaPanel();
});

const topbarClose = createTopbarIcon("×", "Close", () =>
  setReviewPanelOpen(false),
);

const QA_ACTIONS = [
  [
    "rules",
    "✓ Check code",
    "Fast automatic checks of the banner files and feed content",
  ],
  [
    "variants",
    "▶ Test variants",
    "Loads every variant at every size and reports JS errors",
  ],
  ["ai", "✨ AI review", "Reviews the code with your GitHub Copilot"],
];

function getReviewPanel() {
  let panel = document.querySelector(".qa-panel");

  if (!panel) {
    panel = document.createElement("aside");
    panel.className = "qa-panel";
    document.body.appendChild(panel);
  }

  panel.innerHTML = "";
  panel.classList.toggle("expanded", qaView.expanded);

  const top = document.createElement("div");
  top.className = "qa-panel-top";

  const header = document.createElement("div");
  header.className = "qa-panel-header";

  const title = document.createElement("strong");
  title.textContent = "Code review";

  const icons = document.createElement("div");
  icons.className = "qa-panel-icons";

  const expand = document.createElement("button");
  expand.type = "button";
  expand.className = "qa-panel-close";
  expand.textContent = qaView.expanded ? "⤡" : "⤢";
  expand.title = qaView.expanded ? "Exit full screen" : "Full screen";
  expand.addEventListener("click", () => {
    qaView.expanded = !qaView.expanded;
    renderQaPanel();
  });

  const close = document.createElement("button");
  close.type = "button";
  close.className = "qa-panel-close";
  close.textContent = "×";
  close.title = "Close";
  close.addEventListener("click", () => setReviewPanelOpen(false));

  icons.appendChild(expand);
  icons.appendChild(close);

  header.appendChild(title);
  header.appendChild(icons);
  if (!qaView.expanded) {
    top.appendChild(header);
  } else {
    top.appendChild(qaHeading("Select test to run"));
  }

  const actions = document.createElement("div");
  actions.className = "qa-actions";

  QA_ACTIONS.forEach(([kind, label, hint]) => {
    const action = document.createElement("button");
    const running = Boolean(qaState[kind]?.pending);

    action.type = "button";
    action.className = `qa-action qa-origin-${kind}`;
    action.textContent = running ? `${label.slice(0, 2)}Running...` : label;
    action.title = hint;
    action.disabled = running;
    action.addEventListener("click", () =>
      kind === "variants" ? runVariantTest() : runQa(kind),
    );

    actions.appendChild(action);
  });

  top.appendChild(actions);
  panel.appendChild(top);

  return panel;
}

const qaState = { rules: null, ai: null, variants: null };

const QA_ORIGIN_LABELS = {
  rules: "Code checks",
  variants: "Variant test",
  ai: "AI review",
};

const QA_SEVERITIES = [
  ["error", "Errors"],
  ["warning", "Warnings"],
  ["info", "Info"],
];

const qaView = {
  expanded: false,
  severities: new Set(["error", "warning", "info"]),
  origins: new Set(["rules", "variants", "ai"]),
  rule: "",
  file: "",
  query: "",
};

function appendQaMessage(panel, text, isError = false) {
  const message = document.createElement("p");
  message.className = isError ? "qa-message qa-error-text" : "qa-message";
  message.textContent = text;

  panel.appendChild(message);
}

function renderQaFinding(finding) {
  const item = document.createElement("div");
  item.className = `qa-finding qa-${finding.severity}`;

  const meta = document.createElement("div");
  meta.className = "qa-finding-meta";
  meta.textContent =
    `${finding.severity.toUpperCase()} · ${finding.rule}` +
    (qaView.expanded && finding.origin
      ? ` · ${QA_ORIGIN_LABELS[finding.origin]}`
      : "");

  const location = document.createElement("div");
  location.className = "qa-finding-location";
  location.textContent = finding.line
    ? `${finding.file}:${finding.line}`
    : finding.file;

  const message = document.createElement("div");
  message.textContent = finding.message;

  item.appendChild(meta);
  item.appendChild(location);
  item.appendChild(message);

  if (finding.detail) {
    const detail = document.createElement("div");
    detail.className = "qa-finding-suggestion";
    detail.textContent = finding.detail;
    item.appendChild(detail);
  }

  if (finding.suggestion) {
    const suggestion = document.createElement("div");
    suggestion.className = "qa-finding-suggestion";
    suggestion.textContent = `Fix: ${finding.suggestion}`;
    item.appendChild(suggestion);
  }

  return item;
}

function renderQaSection(panel, title, entry, showFindings = true) {
  if (!entry) {
    return;
  }

  const heading = document.createElement("div");
  heading.className = "qa-section-title";
  heading.textContent = title;
  panel.appendChild(heading);

  if (entry.pending) {
    appendQaProgress(panel, entry);
    return;
  }

  if (entry.error) {
    appendQaMessage(panel, entry.error, true);
    return;
  }

  const { findings } = entry.result;

  appendQaMessage(
    panel,
    entry.result.summary ??
      `${findings.length} finding${findings.length === 1 ? "" : "s"} in ${
        entry.result.filesReviewed
      } files${entry.result.model ? ` · ${entry.result.model}` : ""}`,
  );

  if (findings.length === 0 || !showFindings) {
    return;
  }

  const list = document.createElement("div");
  list.className = "qa-findings";
  findings.forEach((finding) => list.appendChild(renderQaFinding(finding)));
  panel.appendChild(list);
}

function collectQaFindings() {
  return Object.keys(QA_ORIGIN_LABELS).flatMap((kind) =>
    (qaState[kind]?.result?.findings ?? []).map((finding) => ({
      ...finding,
      origin: kind,
    })),
  );
}

function countQaBy(items, pick) {
  const counts = new Map();

  items.forEach((item) => {
    const key = pick(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  return [...counts].sort((a, b) => b[1] - a[1]);
}

function filterQaFindings(all) {
  const query = qaView.query.trim().toLowerCase();

  return all.filter(
    (finding) =>
      qaView.severities.has(finding.severity) &&
      qaView.origins.has(finding.origin) &&
      (!qaView.rule || finding.rule === qaView.rule) &&
      (!qaView.file || finding.file === qaView.file) &&
      (!query ||
        `${finding.message} ${finding.file} ${finding.rule} ${finding.detail ?? ""}`
          .toLowerCase()
          .includes(query)),
  );
}

function qaStatusText(kind, entry) {
  if (!entry) {
    return "Not run";
  }

  if (entry.pending) {
    return "Running";
  }

  if (entry.error) {
    return "Failed";
  }

  const { result } = entry;

  return kind === "variants"
    ? result.statusText
    : `${result.filesReviewed} files${result.model ? ` \u00b7 ${result.model}` : ""}`;
}

function qaHeading(text) {
  const heading = document.createElement("div");
  heading.className = "qa-side-title";
  heading.textContent = text;

  return heading;
}

function qaChip(label, active, onClick, variant = "") {
  const chip = document.createElement("button");

  chip.type = "button";
  chip.className = `qa-chip ${variant}${active ? " active" : ""}`.trim();
  chip.textContent = label;
  chip.addEventListener("click", onClick);

  return chip;
}

// Clicking a rule or file in the overview narrows the list to it.
function qaTopList(title, entries, key) {
  const wrapper = document.createElement("div");
  wrapper.appendChild(qaHeading(title));

  if (entries.length === 0) {
    appendQaMessage(wrapper, "Nothing yet.");
    return wrapper;
  }

  entries.slice(0, 8).forEach(([name, count]) => {
    const row = document.createElement("button");

    row.type = "button";
    row.className = qaView[key] === name ? "qa-top-row active" : "qa-top-row";
    row.title = qaView[key] === name ? "Show all" : "Show only this";
    row.innerHTML = "<span></span><strong></strong>";
    row.firstChild.textContent = name || "(no file)";
    row.lastChild.textContent = String(count);
    row.addEventListener("click", () => {
      qaView[key] = qaView[key] === name ? "" : name;
      renderQaPanel();
    });

    wrapper.appendChild(row);
  });

  return wrapper;
}

function renderQaStats(sidebar, all) {
  sidebar.appendChild(qaHeading("Overview"));

  const bySeverity = Object.fromEntries(
    QA_SEVERITIES.map(([severity]) => [
      severity,
      all.filter((finding) => finding.severity === severity).length,
    ]),
  );

  const cards = document.createElement("div");
  cards.className = "qa-cards";

  [["Total", all.length, "total"]]
    .concat(
      QA_SEVERITIES.map(([severity, label]) => [
        label,
        bySeverity[severity],
        severity,
      ]),
    )
    .forEach(([label, count, kind]) => {
      const card = document.createElement("div");

      card.className = `qa-card qa-card-${kind}`;
      card.innerHTML = "<strong></strong><span></span>";
      card.firstChild.textContent = String(count);
      card.lastChild.textContent = label;
      cards.appendChild(card);
    });

  sidebar.appendChild(cards);

  if (all.length > 0) {
    const bar = document.createElement("div");
    bar.className = "qa-bar";

    QA_SEVERITIES.forEach(([severity]) => {
      if (bySeverity[severity] > 0) {
        const part = document.createElement("span");

        part.className = `qa-bar-${severity}`;
        part.style.width = `${(bySeverity[severity] / all.length) * 100}%`;
        bar.appendChild(part);
      }
    });

    sidebar.appendChild(bar);
  }

  const table = document.createElement("table");
  table.className = "qa-table";
  table.innerHTML =
    "<thead><tr><th>Check</th><th>E</th><th>W</th><th>I</th></tr></thead>";

  const tbody = document.createElement("tbody");

  Object.entries(QA_ORIGIN_LABELS).forEach(([kind, label]) => {
    const own = all.filter((finding) => finding.origin === kind);
    const row = document.createElement("tr");
    const name = document.createElement("td");
    const status = document.createElement("small");

    name.textContent = label;
    status.textContent = qaStatusText(kind, qaState[kind]);
    name.appendChild(document.createElement("br"));
    name.appendChild(status);
    row.appendChild(name);

    QA_SEVERITIES.forEach(([severity]) => {
      const cell = document.createElement("td");

      cell.textContent = qaState[kind]?.result
        ? String(own.filter((finding) => finding.severity === severity).length)
        : "-";
      row.appendChild(cell);
    });

    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  sidebar.appendChild(table);

  sidebar.appendChild(
    qaTopList(
      "Files with most findings",
      countQaBy(all, (finding) => finding.file),
      "file",
    ),
  );
}

function qaFilterLabel(text) {
  const label = document.createElement("span");

  label.className = "qa-filter-label";
  label.textContent = text;

  return label;
}

function renderQaFilters(bar, all, shownCount) {
  const toggle = (set, value) => {
    if (set.has(value)) {
      set.delete(value);
    } else {
      set.add(value);
    }

    renderQaPanel();
  };

  const severities = document.createElement("div");
  severities.className = "qa-chips";
  severities.appendChild(qaFilterLabel("Severity"));
  QA_SEVERITIES.forEach(([severity, label]) => {
    const count = all.filter((finding) => finding.severity === severity).length;

    severities.appendChild(
      qaChip(
        `${label} ${count}`,
        qaView.severities.has(severity),
        () => toggle(qaView.severities, severity),
        `qa-chip-${severity}`,
      ),
    );
  });
  bar.appendChild(severities);

  const origins = document.createElement("div");
  origins.className = "qa-chips";
  origins.appendChild(qaFilterLabel("Test"));
  Object.entries(QA_ORIGIN_LABELS).forEach(([kind, label]) => {
    origins.appendChild(
      qaChip(
        label,
        qaView.origins.has(kind),
        () => toggle(qaView.origins, kind),
        "qa-chip-origin qa-origin-" + kind,
      ),
    );
  });
  bar.appendChild(origins);

  const select = (label, key, values) => {
    const dropdown = document.createElement("select");

    dropdown.className = "qa-select";
    dropdown.title = label;

    [
      ["", `All ${label.toLowerCase()}`],
      ...values.map((value) => [value, value || "(no file)"]),
    ].forEach(([value, name]) => {
      const option = document.createElement("option");

      option.value = value;
      option.textContent = name;
      dropdown.appendChild(option);
    });

    dropdown.value = qaView[key];
    dropdown.addEventListener("change", () => {
      qaView[key] = dropdown.value;
      renderQaPanel();
    });

    bar.appendChild(dropdown);
  };

  const rules = countQaBy(all, (finding) => finding.rule).map(([rule]) => rule);
  const files = countQaBy(all, (finding) => finding.file).map(([file]) => file);

  if (qaView.rule && !rules.includes(qaView.rule)) {
    qaView.rule = "";
  }

  if (qaView.file && !files.includes(qaView.file)) {
    qaView.file = "";
  }

  select("Rules", "rule", rules);
  select("Files", "file", files);

  const search = document.createElement("input");

  search.type = "search";
  search.className = "qa-search";
  search.placeholder = "Search messages";
  search.value = qaView.query;
  search.addEventListener("input", () => {
    qaView.query = search.value;
    renderQaPanel();
  });
  bar.appendChild(search);

  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "qa-link";
  clear.textContent = "Clear";
  clear.addEventListener("click", () => {
    qaView.severities = new Set(["error", "warning", "info"]);
    qaView.origins = new Set(Object.keys(QA_ORIGIN_LABELS));
    qaView.rule = "";
    qaView.file = "";
    qaView.query = "";
    renderQaPanel();
  });
  bar.appendChild(clear);

  const count = document.createElement("span");
  count.className = "qa-count";
  count.textContent = `Showing ${shownCount} of ${all.length}`;
  bar.appendChild(count);
}

function renderQaExpanded(panel) {
  const all = collectQaFindings();
  const filtered = filterQaFindings(all);

  const body = document.createElement("div");
  body.className = "qa-expanded-body";

  const sidebar = document.createElement("div");
  sidebar.className = "qa-sidebar";

  // Header and check buttons are built by getReviewPanel.
  sidebar.appendChild(panel.querySelector(".qa-panel-top"));

  // Finished checks are summarised in the overview table.
  const active = Object.entries(QA_ORIGIN_LABELS).filter(
    ([kind]) => qaState[kind]?.pending || qaState[kind]?.error,
  );

  if (active.length > 0) {
    sidebar.appendChild(qaHeading("Progress"));
  }

  active.forEach(([kind, label]) =>
    renderQaSection(sidebar, label, qaState[kind], false),
  );

  renderQaStats(sidebar, all);

  const results = document.createElement("div");
  results.className = "qa-results";

  const filterBar = document.createElement("div");
  filterBar.className = "qa-filter-bar";
  renderQaFilters(filterBar, all, filtered.length);
  results.appendChild(filterBar);

  const list = document.createElement("div");
  list.className = "qa-results-list";

  if (all.length === 0) {
    const running = active
      .filter(([kind]) => qaState[kind]?.pending)
      .map(([, label]) => label);

    appendQaMessage(
      list,
      running.length > 0
        ? `${running.join(" and ")} ${running.length > 1 ? "are" : "is"} running...`
        : qaState.rules || qaState.variants || qaState.ai
          ? "No findings."
          : "Choose a check on the left to start.",
    );
  } else {
    filtered.forEach((finding) => list.appendChild(renderQaFinding(finding)));
  }

  results.appendChild(list);

  body.appendChild(sidebar);
  body.appendChild(results);
  panel.appendChild(body);
}

const QA_SCROLL_AREAS = [".qa-panel", ".qa-sidebar", ".qa-results-list"];

// Set when a test starts so the compact panel jumps to the newest content once.
let qaScrollToEnd = false;

function renderQaPanel() {
  if (!qaPanelOpen) {
    return;
  }

  const scrolls = QA_SCROLL_AREAS.map((selector) => [
    selector,
    document.querySelector(selector)?.scrollTop ?? 0,
  ]);

  const search = document.activeElement?.classList?.contains("qa-search")
    ? document.activeElement
    : null;
  const caret = search?.selectionStart ?? 0;

  const panel = getReviewPanel();

  syncTopbar();

  if (qaView.expanded) {
    renderQaExpanded(panel);
  } else {
    renderQaSection(panel, "Code checks", qaState.rules);
    renderQaSection(panel, "Variant test", qaState.variants);
    renderQaSection(panel, "AI review", qaState.ai);

    if (!qaState.rules && !qaState.variants && !qaState.ai) {
      appendQaMessage(panel, "Choose a check above to start.");
    }
  }

  scrolls.forEach(([selector, top]) => {
    const element = document.querySelector(selector);

    if (element) {
      element.scrollTop = top;
    }
  });

  if (qaScrollToEnd) {
    qaScrollToEnd = false;

    if (!qaView.expanded) {
      panel.scrollTop = panel.scrollHeight;
    }
  }

  if (search) {
    const restored = panel.querySelector(".qa-search");

    restored?.focus();
    restored?.setSelectionRange(caret, caret);
  }
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && qaPanelOpen && qaView.expanded) {
    qaView.expanded = false;
    renderQaPanel();
  }
});

function appendQaProgress(panel, entry) {
  if (!entry.steps || entry.steps.length === 0) {
    appendQaMessage(panel, "Running...");
    return;
  }

  const list = document.createElement("ul");
  list.className = "qa-steps";

  entry.steps.slice(-6).forEach((step, index, shown) => {
    const item = document.createElement("li");
    const isCurrent = index === shown.length - 1;

    item.className = isCurrent ? "qa-step qa-step-current" : "qa-step";
    item.textContent = `${isCurrent ? "›" : "✓"} ${step}`;
    list.appendChild(item);
  });

  panel.appendChild(list);

  const seconds = Math.floor((Date.now() - entry.startedAt) / 1000);

  appendQaMessage(
    panel,
    `Elapsed ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`,
  );
}

function addQaStep(message) {
  const steps = qaState.ai.steps;
  const last = steps[steps.length - 1];

  // Repeated "Receiving" updates replace each other instead of piling up.
  if (last?.startsWith("Receiving") && message.startsWith("Receiving")) {
    steps[steps.length - 1] = message;
  } else {
    steps.push(message);
  }

  renderQaPanel();
}

async function readQaStream(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let outcome = null;

  const handle = (line) => {
    if (!line.trim()) {
      return;
    }

    const event = JSON.parse(line);

    if (event.type === "progress") {
      addQaStep(event.message);
    } else if (event.type === "result") {
      outcome = { result: event.result };
    } else if (event.type === "error") {
      outcome = { error: event.message };
    }
  };

  for (;;) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop();
    lines.forEach(handle);
  }

  handle(buffer);

  return outcome ?? { error: "The review ended without a result." };
}

// kind is "rules" (instant, no account needed) or "ai" (uses GitHub Copilot).
async function runQa(kind) {
  if (qaState[kind]?.pending) {
    return;
  }

  qaState[kind] = { pending: true, steps: [], startedAt: Date.now() };
  qaScrollToEnd = true;
  renderQaPanel();

  // Keeps the elapsed time moving between progress updates.
  const ticker = setInterval(renderQaPanel, 1000);

  try {
    const response = await fetch(kind === "rules" ? "/qa/lint" : "/qa/review", {
      method: "POST",
      headers: { "X-QA-Token": previewData.qaToken },
    });

    if (!response.ok) {
      const body = await response.json();
      throw new Error(body.error || "The review failed.");
    }

    qaState[kind] =
      kind === "rules"
        ? { result: await response.json() }
        : await readQaStream(response);
  } catch (error) {
    qaState[kind] = {
      error: error instanceof Error ? error.message : "The review failed.",
    };
  } finally {
    clearInterval(ticker);
    renderQaPanel();
  }
}

// --------------------------------------------------
// Variant test: loads every variant at every size and collects JS errors
// --------------------------------------------------

const VARIANT_TEST_SETTLE_MS = 3000;
const VARIANT_TEST_MAX_MS = 15000;
const VARIANT_TEST_WORKERS = 4;
const LOOP_STOP_SECONDS = 15;
const LOOP_CHECK_MAX_MS = 30000;
const URL_TYPES = ["image", "video", "audio"];

function contentProblems(content) {
  const problems = [];

  for (const [name, entry] of Object.entries(content)) {
    const value = entry?.value;

    if (
      value === undefined ||
      value === null ||
      (typeof value === "string" && !value.trim()) ||
      (Array.isArray(value) && value.length === 0)
    ) {
      problems.push(`${name} is empty`);
    } else if (
      URL_TYPES.includes(entry.type) &&
      !/^https?:\/\//i.test(String(value).trim())
    ) {
      problems.push(
        `${name} is not a valid URL ("${String(value).slice(0, 40)}")`,
      );
    }
  }

  return problems;
}

function describeElement(el) {
  const id = el.id ? `#${el.id}` : "";
  const classes = [...el.classList].map((name) => `.${name}`).join("");

  return `${el.tagName.toLowerCase()}${id}${classes}`;
}

// Text elements wider than their parent, even while hidden by the animation.
function findOverflowingText(doc) {
  const issues = [];

  try {
    doc.body?.querySelectorAll("*").forEach((el) => {
      const parent = el.parentElement;

      if (
        !parent ||
        ["SCRIPT", "STYLE", "BR"].includes(el.tagName) ||
        !el.textContent.trim()
      ) {
        return;
      }

      const style = doc.defaultView.getComputedStyle(parent);
      const available =
        parent.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight);

      if (!(available > 0) || !(el.offsetWidth > available + 1)) {
        return;
      }

      const selector = describeElement(el);
      const container = describeElement(parent);

      issues.push({
        kind: "layout",
        key: `${selector}|${container}`,
        message: `Text in "${selector}" is ${el.offsetWidth}px wide but its container "${container}" is only ${Math.round(available)}px, so the text sticks out`,
      });
    });
  } catch {
    // The banner navigated away or is not readable.
  }

  return issues;
}

const CLICK_EVENT_TYPES = ["click", "tap", "touchend", "mouseup", "pointerup"];
const CLICK_CALL = /\bCreative\s*\.\s*click\s*\(/;

// Elements with a jQuery handler that calls Creative.click, i.e. those meant to click out.
function findClickOutTargets(win) {
  const jq = win.jQuery;
  const doc = win.document;
  const targets = new Map();

  if (!jq?._data) {
    return targets;
  }

  const add = (el, type) => {
    const types = targets.get(el) ?? new Set();

    types.add(type);
    targets.set(el, types);
  };

  [doc, ...doc.querySelectorAll("*")].forEach((holder) => {
    const events = jq._data(holder, "events");

    CLICK_EVENT_TYPES.forEach((type) => {
      (events?.[type] ?? []).forEach((entry) => {
        if (!CLICK_CALL.test(String(entry.handler))) {
          return;
        }

        if (entry.selector) {
          try {
            holder
              .querySelectorAll(entry.selector)
              .forEach((el) => add(el, type));
          } catch {
            // Selector jQuery understands but the browser does not.
          }
        } else {
          add(holder === doc ? doc.body : holder, type);
        }
      });
    });
  });

  return targets;
}

// Native events, so errors in handlers are reported to the page instead of thrown here.
function fireClick(win, el, types) {
  types.forEach((type) => {
    const event =
      type === "click"
        ? new win.MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            view: win,
          })
        : new win.Event(type, { bubbles: true, cancelable: true });

    el.dispatchEvent(event);
  });
}

// Clicks every element that should click out and checks Creative.click really fires.
async function testClickOuts(iframe, content) {
  const issues = [];
  const win = iframe.contentWindow;

  try {
    if (!win?.document?.body) {
      return issues;
    }

    const fired = [];
    const problem = (key, message) =>
      issues.push({ kind: "click", key, message });

    win.open = () => null;
    win.addEventListener("click", (event) => event.preventDefault(), true);
    win.addEventListener("lemonpi.interaction/click", (event) =>
      fired.push(event.detail ?? {}),
    );

    const clickPlaceholders = Object.entries(content).filter(
      ([, entry]) => String(entry?.type).toLowerCase() === "click",
    );
    const names = new Set(clickPlaceholders.map(([name]) => name));
    const urls = new Set(
      clickPlaceholders
        .map(([, entry]) => String(entry.value ?? ""))
        .filter(Boolean),
    );
    const targets = findClickOutTargets(win);

    if (targets.size === 0) {
      const middle =
        win.document.elementFromPoint(
          win.innerWidth / 2,
          win.innerHeight / 2,
        ) ?? win.document.body;

      fireClick(win, middle, new Set(["click"]));

      if (fired.length === 0) {
        problem(
          "none",
          "Nothing in the banner triggers a click-out: no handler calls Creative.click and clicking the middle of the banner does nothing",
        );
      }
    }

    for (const [el, types] of targets) {
      const label = describeElement(el);

      fired.length = 0;
      fireClick(win, el, types);

      if (fired.length === 0) {
        problem(
          `${label}|none`,
          `Clicking "${label}" does not trigger a click-out, although its handler calls Creative.click`,
        );
      }

      fired.forEach((detail) => {
        const name = detail.placeholder;

        if (name === undefined || name === null || name === "") {
          problem(
            `${label}|noname`,
            `"${label}" calls Creative.click without a placeholder name`,
          );
        } else if (names.size > 0 && !names.has(String(name))) {
          const options = [...names].join(", ");

          problem(
            urls.has(String(name))
              ? `${label}|url`
              : `${label}|unknown|${name}`,
            urls.has(String(name))
              ? `"${label}" passes the click URL to Creative.click instead of the placeholder name, so the click-out fails (use one of: ${options})`
              : `"${label}" calls Creative.click with "${String(name).slice(0, 60)}", which is not a click placeholder of this banner (click placeholders: ${options})`,
          );
        }
      });
    }
  } catch {
    // The banner navigated away or is not readable.
  }

  return issues;
}

// GSAP animations still playing 15 seconds after the banner started, such as endless loops.
function findLongAnimations(win) {
  const gsap = win.gsap;

  if (!gsap?.globalTimeline) {
    return [];
  }

  try {
    const active = gsap.globalTimeline
      .getChildren(true, true, false)
      .filter((tween) => tween.isActive());

    if (active.length === 0) {
      return [];
    }

    const loopsForever = (animation) => {
      for (
        let node = animation;
        node && node !== gsap.globalTimeline;
        node = node.parent
      ) {
        if (node.repeat?.() === -1) {
          return true;
        }
      }

      return false;
    };

    const targets = [
      ...new Set(
        active.flatMap((tween) =>
          tween
            .targets()
            .filter((target) => target instanceof win.Element)
            .map(describeElement),
        ),
      ),
    ].slice(0, 4);

    return [
      {
        kind: "loop",
        key: "loop",
        message:
          `${active.some(loopsForever) ? "An endless GSAP loop is" : "GSAP animations are"} still running ${LOOP_STOP_SECONDS} seconds after the banner started` +
          (targets.length ? ` (for example on ${targets.join(", ")})` : "") +
          `. Animations must stop after ${LOOP_STOP_SECONDS} seconds`,
      },
    ];
  } catch {
    return [];
  }
}

function testBannerFrame(width, height, content, longCheck = false) {
  return new Promise((resolve) => {
    const errors = [];
    const iframe = document.createElement("iframe");
    let finished = false;
    let settleTimer;

    // In the viewport but invisible, so the banner's animation loop still runs.
    iframe.style.cssText = `position:fixed;left:0;top:0;width:${width}px;height:${height}px;border:0;opacity:0;pointer-events:none;z-index:-1`;
    iframeConfigs.set(iframe, content);

    const finish = async () => {
      if (finished) {
        return;
      }

      finished = true;
      clearTimeout(settleTimer);
      clearTimeout(maxTimer);

      const warnings = iframe.contentDocument
        ? findOverflowingText(iframe.contentDocument)
        : [];
      const loopIssues = longCheck
        ? findLongAnimations(iframe.contentWindow)
        : [];

      const clickIssues = await testClickOuts(iframe, content);

      window.removeEventListener("message", onMessage);
      iframe.remove();
      resolve({
        errors: [...errors, ...loopIssues, ...clickIssues],
        warnings,
      });
    };

    const onMessage = (event) => {
      if (event.source !== iframe.contentWindow) {
        return;
      }

      if (event.data?.type === "qa-runtime-error") {
        // Errors after this point come from the click test itself.
        if (finished) {
          return;
        }

        const failedUrl =
          event.data.kind === "resource"
            ? event.data.message.replace("Failed to load ", "")
            : "";

        // An empty placeholder used as a src resolves to the banner page itself.
        // The per-size stylesheet is optional; Creative.js continues without it.
        if (
          failedUrl === iframe.src ||
          failedUrl.endsWith(`/dimensions/${width}x${height}.css`)
        ) {
          return;
        }

        errors.push(event.data);
      } else if (event.data?.type === "creative-ready") {
        if (longCheck) {
          // Measured from the moment the animation starts.
          clearTimeout(settleTimer);
          settleTimer = setTimeout(finish, LOOP_STOP_SECONDS * 1000 + 500);
        } else {
          setTimeout(finish, 500);
        }
      }
    };

    const maxTimer = setTimeout(
      finish,
      longCheck ? LOOP_CHECK_MAX_MS : VARIANT_TEST_MAX_MS,
    );

    window.addEventListener("message", onMessage);
    iframe.addEventListener("load", () => {
      settleTimer = setTimeout(
        finish,
        longCheck ? LOOP_CHECK_MAX_MS - 5000 : VARIANT_TEST_SETTLE_MS,
      );
    });

    iframe.src =
      `/src/index.html?_lemonpiPreview&_qaCapture=1` +
      `&width=${width}&height=${height}`;
    document.body.appendChild(iframe);
  });
}

function summarizeVariantTest(results, total, skipped) {
  const failed = results.filter((result) => result.errors.length > 0);
  const withWarnings = results.filter((result) => result.warnings.length > 0);
  const groups = new Map();

  for (const result of results) {
    const seen = new Set();

    for (const error of [...result.errors, ...result.warnings]) {
      const key =
        error.kind === "resource"
          ? "resource"
          : error.kind === "layout" ||
              error.kind === "click" ||
              error.kind === "loop"
            ? `${error.kind}|${error.key}`
            : [error.message, error.file, error.line].join("|");

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);

      const group = groups.get(key) ?? { error, results: [] };
      group.results.push(result);
      groups.set(key, group);
    }
  }

  const findings = [...groups.values()]
    .sort((a, b) => b.results.length - a.results.length)
    .map(({ error, results: affected }) => {
      const ids = [...new Set(affected.map((result) => result.id))];
      const first = affected[0];
      const sizes = [...new Set(affected.map((result) => result.size))].sort(
        (a, b) => parseInt(a, 10) - parseInt(b, 10),
      );
      const shown =
        ids.slice(0, 5).join(", ") +
        (ids.length > 5 ? ` and ${ids.length - 5} more` : "");

      const isClick = error.kind === "click";

      return {
        severity: error.kind === "layout" ? "warning" : "error",
        rule:
          error.kind === "layout"
            ? "RUN-002"
            : isClick
              ? "CLK-002"
              : error.kind === "loop"
                ? "ANI-002"
                : "RUN-001",
        file: error.file ?? "",
        line: error.line || undefined,
        message:
          error.kind === "resource"
            ? `A file failed to load, for example ${error.message.replace("Failed to load ", "")}`
            : error.message,
        detail:
          `${affected.length} banner${affected.length === 1 ? "" : "s"} affected in ${ids.length} variant${ids.length === 1 ? "" : "s"}: ${shown}. ` +
          `Sizes: ${sizes.join(", ")}. ` +
          (error.kind === "loop"
            ? `Only the first variant of each size is checked for this. `
            : "") +
          `First seen in variant "${first.id}" at ${first.size}.` +
          (error.kind !== "resource" &&
          error.kind !== "layout" &&
          first.problems.length
            ? ` Placeholder issues in that variant: ${first.problems.join(", ")}.`
            : ""),
      };
    });

  return {
    findings,
    statusText: `${failed.length} of ${total} banners failed`,
    summary:
      `Tested ${total} banners (${variants.length} variants, ${dimensions.length} sizes)` +
      (skipped ? `, ${skipped} skipped for missing content` : "") +
      `: ${failed.length} had errors` +
      (withWarnings.length
        ? `, ${withWarnings.length} had layout warnings`
        : "") +
      ".",
  };
}

async function runVariantTest() {
  if (qaState.variants?.pending) {
    return;
  }

  const jobs = [];

  variants.forEach((variant) =>
    dimensions.forEach((dimension) => {
      if (
        variant.dimensions?.some(
          (item) =>
            item.width === dimension.width && item.height === dimension.height,
        )
      ) {
        jobs.push({ variant, dimension });
      }
    }),
  );

  // The 15 second animation check runs once per size, on its first variant.
  const checkedSizes = new Set();

  jobs.forEach((job) => {
    const size = `${job.dimension.width}x${job.dimension.height}`;

    job.longCheck = !checkedSizes.has(size);
    checkedSizes.add(size);
  });
  jobs.sort((a, b) => Number(b.longCheck) - Number(a.longCheck));

  if (jobs.length === 0) {
    qaState.variants = { error: "There are no variants with content to test." };
    renderQaPanel();
    return;
  }

  const skipped = variants.length * dimensions.length - jobs.length;
  const results = [];
  let next = 0;

  qaState.variants = {
    pending: true,
    steps: [`Tested 0 of ${jobs.length}`],
    startedAt: Date.now(),
  };
  qaScrollToEnd = true;
  renderQaPanel();

  const ticker = setInterval(renderQaPanel, 1000);

  const worker = async () => {
    while (next < jobs.length) {
      const { variant, dimension, longCheck } = jobs[next++];
      const content = getExportContent(
        variant,
        dimension.width,
        dimension.height,
      );
      const { errors, warnings } = await testBannerFrame(
        dimension.width,
        dimension.height,
        content,
        longCheck,
      );

      results.push({
        id: String(variant.contentId ?? variant.variantId ?? "?"),
        size: `${dimension.width}x${dimension.height}`,
        errors,
        warnings,
        problems: contentProblems(content),
      });

      qaState.variants.steps = [`Tested ${results.length} of ${jobs.length}`];
      renderQaPanel();
    }
  };

  try {
    await Promise.all(Array.from({ length: VARIANT_TEST_WORKERS }, worker));
    qaState.variants = {
      result: summarizeVariantTest(results, jobs.length, skipped),
    };
  } catch (error) {
    qaState.variants = {
      error: error instanceof Error ? error.message : "The test failed.",
    };
  } finally {
    clearInterval(ticker);
    renderQaPanel();
  }
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
  previewTitle.textContent = previewTitleText();

  topbar.appendChild(previewTitle);
  topbar.appendChild(qaToggle);
  topbar.appendChild(codeReviewButton);
  topbar.appendChild(topbarResize);
  topbar.appendChild(topbarClose);
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
