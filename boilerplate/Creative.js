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
  addWait: function (...elements) {
    const waits = elements
      .flatMap((element) =>
        element instanceof jQuery ? element.toArray() : [element],
      )
      .filter(Boolean)
      .map(
        (el) =>
          new Promise((resolve) => {
            if (el.complete) {
              resolve();
              return;
            }

            el.addEventListener("load", resolve, { once: true });
            el.addEventListener("error", resolve, { once: true });
          }),
      );

    this.waits.push(...waits);

    return Promise.all(waits);
  },

  awaitAll: function () {
    return Promise.all(this.waits);
  },
  /* AUTO_SCALE_FONT */
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
