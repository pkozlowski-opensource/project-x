/**
 * Data structure that holds data associated with a view.
 */
interface ViewData {
  viewId: number;
  nodes: VNode[];
}

interface VNode {
  parent: VNode;
  children: VNode[];
  native: any; // TODO(pk): type it properly
  data: any[] // TODO(pk): storing bindings separatelly for each and every individual node might not be super-performant :-)

  /**
   * Each node is part of a group
   */
  view: ViewData;

  /**
   * Nodes having components sitting on top of them have a pointer to a component's view
   */
  componentView: VNode;

  /**
   * Grouping node for component's children
   */
  group: VNode;
}

const enum RenderFlags {
  Create = 0b01,
  Update = 0b10
}

function createVNode(view: ViewData, parent: VNode, native): VNode {
  return {
    view: view,
    parent: parent,
    children: [], // TODO(pk): lazy-init children array => or better yet, have the exact number of children handy :-)
    native: native,
    data: [],  // TODO(pk): lazy-init data array => or better yet, have the exact number of bindings handy :-)
    componentView: null,
    group: null
  };
}

// INSANITY WARNING: global variables => think of passing context around
// those fields here are part of the view-specific context
let parentVNode: VNode;
let nextViewIdx = 0;

let currentView: ViewData;

function elementStart(idx: number, tagName: string, attrs?: string[] | null) {
  const domEl = document.createElement(tagName);
  const vNode = currentView.nodes[idx] = createVNode(currentView, parentVNode, domEl);
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
  parentVNode = currentView.nodes[idx].parent;
}

function element(idx: number, tagName: string, attrs?: string[] | null) {
  elementStart(idx, tagName, attrs);
  elementEnd(idx);
}

function container(idx: number) {
  const domEl = document.createComment(`container ${idx}`);
  const vNode = currentView.nodes[idx] = createVNode(currentView, parentVNode, domEl);
  parentVNode.children.push(vNode);
  parentVNode.native.appendChild(domEl);
}

function listener(elIdx: number, eventName: string, handlerFn) {
  // TODO(pk): I could avoid look-up here by storing "global" reference to a node being processed
  const vNode = currentView.nodes[elIdx];
  const domEl = vNode.native;

  // TODO(pk): do I need to cleanup?
  domEl.addEventListener(eventName, handlerFn);
}

function text(idx: number, value?: string) {
  const domEl = document.createTextNode(value != null ? value : '');
  const vNode = currentView.nodes[idx] = createVNode(currentView, parentVNode, domEl);
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

function textContent(vNodeIdx: number, bindIdx: number, newValue: string) {
  const vNode = currentView.nodes[vNodeIdx];
  if (checkAndUpdateBinding(vNode.data, bindIdx, newValue)) {
    vNode.native.textContent = newValue;
  }
}

function elementProperty(vNodeIdx: number, bindIdx: number, propName: string, newValue: any) {
  const vNode = currentView.nodes[vNodeIdx];
  if (checkAndUpdateBinding(vNode.data, bindIdx, newValue)) {
    vNode.native[propName] = newValue;
  }
}

function elementAttribute(vNodeIdx: number, bindIdx: number, attrName: string, newValue: string) {
  const vNode = currentView.nodes[vNodeIdx];
  if (checkAndUpdateBinding(vNode.data, bindIdx, newValue)) {
    vNode.native.setAttribute(attrName, newValue);
  }
}

function include(containerIdx: number, tplFn, ctx?) {
  const containerVNode = currentView.nodes[containerIdx];

  if (checkAndUpdateBinding(containerVNode.data, 0, tplFn)) {
    const views = containerVNode.children;
    const existingViewVNode = views[0];

    // remove if already exists
    if (existingViewVNode) {
      views.splice(0, 1);
      removeViewFromDOM(existingViewVNode);
    }
    // re-create (unless it is null)
    if (tplFn) {
      createAndRefreshView(containerVNode, -1, tplFn, ctx);
    }

  } else {
    refreshView(containerVNode, containerVNode.children[0], tplFn, ctx);
  }
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
  const containerVNode = currentView.nodes[containerIdx];
  const views = containerVNode.children;

  const remainingViewsCount = views.length - nextViewIdx;
  if (remainingViewsCount) {
    const removedViews = views.splice(nextViewIdx, remainingViewsCount);
    for (let removedView of removedViews) {
      // for each remove DOM (optionally find a parent)
      removeViewFromDOM(removedView);
    }
  }
}

function findView(views: VNode[], startIdx: number, viewIdx: number): VNode|undefined {
  for (let i = startIdx; i < views.length; i++) {
    if (views[i].view.viewId === viewIdx) {
      return views[i];
    }
  }
}

function refreshView(containerVNode: VNode, viewVNode: VNode, viewFn, ctx?) {
  // execute template function
  const oldView = currentView;

  parentVNode = viewVNode;
  currentView = viewVNode.view;
  viewFn(RenderFlags.Update, ctx);

  parentVNode = containerVNode.parent;
  currentView = oldView;
}

function createAndRefreshView(containerVNode: VNode, viewId: number, viewFn, ctx?) {
  const docFragment = document.createDocumentFragment();
  const oldView = currentView;
  const viewData = {viewId: viewId, nodes: []};
  parentVNode = createVNode(viewData, containerVNode, docFragment);
  containerVNode.children.push(parentVNode);

  currentView = viewData;
  viewFn(RenderFlags.Create | RenderFlags.Update, ctx);

  // attatch freshly created DOM nodes to the DOM tree
  // TODO(pk): check if nested DOM nodes are inserted as well
  // TODO(pk): I can't assume that parent of a container is an element - it could be another view
  containerVNode.parent.native.insertBefore(docFragment, containerVNode.native);

  parentVNode = containerVNode.parent;
  currentView = oldView;
}

function view(containerIdx: number, viewId: number, viewFn, ctx?) {
  const containerVNode = currentView.nodes[containerIdx];
  const existingVNode = findView(containerVNode.children, nextViewIdx, viewId);

  if (existingVNode) {
    refreshView(containerVNode, existingVNode, viewFn, ctx);
  } else {
    createAndRefreshView(containerVNode, viewId, viewFn, ctx);
  }

  nextViewIdx++;
}

function componentStart(idx: number, tagName: string, constructorFn, attrs?: string[] | null) {
  const domEl = document.createElement(tagName);
  const hostElVNode = currentView.nodes[idx] = createVNode(currentView, parentVNode, domEl);
  parentVNode.children.push(hostElVNode);
  hostElVNode.data[0] = new constructorFn();

  // TODO(pk): extract to a shared utility
  if (attrs) {
    for (var i = 0; i < attrs.length; i += 2) {
      domEl.setAttribute(attrs[i], attrs[i + 1]);
    }
  }

  parentVNode.native.appendChild(domEl);
  // TODO(pk): create doc fragment for children (in reality we will have multiple doc fragments, one per name)

  const docFragment = document.createDocumentFragment();
  const groupVNode = createVNode(currentView, hostElVNode, docFragment);
  hostElVNode.group = groupVNode;

  parentVNode = groupVNode;
}

function componentEnd(idx: number) {
  const hostElVNode = currentView.nodes[idx];
  const cmptInstance = hostElVNode.data[0];

  const docFragment = document.createDocumentFragment();
  const componentViewData = {viewId: -1, nodes: []};
  const componentView = createVNode(componentViewData, hostElVNode, docFragment);
  const oldView = currentView;

  parentVNode = componentView;
  currentView = componentViewData;

  cmptInstance.render(RenderFlags.Create, cmptInstance);
  hostElVNode.native.appendChild(docFragment);
  hostElVNode.componentView = componentView;

  currentView = oldView;
  parentVNode = hostElVNode.parent;
}

function componentRefresh(hostElIdx: number, componentInstanceIdx: number) {
  const hostElVNode = currentView.nodes[hostElIdx];
  const cmptInstance = hostElVNode.data[componentInstanceIdx];
  const componentView = hostElVNode.componentView;

  const oldView = currentView;
  parentVNode = componentView;
  currentView = componentView.view;

  cmptInstance.render(RenderFlags.Update, cmptInstance, hostElVNode.group);

  currentView = oldView;
  parentVNode = hostElVNode.parent;
}

function load<T>(nodeIdx: number, dataIdx: number): T {
  const vNode = currentView.nodes[nodeIdx];
  return vNode.data[dataIdx] as T;
}

function input(hostElIdx: number, bindIdx: number, newValue: any): boolean {
  const vNode = currentView.nodes[hostElIdx];
  return checkAndUpdateBinding(vNode.data, bindIdx, newValue);
}

function content(idx: number) {
  const domEl = document.createComment(`content ${idx}`);
  const vNode = currentView.nodes[idx] = createVNode(currentView, parentVNode, domEl);
  parentVNode.children.push(vNode);
  parentVNode.native.appendChild(domEl);
}

function contentRefresh(idx: number, contentGroup: VNode) {
  const contentVNode = currentView.nodes[idx];
  // TODO(pk): we should also have equivalent of removal...
  // TODO(pk): currently can only insert into content that has a parrent node in a given template
  contentVNode.parent.native.insertBefore(contentGroup.native, contentVNode.native);
}

function directive(hostIdx: number, directiveIdx: number, constructorFn) {
   const hostVNode = currentView.nodes[hostIdx];
   hostVNode.data[directiveIdx]  = new constructorFn(hostVNode.native);
}

function directiveRefresh(hostIdx: number, directiveIdx: number) {
  const directiveInstance = currentView.nodes[hostIdx].data[directiveIdx];
  directiveInstance.refresh();
}

function render(nativeHost, tpl, ctx?) {
  const viewData: ViewData = {viewId: -1, nodes: []};
  const hostVNode = createVNode(viewData, null!, nativeHost);

  parentVNode = hostVNode;
  currentView = viewData;
  tpl(RenderFlags.Create | RenderFlags.Update, ctx);

  currentView = null;
  parentVNode = hostVNode.parent;

  return function (ctx) {
    currentView = viewData;
    parentVNode = hostVNode;

    tpl(RenderFlags.Update, ctx);

    currentView = null;
    parentVNode = hostVNode.parent;
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
    textContent(1, 0, `Hello, ${ctx.name}`);
  }
}