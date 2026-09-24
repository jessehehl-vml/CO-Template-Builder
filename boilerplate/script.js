/**
 * {{PROJECT_NAME}}{{DIMENSION_SUFFIX}}
 * @Owner {{OWNER}}
 * @Date {{DATE}}
 */

// variables
let userInteracted = false;
let userInteracting = false;
const mainTimeline = gsap.timeline({ paused: true });
/* FRAME_TIMELINES */

// ============================================================
// Initialization
// ============================================================

async function initCreative(content) {
  console.log("[Creative] initCreative");

  setContent(content);
  createTheme(content);
  createInteraction();

  await Creative.awaitAll();

  startAnimations();
  await Creative.autoScaleFont();
  mainTimeline.play();
}

// ============================================================
// Content
// ============================================================

function setContent(content) {
  /* AUTO_FILL_PLACEHOLDER_CONTENT */
}

function createTheme(content) {}

// ============================================================
// Interaction
// ============================================================

function createInteraction(content) {
  $("#creative_container")
    .on("mouseenter", userEnter)
    .on("mouseleave", userLeave) /* INTERACTION_CODE */;
}

function userEnter() {
  userInteracted = true;
  userInteracting = true;
}

function userLeave() {
  userInteracting = false;
}

// ============================================================
// Animation
// ============================================================

/* FRAME_ANIMATIONS */

// ============================================================
// Start
// ============================================================

Creative.start();
