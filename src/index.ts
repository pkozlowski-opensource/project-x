/**
 * Data structure that holds data associated with a view.
 */
interface ViewData {
  viewId: number;
  /**
   * All the virtual nodes that are part of a given view/
   */
  nodes: VNode[];
  /**
   * Stores pointers to containers and component views present in this view so we can easily traverse views tree.
   * Currently this is only used for running lifecycle hooks.
   */
  subViews: (ContainerVNode | ViewVNode)[];
  /**
   * Pointer to an element that host a component creating this view hierarchy.
   */
  host: ElementVNode;
  /**
   * Pre-bound destroy functions that need to be called when destroying a given view.
   */
  destroyFns: (() => void)[];
  refresh: (ctx?: any) => void | null;
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
  children: VNode[] | null;
  native: any; // TODO(pk): type it properly
  data: any[]; // PERF(pk): storing bindings separately for each and every individual node might not be super-performant :-)

  /**
   * Each node is part of a view
   */
  view: ViewData;

  /**
   * Only applies to slotables and indicates projection target of a given node.
   */
  projectionParent: SlotVNode | null; // PERF: move it to a separate object
  /**
   * Nodes having components sitting on top of them have a pointer to a component's view
   */
  componentView: ViewVNode | null; // PERF: move it to a separate object
}

interface TextVNode extends VNode {
  type: VNodeType.Text;
  projectionParent: null;
  children: null;
  componentView: null;
}

interface ElementVNode extends VNode {
  type: VNodeType.Element;
  projectionParent: null;
  children: (ElementVNode | TextVNode | ContainerVNode | SlotVNode | SlotableVNode)[];
}

interface ContainerVNode extends VNode {
  type: VNodeType.Container;
  projectionParent: null;
  children: ViewVNode[];
  componentView: null;
}

interface ViewVNode extends VNode {
  type: VNodeType.View;
  parent: ContainerVNode;
  projectionParent: null;
  children: (ElementVNode | TextVNode | ContainerVNode | SlotVNode | SlotableVNode)[];
  componentView: null;
}

interface SlotVNode extends VNode {
  type: VNodeType.Slot;
  projectionParent: null;
  children: SlotableVNode[];
  componentView: null;
}

interface SlotableVNode extends VNode {
  type: VNodeType.Slotable;
  children: (ElementVNode | TextVNode | ContainerVNode | SlotVNode | SlotableVNode)[];
  componentView: null;
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
    projectionParent: null,
    children: type !== VNodeType.Text ? [] : null, // PERF(pk): lazy-init children array => or better yet, have the exact number of children handy :-)
    native: nativeOrNativeRenderParent,
    data: [], // PERF(pk): lazy-init data array => or better yet, have the exact number of bindings handy :-)
    componentView: null
  };
}

// INSANITY WARNING: global variables => think of passing context around
// those fields here are part of the view-specific context
let parentVNode: VNode;
let currentView: ViewData;

// ========= dom.ts
const NS = {
  SVG: 'http://www.w3.org/2000/svg'
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
    if (vNode.type === VNodeType.Element || vNode.type === VNodeType.View || vNode.type === VNodeType.Slotable) {
      return vNode.native;
    }
  }
  throw `Unexpected node of type ${vNode.type}`;
}

/**
 * Inserts a view or a slotable into the DOM given position of their respective container / slot.
 */
function insertGroupOfNodesIntoDOM(
  renderParent: any,
  groupContainer: ContainerVNode | SlotVNode,
  group: ViewVNode | SlotableVNode
) {
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

function removeGroupOfNodesFromDOM(viewOrSlotable: ViewVNode | SlotableVNode) {
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
    }
  }

  // reset render parent to indeicate that view or slotable is no longer inserted into the DOM
  viewOrSlotable.native = null;
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

  // nextViewIdx
  vNode.data[0] = 0;
  currentView.subViews.push(vNode as ContainerVNode);

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
  const domEl = document.createTextNode(value != null ? value : '');
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
    if (oldValue && className) {
      vNode.native.classList.replace(oldValue, className);
    } else if (!oldValue && className) {
      vNode.native.classList.add(className);
    } else if (oldValue) {
      vNode.native.classList.remove(oldValue);
    }
  }
}

function include(containerIdx: number, tplFn, ctx?) {
  const containerVNode = currentView.nodes[containerIdx] as ContainerVNode;

  if (checkAndUpdateBinding(containerVNode.data, 1, tplFn)) {
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
  const containerVNode = currentView.nodes[containerIdx];
  // reset nextViewIdx;
  containerVNode.data[0] = 0;
}

function destroyView(viewVNode: ViewVNode) {
  for (let viewOrContainer of viewVNode.view.subViews) {
    if (viewOrContainer.type === VNodeType.Container) {
      for (let subViewVnode of viewOrContainer.children) {
        destroyView(subViewVnode);
      }
    } else {
      destroyView(viewOrContainer);
    }
  }
  for (let destroyFn of viewVNode.view.destroyFns) {
    destroyFn();
  }
}

function containerRefreshEnd(containerIdx: number) {
  const containerVNode = currentView.nodes[containerIdx] as ContainerVNode;
  const nextViewIdx = containerVNode.data[0];
  const views = containerVNode.children;

  const remainingViewsCount = views.length - nextViewIdx;
  if (remainingViewsCount > 0) {
    const removedViews = views.splice(nextViewIdx, remainingViewsCount);
    for (let removedView of removedViews) {
      destroyView(removedView);
      removeGroupOfNodesFromDOM(removedView);
    }
  }
}

function findView(views: ViewVNode[], startIdx: number, viewIdx: number): VNode | undefined {
  let i = startIdx;
  while (i < views.length) {
    let viewVNode = views[i];
    if (viewVNode.view.viewId === viewIdx) {
      return viewVNode;
    } else if (viewVNode.view.viewId < viewIdx) {
      views.splice(i, 1);
      destroyView(viewVNode);
      removeGroupOfNodesFromDOM(viewVNode);
    }
    i++;
  }
}

function createViewVNode(viewId: number, parent: VNode, host: ElementVNode, renderParent = null): ViewVNode {
  const viewData = {
    viewId: viewId,
    nodes: [],
    subViews: [],
    host: host,
    destroyFns: [],
    refresh: parent ? parent.view.refresh : null
  };
  return createVNode(VNodeType.View, viewData, parent, renderParent) as ViewVNode;
}

function createHostBindingView(nativeEl: any): ViewVNode {
  const lView = createViewVNode(-1, null!, nativeEl);
  lView.view.nodes[0] = createVNode(VNodeType.Element, lView.view, lView, nativeEl);
  return lView;
}

function refreshView(viewVNode: VNode, viewFn, ctx?): void {
  executeViewFn(viewVNode, viewFn, RenderFlags.Update, ctx);
}

function enterView(viewVNode: VNode): ViewData {
  const oldView = currentView;

  parentVNode = viewVNode;
  currentView = viewVNode.view;

  return oldView;
}

function executeViewFn(viewVNode: VNode, viewFn, flags: RenderFlags, ctx) {
  const oldView = enterView(viewVNode);

  viewFn(flags, ctx, viewVNode.view.refresh);

  currentView = oldView;
  parentVNode = viewVNode.parent;
}

function executeDirectiveHostFn(hostElVNode: VNode, directiveHostViewVnode: VNode, directiveInstance, rf: RenderFlags) {
  const oldView = enterView(directiveHostViewVnode);

  directiveInstance.host(rf);

  currentView = oldView;
  parentVNode = hostElVNode;
}

function executeComponentRenderFn(hostElVNode: VNode, cmptViewVNode: VNode, cmptInstance, flags: RenderFlags) {
  const oldView = enterView(cmptViewVNode);

  cmptInstance.render(flags);

  currentView = oldView;
  parentVNode = hostElVNode.parent;
}

function createAndRefreshView(containerVNode: ContainerVNode, viewIdx: number, viewId: number, viewFn, ctx?) {
  const renderParent = findRenderParent(containerVNode);
  const viewVNode = (parentVNode = createViewVNode(viewId, containerVNode, containerVNode.view.host, renderParent));

  containerVNode.children.splice(viewIdx, 0, viewVNode);

  executeViewFn(viewVNode, viewFn, RenderFlags.CreateAndUpdate, ctx);

  if (renderParent) {
    insertGroupOfNodesIntoDOM(renderParent, containerVNode, viewVNode);
  }
}

// PERF(pk): this instruction will re-create a closure in each and every change detection cycle
function view(containerIdx: number, viewId: number, viewFn, ctx?) {
  const containerVNode = currentView.nodes[containerIdx] as ContainerVNode;
  const nextViewIdx = containerVNode.data[0];
  const existingVNode = findView(containerVNode.children, nextViewIdx, viewId);

  if (existingVNode) {
    refreshView(existingVNode, viewFn, ctx);
  } else {
    createAndRefreshView(containerVNode, nextViewIdx, viewId, viewFn, ctx);
  }

  containerVNode.data[0]++;
}

function componentStart(idx: number, tagName: string, constructorFn, attrs?: string[]) {
  const domEl = document.createElement(tagName);
  const hostElVNode = (currentView.nodes[idx] = createVNode(VNodeType.Element, currentView, parentVNode, domEl));
  parentVNode.children.push(hostElVNode);

  setNativeAttributes(domEl, attrs);
  appendNativeNode(parentVNode, hostElVNode);

  // TODO(pk): think of moving constructorFn argument to componentEnd so I don't have to store it
  hostElVNode.data[0] = constructorFn;
  hostElVNode.children[0] = parentVNode = createVNode(VNodeType.Slotable, currentView, hostElVNode, null);
}

interface SlotablesApi {
  getDefaultSlotable(): SlotableVNode;
  getSlotables(name: string): SlotableVNode[];
}

class SlotablesApiImpl implements SlotablesApi {
  constructor(private _defaultSlotable: SlotableVNode) {}

  getDefaultSlotable(): SlotableVNode {
    return this._defaultSlotable;
  }

  getSlotables(name: string): SlotableVNode[] {
    return findSlotables(this._defaultSlotable, name, []);
  }
}

function componentEnd(hostElIdx: number) {
  const hostElVNode = currentView.nodes[hostElIdx] as ElementVNode;
  const constructorFn = hostElVNode.data[0];
  const componentViewNode = (hostElVNode.componentView = createViewVNode(
    -1,
    hostElVNode,
    hostElVNode,
    hostElVNode.native
  ));
  const defaultSlotable = hostElVNode.children[0] as SlotableVNode;
  // TALK(bl): should we support change of component's constructor function?
  // what would be the impact of this on the host and its name / type?
  // also type of supported children could be different...
  const cmptInstance = (hostElVNode.data[0] = new constructorFn(
    hostElVNode.native,
    componentViewNode.view.refresh,
    new SlotablesApiImpl(defaultSlotable)
  ));

  // register new component view so we can descend into it while calling destroy lifecycle hooks
  currentView.subViews.push(componentViewNode);
  // register destroy lifecycle hook of the component itself
  if (cmptInstance.destroy) {
    currentView.destroyFns.push(cmptInstance.destroy.bind(cmptInstance));
  }

  if (cmptInstance.host) {
    hostElVNode.data[1] = createHostBindingView(hostElVNode.native);
    executeDirectiveHostFn(hostElVNode, hostElVNode.data[1], cmptInstance, RenderFlags.Create);
  }
  executeComponentRenderFn(hostElVNode, componentViewNode, cmptInstance, RenderFlags.Create);
}

function component(idx: number, tagName: string, constructorFn, attrs?: string[]) {
  componentStart(idx, tagName, constructorFn, attrs);
  componentEnd(idx);
}

function componentRefresh(hostElIdx: number) {
  const hostElVNode = currentView.nodes[hostElIdx];
  const cmptInstance = hostElVNode.data[0];

  if (cmptInstance.host) {
    executeDirectiveHostFn(hostElVNode, hostElVNode.data[0 + 1], cmptInstance, RenderFlags.Update);
  }
  executeComponentRenderFn(hostElVNode, hostElVNode.componentView, cmptInstance, RenderFlags.Update);
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

function slotableStart(idx: number, name: string, ConstructorFn?) {
  const groupVNode = (currentView.nodes[idx] = createVNode(VNodeType.Slotable, currentView, parentVNode, null));
  parentVNode.children.push(groupVNode);

  // PERF(pk): this is static data, no need to store in bindings...
  groupVNode.data[0] = name;
  if (ConstructorFn) {
    groupVNode.data[1] = new ConstructorFn();
  }

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

function findSlotables(
  slotableOrView: SlotableVNode | ViewVNode,
  slotName: string,
  result: SlotableVNode[] = []
): SlotableVNode[] {
  for (let vNode of slotableOrView.children) {
    if (vNode.type === VNodeType.Slotable && vNode.data[0] === slotName) {
      result.push(vNode);
    } else if (vNode.type === VNodeType.Container) {
      for (let view of vNode.children) {
        findSlotables(view, slotName, result);
      }
    }
  }
  return result;
}

function attachSlotable(renderParent: any, slot: SlotVNode, slotable: SlotableVNode) {
  slot.children.push(slotable);
  slotable.projectionParent = slot;

  // slotables can be only inserted into the DOM only if the slot was already inserted
  if (renderParent) {
    insertGroupOfNodesIntoDOM(renderParent, slot, slotable);
  }
}

function detachSlotable(previousSlot: SlotVNode, slotable: SlotableVNode) {
  const prevChildIdx = previousSlot.children.indexOf(slotable);

  if (prevChildIdx > -1) {
    previousSlot.children.splice(prevChildIdx, 1);
  } else {
    // TODO: only in dev mode
    throw `parent points to a slot but slotable not found in the collection`;
  }

  slotable.projectionParent = null;

  if (slotable.native) {
    removeGroupOfNodesFromDOM(slotable);
  }
}

function appendSlotable(renderParent: any, slot: SlotVNode, slotable: SlotableVNode) {
  if (slotable.projectionParent !== slot) {
    // detach from previous slot
    if (slotable.projectionParent) {
      detachSlotable(slotable.projectionParent, slotable);
    }

    // attach to the new slot
    attachSlotable(renderParent, slot, slotable);
  }
}

function slotRefreshImperative(idx: number, slotable: SlotableVNode | null) {
  const slotVNode = currentView.nodes[idx] as SlotVNode;
  const renderParent = findRenderParent(slotVNode);

  if (slotable) {
    appendSlotable(renderParent, slotVNode, slotable);
  } else {
    if (slotVNode.children.length) {
      detachSlotable(slotVNode, slotVNode.children[0]);
    }
  }
}

// PERF(pk): split into 2 functions (default, named) for better tree-shaking
function slotRefresh(idx: number, slotName?: string) {
  const slotVNode = currentView.nodes[idx] as SlotVNode;
  const defaultSlotable = currentView.host.children[0] as SlotableVNode;
  const renderParent = findRenderParent(slotVNode);
  if (slotName) {
    const slotablesFound = findSlotables(defaultSlotable, slotName);
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
  const directiveInstance = (hostVNode.data[directiveIdx] = new constructorFn(hostVNode.native, currentView.refresh));

  if (directiveInstance.destroy) {
    currentView.destroyFns.push(directiveInstance.destroy.bind(directiveInstance));
  }

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
  const viewVNode = createViewVNode(-1, null!, null!, nativeHost);
  viewVNode.view.refresh = function refreshFromRoot(refreshCtx?) {
    refreshView(viewVNode, tplFn, refreshCtx !== undefined ? refreshCtx : ctx);
  };

  executeViewFn(viewVNode, tplFn, RenderFlags.CreateAndUpdate, ctx);

  return viewVNode.view.refresh;
}
