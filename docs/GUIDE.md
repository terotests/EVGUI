# Writing a page with EVGUI

This guide builds a small task list: press a task to mark it done, press
"Clear done" to drop the finished ones. The whole program is
[`demo/GuideTodo.rgr`](../demo/GuideTodo.rgr), and
`node scripts/run.mjs evg:guide:check` compiles and runs it, so the code below
is code that works.

Everything here is opt-in. A page that routes its own input, a stylesheet
without the `@evg mode standard;` line, and programs built on EVG directly
compile and behave exactly as before.

## 1. The tags: a treefactory

A `treefactory` names the tags a page is written in. Each tag is an
`EVGElement` with default props:

```lisp
treefactory Td {
    child addChild
    text  textContent
    on    events.bind          ; handlers go to UiApp's event table
    component TaskRow this.row ; (TaskRow t) calls this.row(t)

    tag Page   EVGElement (props (className "page"))
    tag Title  EVGElement (props (className "title") (elementType 1) (role "heading") (a11yLevel 1))
    tag List   EVGElement (props (className "list") (role "list"))
    tag Item   EVGElement (props (className "item") (role "checkbox"))
    tag Label  EVGElement (props (className "label") (elementType 1))
    tag Button EVGElement (props (className "button") (role "button") (elementType 1))
}
```

Give interactive tags a `role`. The accessibility tree, the keyboard and the
a11y lint (section 5) all start from it.

## 2. The page: UiApp and view()

Extend `src/UiApp.rgr` and return the page from `view()`. The state lives
in ordinary fields:

```lisp
class GuideTodo extends UiApp {
    def tasks:[Task]

    fn view:EVGElement () {
        return (tree Td (Page (props (id "page"))
            (Title (props (id "title")) "Today")
            (List (props (id "list"))
                (each tasks t:Task (TaskRow t)))
            (Button (props (id "clear")) "Clear done"
                (on press (fn:void (e:UiEvent) {
                    def keep:[Task]
                    for tasks t:Task i {
                        if (t.done == false) {
                            push keep t
                        }
                    }
                    tasks = keep
                })))))
    }
}
```

- `(on press handler)` binds a handler to that element. The element needs an
  `id`, because handlers are kept by id beside the tree. `EVGElement` has
  no handler field.
- After a handler runs, `view()` is built again and reconciled into the
  live tree (keyed by id). This happens once per event, however many fields
  changed. A handler that does not take the event sets `e.handled = false`,
  and the event goes on to the parent.
- The host calls `app.build()` once, then `app.dispatch("press" id)` with
  the hit element's id, `app.dispatchKey(focusedId key)` for keys, and
  `app.pointerOver(id)` for hover and leave. A press on the label reaches
  the row's handler, because dispatch walks from the hit element outwards.

## 3. Pieces of a page: component and each

`component TaskRow this.row` makes `(TaskRow t)` a call to an ordinary method
that returns an element:

```lisp
fn row:EVGElement (t:Task) {
    def cls:string "item"
    if t.done {
        cls = "item done"
    }
    def el (tree Td (Item (props (id t.id) (className cls))
        (Label (props (id (t.id + "-label"))) t.title)
        (on press (fn:void (e:UiEvent) {
            t.done = (t.done == false)
        }))))
    el.a11yChecked = 1          ; aria-checked: 1 no, 2 yes
    if t.done {
        el.a11yChecked = 2
    }
    return el
}
```

`(each tasks t:Task (TaskRow t))` adds one child per item. Give each
generated element a stable id (here the task's own) so the reconciler keeps
the right element when the list changes.

A component name may not also be a tag name; the compiler reports the
clash.

## 4. The stylesheet: standard mode

A sheet that starts with `@evg mode standard;` reads like browser CSS:

```css
@evg mode standard;
.page { display: flex; flex-direction: column; padding: 16px; }
.list .item { display: flex; padding: 4px 8px; }
.item.done .label { color: #a1a1aa; }
```

- Compound (`.item.done`) and descendant (`.list .item`) selectors work.
  A leading `.theme-x` still scopes a rule to a theme.
- Rules go by specificity (how many classes the selector names), then by
  source order.
- A flex container with no direction or wrap given is `row` and `nowrap`, as
  in a browser. Without the directive, EVG's defaults (`column`, `wrap`)
  stay, which is how existing pages keep their look.

```lisp
def sheet (new EVGStyleSheet())
sheet.parse(css)
sheet.applyTree(root "")
```

The full rules are in EVG's [CSS overview](https://github.com/terotests/evg/blob/master/docs/site/src/content/docs/css/overview.md).

## 5. Check what a reader gets: UiA11yLint

```lisp
def found:[string] ((new UiA11yLint()).checkApp(app))
```

returns one line per problem:

- a role that is announced by name (button, checkbox, tab, textbox, img…)
  with no `aria-label` and no text (`#clear: role button has no name (aria-label or text)`);
- an element with a `press` handler and no role, which a keyboard or a
  reader cannot reach.

Turn the lines into failures in the page's check script. `GuideTodo` and
`RatingDemo` are both clean.

## 6. The edit loop

```sh
node scripts/run.mjs evg:dev
```

compiles the demos with source maps and serves the demo page with hot
reload:

- When you save a `.rgr` under `demo/` or `src/`, only the demos that import
  it are recompiled, and the page reloads on the same demo. Controller
  state starts over.
- A save that does not compile shows the compiler's message (file, line, the
  source with a marker) in the page's error card instead of reloading.
- Stack traces and breakpoints in the browser's devtools are on `.rgr`
  lines.

A new demo goes into the `DEMOS` list in `demo/build.mjs` and into
`demo/main.js`, like the others.

## 7. In the editor

The Ranger VS Code extension (`ranger-vscode-extension` in Ranger) checks a
file with the checkout's own compiler on open and on save. An error in an
imported file is shown on that file. Go to definition follows `Import`
and `pkg:` imports, and takes a `component` tag to its method.

## 8. Checks

Each demo has a check script (`demo/*-check.mjs`) that drives it without a
browser or in Chromium, and `scripts/gate.sh` runs them all. A page's check
should cover what a user does (dispatch the events, read the tree back), the
a11y lint, and anything a stylesheet must reach.
