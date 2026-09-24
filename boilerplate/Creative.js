window.Creative = {
  get width() {
    return document.documentElement.clientWidth;
  },

  get height() {
    return document.documentElement.clientHeight;
  },

  get environment() {
    if (["127.0.0.1", "localhost"].includes(window.location.hostname))
      return "localhost";

    if (
      window.location.hostname.indexOf(
        "lemonpi-prod-templates.s3.amazonaws.com",
      ) > -1
    )
      return "co";

    return "live";
  },

  get isLive() {
    return this.environment === "live";
  },

  get isPreview() {
    return new URLSearchParams(window.location.search).has("_lemonpiPreview");
  },
  frames: /* FRAME_COUNT */ 1,
  loadDimensionStyles: function () {
    if (!this.isPreview) return;

    const params = new URLSearchParams(window.location.search);
    const width = params.get("width");
    const height = params.get("height");

    if (!width || !height) return;

    const wait = new Promise((resolve) => {
      const stylesheet = document.createElement("link");

      stylesheet.rel = "stylesheet";
      stylesheet.href = `dimensions/${width}x${height}.css`;

      stylesheet.addEventListener("load", resolve, { once: true });
      stylesheet.addEventListener("error", resolve, { once: true });

      document.head.appendChild(stylesheet);
    });

    this.waits.push(wait);

    return wait;
  },
  waits: [document.fonts.ready],
  addWait: function (element) {
    const el = element instanceof jQuery ? element[0] : element;

    if (!el) {
      return;
    }

    const wait = new Promise((resolve) => {
      if (el.complete) {
        resolve();
        return;
      }

      el.addEventListener("load", resolve, { once: true });
      el.addEventListener("error", resolve, { once: true });
    });

    this.waits.push(wait);

    return wait;
  },

  awaitAll: function () {
    return Promise.all(this.waits);
  },
  autoScaleFont: function (minSize = 8, selector = "[data-font_autoscale]") {
    const elements = $(selector).toArray();

    return Promise.all(
      elements.map((element) => {
        return new Promise((resolve) => {
          const parent = element;
          const child = parent.firstElementChild;

          if (!child) {
            resolve();
            return;
          }

          const styles = window.getComputedStyle(parent);

          let fontSize = parseFloat(styles.fontSize);
          const maxHeight = parseFloat(styles.maxHeight);
          const parentWidth = parent.getBoundingClientRect().width;

          if (
            !Number.isFinite(fontSize) ||
            !Number.isFinite(maxHeight) ||
            !parentWidth
          ) {
            resolve();
            return;
          }

          const fits = () => {
            const rect = child.getBoundingClientRect();

            return rect.height <= maxHeight && rect.width <= parentWidth;
          };

          const reduceFontSize = () => {
            if (fits() || fontSize <= minSize) {
              resolve();
              return;
            }

            fontSize -= 0.5;
            parent.style.fontSize = `${fontSize}px`;

            requestAnimationFrame(reduceFontSize);
          };

          requestAnimationFrame(reduceFontSize);
        });
      }),
    );
  },
  click: function (url, query) {
    window.dispatchEvent(
      new CustomEvent("lemonpi.interaction/click", {
        detail: {
          placeholder: url,
          query,
        },
      }),
    );
  },

  start: function () {
    this.loadDimensionStyles();

    lemonpi.subscribe((content) => {
      initCreative(content);
    });
  },
};
