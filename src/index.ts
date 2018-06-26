interface VNode {
  parent: VNode;
  native: any; // TODO(pk): type it properly
  bindings: any[] // TODO(pk): storing bindings separatelly for each and every individual node might not be super-performant :-)
}

// INSANITY WARNING: global variables => think of passing context around
// those fields here are part of the view-specific context
let parentVNode: VNode;
let nodes: VNode[] = [];

function createVNode(parent: VNode, native) {
  // TODO(pk): lazy-init bindings array => or better yet, have the exact number of bindings handy :-)
  // TODO(pk): lazy-init views array
  return {parent: parent, native: native, bindings: []};
}

function elementStart(idx: number, tagName: string, attrs?: string[] | null) {
  const domEl = document.createElement(tagName);
  const vNode = nodes[idx] = createVNode(parentVNode, domEl);
  if (attrs) {
    for (var i = 0; i < attrs.length; i += 2) {
      domEl.setAttribute(attrs[i], attrs[i + 1]);
    }
  }
  if (parentVNode) {
    parentVNode.native.appendChild(domEl);
  }
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

function listener(elIdx: number, eventName: string, handlerFn) {
  // TODO(pk): I could avoid look-up here by storing "global" reference to a node being processed
  const vNode = nodes[elIdx];
  const domEl = vNode.native;

  // TODO(pk): do I need to cleanup?
  domEl.addEventListener(eventName, handlerFn);
}

function text(idx: number, value?: string) {
  const domEl = document.createTextNode(value != null ? value : '');
  nodes[idx] = createVNode(parentVNode, domEl);
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

const enum RenderFlags {
  Create = 0b01,
  Update = 0b10
}

function render(host, tpl, ctx?) {
  const hostVNode = parentVNode = createVNode(null!, host);
  tpl(RenderFlags.Create | RenderFlags.Update, ctx);
  return function (ctx) {
    parentVNode = hostVNode;
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