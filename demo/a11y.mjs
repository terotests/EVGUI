/**
 * The accessibility audit for the demo page.
 *
 *   node gallery/evgui/demo/a11y.mjs
 *
 * Three checks, and none of them is enough on its own:
 *
 *   EVGA11yTree.lint()   no browser: a focusable row with no accessible name,
 *                        a duplicate id, a parent that is not in the tree.
 *   axe-core             the industry rule set over what a screen reader
 *                        actually walks — the DOM `evg-a11y.js` mirrors the
 *                        tree into. Auditing the canvas would be auditing one
 *                        empty graphic, which is the whole problem this is
 *                        here to solve.
 *   the keyboard         the real page (bundle.js), every demo: Tab from the
 *                        page reaches a control in the demo and, after the
 *                        last one, leaves it again; Shift+Tab comes back in.
 *
 * The trees are computed in Node, straight out of the compiled demos, and the
 * page below only mirrors them. So this audits the same JSON the live page
 * publishes, in the states worth auditing: a menu open, a menu with checkable
 * rows open, and the toolbar.
 *
 * Colour contrast is excluded here for the reason a11y.mjs excludes it: the
 * mirror's ink is transparent by design, so axe would be measuring the wrong
 * surface. `npm run ui:a11y` measures contrast where the colour actually is,
 * in the display list.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { requireDom, findChromium } from "../../ui/conformance/dom-adapter.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");
const require = createRequire(import.meta.url);
const domRequire = createRequire(path.join(ROOT, "gallery/ui/conformance/dom/package.json"));

const { MenubarDemo } = require(path.join(ROOT, "gallery/evgui/bin/MenubarDemo.cjs"));
const { ToolbarDemo } = require(path.join(ROOT, "gallery/evgui/bin/ToolbarDemo.cjs"));
const { SortableDemo } = require(path.join(ROOT, "gallery/evgui/bin/SortableDemo.cjs"));
const { MotionDemo } = require(path.join(ROOT, "gallery/evgui/bin/MotionDemo.cjs"));
const { TableDemo } = require(path.join(ROOT, "gallery/evgui/bin/TableDemo.cjs"));
const { DropdownDemo } = require(path.join(ROOT, "gallery/evgui/bin/DropdownDemo.cjs"));
const { DialogDemo } = require(path.join(ROOT, "gallery/evgui/bin/DialogDemo.cjs"));
const { TreeDemo } = require(path.join(ROOT, "gallery/evgui/bin/TreeDemo.cjs"));
const { TimelineDemo } = require(path.join(ROOT, "gallery/evgui/bin/TimelineDemo.cjs"));
const { ResizeDemo } = require(path.join(ROOT, "gallery/evgui/bin/ResizeDemo.cjs"));
const { FormDemo } = require(path.join(ROOT, "gallery/evgui/bin/FormDemo.cjs"));
const { DashboardDemo } = require(path.join(ROOT, "gallery/evgui/bin/DashboardDemo.cjs"));
const { CalendarDemo } = require(path.join(ROOT, "gallery/evgui/bin/CalendarDemo.cjs"));
const { ProfileDemo } = require(path.join(ROOT, "gallery/evgui/bin/ProfileDemo.cjs"));
const { EffectsDemo } = require(path.join(ROOT, "gallery/evgui/bin/EffectsDemo.cjs"));
const { MetadataDemo } = require(path.join(ROOT, "gallery/evgui/bin/MetadataDemo.cjs"));
const { OtpDemo } = require(path.join(ROOT, "gallery/evgui/bin/OtpDemo.cjs"));
const { FilterDemo } = require(path.join(ROOT, "gallery/evgui/bin/FilterDemo.cjs"));
const { EventCalDemo } = require(path.join(ROOT, "gallery/evgui/bin/EventCalDemo.cjs"));
const { MessageDemo } = require(path.join(ROOT, "gallery/evgui/bin/MessageDemo.cjs"));
const { ControlsDemo } = require(path.join(ROOT, "gallery/evgui/bin/ControlsDemo.cjs"));
const { AccordionDemo } = require(path.join(ROOT, "gallery/evgui/bin/AccordionDemo.cjs"));
const { SeparatorDemo } = require(path.join(ROOT, "gallery/evgui/bin/SeparatorDemo.cjs"));
const { TabsDemo } = require(path.join(ROOT, "gallery/evgui/bin/TabsDemo.cjs"));
const { AutocompleteDemo } = require(path.join(ROOT, "gallery/evgui/bin/AutocompleteDemo.cjs"));
const { PaginationDemo } = require(path.join(ROOT, "gallery/evgui/bin/PaginationDemo.cjs"));
const { RadioGroupDemo } = require(path.join(ROOT, "gallery/evgui/bin/RadioGroupDemo.cjs"));
const MENUBAR_CSS = fs.readFileSync(path.join(HERE, "menubar.css"), "utf8");
const TOOLBAR_CSS = fs.readFileSync(path.join(HERE, "toolbar.css"), "utf8");
const SORTABLE_CSS = fs.readFileSync(path.join(HERE, "sortable.css"), "utf8");
const MOTION_CSS = fs.readFileSync(path.join(HERE, "motion.css"), "utf8");
const TABLE_CSS = fs.readFileSync(path.join(HERE, "table.css"), "utf8");
const DROPDOWN_CSS = fs.readFileSync(path.join(HERE, "dropdown.css"), "utf8");
const DIALOG_CSS = fs.readFileSync(path.join(HERE, "dialog.css"), "utf8");
const TREE_CSS = fs.readFileSync(path.join(HERE, "tree.css"), "utf8");
const TIMELINE_CSS = fs.readFileSync(path.join(HERE, "timeline.css"), "utf8");
const RESIZE_CSS = fs.readFileSync(path.join(HERE, "resize.css"), "utf8");
const FORM_CSS = fs.readFileSync(path.join(HERE, "form.css"), "utf8");
const CALENDAR_CSS = fs.readFileSync(path.join(HERE, "calendar.css"), "utf8");
const DASHBOARD_CSS = fs.readFileSync(path.join(HERE, "dashboard.css"), "utf8");

// The eight demos this audit used to skip, each at rest. Built the way the
// page builds them — `new`, then `init` with the demo's own stylesheet — and
// audited by the same two instruments as the rest.
const atRest = (Cls, file) => {
  const d = new Cls();
  d.init(fs.readFileSync(path.join(HERE, file), "utf8"));
  if (typeof d.displayListJson === "function") d.displayListJson();
  return d;
};
const profile = atRest(ProfileDemo, "profile.css");
const effects = atRest(EffectsDemo, "effects.css");
const metadata = atRest(MetadataDemo, "metadata.css");
const otp = atRest(OtpDemo, "otp.css");
const filters = atRest(FilterDemo, "filters.css");
const eventcal = atRest(EventCalDemo, "eventcal.css");
// ReUI's patterns in their other states: the Settings popover open on its
// Behavior tab; the week with an event focused, tooltips on and one showing;
// the resource view with a select list open; and Arabic, right to left.
const eventcalSettings = atRest(EventCalDemo, "eventcal.css");
for (const id of ["ea-set-trigger", "ea-set-tabs-tab-behavior"]) eventcalSettings.press(id);
eventcalSettings.displayListJson();
const eventcalWeek = atRest(EventCalDemo, "eventcal.css");
for (const id of ["ea-view-trigger", "ea-view-item-week", "ea-set-trigger", "ea-set-tabs-tab-behavior", "ea-set-sw-tips", "ea-title", "ea-ev-e2"]) eventcalWeek.press(id);
eventcalWeek.setHover("ea-ev-e4");
eventcalWeek.displayListJson();
const eventcalResource = atRest(EventCalDemo, "eventcal.css");
for (const id of ["ea-view-trigger", "ea-view-item-resource", "ea-set-trigger", "ea-set-tabs-tab-grid", "ea-set-sn-trigger"]) eventcalResource.press(id);
eventcalResource.displayListJson();
const eventcalAr = atRest(EventCalDemo, "eventcal.css");
for (const id of ["ea-set-trigger", "ea-set-tabs-tab-region", "ea-set-lang-trigger", "ea-set-lang-item-ar", "ea-title"]) eventcalAr.press(id);
eventcalAr.displayListJson();
const message = atRest(MessageDemo, "message.css");
const controls = atRest(ControlsDemo, "controls.css");
const accordion = atRest(AccordionDemo, "accordion.css");
// The same accordion with every item of every list pressed once: the single
// lists end on their last item, the multiple list with all three open.
const accordionOpen = atRest(AccordionDemo, "accordion.css");
for (const id of ["acb-integrations-trigger", "acs-item-3-trigger", "acm-shipping-trigger", "acm-returns-trigger"]) accordionOpen.press(id);
const separator = atRest(SeparatorDemo, "separator.css");
const tabs = atRest(TabsDemo, "tabs.css");
// And on its other tab, with a save announced: the second panel, the masked
// fields and a status region with something in it.
const tabsPw = atRest(TabsDemo, "tabs.css");
tabsPw.press("tb-tab-password");
tabsPw.press("tb-save-password");
const pagination = atRest(PaginationDemo, "pagination.css");
// Moved and opened: pages in the middle (an ellipsis each side), a go-to box
// left invalid, and the rows-per-page list open on the overlay layer.
const paginationBusy = atRest(PaginationDemo, "pagination.css");
paginationBusy.press("pg4-page-10");
paginationBusy.press("pg4-prev");
paginationBusy.press("pg4-prev");
paginationBusy.press("pg4-prev");
paginationBusy.press("pg3-goto");
paginationBusy.applyEdit("pg3-goto", "", 0, 0);
paginationBusy.keyWith("Enter", false, false);
paginationBusy.press("pg8-rows-trigger");
const radio = atRest(RadioGroupDemo, "radio.css");
// Changed and focused: other radios checked by click and by arrow, the focus
// (and its ring) on a card in the grid, a row hovered.
const radioBusy = atRest(RadioGroupDemo, "radio.css");
radioBusy.press("rg1-chat");
radioBusy.press("rg9-mastercard");
radioBusy.setFocus("rg6-medium");
radioBusy.key("ArrowDown");
radioBusy.press("rg3-reports");
radioBusy.setHover("rg2-french");
radioBusy.displayListJson();
const sizeOf = (d) => [typeof d.widthPx === "function" ? d.widthPx() : 900, d.heightPx()];
const REST = [
  ["profile — a label-left form", profile, 40],
  ["effects — surface effects over a sky", effects, 41],
  ["metadata — two comboboxes, a date field and a pill pair", metadata, 42],
  ["otp — two one-time-code fields", otp, 43],
  ["filters — a filter bar and its results", filters, 44],
  ["eventcal — month, board and measured week at rest", eventcal, 45],
  ["eventcal — Settings open on Behavior", eventcalSettings, 91],
  ["eventcal — week, an event focused, a tooltip showing", eventcalWeek, 92],
  ["eventcal — resource view, the drag-snap list open", eventcalResource, 93],
  ["eventcal — Arabic, right to left", eventcalAr, 94],
  ["message — a chat transcript", message, 46],
  ["controls — stepper, sliders and a number field", controls, 47],
  ["accordion — three lists, first items open", accordion, 48],
  ["accordion — other items open, multiple list all open", accordionOpen, 49],
  ["separator — six rules, some semantic and some decorative", separator, 50],
  ["tabs — Account panel", tabs, 51],
  ["tabs — Password panel, saved", tabsPw, 52],
  ["pagination — ten cards at rest", pagination, 53],
  ["pagination — mid pages, an invalid box, a list open", paginationBusy, 54],
  ["radio — ten groups at rest", radio, 57],
  ["radio — other radios checked, one focused, one hovered", radioBusy, 58],
].map(([name, d, gen]) => ({
  name,
  size: sizeOf(d),
  lint: () => d.a11yProblems(),
  tree: () => d.a11yJson(gen, d.focused || ""),
}));

// The showcase keeps its tree, so unlike the other three it is an instance and
// the audit holds one — the same one for both states below, which is also a
// small check that a hover leaves the accessible tree alone.
const motion = new MotionDemo();
motion.init(MOTION_CSS);
const ORDER = ["demo", "spec", "video", "audio", "extra"];

// The table keeps its tree for the same reason, and the audit drives it the
// way a person would — by pressing the ids the hit test reports. A state
// reached by calling the controller directly is a state the page might not be
// able to get to.
const table = new TableDemo();
table.init(TABLE_CSS);

// The dropdown, driven the way the page drives it — through MenuCtl. The
// submenu state below is reached by hovering and letting the controller's own
// clock run, not by reaching in and setting a flag: a state the page cannot
// get to is a state not worth auditing.
const dropdown = new DropdownDemo();
dropdown.init(DROPDOWN_CSS);

// The dialog patterns: three DialogCtl dialogs and an AlertDialogCtl one,
// audited open one at a time below.
const dialog = new DialogDemo();
dialog.init(DIALOG_CSS);

// The tree. Rows that are SIBLINGS with their nesting in `aria-level` is a
// shape axe has opinions about — `aria-required-children` on the tree, and
// `aria-required-parent` on every row — and it is the shape headless-tree
// renders, so the audit is what decides whether copying it is defensible.
const treeview = new TreeDemo();
treeview.init(TREE_CSS);

const timeline = new TimelineDemo();
timeline.init(TIMELINE_CSS);

const resize = new ResizeDemo();
resize.init(RESIZE_CSS);
const form = new FormDemo();
form.init(FORM_CSS);
const calendar = new CalendarDemo();
calendar.init(CALENDAR_CSS);
// With a day chosen, because that is the state where the label carries an
// affix and one cell is the tab stop — the empty grid exercises neither.
calendar.press("cal-2026-05-20");
const dashboard = new DashboardDemo();
dashboard.init(DASHBOARD_CSS);
// The chart's commands are built on demand and the tree is rebuilt with them.
dashboard.displayListJson();

const CHECKED = ["Always Show Full URLs"];

const STATES = [
  {
    name: "menubar — File open, with the Share submenu",
    size: [1240, 560],
    lint: () => MenubarDemo.a11yProblems(MENUBAR_CSS, CHECKED, "Luis", "File", true, false),
    tree: () => MenubarDemo.a11yJson(MENUBAR_CSS, CHECKED, "Luis", "File", true, false, 1, "row-New Tab"),
  },
  {
    name: "menubar — View open, checkable rows",
    size: [1240, 560],
    lint: () => MenubarDemo.a11yProblems(MENUBAR_CSS, CHECKED, "Luis", "View", false, false),
    tree: () => MenubarDemo.a11yJson(MENUBAR_CSS, CHECKED, "Luis", "View", false, false, 2, ""),
  },
  {
    name: "menubar — Profiles open, a radio set",
    size: [1240, 560],
    lint: () => MenubarDemo.a11yProblems(MENUBAR_CSS, CHECKED, "Luis", "Profiles", false, false),
    tree: () => MenubarDemo.a11yJson(MENUBAR_CSS, CHECKED, "Luis", "Profiles", false, false, 3, ""),
  },
  {
    name: "menubar — everything closed",
    size: [1240, 560],
    lint: () => MenubarDemo.a11yProblems(MENUBAR_CSS, CHECKED, "Luis", "", false, false),
    tree: () => MenubarDemo.a11yJson(MENUBAR_CSS, CHECKED, "Luis", "", false, false, 4, ""),
  },
  {
    name: "menubar — the bar at the bottom, so the menu opens upwards",
    size: [1240, 560],
    lint: () => MenubarDemo.a11yProblems(MENUBAR_CSS, CHECKED, "Luis", "File", true, true),
    tree: () => MenubarDemo.a11yJson(MENUBAR_CSS, CHECKED, "Luis", "File", true, true, 5, ""),
  },
  {
    name: "sortable — at rest",
    size: [1240, 560],
    lint: () => SortableDemo.a11yProblems(SORTABLE_CSS, ORDER, ""),
    tree: () => SortableDemo.a11yJson(SORTABLE_CSS, ORDER, "", 6, ""),
  },
  {
    name: "sortable — a row picked up",
    size: [1240, 560],
    lint: () => SortableDemo.a11yProblems(SORTABLE_CSS, ORDER, "video"),
    tree: () => SortableDemo.a11yJson(SORTABLE_CSS, ORDER, "video", 7, "sr-row-video"),
  },
  {
    name: "motion — at rest",
    size: [1180, 1580],
    lint: () => {
      motion.setHover("");
      motion.setFlipped(false);
      return motion.a11yProblems();
    },
    tree: () => motion.a11yJson(8, ""),
  },
  {
    name: "motion — a card hovered, mid-flight",
    size: [1180, 1580],
    // Mid-transition on purpose. Contrast is measured off the display list, so
    // a colour half way between two states is a colour that has to pass on its
    // own — and a palette chosen only for its two ends can fail in between.
    lint: () => {
      motion.setHover("mo-card-lift");
      motion.setFlipped(true);
      motion.displayListJson();
      motion.tick(80.0);
      return motion.a11yProblems();
    },
    tree: () => motion.a11yJson(9, ""),
  },
  {
    // Every row focusable and every one of them needing a name of its own —
    // the shape that produced three axe violations when the table was first
    // built, so it is worth auditing at rest before anything is touched.
    name: "table — at rest, page 1",
    size: [900, 460],
    lint: () => {
      table.setHover("");
      return table.a11yProblems();
    },
    tree: () => table.a11yJson(10, ""),
  },
  {
    // Sorted, one row chosen, and on the short second page. `aria-sort` on a
    // columnheader, a mixed select-all, and a DISABLED Next all appear here and
    // in none of the states above; a disabled control that keeps focus is the
    // defect this state exists to catch.
    name: "table — sorted, one row selected, last page",
    size: [900, 460],
    lint: () => {
      table.press("tbl-col-name");
      table.press("tbl-check-p1");
      table.press("tbl-next");
      return table.a11yProblems();
    },
    tree: () => table.a11yJson(11, "tbl-prev"),
  },
  {
    // The whole dashboard, and the sidebar is why it is here. axe is the third
    // instrument: the lint sees the tree the builder made and the gate sees the
    // fields it carries, but only axe knows that a landmark wants a name, that
    // `aria-current` takes a value from a fixed list, and that a link whose
    // whole content is a glyph is a link with nothing to say.
    name: "dashboard — the sidebar, the chart and a virtual table",
    size: [1336, 900],
    lint: () => {
      dashboard.displayListJson();
      return dashboard.a11yProblems();
    },
    tree: () => dashboard.a11yJson(20, "db-nav-dashboard"),
  },
  {
    name: "dropdown — closed",
    size: [900, 560],
    lint: () => dropdown.a11yProblems(),
    tree: () => dropdown.a11yJson(12, ""),
  },
  {
    // Open, with the submenu out. Three menus' worth of roles in one tree —
    // menu, menuitem, menuitemradio and a radiogroup of icon-only buttons —
    // and the icon-only ones are why this state exists: a button whose whole
    // content is a glyph has no name unless someone gives it one, and axe is
    // the thing that notices when nobody did.
    name: "dropdown — open, submenu out",
    size: [900, 560],
    lint: () => {
      dropdown.press("dd-trigger");
      dropdown.setHover("dd-item-status");
      dropdown.tick(150.0);
      return dropdown.a11yProblems();
    },
    tree: () => dropdown.a11yJson(13, "dd-item-status-item-available"),
  },
  {
    // Each dialog open in turn, reached by pressing its trigger the way the
    // page does. A modal is the state axe has most to say about: a dialog
    // needs a name, aria-modal has to hide the page behind it, and the
    // labelledby / describedby references have to resolve.
    name: "dialog — Edit profile open (two fields)",
    size: [900, 540],
    lint: () => {
      dialog.press("dlg-profile-trigger");
      return dialog.a11yProblems();
    },
    tree: () => dialog.a11yJson(14, dialog.focused),
  },
  {
    name: "dialog — Share link open, copied",
    size: [900, 540],
    lint: () => {
      dialog.keyWith("Escape", false, false);
      dialog.press("dlg-share-trigger");
      dialog.press("dlg-share-copy");
      return dialog.a11yProblems();
    },
    tree: () => dialog.a11yJson(15, dialog.focused),
  },
  {
    name: "dialog — scrollable body open",
    size: [900, 540],
    lint: () => {
      dialog.keyWith("Escape", false, false);
      dialog.press("dlg-terms-trigger");
      return dialog.a11yProblems();
    },
    tree: () => dialog.a11yJson(16, dialog.focused),
  },
  {
    // The alertdialog role, and the only one with no ×.
    name: "dialog — alert dialog open",
    size: [900, 540],
    lint: () => {
      dialog.keyWith("Escape", false, false);
      dialog.press("dlg-alert-trigger");
      return dialog.a11yProblems();
    },
    tree: () => dialog.a11yJson(17, dialog.focused),
  },
  {
    // Two separators and a breadcrumb, with the trail collapsed — which is the
    // state worth auditing: an ellipsis has to say that crumbs are missing,
    // and a splitter has to be named and have a range.
    name: "resizable — nested panels, the trail given way",
    size: [900, 520],
    lint: () => {
      const p = resize.outer.panels[0];
      const q = resize.outer.panels[1];
      q.size += p.size - 45;
      p.size = 45;
      resize.rebuild();
      return resize.a11yProblems();
    },
    tree: () => resize.a11yJson(18, "rz-sep-0"),
  },
  {
    // A form is full of the shapes axe minds and the diff cannot see: a label
    // that names a control, a message that describes it, a required marker
    // that is a glyph rather than a claim, and a group of radios. The state
    // worth auditing is the one with something WRONG in it — a field in error
    // has to say what is wrong where a reader will hear it, and a red ring is
    // not a sentence.
    // A grid widget is where axe has the most to say: a role=grid whose rows
    // and cells do not nest correctly is a tree a reader cannot steer, and
    // nothing in the controller tests would notice.
    name: "calendar — a month grid with a day chosen",
    size: [900, 520],
    lint: () => calendar.a11yProblems(),
    tree: () => calendar.a11yJson(31, "cal-2026-05-20"),
  },
  {
    name: "form — six controls, one of them in error",
    size: [620, 560],
    lint: () => form.a11yProblems(),
    tree: () => form.a11yJson(19, "fm-amount"),
  },
  {
    // The rail is a picture of the value and says nothing a reader needs, so
    // it is out of the tree entirely — which means this case is checking that
    // the LIST survived being the only thing left. A timeline whose rail was
    // announced would read as eight items where a person sees four.
    name: "timeline — a list of four events, three of them reached",
    size: [900, 520],
    lint: () => timeline.a11yProblems().concat(timeline.hostProblems()),
    tree: () => timeline.a11yJson(17, ""),
  },
  {
    name: "tree — three folders open, focus on a nested row",
    size: [900, 520],
    // The component host's own complaints ride along with the tree's. A page
    // that misuses the host — a `use` outside a pass, an unclosed `enter` —
    // renders a perfectly plausible frame and gets the lifecycle wrong, which
    // is exactly the kind of failure that has to announce itself.
    lint: () => {
      treeview.press("tv-item-jane");
      return treeview.a11yProblems().concat(treeview.hostProblems());
    },
    tree: () => treeview.a11yJson(16, "tv-item-jane"),
  },
  {
    // The same tree with a folder shut. Rows that were in the tree a moment
    // ago are GONE, not hidden — a browser drops collapsed items too, and
    // leaving them in would hand a reader rows nobody can reach.
    name: "tree — a folder collapsed",
    size: [900, 520],
    lint: () => {
      treeview.press("tv-item-accounts");
      return treeview.a11yProblems().concat(treeview.hostProblems());
    },
    tree: () => treeview.a11yJson(17, "tv-item-accounts"),
  },
  {
    name: "toolbar",
    size: [1240, 320],
    lint: () => ToolbarDemo.a11yProblems(TOOLBAR_CSS, true, false, false, "center", "Edited 2 hours ago"),
    tree: () => ToolbarDemo.a11yJson(TOOLBAR_CSS, true, false, false, "center", "Edited 2 hours ago", 1, "tb-bold"),
  },
];

STATES.push(...REST);

// The popover demo: closed, then each kind of popover open — the Dimensions
// panel (a labelled, described dialog with four textboxes), the notifications
// list and a text-only popover whose content takes the focus itself. Reached
// by pressing the triggers, as the page does. Non-modal: nothing behind an
// open popover may be hidden.
{
  const { PopoverDemo } = require(path.join(ROOT, "gallery/evgui/bin/PopoverDemo.cjs"));
  const popover = atRest(PopoverDemo, "popover.css");
  const openOn = (trigger) => () => {
    popover.keyWith("Escape", false, false);
    if (trigger) popover.press(trigger);
    return popover.a11yProblems();
  };
  for (const [name, trigger, gen] of [
    ["popover — closed", "", 60],
    ["popover — Dimensions open (four fields)", "pv-dim-trigger", 61],
    ["popover — notifications open", "pv-notif-trigger", 62],
    ["popover — text popover open on the right", "pv-right-trigger", 63],
  ]) {
    STATES.push({
      name,
      size: [900, 470],
      lint: openOn(trigger),
      tree: () => popover.a11yJson(gen, popover.focused || ""),
    });
  }
}
// The autocomplete at rest (six closed boxes, one holding "Canada"), and with
// lists open: the grouped one filtered with its highlight on a row — sections
// with role=group inside the listbox — and the limited one showing its rows
// and the hidden "N more" line.
const autocomplete = atRest(AutocompleteDemo, "autocomplete.css");
const autocompleteOpen = atRest(AutocompleteDemo, "autocomplete.css");
autocompleteOpen.press("au-groups-input");
autocompleteOpen.applyEdit("au-groups-input", "r", 1, 1);
autocompleteOpen.key("ArrowDown");
const autocompleteLimit = atRest(AutocompleteDemo, "autocomplete.css");
autocompleteLimit.press("au-limit-input");
autocompleteLimit.applyEdit("au-limit-input", "a", 1, 1);
autocompleteLimit.key("ArrowDown");
STATES.push(...[
  ["autocomplete — six boxes, closed", autocomplete, 53],
  ["autocomplete — grouped list open, a row highlighted", autocompleteOpen, 54],
  ["autocomplete — limited list open, a row highlighted", autocompleteLimit, 55],
].map(([name, d, gen]) => ({
  name,
  size: [d.widthPx(), d.heightPx()],
  lint: () => d.a11yProblems(),
  tree: () => d.a11yJson(gen, d.focused || ""),
})));

// The rating demo: at rest (images and sliders side by side), and after a
// click, a hover and a key — the interactive slider moved and focused, the
// half-star one at 4.5, the ten-star one previewing under the pointer.
{
  const { RatingDemo } = require(path.join(ROOT, "gallery/evgui/bin/RatingDemo.cjs"));
  const rating = atRest(RatingDemo, "rating.css");
  const ratingBusy = atRest(RatingDemo, "rating.css");
  ratingBusy.press("rt-rate-star-1-h1");
  ratingBusy.key("ArrowRight");
  ratingBusy.press("rt-half-star-4-h0");
  ratingBusy.setHover("rt-ten-star-8-h1");
  STATES.push(...[
    ["rating — six cards at rest", rating, 56],
    ["rating — set, stepped, focused and previewing", ratingBusy, 57],
  ].map(([name, d, gen]) => ({
    name,
    size: [d.widthPx(), d.heightPx()],
    lint: () => d.a11yProblems(),
    tree: () => d.a11yJson(gen, d.focused || ""),
  })));
}

// The kanban board: at rest, and with a card picked up from the keyboard and
// carried into the next column (aria-pressed on it, the counts moved, the
// status region saying where it is).
{
  const { KanbanDemo } = require(path.join(ROOT, "gallery/evgui/bin/KanbanDemo.cjs"));
  const kanban = atRest(KanbanDemo, "kanban.css");
  const kanbanHeld = atRest(KanbanDemo, "kanban.css");
  kanbanHeld.setFocus("kb-card-1");
  kanbanHeld.key(" ");
  kanbanHeld.key("ArrowRight");
  STATES.push(...[
    ["kanban — the board at rest", kanban, 70],
    ["kanban — a card picked up and carried across", kanbanHeld, 71],
  ].map(([name, d, gen]) => ({
    name,
    size: [d.widthPx(), d.heightPx()],
    lint: () => d.a11yProblems(),
    tree: () => d.a11yJson(gen, d.focused || ""),
  })));
}

// The drawer demo: closed, and each drawer open and settled — a modal
// dialog labelled by its title and described by its description, over a
// page the mirror makes inert.
{
  const { DrawerDemo } = require(path.join(ROOT, "gallery/evgui/bin/DrawerDemo.cjs"));
  const drawerAt = (key) => {
    const d = atRest(DrawerDemo, "drawer.css");
    if (key) {
      d.press(`drw-${key}-trigger`);
      d.settle();
      d.displayListJson();
    }
    return d;
  };
  STATES.push(...[
    ["drawer — five triggers, closed", drawerAt(""), 80],
    ["drawer — right drawer open, body scrolling", drawerAt("right"), 81],
    ["drawer — bottom drawer open (goal stepper)", drawerAt("bottom"), 82],
    ["drawer — left navigation drawer open", drawerAt("left"), 83],
    ["drawer — top drawer open", drawerAt("top"), 84],
    ["drawer — responsive one open (a dialog here)", drawerAt("resp"), 85],
  ].map(([name, d, gen]) => ({
    name,
    size: [d.widthPx(), d.heightPx()],
    lint: () => d.a11yProblems(),
    tree: () => d.a11yJson(gen, d.focused || ""),
  })));
}

// The combobox demo: six closed boxes (one prefilled, two chips in the
// multiple one), the basic list open with a row highlighted and a ✓ on the
// chosen one, and the chip box open on a third pick — a multiselectable
// listbox beside a toolbar of chips with their remove buttons.
{
  const { ComboboxDemo } = require(path.join(ROOT, "gallery/evgui/bin/ComboboxDemo.cjs"));
  const combobox = atRest(ComboboxDemo, "combobox.css");
  const comboboxOpen = atRest(ComboboxDemo, "combobox.css");
  comboboxOpen.press("cb-basic-input");
  comboboxOpen.key("ArrowDown");
  comboboxOpen.key("Enter");
  comboboxOpen.press("cb-basic-input");
  comboboxOpen.key("ArrowDown");
  const comboboxChips = atRest(ComboboxDemo, "combobox.css");
  comboboxChips.press("cb-multi-input");
  comboboxChips.press("cb-multi-item-remix");
  comboboxChips.key("ArrowDown");
  STATES.push(...[
    ["combobox — six boxes, closed", combobox, 90],
    ["combobox — list open, a row highlighted, one chosen", comboboxOpen, 91],
    ["combobox — multiple open with three chips", comboboxChips, 92],
  ].map(([name, d, gen]) => ({
    name,
    size: [d.widthPx(), d.heightPx()],
    lint: () => d.a11yProblems(),
    tree: () => d.a11yJson(gen, d.focused || ""),
  })));
}

// The colour picker: at rest (two closed triggers, the inline picker, the
// picture); the plain popover open on HEX with its Recent row; the alpha one
// open on RGB with four fields and the presets; the inline one on HSL with a
// field being typed into; and the eyedropper in pick mode.
{
  const { ColorPickerDemo } = require(path.join(ROOT, "gallery/evgui/bin/ColorPickerDemo.cjs"));
  const cp = () => atRest(ColorPickerDemo, "colorpicker.css");
  const cpRest = cp();
  const cpNative = cp();
  cpNative.press("cpn-trigger");
  cpNative.setFocus("cpn-hue");
  cpNative.key("ArrowRight");
  const cpAlpha = cp();
  cpAlpha.setScreenPicker(true);
  cpAlpha.press("cpa-trigger");
  cpAlpha.setFocus("cpa-preset-2");
  const cpTyping = cp();
  cpTyping.press("cpi-fmt");
  cpTyping.press("cpi-fmt");
  cpTyping.press("cpi-f1");
  cpTyping.applyEdit("cpi-f1", "4", 1, 1);
  const cpPicking = cp();
  cpPicking.press("cpi-eye");
  for (const d of [cpRest, cpNative, cpAlpha, cpTyping, cpPicking]) d.displayListJson();
  STATES.push(...[
    ["colorpicker — at rest", cpRest, 100],
    ["colorpicker — popover open, hue stepped", cpNative, 101],
    ["colorpicker — alpha and presets open, a swatch focused", cpAlpha, 102],
    ["colorpicker — inline on HSL, a field being typed", cpTyping, 103],
    ["colorpicker — the eyedropper picking", cpPicking, 104],
  ].map(([name, d, gen]) => ({
    name,
    size: [d.widthPx(), d.heightPx()],
    lint: () => d.a11yProblems(),
    tree: () => d.a11yJson(gen, d.focused || ""),
  })));
}

// The select demo: six cards closed; the fruit list open with a row
// highlighted; the avatars list in its group; the multiple list (checks on
// five rows); the time zones in three labelled groups; and the form invalid.
{
  const { SelectDemo } = require(path.join(ROOT, "gallery/evgui/bin/SelectDemo.cjs"));
  const sl = () => atRest(SelectDemo, "select.css");
  const slRest = sl();
  const slFruit = sl();
  slFruit.press("sl-fruit-trigger");
  slFruit.key("ArrowDown");
  const slUsers = sl();
  slUsers.press("sl-users-trigger");
  const slStatus = sl();
  slStatus.press("sl-status-trigger");
  slStatus.key("End");
  const slZones = sl();
  slZones.press("sl-tz-trigger");
  slZones.key("ArrowDown");
  const slInvalid = sl();
  slInvalid.press("sl-submit");
  STATES.push(...[
    ["select — six cards, closed", slRest, 120],
    ["select — fruit list open, a row highlighted", slFruit, 121],
    ["select — avatars list open in its group", slUsers, 122],
    ["select — multiple list open, five checked", slStatus, 123],
    ["select — time zones in three labelled groups", slZones, 124],
    ["select — the form invalid after a submit", slInvalid, 125],
  ].map(([name, d, gen]) => ({
    name,
    size: [d.widthPx(), d.heightPx()],
    lint: () => d.a11yProblems(),
    tree: () => d.a11yJson(gen, d.focused || ""),
  })));
}

// The menubar page: three bars at rest, then each kind of menu open, reached
// by pressing (and hovering) the ids the hit test reports, as the page does —
// the icons-and-shortcuts File menu, Account with its group and destructive
// row, View's checkbox rows, Theme's radio group, and the Radix example with a
// submenu out. The five states above are the static `page()` the tree-literal
// test uses; these are the live page's.
{
  const live = (steps) => {
    const d = atRest(MenubarDemo, "menubar.css");
    for (const [op, id] of steps) {
      if (op === "hover") d.setHover(id);
      else if (op === "tick") d.tick(150.0);
      else d.press(id);
      d.displayListJson();
    }
    return d;
  };
  for (const [name, steps, gen] of [
    ["menubar page — three bars at rest", [], 64],
    ["menubar page — File open (icons, shortcuts)", [["press", "mb1-file-trigger"]], 65],
    ["menubar page — Account open (a group, a destructive row)", [["press", "mb1-account-trigger"]], 66],
    ["menubar page — View open (checkbox rows)", [["press", "mb2-view-trigger"]], 67],
    ["menubar page — Theme open (a radio group)", [["press", "mb2-theme-trigger"]], 68],
    ["menubar page — Radix Edit open, Find submenu out", [["press", "mb3-edit-trigger"], ["hover", "mb3-edit-item-find"], ["tick"]], 69],
  ]) {
    const d = live(steps);
    STATES.push({
      name,
      size: [d.widthPx(), d.heightPx()],
      lint: () => d.a11yLint(),
      tree: () => d.a11yTreeJson(gen, d.focused || ""),
    });
  }
}

const AXE = fs.readFileSync(domRequire.resolve("axe-core"), "utf8");

const html = `<!doctype html><meta charset="utf-8">
<link rel="icon" href="data:,">
<style>html,body{margin:0;background:#fff}#stage{position:relative}</style>
<div id="stage"></div>
<script type="module">
import { createA11yMirror } from "/lib/evg/gl/evg-a11y.js";
const stage = document.getElementById("stage");
const mirror = createA11yMirror(stage, { label: "Ranger tree literal demos" });
window.__mirror = (tree, w, h) => {
  stage.style.width = w + "px";
  stage.style.height = h + "px";
  mirror.update(tree);
};
window.__READY__ = true;
</script>`;

const pageFile = path.join(ROOT, "tmp", "demo_a11y.html");
fs.mkdirSync(path.dirname(pageFile), { recursive: true });
fs.writeFileSync(pageFile, html);

const { createServer } = await import("node:http");
const server = createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = rel === "/" ? pageFile : path.join(ROOT, rel.slice(1));
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end("not found");
    return;
  }
  const type = file.endsWith(".js") || file.endsWith(".mjs") ? "text/javascript"
    : file.endsWith(".css") ? "text/css" : file.endsWith(".json") ? "application/json"
    : file.endsWith(".png") ? "image/png" : file.endsWith(".svg") ? "image/svg+xml"
    : file.endsWith(".woff2") ? "font/woff2" : "text/html";
  res.writeHead(200, { "content-type": type }).end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const { chromium } = requireDom("playwright-core");
const browser = await chromium.launch({ executablePath: findChromium() });
const page = await browser.newPage({ viewport: { width: 1320, height: 700 } });
page.on("pageerror", (e) => console.error("PAGEERROR:", e.message));
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForFunction("window.__READY__ === true", null, { timeout: 20000 });

console.log("gallery/evgui/demo — accessibility audit (axe-core " +
  domRequire("axe-core/package.json").version + ")\n");

let failures = 0;
for (const state of STATES) {
  const problems = state.lint();
  const tree = JSON.parse(state.tree());
  await page.evaluate(
    ([t, w, h]) => window.__mirror(t, w, h),
    [tree, state.size[0], state.size[1]],
  );
  await page.addScriptTag({ content: AXE });
  const violations = await page.evaluate(async () => {
    const res = await window.axe.run(document.querySelector("#stage"), {
      resultTypes: ["violations"],
      rules: { "color-contrast": { enabled: false } },
    });
    return res.violations.map((v) => ({
      id: v.id, impact: v.impact, help: v.help,
      nodes: v.nodes.length, targets: v.nodes.slice(0, 3).map((n) => String(n.target)),
    }));
  });
  // A tree with no nodes passes every rule there is, so the count is part of
  // the check: an audit of nothing is not a clean audit.
  const mirrored = await page.evaluate(
    () => document.querySelectorAll("[data-a11y-id]").length,
  );
  const ok = problems.length === 0 && violations.length === 0 && mirrored === tree.nodes.length;
  if (!ok) failures += 1;
  console.log(`  ${ok ? "PASS" : "FAIL"} ${state.name} — ${tree.nodes.length} nodes, ${mirrored} mirrored`);
  for (const p of problems) console.log(`    lint: ${p}`);
  for (const v of violations) {
    console.log(`    axe [${v.impact}] ${v.id}: ${v.help} (${v.nodes} nodes) ${v.targets.join(" ")}`);
  }
}

// --- the keyboard, on the real page -----------------------------------------
//
// The trees above are right or wrong on their own; whether a KEYBOARD can use
// them is a question only the page can answer, because the page is what turns
// a tree into tab stops (see "KEYBOARD" in main.js). So every demo is loaded
// as a person loads it, the focus is put on the last control BEFORE the
// canvas, and Tab is pressed until the focus leaves it:
//
//   * Tab has to reach at least one control inside the demo (WCAG 2.1.1) —
//     a demo you cannot Tab into is a demo only a mouse can use;
//   * and it has to come OUT again, onto the page after the canvas, within a
//     bounded number of presses (2.1.2, no keyboard trap) — the form, the
//     profile card, the metadata card and the OTP boxes used to cycle their
//     fields forever;
//   * Shift+Tab from there has to land back inside, which is the reverse
//     entry at the last stop.
console.log("\n--- the keyboard: Tab reaches the demo and leaves it ---");
if (!fs.existsSync(path.join(HERE, "bundle.js"))) {
  console.log("  FAIL bundle.js missing — run `node gallery/evgui/demo/build.mjs` first");
  failures += 1;
} else {
  const kb = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  const kbErrors = [];
  kb.on("pageerror", (e) => kbErrors.push(e.message.split("\n")[0]));
  await kb.goto(`http://127.0.0.1:${port}/gallery/evgui/demo/index.html`);
  await kb.waitForFunction("document.querySelector('#stage canvas') && window.__lastA11y", null, { timeout: 30000 });
  const demos = await kb.evaluate(() =>
    [...document.querySelectorAll("#demos input[type=radio]")].map((r) => r.value));
  const where = () => kb.evaluate(() => {
    const a = document.activeElement;
    const inside = document.getElementById("stage").contains(a);
    return { inside, id: inside ? window.__kbFocus() || (a.dataset && a.dataset.a11yId) || a.tagName : a.id || a.tagName };
  });
  for (const name of demos) {
    kbErrors.length = 0;
    await kb.goto(`http://127.0.0.1:${port}/gallery/evgui/demo/index.html?demo=${name}`);
    await kb.waitForFunction("document.querySelector('#stage canvas') && window.__lastA11y", null, { timeout: 30000 });
    await kb.evaluate(() => {
      const stage = document.getElementById("stage");
      const before = [...document.querySelectorAll("a[href],button,input,select,textarea,summary,[tabindex]")]
        .filter((e) => !stage.contains(e) && e.tabIndex >= 0 && !e.disabled && e.getClientRects().length)
        .filter((e) => stage.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_PRECEDING);
      before[before.length - 1].focus();
    });
    const walked = [];
    let out = null;
    // A MODAL dialog keeps the Tab inside it on purpose (the APG pattern, and
    // Radix's): that is not a trap as 2.1.2 means one, because Escape is the
    // documented way out. So a walk that is still going after a lap of the
    // modal presses Escape once — and from then on Tab has to leave as usual.
    let escaped = false;
    for (let i = 0; i < 120 && !out; i++) {
      if (!escaped && walked.length >= 20) {
        const modal = await kb.evaluate(() => JSON.parse(window.__lastA11y).nodes.some((n) => n.modal));
        if (modal) {
          escaped = true;
          await kb.keyboard.press("Escape");
        }
      }
      await kb.keyboard.press("Tab");
      const w = await where();
      if (w.inside) walked.push(w.id);
      else out = w;
    }
    let back = null;
    if (out) {
      await kb.keyboard.press("Shift+Tab");
      back = await where();
    }
    // A PURELY PRESENTATIONAL DEMO has no stop, and must not be given one to
    // satisfy this walk: a tab stop on something that does nothing is a
    // defect of its own (WCAG 2.4.3 — focus order has to mean something).
    // The separator page is the case: rules and text, nothing to press. What
    // is checked for such a demo is the other half of the contract — its
    // mirror has NO focusable node, Tab goes straight past the canvas, and
    // Shift+Tab from after it goes straight past it back again. The demo is
    // recognised by its tree, not by name, so a control added to it later
    // puts it back under the ordinary rule.
    const presentational = await kb.evaluate(() =>
      !JSON.parse(window.__lastA11y).nodes.some((n) => n.focusable));
    const reached = walked.length > 0;
    const left = !!out;
    const reentered = !!back && back.inside;
    const ok = presentational
      ? !reached && left && !!back && !back.inside && kbErrors.length === 0
      : reached && left && reentered && kbErrors.length === 0;
    if (!ok) failures += 1;
    const said = presentational
      ? (reached ? `presentational, but Tab stopped inside at ${walked.join(" ")}`
        : !left ? "presentational, but Tab never left"
        : back && back.inside ? `presentational, but Shift+Tab stopped inside at ${back.id}`
        : kbErrors.length ? kbErrors.join("; ")
        : `presentational: no stop, Tab passes over to #${out.id} and Shift+Tab back to #${back.id}`)
      : !reached ? "Tab never reached a control"
      : !left ? `Tab never left (trapped after ${walked.length} presses: …${walked.slice(-4).join(" ")})`
      : !reentered ? "Shift+Tab from after the canvas did not come back in"
      : kbErrors.length ? kbErrors.join("; ")
      : `${walked.length} stop(s)${escaped ? " (a modal, left with Escape)" : ""}, out to #${out.id}, back in at ${back.id}`;
    console.log(`  ${ok ? "PASS" : "FAIL"} ${name} — ${said}`);
  }
  await kb.close();
}

await browser.close();
server.close();
console.log("");
console.log(failures === 0 ? "RESULT OK" : `RESULT ${failures} state(s) with findings`);
process.exit(failures === 0 ? 0 : 1);
