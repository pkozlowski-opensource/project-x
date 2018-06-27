interface VNode {
  idx: number;
  parent: VNode;
  children: VNode[];
  native: any; // TODO(pk): type it properly
  bindings: any[] // TODO(pk): storing bindings separatelly for each and every individual node might not be super-performant :-)
}

// INSANITY WARNING: global variables => think of passing context around
// those fields here are part of the view-specific context
let parentVNode: VNode;
let nodes: VNode[] = null!;
let nextViewIdx = 0;

function createVNode(idx: number, parent: VNode, native) {
  return {
    idx: idx,
    parent: parent,
    children: [], // TODO(pk): lazy-init children array => or better yet, have the exact number of children handy :-)
    native: native,
    bindings: []  // TODO(pk): lazy-init bindings array => or better yet, have the exact number of bindings handy :-)
  };
}

function elementStart(idx: number, tagName: string, attrs?: string[] | null) {
  const domEl = document.createElement(tagName);
  const vNode = nodes[idx] = createVNode(idx, parentVNode, domEl);
  parentVNode.children.push(vNode);

  if (attrs) {
    for (var i = 0; i < attrs.length; i += 2) {
      domEl.setAttribute(attrs[i], attrs[i + 1]);
    }
  }

  parentVNode.native.appendChild(domEl);
  parentVNode = vNode;
}

// TODO(pk): would be possible to get rid of the idx argument here
function elementEnd(idx: number) {
  parentVNode = nodes[idx].parent;
}

function element(idx: number, tagName: string, attrs?: string[] | null) {
  elementStart(idx, tagName, attrs);
  elementEnd(idx);
}

function include(idx: number) {
  const domEl = document.createComment(`include ${idx}`);
  const vNode = nodes[idx] = createVNode(idx, parentVNode, domEl);
  parentVNode.children.push(vNode);
  parentVNode.native.appendChild(domEl);
}

// TODO(pk): code duplication with include(...)
function container(idx: number) {
  const domEl = document.createComment(`container ${idx}`);
  const vNode = nodes[idx] = createVNode(idx, parentVNode, domEl);
  parentVNode.children.push(vNode);
  parentVNode.native.appendChild(domEl);
}

function listener(elIdx: number, eventName: string, handlerFn) {
  // TODO(pk): I could avoid look-up here by storing "global" reference to a node being processed
  const vNode = nodes[elIdx];
  const domEl = vNode.native;

  // TODO(pk): do I need to cleanup?
  domEl.addEventListener(eventName, handlerFn);
}

function text(idx: number, value?: string) {
  const domEl = document.createTextNode(value != null ? value : '');
  const vNode = nodes[idx] = createVNode(idx, parentVNode, domEl);
  parentVNode.children.push(vNode);
  if (parentVNode) {
    parentVNode.native.appendChild(domEl);
  }
}

function checkAndUpdateBinding(bindings: any[], bindIdx: number, newValue: any): boolean {
  if (bindIdx > bindings.length) {
    bindings[bindIdx] = newValue;
    return true;
  } else {
    const oldValue = bindings[bindIdx];
    if (oldValue !== newValue) {
      bindings[bindIdx] = newValue;
      return true;
    }
  }
  return false;
}

function textUpdate(vNodeIdx: number, bindIdx: number, newValue: string) {
  const vNode = nodes[vNodeIdx];
  if (checkAndUpdateBinding(vNode.bindings, bindIdx, newValue)) {
    vNode.native.textContent = newValue;
  }
}

function elementProperty(vNodeIdx: number, bindIdx: number, propName: string, newValue: any) {
  const vNode = nodes[vNodeIdx];
  if (checkAndUpdateBinding(vNode.bindings, bindIdx, newValue)) {
    vNode.native[propName] = newValue;
  }
}

function elementAttribute(vNodeIdx: number, bindIdx: number, attrName: string, newValue: string) {
  const vNode = nodes[vNodeIdx];
  if (checkAndUpdateBinding(vNode.bindings, bindIdx, newValue)) {
    vNode.native.setAttribute(attrName, newValue);
  }
}

function includeTpl(containerIdx: number, tplFn, ctx) {
  const containerVNode = nodes[containerIdx];

  if (checkAndUpdateBinding(containerVNode.bindings, 0, tplFn)) {
    // remove

    // re-create (unless it is null)
    const docFragment = document.createDocumentFragment();
    parentVNode = createVNode(0, containerVNode, docFragment);
    containerVNode.children.push(parentVNode);
    nodes = parentVNode.children;
    tplFn(RenderFlags.Create | RenderFlags.Update, ctx);

    // attatch freshly created DOM nodes to the DOM tree
    // TODO(pk): check if nested DOM nodes are inserted as well
    // TODO(pk): I can't assume that parent of a container is an element - it could be another view
    containerVNode.parent.native.insertBefore(docFragment, containerVNode.native);

  } else {
    const viewVNode = containerVNode.children[0];
    parentVNode = viewVNode;
    nodes = viewVNode.children;
    tplFn(RenderFlags.Update, ctx);
  }

  // TODO(pk): restore state of nodes
  parentVNode = containerVNode;
}

function containerRefreshStart(containerIdx: number) {
  nextViewIdx = 0;
}

function removeViewFromDOM(view: VNode) {
  // TODO(pk): do I need a parent
  for (let node of view.children) {
    // TODO(pk): account for containers
    node.native.remove();
  }
}

function containerRefreshEnd(containerIdx: number) {
  const containerVNode = nodes[containerIdx];
  const views = containerVNode.children;

  const viewIdx = findViewIndex(containerVNode.children, nextViewIdx);
  const remainingViewsCount = views.length - viewIdx;
  if (remainingViewsCount) {
    const removedViews = views.splice(viewIdx, remainingViewsCount);
    for (let removedView of removedViews) {
      // for each remove DOM (optionally find a parent)
      removeViewFromDOM(removedView);
    }
  }
}

// TODO(pk): introduce start idx
function findView(views: VNode[], idx: number): VNode|undefined {
  for (let view of views) {
    if (view.idx === idx) {
      return view;
    }
  }
}

function findViewIndex(views: VNode[], idx: number): number|undefined {
  let foundIdx = 0;
  for (let view of views) {
    if (view.idx === idx) {
      return foundIdx;
    }
    foundIdx++;
  }
}

function view(containerIdx: number, viewIdx, viewFn, ctx?) {
  const containerVNode = nodes[containerIdx];
  const views = containerVNode.children;

  const view = findView(views, viewIdx);

  if (view) {
    // TODO(pk): update
  } else {
    // create
    const docFragment = document.createDocumentFragment();
    parentVNode = createVNode(0, containerVNode, docFragment);
    containerVNode.children.push(parentVNode);
    nodes = parentVNode.children;
    viewFn(RenderFlags.Create | RenderFlags.Update, ctx);

    // attatch freshly created DOM nodes to the DOM tree
    // TODO(pk): check if nested DOM nodes are inserted as well
    // TODO(pk): I can't assume that parent of a container is an element - it could be another view
    containerVNode.parent.native.insertBefore(docFragment, containerVNode.native);
  }
}

const enum RenderFlags {
  Create = 0b01,
  Update = 0b10
}

function render(host, tpl, ctx?) {
  const hostVNode = createVNode(0, null!, host);
  parentVNode = hostVNode;
  nodes = hostVNode.children;
  tpl(RenderFlags.Create | RenderFlags.Update, ctx);
  return function (ctx) {
    parentVNode = hostVNode;
    nodes = parentVNode.children;
    tpl(RenderFlags.Update, ctx);
  }
}


function app(rf: RenderFlags, ctx) {
  if (rf & RenderFlags.Create) {
    elementStart(0, 'div', ['id', 'test']);
    text(1, `Hello, ${ctx.name}`);
    element(2, 'span');
    elementEnd(0);
  }
  if (rf & RenderFlags.Update) {
    elementProperty(0, 0, 'id', 'new_id');
    textUpdate(1, 0, `Hello, ${ctx.name}`);
  }
}