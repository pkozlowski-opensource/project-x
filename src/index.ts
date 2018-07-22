/**
 * Data structure that holds data associated with a view.
 */
interface ViewData {
  viewId: number;
  nodes: VNode[];
}

const enum VNodeType {
  Text = 0,
  Element = 1,
  Container = 2,
  View = 3,
  Slot = 4,
  Slotable = 5
}

interface VNode {
  readonly type: VNodeType;
  parent: VNode;
  children: VNode[];
  native: any; // TODO(pk): type it properly
  data: any[]; // PERF(pk): storing bindings separatelly for each and every individual node might not be super-performant :-)

  /**
   * Each node is part of a view
   */
  view: ViewData;

  /**
   * Nodes having components sitting on top of them have a pointer to a component's view
   */
  componentView: VNode;
}

const enum RenderFlags {
  Create = 0b01,
  Update = 0b10,
  CreateAndUpdate = 0b11
}

function createVNode(type: VNodeType, view: ViewData, parent: VNode, native): VNode {
  return {
    type: type,
    view: view,
    parent: parent,
    children: [], // PERF(pk): lazy-init children array => or better yet, have the exact number of children handy :-)
    native: native,
    data: [], // PERF(pk): lazy-init data array => or better yet, have the exact number of bindings handy :-)
    componentView: null
  };
}

// INSANITY WARNING: global variables => think of passing context around
// those fields here are part of the view-specific context
let parentVNode: VNode;
let nextViewIdx = 0;

let currentView: ViewData;

// ========= dom.ts
function setAttributes(domEl, attrs?: string[] | null) {
  if (attrs) {
    for (let i = 0; i < attrs.length; i += 2) {
      domEl.setAttribute(attrs[i], attrs[i + 1]);
    }
  }
}

// =========

function elementStart(idx: number, tagName: string, attrs?: string[] | null) {
  const domEl = document.createElement(tagName);
  const vNode = (currentView.nodes[idx] = createVNode(VNodeType.Element, currentView, parentVNode, domEl));

  parentVNode.children.push(vNode);

  setAttributes(domEl, attrs);
  parentVNode.native.appendChild(domEl);

  parentVNode = vNode;
}

// PERF(pk): would be possible to get rid of the idx argument here
function elementEnd(idx: number) {
  parentVNode = currentView.nodes[idx].parent;
}

function element(idx: number, tagName: string, attrs?: string[] | null) {
  elementStart(idx, tagName, attrs);
  elementEnd(idx);
}

function container(idx: number) {
  const domEl = document.createComment(`container ${idx}`);
  const vNode = (currentView.nodes[idx] = createVNode(VNodeType.Container, currentView, parentVNode, domEl));
  parentVNode.children.push(vNode);
  parentVNode.native.appendChild(domEl);
}

function listener(elIdx: number, eventName: string, handlerFn) {
  // PERF(pk): I could avoid look-up here by storing "global" reference to a node being processed
  const vNode = currentView.nodes[elIdx];
  const domEl = vNode.native;

  // TODO(pk): do I need to cleanup?
  domEl.addEventListener(eventName, handlerFn);
}

function text(idx: number, value?: string) {
  const domEl = document.createTextNode(value != null ? value : "");
  const vNode = (currentView.nodes[idx] = createVNode(VNodeType.Text, currentView, parentVNode, domEl));
  parentVNode.children.push(vNode);
  parentVNode.native.appendChild(domEl);
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

function textContent(vNodeIdx: number, newValue: string) {
  const vNode = currentView.nodes[vNodeIdx];
  if (checkAndUpdateBinding(vNode.data, 0, newValue)) {
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

function elementClass(vNodeIdx: number, bindIdx: number, className: string, toogleState: boolean) {
  const vNode = currentView.nodes[vNodeIdx];
  if (checkAndUpdateBinding(vNode.data, bindIdx, toogleState)) {
    vNode.native.classList.toggle(className, toogleState);
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
      removeNodesFromDOM(existingViewVNode);
    }
    // re-create (unless it is null)
    if (tplFn) {
      createAndRefreshView(containerVNode, 0, -1, tplFn, ctx);
    }
  } else {
    refreshView(containerVNode.children[0], tplFn, ctx);
  }
}

function containerRefreshStart(containerIdx: number) {
  nextViewIdx = 0;
}

function removeNodesFromDOM(nodeOrGroup: VNode) {
  for (let node of nodeOrGroup.children) {
    if (
      node.type === VNodeType.Container ||
      node.type === VNodeType.Slot ||
      node.type === VNodeType.Slotable ||
      node.type === VNodeType.View
    ) {
      removeNodesFromDOM(node);
    }
    if (node.type !== VNodeType.View && node.type !== VNodeType.Slotable) {
      node.native.remove();
    } else {
      node.native = null;
    }
  }
}

function containerRefreshEnd(containerIdx: number) {
  const containerVNode = currentView.nodes[containerIdx];
  const views = containerVNode.children;

  const remainingViewsCount = views.length - nextViewIdx;
  if (remainingViewsCount > 0) {
    const removedViews = views.splice(nextViewIdx, remainingViewsCount);
    for (let removedView of removedViews) {
      // for each remove DOM (optionally find a parent)
      removeNodesFromDOM(removedView);
    }
  }
}

function findView(views: VNode[], startIdx: number, viewIdx: number): VNode | undefined {
  let i = startIdx;
  while (i < views.length) {
    let viewVNode = views[i];
    if (viewVNode.view.viewId === viewIdx) {
      return viewVNode;
    } else if (viewVNode.view.viewId < viewIdx) {
      views.splice(i, 1);
      removeNodesFromDOM(viewVNode);
    }
    i++;
  }
}

function createViewVNode(viewId: number, parent: VNode) {
  const docFragment = document.createDocumentFragment();
  const viewData = { viewId: viewId, nodes: [] };

  return createVNode(VNodeType.View, viewData, parent, docFragment);
}

function refreshView(viewVNode: VNode, viewFn, ctx?) {
  const oldView = currentView;

  parentVNode = viewVNode;
  currentView = viewVNode.view;
  viewFn(RenderFlags.Update, ctx);

  parentVNode = viewVNode.parent;
  currentView = oldView;
}

function findRenderParent(vNode: VNode): VNode {
  while ((vNode = vNode.parent)) {
    if (vNode.type === VNodeType.Element) {
      // container is a child of a regular element
      return vNode;
    } else if (vNode.type === VNodeType.View && vNode.native !== null) {
      // container is a child of a view that was not yet inserted into the DOM
      return vNode;
    }
  }
}

function createAndRefreshView(containerVNode: VNode, viewIdx: number, viewId: number, viewFn, ctx?) {
  const viewVNode = (parentVNode = createViewVNode(viewId, containerVNode));
  containerVNode.children.splice(viewIdx, 0, viewVNode);

  const oldView = currentView;
  currentView = viewVNode.view;

  viewFn(RenderFlags.CreateAndUpdate, ctx);

  // Attatch freshly created DOM nodes to the DOM tree but do so only if a container is not at the root of a projection group.
  // We can't attatch views to the root of projection groups as we don't know if a  given container be projected at all!
  const containerParent = containerVNode.parent;
  if (containerParent.type !== VNodeType.Slotable) {
    const renderParent = findRenderParent(containerVNode);
    renderParent.native.insertBefore(viewVNode.native, containerVNode.native);
    viewVNode.native = null; // can't re-use document fragment
  }

  parentVNode = containerVNode.parent;
  currentView = oldView;
}

function view(containerIdx: number, viewId: number, viewFn, ctx?) {
  const containerVNode = currentView.nodes[containerIdx];
  const existingVNode = findView(containerVNode.children, nextViewIdx, viewId);

  if (existingVNode) {
    refreshView(existingVNode, viewFn, ctx);
  } else {
    createAndRefreshView(containerVNode, nextViewIdx, viewId, viewFn, ctx);
  }

  nextViewIdx++;
}

function componentStart(idx: number, tagName: string, constructorFn, attrs?: string[] | null) {
  const domEl = document.createElement(tagName);
  const hostElVNode = (currentView.nodes[idx] = createVNode(VNodeType.Element, currentView, parentVNode, domEl));
  parentVNode.children.push(hostElVNode);
  hostElVNode.data[0] = new constructorFn();

  setAttributes(domEl, attrs);
  parentVNode.native.appendChild(domEl);

  const docFragment = document.createDocumentFragment();
  const groupVNode = createVNode(VNodeType.Slotable, currentView, hostElVNode, docFragment);

  hostElVNode.children[0] = groupVNode;
  parentVNode = groupVNode;
}

function componentEnd(idx: number) {
  const hostElVNode = currentView.nodes[idx];
  const cmptInstance = hostElVNode.data[0];
  const componentViewNode = createViewVNode(-1, hostElVNode);
  const oldView = currentView;

  parentVNode = componentViewNode;
  currentView = componentViewNode.view;

  cmptInstance.render(RenderFlags.Create, cmptInstance);

  // append all nodes collected for component view
  hostElVNode.native.appendChild(componentViewNode.native);
  // I can't re-use doc fragments - mark it as null so we know that we need to traverse up while looking for render parents
  componentViewNode.native = null;
  hostElVNode.componentView = componentViewNode;

  currentView = oldView;
  parentVNode = hostElVNode.parent;
}

function component(idx: number, tagName: string, constructorFn, attrs?: string[] | null) {
  componentStart(idx, tagName, constructorFn, attrs);
  componentEnd(idx);
}

function componentRefresh(hostElIdx: number) {
  const hostElVNode = currentView.nodes[hostElIdx];
  const cmptInstance = hostElVNode.data[0];
  const componentView = hostElVNode.componentView;

  const oldView = currentView;
  parentVNode = componentView;
  currentView = componentView.view;

  cmptInstance.render(RenderFlags.Update, cmptInstance, hostElVNode.children[0]);

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

function slotableStart(idx: number, name: string) {
  const groupVNode = (currentView.nodes[idx] = createVNode(
    VNodeType.Slotable,
    currentView,
    parentVNode,
    document.createDocumentFragment()
  ));
  parentVNode.children.push(groupVNode);

  // PERF(pk): this is static data, no need to store in bindings...
  groupVNode.data[0] = name;

  parentVNode = groupVNode;
}

function slotableEnd(idx: number) {
  const slotGroupVNode = currentView.nodes[idx];
  parentVNode = slotGroupVNode.parent;
}

function slot(idx: number) {
  const domEl = document.createComment(`content ${idx}`);
  const vNode = (currentView.nodes[idx] = createVNode(VNodeType.Slot, currentView, parentVNode, domEl));
  parentVNode.children.push(vNode);
  parentVNode.native.appendChild(domEl);
}

function findSlotables(containerVNode: VNode, slotName: string, result: VNode[]): VNode[] {
  for (let vNode of containerVNode.children) {
    if (vNode.type === VNodeType.Slotable && vNode.data[0] === slotName) {
      result.push(vNode);
    } else if (vNode.type === VNodeType.Container || vNode.type === VNodeType.View) {
      // PERF(pk): I could avoid recurrsion here
      findSlotables(vNode, slotName, result);
    }
  }
  return result;
}

function slotRefresh(idx: number, defaultSlotable: VNode, slotName?: string) {
  const slotVNode = currentView.nodes[idx];
  if (slotName) {
    const slotablesFound = findSlotables(defaultSlotable, slotName, []);
    if (slotablesFound.length > 0) {
      const renderParent = findRenderParent(slotVNode);
      for (const slotable of slotablesFound) {
        slotVNode.children.push(slotable);
        renderParent.native.insertBefore(slotable.native, slotVNode.native);
      }
    }
  } else {
    // PERF(pk): I could split it into 2 functions so it is better for tree-shaking
    // TODO(pk): need to add as a child of a slot
    // TODO(pk): write a test for render parent
    slotVNode.parent.native.insertBefore(defaultSlotable.native, slotVNode.native);
  }
}

function directive(hostIdx: number, directiveIdx: number, constructorFn) {
  const hostVNode = currentView.nodes[hostIdx];
  hostVNode.data[directiveIdx] = new constructorFn(hostVNode.native);
}

function directiveRefresh(hostIdx: number, directiveIdx: number) {
  const directiveInstance = currentView.nodes[hostIdx].data[directiveIdx];
  directiveInstance.refresh();
}

function render(nativeHost, tpl, ctx?) {
  const viewData: ViewData = { viewId: -1, nodes: [] };
  const hostVNode = createVNode(VNodeType.Element, viewData, null!, nativeHost);

  parentVNode = hostVNode;
  currentView = viewData;
  tpl(RenderFlags.CreateAndUpdate, ctx);

  currentView = null;
  parentVNode = hostVNode.parent;

  return function refreshFromRoot(ctx) {
    refreshView(hostVNode, tpl, ctx);
  };
}
