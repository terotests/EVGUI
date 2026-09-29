/**
 * The demo page.
 *
 * Every control rebuilds the tree: the page holds a handful of plain values,
 * hands them to whichever demo is selected, and paints whatever comes back.
 * There is no diff and nothing is patched — a tree literal builds, and building
 * again is how a change is shown.
 *
 * Three things come out of that one tree, and this file is mostly about keeping
 * them the same thing:
 *
 *   displayListJson()   what to draw
 *   hitId(x, y)         what is under the pointer — topmost, so a click inside
 *                       an open panel reaches the panel and not the trigger it
 *                       covers
 *   a11yJson()          what it MEANS, mirrored into real DOM over the canvas,
 *                       because a canvas hands a screen reader one empty
 *                       graphic no matter what was drawn into it
 *
 * A reader activating a mirrored node is answered by pressing the app at that
 * node's rectangle — the same path a mouse takes, so there is no second set of
 * commands to keep in step and a button that moved is still pressed where it
 * now is.
 */

import { renderDisplayList, surfaceEffect } from "../../../lib/evg/gl/evg-webgl.js";
import { createA11yMirror, pressAtCentre } from "../../../lib/evg/gl/evg-a11y.js";
import { createTextInputBridge } from "../../../lib/evg/gl/evg-textinput.js";
// Dev tools for a canvas. Loaded always and attached only when the page is
// asked for it with `?inspect=1`, so a demo that nobody is inspecting pays
// one import and no work at all.
import { attach as attachInspector } from "../../../lib/evg/inspect/evg-inspect.js";
import { MenubarDemo, ToolbarDemo, SortableDemo, MotionDemo, TableDemo, DropdownDemo, DialogDemo, TreeDemo, TimelineDemo, ResizeDemo, FormDemo, ProfileDemo, DashboardDemo, CalendarDemo, FilterDemo, EventCalDemo, MessageDemo, ControlsDemo, OtpDemo, MetadataDemo, EffectsDemo, SeparatorDemo, TabsDemo, MODULES } from "./generated-host.js";
// The effect driver: what turns a press on the canvas into the events a
// surface effect reads. It is per HOST and not per demo, because a press is a
// browser event and the box it landed in is already in the display list.
import { createEffectDriver } from "../../../lib/evg/gl/evg-fx.js";
import { parsePresets } from "../../../lib/evg/gl/effect-presets.js";
// The browser measures text for every layout the demos build: the same face
// the painter draws with, through canvas `measureText`, in place of the
// advance table. Installed before any demo is constructed, because a demo
// that keeps a layout makes it when it is made.
import { installCanvasMeasurer } from "../../../lib/evg/gl/evg-measure.js";
// The whole modules too: `keptTree` needs EVGStyleSheet, EVGLayout and the
// rest out of the same bundle the tree was built by. Two copies of a class
// are two classes.
import * as ToolbarModule from "../bin/ToolbarDemo.cjs";
import * as SortableModule from "../bin/SortableDemo.cjs";
const fontMeasure = installCanvasMeasurer(MODULES);
// A demo's stylesheet: the one the Styles panel saved for it in this browser,
// or the one it ships with. Every `init` below goes through this, so an edited
// sheet is in force from the first frame after a reload — not applied over
// the default afterwards, which would leave anything the edit removed behind.
const cssFor = (name, dflt) => storedCss(name) ?? dflt;
// Made at the end of this file, once every demo exists; `syncChrome` tells it
// when the demo on screen changes.
let stylesPanel = null;
window.__fontMeasure = fontMeasure;
import { AccordionDemo } from "./generated-host.js";
import { ACCORDION_CSS } from "./generated.js";
import { PopoverDemo } from "./generated-host.js";
import { POPOVER_CSS } from "./generated.js";
import { AutocompleteDemo } from "./generated-host.js";
import { AUTOCOMPLETE_CSS } from "./generated.js";
import { PaginationDemo } from "./generated-host.js";
import { PAGINATION_CSS } from "./generated.js";
import { RadioGroupDemo } from "./generated-host.js";
import { RADIO_CSS } from "./generated.js";
import { RatingDemo } from "./generated-host.js";
import { RATING_CSS } from "./generated.js";
import { KanbanDemo } from "./generated-host.js";
import { KANBAN_CSS } from "./generated.js";
import { DrawerDemo } from "./generated-host.js";
import { DRAWER_CSS } from "./generated.js";
import { ComboboxDemo } from "./generated-host.js";
import { COMBOBOX_CSS } from "./generated.js";
import { ColorPickerDemo } from "./generated-host.js";
import { COLORPICKER_CSS } from "./generated.js";
import { QuestionnaireDemo } from "./generated-host.js";
import { QUESTIONNAIRE_CSS } from "./generated.js";
import { SelectDemo } from "./generated-host.js";
import { SELECT_CSS } from "./generated.js";
import { WindowDemo } from "./generated-host.js";
import { WINDOW_CSS } from "./generated.js";
import { EVG_CSS_FACTS } from "./generated.js";
// The Styles panel: a guide to each demo's classes and a live editor for its
// stylesheet. See styles-panel.js. The one compiled module it borrows is only
// for the ENGINE's classes (EVGStyleSheet, EVGElement, EVGReject) — every
// demo carries an identical copy of lib/evg.
import { ComboboxDemoModule } from "./generated-host.js";
import { storedCss, createStylesPanel } from "./styles-panel.js";
import { MENUBAR_CSS, TOOLBAR_CSS, SORTABLE_CSS, MOTION_CSS, TABLE_CSS, DROPDOWN_CSS, DIALOG_CSS, TREE_CSS, TIMELINE_CSS, RESIZE_CSS, FORM_CSS, PROFILE_CSS, DASHBOARD_CSS, CALENDAR_CSS, FILTERS_CSS, EVENTCAL_CSS, MESSAGE_CSS, CONTROLS_CSS, OTP_CSS, METADATA_CSS, EFFECTS_CSS, SEPARATOR_CSS, TABS_CSS, EFFECT_PRESETS_CSS } from "./generated.js";

// The default stage width. A demo wider than this says so — the dashboard
// grew to 1336 when its sidebar arrived, and a stage that stays 1240 does not
// report the extra, it crops it.
const W = 1240;

const SORTABLE_IDS = ["demo", "spec", "video", "audio", "extra"];

const state = {
  which: "menubar",
  // The sortable's whole state: an order, and what is being carried. There is
  // no move and no animation — the tree is rebuilt from this list, which is
  // the claim the rest of this directory makes about tree literals.
  order: SORTABLE_IDS.slice(),
  dragging: "",
  // Where the carried row would land if the pointer let go now, and where its
  // floating copy currently is. The ORDER is not touched until the drop — see
  // `dragSortable`.
  over: "",
  previewX: 0,
  previewY: 0,
  // Only a POINTER drag floats a copy. A keyboard pick-up moves the row with
  // the arrow keys and never leaves the list, so there is nothing following
  // anything and a preview would be a lie about where the row is.
  floating: false,
  bold: true,
  italic: false,
  underline: false,
  align: "center",
  // The app's focus, and the app's alone. The mirror never reports focus back:
  // a mirror that does gets into a loop with the app that is setting it.
  focus: "",
};


/**
 * A kept tree for a demo that otherwise rebuilds.
 *
 * The three original demos here rebuild on every change, and that is the claim
 * the directory makes: reordering is rebuilding. It is still true — but it made
 * them inert. A tree rebuilt between two frames has different ELEMENTS in it,
 * and hover is a flag on an element while a transition is a memory held by one.
 * So the demos had no hover colour, no press feedback and no motion at all, and
 * the page could not have given them any.
 *
 * The fix is to be precise about what "a change" is. DATA — the order, which
 * menu is open, whether the bar is at the bottom — is rebuilt, exactly as
 * before. HOVER IS NOT DATA. It is a presentational state the stylesheet owns,
 * so it sets a flag on the tree that is already there, and the transition
 * machinery has the identity it needs.
 *
 * `key` is what decides which of the two happened: a string of everything the
 * builder is handed except the stylesheet.
 */
function keptTree(mod, css, label, initialSize) {
  let size = initialSize.slice();
  const sheet = new mod.EVGStyleSheet();
  sheet.parse(css);
  const transitions = new mod.EVGTransition();
  let root = null;
  let key = null;
  let hovered = "";
  let pressed = "";

  // Hover and press are the element's own business, read off the one id under
  // the pointer. Nothing walks up the tree: a row is hovered, its label is not.
  const mark = (el) => {
    const own = el.id !== "";
    el.isHovered = own && el.id === hovered;
    el.isPressed = own && el.id === pressed;
    for (let i = 0; i < el.children.length; i++) mark(el.children[i]);
  };

  // Kept across frames, so a frame that changes nothing geometric can reuse
  // the positions rather than recompute them. There is no "is this the same
  // tree" check: a freshly built tree has no element the sheet has written to
  // and a reconciled one has had every element overwritten, so either reports
  // itself layout-dirty and lays out without being asked.
  let lay = null;

  const laidOut = () => {
    sheet.setViewport(size[0], size[1], false);
    mark(root);
    sheet.applyTree(root, "");
    // The sheet has written what it WANTS; this leaves on the element what is
    // actually showing, which for a property in flight is neither end.
    transitions.reconcileTree(root);
    if (!lay) {
      lay = new mod.EVGLayout();
      lay.setPageSize(size[0], size[1]);
      lay.layout(root);
      return lay;
    }
    // The invalidation decision. `layoutClean()` is true when nothing the
    // sheet wrote this pass can have moved a box — a hover that changes a
    // colour, a transform, an opacity. On a large page that is most of the
    // frame; see lib/evg/EVGInvalidateTest.rgr for what it is allowed to
    // mean and the one thing it cannot see (a bare `textContent` edit, which
    // nothing here does: text comes from a rebuild).
    if (!sheet.layoutClean()) lay.layout(root);
    return lay;
  };

  const reconciler = new mod.EVGReconcile();

  return {
    /** The stylesheet, replaced in place: the tree and its flights stay. */
    reload(css) {
      sheet.reload(css);
      lay = null;
    },
    /** Rebuild only if the data changed. */
    sync(nextKey, build) {
      if (nextKey === key) return;
      key = nextKey;
      root = build();
    },
    /**
     * Rebuild EVERY time, and keep the elements.
     *
     * `sync` above is the old answer to a problem that has a real one now: a
     * tree built from scratch has different elements in every position, so
     * anything an element remembers — a flight, most of all — is gone, and the
     * only way to keep it was to not rebuild. `EVGReconcile` matches the new
     * children against the live ones by key and moves the elements instead of
     * replacing them, so a rebuild is once again the way to say what changed.
     *
     * The first call has nothing to reconcile against and simply takes the
     * tree.
     */
    rebuild(build) {
      const next = build();
      if (!root) {
        root = next;
        return;
      }
      reconciler.resetStats();
      reconciler.reconcile(root, next);
    },
    /** How the last rebuild went, for a page that wants to prove it works. */
    reconcileStats: () => reconciler.stats,
    /**
     * The page size the tree is laid out at, and a way to change it. The
     * stylesheet's `@media` blocks read the same numbers, so a phone-width
     * page is a narrow LAYOUT, not a shrunken picture of a wide one — see
     * `fitDemo`. A new size drops the kept layout: its page box is stale.
     */
    size: () => size,
    resize(w, h) {
      if (w === size[0] && h === size[1]) return;
      size = [w, h];
      lay = null;
    },
    setHover(id) {
      if (id === hovered) return false;
      hovered = id;
      return true;
    },
    setPressed(id) {
      pressed = id;
    },
    tick(dt) {
      transitions.advanceTree(root, dt);
      return transitions.busy(root);
    },
    busy: () => transitions.busy(root),
    /**
     * The kept tree itself, for the one thing a rebuild cannot express: a
     * value that changes on every pointer move. Putting it in the sync key
     * rebuilds the tree sixty times a second, and then NOTHING on the page can
     * animate — every element is new every frame, so every flight establishes
     * at its destination. Measured before it was believed: the rows making
     * room for a dragged item were at their final positions 40ms after the
     * pointer crossed, having travelled through nothing.
     */
    root: () => root,
    list() {
      const lay = laidOut();
      const dl = new mod.EVGDisplayList();
      dl.setTextEngine(lay.getTextEngine());
      dl.build(root);
      return dl.toJson();
    },
    hit(x, y) {
      laidOut();
      return new mod.EVGHitTest().idAt(root, x, y);
    },
    a11y(gen, focus) {
      laidOut();
      return new mod.EVGA11yFromTree().build(root, label, gen, focus).toJson();
    },
  };
}

let generation = 0;

/**
 * The motion showcase, and the one demo on this page that does NOT rebuild.
 *
 * A transition is a property of an ELEMENT — it remembers where the colour was
 * when the pointer arrived. Rebuild the tree and that memory is gone, so every
 * transition would establish itself at its destination and nothing would ever
 * move. This host is therefore built once and kept, and the page only sets
 * flags on it. Everything else here still rebuilds, which is the claim the
 * other three demos exist to make.
 */
let lastHover = "";
let lastTableHover = "";
const motion = new MotionDemo();
motion.init(cssFor("motion", MOTION_CSS));

/**
 * The table, and the second demo here that keeps its tree.
 *
 * A PRESS changes the data and rebuilds; the pointer moving does not, so it
 * only sets a flag. That is the same split `keptTree` makes for the other
 * three, and the reason both of them can animate at all.
 *
 * Its state is `TableCtl`'s — the controller the conformance harness measures
 * against TanStack — so the demo owns the look and nothing else. Writing the
 * sort cycle again here would be writing an untested second copy of the only
 * hard part of a table.
 */
const table = new TableDemo();
table.init(cssFor("table", TABLE_CSS));

/**
 * The dropdown menu, and the third demo here that keeps its tree.
 *
 * The one whose state is not its own AT ALL. `MenuCtl` — the controller the
 * conformance harness measures against @radix-ui/react-dropdown-menu — owns
 * open/closed, the roving focus, the submenu stack and every key; this file
 * routes the pointer and the keyboard into it and paints what it says. So the
 * demo's keyboard is not a demo keyboard: it is the measured one, and the
 * menubar demo above it (which has its own, written by hand and matched
 * against nothing) is the counter-example this exists to retire.
 *
 * It is also the first demo with a clock the CONTROLLER owns: a submenu opens
 * 100ms after the pointer settles on its row, so `tick` has to keep running
 * while that wait is outstanding even though nothing is moving on screen.
 */
const dropdown = new DropdownDemo();
dropdown.init(cssFor("dropdown", DROPDOWN_CSS));
let lastDropdownHover = "";

/**
 * The accordion: three lists, each an `AccordionCtl` — the controller
 * measured against @radix-ui/react-accordion — which owns what is open, the
 * single / multiple / collapsible rules and the keyboard. The demo owns the
 * look, the focus and its page's height, which follows the open items.
 */
const accordion = new AccordionDemo();
accordion.init(cssFor("accordion", ACCORDION_CSS));
let lastAccordionHover = "";

/**
 * The dialog patterns: shadcn / ReUI's Dialog, three ways, and an alert
 * dialog. Open/closed, the focus on open, Escape, the overlay press and the
 * focus back to the trigger are DialogCtl's and AlertDialogCtl's; the fields
 * are InputCtls behind the page's text session, like the form's.
 */
let dialog = new DialogDemo();
dialog.init(cssFor("dialog", DIALOG_CSS));
let lastDialogHover = "";

/**
 * The tree. Every arrow, Home, End, Enter and Space on this page is answered
 * by `TreeCtl` — the same controller three conformance specs run against — so
 * the demo owns the look and not one rule of the behaviour.
 */
const treeview = new TreeDemo();
treeview.init(cssFor("tree", TREE_CSS));

// The timeline. The one demo on this page with no controller behind it,
// because there is nothing to control: a list of records and one integer.
const timeline = new TimelineDemo();
timeline.init(cssFor("timeline", TIMELINE_CSS));

// Nested resizable panels, with a breadcrumb in the left one that gives way as
// the panel narrows. The one demo here whose CONTENT depends on its own size.
const resize = new ResizeDemo();
resize.init(cssFor("resizable", RESIZE_CSS));
let form = new FormDemo();
form.init(cssFor("form", FORM_CSS));
let lastFormHover = "";
let profile = new ProfileDemo();
profile.init(cssFor("profile", PROFILE_CSS));
let lastProfileHover = "";
// The calendar. `CalendarCtl` answers every key and every click here — the
// same controller `ui:calendar:check` runs against react-day-picker — so this
// demo owns the look and not one rule of the month arithmetic.
const calendar = new CalendarDemo();
calendar.init(cssFor("calendar", CALENDAR_CSS));

// The filter bar. `FilterCtl` decides every predicate here — the same
// controller `ui:filters:check` runs against @tanstack/table-core — and the
// list of matching tasks under the chips is that controller's answer, not a
// second opinion drawn to look like one.
const filters = new FilterDemo();
filters.init(cssFor("filters", FILTERS_CSS));
let lastFiltersHover = "";

// The event calendar. Where each box sits is `EventCalCtl`'s answer, measured
// against a rendered @schedule-x/calendar; this page turns its fractions into
// pixels and nothing else.
const eventcal = new EventCalDemo();
eventcal.init(cssFor("eventcal", EVENTCAL_CSS));
eventcal.useClock(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate(), new Date().getHours() * 60 + new Date().getMinutes(), -new Date().getTimezoneOffset());
let lastEventcalHover = "";

// The chat transcript. It had a headless render entry and its own gate and was
// never in this file at all — so it passed every check while being absent from
// the only place a person looks. That is the same shape of hole as a
// controller with no surface, one level up.
let message = new MessageDemo();
message.init(cssFor("message", MESSAGE_CSS));
let lastMessageHover = "";

// A stepper, a progress bar and a number field on one panel. They are together
// because the INTERACTION is the thing worth showing: filling the field
// completes the step, which moves the bar and enables Next.
let controls = new ControlsDemo();
controls.init(cssFor("controls", CONTROLS_CSS));

// The one-time code. `OtpCtl` is measured against input-otp — the library
// behind shadcn's Input OTP — in `ui:otp:check`; this page draws the slots and
// wires Verify to a complete code.
let otp = new OtpDemo();
otp.init(cssFor("otp", OTP_CSS));
let lastOtpHover = "";
// The M-Files metadata card: two comboboxes (one with chips), three text
// fields, a date field and a segmented Yes/No, on one label column. The
// combobox is measured against Base UI in `ui:combobox:check`; this page is
// where its list has to open UNDER its box and above the rows below it.
let metadata = new MetadataDemo();
metadata.init(cssFor("metadata", METADATA_CSS));
let lastMetadataHover = "";
// Separator: six uses of one rule, after shadcn / ReUI. Nothing on it moves or
// takes a press — every rule is a picture, and the ones that divide two things
// are `role="separator"` in the mirror (see SeparatorCtl).
const separator = new SeparatorDemo();
separator.init(cssFor("separator", SEPARATOR_CSS));
let lastControlsHover = "";
let lastCalendarHover = "";
const dashboard = new DashboardDemo();
dashboard.init(cssFor("dashboard", DASHBOARD_CSS));
// `let`, because the editor below rebuilds it from whatever is in the
// textarea — the same reason `form`, `profile` and `otp` are.
let effects = new EffectsDemo();
effects.init(cssFor("effects", EFFECTS_CSS));
// Tabs: TabsCtl (measured against @radix-ui/react-tabs) owns the strip; the
// fields are InputCtls on the page's text session, like the form's.
let tabs = new TabsDemo();
tabs.init(cssFor("tabs", TABS_CSS));
let lastTabsHover = "";
// Popover: every popover is a PopoverCtl (measured against
// @radix-ui/react-popover); the Dimensions fields are InputCtls on the text
// session. Non-modal: no trap, and the focus leaving a popover closes it.
// Menubar: ReUI's two patterns and the Radix example, one card each. Every bar
// is a MenubarCtl (measured against @radix-ui/react-menubar) whose menus are
// MenuCtls (measured against @radix-ui/react-dropdown-menu); the page passes
// keys, presses and hovers straight through.
let menubar = new MenubarDemo();
menubar.init(cssFor("menubar", MENUBAR_CSS));
let lastMenubarHover = "";
let popover = new PopoverDemo();
popover.init(cssFor("popover", POPOVER_CSS));
let lastPopoverHover = "";
// Autocomplete: six ComboboxCtls in autocomplete mode (Base UI's Autocomplete,
// ReUI's look), their boxes on the page's text session like the form's.
let autocomplete = new AutocompleteDemo();
autocomplete.init(cssFor("autocomplete", AUTOCOMPLETE_CSS));
let lastAutocompleteHover = "";
// Pagination: ReUI's ten patterns, each over a PaginationCtl; the go-to-page
// boxes are InputCtls on the page's text session, the selects SelectCtls.
let pagination = new PaginationDemo();
pagination.init(cssFor("pagination", PAGINATION_CSS));
let lastPaginationHover = "";
// Radio Group: ReUI's ten patterns, one RadioGroupCtl (measured against
// Radix RadioGroup) per group; the arrows check as they move (WAI-ARIA).
let radio = new RadioGroupDemo();
radio.init(cssFor("radio", RADIO_CSS));
let lastRadioHover = "";
// Rating: ReUI's patterns, every row of stars a RatingCtl (value, preview,
// precision, keys, and role img or slider).
let rating = new RatingDemo();
rating.init(cssFor("rating", RATING_CSS));
let lastRatingHover = "";
// Kanban: ReUI's board, a KanbanCtl (one SortableCtl per column plus the
// moves across them, the keyboard sensor and the announcements).
let kanban = new KanbanDemo();
kanban.init(cssFor("kanban", KANBAN_CSS));
let lastKanbanHover = "";
// Drawer: ReUI's patterns, each a modal DrawerCtl (the slide, the drag to
// dismiss, focus in and back); the demo owns the trapped Tab ring.
let drawer = new DrawerDemo();
drawer.init(cssFor("drawer", DRAWER_CSS));
let lastDrawerHover = "";
// Combobox: ReUI's patterns, every box a ComboboxCtl in its default mode (the
// value is the chosen item), on the page's text session like the autocomplete.
let combobox = new ComboboxDemo();
combobox.init(cssFor("combobox", COMBOBOX_CSS));
let lastComboboxHover = "";
// Color Picker: Chrome's <input type=color> dialog, three ColorPickerCtls
// (HSVA, the conversions, the fields, the keys, the popover's restore). The
// eyedropper's sampling is this page's: see "COLOR PICKER" below.
let colorpicker = new ColorPickerDemo();
colorpicker.init(cssFor("colorpicker", COLORPICKER_CSS));
colorpicker.setScreenPicker(typeof window.EyeDropper === "function");
let lastColorpickerHover = "";
// Questionnaire: two cards, each a QuestionnaireCtl (steps, answers on
// RadioGroupCtl / CheckboxCtl, the required gate, the keys, the
// announcements). A new step slides in unless the reader asked for less motion.
const questionnaireStill = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
let questionnaire = new QuestionnaireDemo();
questionnaire.setReducedMotion(questionnaireStill);
questionnaire.init(cssFor("questionnaire", QUESTIONNAIRE_CSS));
let lastQuestionnaireHover = "";
// Select: ReUI's patterns, every select a SelectCtl in its Base UI mode (keys,
// typeahead, hover highlight, multiple); the list flips above its trigger
// when there is no room below.
let select = new SelectDemo();
select.init(cssFor("select", SELECT_CSS));
let lastSelectHover = "";
// Window: a small desktop in a card, every window a WindowCtl (drag, resize,
// minimize / maximize / snap, the keyboard's move and size); the Desktop
// settings dialog is the same controller with isModal. The demo owns the Tab
// ring (the dialog's trap), the z-order and the dock. Not `window`: that name
// is taken.
let windemo = new WindowDemo();
windemo.init(cssFor("window", WINDOW_CSS));
let lastWindowHover = "";
// ONE DRIVER FOR THE PAGE. It reads the effect instances off whatever display
// list is being painted, so it works for any demo whose stylesheet declares an
// effect and costs nothing on the nineteen that do not.
const fxDriver = createEffectDriver();
let fxLastTick = 0;
// The effects this demo's document declares, and which of them the rail has
// switched off. Read OUT OF THE LIST rather than written here: the page does
// not know what effects exist, only that the stylesheet declared some and what
// each one is called.
// Recomputed rather than captured, because the stylesheet under this demo can
// be edited in the page: swap the sky to `raindrop` and the rail has to say
// raindrop. The ids do not change — they are the document's — so a switch the
// visitor threw stays thrown across a swap.
const fxDeclared = () => {
  try {
    return (JSON.parse(effects.displayListJson()).effects || [])
      .map((e) => `${e.id} · ${e.kind}`);
  } catch (e) {
    return [];
  }
};
const fxLabelId = (label) => label.split(" · ")[0];
const fxOff = new Set();
let lastDashHover = "";
let lastResizeHover = "";
let lastTreeHover = "";
let lastTimelineHover = "";

// One kept tree per demo. The builders they are handed are the same static
// `page()` functions the PNG snapshots and the accessibility audit call, so
// there is one description of each demo and not two.
const HOSTS = {
  toolbar: keptTree(ToolbarModule, cssFor("toolbar", TOOLBAR_CSS), "Toolbar demo", [W, 320]),
  sortable: keptTree(SortableModule, cssFor("sortable", SORTABLE_CSS), "Sortable demo", [W, 560]),
};

// Six demos, six factories, one page. Each one says how tall it is and
// answers the same three questions — what to draw, what is under the pointer,
// and what it all MEANS. Three of them answer by rebuilding their tree from
// `args()`; the motion showcase, the table and the dropdown answer from a tree
// they keep, because a transition cannot survive being rebuilt. Behind these
// thunks the difference stops mattering to the rest of the page.
const DEMOS = {
  accordion: {
    height: () => accordion.heightPx(),
    list: () => accordion.displayListJson(),
    hit: (x, y) => accordion.hitId(x, y),
    a11y: (gen, focus) => accordion.a11yJson(gen, focus),
    press: (id) => accordion.press(id),
    hover: (id) => {
      if (id === lastAccordionHover) return false;
      lastAccordionHover = id;
      accordion.setHover(id);
      return true;
    },
    // Straight through to AccordionCtl: arrows and Home/End between the
    // triggers, Enter and Space to toggle.
    key: (k) => accordion.key(k),
    host: () => ({
      tick: (dt) => accordion.tick(dt),
      busy: () => accordion.busyNow(),
      setHover: (id) => {
        if (id === lastAccordionHover) return false;
        lastAccordionHover = id;
        accordion.setHover(id);
        return true;
      },
      setPressed: (id) => accordion.setPressed(id),
      root: () => null,
    }),
    animated: true,
  },
  toolbar: {
    height: 320,
    args: () => [
      TOOLBAR_CSS, state.bold, state.italic, state.underline, state.align,
      "Edited 2 hours ago",
    ],
    module: ToolbarDemo,
    // Through the kept tree, so a hover does not rebuild and a
    // transition has something to remember.
    sync: () => HOSTS.toolbar.sync(JSON.stringify([state.bold, state.italic, state.underline, state.align, "Edited 2 hours ago"]), () => ToolbarDemo.page(state.bold, state.italic, state.underline, state.align, "Edited 2 hours ago")),
    list: () => HOSTS.toolbar.list(),
    hit: (x, y) => HOSTS.toolbar.hit(x, y),
    a11y: (gen, focus) => HOSTS.toolbar.a11y(gen, focus),
    host: () => HOSTS.toolbar,
    animated: true,
    press: pressToolbar,
    hover: () => false,
    key: () => false,
  },
  table: {
    height: () => table.heightPx(),
    list: () => table.displayListJson(),
    hit: (x, y) => table.hit ? table.hit(x, y) : table.hitId(x, y),
    a11y: (gen, focus) => table.a11yJson(gen, focus),
    press: (id) => table.press(id),
    hover: (id) => {
      if (id === lastTableHover) return false;
      lastTableHover = id;
      table.setHover(id);
      return true;
    },
    // The roving ring `TableDemo.key` walks: arrows between the header, the
    // boxes and the pager, Enter or Space to work the one you are on.
    key: (k) => table.key(k),
    host: () => ({
      tick: (dt) => table.tick(dt),
      busy: () => table.busyNow(),
      setHover: (id) => {
        if (id === lastTableHover) return false;
        lastTableHover = id;
        table.setHover(id);
        return true;
      },
      setPressed: (id) => table.setPressed(id),
      root: () => null,
    }),
    animated: true,
  },

  dropdown: {
    height: () => dropdown.heightPx(),
    list: () => dropdown.displayListJson(),
    hit: (x, y) => dropdown.hitId(x, y),
    a11y: (gen, focus) => dropdown.a11yJson(gen, focus),
    press: (id) => dropdown.press(id),
    hover: (id) => {
      if (id === lastDropdownHover) return false;
      lastDropdownHover = id;
      dropdown.setHover(id);
      return true;
    },
    // Straight through to MenuCtl. Every arrow, Enter and Escape on this demo
    // is answered by the controller five conformance specs are run against —
    // which is the whole point of the demo owning no state.
    key: (k) => dropdown.key(k),
    host: () => ({
      tick: (dt) => dropdown.tick(dt),
      busy: () => dropdown.busyNow(),
      setHover: (id) => {
        if (id === lastDropdownHover) return false;
        lastDropdownHover = id;
        dropdown.setHover(id);
        return true;
      },
      setPressed: (id) => dropdown.setPressed(id),
      root: () => null,
    }),
    animated: true,
  },

  tree: {
    height: () => treeview.heightPx(),
    list: () => treeview.displayListJson(),
    hit: (x, y) => treeview.hitId(x, y),
    a11y: (gen, focus) => treeview.a11yJson(gen, focus),
    // The gesture protocol, same three as the dialog and the sortable. The
    // press only ARMS a drag: `TreeDemo` starts one on the first move past a
    // threshold, so a press that never travels ends as an ordinary click and
    // still opens the folder under it.
    press: (id) => treeview.beginPress(id, grabPointer.x, grabPointer.y),
    drag: (id, ev) => treeview.dragMove(ev.offsetX, ev.offsetY),
    drop: () => treeview.dragDrop(),
    hover: (id) => {
      if (id === lastTreeHover) return false;
      lastTreeHover = id;
      treeview.setHover(id);
      return true;
    },
    // Straight through to TreeCtl, like the dropdown's.
    key: (k) => treeview.key(k),
    host: () => ({
      // `openOnDropDelay` lives on this clock. A folder held under a drag
      // opens after 800ms, and the only place that time exists is the frame
      // loop — so the tick asks, and says whether anything changed.
      tick: (dt) => {
        const opened = treeview.dragHold(dt);
        const busy = treeview.tick(dt);
        return opened || busy;
      },
      // A drag held perfectly still still needs frames: nothing is moving, but
      // 800ms of nothing is what opens a folder. Without this the loop stops
      // the moment the pointer does and the delay never runs out.
      busy: () => treeview.busyNow() || treeview.dragWaiting(),
      setHover: (id) => {
        if (id === lastTreeHover) return false;
        lastTreeHover = id;
        treeview.setHover(id);
        return true;
      },
      setPressed: (id) => treeview.setPressed(id),
      root: () => null,
    }),
    animated: true,
  },

  // The timeline. Presentational: a press steps the value on and the picture
  // is redrawn from it, which is the only interaction there is — the reference
  // has none at all, and a page with a value in it and no way to change it
  // cannot show that the value is what draws the picture.
  resizable: {
    height: () => resize.heightPx(),
    list: () => resize.displayListJson(),
    hit: (x, y) => resize.hitId(x, y),
    a11y: (gen, focus) => resize.a11yJson(gen, focus),
    // The gesture protocol again: press arms, move drags, release drops.
    press: (id) => resize.beginPress(id, grabPointer.x, grabPointer.y),
    drag: (id, ev) => resize.dragMove(ev.offsetX, ev.offsetY),
    drop: () => resize.dragDrop(),
    hover: (id) => {
      if (id === lastResizeHover) return false;
      lastResizeHover = id;
      resize.setHover(id);
      return true;
    },
    key: (k) => resize.key(k),
    host: () => ({
      tick: (dt) => resize.tick(dt),
      busy: () => resize.busyNow(),
      setHover: (id) => {
        if (id === lastResizeHover) return false;
        lastResizeHover = id;
        resize.setHover(id);
        return true;
      },
      setPressed: (id) => resize.setPressed(id),
      root: () => null,
    }),
    animated: true,
  },

  // The form. A press moves focus and, on a field, puts the caret where the
  // pointer landed — which is the one interaction here that is a measurement
  // rather than a state change, and the reason the press carries an x.
  form: {
    height: () => form.heightPx(),
    list: () => form.displayListJson(),
    hit: (x, y) => form.hitId(x, y),
    a11y: (gen, focus) => form.a11yJson(gen, focus),
    // Shift+click extends rather than collapses — measured, [2,10] from a
    // caret at 2 and a click at 10.
    cursorAt: (x, y) => form.cursorAt(x, y),
    // The platform owns the editing; see evg-textinput.js.
    textSession: {
      focused: () => form.focusedField(),
      state: (tid) => JSON.parse(form.fieldStateJson(tid)),
      apply: (tid, v, a, b) => form.applyEdit(tid, v, a, b),
    },
    press: (id, x, y, ev) => form.beginSelection(id, x, !!(ev && ev.shiftKey)),
    // `drag`/`drop` put the pointer under CAPTURE, which is the whole reason
    // they are declared: without it a selection that starts inside the box
    // and travels past its edge stops the moment `hitAt` names something
    // else. The browser clamps instead of collapsing — [3,23] dragging right
    // off the end — and `indexAtX` clamps the same way, so the x is passed
    // through wherever the pointer has got to.
    drag: (id, ev) => form.extendSelection(ev.offsetX),
    drop: () => form.endSelection(),
    dblclick: (id, x) => form.selectWordAt(id, x),
    hover: (id) => {
      if (id === lastFormHover) return false;
      lastFormHover = id;
      form.setHover(id);
      return true;
    },
    // Shift and Control matter here and nowhere else: Shift+Arrow extends the
    // selection a plain Arrow collapses, and Ctrl+Arrow moves by a word. A
    // printable key goes through the same door — `keyWith` treats any
    // single-character unmodified key as an insertion — so there is no
    // separate typing hook to keep in step with this one.
    keyWith: (k, shift, ctrl) => form.keyWith(k, shift, ctrl),
    // The demo owns its own tab ring — see the keydown handler.
    ownsTab: true,
    key: (k) => form.key(k),
    // Which keys the app wants back out of an editing session — see
    // `FormDemo.ownsKey` and the bridge's `onKey` below.
    ownsKey: (k) => form.ownsKey(k),
    host: () => ({
      setHover: (id) => {
        if (id === lastFormHover) return false;
        lastFormHover = id;
        form.setHover(id);
        return true;
      },
      setPressed: (id) => form.setPressed(id),
      root: () => null,
    }),
  },

  // The label-left form. Same shape as the invoice's entry; the difference is
  // in the layout, not the wiring.
  profile: {
    height: () => profile.heightPx(),
    list: () => profile.displayListJson(),
    hit: (x, y) => profile.hitId(x, y),
    a11y: (gen, focus) => profile.a11yJson(gen, focus),
    cursorAt: (x, y) => profile.cursorAt(x, y),
    textSession: {
      focused: () => profile.focusedField(),
      state: (tid) => JSON.parse(profile.fieldStateJson(tid)),
      apply: (tid, v, a, b) => profile.applyEdit(tid, v, a, b),
    },
    press: (id, x, y, ev) => profile.beginSelection(id, x, !!(ev && ev.shiftKey)),
    drag: (id, ev) => profile.extendSelection(ev.offsetX),
    drop: () => profile.endSelection(),
    dblclick: (id, x) => profile.selectWordAt(id, x),
    hover: (id) => {
      if (id === lastProfileHover) return false;
      lastProfileHover = id;
      profile.setHover(id);
      return true;
    },
    // Alt as well: Alt+ArrowDown opens a date field's calendar popover.
    keyWith: (k, shift, ctrl, alt) => profile.keyWithAlt(k, shift, ctrl, !!alt),
    // …and so the field's editing session has to hand that chord back.
    ownsKey: (k, ev) => profile.ownsKeyAlt(k, !!(ev && ev.altKey)),
    // The wheel over the date picker's year list.
    scroll: (dy) => profile.scrollBy(dy),
    // The demo owns its own tab ring — see the keydown handler.
    ownsTab: true,
    key: (k) => profile.key(k),
    host: () => ({
      setHover: (id) => {
        if (id === lastProfileHover) return false;
        lastProfileHover = id;
        profile.setHover(id);
        return true;
      },
      setPressed: (id) => profile.setPressed(id),
      root: () => null,
    }),
  },

  // Four cards and a chart that is really drawn: the display list this hands
  // back has the page's own commands and Vela's in it, which is the whole
  // point of the page.
  dashboard: {
    // A touch on the surface, in page pixels. The press that works a control
    // is the same press that starts the ripple — the button never learns that
    // anything happened, which is the point: the effect is over the finished
    // picture and knows nothing about the tree that drew it.
    ripple: (x, y) => dashboard.ripple(x, y),
    // A finger dragged across the surface leaves a WAKE — one source every
    // few pixels, not one that follows the pointer, because a wake is a row
    // of sources and a source that moves has no history.
    rippleTo: (x, y) => dashboard.rippleDragTo(x, y),
    rippleEnd: () => dashboard.rippleRelease(),
    animated: true,
    scroll: (dy) => dashboard.scrollBy(dy),
    width: () => dashboard.widthPx(),
    height: () => dashboard.heightPx(),
    list: () => dashboard.displayListJson(),
    hit: (x, y) => dashboard.hitId(x, y),
    a11y: (gen, focus) => dashboard.a11yJson(gen, focus),
    // The fourth channel. Nothing else in this entry changes: the panel reads
    // it and the page does not know the panel exists.
    inspect: () => dashboard,
    // The file this demo's stylesheet was built from. Named here rather than
    // derived from `state.which`, because a demo whose sheet is not a file on
    // disk must not claim to be live-editable.
    css: "dashboard.css",
    press: (id) => dashboard.press(id),
    hover: (id) => {
      if (id === lastDashHover) return false;
      lastDashHover = id;
      dashboard.setHover(id);
      return true;
    },
    key: (k) => dashboard.key(k),
    host: () => ({
      tick: (dt) => dashboard.tick(dt),
      busy: () => dashboard.busyNow(),
      setHover: (id) => {
        if (id === lastDashHover) return false;
        lastDashHover = id;
        dashboard.setHover(id);
        return true;
      },
      setPressed: (id) => dashboard.setPressed(id),
      root: () => null,
    }),
  },

  // SURFACE EFFECTS, and the page's own share of them is four lines: hand the
  // driver a press, a drag and a release, and let it say when the page is
  // still moving. Which box reacts, to what, and what it looks like are all in
  // `effects.css`.
  effects: {
    height: () => effects.heightPx(),
    list: () => effects.displayListJson(),
    hit: (x, y) => effects.hitId(x, y),
    a11y: (gen, focus) => effects.a11yJson(gen, focus),
    press: (id) => effects.press(id),
    hover: () => false,
    key: () => false,
    animated: true,
    // Its clock never stops (the sky drifts), so the frame budget applies.
    continuous: true,
    // The same three hooks the dashboard's application-driven ripple uses —
    // except that nothing here knows what a ripple is: the driver hit-tests
    // the boxes the display list carries and the sheet said which of them
    // wanted a press.
    ripple: (x, y) => fxDriver.press(x, y),
    rippleTo: (x, y) => fxDriver.drag(x, y),
    rippleEnd: () => fxDriver.release(),
    host: () => ({
      tick: (dt) => effects.tick(dt),
      // The effects' own clock is advanced in `paint`, where the list they
      // live on is parsed; this says whether the page has to keep asking for
      // frames, which is true while a star drifts or a ring travels.
      busy: () => fxDriver.busy() || effects.busyNow(),
      setHover: () => false,
      setPressed: (id) => effects.setPressed(id),
      root: () => null,
    }),
  },
  // Presentational: no press, no key, no hover. The page still hit-tests it,
  // and the mirror still carries its separators and text.
  separator: {
    height: () => separator.heightPx(),
    list: () => separator.displayListJson(),
    hit: (x, y) => separator.hitId(x, y),
    a11y: (gen, focus) => separator.a11yJson(gen, focus),
    press: () => false,
    hover: () => false,
    key: () => false,
  },
  metadata: {
    height: () => metadata.heightPx(),
    list: () => metadata.displayListJson(),
    hit: (x, y) => metadata.hitId(x, y),
    a11y: (gen, focus) => metadata.a11yJson(gen, focus),
    press: (id) => metadata.press(id),
    hover: (id) => {
      if (id === lastMetadataHover) return false;
      lastMetadataHover = id;
      metadata.setHover(id);
      return true;
    },
    key: (k) => metadata.key(k),
    // A printable key with no modifier is typing; Shift+Arrow extends a
    // selection, Ctrl+A selects a box, Tab walks the ring.
    keyWith: (k, shift, ctrl) => metadata.keyWith(k, shift, ctrl),
    // The demo owns its own tab ring — see the keydown handler.
    ownsTab: true,
    host: () => ({
      tick: (dt) => metadata.tick(dt),
      busy: () => metadata.busyNow(),
      setHover: (id) => {
        if (id === lastMetadataHover) return false;
        lastMetadataHover = id;
        metadata.setHover(id);
        return true;
      },
      setPressed: (id) => metadata.setPressed(id),
      root: () => null,
    }),
  },

  otp: {
    height: () => otp.heightPx(),
    list: () => otp.displayListJson(),
    hit: (x, y) => otp.hitId(x, y),
    a11y: (gen, focus) => otp.a11yJson(gen, focus),
    press: (id) => otp.press(id),
    hover: (id) => {
      if (id === lastOtpHover) return false;
      lastOtpHover = id;
      otp.setHover(id);
      return true;
    },
    key: (k) => otp.key(k),
    // Shift+Tab walks back; Ctrl+A selects every slot.
    keyWith: (k, shift, ctrl) => otp.keyWith(k, shift, ctrl),
    // The demo owns its own tab ring — see the keydown handler.
    ownsTab: true,
    host: () => ({
      tick: (dt) => otp.tick(dt),
      busy: () => otp.busyNow(),
      setHover: (id) => {
        if (id === lastOtpHover) return false;
        lastOtpHover = id;
        otp.setHover(id);
        return true;
      },
      setPressed: (id) => otp.setPressed(id),
      root: () => null,
    }),
    animated: true,
  },

  calendar: {
    height: () => calendar.heightPx(),
    list: () => calendar.displayListJson(),
    hit: (x, y) => calendar.hitId(x, y),
    a11y: (gen, focus) => calendar.a11yJson(gen, focus),
    press: (id) => calendar.press(id),
    // The year panel is a real scroller: twenty-one years is taller than the
    // grid, and reaching one without the calendar growing a page is the whole
    // point of it. Returns false while the panel is shut, which the page reads
    // as "not mine" and scrolls itself instead.
    scroll: (dy) => calendar.scrollBy(dy),
    hover: (id) => {
      if (id === lastCalendarHover) return false;
      lastCalendarHover = id;
      calendar.setHover(id);
      return true;
    },
    key: (k) => calendar.key(k),
    // Shift reaches the date field: Shift+Tab walks its segments backwards
    // and back from the grid into the year.
    keyWith: (k, shift, ctrl) => calendar.keyWith(k, shift, ctrl),
    // The demo owns its own tab ring — see the keydown handler.
    ownsTab: true,
    host: () => ({
      tick: (dt) => calendar.tick(dt),
      busy: () => calendar.busyNow(),
      setHover: (id) => {
        if (id === lastCalendarHover) return false;
        lastCalendarHover = id;
        calendar.setHover(id);
        return true;
      },
      setPressed: (id) => calendar.setPressed(id),
      root: () => null,
    }),
    animated: true,
  },

  filters: {
    height: () => filters.heightPx(),
    list: () => filters.displayListJson(),
    hit: (x, y) => filters.hitId(x, y),
    a11y: (gen, focus) => filters.a11yJson(gen, focus),
    // The id the hit test returned, passed through unchanged. The text field
    // lost a whole feature here once by dropping what it was given, so this
    // stays a pass-through and the demo decides what a click on that id means.
    press: (id) => filters.press(id),
    hover: (id) => {
      if (id === lastFiltersHover) return false;
      lastFiltersHover = id;
      filters.setHover(id);
      return true;
    },
    key: (k) => filters.key(k),
    host: () => ({
      tick: (dt) => filters.tick(dt),
      busy: () => filters.busyNow(),
      setHover: (id) => {
        if (id === lastFiltersHover) return false;
        lastFiltersHover = id;
        filters.setHover(id);
        return true;
      },
      setPressed: (id) => filters.setPressed(id),
      root: () => null,
    }),
    // For the chip menu's clock: a submenu opens after the pointer has rested
    // on its row for 100ms, and only a running clock gets there.
    animated: true,
  },

  eventcal: {
    height: () => eventcal.heightPx(),
    list: () => eventcal.displayListJson(),
    hit: (x, y) => eventcal.hitId(x, y),
    a11y: (gen, focus) => eventcal.a11yJson(gen, focus),
    // A gesture: a press on an event, its bottom edge or an empty slot arms a
    // move, a resize or a create; anything else is a click at once.
    press: (id, x, y) => eventcal.pointerDown(id, x, y),
    drag: (id, ev) => eventcal.pointerMove(ev.offsetX, ev.offsetY),
    drop: () => eventcal.pointerUp(),
    scroll: (dy) => eventcal.scrollBy(dy),
    cursorAt: (x, y) => eventcal.cursorAt(x, y),
    width: () => eventcal.widthPx(),
    hover: (id) => {
      if (id === lastEventcalHover) return false;
      lastEventcalHover = id;
      eventcal.setHover(id);
      return true;
    },
    key: (k) => eventcal.key(k),
    // Tab walks the calendar's own ring (arrows, Today, views, events); Enter
    // and Space press the focused one. The mirror alone is one tab stop.
    keyWith: (k, shift, ctrl) => eventcal.keyWith(k, shift, ctrl),
    ownsTab: true,
    host: () => ({
      tick: (dt) => eventcal.tick(dt),
      busy: () => eventcal.busyNow(),
      setHover: (id) => {
        if (id === lastEventcalHover) return false;
        lastEventcalHover = id;
        eventcal.setHover(id);
        return true;
      },
      setPressed: (id) => eventcal.setPressed(id),
      root: () => null,
    }),
  },

  // The transcript, now written to. The composer is an `InputCtl` behind the
  // same platform text session the form uses; Enter or Send appends a bubble,
  // `ScrollerCtl` keeps the newest in view, and the other side answers on the
  // demo's own clock — so `animated`, and a `host` whose `busy` is true while
  // a reply is owed.
  message: {
    height: () => message.heightPx(),
    list: () => message.displayListJson(),
    hit: (x, y) => message.hitId(x, y),
    a11y: (gen, focus) => message.a11yJson(gen, focus),
    cursorAt: (x, y) => message.cursorAt(x, y),
    textSession: {
      focused: () => message.focusedField(),
      state: (tid) => JSON.parse(message.fieldStateJson(tid)),
      apply: (tid, v, a, b) => message.applyEdit(tid, v, a, b),
    },
    press: (id, x, y, ev) => message.beginSelection(id, x, !!(ev && ev.shiftKey)),
    drag: (id, ev) => message.extendSelection(ev.offsetX),
    drop: () => message.endSelection(),
    dblclick: (id, x) => message.selectWordAt(id, x),
    // The wheel moves the transcript, and false at an end hands it back.
    scroll: (dy) => message.scrollBy(dy),
    hover: (id) => {
      if (id === lastMessageHover) return false;
      lastMessageHover = id;
      message.setHover(id);
      return true;
    },
    keyWith: (k, shift, ctrl) => message.keyWith(k, shift, ctrl),
    // The demo owns its own tab ring: the field, Send, and the jump button
    // while it is showing.
    ownsTab: true,
    key: (k) => message.key(k),
    ownsKey: (k) => message.ownsKey(k),
    host: () => ({
      tick: (dt) => message.tick(dt),
      busy: () => message.busyNow(),
      setHover: (id) => {
        if (id === lastMessageHover) return false;
        lastMessageHover = id;
        message.setHover(id);
        return true;
      },
      setPressed: (id) => message.setPressed(id),
      root: () => null,
    }),
    animated: true,
  },

  controls: {
    height: () => controls.heightPx(),
    list: () => controls.displayListJson(),
    hit: (x, y) => controls.hitId(x, y),
    a11y: (gen, focus) => controls.a11yJson(gen, focus),
    // `pressAt`, not `press`: a slider needs the x. The four on this page were
    // drawn from a controller that has answered `dragBoundsTid` /
    // `valueAtFraction` / `keyDown` since it was measured against Radix, and
    // the page handed it an id and threw the coordinate away — so a press on a
    // track returned false and every slider was a picture. `pressAt` falls
    // through to `press` for everything that is not a slider.
    press: (id, x) => controls.pressAt(id, x),
    // A slider is a GESTURE, so this demo joins the drag path: the press picks
    // up the track, the move carries the value, the release puts it down.
    drag: (id, ev) => controls.dragTo(id, ev.offsetX),
    drop: () => controls.dragEnd(),
    hover: (id) => {
      if (id === lastControlsHover) return false;
      lastControlsHover = id;
      controls.setHover(id);
      return true;
    },
    key: (k) => controls.key(k),
    // `keyWith` is the door this page already has for a demo that reads
    // modifiers — `key` is only ever called with one argument, so a handler
    // taking an event would silently never see Shift. And Shift is where the
    // LARGE STEP lives, the least guessable thing the number field measured:
    // wiring it through `key` would have left it unreachable on the page while
    // every demo assertion still passed, because those call the controller
    // directly. That is the text field's dropped coordinate exactly.
    keyWith: (k, shift) => (shift ? controls.keyWithShift(k) : controls.key(k)),
    host: () => ({
      tick: (dt) => controls.tick(dt),
      busy: () => controls.busyNow(),
      setHover: (id) => {
        if (id === lastControlsHover) return false;
        lastControlsHover = id;
        controls.setHover(id);
        return true;
      },
      setPressed: (id) => controls.setPressed(id),
      root: () => null,
    }),
    animated: true,
  },

  timeline: {
    height: () => timeline.heightPx(),
    list: () => timeline.displayListJson(),
    hit: (x, y) => timeline.hitId(x, y),
    a11y: (gen, focus) => timeline.a11yJson(gen, focus),
    press: (id) => timeline.press(id),
    hover: (id) => {
      if (id === lastTimelineHover) return false;
      lastTimelineHover = id;
      timeline.setHover(id);
      return true;
    },
    key: (k) => timeline.key(k),
    host: () => ({
      tick: (dt) => timeline.tick(dt),
      busy: () => timeline.busyNow(),
      setHover: (id) => {
        if (id === lastTimelineHover) return false;
        lastTimelineHover = id;
        timeline.setHover(id);
        return true;
      },
      setPressed: (id) => timeline.setPressed(id),
      root: () => null,
    }),
    animated: true,
  },

  dialog: {
    height: () => dialog.heightPx(),
    list: () => dialog.displayListJson(),
    hit: (x, y) => dialog.hitId(x, y),
    a11y: (gen, focus) => dialog.a11yJson(gen, focus),
    cursorAt: (x, y) => dialog.cursorAt(x, y),
    textSession: {
      focused: () => dialog.focusedField(),
      state: (tid) => JSON.parse(dialog.fieldStateJson(tid)),
      apply: (tid, v, a, b) => dialog.applyEdit(tid, v, a, b),
    },
    // A press may be Copy, and a canvas cannot write to the clipboard: the
    // demo says what it wants copied and the page does the writing.
    press: (id, x, y, ev) => {
      const took = dialog.beginSelection(id, x, !!(ev && ev.shiftKey));
      dialogCopy();
      return took;
    },
    drag: (id, ev) => dialog.extendSelection(ev.offsetX),
    drop: () => dialog.endSelection(),
    dblclick: (id, x) => dialog.selectWordAt(id, x),
    // The wheel over the scrollable dialog's body.
    scroll: (dy) => dialog.scrollBy(dy),
    hover: (id) => {
      if (id === lastDialogHover) return false;
      lastDialogHover = id;
      dialog.setHover(id);
      return true;
    },
    keyWith: (k, shift, ctrl) => {
      const took = dialog.keyWith(k, shift, ctrl);
      dialogCopy();
      return took;
    },
    // The demo owns its Tab ring: the triggers while nothing is open, and a
    // TRAPPED ring inside an open dialog (Radix's FocusScope).
    ownsTab: true,
    key: (k) => dialog.key(k),
    ownsKey: (k) => dialog.ownsKey(k),
    host: () => ({
      setHover: (id) => {
        if (id === lastDialogHover) return false;
        lastDialogHover = id;
        dialog.setHover(id);
        return true;
      },
      setPressed: (id) => dialog.setPressed(id),
      root: () => null,
    }),
  },

  motion: {
    height: () => motion.heightPx(),
    // Persistent: the three thunks below go to the kept host rather than
    // rebuilding a tree from arguments.
    list: () => motion.displayListJson(),
    hit: (x, y) => motion.hitId(x, y),
    a11y: (gen, focus) => motion.a11yJson(gen, focus),
    // The one control on the page: Replay. Everything else here is answered
    // by the stylesheet.
    press: (id) => (id === "mo-replay" ? replayMotion() : false),
    hover: (id) => {
      if (id === lastHover) return false;
      lastHover = id;
      motion.setHover(id);
      return true;
    },
    key: () => false,
    // The only demo with a clock. `flip` is what the self-running panels
    // travel between; the page turns it over and the stylesheet does the rest.
    animated: true,
  },
  sortable: {
    height: 560,
    args: () => [SORTABLE_CSS, state.order, state.dragging],
    module: SortableDemo,
    // Rebuilt from the whole state on every frame of a drag, target and
    // preview position included, and reconciled into the live tree.
    //
    // This is the one place in the gallery where the declarative claim is
    // actually being made at 60Hz. It used to be three things: a `sync` whose
    // key deliberately left out the target and the preview position, a
    // hand-written `applyShift` that re-aimed the existing rows, and a
    // `movePreview` that reached in and set two attributes. All three existed
    // because a rebuilt row was a NEW row with no flight, so the gap appeared
    // instead of opening. With keys it is one call.
    sync: () => {
      HOSTS.sortable.rebuild(() =>
        SortableDemo.dragPage(
          state.order,
          state.dragging,
          state.over,
          state.previewX,
          state.previewY,
          state.floating,
        ),
      );
    },
    list: () => HOSTS.sortable.list(),
    hit: (x, y) => HOSTS.sortable.hit(x, y),
    a11y: (gen, focus) => HOSTS.sortable.a11y(gen, focus),
    host: () => HOSTS.sortable,
    animated: true,
    press: pressSortable,
    hover: () => false,
    key: keySortable,
    // The one demo with a gesture rather than a press: the pointer has to
    // travel before anything moves, exactly as it does in dnd-kit.
    drag: dragSortable,
    drop: dropSortable,
  },

  // Tabs. No `ownsTab`: the page's generic Tab walk makes the tab list one
  // stop (its selected tab) and then the panel's fields and its button.
  tabs: {
    height: () => tabs.heightPx(),
    list: () => tabs.displayListJson(),
    hit: (x, y) => tabs.hitId(x, y),
    a11y: (gen, focus) => tabs.a11yJson(gen, focus),
    cursorAt: (x, y) => tabs.cursorAt(x, y),
    textSession: {
      focused: () => tabs.focusedField(),
      state: (tid) => JSON.parse(tabs.fieldStateJson(tid)),
      apply: (tid, v, a, b) => tabs.applyEdit(tid, v, a, b),
    },
    press: (id, x, y, ev) => tabs.beginSelection(id, x, !!(ev && ev.shiftKey)),
    drag: (id, ev) => tabs.extendSelection(ev.offsetX),
    drop: () => tabs.endSelection(),
    dblclick: (id, x) => tabs.selectWordAt(id, x),
    hover: (id) => {
      if (id === lastTabsHover) return false;
      lastTabsHover = id;
      tabs.setHover(id);
      return true;
    },
    keyWith: (k, shift, ctrl) => tabs.keyWith(k, shift, ctrl),
    key: (k) => tabs.key(k),
    ownsKey: (k) => tabs.ownsKey(k),
    host: () => ({
      setHover: (id) => {
        if (id === lastTabsHover) return false;
        lastTabsHover = id;
        tabs.setHover(id);
        return true;
      },
      setPressed: (id) => tabs.setPressed(id),
      root: () => null,
    }),
  },

  // Autocomplete. The generic Tab walk: each box is one stop, and the demo's
  // `setFocus` closes a box's list as the focus leaves it. The arrows are
  // claimed from the editing session (`ownsKey`), because they walk the list.
  // `animated` for the async card, whose results arrive on the demo's clock.
  autocomplete: {
    height: () => autocomplete.heightPx(),
    list: () => autocomplete.displayListJson(),
    hit: (x, y) => autocomplete.hitId(x, y),
    a11y: (gen, focus) => autocomplete.a11yJson(gen, focus),
    cursorAt: (x, y) => autocomplete.cursorAt(x, y),
    textSession: {
      focused: () => autocomplete.focusedField(),
      state: (tid) => JSON.parse(autocomplete.fieldStateJson(tid)),
      apply: (tid, v, a, b) => autocomplete.applyEdit(tid, v, a, b),
    },
    press: (id, x, y, ev) => autocomplete.beginSelection(id, x, !!(ev && ev.shiftKey)),
    drag: (id, ev) => autocomplete.extendSelection(ev.offsetX),
    drop: () => autocomplete.endSelection(),
    dblclick: (id, x) => autocomplete.selectWordAt(id, x),
    hover: (id) => {
      if (id === lastAutocompleteHover) return false;
      lastAutocompleteHover = id;
      autocomplete.setHover(id);
      return true;
    },
    keyWith: (k, shift, ctrl) => autocomplete.keyWith(k, shift, ctrl),
    key: (k) => autocomplete.key(k),
    ownsKey: (k) => autocomplete.ownsKey(k),
    host: () => ({
      tick: (dt) => autocomplete.tick(dt),
      busy: () => autocomplete.busyNow(),
      setHover: (id) => {
        if (id === lastAutocompleteHover) return false;
        lastAutocompleteHover = id;
        autocomplete.setHover(id);
        return true;
      },
      setPressed: (id) => autocomplete.setPressed(id),
      root: () => null,
    }),
    animated: true,
  },
};

// Popover: the demo owns its Tab ring — the triggers, with the open
// popover's own stops right after its trigger — and lets go at either end.
DEMOS.popover = {
  height: () => popover.heightPx(),
  list: () => popover.displayListJson(),
  hit: (x, y) => popover.hitId(x, y),
  a11y: (gen, focus) => popover.a11yJson(gen, focus),
  cursorAt: (x, y) => popover.cursorAt(x, y),
  textSession: {
    focused: () => popover.focusedField(),
    state: (tid) => JSON.parse(popover.fieldStateJson(tid)),
    apply: (tid, v, a, b) => popover.applyEdit(tid, v, a, b),
  },
  press: (id, x, y, ev) => popover.beginSelection(id, x, !!(ev && ev.shiftKey)),
  drag: (id, ev) => popover.extendSelection(ev.offsetX),
  drop: () => popover.endSelection(),
  dblclick: (id, x) => popover.selectWordAt(id, x),
  hover: (id) => {
    if (id === lastPopoverHover) return false;
    lastPopoverHover = id;
    popover.setHover(id);
    return true;
  },
  keyWith: (k, shift, ctrl) => popover.keyWith(k, shift, ctrl),
  ownsTab: true,
  key: (k) => popover.key(k),
  ownsKey: (k) => popover.ownsKey(k),
  host: () => ({
    setHover: (id) => {
      if (id === lastPopoverHover) return false;
      lastPopoverHover = id;
      popover.setHover(id);
      return true;
    },
    setPressed: (id) => popover.setPressed(id),
    root: () => null,
  }),
};
// Pagination. No `ownsTab`: every link, box and select is a stop of the
// page's generic Tab walk; Enter / Space on a link is the demo's.
DEMOS.pagination = {
  height: () => pagination.heightPx(),
  list: () => pagination.displayListJson(),
  hit: (x, y) => pagination.hitId(x, y),
  a11y: (gen, focus) => pagination.a11yJson(gen, focus),
  cursorAt: (x, y) => pagination.cursorAt(x, y),
  textSession: {
    focused: () => pagination.focusedField(),
    state: (tid) => JSON.parse(pagination.fieldStateJson(tid)),
    apply: (tid, v, a, b) => pagination.applyEdit(tid, v, a, b),
  },
  press: (id, x, y, ev) => pagination.beginSelection(id, x, !!(ev && ev.shiftKey)),
  drag: (id, ev) => pagination.extendSelection(ev.offsetX),
  drop: () => pagination.endSelection(),
  dblclick: (id, x) => pagination.selectWordAt(id, x),
  hover: (id) => {
    if (id === lastPaginationHover) return false;
    lastPaginationHover = id;
    pagination.setHover(id);
    return true;
  },
  keyWith: (k, shift, ctrl) => pagination.keyWith(k, shift, ctrl),
  key: (k) => pagination.key(k),
  ownsKey: (k) => pagination.ownsKey(k),
  host: () => ({
    setHover: (id) => {
      if (id === lastPaginationHover) return false;
      lastPaginationHover = id;
      pagination.setHover(id);
      return true;
    },
    setPressed: (id) => pagination.setPressed(id),
    root: () => null,
  }),
};
// Menubar. No `ownsTab`: each bar is one stop of the page's Tab walk (a
// menubar is a composite), and a Tab from inside an open menu closes it first
// (the page sends Escape). Everything else is MenubarCtl's and MenuCtl's.
DEMOS.menubar = {
  height: () => menubar.heightPx(),
  list: () => menubar.displayListJson(),
  hit: (x, y) => menubar.hitAt(x, y),
  a11y: (gen, focus) => menubar.a11yTreeJson(gen, focus),
  cursorAt: (x, y) => menubar.cursorAt(x, y),
  press: (id) => menubar.press(id),
  hover: (id) => {
    if (id === lastMenubarHover) return false;
    lastMenubarHover = id;
    return menubar.setHover(id);
  },
  keyWith: (k, shift, ctrl) => menubar.keyWith(k, shift, ctrl),
  key: (k) => menubar.key(k),
  host: () => ({
    tick: (dt) => menubar.tick(dt),
    busy: () => menubar.busyNow(),
    setHover: (id) => {
      if (id === lastMenubarHover) return false;
      lastMenubarHover = id;
      return menubar.setHover(id);
    },
    setPressed: (id) => menubar.setPressed(id),
    root: () => null,
  }),
  animated: true,
};
// Radio Group. No `ownsTab`: the page's generic Tab walk makes each
// radiogroup one stop, landing on its checked radio. The arrows (which move
// AND check, wrapping) and Space are the demo's, through RadioGroupCtl.
DEMOS.radio = {
  height: () => radio.heightPx(),
  list: () => radio.displayListJson(),
  hit: (x, y) => radio.hitId(x, y),
  a11y: (gen, focus) => radio.a11yJson(gen, focus),
  cursorAt: (x, y) => radio.cursorAt(x, y),
  press: (id) => radio.press(id),
  hover: (id) => {
    if (id === lastRadioHover) return false;
    lastRadioHover = id;
    radio.setHover(id);
    return true;
  },
  keyWith: (k, shift, ctrl) => radio.keyWith(k, shift, ctrl),
  key: (k) => radio.key(k),
  host: () => ({
    setHover: (id) => {
      if (id === lastRadioHover) return false;
      lastRadioHover = id;
      radio.setHover(id);
      return true;
    },
    setPressed: (id) => radio.setPressed(id),
    root: () => null,
  }),
};
// Rating. No `ownsTab`: each editable row is one slider, a stop of the
// page's generic Tab walk; the arrows, Home and End are RatingCtl's.
DEMOS.rating = {
  height: () => rating.heightPx(),
  list: () => rating.displayListJson(),
  hit: (x, y) => rating.hitId(x, y),
  a11y: (gen, focus) => rating.a11yJson(gen, focus),
  cursorAt: (x, y) => rating.cursorAt(x, y),
  press: (id) => rating.press(id),
  hover: (id) => {
    if (id === lastRatingHover) return false;
    lastRatingHover = id;
    return rating.setHover(id);
  },
  key: (k) => rating.key(k),
  ownsKey: (k) => rating.ownsKey(k),
  host: () => ({
    tick: (dt) => rating.tick(dt),
    busy: () => rating.busyNow(),
    setHover: (id) => {
      if (id === lastRatingHover) return false;
      lastRatingHover = id;
      return rating.setHover(id);
    },
    setPressed: (id) => rating.setPressed(id),
    root: () => null,
  }),
};
// Kanban. A gesture like the sortable's: the press arms, the pointer has to
// travel before a card is picked up, the release drops. Every card is a stop
// of the page's generic Tab walk; Space / Enter, the arrows and Escape are
// KanbanCtl's keyboard sensor.
DEMOS.kanban = {
  height: () => kanban.heightPx(),
  list: () => kanban.displayListJson(),
  hit: (x, y) => kanban.hitId(x, y),
  a11y: (gen, focus) => kanban.a11yJson(gen, focus),
  cursorAt: (x, y) => kanban.cursorAt(x, y),
  press: (id, x, y) => kanban.press(id, x, y),
  drag: (id, ev) => kanban.dragTo(ev.offsetX, ev.offsetY),
  drop: () => kanban.drop(),
  hover: (id) => {
    if (id === lastKanbanHover) return false;
    lastKanbanHover = id;
    return kanban.setHover(id);
  },
  key: (k) => kanban.key(k),
  ownsKey: (k) => kanban.ownsKey(k),
  animated: true,
  host: () => ({
    tick: (dt) => kanban.tick(dt),
    busy: () => kanban.busyNow(),
    setHover: (id) => {
      if (id === lastKanbanHover) return false;
      lastKanbanHover = id;
      return kanban.setHover(id);
    },
    setPressed: (id) => kanban.setPressed(id),
    root: () => null,
  }),
};
window.__kbState = () => JSON.parse(kanban.stateJson());
// Drawer. The demo owns its Tab ring (trapped while a drawer is open) and a
// gesture: a press on a panel's surface is held, the panel follows the
// pointer towards its edge, and the release dismisses it or snaps it back.
// `animated`: the slide runs on DrawerCtl's clock.
DEMOS.drawer = {
  height: () => drawer.heightPx(),
  list: () => drawer.displayListJson(),
  hit: (x, y) => drawer.hitId(x, y),
  a11y: (gen, focus) => drawer.a11yJson(gen, focus),
  cursorAt: (x, y) => drawer.cursorAt(x, y),
  press: (id, x, y, ev) => drawer.pointerDown(id, x, y, ev && ev.timeStamp ? ev.timeStamp : performance.now()),
  drag: (id, ev) => drawer.pointerMove(ev.offsetX, ev.offsetY, ev.timeStamp),
  drop: () => drawer.pointerUp(),
  scroll: (dy) => drawer.scrollBy(dy),
  hover: (id) => {
    if (id === lastDrawerHover) return false;
    lastDrawerHover = id;
    drawer.setHover(id);
    return true;
  },
  keyWith: (k, shift, ctrl) => drawer.keyWith(k, shift, ctrl),
  ownsTab: true,
  key: (k) => drawer.key(k),
  ownsKey: (k) => drawer.ownsKey(k),
  host: () => ({
    tick: (dt) => drawer.tick(dt),
    busy: () => drawer.busyNow(),
    setHover: (id) => {
      if (id === lastDrawerHover) return false;
      lastDrawerHover = id;
      drawer.setHover(id);
      return true;
    },
    setPressed: (id) => drawer.setPressed(id),
    root: () => null,
  }),
  animated: true,
};
window.__drwState = () => ({ summary: drawer.summary(), open: drawer.openWhich(), focus: drawer.focused, busy: drawer.busyNow() });
// Window. A gesture like the drawer's: a press on a title bar or a resize
// grip is held (the page captures the pointer, so a fast drag keeps the
// window), the move carries it, the release drops or snaps it. The text boxes
// are on the page's text session; a double-click on a title bar maximizes.
// `ownsTab`: the demo's ring, trapped inside the open dialog. `animated`: the
// maximize / restore / snap ease on WindowCtl's clock.
DEMOS.window = {
  height: () => windemo.heightPx(),
  list: () => windemo.displayListJson(),
  hit: (x, y) => windemo.hitId(x, y),
  a11y: (gen, focus) => windemo.a11yJson(gen, focus),
  cursorAt: (x, y) => windemo.cursorAt(x, y),
  textSession: {
    focused: () => windemo.focusedField(),
    state: (tid) => JSON.parse(windemo.fieldStateJson(tid)),
    apply: (tid, v, a, b) => windemo.applyEdit(tid, v, a, b),
  },
  press: (id, x, y, ev) => windemo.pointerDown(id, x, y, ev && ev.timeStamp ? ev.timeStamp : performance.now()),
  drag: (id, ev) => windemo.pointerMove(ev.offsetX, ev.offsetY, ev.timeStamp),
  drop: () => windemo.pointerUp(),
  dblclick: (id, x) => windemo.dblclick(id, x),
  scroll: (dy) => windemo.scrollBy(dy),
  hover: (id) => {
    if (id === lastWindowHover) return false;
    lastWindowHover = id;
    windemo.setHover(id);
    return true;
  },
  keyWith: (k, shift, ctrl, alt) => windemo.keyWith(k, shift, ctrl, !!alt),
  ownsTab: true,
  key: (k) => windemo.key(k),
  ownsKey: (k, ev) => windemo.ownsKeyAlt(k, !!(ev && ev.altKey)),
  host: () => ({
    tick: (dt) => windemo.tick(dt),
    busy: () => windemo.busyNow(),
    setHover: (id) => {
      if (id === lastWindowHover) return false;
      lastWindowHover = id;
      windemo.setHover(id);
      return true;
    },
    setPressed: (id) => windemo.setPressed(id),
    root: () => null,
  }),
  animated: true,
};
window.__wdState = () => JSON.parse(windemo.stateJson());
window.__wdBox = (id) => windemo.boxOf(id);
// Combobox. The generic Tab walk (each box one stop; `setFocus` closes a
// list and puts its label back as the focus leaves). The arrows, and in the
// chip box Backspace / ArrowLeft at the start, are claimed from the editing
// session (`ownsKey`); a focused chip gets the keys through `keyWith`.
DEMOS.combobox = {
  height: () => combobox.heightPx(),
  list: () => combobox.displayListJson(),
  hit: (x, y) => combobox.hitId(x, y),
  a11y: (gen, focus) => combobox.a11yJson(gen, focus),
  cursorAt: (x, y) => combobox.cursorAt(x, y),
  textSession: {
    focused: () => combobox.focusedField(),
    state: (tid) => JSON.parse(combobox.fieldStateJson(tid)),
    apply: (tid, v, a, b) => combobox.applyEdit(tid, v, a, b),
  },
  press: (id, x, y, ev) => combobox.beginSelection(id, x, !!(ev && ev.shiftKey)),
  drag: (id, ev) => combobox.extendSelection(ev.offsetX),
  drop: () => combobox.endSelection(),
  dblclick: (id, x) => combobox.selectWordAt(id, x),
  hover: (id) => {
    if (id === lastComboboxHover) return false;
    lastComboboxHover = id;
    combobox.setHover(id);
    return true;
  },
  keyWith: (k, shift, ctrl) => combobox.keyWith(k, shift, ctrl),
  key: (k) => combobox.key(k),
  ownsKey: (k) => combobox.ownsKey(k),
  host: () => ({
    tick: (dt) => combobox.tick(dt),
    busy: () => combobox.busyNow(),
    setHover: (id) => {
      if (id === lastComboboxHover) return false;
      lastComboboxHover = id;
      combobox.setHover(id);
      return true;
    },
    setPressed: (id) => combobox.setPressed(id),
    root: () => null,
  }),
};

// Color Picker. The generic Tab walk (each part of a picker one stop, the
// swatches one radio group; a focus that leaves an open dialog closes it and
// keeps the colour). Up / Down in a number field are the picker's
// (`ownsKey`); Escape and Enter reach it from the editing session as they do
// on every page. A press that starts the eyedropper or asks for the screen
// picker is followed up by `cpSync` below, once the frame is painted.
DEMOS.colorpicker = {
  height: () => colorpicker.heightPx(),
  list: () => colorpicker.displayListJson(),
  hit: (x, y) => colorpicker.hitId(x, y),
  a11y: (gen, focus) => colorpicker.a11yJson(gen, focus),
  cursorAt: (x, y) => colorpicker.cursorAt(x, y),
  textSession: {
    focused: () => colorpicker.focusedField(),
    state: (tid) => JSON.parse(colorpicker.fieldStateJson(tid)),
    apply: (tid, v, a, b) => colorpicker.applyEdit(tid, v, a, b),
  },
  press: (id, x, y, ev) => {
    const took = colorpicker.beginSelection(id, x, y, !!(ev && ev.shiftKey));
    queueMicrotask(() => cpSync(ev || null));
    return took;
  },
  drag: (id, ev) => colorpicker.extendSelection(ev.offsetX, ev.offsetY),
  drop: () => colorpicker.endSelection(),
  dblclick: (id, x) => colorpicker.selectWordAt(id, x),
  hover: (id) => {
    if (id === lastColorpickerHover) return false;
    lastColorpickerHover = id;
    colorpicker.setHover(id);
    return true;
  },
  keyWith: (k, shift, ctrl) => {
    const took = colorpicker.keyWith(k, shift, ctrl);
    queueMicrotask(() => cpSync(null));
    return took;
  },
  key: (k) => {
    const took = colorpicker.key(k);
    queueMicrotask(() => cpSync(null));
    return took;
  },
  ownsKey: (k) => colorpicker.ownsKey(k),
  host: () => ({
    setHover: (id) => {
      if (id === lastColorpickerHover) return false;
      lastColorpickerHover = id;
      colorpicker.setHover(id);
      return true;
    },
    setPressed: (id) => colorpicker.setPressed(id),
    root: () => null,
  }),
};
// Questionnaire. No `ownsTab`: the page's generic Tab walk makes each
// card's options one stop (a radio group is a composite; in a checkbox group
// only the roving option is focusable), then Back and Next. The letters, the
// arrows, Space and Enter are QuestionnaireCtl's, through `keyWith`.
DEMOS.questionnaire = {
  height: () => questionnaire.heightPx(),
  list: () => questionnaire.displayListJson(),
  hit: (x, y) => questionnaire.hitId(x, y),
  a11y: (gen, focus) => questionnaire.a11yJson(gen, focus),
  cursorAt: (x, y) => questionnaire.cursorAt(x, y),
  press: (id) => questionnaire.press(id),
  hover: (id) => {
    if (id === lastQuestionnaireHover) return false;
    lastQuestionnaireHover = id;
    return questionnaire.setHover(id);
  },
  keyWith: (k, shift, ctrl) => questionnaire.keyWith(k, shift, ctrl),
  key: (k) => questionnaire.key(k),
  ownsKey: (k) => questionnaire.ownsKey(k),
  animated: true,
  host: () => ({
    tick: (dt) => questionnaire.tick(dt),
    busy: () => questionnaire.busyNow(),
    setHover: (id) => {
      if (id === lastQuestionnaireHover) return false;
      lastQuestionnaireHover = id;
      return questionnaire.setHover(id);
    },
    setPressed: (id) => questionnaire.setPressed(id),
    root: () => null,
  }),
};
window.__qnState = () => JSON.parse(questionnaire.stateJson());
window.__qnBox = (id) => questionnaire.boxOf(id);
// Select. No `ownsTab`: each trigger is one stop of the page's Tab walk (a
// Tab from an open list closes it first, back to its trigger). The keys and
// the typeahead go to SelectCtl; `animated` for the typeahead's clock.
DEMOS.select = {
  height: () => select.heightPx(),
  list: () => select.displayListJson(),
  hit: (x, y) => select.hitId(x, y),
  a11y: (gen, focus) => select.a11yJson(gen, focus),
  cursorAt: (x, y) => select.cursorAt(x, y),
  press: (id) => select.press(id),
  hover: (id) => {
    if (id === lastSelectHover) return false;
    lastSelectHover = id;
    return select.setHover(id);
  },
  keyWith: (k, shift, ctrl) => select.keyWith(k, shift, ctrl),
  key: (k) => select.key(k),
  scroll: (dy) => select.scrollBy(dy),
  animated: true,
  host: () => ({
    tick: (dt) => select.tick(dt),
    busy: () => select.busyNow(),
    setHover: (id) => {
      if (id === lastSelectHover) return false;
      lastSelectHover = id;
      return select.setHover(id);
    },
    setPressed: (id) => select.setPressed(id),
    root: () => null,
  }),
};

// =============================================================================
// COLOR PICKER — the eyedropper's loupe, and the browser's own picker
// =============================================================================
//
// WHAT CAN BE SAMPLED. The demo is drawn by WebGL into one canvas whose context
// is made with `preserveDrawingBuffer: true` (see `paint`), so its pixels can
// be read back at any time with `gl.readPixels` — exactly what is on screen,
// antialiasing, gradients and all. Nothing else on the page can be: a page may
// not read the pixels of its own DOM (or of anything else on the screen)
// without a screen capture. So the in-page eyedropper samples THE CANVAS, and
// says so when the pointer is off it; `window.EyeDropper` (Chromium), where it
// exists, is offered beside it and samples anywhere on the screen with the
// browser's own loupe. A getDisplayMedia path is not built: it asks for a
// screen-share permission and a stream to pick one pixel, and it would still
// have to guess where the page sits on the captured screen.
//
// THE LOUPE is a DOM overlay, like the focus ring: a circle of 15 x 15
// sampled device pixels, each drawn as a 10px square on a 2D canvas (so the
// zoom is nearest-neighbour by construction, and `image-rendering: pixelated`
// keeps it so when the browser scales that canvas), a grid between them and
// the centre pixel outlined, with the centre's hex under it. It follows the
// pointer; the arrow keys move the point one device pixel (Shift: ten); a
// click or Enter picks; Escape, or a click off the canvas, cancels. While it
// is up the pointer and the keys are the loupe's and the demo sees neither.
const CP_GRID = 15;
const CP_ZOOM = 10;
const cpPick = { active: false, tid: "", dx: 0, dy: 0, hex: "", grid: [], inside: false };
let cpLoupe = null;

function cpLoupeEls() {
  if (cpLoupe) return cpLoupe;
  // The wrapper is a point — the pick point — and the ring and the label hang
  // off it, so the ring's centre is the point whatever the label's width.
  const wrap = document.createElement("div");
  wrap.id = "cp-loupe";
  wrap.setAttribute("aria-hidden", "true");
  const size = CP_GRID * CP_ZOOM;
  wrap.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;z-index:2147483000;pointer-events:none;display:none;";
  const ring = document.createElement("div");
  ring.style.cssText = `position:absolute;box-sizing:content-box;left:${-size / 2 - 3}px;top:${-size / 2 - 3}px;` +
    `width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;` +
    "border:3px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.35),0 6px 18px rgba(0,0,0,.35);background:#fff;";
  const cv = document.createElement("canvas");
  cv.width = size;
  cv.height = size;
  cv.style.cssText = `display:block;width:${size}px;height:${size}px;image-rendering:pixelated;`;
  ring.appendChild(cv);
  const label = document.createElement("div");
  label.style.cssText = `position:absolute;left:0;top:${size / 2 + 10}px;transform:translateX(-50%);` +
    "display:flex;align-items:center;gap:6px;padding:3px 8px 3px 4px;border-radius:999px;" +
    "background:#18181b;color:#fff;font:600 12px/16px ui-monospace,SFMono-Regular,Menlo,monospace;" +
    "box-shadow:0 2px 8px rgba(0,0,0,.3);white-space:nowrap;";
  const chip = document.createElement("span");
  chip.style.cssText = "width:14px;height:14px;border-radius:50%;border:1px solid rgba(255,255,255,.6);";
  const text = document.createElement("span");
  label.append(chip, text);
  wrap.append(ring, label);
  document.body.appendChild(wrap);
  cpLoupe = { wrap, ring, cv, label, chip, text, size };
  return cpLoupe;
}

const cpHex2 = (n) => n.toString(16).padStart(2, "0");
// A pixel over the page's white, as it is seen: the canvas is opaque where the
// demo draws its page, and this only matters at a transparent edge.
const cpSeen = (p) => {
  const a = p[3] / 255;
  return [0, 1, 2].map((i) => Math.round(p[i] * a + 255 * (1 - a)));
};

/** The CP_GRID x CP_GRID device pixels round (dx, dy); null off the canvas. */
function cpSample(dx, dy) {
  const r = (CP_GRID - 1) / 2;
  const out = new Array(CP_GRID * CP_GRID).fill(null);
  const W = canvas.width;
  const H = canvas.height;
  const x0 = Math.max(0, dx - r);
  const x1 = Math.min(W - 1, dx + r);
  const y0 = Math.max(0, dy - r);
  const y1 = Math.min(H - 1, dy + r);
  if (x1 < x0 || y1 < y0) return out;
  const gl = canvas.getContext("webgl2");
  if (!gl) return out;
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const buf = new Uint8Array(w * h * 4);
  // GL's rows run bottom-up: the first row read is the page's y1.
  gl.readPixels(x0, H - 1 - y1, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  for (let y = y0; y <= y1; y++) {
    const row = y1 - y;
    for (let x = x0; x <= x1; x++) {
      const i = (row * w + (x - x0)) * 4;
      out[(y - dy + r) * CP_GRID + (x - dx + r)] = [buf[i], buf[i + 1], buf[i + 2], buf[i + 3]];
    }
  }
  return out;
}

/** Sample, and draw the loupe where the point is. */
function cpDraw() {
  if (!cpPick.active) return;
  const L = cpLoupeEls();
  const grid = cpSample(cpPick.dx, cpPick.dy);
  cpPick.grid = grid;
  const ctx = L.cv.getContext("2d");
  const Z = CP_ZOOM;
  ctx.imageSmoothingEnabled = false;
  for (let j = 0; j < CP_GRID; j++) {
    for (let i = 0; i < CP_GRID; i++) {
      const p = grid[j * CP_GRID + i];
      if (p) {
        const c = cpSeen(p);
        ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
        ctx.fillRect(i * Z, j * Z, Z, Z);
      } else {
        // Off the canvas: nothing this page can read.
        ctx.fillStyle = "#e4e4e7";
        ctx.fillRect(i * Z, j * Z, Z, Z);
        ctx.fillStyle = "#d4d4d8";
        ctx.fillRect(i * Z, j * Z, Z / 2, Z / 2);
        ctx.fillRect(i * Z + Z / 2, j * Z + Z / 2, Z / 2, Z / 2);
      }
    }
  }
  ctx.strokeStyle = "rgba(0,0,0,0.14)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let k = 1; k < CP_GRID; k++) {
    ctx.moveTo(k * Z + 0.5, 0);
    ctx.lineTo(k * Z + 0.5, CP_GRID * Z);
    ctx.moveTo(0, k * Z + 0.5);
    ctx.lineTo(CP_GRID * Z, k * Z + 0.5);
  }
  ctx.stroke();
  const m = (CP_GRID - 1) / 2;
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2;
  ctx.strokeRect(m * Z, m * Z, Z, Z);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1;
  ctx.strokeRect(m * Z + 1.5, m * Z + 1.5, Z - 3, Z - 3);

  const centre = grid[m * CP_GRID + m];
  cpPick.inside = !!centre;
  if (centre) {
    const c = cpSeen(centre);
    cpPick.hex = "#" + cpHex2(c[0]) + cpHex2(c[1]) + cpHex2(c[2]);
    L.text.textContent = cpPick.hex;
    L.chip.style.background = cpPick.hex;
    L.chip.style.display = "";
  } else {
    cpPick.hex = "";
    L.text.textContent = typeof window.EyeDropper === "function"
      ? "outside the canvas — use Pick from screen"
      : "outside the canvas";
    L.chip.style.display = "none";
  }
  // Centred on the point, as Chrome's own loupe is.
  const rect = canvas.getBoundingClientRect();
  const cx = rect.left + ((cpPick.dx + 0.5) * rect.width) / canvas.width;
  const cy = rect.top + ((cpPick.dy + 0.5) * rect.height) / canvas.height;
  L.wrap.style.display = "block";
  L.wrap.style.left = cx + "px";
  L.wrap.style.top = cy + "px";
}

/** Client coordinates to a device pixel of the canvas. */
function cpPointAt(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  cpPick.dx = Math.floor(((clientX - rect.left) * canvas.width) / rect.width);
  cpPick.dy = Math.floor(((clientY - rect.top) * canvas.height) / rect.height);
}

let cpFrame = 0;
function cpLoop() {
  cpFrame = 0;
  if (!cpPick.active) return;
  if (state.which !== "colorpicker") {
    cpStop();
    return;
  }
  cpDraw();
  // The frame under the loupe can still be moving (a hover fading out), so it
  // is read again every frame while it is up; 225 pixels a frame is nothing.
  cpFrame = requestAnimationFrame(cpLoop);
}

function cpStart(tid, ev) {
  cpPick.active = true;
  cpPick.tid = tid;
  if (ev && typeof ev.clientX === "number") {
    cpPointAt(ev.clientX, ev.clientY);
  } else {
    // From the keyboard: the middle of the picture to sample.
    const b = JSON.parse(colorpicker.sampleBoxJson());
    const k = canvas.width / parseFloat(canvas.style.width || String(canvas.width));
    cpPick.dx = Math.floor((b.x + b.w / 2) * k);
    cpPick.dy = Math.floor((b.y + b.h / 2) * k);
  }
  document.documentElement.classList.add("cp-picking");
  canvas.style.cursor = "crosshair";
  cpDraw();
  if (!cpFrame) cpFrame = requestAnimationFrame(cpLoop);
}

function cpStop() {
  cpPick.active = false;
  cpPick.tid = "";
  if (cpFrame) cancelAnimationFrame(cpFrame);
  cpFrame = 0;
  document.documentElement.classList.remove("cp-picking");
  if (cpLoupe) cpLoupe.wrap.style.display = "none";
}

function cpCommit() {
  cpDraw();
  const hex = cpPick.inside ? cpPick.hex : "";
  cpStop();
  if (hex) colorpicker.pickResult(hex);
  else colorpicker.pickCancel();
  paint();
  kbRingUpdate();
}

function cpCancel() {
  cpStop();
  colorpicker.pickCancel();
  paint();
  kbRingUpdate();
}

/** After a press or a key on the colour picker: start or end pick mode. */
function cpSync(ev) {
  if (state.which !== "colorpicker") {
    if (cpPick.active) cpStop();
    return;
  }
  const t = colorpicker.pickingTid();
  if (t && !cpPick.active) cpStart(t, ev);
  else if (!t && cpPick.active) cpStop();
  const screen = colorpicker.takeScreenPick();
  if (screen) cpScreen(screen);
}

/** The browser's own eyedropper: anywhere on the screen, its own loupe. */
async function cpScreen(tid) {
  if (typeof window.EyeDropper !== "function") return;
  let hex = "";
  try {
    const got = await new window.EyeDropper().open();
    hex = got && got.sRGBHex ? got.sRGBHex : "";
  } catch (e) {
    // Dismissed with Escape, or refused: the colour stays.
  }
  window.__cpScreenLast = hex;
  if (hex && colorpicker.screenResult(tid, hex)) paint();
}

// While picking, the pointer and the keys are the loupe's. Capture on the
// window, so neither reaches the canvas (a hover would repaint what is being
// sampled) nor the text session.
window.addEventListener("pointermove", (ev) => {
  if (!cpPick.active) return;
  cpPointAt(ev.clientX, ev.clientY);
  cpDraw();
  ev.stopPropagation();
}, true);
window.addEventListener("pointerdown", (ev) => {
  if (state.which !== "colorpicker") return;
  if (cpPick.active) {
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();
    cpPointAt(ev.clientX, ev.clientY);
    cpCommit();
    return;
  }
  // A press on the page outside the canvas is outside an open dialog too.
  if (!stage.contains(ev.target) && colorpicker.dismissOutside()) {
    paint();
    syncTextSession();
  }
}, true);
window.addEventListener("keydown", (ev) => {
  if (!cpPick.active) return;
  ev.preventDefault();
  ev.stopPropagation();
  ev.stopImmediatePropagation();
  const n = ev.shiftKey ? 10 : 1;
  if (ev.key === "ArrowLeft") cpPick.dx -= n;
  else if (ev.key === "ArrowRight") cpPick.dx += n;
  else if (ev.key === "ArrowUp") cpPick.dy -= n;
  else if (ev.key === "ArrowDown") cpPick.dy += n;
  else if (ev.key === "Enter" || ev.key === " ") { cpCommit(); return; }
  else if (ev.key === "Escape" || ev.key === "Tab") { cpCancel(); return; }
  else return;
  cpDraw();
}, true);
// For checks: the pickers' state, the loupe (sampled afresh), a laid-out box.
window.__cpState = () => JSON.parse(colorpicker.stateJson());
window.__cpPick = () => {
  if (!cpPick.active) return { active: false };
  cpDraw();
  const r = cpLoupe.ring.getBoundingClientRect();
  return {
    active: true, tid: cpPick.tid, dx: cpPick.dx, dy: cpPick.dy, hex: cpPick.hex,
    inside: cpPick.inside, w: canvas.width, h: canvas.height, grid: cpPick.grid,
    n: CP_GRID, zoom: CP_ZOOM, label: cpLoupe.text.textContent,
    loupe: { x: r.left, y: r.top, w: r.width, h: r.height },
  };
};
window.__cpBox = (id) => colorpicker.boxOf(id);
window.__slState = () => select.summary();
window.__slBox = (id) => select.boxJson(id);

/**
 * Put the floating copy under the pointer, by mutating the element rather than
 * rebuilding the tree around it.
 *
 * It is found by its class and not by an id, because it deliberately has none:
 * hit testing scans the display list backwards, and an id here would put the
 * preview under the cursor so the row beneath it could never be found. The
 * preview is a picture; the list is what answers.
 */
// Handles for a browser check driving this page from outside; the playground
// exposes its host for the same reason. A drag and a keyboard walk are both
// things whose CORRECTNESS is a sequence of internal states, and reading them
// off the pixels would test the screenshot rather than the behaviour.
window.__sortRoot = () => HOSTS.sortable.root();
window.__sortState = () => ({ dragging: state.dragging, over: state.over, order: state.order });
// The menubar's state is its controllers': which menu each bar has open
// ("mb1=file;mb2=;mb3=;…"), the checked values, and the focus.
window.__mbState = () => {
  const summary = menubar.summary();
  const open = (summary.match(/mb\d=([a-z]+)/) || [])[1] || "";
  return { open, focus: menubar.focused, which: state.which, summary, size: [menubar.pageW, menubar.pageH] };
};
// The dropdown's state is MenuCtl's, so this reads the controller rather than
// the page: what is open, where focus is, and how deep the submenu stack goes.
window.__dlgState = () => ({
  summary: dialog.summary(),
  open: dialog.openWhich(),
  focus: dialog.focused,
  copied: window.__dlgCopied || "",
});
// Copy's other half: the text the dialog asked for, onto the real clipboard.
// Recorded as well, because a check cannot always read the clipboard back.
function dialogCopy() {
  const text = dialog.takeCopy();
  if (!text) return;
  window.__dlgCopied = text;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(() => {});
  } catch (e) { /* no clipboard here: the demo still says Copied */ }
}
window.__ddState = () => ({
  open: dropdown.model.open,
  focus: dropdown.focused,
  depth: dropdown.model.openPath.length,
  status: dropdown.status,
  theme: dropdown.theme,
});
// The text fields, for `input-bench.mjs`. A field's value and selection live
// in the demo's `InputCtl`, and the bench compares them step by step with a
// real <input> given the same clicks and keys — so it needs the model's own
// answer, not the pixels and not the proxy's. `null` for a field the current
// demo has no editing session for, which the bench reports as exactly that.
window.__fieldState = (tid) => {
  const d = demo();
  return d.textSession ? d.textSession.state(tid) : null;
};
window.__focusedField = () => {
  const d = demo();
  return d.textSession ? d.textSession.focused() : "";
};

// --- the sortable's gesture ---------------------------------------------------
// Reordering is `arrayMove`, not a swap: the item is taken out and put back at
// the new index, so dragging the first onto the third gives 2, 3, 1. A swap
// would give 3, 2, 1, and it is the first thing a hand-written sortable gets
// wrong.

function idOfRow(hit) {
  return hit && hit.startsWith("sr-row-") ? hit.slice("sr-row-".length) : "";
}

function arrayMove(list, from, to) {
  const out = list.slice();
  const [moved] = out.splice(from, 1);
  out.splice(to, 0, moved);
  return out;
}

// Where the row was when it was picked up, and where the pointer was. The
// preview's position is the first plus how far the second has travelled — so
// the row stays exactly under the part of it that was grabbed, rather than
// jumping its own centre to the cursor.
let grab = null;
let grabPointer = { x: 0, y: 0 };

function pressSortable(id) {
  const value = idOfRow(id);
  if (!value) return false;
  state.dragging = value;
  state.over = value;
  state.floating = true;
  state.focus = id;
  // `left`/`top` are measured from the PARENT's content box, and the preview's
  // parent is the padded page — so a page-absolute rectangle put it forty
  // pixels down and right of the row it is a copy of. The list's own corner is
  // that content origin, so subtracting it needs no knowledge of the padding.
  const node = lastTree && lastTree.byId && lastTree.byId.get(id);
  const list = lastTree && lastTree.byId && lastTree.byId.get("sr-list");
  if (node && node.b && list && list.b) {
    grab = { x: node.b[0] - list.b[0], y: node.b[1] - list.b[1] };
    state.previewX = grab.x;
    state.previewY = grab.y;
  }
  return true;
}

/**
 * A pointer move during a drag.
 *
 * The ORDER IS NOT TOUCHED. That is the change, and it is what dnd-kit does:
 * reordering live means rebuilding the list on every move, and the rows then
 * teleport into their new places with nothing to watch. Instead the target is
 * recorded, the rows between here and there are shifted a place by the
 * stylesheet, and the array is rearranged once, on the drop.
 */
function dragSortable(id, ev) {
  let changed = false;
  if (grab && ev) {
    const px = grab.x + (ev.offsetX - grabPointer.x);
    const py = grab.y + (ev.offsetY - grabPointer.y);
    if (px !== state.previewX || py !== state.previewY) {
      state.previewX = px;
      state.previewY = py;
      changed = true;
    }
  }
  const over = idOfRow(id);
  if (over && state.dragging && over !== state.over) {
    state.over = over;
    changed = true;
  }
  return changed;
}

function dropSortable() {
  if (!state.dragging) return false;
  const from = state.order.indexOf(state.dragging);
  const to = state.order.indexOf(state.over);
  // One `arrayMove`, at the end. The rows are already sitting where this puts
  // them, so the swap is invisible — which is the point of having shifted them.
  if (from >= 0 && to >= 0 && from !== to) state.order = arrayMove(state.order, from, to);
  state.dragging = "";
  state.over = "";
  state.floating = false;
  grab = null;
  return true;
}

// Space picks up and drops, arrows move, Escape puts it back — the same
// keyboard the conformance harness measures `SortableCtl` against.
function keySortable(key) {
  const focused = idOfRow(state.focus);
  if (!focused) return false;
  if (key === " " || key === "Enter") {
    state.dragging = state.dragging ? "" : focused;
    state.floating = false;
    state.over = "";
    return true;
  }
  if (key === "Escape") {
    if (!state.dragging) return false;
    state.dragging = "";
    state.floating = false;
    state.over = "";
    return true;
  }
  if (!state.dragging) {
    // Not carrying anything: the arrows walk the rows (every row is also a
    // Tab stop), so the list can be browsed before a row is picked up.
    const at = state.order.indexOf(focused);
    const to = key === "ArrowDown" ? at + 1 : key === "ArrowUp" ? at - 1
      : key === "Home" ? 0 : key === "End" ? state.order.length - 1 : -1;
    if (to < 0 || to >= state.order.length || to === at) return false;
    state.focus = `sr-row-${state.order[to]}`;
    return true;
  }
  const step = key === "ArrowDown" ? 1 : key === "ArrowUp" ? -1 : 0;
  if (!step) return false;
  const at = state.order.indexOf(state.dragging);
  const next = at + step;
  if (next < 0 || next >= state.order.length) return false;
  state.order = arrayMove(state.order, at, next);
  return true;
}

const canvas = document.getElementById("c");
const stage = document.getElementById("stage");
const fit = document.getElementById("fit");
const errEl = document.getElementById("err");

// --- errors -------------------------------------------------------------------
//
// Only `paint` used to be guarded, and it wrote a raw stack under the card. A
// throw in a pointer, key or text handler went to the console alone and left
// the picture as it was — a page that looks fine and has stopped answering.
// Now every handler goes through `guard`, the window's own `error` and
// `unhandledrejection` land here too, and what the reader sees is one line
// inside the preview card saying what broke, with the stack folded into a
// <details> for whoever wants it.
const errMsg = document.getElementById("errmsg");
const errStack = document.getElementById("errstack");
let errSource = "";
function reportError(e, where) {
  console.error(`[${where}]`, e);
  errSource = where;
  const message = (e && e.message) || String(e);
  if (errMsg) errMsg.textContent = `Something went wrong while handling ${where}: ${message}. The picture may be out of date.`;
  if (errStack) errStack.textContent = String((e && e.stack) || e);
  errEl.hidden = false;
  window.__lastError = { where, message };
}
function clearError(where) {
  if (where && errSource !== where) return;
  errSource = "";
  errEl.hidden = true;
  if (errMsg) errMsg.textContent = "";
  if (errStack) errStack.textContent = "";
}
/**
 * A handler that reports instead of throwing. After a throw the page repaints
 * once, so what is on screen is what the state now is rather than the frame
 * from before the handler ran halfway.
 */
function guard(fn, where) {
  return function guarded(...args) {
    try {
      return fn.apply(this, args);
    } catch (e) {
      reportError(e, where);
      try { paint(); } catch (_) { /* paint reports its own */ }
      return undefined;
    }
  };
}
/** addEventListener, through `guard`. */
function listen(target, type, where, fn, opts) {
  target.addEventListener(type, guard(fn, where), opts);
}
window.addEventListener("error", (ev) => {
  // The browser's own benign notice, not a fault of the page.
  if (/ResizeObserver loop/.test(String(ev.message || ""))) return;
  // A resource that failed to load (an <img>, a font) fires here too, with
  // no error object; it is not a script that stopped half way.
  if (!ev.error && !ev.message) return;
  reportError(ev.error || ev.message, "a page script");
});
window.addEventListener("unhandledrejection", (ev) => reportError(ev.reason, "an async task"));
{
  const dismiss = document.getElementById("errdismiss");
  if (dismiss) dismiss.addEventListener("click", () => clearError());
}

/**
 * The object behind each tab.
 *
 * Thunks rather than the objects, because `__resetDemo` replaces five of them.
 * The two kept trees — the toolbar and the sortable — are not here: they are
 * static `page()` builders with no instance to ask.
 */
const INSTANCE = {
  table: () => table,
  dropdown: () => dropdown,
  accordion: () => accordion,
  tree: () => treeview,
  timeline: () => timeline,
  resizable: () => resize,
  form: () => form,
  profile: () => profile,
  dashboard: () => dashboard,
  calendar: () => calendar,
  filters: () => filters,
  eventcal: () => eventcal,
  message: () => message,
  controls: () => controls,
  otp: () => otp,
  metadata: () => metadata,
  dialog: () => dialog,
  motion: () => motion,
  effects: () => effects,
  separator: () => separator,
  tabs: () => tabs,
  autocomplete: () => autocomplete,
  pagination: () => pagination,
};
INSTANCE.radio = () => radio;
INSTANCE.popover = () => popover;
INSTANCE.rating = () => rating;
INSTANCE.kanban = () => kanban;
INSTANCE.drawer = () => drawer;
INSTANCE.combobox = () => combobox;
INSTANCE.colorpicker = () => colorpicker;
INSTANCE.questionnaire = () => questionnaire;
INSTANCE.select = () => select;
INSTANCE.window = () => windemo;
INSTANCE.menubar = () => menubar;
// A press on the page outside the canvas is outside the popover too, and
// Radix dismisses on a pointer down outside wherever it lands.
window.addEventListener("pointerdown", (ev) => {
  if (state.which === "menubar" && !stage.contains(ev.target)) {
    if (menubar.press("")) paint();
    return;
  }
  if (state.which !== "popover" || stage.contains(ev.target)) return;
  if (popover.dismissOutside()) {
    paint();
    syncTextSession();
  }
}, true);

/** The demo showing now, or null for one of the three kept trees. */
function instance() {
  const owner = INSTANCE[state.which];
  return owner ? owner() : null;
}

/**
 * Where the keyboard is, per demo.
 *
 * This page used to hand `state.focus` — ITS OWN field, maintained for the
 * menubar and nothing else — to every demo's `a11yJson`. Every other demo
 * keeps its focus itself, so the mirror was told "nothing is focused" on
 * nineteen of the twenty. With a roving tabindex that means NO element in the
 * mirror is a tab stop, which is exactly the bug: you could not Tab into the
 * dropdown, or the tree, or the table, and once inside nothing said where you
 * were.
 *
 * The three kept trees have no instance to ask, so for them it stays the
 * page's own field — which is the one case it was ever right for.
 */
function appFocus() {
  const d = instance();
  if (!d) return state.focus;
  return d.focused || "";
}

/**
 * Focus moved inside the mirror on its own — a Tab, or a reader's cursor.
 * Told to the demo so its next arrow key starts from there; the mirror never
 * hears its own `.focus()` back, so this cannot loop.
 */
function adoptFocus(node) {
  const d = instance();
  if (!d) {
    state.focus = node.id;
    paint();
    return;
  }
  if (typeof d.setFocus !== "function") return;
  if (d.focused === node.id) return;
  d.setFocus(node.id);
  paint();
  // The focus ring is a transitioned property like any other — see the keydown
  // handler. Without the clock the frame that arrives is the one where the
  // transition has not started yet, which looks like no ring at all.
  const dd = DEMOS[state.which];
  if (dd && dd.animated) animate();
}

/**
 * How wide the room for the demo is: the preview's inner width.
 *
 * `clientWidth` includes the padding, and the preview has 12–24px of it on
 * each side: sizing against that number leaves the picture wider than the
 * room it was sized to fit, which is a horizontal scrollbar.
 */
function roomWidth() {
  const box = fit.parentElement || document.body;
  const cs = getComputedStyle(box);
  const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  return box.clientWidth - (Number.isFinite(pad) ? pad : 0);
}

/**
 * Fitting a demo to the room it has.
 *
 * A demo lays out at a width it chose — 900 for most of them, 1336 for the
 * dashboard — and a phone has about 330px of preview. The page used to SCALE
 * the desktop layout down to fit, which on a phone made 14px text render at
 * five to eight pixels: a demo you can see but not read or hit.
 *
 * So a demo that can reflow is LAID OUT at the room's width instead. Its page
 * size is the stylesheet's viewport too, so the `@media (max-width: …)`
 * blocks in its css get their say, and what comes out is the demo's narrow
 * layout at 1:1. `NARROW` lists those demos and the narrowest width each one
 * still makes sense at; below that it is scaled, never under `MIN_SCALE`.
 *
 * A demo that cannot reflow — a seven-column calendar, a window you drag
 * about — keeps its own width and is scaled down to `MIN_SCALE` at most; past
 * that the preview card scrolls sideways INSIDE ITSELF, and the page does not.
 *
 * The transform is on `#stage`, which holds the canvas AND the accessibility
 * mirror, so the mirrored elements move with the pixels they name and a tap
 * still lands on what it looks like it lands on; `#fit` around it carries the
 * laid-out size, because a transform does not change a layout box.
 * `offsetX`/`offsetY` are measured in the canvas's own untransformed box, so
 * hit tests go on taking the numbers the display list was built with.
 *
 * Never above 1: a demo drawn larger than it was laid out for is blurry for
 * no reason.
 */
const MIN_SCALE = 0.75;
// min: the narrowest page width the demo's own layout (with its @media rules)
// handles. h: the page height to use when narrower than authored — a number,
// or "auto" to measure the laid-out content (see `contentHeight`).
const NARROW = {
  // Laid out at the room (up to its 1024), as tall as its cards; the menus
  // open inside the cards.
  menubar: { min: 320, h: "own", grow: true },
  toolbar: { min: 320, h: "auto", keep: true, grow: true },
  sortable: { min: 320, h: "auto", grow: true },
  tree: { min: 320, h: "auto" },
  timeline: { min: 320, h: "auto" },
  resizable: { min: 320, h: "auto" },
  form: { min: 320, h: "auto", keep: true },
  calendar: { min: 320, h: "auto", keep: true },
  filters: { min: 320, h: "auto", keep: true },
  message: { min: 440, h: "auto" },
  controls: { min: 320, h: "own" },
  otp: { min: 320, h: "auto" },
  metadata: { min: 320, h: "auto", keep: true },
  profile: { min: 320, h: "own" },
  dropdown: { min: 320, h: "auto", keep: true },
  // The page follows the open items, so its height is the demo's own.
  accordion: { min: 320, h: "own" },
  dialog: { min: 320, h: "auto", keep: true },
  motion: { min: 320, h: "auto" },
  effects: { min: 320, h: "auto" },
  separator: { min: 320, h: "auto" },
  tabs: { min: 320, h: "auto" },
  // The page grows under an open list, so its height is the demo's own.
  autocomplete: { min: 320, h: "own" },
  // Laid out at the room (up to its 1024), and as tall as it lays out.
  pagination: { min: 320, h: "own", grow: true },
};
// Laid out at the room (up to its 1024), and as tall as it lays out.
NARROW.radio = { min: 320, h: "own", grow: true };
// `keep`: the popovers open inside the page and need the room it has.
NARROW.popover = { min: 320, h: "auto", keep: true };
// The page is as tall as its cards lay out.
NARROW.rating = { min: 320, h: "own" };
// Laid out at the room (up to its 900): the columns stack on a phone.
NARROW.kanban = { min: 320, h: "own", grow: true };
// `keep`: the drawers cover the whole page and need the room it has.
NARROW.drawer = { min: 320, h: "auto", keep: true };
// The page grows under an open list, so its height is the demo's own.
NARROW.combobox = { min: 320, h: "own" };
// The page is as tall as its cards lay out; the cards stack on a phone.
NARROW.colorpicker = { min: 320, h: "own" };
// Laid out at the room (up to its 1040), as tall as its two cards; the
// frames stack under 860.
NARROW.questionnaire = { min: 320, h: "own", grow: true };
// The page is as tall as its cards lay out; a list opens on the page as it is.
NARROW.select = { min: 320, h: "own" };
// The page keeps its height; on a phone the windows open as full sheets.
NARROW.window = { min: 320, h: "own" };
// Laid out at the room (up to its 1000), and as tall as its three cards lay out.
NARROW.eventcal = { min: 320, h: "own", grow: true };
window.__ecBox = (id) => {
  const f = (e) => { if (e.id === id) return e; for (const k of e.children) { const r = f(k); if (r) return r; } return null; };
  const e = f(eventcal.root);
  return e ? { x: e.calculatedX, y: e.calculatedY, w: e.calculatedWidth, h: e.calculatedHeight, pw: eventcal.pageW } : null;
};
window.__ecEvents = (which) => Array.from((which === 2 ? eventcal.boardB : eventcal.boardA).model.events).map((e) => ({ id: e.id, day: e.startDay, end: e.endDay, s: e.startMin, e: e.endMin, res: e.resource }));
window.__ecHit = (x, y) => eventcal.hitId(x, y);
window.__ecState = () => ({ focus: eventcal.focused, a: eventcal.statusOf(1), b: eventcal.statusOf(2), view: eventcal.boardA.view, lang: eventcal.boardA.lang });
const NARROW_AT = 600;
const naturalSize = {};
const fittedHeight = new Map();
const resized = new Set();

/** Read and write a demo's page size, or null when it has none to change. */
function pageSizer(d, inst) {
  const host = d.host ? d.host() : null;
  if (host && typeof host.size === "function") {
    return { get: () => host.size().slice(), set: (w, h) => host.resize(w, h) };
  }
  if (inst && typeof inst.pageW === "number" && typeof inst.pageH === "number") {
    return {
      get: () => [inst.pageW, inst.pageH],
      set(w, h) {
        if (w === inst.pageW && h === inst.pageH) return;
        inst.pageW = w;
        inst.pageH = h;
        // The kept layout carries the old page box; the next pass makes one.
        inst.layout = undefined;
      },
    };
  }
  return null;
}

/**
 * How tall the demo's content is at this width: laid out on a tall page and
 * measured off the display list. The page's own background and anything as
 * tall as the probe page (a clip, a full-height column) are not content. The
 * margin above the content is kept below it too, capped, so a demo that
 * centres its card still has it centred.
 */
const PROBE_H = 4000;
function contentHeight(d, sizer, w) {
  sizer.set(w, PROBE_H);
  const list = JSON.parse(d.list());
  let top = Infinity;
  let bottom = 0;
  for (let i = 1; i < list.cmds.length; i++) {
    const c = list.cmds[i];
    if (c.k !== 0 && c.k !== 1 && c.k !== 3) continue;
    if (!(c.h > 0) || c.h >= PROBE_H - 1) continue;
    top = Math.min(top, c.y);
    bottom = Math.max(bottom, c.y + c.h);
  }
  if (!Number.isFinite(top)) return 0;
  const margin = Math.min(Math.max(top, 12), 32);
  return Math.ceil(bottom - top + margin * 2);
}

/**
 * Size the demo for the room and say how: `{ w, h, s }`, the page it is laid
 * out at and the scale it is shown at.
 */
function fitDemo(d, inst) {
  const name = state.which;
  const sizer = pageSizer(d, inst);
  const authoredH = typeof d.height === "function" ? d.height() : d.height;
  const room = roomWidth();
  if (!sizer) {
    const w = typeof d.width === "function" ? d.width() : (inst && inst.pageW) || W;
    return { w, h: authoredH, s: scaleFor(room, w) };
  }
  if (!naturalSize[name]) naturalSize[name] = sizer.get();
  const [natW, natH] = naturalSize[name];
  const cfg = NARROW[name];
  // Reflowed only where the narrow rules apply: every demo's sheet writes
  // them under `@media (max-width: 600px)`, and above that its desktop layout
  // is fixed-width and is scaled instead.
  if (!cfg || !room || (!cfg.grow && (room >= natW || room > NARROW_AT))) {
    // Put back only what `fitDemo` itself changed. A demo may grow its own
    // page (controls, profile, a validation error pushing rows down), and
    // writing the authored height over that every paint would undo it and
    // relayout every frame. The height is read after the layout, in `paint`.
    if (resized.has(name)) {
      resized.delete(name);
      sizer.set(natW, natH);
    }
    return { w: sizer.get()[0], h: natH, s: scaleFor(room, natW), own: true };
  }
  resized.add(name);
  // `grow`: a demo whose authored width is only a canvas size (the three kept
  // trees were 1240 wide whatever they drew) is laid out at the room instead
  // of being scaled to it — on a desktop as well as a phone.
  const w = Math.round(Math.max(cfg.min, Math.min(room, natW)));
  let h = natH;
  if (cfg.h === "auto") {
    // Measured once per width, with the demo as it first shows: re-measuring
    // on every change would make the page jump as menus open and close.
    const key = `${name}:${w}`;
    if (!fittedHeight.has(key)) {
      const measured = contentHeight(d, sizer, w);
      // `keep`: never shorter than authored, for a demo whose overlays
      // (menus, popovers) are placed inside the page and need the room they
      // had. The rest lose the empty space below their content.
      const floor = cfg.keep ? natH : 0;
      fittedHeight.set(key, w < natW && measured > 0 ? Math.max(floor, measured) : natH);
    }
    h = fittedHeight.get(key);
  } else if (typeof cfg.h === "number" && w < natW) {
    h = cfg.h;
  } else if (cfg.h === "own") {
    // The demo sizes its own page to what it laid out (controls, profile):
    // only the width is ours, and the height is read back after the layout
    // (`paint` asks `height()` again once the list is built).
    sizer.set(w, sizer.get()[1]);
    return { w, h: sizer.get()[1], s: scaleFor(room, w), own: true };
  }
  sizer.set(w, h);
  return { w, h, s: scaleFor(room, w) };
}

function scaleFor(room, w) {
  if (!room || room >= w) return 1;
  return Math.max(MIN_SCALE, room / w);
}

function demo() {
  return DEMOS[state.which];
}

function hitAt(x, y) {
  const d = demo();
  if (d.sync) d.sync();
  return d.hit(x, y);
}

// --- what a press means ------------------------------------------------------
// Each returns true when something changed, so a press on empty space does not
// repaint the page for nothing.

function pressToolbar(id) {
  const toggles = { "tb-bold": "bold", "tb-italic": "italic", "tb-underline": "underline" };
  if (toggles[id]) {
    state[toggles[id]] = !state[toggles[id]];
    state.focus = id;
    return true;
  }
  if (id.startsWith("tb-align-")) {
    state.align = id.slice("tb-align-".length);
    state.focus = id;
    return true;
  }
  if (id === "share") {
    state.focus = id;
    return true;
  }
  return false;
}

// --- painting ----------------------------------------------------------------

let lastTree = null;
let mirror = null;

// The point, not just the id.
//
// This function used to hand the demo `hitAt(x, y)` and throw the coordinates
// away, which is fine for a button and is exactly wrong for a text field: a
// click has to land on a CHARACTER, and only the x knows which. `FormDemo`
// had been able to answer that since the field was written, the offline check
// called it directly and passed, and the page never asked. Every other demo's
// `press` takes one argument and ignores the extras.
function press(x, y, ev) {
  const id = hitAt(x, y);
  if (demo().press(id, x, y, ev)) paint();
  syncTextSession();
}

let lastDoc = null;
function paint() {
  try {
    const d = demo();
    if (d.sync) d.sync();
    // The demo's OWN page size, fitted to the room — see `fitDemo`. The page
    // used to give every demo a 1240-wide canvas whatever it laid out at, so
    // a 900-wide dropdown was drawn onto 340px of empty surface.
    const inst = instance();
    const fitted = fitDemo(d, inst);
    const { w: W2, s } = fitted;
    const listJson = d.list();
    // A demo that sizes its own page has only now, laid out, said how tall.
    const H = fitted.own ? (typeof d.height === "function" ? d.height() : d.height) : fitted.h;
    // The last frame's display list, for anything driving this page from
    // outside: a browser check needs the COLOUR a control was painted, and
    // only the list knows that. The playground exposes its host for the same
    // reason.
    window.__lastList = listJson;
    const list = JSON.parse(listJson);
    previewBg(list);
    // THE EFFECTS' CLOCK. Any list that carries element-scoped effects gets
    // its events aged and the clock stamped on before the painter reads them —
    // the driver keys its state by the element's id, so a list parsed afresh
    // every paint keeps a ripple that is still travelling.
    if (list.effects && list.effects.length > 0) {
      // What the rail switched off, applied to the instances this paint. The
      // list is parsed afresh every frame, so the flag is set here rather than
      // kept on an object that will not survive to the next one.
      for (const e of list.effects) e.off = fxOff.has(e.id);
      // Published for the same reason `__lastList` and `__lastStats` are:
      // something driving this page from outside has to be able to ask. The
      // flag is set on the PARSED list, so it is not in `__lastList` — which
      // is the string the demo produced, before this page touched it.
      window.__lastEffects = list.effects.map((e) => ({ id: e.id, kind: e.kind, off: !!e.off }));
      const now = performance.now();
      const dt = fxLastTick ? Math.min(now - fxLastTick, 100) : 16;
      fxLastTick = now;
      fxDriver.tick(dt, list);
    } else {
      fxLastTick = 0;
    }
    const doc = { width: W2, height: H, list };
    // The backing store is sized for the pixels actually on screen: a stage
    // scaled to 0.43 on a phone with a 3x screen still wants 1.3 device pixels
    // per app pixel, not 3, and asking for 3 is three times the fill rate for a
    // picture nobody can see the difference in.
    const dpr = Math.min(2, (window.devicePixelRatio || 1) * s) * (d.continuous ? budget.quality : 1);
    canvas.style.width = W2 + "px";
    canvas.style.height = H + "px";
    canvas.width = Math.round(W2 * dpr);
    canvas.height = Math.round(H * dpr);
    stage.style.width = W2 + "px";
    stage.style.height = H + "px";
    // The transform goes on the INNER box and the size on the wrapper: a
    // transform does not change the layout box, so scaling the same element
    // that carries the width would scale that width too and the wrapper would
    // come out at s² of the picture it is meant to reserve room for.
    stage.style.transform = s === 1 ? "none" : `scale(${s})`;
    // Published beside the display list, for the same reason: something
    // driving this page from outside aims at APP coordinates and has to know
    // what those are in CSS pixels before it can put a pointer there.
    window.__stageScale = s;
    fit.style.width = Math.round(W2 * s) + "px";
    fit.style.height = Math.round(H * s) + "px";
    const gl = canvas.getContext("webgl2", {
      antialias: true,
      premultipliedAlpha: false,
      stencil: true,
      preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error("WebGL 2 is not available in this browser");
    // Drawn again once a face that was still loading has arrived. Only then:
    // repainting every frame twice doubled the cost of every animation, which
    // on software GL is the difference between slow and unusable.
    const faces = [...new Set(doc.list.cmds.filter((c) => c.text).map((c) => `${c.size}px "${c.font}"`))];
    if (faces.some((f) => !document.fonts.check(f))) {
      document.fonts.ready.then(() =>
        Promise.all(faces.map((f) => document.fonts.load(f)))
          .then(() => { if (lastDoc === doc) renderDisplayList(gl, doc, { dpr }); }),
      );
    }
    lastDoc = doc;
    // What the renderer did with this frame, published beside the list for the
    // same reason: something outside the page needs to be able to ask, and a
    // check that only reads the display list cannot tell whether the picture
    // went through a post-pass.
    window.__lastStats = renderDisplayList(gl, doc, { dpr });

    // The same tree, said out loud. `gen` rises every paint so the mirror
    // knows the frame changed; it keeps its elements by id, which is why a
    // reader's cursor survives a repaint.
    generation += 1;
    const treeJson = d.a11y(generation, appFocus());
    // Alongside `__lastList`, and for the same reason: something driving this
    // page from outside needs the VALUE of a field, and only the accessible
    // tree carries it. Scraping the draw commands for a known string works
    // right up until the thing under test removes that string — which is
    // exactly what selecting a word and typing over it does.
    window.__lastA11y = treeJson;
    const tree = JSON.parse(treeJson);
    tree.byId = new Map(tree.nodes.map((n) => [n.id, n]));
    lastTree = tree;
    mirror.update(tree);
    mirrorValueText(tree);
    kbAfterPaint(tree);
    syncControls();
    inspectorTick();
    clearError("the paint");
  } catch (e) {
    reportError(e, "the paint");
  }
}

/**
 * A slider's words, onto the mirror. The tree carries a slider's valuetext as
 * its `value` ("Saturation 76%, Brightness 96%", "4 out of 5 stars"), and the
 * mirror in lib/evg writes aria-valuenow / min / max but not aria-valuetext,
 * so a reader heard the bare number. Written here, after each update, for
 * every slider that has words.
 */
function mirrorValueText(tree) {
  if (!mirror || typeof mirror.elementOf !== "function") return;
  for (const n of tree.nodes) {
    if (n.role !== "slider" || !n.value) continue;
    const el = mirror.elementOf(n.id);
    if (el && el.getAttribute("aria-valuetext") !== n.value) el.setAttribute("aria-valuetext", n.value);
  }
}

// --- the inspector -----------------------------------------------------------
//
// `?inspect=1` and nothing else. The panel is generic — it knows nothing about
// this page — so all this does is hand it four functions off whichever demo is
// showing, and tell it when the picture changed.
//
// The refresh is throttled rather than run per frame: a hover repaints, and
// re-walking a 470-element tree at 60Hz would make the panel the reason the
// page is slow. Anything faster than this interval is invisible to a person
// reading a tree anyway.
const INSPECT_MS = 400;
let inspector = null;
let inspectorFor = "";
let inspectorAt = 0;

function inspectorAdapter() {
  const d = demo();
  const app = d && typeof d.inspect === "function" ? d.inspect() : null;
  if (!app || typeof app.inspectJson !== "function") return null;
  const adapter = {
    label: "EVG · " + state.which,
    tree: () => app.inspectJson(generation),
    node: (path) => app.inspectNodeJson(path),
    hit: (x, y) => app.inspectHitPath(x, y),
    frame: () => app.inspectFrameJson(),
  };
  if (typeof app.inspectForce === "function") {
    adapter.force = (path, bits) => { app.inspectForce(path, bits); paint(); };
  }
  if (d.css && typeof app.inspectCss === "function") {
    adapter.css = () => ({
      name: d.css,
      href: "/gallery/evgui/demo/" + d.css,
      text: app.inspectCss(),
      errors: JSON.parse(app.inspectStyleErrors()),
    });
    adapter.setCss = (text) => { lastSentCss = text; app.inspectSetCss(text); paint(); };
    // Saving means putting the text back where the input came from. The watch
    // then picks it up like any other save, which is why `lastSentCss` exists:
    // the page that wrote it does not need to re-apply its own text.
    adapter.saveCss = async (text) => {
      lastSentCss = text;
      const r = await fetch("/gallery/evgui/demo/" + d.css, { method: "PUT", body: text });
      if (!r.ok) throw new Error("save failed: " + r.status + " " + (await r.text()));
    };
  }
  return adapter;
}

// --- live CSS from disk -------------------------------------------------------
//
// `serve.mjs` watches gallery/evgui/demo/*.css and says which one changed. This
// end fetches it and hands it to the app, which re-parses and re-cascades the
// way it did at `init` — the sheet is the app's INPUT, so there is nothing to
// patch and nothing to hold over its head.
//
// Editing the file and editing it in the panel are therefore the SAME
// operation arriving by two routes, and neither can drift from the other.
let cssStream = null;
// The last text this page handed to the app, so the save it just made does not
// come back round the loop as a change to apply again.
let lastSentCss = null;

function watchCss() {
  if (cssStream) return;
  const q = new URLSearchParams(location.search).get("inspect");
  if (q === null || q === "0" || q === "false") return;
  cssStream = new EventSource("/evg/css/events");
  cssStream.onmessage = async (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    const d = demo();
    if (!d || d.css !== msg.file) return;          // a sheet this demo does not use
    const app = typeof d.inspect === "function" ? d.inspect() : null;
    if (!app || typeof app.inspectSetCss !== "function") return;
    try {
      const text = await (await fetch(msg.href + "?t=" + Date.now())).text();
      if (text === lastSentCss) return;              // our own save, coming back
      lastSentCss = text;
      app.inspectSetCss(text);
      paint();
      if (inspector) inspector.refresh();
      console.log(`css reloaded: ${msg.file} (${text.length} bytes)`);
    } catch (e) {
      reportError(e, "a stylesheet reload");
    }
  };
  // A dropped stream is not an error worth shouting about — EventSource
  // reconnects on its own, and the server says `retry: 1000`.
  cssStream.onerror = () => {};
}

function inspectorTick() {
  const q = new URLSearchParams(location.search).get("inspect");
  if (q === null || q === "0" || q === "false") return;
  const adapter = inspectorAdapter();
  if (!adapter) {
    // A demo that publishes no inspect channel is not an error: the panel is
    // taken down and the page carries on. Saying which demos have it would be
    // this file keeping a second list of that fact.
    if (inspector) { inspector.detach(); inspector = null; inspectorFor = ""; }
    return;
  }
  watchCss();
  if (!inspector || inspectorFor !== state.which) {
    if (inspector) inspector.detach();
    inspector = attachInspector({ surface: canvas, app: adapter });
    inspectorFor = state.which;
    inspectorAt = performance.now();
    window.__inspector = inspector;
    return;
  }
  const now = performance.now();
  if (now - inspectorAt < INSPECT_MS) return;
  inspectorAt = now;
  inspector.refresh();
}

// --- the page ----------------------------------------------------------------

function radios(host, name, values, get, set) {
  host.replaceChildren(
    ...values.map((v) => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "radio";
      input.name = name;
      input.value = v;
      input.checked = get() === v;
      input.addEventListener("change", () => {
        set(v);
        paint();
      });
      label.append(input, document.createTextNode(v));
      return label;
    }),
  );
}

function boxes(host, values, has, toggle) {
  host.replaceChildren(
    ...values.map((v) => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = v;
      input.checked = has(v);
      input.addEventListener("change", () => {
        toggle(v);
        paint();
      });
      label.append(input, document.createTextNode(v));
      return label;
    }),
  );
}

// The sidebar is a second view of the same state, so a click on the canvas has
// to move it too — otherwise the panel says "File" while the screen shows View.
function syncControls() {
  for (const input of document.querySelectorAll("#format input")) {
    input.checked = state[input.value];
  }
  for (const input of document.querySelectorAll("#align input")) {
    input.checked = input.value === state.align;
  }
  // The order, as a second view of the same state — the sidebar is where you
  // check that what you dragged is what the page now holds.
  document.getElementById("order").textContent = state.order.join(" → ");
}

function syncPanels() {
  for (const el of document.querySelectorAll("[data-for]")) {
    el.hidden = el.dataset.for !== state.which;
  }
  syncChrome();
}

// `?demo=dashboard` lands on one directly. A page with eighteen demos and one
// entry point makes every link to it a click instruction; a check that wants
// the dashboard should not have to press a radio to get there.
const DEMO_NAMES = ["menubar", "toolbar", "sortable", "table", "tree", "timeline", "resizable", "form", "calendar", "filters", "eventcal", "message", "controls", "otp", "metadata", "profile", "dashboard", "dropdown", "dialog", "motion", "effects", "accordion", "separator", "tabs"];
DEMO_NAMES.push("popover");
DEMO_NAMES.push("autocomplete");
DEMO_NAMES.push("pagination");
DEMO_NAMES.push("radio");
DEMO_NAMES.push("rating");
DEMO_NAMES.push("kanban");
DEMO_NAMES.push("drawer");
DEMO_NAMES.push("combobox");
DEMO_NAMES.push("colorpicker");
DEMO_NAMES.push("questionnaire");
DEMO_NAMES.push("select");
DEMO_NAMES.push("window");
const wanted = new URLSearchParams(location.search).get("demo");
if (wanted && DEMO_NAMES.includes(wanted)) state.which = wanted;

// The dashboard's palettes. The name on the left is what the radio says and
// what `?theme=` takes; the name on the right is the name the sheet's `@vars`
// blocks are written under, and "" is the unscoped palette — the light theme
// the page was built as. Adding a fourth is a `@vars <name>` block in
// `dashboard.css` and one line here: forty-one colours, no rules.
const DASH_THEMES = { default: "", marine: "marine", sunrise: "sunrise" };
const askedTheme = new URLSearchParams(location.search).get("theme");
if (askedTheme && askedTheme in DASH_THEMES) dashboard.setTheme(DASH_THEMES[askedTheme]);

radios(
  document.getElementById("demos"),
  "demo",
  DEMO_NAMES,
  () => state.which,
  (v) => {
    state.which = v;
    state.focus = "";
    syncPanels();
    syncMotionClock();
    syncTextSession();
    // The demo that just arrived may be one that moves by itself.
    startClock();
  },
);
setupChrome();

// --- the page chrome -----------------------------------------------------------
// Everything round the stage: the component list's names and counts, the
// search and filter boxes, the title / description / source link of the demo
// on screen, the theme toggle and the phone drawer. The words live in
// index.html (`#demo-meta`); this only puts them where they go. None of it
// touches a demo's state — choosing a demo is still a click on its radio.

const SOURCE_BASE = "https://github.com/terotests/EVGUI/blob/main/demo/";

function demoMeta(name) {
  if (!demoMeta.all) {
    try {
      demoMeta.all = JSON.parse(document.getElementById("demo-meta").textContent);
    } catch (e) {
      demoMeta.all = {};
    }
  }
  return demoMeta.all[name] || { title: name, desc: "", caption: "", src: "" };
}

/** How many things-to-try and notes the page has for a demo: the sidebar count. */
function noteCount(name) {
  return document.querySelectorAll(
    `[data-for="${name}"] p.hint:not(#order), p.note[data-for="${name}"]`,
  ).length;
}

/** The demo's page colour, painted round the canvas so the card is one surface. */
function previewBg(list) {
  const el = document.getElementById("preview");
  if (!el) return;
  const c = list && list.cmds && list.cmds[0];
  const bg = c && c.k === 0 && !c.x && !c.y && Array.isArray(c.c)
    ? `rgba(${c.c[0]}, ${c.c[1]}, ${c.c[2]}, ${c.c[3] == null ? 1 : c.c[3]})`
    : "";
  if (el.dataset.bg === bg) return;
  el.dataset.bg = bg;
  if (bg) el.style.setProperty("--preview-bg", bg);
  else el.style.removeProperty("--preview-bg");
}

function chooseDemo(name) {
  const input = document.querySelector(`#demos input[value="${name}"]`);
  if (input && !input.checked) input.click();
  setDrawer(false);
}

function setDrawer(open) {
  document.body.classList.toggle("drawer-open", open);
  for (const id of ["navtoggle", "mobilepick"]) {
    const b = document.getElementById(id);
    if (b) b.setAttribute("aria-expanded", String(open));
  }
}

function matches(name, q) {
  if (!q) return true;
  const m = demoMeta(name);
  return (name + " " + m.title).toLowerCase().includes(q.trim().toLowerCase());
}

function syncChrome() {
  const name = state.which;
  const m = demoMeta(name);
  const set = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  set("crumb", m.title);
  set("demotitle", m.title);
  set("demodesc", m.desc || "");
  set("caption", m.caption || "");
  set("mobilepicklabel", m.title);
  document.title = `${m.title} — EVGUI`;
  const src = document.getElementById("viewsource");
  if (src && m.src) {
    src.href = SOURCE_BASE + m.src + ".rgr";
    src.setAttribute("aria-label", `View the source of the ${m.title} demo on GitHub`);
  }
  if (stylesPanel) stylesPanel.sync();
  // The controls panel only when this demo has controls.
  const panel = document.getElementById("picker");
  if (panel) panel.hidden = !panel.querySelector("[data-for]:not([hidden])");
  // The address says which demo is on screen, so a copied link lands on it.
  const url = new URL(location.href);
  if (url.searchParams.get("demo") !== name) {
    url.searchParams.set("demo", name);
    history.replaceState(history.state, "", url);
  }
}

function setupChrome() {
  // The rows main.js built are `<label><input>name</label>`; give each its
  // display name and count without replacing the radio the checks click.
  for (const label of document.querySelectorAll("#demos label")) {
    const input = label.querySelector("input");
    if (!input) continue;
    const name = input.value;
    for (const n of [...label.childNodes]) if (n !== input) n.remove();
    const title = document.createElement("span");
    title.className = "name";
    title.textContent = demoMeta(name).title;
    label.append(title);
    const k = noteCount(name);
    if (k) {
      const count = document.createElement("span");
      count.className = "count";
      count.textContent = String(k);
      count.title = `${k} note${k === 1 ? "" : "s"} on what to try`;
      label.append(count);
    }
    label.dataset.name = name;
  }
  // Alphabetical by the name shown, whatever order DEMO_NAMES holds, so a new
  // demo lands in its place without anyone reordering the list.
  const list = document.getElementById("demos");
  const rows = [...list.querySelectorAll(":scope > label")];
  rows
    .sort((a, b) => demoMeta(a.dataset.name).title.localeCompare(demoMeta(b.dataset.name).title, "en"))
    .forEach((row) => list.append(row));

  const filter = document.getElementById("demofilter");
  if (filter) {
    filter.addEventListener("input", () => {
      let shown = 0;
      for (const label of document.querySelectorAll("#demos label")) {
        const ok = matches(label.dataset.name || "", filter.value);
        label.hidden = !ok;
        if (ok) shown += 1;
      }
      const none = document.getElementById("nomatch");
      if (none) none.hidden = shown > 0;
    });
  }

  const search = document.getElementById("demosearch");
  const results = document.getElementById("searchresults");
  if (search && results) {
    let hits = [];
    let at = 0;
    const close = () => {
      results.hidden = true;
      search.setAttribute("aria-expanded", "false");
      search.removeAttribute("aria-activedescendant");
    };
    const render = () => {
      const q = search.value.trim();
      if (!q) return close();
      hits = DEMO_NAMES.filter((n) => matches(n, q));
      at = Math.min(at, Math.max(0, hits.length - 1));
      results.replaceChildren(...(hits.length ? hits.map((n, i) => {
        const li = document.createElement("li");
        const b = document.createElement("button");
        b.type = "button";
        b.id = "sr-" + n;
        b.setAttribute("role", "option");
        b.setAttribute("aria-selected", String(i === at));
        b.tabIndex = -1;
        if (i === at) b.className = "on";
        const t = document.createElement("strong");
        t.textContent = demoMeta(n).title;
        const d = document.createElement("span");
        d.textContent = demoMeta(n).caption || "";
        b.append(t, d);
        b.addEventListener("mousedown", (e) => e.preventDefault());
        b.addEventListener("click", () => {
          chooseDemo(n);
          search.value = "";
          close();
        });
        li.append(b);
        return li;
      }) : [Object.assign(document.createElement("li"), { className: "empty", textContent: "No component matches." })]));
      results.hidden = false;
      search.setAttribute("aria-expanded", "true");
      if (hits.length) search.setAttribute("aria-activedescendant", "sr-" + hits[at]);
    };
    search.addEventListener("input", () => { at = 0; render(); });
    search.addEventListener("focus", render);
    search.addEventListener("blur", close);
    search.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (!hits.length) return;
        e.preventDefault();
        at = (at + (e.key === "ArrowDown" ? 1 : hits.length - 1)) % hits.length;
        render();
      } else if (e.key === "Enter") {
        if (!hits.length || results.hidden) return;
        e.preventDefault();
        chooseDemo(hits[at]);
        search.value = "";
        close();
      } else if (e.key === "Escape") {
        search.value = "";
        close();
      }
    });
  }

  const copy = document.getElementById("copylink");
  if (copy) {
    copy.addEventListener("click", async () => {
      let ok = false;
      try {
        await navigator.clipboard.writeText(location.href);
        ok = true;
      } catch (e) {
        ok = false;
      }
      copy.classList.toggle("done", ok);
      copy.title = ok ? "Link copied" : "Copy failed — the address bar has the link";
      setTimeout(() => {
        copy.classList.remove("done");
        copy.title = "Copy link";
      }, 1600);
    });
  }

  const theme = document.getElementById("themetoggle");
  if (theme) {
    theme.addEventListener("click", () => {
      const root = document.documentElement;
      const dark = root.dataset.theme
        ? root.dataset.theme === "dark"
        : matchMedia("(prefers-color-scheme: dark)").matches;
      const next = dark ? "light" : "dark";
      root.dataset.theme = next;
      try {
        localStorage.setItem("evgui-theme", next);
      } catch (e) {
        // A private window: the choice lasts until the page is closed.
      }
    });
  }

  for (const id of ["navtoggle", "mobilepick"]) {
    const b = document.getElementById(id);
    if (b) b.addEventListener("click", () => setDrawer(!document.body.classList.contains("drawer-open")));
  }
  const scrim = document.getElementById("scrim");
  if (scrim) scrim.addEventListener("click", () => setDrawer(false));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.body.classList.contains("drawer-open")) setDrawer(false);
  });
  const demos = document.getElementById("demos");
  // Picking a row on a phone closes the drawer; arrowing through the radios
  // (a keyboard change) leaves it open.
  if (demos) demos.addEventListener("click", (e) => {
    if (e.target instanceof HTMLInputElement && e.detail > 0) setDrawer(false);
  });
}
function syncFxSwitches() {
  const host = document.getElementById("fxswitches");
  if (!host) return;
  boxes(
    host,
    fxDeclared(),
    (v) => !fxOff.has(fxLabelId(v)),
    (v) => {
      const id = fxLabelId(v);
      if (fxOff.has(id)) fxOff.delete(id); else fxOff.add(id);
      // Switching one back ON has to start the clock again: the page stopped
      // asking for frames when the last moving thing was turned off.
      startClock();
    },
  );
}
syncFxSwitches();
boxes(
  document.getElementById("format"),
  ["bold", "italic", "underline"],
  (v) => state[v],
  (v) => {
    state[v] = !state[v];
  },
);
radios(
  document.getElementById("align"),
  "align",
  ["left", "center", "right"],
  () => state.align,
  (v) => {
    state.align = v;
  },
);
// Colours only: the theme repaints and moves nothing, so switching it leaves
// every measured position on the page the number it was.
radios(
  document.getElementById("dashthemes"),
  "dashtheme",
  Object.keys(DASH_THEMES),
  () => Object.keys(DASH_THEMES).find((k) => DASH_THEMES[k] === dashboard.themeName()),
  (v) => {
    dashboard.setTheme(DASH_THEMES[v]);
  },
);
// --- input -------------------------------------------------------------------

// The canvas is where the picture is, so the canvas is where a press lands.
// `offsetX/offsetY` are already in the page's own coordinates because the
// canvas is laid out at exactly the size the display list was built for.
/**
 * What the pointer is standing on, said by the cursor.
 *
 * A canvas has one cursor for the whole surface, so the page has to change it
 * by hand — and without that a button in here looked exactly like the
 * background, which is the first thing that makes a canvas UI feel like a
 * picture rather than an interface. `activate` is the accessible tree's own
 * word for "this can be pressed", so there is no second list of what counts.
 */
// What the pointer looks like here.
//
// A demo that says so in its stylesheet wins: `cursor` is a real inherited
// property in EVG, so a title bar declares `cursor: move` once and every word
// on it answers the same. Anything else falls back to the old rule — a node
// you can activate gets a pointer — which is all most of the page needs.
//
// And while something is held, the cursor belongs to the GESTURE and not to
// whatever happens to be under the pointer, which may be nothing at all once
// the drag has left the bar behind.
function setCursor(id, x, y) {
  const d = demo();
  // A gesture keeps the cursor it started with. `grabbing` is the fallback for
  // a drag whose handle declared nothing; a bar that says `move` should go on
  // saying `move` while it is being moved, not change its mind halfway.
  if (held) {
    canvas.style.cursor = grabCursor || "grabbing";
    return;
  }
  if (d.cursorAt && x !== undefined) {
    const c = d.cursorAt(x, y);
    if (c) { canvas.style.cursor = c; return; }
  }
  const node = id && lastTree && lastTree.byId && lastTree.byId.get(id);
  canvas.style.cursor = node && node.activate ? "pointer" : "default";
}

let held = false;
let grabCursor = "";
// Focusable by script, NOT by Tab: clicking the picture should take the focus
// off whatever sidebar control put it there, and the tab order belongs to the
// accessibility mirror, which is the thing a reader actually walks.
canvas.tabIndex = -1;
canvas.style.outline = "none";

listen(canvas, "pointerdown", "a press", (ev) => {
  // The thing you clicked gets the focus. Without this the sidebar radio that
  // chose the demo keeps it, and on a page whose keys go to `window` that is
  // indistinguishable from a demo that ignores the keyboard.
  canvas.focus({ preventScroll: true });
  ev.preventDefault();
  const d = demo();
  const h = d.host && d.host();
  if (h) h.setPressed(hitAt(ev.offsetX, ev.offsetY));
  // The surface reacts to the touch, wherever it landed and whatever it hit.
  if (d.ripple) { d.ripple(ev.offsetX, ev.offsetY); animate(); }
  if (d.drag) {
    // A demo with a gesture: the press picks up, the move carries, the release
    // puts down. Nothing happens on a press that never travels.
    grabPointer = { x: ev.offsetX, y: ev.offsetY };
    grabCursor = d.cursorAt ? d.cursorAt(ev.offsetX, ev.offsetY) : "";
    held = d.press(hitAt(ev.offsetX, ev.offsetY), ev.offsetX, ev.offsetY, ev);
    if (held) {
      canvas.setPointerCapture(ev.pointerId);
      paint();
    }
    syncTextSession();
    return;
  }
  press(ev.offsetX, ev.offsetY, ev);
});
listen(canvas, "pointermove", "a pointer move", (ev) => {
  const d = demo();
  const id = hitAt(ev.offsetX, ev.offsetY);
  setCursor(id, ev.offsetX, ev.offsetY);
  // `ev.buttons` rather than a flag of our own: the pointer can go down
  // outside the canvas and come back, and the browser already knows.
  if (d.rippleTo && ev.buttons) { d.rippleTo(ev.offsetX, ev.offsetY); animate(); }
  if (held && d.drag) {
    if (d.drag(id, ev)) {
      paint();
      // The gap opening is a transition like any other, and a transition needs
      // FRAMES. This branch returns early, so without this the flights were
      // started and never advanced: the classes were right, the rules were
      // right, and every row sat at zero progress for the whole drag.
      if (d.animated) animate();
    }
    return;
  }
  // Two different things, and both have to happen. `d.hover` is the demo's own
  // BEHAVIOUR — hovering Share opens the submenu — and `setHover` is the
  // presentational flag the stylesheet reads. A demo with no hover behaviour
  // still gets the second one, which is why the toolbar and the sortable now
  // light up at all.
  let changed = d.hover(id);
  const h = d.host && d.host();
  if (h && h.setHover(id)) changed = true;
  if (changed) {
    paint();
    // A hover starts a transition, and a transition needs frames.
    if (d.animated) animate();
  }
});
// Double-click, from the browser's own event rather than a click count of our
// own: it owns the interval and the slop radius, and re-deriving either turns
// a slow double-click into two carets.
//
// A `pointerdown` cannot answer this — measured, its `detail` is 0 here while
// `click` and `dblclick` carry 1 and 2. (And `preventDefault()` on the
// pointerdown does NOT suppress them, which was the reason given for reading
// the count instead; that reason was wrong.)
listen(canvas, "dblclick", "a double-click", (ev) => {
  const d = demo();
  if (!d.dblclick) return;
  if (d.dblclick(hitAt(ev.offsetX, ev.offsetY), ev.offsetX, ev.offsetY)) paint();
  syncTextSession();
});
listen(canvas, "pointerup", "a release", () => {
  const d = demo();
  if (d.rippleEnd) d.rippleEnd();
  const h = d.host && d.host();
  if (h) {
    h.setPressed("");
    paint();
    if (d.animated) animate();
  }
  if (!held || !d.drop) return;
  held = false;
  if (d.drop()) paint();
  syncTextSession();
});
listen(canvas, "pointerleave", "the pointer leaving", () => {
  const d = demo();
  setCursor("");
  let changed = d.hover("");
  const h = d.host && d.host();
  if (h && h.setHover("")) changed = true;
  if (changed) {
    paint();
    if (d.animated) animate();
  }
});
// The wheel, for a demo that has somewhere to scroll to. `passive: false`
// because a page that scrolls its own canvas must be able to stop the window
// from scrolling underneath it — and `scroll` returning false (already at an
// end) lets the window have the gesture back, which is what a nested scroll
// area is supposed to do.
listen(canvas, "wheel", "a scroll", (ev) => {
  const d = demo();
  if (!d.scroll) return;
  if (!d.scroll(ev.deltaY)) return;
  ev.preventDefault();
  paint();
}, { passive: false });

// Keys are the window's: the mirror element that has the focus is inside this
// page, and the canvas is only focusable by script.
//
// WHAT THIS GUARD IS FOR, and what it was doing instead. A key belongs to the
// demo unless the reader is typing into a real control on the page. It used to
// bail for ANY `HTMLInputElement`, and the page's only inputs are the
// sidebar's radios and checkboxes — so picking a demo left focus on the radio
// that picked it, and every keystroke after that was dropped. Click a field on
// the Profile page, type, and nothing happens; the demo never saw a key. A
// checkbox does not consume text, so it must not swallow one.
const TYPES_TEXT = new Set([
  "text", "search", "email", "url", "tel", "password", "number", "date",
  "datetime-local", "month", "week", "time",
]);
const consumesText = (el) => {
  if (!(el instanceof HTMLElement)) return false;
  // A MIRROR NODE IS NOT A FIELD. The accessibility mirror renders a drawn
  // textbox as a real `<input>` so a reader meets one, and now that the app's
  // focus reaches the mirror that input is where the focus often sits — on the
  // stepper's quantity, say, which is drawn and not typed into. Judged by tag
  // alone it looked like a field and swallowed every key the demo wanted, so
  // Shift+ArrowUp on the stepper did nothing at all. A mirror node consumes
  // text only while the bridge is actually editing in it; otherwise the app
  // owns the keys, exactly as it did when the canvas held the focus.
  if (el.dataset && el.dataset.a11yId) {
    return textInput.isActive() && textInput.element() === el;
  }
  return el instanceof HTMLTextAreaElement ||
    (el instanceof HTMLInputElement && TYPES_TEXT.has(el.type)) ||
    el.isContentEditable;
};

listen(window, "keydown", "a key", (ev) => {
  if (consumesText(ev.target)) return;
  const d0 = demo();
  // Keys reach the demo only while the keyboard is IN it, and Tab is the
  // keyboard section's (see "KEYBOARD" below): one stop per widget, and out
  // of the canvas after the last one.
  if (!kbInside()) return;
  if (ev.key === "Tab") {
    if (kbTab(ev.shiftKey)) ev.preventDefault();
    return;
  }
  // A demo that reads modifiers gets them; the rest keep the one-argument
  // door they have always had.
  const took = d0.keyWith
    ? d0.keyWith(ev.key, ev.shiftKey, ev.ctrlKey || ev.metaKey, ev.altKey)
    : d0.key(ev.key);
  if (!took && !(!ev.ctrlKey && !ev.metaKey && !ev.altKey && kbFallbackKey(ev.key))) return;
  ev.preventDefault();
  paint();
  // A key can put the focus back in a field without the pointer — Escape out
  // of the profile's date picker returns it to the date box — and the editing
  // session has to follow, or the next keystroke types nowhere.
  if (d0.textSession) syncTextSession();
  // THE CLOCK, same as every pointer handler above. A focus ring and a row's
  // background are transitioned properties: the frame a key produces is the
  // START of that transition, so a page that painted once and stopped showed
  // the highlight still on the row the arrow had just left. Every pointer
  // path already started the loop; the keyboard was the one that did not, and
  // that is the whole of "the arrows move the selection but the grey does not
  // follow".
  if (d0.animated) animate();
});

// The text-input session. A real, transparent <input> over the focused field:
// the browser does the editing and Ranger mirrors it, so IME, dead keys, the
// clipboard, undo, emoji and a phone's on-screen keyboard all work without a
// line of code each. See evg-textinput.js for what was measured first.
const textInput = createTextInputBridge({
  host: stage,
  canvas,
  onEdit: guard(({ value, selStart, selEnd }) => {
    const d = demo();
    const s = d.textSession;
    if (!s) return;
    const tid = textInput.activeTid();
    if (!tid) return;
    if (!s.apply(tid, value, selStart, selEnd)) return;
    paint();
    // An edit can start something on the demo's clock (the autocomplete's
    // async card fetches after a keystroke).
    if (d.animated) animate();
    // The model may have REFUSED part of it — a number field will not take
    // letters, and the platform has no idea. Push the corrected value back
    // into the session, but only when it actually differs: writing to the
    // proxy's `value` for no reason disturbs the browser's own undo history,
    // which is one of the things this bridge exists to inherit.
    const after = s.state(tid);
    if (after && after.value !== value) textInput.sync(after);
  }, "typing"),
  // Keys the APPLICATION owns rather than the field. Everything else — every
  // arrow, Home, End, Ctrl+Arrow, Backspace over an emoji — stays with the
  // proxy on purpose: those are precisely the platform rules this exists to
  // borrow, and intercepting them here would be reimplementing them again.
  onKey: guard((k) => {
    const d = demo();
    // Three keys are the application's on every page, and a demo may claim
    // more for the field that has the focus: the combobox wants its arrows,
    // because there they walk the list rather than the caret.
    // Tab is the keyboard section's, here as on the window — see `kbTab`.
    if (k.key === "Tab") return kbTab(k.shiftKey);
    const claimed = typeof d.ownsKey === "function" && d.ownsKey(k.key, k);
    if (!claimed && k.key !== "Tab" && k.key !== "Escape" && k.key !== "Enter") return false;
    const took = d.keyWith ? d.keyWith(k.key, k.shiftKey, k.ctrlKey || k.metaKey, k.altKey) : false;
    // Focus may have moved to another field, or off the fields entirely.
    syncTextSession();
    if (took) {
      paint();
      // A key can start something that moves on its own — Enter in the
      // message composer sends, and the reply comes on the demo's clock.
      if (d.animated) animate();
    }
    return took;
  }, "a key in a text field"),
});

/**
 * Hand the keyboard to whichever field the demo now says is focused, or take
 * it back. Called after anything that can move focus — a click, a Tab, a
 * demo switch — because the demo owns focus and the bridge only follows it.
 */
function syncTextSession() {
  const d = demo();
  const s = d.textSession;
  if (!s) {
    textInput.blurField();
    return;
  }
  const tid = s.focused();
  if (!tid) {
    textInput.blurField();
    return;
  }
  const st = s.state(tid);
  if (!st) {
    textInput.blurField();
    return;
  }
  if (textInput.activeTid() === tid) {
    // Same field, but Ranger may have moved the caret itself — a click, a
    // drag, a double-click. The proxy has to agree or the next keystroke
    // edits at the old place.
    textInput.sync(st);
    return;
  }
  textInput.focusField(tid, st);
}

// A demo rebuilt from scratch, for `input-bench.mjs`. The bench runs twenty
// scenarios against every field and each has to start from the page as loaded
// — the objects above live for the life of the page, so after one scenario has
// typed into a field the next would read "Ada ZXLovelace". Reloading works and
// costs a 10 MB bundle per scenario; this costs a constructor. Only the pages
// with text fields, and those four are `let` for exactly this reason.
//
// `css` is the stylesheet to build it with; left out, it is whatever the page
// is using for that demo now (the Styles panel's text, or the default). The
// Styles panel rebuilds through `recreateDemo` when an edit REMOVES a
// declaration: the cascade writes what a rule says and never un-writes what a
// rule stopped saying, so only a fresh tree shows the removal.
function recreateDemo(name, css) {
  if (name === "form") { form = new FormDemo(); form.init(css ?? cssFor("form", FORM_CSS)); lastFormHover = ""; }
  else if (name === "profile") { profile = new ProfileDemo(); profile.init(css ?? cssFor("profile", PROFILE_CSS)); lastProfileHover = ""; }
  else if (name === "controls") { controls = new ControlsDemo(); controls.init(css ?? cssFor("controls", CONTROLS_CSS)); lastControlsHover = ""; }
  else if (name === "otp") { otp = new OtpDemo(); otp.init(css ?? cssFor("otp", OTP_CSS)); lastOtpHover = ""; }
  else if (name === "metadata") { metadata = new MetadataDemo(); metadata.init(css ?? cssFor("metadata", METADATA_CSS)); lastMetadataHover = ""; }
  else if (name === "message") { message = new MessageDemo(); message.init(css ?? cssFor("message", MESSAGE_CSS)); lastMessageHover = ""; }
  else if (name === "tabs") { tabs = new TabsDemo(); tabs.init(css ?? cssFor("tabs", TABS_CSS)); lastTabsHover = ""; }
  else if (name === "autocomplete") { autocomplete = new AutocompleteDemo(); autocomplete.init(css ?? cssFor("autocomplete", AUTOCOMPLETE_CSS)); lastAutocompleteHover = ""; }
  else if (name === "pagination") { pagination = new PaginationDemo(); pagination.init(css ?? cssFor("pagination", PAGINATION_CSS)); lastPaginationHover = ""; }
  else if (name === "radio") { radio = new RadioGroupDemo(); radio.init(css ?? cssFor("radio", RADIO_CSS)); lastRadioHover = ""; }
  else if (name === "menubar") { menubar = new MenubarDemo(); menubar.init(css ?? cssFor("menubar", MENUBAR_CSS)); lastMenubarHover = ""; }
  else if (name === "rating") { rating = new RatingDemo(); rating.init(css ?? cssFor("rating", RATING_CSS)); lastRatingHover = ""; }
  else if (name === "kanban") { kanban = new KanbanDemo(); kanban.init(css ?? cssFor("kanban", KANBAN_CSS)); lastKanbanHover = ""; }
  else if (name === "drawer") { drawer = new DrawerDemo(); drawer.init(css ?? cssFor("drawer", DRAWER_CSS)); lastDrawerHover = ""; }
  else if (name === "combobox") { combobox = new ComboboxDemo(); combobox.init(css ?? cssFor("combobox", COMBOBOX_CSS)); lastComboboxHover = ""; }
  else if (name === "colorpicker") { cpStop(); colorpicker = new ColorPickerDemo(); colorpicker.init(css ?? cssFor("colorpicker", COLORPICKER_CSS)); colorpicker.setScreenPicker(typeof window.EyeDropper === "function"); lastColorpickerHover = ""; }
  else if (name === "questionnaire") { questionnaire = new QuestionnaireDemo(); questionnaire.setReducedMotion(questionnaireStill); questionnaire.init(css ?? cssFor("questionnaire", QUESTIONNAIRE_CSS)); lastQuestionnaireHover = ""; }
  else if (name === "select") { select = new SelectDemo(); select.init(css ?? cssFor("select", SELECT_CSS)); lastSelectHover = ""; }
  else if (name === "window") { windemo = new WindowDemo(); windemo.init(css ?? cssFor("window", WINDOW_CSS)); lastWindowHover = ""; }
  else if (name === "dialog") { dialog = new DialogDemo(); dialog.init(css ?? cssFor("dialog", DIALOG_CSS)); lastDialogHover = ""; }
  else if (name === "popover") { popover = new PopoverDemo(); popover.init(css ?? cssFor("popover", POPOVER_CSS)); lastPopoverHover = ""; }
  else return false;
  return true;
}
window.__resetDemo = (name, css) => {
  if (!recreateDemo(name, css)) return false;
  held = false;
  textInput.blurField();
  canvas.focus({ preventScroll: true });
  paint();
  return true;
};

// =============================================================================
// KEYBOARD — tab stops, roving arrows, a visible focus ring
// (WCAG 2.1.1 keyboard, 2.1.2 no keyboard trap, 2.4.7 focus visible)
// =============================================================================
//
// ONE MECHANISM FOR EVERY DEMO, read off the accessible tree the page already
// has. The model is shadcn's, which is Radix's:
//
//   * every standalone control is a Tab stop, in tree order;
//   * a COMPOSITE widget — a toolbar, a tab list, a radio group, a tree, a
//     grid, a menubar — is ONE stop, and the arrows rove inside it;
//   * a popup (a menu, a listbox) is not a stop at all: it is reached from its
//     trigger, and a Tab from inside one closes it first;
//   * Tab after the last stop, and Shift+Tab before the first, LEAVE the
//     canvas for whatever the page has next — the browser's own sequential
//     navigation does that part, so a radio group or a <details> on the page
//     is walked the way the browser walks it;
//   * keys reach the demo only while the keyboard is in it;
//   * the control with the focus gets a ring when the keyboard put it there
//     (a text field gets one however it was focused, as :focus-visible does).
//
// A demo with a Tab ring of its own (`ownsTab`: the form, the profile card,
// the metadata card, the OTP boxes, the calendar, the event calendar, the
// transcript, the dialog) gets the Tab instead — its ring knows things the
// tree does not, such as a date field's segments or a modal's trap — and
// says "not mine" at its ends, which is where this leaves the canvas.
//
// Every mirror element that is a stop gets tabindex=0 and every other one -1,
// so a Tab from the page ENTERS at the first stop and a Shift+Tab from below
// enters at the last. Inside, Tab is handled here rather than left to the DOM
// order of the mirror, which drifts from the tree's as nodes come and go.

const KB_COMPOSITE = new Set(["menubar", "menu", "toolbar", "tablist", "tree", "treegrid", "grid", "listbox", "radiogroup"]);
const KB_POPUP = new Set(["menu", "listbox"]);
// Roles a key activates when the demo did not take the key itself: the same
// press a pointer gives, at the middle of the node.
const KB_ACTIVATE = new Set(["button", "link", "checkbox", "switch", "radio", "tab", "menuitem",
  "menuitemcheckbox", "menuitemradio", "option", "treeitem"]);
// A text field shows its ring however it got the focus; everything else only
// when the keyboard moved it, which is the :focus-visible rule.
const KB_TEXT = new Set(["textbox", "combobox", "spinbutton", "searchbox"]);
// The row highlight IS the focus indicator in an open menu or list, so a
// popup and anything in one get no ring (a menubar's triggers still do).
const KB_NO_RING = new Set(["menu", "listbox"]);

// Where the keyboard last was, for the moments the focused element has gone
// (a node removed under it leaves the focus on <body>).
let kbHome = false;
// Between a Tab that leaves and the browser moving the focus out.
let kbLeaving = false;
// :focus-visible's rule — did the keyboard or a pointer move things last?
let kbKeyboardMode = false;

/** Is the keyboard in the demo? Keys go to it only then. */
function kbInside() {
  const a = document.activeElement;
  if (a && a !== document.body && a !== document.documentElement) return stage.contains(a);
  return kbHome;
}

const kbNode = (id) => (id && lastTree && lastTree.byId ? lastTree.byId.get(id) : null) || null;
const kbParent = (n) => (n && n.p ? kbNode(n.p) : null);

/** The app's focus, or the mirror element's when the app keeps none. */
function kbFocusId() {
  const f = appFocus();
  if (f) return f;
  const a = document.activeElement;
  const el = a && a.closest ? a.closest("[data-a11y-id]") : null;
  return el && stage.contains(el) ? el.dataset.a11yId : "";
}

function kbInPopup(n) {
  for (let a = kbParent(n); a; a = kbParent(a)) if (KB_POPUP.has(a.role)) return true;
  return false;
}

/** The OUTERMOST composite a node is in: a radio group inside a toolbar is the toolbar's. */
function kbGroupOf(n) {
  let g = null;
  for (let a = kbParent(n); a; a = kbParent(a)) if (KB_COMPOSITE.has(a.role)) g = a;
  return g;
}

function kbWithin(n, anc) {
  for (let a = n; a; a = kbParent(a)) if (a === anc) return true;
  return false;
}

/** Can this node take the keyboard at all? */
function kbFocusable(n, modal) {
  if (!n.focusable || n.disabled) return false;
  if (modal && !kbWithin(n, modal)) return false;
  return !kbInPopup(n);
}

/**
 * The Tab stops, in tree order: `{id, pos, group}`. A composite is one entry
 * — the member with the focus, else the chosen one (a radio group's checked
 * radio, a tab list's selected tab), else its first.
 */
function kbStops(tree, focusId) {
  if (!tree || !tree.nodes) return [];
  const modal = tree.nodes.find((n) => n.modal) || null;
  const out = [];
  const groups = new Map();
  tree.nodes.forEach((n, pos) => {
    if (!kbFocusable(n, modal)) return;
    const group = kbGroupOf(n);
    if (!group) {
      out.push({ id: n.id, pos, group: null });
      return;
    }
    let g = groups.get(group.id);
    if (!g) {
      g = { id: "", pos, group, members: [] };
      groups.set(group.id, g);
      out.push(g);
    }
    g.members.push(n);
  });
  for (const g of groups.values()) {
    const m = g.members;
    const chosen = g.group.role === "toolbar" || g.group.role === "menubar"
      ? null
      : m.find((n) => n.selected) || m.find((n) => n.checked === 2) || m.find((n) => n.current);
    g.id = (m.find((n) => n.id === focusId) || chosen || m[0]).id;
  }
  return out;
}

/** Where a Tab goes from here, or null for "out of the canvas". */
function kbTarget(back, from) {
  const tree = lastTree;
  const focus = from === undefined ? kbFocusId() : from;
  const stops = kbStops(tree, focus);
  if (!stops.length) return null;
  const node = kbNode(focus);
  // Nothing focused inside — the canvas itself, after a click on empty space.
  // It sits before the mirror in the page, so forward is the first stop.
  if (!node) return back ? null : stops[0];
  const i = stops.findIndex((s) => s.id === focus || (s.group && kbWithin(node, s.group)));
  if (i >= 0) return stops[back ? i - 1 : i + 1] || null;
  // Focus on something that is not a stop (a row of an open popup, a control
  // the tree does not call focusable): carry on from where it is.
  const pos = tree.nodes.indexOf(node);
  if (back) {
    for (let k = stops.length - 1; k >= 0; k--) if (stops[k].pos < pos) return stops[k];
    return null;
  }
  return stops.find((s) => s.pos > pos) || null;
}

/** Hand the demo a focus the keyboard chose. */
function kbSetFocus(id) {
  const d = instance();
  if (!d) {
    state.focus = id;
    return;
  }
  if (typeof d.setFocus !== "function") return;
  d.setFocus(id);
  // Most demos draw their focus when the tree is BUILT, and `setFocus` only
  // records it.
  if (typeof d.rebuild === "function") d.rebuild();
}

/** After a key moved the focus: draw it, and put the DOM focus where it is. */
function kbSettle() {
  paint();
  syncTextSession();
  const want = kbFocusId();
  if (want && !textInput.isActive()) {
    const el = mirror.elementOf(want);
    if (el && document.activeElement !== el) el.focus({ preventScroll: true });
  }
  kbRingUpdate();
  if (demo().animated) animate();
}

function kbDemoKey(k, shift) {
  const d = demo();
  return d.keyWith ? d.keyWith(k, !!shift, false, false) : d.key(k);
}

/** A Tab from inside a menu or a list closes it first, back to its trigger. */
function kbEscapePopups() {
  for (let k = 0; k < 3; k++) {
    const n = kbNode(kbFocusId());
    if (!n || !kbInPopup(n)) return;
    if (!kbDemoKey("Escape")) return;
    paint();
  }
}

/**
 * Tab or Shift+Tab with the keyboard in the demo. True when it was handled
 * here (the caller prevents the default); false when the browser should carry
 * the focus out of the canvas.
 */
function kbTab(back) {
  const d = demo();
  kbEscapePopups();
  // Where the Tab starts FROM. A demo whose ring lets go at its end also
  // clears its focus as it does, and walking on from "nothing focused" would
  // put the Tab straight back on the first stop.
  const from = kbFocusId();
  if (d.ownsTab) {
    if (kbDemoKey("Tab", back)) {
      kbSettle();
      return true;
    }
    // A ring that lets go is at ITS end, and it knows its order better than
    // the tree does (the dialog's window is built before the trigger drawn
    // left of it), so the Tab leaves rather than walking the tree on.
    kbLeave();
    return false;
  }
  const next = kbTarget(back, from);
  if (next) {
    kbSetFocus(next.id);
    kbSettle();
    // A demo with no focus of its own (the motion cards) follows the DOM.
    const el = mirror.elementOf(next.id);
    if (el && !textInput.isActive() && document.activeElement !== el) el.focus({ preventScroll: true });
    kbRingUpdate();
    return true;
  }
  kbLeave();
  return false;
}

/**
 * Out of the canvas. Every mirror element leaves the tab order for this one
 * keystroke, so the browser's own Tab — which runs after this handler —
 * moves past the whole stage to the page's next (or previous) control. The
 * demo is told its focus is gone once the browser has moved it.
 */
function kbLeave() {
  kbLeaving = true;
  kbHome = false;
  for (const el of mirror.root.querySelectorAll("[data-a11y-id]")) {
    if (el.tabIndex >= 0) el.tabIndex = -1;
  }
  kbRing.style.display = "none";
  setTimeout(() => {
    kbLeaving = false;
    // Already back (a Shift+Tab straight after): nothing to blur.
    if (stage.contains(document.activeElement)) return;
    kbHome = false;
    textInput.release();
    kbSetFocus("");
    paint();
    if (demo().animated) animate();
  }, 0);
}

/** Focus moved into the mirror by itself — a Tab from the page, or a reader. */
function kbAdopt(node) {
  const before = kbFocusId();
  adoptFocus(node);
  const d = instance();
  if (d && before !== node.id && typeof d.rebuild === "function" && d.focused === node.id) {
    d.rebuild();
    paint();
  }
  if (demo().textSession) syncTextSession();
  kbRingUpdate();
}

/** Which way an arrow goes in a composite, or null when it is not one of its keys. */
function kbArrowStep(group, key) {
  if (key === "Home") return "first";
  if (key === "End") return "last";
  const role = group.role;
  if (role === "grid" || role === "treegrid") return null;
  const vertical = group.orientation === "vertical" ||
    role === "tree" || role === "listbox" || role === "menu";
  const both = role === "radiogroup";
  if (both || !vertical) {
    if (key === "ArrowRight") return 1;
    if (key === "ArrowLeft") return -1;
  }
  if (both || vertical) {
    if (key === "ArrowDown") return 1;
    if (key === "ArrowUp") return -1;
  }
  return null;
}

/**
 * The keys a demo did not take. Arrows rove inside a composite (a tab list and
 * a radio group select as they go, as Radix's do), and Enter or Space works
 * the control under the focus with the press a pointer would give it.
 */
function kbFallbackKey(key) {
  const node = kbNode(kbFocusId());
  if (!node) return false;
  const group = kbGroupOf(node);
  const step = group && !kbInPopup(node) ? kbArrowStep(group, key) : null;
  if (step !== null) {
    const modal = lastTree.nodes.find((n) => n.modal) || null;
    const members = lastTree.nodes.filter((n) => kbFocusable(n, modal) && kbWithin(n, group));
    if (!members.length) return false;
    const at = Math.max(0, members.findIndex((n) => n.id === node.id));
    const n = members.length;
    const to = step === "first" ? 0 : step === "last" ? n - 1 : (at + step + n) % n;
    const target = members[to];
    kbSetFocus(target.id);
    if (group.role === "tablist" || group.role === "radiogroup") {
      if (!(target.selected || target.checked === 2)) pressAtCentre(target, press);
      kbSetFocus(target.id);
    }
    return true;
  }
  if ((key === "Enter" || key === " ") && KB_ACTIVATE.has(node.role)) {
    pressAtCentre(node, press);
    // A surface that ripples under a finger ripples under a key press too.
    const d = demo();
    if (d.ripple && node.b) {
      d.ripple(node.b[0] + node.b[2] / 2, node.b[1] + node.b[3] / 2);
      setTimeout(() => { if (d.rippleEnd) d.rippleEnd(); animate(); }, 150);
      animate();
    }
    return true;
  }
  return false;
}

// --- the ring -----------------------------------------------------------------
// Drawn over the canvas rather than into it, so it is the same ring on every
// demo and needs nothing from twenty stylesheets. It sits in #stage, which
// carries the phone scale, so it scales with the picture it rings.
const kbRing = document.createElement("div");
kbRing.className = "evg-focus-ring";
kbRing.setAttribute("aria-hidden", "true");
Object.assign(kbRing.style, {
  position: "absolute",
  pointerEvents: "none",
  display: "none",
  borderRadius: "6px",
  boxShadow: "0 0 0 2px #ffffff, 0 0 0 4px #6366f1",
  zIndex: "3",
});
stage.appendChild(kbRing);

/**
 * The box to ring, and its corner radius. A combobox's input is drawn INSIDE
 * a box that also holds its chips, its clear button and its chevron, and a
 * ring round the input alone rings a strip in the middle of the control. So
 * the ring goes round the tightest BORDER the picture actually drew around the
 * node — read off the display list — when there is one barely bigger than it;
 * otherwise round the node's own rectangle.
 */
let kbStrokes = { src: null, list: [] };
function kbRingBox(node) {
  // A demo that knows better names the box itself (a chip box's input).
  const inst = instance();
  if (inst && typeof inst.ringBoxJson === "function") {
    const b = String(inst.ringBoxJson(node.id) || "").split(",").map(Number);
    if (b.length === 4 && b.every(Number.isFinite) && b[2] > 0) return [b[0], b[1], b[2], b[3], 8];
  }
  const src = window.__lastList;
  if (src !== kbStrokes.src) {
    let list = [];
    try {
      list = (JSON.parse(src).cmds || []).filter((c) => c.k === 1 && c.w > 0 && c.h > 0);
    } catch (e) {
      list = [];
    }
    kbStrokes = { src, list };
  }
  const [x, y, w, h] = node.b;
  let best = null;
  for (const c of kbStrokes.list) {
    if (c.x > x + 0.5 || c.y > y + 0.5 || c.x + c.w < x + w - 0.5 || c.y + c.h < y + h - 0.5) continue;
    if (c.h > h + 24 || c.w > Math.max(w + 24, w * 1.4, KB_TEXT.has(node.role) ? w * 4 : 0)) continue;
    if (!best || c.w * c.h < best.w * best.h) best = c;
  }
  return best ? [best.x, best.y, best.w, best.h, best.r || 6] : [x, y, w, h, 6];
}

function kbRingUpdate() {
  const node = kbNode(kbFocusId());
  const a = document.activeElement;
  const show = !!node && !kbLeaving && !!a && stage.contains(a) &&
    !KB_NO_RING.has(node.role) && !kbInPopup(node) && (kbKeyboardMode || KB_TEXT.has(node.role)) &&
    !!node.b && node.b[2] > 0 && node.b[3] > 0;
  if (!show) {
    if (kbRing.style.display !== "none") kbRing.style.display = "none";
    return;
  }
  const [x, y, w, h, r] = kbRingBox(node);
  Object.assign(kbRing.style, {
    display: "block",
    borderRadius: r + "px",
    left: x + "px",
    top: y + "px",
    width: w + "px",
    height: h + "px",
  });
}

// --- after every paint --------------------------------------------------------
/**
 * The tab order and what a combobox is pointing at, onto the mirror the paint
 * just updated.
 *
 * `aria-activedescendant` is the combobox pattern's whole trick — the DOM
 * focus stays in the box while the arrows walk the list — and the tree has no
 * field for it. It does not need one: a demo whose combobox keeps a highlight
 * says which option it is on through `activeDescendant(tid)`.
 */
function kbApplyStops(tree) {
  const stops = kbLeaving ? [] : kbStops(tree, kbFocusId());
  const ids = new Set(stops.map((s) => s.id));
  for (const el of mirror.root.querySelectorAll("[data-a11y-id]")) {
    const want = ids.has(el.dataset.a11yId) ? 0 : -1;
    if (el.tabIndex !== want) el.tabIndex = want;
  }
}

function kbAfterPaint(tree) {
  kbApplyStops(tree);
  const domId = (id) => "evg-" + String(id).replace(/[^A-Za-z0-9_-]/g, "_");
  // Id references the tree has no field for (an accordion's aria-controls and
  // aria-labelledby): a demo lists them as [from, attribute, to] and they are
  // set on the mirror here. A target that is not mirrored (a closed panel) is
  // still named by its DOM id, as Radix names an unmounted panel.
  const rel = instance();
  if (rel && typeof rel.relationsJson === "function") {
    for (const [from, attr, to] of JSON.parse(rel.relationsJson())) {
      const el = mirror.elementOf(from);
      if (!el) continue;
      if (!el.id) el.id = domId(from);
      const target = mirror.elementOf(to);
      if (target && !target.id) target.id = domId(to);
      const want = target ? target.id : domId(to);
      if (el.getAttribute(attr) !== want) el.setAttribute(attr, want);
    }
  }
  // Plain attributes the tree has no field for (a multiple select's
  // aria-multiselectable): [id, attribute, value].
  if (rel && typeof rel.attrsJson === "function") {
    for (const [on, attr, val] of JSON.parse(rel.attrsJson())) {
      const el = mirror.elementOf(on);
      if (el && el.getAttribute(attr) !== val) el.setAttribute(attr, val);
    }
  }
  for (const n of tree.nodes) {
    if (n.role !== "combobox") continue;
    const el = mirror.elementOf(n.id);
    if (!el) continue;
    let list = null;
    let opt = null;
    // aria-autocomplete, for a demo that says ("list", or "both" with inline
    // completion). The tree has no field for it either.
    const acInst = instance();
    const ac = acInst && typeof acInst.ariaAutocomplete === "function" ? acInst.ariaAutocomplete(n.id) : "";
    if (ac && el.getAttribute("aria-autocomplete") !== ac) el.setAttribute("aria-autocomplete", ac);
    if (n.expanded === 2) {
      const at = tree.nodes.indexOf(n);
      const lists = tree.nodes.filter((x) => x.role === "listbox");
      list = lists.find((x) => tree.nodes.indexOf(x) > at) || lists[0] || null;
      // The demo says where its highlight is. One that moves the real focus
      // onto the options instead (the profile's select, as Radix's does)
      // says nothing, and needs nothing.
      const inst = instance();
      const named = inst && typeof inst.activeDescendant === "function" ? inst.activeDescendant(n.id) : "";
      if (named) opt = tree.byId.get(named) || null;
    }
    const listEl = list && mirror.elementOf(list.id);
    const optEl = opt && mirror.elementOf(opt.id);
    if (listEl && !listEl.id) listEl.id = domId(list.id);
    if (optEl && !optEl.id) optEl.id = domId(opt.id);
    const ctl = listEl ? listEl.id : null;
    const act = optEl ? optEl.id : null;
    if (ctl) el.setAttribute("aria-controls", ctl); else el.removeAttribute("aria-controls");
    if (act) el.setAttribute("aria-activedescendant", act); else el.removeAttribute("aria-activedescendant");
  }
  kbRingUpdate();
  kbKeepInView();
}

/**
 * A control the keyboard moved to is a control on the screen. The dashboard
 * scrolls its own main region, so a Tab to a row below the fold scrolled
 * nothing and the focus went somewhere nobody could see. Only when the focus
 * CHANGES — a wheel that scrolls away from the focused control is left alone.
 */
let kbInViewFor = "";
function kbKeepInView() {
  const id = kbFocusId();
  if (id === kbInViewFor) return;
  kbInViewFor = id;
  const d = demo();
  const node = kbNode(id);
  if (!d.scroll || !node || !node.b || !kbInside() || !kbKeyboardMode) return;
  const H = typeof d.height === "function" ? d.height() : d.height;
  const y = node.b[1];
  const h = node.b[3];
  const m = 24;
  let dy = 0;
  if (y < m) dy = y - m;
  else if (y + h > H - m) dy = y + h - (H - m);
  if (dy) requestAnimationFrame(() => { if (d.scroll(dy)) paint(); });
}

document.addEventListener("focusin", (ev) => {
  kbHome = stage.contains(ev.target);
  // The Tab that left has landed: the demo is back in the tab order at once,
  // so a Shift+Tab straight after comes back in (the rest of leaving — the
  // demo's own blur — waits for the timer in `kbLeave`).
  if (kbLeaving && !kbHome) {
    kbLeaving = false;
    if (lastTree) kbApplyStops(lastTree);
  }
  kbRingUpdate();
}, true);
window.addEventListener("keydown", (ev) => {
  if (ev.key !== "Shift" && ev.key !== "Control" && ev.key !== "Alt" && ev.key !== "Meta") kbKeyboardMode = true;
}, true);
window.addEventListener("pointerdown", () => {
  kbKeyboardMode = false;
}, true);

// For checks driving the page: the stops the next Tab walks.
window.__kbStops = () => kbStops(lastTree, kbFocusId()).map((s) => s.id);
window.__kbFocus = () => kbFocusId();
// ============================================================ end KEYBOARD ===


mirror = createA11yMirror(stage, {
  canvas,
  label: "Ranger tree literal demos",
  // Focus that arrived on its own is the demo's to record — see `adoptFocus`
  // (and `kbAdopt`, which also hands a text field its editing session).
  onFocus: kbAdopt,
  // While a text field owns the keyboard, the element holding it is the
  // bridge's transparent <input> and not the mirror's node for the same field.
  // The mirror follows the app's focus by calling `.focus()`, so without this
  // the two would take the field off each other every paint and every second
  // keystroke would land in the one nobody is reading.
  // And only while the keyboard is in the demo at all: a repaint must not
  // pull the focus back off the sidebar control a Tab just left it on.
  canMoveFocus: () => !textInput.isActive() && kbInside(),
  // A reader pressed something: press the app in the middle of the rectangle
  // the reader was given. Not a table from node ids to commands — there is
  // nothing to keep in step, and the rectangle is the one that was drawn.
  onActivate: (node) => pressAtCentre(node, press),
});

// --- the motion showcase's clock ---------------------------------------------
//
// Two loops, and they are different things.
//
// `animate` is the frame loop: while anything is in flight it advances the
// engine by the REAL elapsed time and repaints, and it stops the moment
// nothing is moving. Handing it the real dt rather than a fixed step is what
// makes a dropped frame shorten the animation instead of stretching it.
//
// `flip` is the demonstration itself: the self-running panels travel between
// two ends, so something has to turn the page over. It is a theme change and
// nothing else — no element gains or loses a class.
let animating = 0;
let flipTimer = 0;

/** Whatever the selected demo keeps a clock for. */
function clockOf() {
  const d = demo();
  if (d.host) return d.host();
  return { tick: (dt) => motion.tick(dt), busy: () => motion.busyNow() };
}

/**
 * The frame budget.
 *
 * A demo whose clock never stops — the effects page, where a starfield
 * drifts forever — asks for a frame every vsync. On a GPU that is nothing; on
 * software GL (a headless browser, a VM, an old laptop) one frame of those
 * shaders takes seconds, and a page that asks for the next one as soon as
 * the last lands starves everything else on the main thread: timers fire
 * fifteen seconds late, input queues, a screenshot never arrives.
 *
 * So the loop measures what each frame cost (vsync to vsync). Three frames over budget and a
 * `continuous` demo is drawn at half resolution; three more and its ambient
 * motion is paused on the frame it reached, with a note saying so. Input
 * still animates — a press starts the loop for `INPUT_GRACE_MS` so a ripple
 * travels — and then the page is still again. `prefers-reduced-motion`
 * starts there: one static frame, and motion only in answer to input.
 */
const FRAME_BUDGET_MS = 60;
const INPUT_GRACE_MS = 1500;
const reducedMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const budget = { quality: 1, slow: 0, paused: reducedMotion, until: 0 };
window.__frameBudget = budget;

function noteBudget(cost) {
  if (budget.paused) return;
  budget.slow = cost > FRAME_BUDGET_MS ? budget.slow + 1 : Math.max(0, budget.slow - 1);
  if (budget.slow < 3) return;
  budget.slow = 0;
  if (budget.quality > 0.5) {
    budget.quality = 0.5;
  } else {
    budget.paused = true;
    // The still frame is shown at full resolution: half resolution was a
    // price for motion, and there is no motion now.
    budget.quality = 1;
    showBudgetNote();
    requestAnimationFrame(() => paint());
  }
}

function showBudgetNote() {
  const el = document.getElementById("budgetnote");
  if (!el) return;
  el.hidden = !(budget.paused && demo() && demo().continuous);
  el.textContent = reducedMotion
    ? "Reduced motion: the background is still. Press a card to see its effect."
    : "Paused: this device draws the effects too slowly to animate them. Press a card to see its effect.";
}

function animate(fromInput = true) {
  const d = demo();
  if (d && d.continuous && budget.paused) {
    // Paused ambient motion: only an input runs the clock, and only briefly.
    if (!fromInput) return;
    budget.until = performance.now() + INPUT_GRACE_MS;
  }
  if (animating) return;
  let last = performance.now();
  const step = () => {
    const now = performance.now();
    const dt = now - last;
    last = now;
    // The clock of the demo showing NOW, asked every frame. Captured once,
    // a loop started on the effects page (whose clock never stops) went on
    // ticking the sky after the page had moved to the dashboard, and the
    // dashboard's own clock — its ripple — was never advanced at all.
    const clock = clockOf();
    clock.tick(dt);
    paint();
    const dd = demo();
    const continuous = !!(dd && dd.continuous);
    // The interval between frames, not the time in `paint`: the GL work is
    // queued there and paid when the frame is composited, so a paint that
    // returns in 5ms can still be a frame that took two seconds.
    if (continuous) noteBudget(Math.max(dt, performance.now() - now));
    let more = clock.busy();
    if (continuous && budget.paused && now > budget.until) more = false;
    animating = more ? requestAnimationFrame(step) : 0;
  };
  animating = requestAnimationFrame(step);
}

// How many times the page turns the theme over before it stops and waits for
// Replay: there, back, and there again, so the rows end at rest where they
// arrived. Not forever: every frame of this page is a 1180x1640 repaint, and a
// loop that never ends is a page that never goes idle — measured headless on
// software GL, about one frame a second. Replay is how to see it again.
const FLIPS = 3;
let flipsLeft = 0;

function startFlipping(n = FLIPS) {
  stopFlipping();
  flipsLeft = n;
  if (flipsLeft <= 0) return;
  // Long enough for the slowest row (900ms plus the 360ms delay) to arrive and
  // be looked at before it leaves again.
  flipTimer = setInterval(() => {
    flipsLeft -= 1;
    motion.setFlipped(!motion.isFlipped());
    paint();
    animate();
    if (flipsLeft <= 0) {
      clearInterval(flipTimer);
      flipTimer = 0;
    }
  }, 1700);
}

/**
 * Every journey back to its start, and off again.
 *
 * `motion.replay()` swaps in an unstyled tree, so this paint lands every dot
 * where the unflipped sheet puts it without travelling; the flip on the NEXT
 * frame is then a change the transitions see, and they all leave together.
 * The 1.7 s cycle restarts from now, so the first return is a full cycle away
 * rather than whatever was left of the old one, and it runs the same three
 * flips a first visit does. Pressing it again mid-journey starts over.
 */
function replayMotion() {
  if (state.which !== "motion") return false;
  motion.replay();
  paint();
  // The first flip is the one on the next frame; the timer does the rest.
  startFlipping(FLIPS - 1);
  requestAnimationFrame(() => {
    if (state.which !== "motion") return;
    motion.setFlipped(true);
    paint();
    animate();
  });
  return true;
}
const motionReplayBtn = document.getElementById("motionreplay");
if (motionReplayBtn) motionReplayBtn.addEventListener("click", () => replayMotion());

function stopFlipping() {
  if (flipTimer) clearInterval(flipTimer);
  flipTimer = 0;
  if (animating) cancelAnimationFrame(animating);
  animating = 0;
}

function syncMotionClock() {
  if (state.which === "motion") startFlipping();
  else stopFlipping();
}

/**
 * Start the clock for a demo that moves on its own.
 *
 * Every path that started the loop before this was an INPUT — a press, a key,
 * a focus — because every demo that moved did so in answer to one. A surface
 * effect does not: a starfield drifts and a glint crosses a pane on their own
 * clock, and a page that waits to be touched shows a still picture of them.
 *
 * Safe to call for any demo: `animate` stops on the first frame whose clock
 * says nothing is moving, which is all of them until something is.
 */
function startClock() {
  const d = DEMOS[state.which];
  showBudgetNote();
  if (d && d.animated) animate(false);
}

// --- the live stylesheet ----------------------------------------------------
//
// THE EFFECTS DEMO CAN BE EDITED IN THE PAGE, and what is typed goes through
// the whole engine: `EffectsDemo.init` hands the text to `EVGStyleSheet`, the
// cascade applies it, the layout lays the tree out again, the display list
// carries whatever effect instances the sheet declared, and the painter looks
// their names up. Nothing here patches a parameter — change
// `evg-fx-density` and the number reaching the shader came out of the
// stylesheet the same way it does on a page nobody is editing.
//
// That is also why this is on THIS page and not on the standalone
// `lib/evg/gl/fx-demo.html`: the bundle here carries the compiled engine, and
// that page carries only a display list somebody built for it.
const fxCss = document.getElementById("fxcss");
if (fxCss) {
  const fxErr = document.getElementById("fxcsserr");
  fxCss.value = cssFor("effects", EFFECTS_CSS);

  const applyFxCss = () => {
    let next;
    try {
      next = new EffectsDemo();
      next.init(fxCss.value);
    } catch (e) {
      // A sheet the parser cannot get through at all: keep the page that is
      // drawing and say why, rather than leaving a blank canvas behind.
      fxErr.className = "";
      fxErr.textContent = "the stylesheet could not be read: " + (e && e.message ? e.message : e);
      return;
    }
    // WHAT THE ENGINE REJECTED, in its own words. `EVGStyleSheet` keeps every
    // declaration and selector it refused — an unsupported selector, a value
    // it could not parse — so a typo here is reported by the cascade rather
    // than guessed at by this page.
    const n = next.styleErrorCount();
    const said = [];
    for (let i = 0; i < Math.min(n, 4); i += 1) said.push(next.styleErrorAt(i));
    if (n > 4) said.push(`…and ${n - 4} more`);
    fxErr.className = n > 0 ? "" : "ok";
    fxErr.textContent = n > 0 ? said.join("  ·  ") : "the cascade accepted every declaration";
    effects = next;
    // The rail is a view of the LIST, and the list just changed: a sheet that
    // now says `raindrop` gets a switch that says raindrop.
    syncFxSwitches();
    paint();
    startClock();
  };

  // --- the background picker ------------------------------------------------
  //
  // ELEVEN PRESETS, AND WHAT THE PICKER DOES IS TYPE. Choosing one rewrites
  // the `.fx-sky` block in the textarea above — the box's own declarations
  // kept, the effect's replaced with the preset's — and then hands the sheet
  // to the same `applyFxCss` a keystroke would. So it has no privileged path
  // into the painter: it writes CSS, the cascade reads it, and what it wrote
  // is left in the editor to be read and changed.
  //
  // The presets are the FILE, `lib/evg/gl/effect-presets.css`, carried into
  // the bundle and parsed here — the same eleven blocks the contact sheet
  // paints and the pixel gate checks.
  const fxPresets = document.getElementById("fxpresets");
  if (fxPresets) {
    const presets = parsePresets(EFFECT_PRESETS_CSS);
    const BLOCK = (cls) => new RegExp("(\\." + cls + "\\s*\\{)([^}]*)(\\})");
    // WHICH ELEMENT A PRESET LANDS ON IS ITS LAYER'S BUSINESS, and the layer
    // is the painter's answer, not a list kept here. A SOURCE effect draws the
    // element's own background, so it belongs on the sky. A BACKDROP effect
    // draws what is BEHIND the element — put one on the opaque sky and the
    // sky's own background paints over it a moment later — so it belongs on
    // the pane, where the stars are behind it and the rain is rain on glass.
    const layerOf = (kind) => {
      const fx = surfaceEffect(kind);
      return fx && fx.layer ? fx.layer : "source";
    };
    // What belongs to the BOX rather than to the effect, and so survives every
    // swap: where a box is and how big it is are the demo's layout, not the
    // preset's business. A backdrop target keeps its translucent fill as well,
    // which is why the preset's own `background-color` is dropped there — an
    // opaque pane would hide the very thing it is meant to bend.
    const KEEP = ["width", "height", "position", "left", "top", "display", "flex",
      "border-radius", "backdrop-filter"];
    const decls = (body) => body.split(";").map((d) => d.trim()).filter(Boolean);
    const sel = document.createElement("select");
    sel.id = "fxpreset";
    sel.setAttribute("aria-label", "the background effect");
    sel.append(new Option("effects.css — as written", ""));
    let group = null;
    for (const p of presets) {
      if (!group || group.label !== p.kind) {
        group = document.createElement("optgroup");
        group.label = p.kind;
        sel.append(group);
      }
      group.append(new Option(`${p.title} (.${p.name})`, p.name));
    }
    sel.addEventListener("change", () => {
      const p = presets.find((x) => x.name === sel.value);
      if (!p) {
        fxCss.value = EFFECTS_CSS;
        applyFxCss();
        return;
      }
      const backdrop = layerOf(p.kind) === "backdrop";
      const at = BLOCK(backdrop ? "fx-glass" : "fx-sky");
      const m = fxCss.value.match(at);
      if (!m) return;
      const keep = backdrop ? KEEP.concat(["background-color"]) : KEEP;
      const kept = decls(m[2]).filter((d) => keep.some((k) => d.startsWith(k + ":") || d.startsWith(k + " :")));
      const taken = decls(p.body).filter((d) => !backdrop || !d.startsWith("background-color"));
      const body = kept.concat(taken).map((d) => "  " + d + ";").join("\n");
      fxCss.value = fxCss.value.replace(at, "$1\n" + body + "\n$3");
      applyFxCss();
    });
    fxPresets.replaceChildren(sel);
  }

  // Debounced, because a keystroke is not a reason to lay a page out — and
  // 250ms is short enough that dragging a number still feels live.
  let fxPending = 0;
  fxCss.addEventListener("input", () => {
    clearTimeout(fxPending);
    fxPending = setTimeout(applyFxCss, 250);
  });
  document.getElementById("fxcssreset").addEventListener("click", () => {
    fxCss.value = EFFECTS_CSS;
    const sel = document.getElementById("fxpreset");
    if (sel) sel.value = "";
    applyFxCss();
  });
}

// --- the Styles panel -----------------------------------------------------------
//
// Every demo's stylesheet, by the name the switcher uses. The panel edits the
// text and hands it back through `apply`, which replaces the demo's sheet IN
// PLACE (`EVGStyleSheet.reload`) so what the demo is doing — an open popup, a
// chosen value, a flight in the air — survives the edit. Only an edit that
// takes a declaration away rebuilds the demo, where it can be rebuilt: the
// cascade writes what the rules say and never un-writes what they stopped
// saying, so a reload alone would leave the removed value on the elements.
const DEFAULT_CSS = {
  menubar: MENUBAR_CSS, toolbar: TOOLBAR_CSS, sortable: SORTABLE_CSS, motion: MOTION_CSS,
  table: TABLE_CSS, dropdown: DROPDOWN_CSS, dialog: DIALOG_CSS, tree: TREE_CSS,
  timeline: TIMELINE_CSS, resizable: RESIZE_CSS, form: FORM_CSS, profile: PROFILE_CSS,
  dashboard: DASHBOARD_CSS, calendar: CALENDAR_CSS, filters: FILTERS_CSS, eventcal: EVENTCAL_CSS,
  message: MESSAGE_CSS, controls: CONTROLS_CSS, otp: OTP_CSS, metadata: METADATA_CSS,
  effects: EFFECTS_CSS, accordion: ACCORDION_CSS, separator: SEPARATOR_CSS, tabs: TABS_CSS,
  popover: POPOVER_CSS, autocomplete: AUTOCOMPLETE_CSS, pagination: PAGINATION_CSS,
  radio: RADIO_CSS, rating: RATING_CSS, kanban: KANBAN_CSS, drawer: DRAWER_CSS,
  combobox: COMBOBOX_CSS, colorpicker: COLORPICKER_CSS,
};
DEFAULT_CSS.questionnaire = QUESTIONNAIRE_CSS;
DEFAULT_CSS.select = SELECT_CSS;
DEFAULT_CSS.window = WINDOW_CSS;
// The file each one ships as, for the download's name.
const CSS_FILE = { tree: "tree.css", resizable: "resize.css" };
// The text each demo is running now, so the panel can tell an edit that only
// changes values from one that removes something.
const runningCss = {};
for (const n of Object.keys(DEFAULT_CSS)) runningCss[n] = cssFor(n, DEFAULT_CSS[n]);

stylesPanel = createStylesPanel({
  facts: EVG_CSS_FACTS,
  engine: ComboboxDemoModule,
  names: () => DEMO_NAMES.filter((n) => n in DEFAULT_CSS),
  current: () => state.which,
  title: (name) => demoMeta(name).title,
  defaultCss: (name) => DEFAULT_CSS[name],
  runningCss: (name) => runningCss[name],
  fileName: (name) => CSS_FILE[name] || name + ".css",
  root: (name) => {
    if (HOSTS[name]) return HOSTS[name].root();
    const owner = INSTANCE[name];
    const inst = owner ? owner() : null;
    return inst && inst.root ? inst.root : null;
  },
  // `fresh` asks for a rebuilt demo. It is honoured where the page can rebuild
  // one (`recreateDemo`); elsewhere the sheet is reloaded and the answer says
  // so, and the panel tells the reader a page reload shows the removal.
  apply(name, css, fresh) {
    let how = "";
    if (fresh && recreateDemo(name, css)) how = "rebuilt";
    else if (HOSTS[name]) { HOSTS[name].reload(css); how = "reloaded"; }
    else {
      const owner = INSTANCE[name];
      const inst = owner ? owner() : null;
      if (inst && inst.sheet && typeof inst.sheet.reload === "function") {
        inst.sheet.reload(css);
        how = "reloaded";
      } else if (recreateDemo(name, css)) how = "rebuilt";
    }
    if (!how) return "";
    runningCss[name] = css;
    // A rebuilt demo has new fields: the text session must not keep editing
    // the old one's.
    if (how === "rebuilt" && name === state.which) {
      held = false;
      textInput.blurField();
    }
    if (name === "effects") {
      if (fxCss) fxCss.value = css;
      syncFxSwitches();
    }
    if (name === state.which) {
      paint();
      startClock();
    }
    return how;
  },
});
window.__styles = stylesPanel.api;

syncPanels();
syncMotionClock();
paint();
// ...and the same on the first frame, for a demo the page opened on — a
// `?demo=effects` link that had to be clicked once before the sky moved would
// be a demo whose whole point is invisible until you poke it.
startClock();

// The stage is laid out against the viewport, so the viewport changing is a
// reason to lay it out again — a phone rotating, a window dragged narrower, or
// the rail folding away under the 860px breakpoint. Debounced with a frame,
// because a drag fires this continuously and a repaint is a whole display list.
let resizePass = 0;
const relayout = () => {
  if (resizePass) return;
  resizePass = requestAnimationFrame(() => {
    resizePass = 0;
    paint();
  });
};
window.addEventListener("resize", relayout);
window.addEventListener("orientationchange", relayout);
// Opening the controls band on a phone changes how much room the stage has.
document.getElementById("picker").addEventListener("toggle", relayout);
