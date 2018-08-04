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
  /**
   * Only applies to slotables and indicates projection target of a given node.
   */
  renderParent: VNode;
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

function createVNode(type: VNodeType, view: ViewData, parent: VNode, nativeOrNativeRenderParent): VNode {
  return {
    type: type,
    view: view,
    parent: parent,
    renderParent: null,
    children: [], // PERF(pk): lazy-init children array => or better yet, have the exact number of children handy :-)
    native: nativeOrNativeRenderParent,
    data: [], // PERF(pk): lazy-init data array => or better yet, have the exact number of bindings handy :-)
    componentView: null
  };
}

// INSANITY WARNING: global variables => think of passing context around
// those fields here are part of the view-specific context
let parentVNode: VNode;
let nextViewIdx = 0; // TODO(pk): this can't be global as it won't work for nested containers

let currentView: ViewData;

// ========= dom.ts
const NS = {
  SVG: "http://www.w3.org/2000/svg"
};

function setNativeAttributes(domEl, attrs?: string[] | null) {
  if (attrs) {
    for (let i = 0; i < attrs.length; i += 2) {
      domEl.setAttribute(attrs[i], attrs[i + 1]);
    }
  }
}

function setNativeAttributesNS(domEl, nsURI: string | null, attrs?: string[] | null) {
  if (attrs) {
    for (let i = 0; i < attrs.length; i += 2) {
      domEl.setAttributeNS(nsURI, attrs[i], attrs[i + 1]);
    }
  }
}

function appendNativeNode(parent: VNode, node: VNode) {
  // possible values: Element, View, Slotable
  if (parent.type === VNodeType.Element) {
    parent.native.appendChild(node.native);
  } else if (parent.type === VNodeType.View) {
    // If view has already its render parent determined (as it is a child of an element
    // or another view that was already inserted) we can append DOM node.
    // Otherwise insertion is delayed till a view is added to the DOM.
    if (parent.native) {
      const viewParent = parent.parent;
      if (viewParent && viewParent.type === VNodeType.Container) {
        // embedded view
        parent.native.insertBefore(node.native, viewParent.native);
      } else {
        // component view or root view
        parent.native.appendChild(node.native);
      }
    }
  }
}

function findRenderParent(vNode: VNode): VNode | null {
  while ((vNode = vNode.parent)) {
    if (vNode.type === VNodeType.Element) {
      return vNode.native;
    } else if (vNode.type === VNodeType.View || vNode.type === VNodeType.Slotable) {
      return vNode.native;
    }
  }
  throw `Unexpected node of type ${vNode.type}`;
}

/**
 * Inserts a view or a slotable into the DOM given position of their respective container / slot.
 */
function insertGroupOfNodesIntoDOM(renderParent: any, groupContainer: VNode, group: VNode) {
  // append to DOM only if not already inserted before or changing render parent
  // TODO(pk): this doesn't take into account cases where view / slotable moves inside the same render parent!
  if (!group.native || group.native !== renderParent) {
    group.native = renderParent;
    for (const vNode of group.children) {
      if (vNode.type === VNodeType.Container || vNode.type === VNodeType.Slot) {
        renderParent.insertBefore(vNode.native, groupContainer.native);
        for (const viewOrSlotableVNode of vNode.children) {
          insertGroupOfNodesIntoDOM(renderParent, vNode, viewOrSlotableVNode);
        }
      } else if (vNode.type !== VNodeType.Slotable) {
        renderParent.insertBefore(vNode.native, groupContainer.native);
      }
    }
  }
}

function removeGroupOfNodesFromDOM(viewOrSlotable: VNode) {
  for (let node of viewOrSlotable.children) {
    if (node.type === VNodeType.Element || node.type === VNodeType.Text) {
      viewOrSlotable.native.removeChild(node.native);
    } else if (node.type === VNodeType.Container || node.type === VNodeType.Slot) {
      for (let child of node.children) {
        removeGroupOfNodesFromDOM(child);
      }
      // remove comment node of a container but only if a view defining this container was inserted into the DOM
      // it might happen that the comment node never makes it into the DOM for cotainers that are at the root of
      // slotables (and are there to define other slotables)
      if (viewOrSlotable.native) {
        viewOrSlotable.native.removeChild(node.native);
      }
    } else if (node.type === VNodeType.Slotable) {
      removeGroupOfNodesFromDOM(node);
    } else {
      throw `Unexpected node type ${node.type} when removing nodes from the DOM`;
    }
  }

  // reset render parent to indeicate that view or slotable is no longer inserted into the DOM
  viewOrSlotable.native = null;
  viewOrSlotable.renderParent = null;
}

// =========

function elementStart(idx: number, tagName: string, attrs?: string[] | null) {
  const domEl = document.createElement(tagName);
  const vNode = (currentView.nodes[idx] = createVNode(VNodeType.Element, currentView, parentVNode, domEl));

  parentVNode.children.push(vNode);

  setNativeAttributes(domEl, attrs);
  appendNativeNode(parentVNode, vNode);

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

function elementNSStart(
  idx: number,
  nsURI: string,
  tagName: string,
  attrs?: string[] | null,
  nsAttrs?: string[] | null
) {
  const domEl = document.createElementNS(nsURI, tagName);
  const vNode = (currentView.nodes[idx] = createVNode(VNodeType.Element, currentView, parentVNode, domEl));

  parentVNode.children.push(vNode);

  setNativeAttributes(domEl, attrs);
  setNativeAttributesNS(domEl, nsURI, nsAttrs);
  appendNativeNode(parentVNode, vNode);

  parentVNode = vNode;
}

function elementNS(idx: number, nsURI: string, tagName: string, attrs?: string[] | null, nsAttrs?: string[] | null) {
  elementNSStart(idx, nsURI, tagName, attrs, nsAttrs);
  elementEnd(idx);
}

function container(idx: number) {
  const domEl = document.createComment(`container ${idx}`);
  const vNode = (currentView.nodes[idx] = createVNode(VNodeType.Container, currentView, parentVNode, domEl));

  parentVNode.children.push(vNode);
  appendNativeNode(parentVNode, vNode);
}

function listener(elIdx: number, bindIdx: number, eventName: string) {
  // PERF(pk): I could avoid look-up here by storing "global" reference to a node being processed
  const vNode = currentView.nodes[elIdx];
  const domEl = vNode.native;

  // TODO(pk): cleanup on view destroy
  domEl.addEventListener(eventName, function($event) {
    // TODO(pk): assert on presence
    vNode.data[bindIdx]($event);
  });
}

// PERF(pk): this instruction means re-creating closure for a handler function on each change detection :-/
// it "costs" 64 bytes per listener (Chrome, OSX)
function listenerRefresh(elIdx: number, bindIdx: number, handlerFn) {
  const vNode = currentView.nodes[elIdx];
  vNode.data[bindIdx] = handlerFn;
}

function text(idx: number, value?: string) {
  const domEl = document.createTextNode(value != null ? value : "");
  const vNode = (currentView.nodes[idx] = createVNode(VNodeType.Text, currentView, parentVNode, domEl));

  parentVNode.children.push(vNode);
  appendNativeNode(parentVNode, vNode);
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

function bindText(vNodeIdx: number, newValue: string) {
  const vNode = currentView.nodes[vNodeIdx];
  if (checkAndUpdateBinding(vNode.data, 0, newValue)) {
    vNode.native.textContent = newValue;
  }
}

function bindProperty(vNodeIdx: number, bindIdx: number, propName: string, newValue: any) {
  const vNode = currentView.nodes[vNodeIdx];
  if (checkAndUpdateBinding(vNode.data, bindIdx, newValue)) {
    vNode.native[propName] = newValue;
  }
}

/**
 * Sets a native attribue for a give {@link VNode}. Useful for static host bindings and one-time bindings.
 */
function setAttribute(vNodeIdx: number, attrName: string, value: string) {
  const vNode = currentView.nodes[vNodeIdx];
  vNode.native.setAttribute(attrName, value);
}

function setAttributes(vNodeIdx: number, attrNameVals: string[]) {
  const vNode = currentView.nodes[vNodeIdx];
  setNativeAttributes(vNode.native, attrNameVals);
}

function setCSSClass(vNodeIdx: number, className: string) {
  const vNode = currentView.nodes[vNodeIdx];
  vNode.native.classList.add(className);
}

function setCSSClasses(vNodeIdx: number, classNames: string[]) {
  const vNode = currentView.nodes[vNodeIdx];
  for (let cssClassName of classNames) {
    vNode.native.classList.add(cssClassName);
  }
}

function bindAttribute(vNodeIdx: number, bindIdx: number, attrName: string, newValue: string) {
  const vNode = currentView.nodes[vNodeIdx];
  if (checkAndUpdateBinding(vNode.data, bindIdx, newValue)) {
    vNode.native.setAttribute(attrName, newValue);
  }
}

function bindClass(vNodeIdx: number, bindIdx: number, className: string, toogleState: boolean) {
  const vNode = currentView.nodes[vNodeIdx];
  if (checkAndUpdateBinding(vNode.data, bindIdx, toogleState)) {
    vNode.native.classList.toggle(className, toogleState);
  }
}

function replaceClass(vNodeIdx: number, bindIdx: number, className: string) {
  const vNode = currentView.nodes[vNodeIdx];
  const oldValue = vNode.data[bindIdx];
  if (checkAndUpdateBinding(vNode.data, bindIdx, className)) {
    if (oldValue) {
      vNode.native.classList.replace(oldValue, className);
    } else {
      vNode.native.classList.add(className);
    }
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
      removeGroupOfNodesFromDOM(existingViewVNode);
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

function containerRefreshEnd(containerIdx: number) {
  const containerVNode = currentView.nodes[containerIdx];
  const views = containerVNode.children;

  const remainingViewsCount = views.length - nextViewIdx;
  if (remainingViewsCount > 0) {
    const removedViews = views.splice(nextViewIdx, remainingViewsCount);
    for (let removedView of removedViews) {
      removeGroupOfNodesFromDOM(removedView);
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
      removeGroupOfNodesFromDOM(viewVNode);
    }
    i++;
  }
}

function createViewVNode(viewId: number, parent: VNode, renderParent = null) {
  const viewData = { viewId: viewId, nodes: [] };
  return createVNode(VNodeType.View, viewData, parent, renderParent);
}

function createHostBindingView(nativeEl: any): VNode {
  const lView = createViewVNode(-1, null!, nativeEl);
  // TODO(pk): do I need a dedicated VNode?
  lView.view.nodes[0] = createVNode(VNodeType.Element, lView.view, lView, nativeEl);
  return lView;
}

function refreshView(viewVNode: VNode, viewFn, ctx?) {
  executeViewFn(viewVNode, viewFn, RenderFlags.Update, ctx);
}

function enterView(viewVNode: VNode): ViewData {
  const oldView = currentView;

  parentVNode = viewVNode;
  currentView = viewVNode.view;

  return oldView;
}

function executeViewFn(viewVNode: VNode, viewFn, flags: RenderFlags, ctx?) {
  const oldView = enterView(viewVNode);

  viewFn(flags, ctx);

  currentView = oldView;
  parentVNode = viewVNode.parent;
}

function executeDirectiveHostFn(hostElVNode: VNode, directiveHostViewVnode: VNode, directiveInstance, rf: RenderFlags) {
  const oldView = enterView(directiveHostViewVnode);

  directiveInstance.host(rf);

  currentView = oldView;
  parentVNode = hostElVNode;
}

function executeComponentRenderFn(
  hostElVNode: VNode,
  cmptViewVNode: VNode,
  cmptInstance,
  flags: RenderFlags,
  content?
) {
  const oldView = enterView(cmptViewVNode);

  cmptInstance.render(flags, cmptInstance, content);

  currentView = oldView;
  parentVNode = hostElVNode.parent;
}

function createAndRefreshView(containerVNode: VNode, viewIdx: number, viewId: number, viewFn, ctx?) {
  const renderParent = findRenderParent(containerVNode);
  const viewVNode = (parentVNode = createViewVNode(viewId, containerVNode, renderParent));

  containerVNode.children.splice(viewIdx, 0, viewVNode);

  executeViewFn(viewVNode, viewFn, RenderFlags.CreateAndUpdate, ctx);

  if (renderParent) {
    insertGroupOfNodesIntoDOM(renderParent, containerVNode, viewVNode);
  }
}

// PERF(pk): this instruction will re-create a closure in each and every change detection cycle
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

  setNativeAttributes(domEl, attrs);
  appendNativeNode(parentVNode, hostElVNode);

  componentForHostStart(idx, constructorFn);
}

function componentEnd(hostElIdx: number) {
  const hostElVNode = currentView.nodes[hostElIdx];
  const cmptInstance = hostElVNode.data[0];
  const componentViewNode = createViewVNode(-1, hostElVNode, hostElVNode.native);

  if (cmptInstance.host) {
    executeDirectiveHostFn(hostElVNode, hostElVNode.data[1], cmptInstance, RenderFlags.Create);
  }

  executeComponentRenderFn(hostElVNode, componentViewNode, cmptInstance, RenderFlags.Create);
  hostElVNode.componentView = componentViewNode;
}

function component(idx: number, tagName: string, constructorFn, attrs?: string[] | null) {
  componentStart(idx, tagName, constructorFn, attrs);
  componentEnd(idx);
}

function componentForHostStart(hostElIdx: number, constructorFn) {
  const hostElVNode = currentView.nodes[hostElIdx];
  const cmptInstance = (hostElVNode.data[0] = new constructorFn());
  const groupVNode = createVNode(VNodeType.Slotable, currentView, hostElVNode, null);

  if (cmptInstance.host) {
    hostElVNode.data[1] = createHostBindingView(hostElVNode.native);
  }

  hostElVNode.children[0] = groupVNode;
  parentVNode = groupVNode;
}

function componentForHost(hostElIdx: number, constructorFn) {
  componentForHostStart(hostElIdx, constructorFn);
  componentEnd(hostElIdx);
}

function componentRefresh(hostElIdx: number) {
  const hostElVNode = currentView.nodes[hostElIdx];
  const cmptInstance = hostElVNode.data[0];

  if (cmptInstance.host) {
    executeDirectiveHostFn(hostElVNode, hostElVNode.data[0 + 1], cmptInstance, RenderFlags.Update);
  }
  executeComponentRenderFn(
    hostElVNode,
    hostElVNode.componentView,
    cmptInstance,
    RenderFlags.Update,
    hostElVNode.children[0]
  );
}

function load<T>(nodeIdx: number, dataIdx: number): T {
  const vNode = currentView.nodes[nodeIdx];
  return vNode.data[dataIdx] as T;
}

function loadElementRef(nodeIdx: number) {
  const vNode = currentView.nodes[nodeIdx];
  return vNode.native;
}

function input(hostElIdx: number, bindIdx: number, newValue: any): boolean {
  const vNode = currentView.nodes[hostElIdx];
  return checkAndUpdateBinding(vNode.data, bindIdx, newValue);
}

function slotableStart(idx: number, name: string) {
  const groupVNode = (currentView.nodes[idx] = createVNode(VNodeType.Slotable, currentView, parentVNode, null));
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
  const domEl = document.createComment(`slot ${idx}`);
  const vNode = (currentView.nodes[idx] = createVNode(VNodeType.Slot, currentView, parentVNode, domEl));

  parentVNode.children.push(vNode);
  appendNativeNode(parentVNode, vNode);
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

function appendSlotable(renderParent: any, slot: VNode, slotable: VNode) {
  slot.children.push(slotable);
  // was is it attatched somewhere else before?
  // THINK(pk): the logic below means that we would be "stealing" nodes if there are duplicate insertion points
  // this is probaby fine as we should never have this situation in a properly written application
  if (slotable.renderParent && slotable.renderParent !== slot) {
    const previousSlot = slotable.renderParent;
    const prevChildIdx = previousSlot.children.indexOf(slotable);
    if (prevChildIdx > -1) {
      previousSlot.children.splice(prevChildIdx, 1);
    } else {
      throw `parent points to a slot but slotable not found in the collection`;
    }
  }
  slotable.renderParent = slot;
  // slotables can be only inserted into already inserted slots
  if (renderParent) {
    insertGroupOfNodesIntoDOM(renderParent, slot, slotable);
  }
}

function slotRefresh(idx: number, defaultSlotable: VNode, slotName?: string) {
  const slotVNode = currentView.nodes[idx];
  const renderParent = findRenderParent(slotVNode);

  // PERF(pk): split into 2 functions for better tree-shaking
  if (slotName) {
    const slotablesFound = findSlotables(defaultSlotable, slotName, []);
    if (slotablesFound.length > 0) {
      for (const slotable of slotablesFound) {
        appendSlotable(renderParent, slotVNode, slotable);
      }
    }
  } else {
    appendSlotable(renderParent, slotVNode, defaultSlotable);
  }
}

function directive(hostIdx: number, directiveIdx: number, constructorFn) {
  const hostVNode = currentView.nodes[hostIdx];
  const directiveInstance = (hostVNode.data[directiveIdx] = new constructorFn(hostVNode.native));

  // PERF(pk): split into 2 instructions so I don't have to do this checking at runtime and have smaller generated code?
  if (directiveInstance.host) {
    const hostView = (hostVNode.data[directiveIdx + 1] = createHostBindingView(hostVNode.native));
    executeDirectiveHostFn(hostVNode, hostView, directiveInstance, RenderFlags.Create);
  }
}

function directiveRefresh(hostIdx: number, directiveIdx: number) {
  const hostElVNode = currentView.nodes[hostIdx];
  const directiveInstance = hostElVNode.data[directiveIdx];

  if (directiveInstance.host) {
    executeDirectiveHostFn(hostElVNode, hostElVNode.data[directiveIdx + 1], directiveInstance, RenderFlags.Update);
  }
  if (directiveInstance.refresh) {
    directiveInstance.refresh();
  }
}

function render(nativeHost, tplFn, ctx?) {
  const viewVNode = createViewVNode(-1, null!, nativeHost);
  executeViewFn(viewVNode, tplFn, RenderFlags.CreateAndUpdate, ctx);
  return function refreshFromRoot(ctx?) {
    refreshView(viewVNode, tplFn, ctx);
  };
}
