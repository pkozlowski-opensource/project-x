(function () {
    'use strict';

    function checkAndUpdateBinding(bindings, bindIdx, newValue) {
        if (bindIdx > bindings.length) {
            bindings[bindIdx] = newValue;
            return true;
        }
        else {
            var oldValue = bindings[bindIdx];
            if (oldValue !== newValue) {
                bindings[bindIdx] = newValue;
                return true;
            }
        }
        return false;
    }

    function setNativeAttributes(domEl, attrs) {
        if (attrs) {
            for (var i = 0; i < attrs.length; i += 2) {
                domEl.setAttribute(attrs[i], attrs[i + 1]);
            }
        }
    }

    function createVNode(type, view, parent, nativeOrNativeRenderParent) {
        return {
            type: type,
            view: view,
            parent: parent,
            projectionParent: null,
            children: type !== 0 /* Text */ ? [] : null,
            native: nativeOrNativeRenderParent,
            data: [],
            componentView: null
        };
    }
    function appendNativeNode(parent, node) {
        if (parent.type === 1 /* Element */) {
            parent.native.appendChild(node.native);
        }
        else if (parent.type === 3 /* View */) {
            // If view has already its render parent determined (as it is a child of an element
            // or another view that was already inserted) we can append DOM node.
            // Otherwise insertion is delayed till a view is added to the DOM.
            if (parent.native) {
                var viewParent = parent.parent;
                if (viewParent && viewParent.type === 2 /* Container */) {
                    // embedded view
                    parent.native.insertBefore(node.native, viewParent.native);
                }
                else {
                    // component view or root view
                    parent.native.appendChild(node.native);
                }
            }
        }
    }
    function findRenderParent(vNode) {
        while ((vNode = vNode.parent)) {
            if (vNode.type === 1 /* Element */ || vNode.type === 3 /* View */ || vNode.type === 5 /* Slotable */) {
                return vNode.native;
            }
        }
        throw "Unexpected node of type " + vNode.type;
    }
    /**
     * Inserts a view or a slotable into the DOM given position of their respective container / slot.
     */
    function insertGroupOfNodesIntoDOM(renderParent, groupContainer, group) {
        // append to DOM only if not already inserted before or changing render parent
        // TODO(pk): this doesn't take into account cases where view / slotable moves inside the same render parent!
        if (!group.native || group.native !== renderParent) {
            group.native = renderParent;
            for (var _i = 0, _a = group.children; _i < _a.length; _i++) {
                var vNode = _a[_i];
                if (vNode.type === 2 /* Container */ || vNode.type === 4 /* Slot */) {
                    renderParent.insertBefore(vNode.native, groupContainer.native);
                    for (var _b = 0, _c = vNode.children; _b < _c.length; _b++) {
                        var viewOrSlotableVNode = _c[_b];
                        insertGroupOfNodesIntoDOM(renderParent, vNode, viewOrSlotableVNode);
                    }
                }
                else if (vNode.type !== 5 /* Slotable */) {
                    renderParent.insertBefore(vNode.native, groupContainer.native);
                }
            }
        }
    }
    function removeGroupOfNodesFromDOM(viewOrSlotable) {
        for (var _i = 0, _a = viewOrSlotable.children; _i < _a.length; _i++) {
            var node = _a[_i];
            if (node.type === 1 /* Element */ || node.type === 0 /* Text */) {
                viewOrSlotable.native.removeChild(node.native);
            }
            else if (node.type === 2 /* Container */ || node.type === 4 /* Slot */) {
                for (var _b = 0, _c = node.children; _b < _c.length; _b++) {
                    var child = _c[_b];
                    removeGroupOfNodesFromDOM(child);
                }
                // remove comment node of a container but only if a view defining this container was inserted into the DOM
                // it might happen that the comment node never makes it into the DOM for cotainers that are at the root of
                // slotables (and are there to define other slotables)
                if (viewOrSlotable.native) {
                    viewOrSlotable.native.removeChild(node.native);
                }
            }
            else if (node.type === 5 /* Slotable */) {
                removeGroupOfNodesFromDOM(node);
            }
        }
        // reset render parent to indeicate that view or slotable is no longer inserted into the DOM
        viewOrSlotable.native = null;
    }

    // INSANITY WARNING: global variables => think of passing context around
    // those fields here are part of the view-specific context
    var parentVNode;
    var currentView;
    function elementStart(idx, tagName, attrs) {
        var domEl = document.createElement(tagName);
        var vNode = (currentView.nodes[idx] = createVNode(1 /* Element */, currentView, parentVNode, domEl));
        parentVNode.children.push(vNode);
        setNativeAttributes(domEl, attrs);
        appendNativeNode(parentVNode, vNode);
        parentVNode = vNode;
    }
    // PERF(pk): would be possible to get rid of the idx argument here
    function elementEnd(idx) {
        parentVNode = currentView.nodes[idx].parent;
    }
    function element(idx, tagName, attrs) {
        elementStart(idx, tagName, attrs);
        elementEnd(idx);
    }
    function container(idx) {
        var domEl = document.createComment("container " + idx);
        var vNode = (currentView.nodes[idx] = createVNode(2 /* Container */, currentView, parentVNode, domEl));
        // nextViewIdx
        vNode.data[0] = 0;
        currentView.subViews.push(vNode);
        parentVNode.children.push(vNode);
        appendNativeNode(parentVNode, vNode);
    }
    function listener(elIdx, bindIdx, eventName) {
        // PERF(pk): I could avoid look-up here by storing "global" reference to a node being processed
        var vNode = currentView.nodes[elIdx];
        var domEl = vNode.native;
        // TODO(pk): cleanup on view destroy
        domEl.addEventListener(eventName, function ($event) {
            // TODO(pk): assert on presence
            vNode.data[bindIdx]($event);
        });
    }
    // PERF(pk): this instruction means re-creating closure for a handler function on each change detection :-/
    // it "costs" 64 bytes per listener (Chrome, OSX)
    function listenerRefresh(elIdx, bindIdx, handlerFn) {
        var vNode = currentView.nodes[elIdx];
        vNode.data[bindIdx] = handlerFn;
    }
    function text(idx, value) {
        var domEl = document.createTextNode(value != null ? value : '');
        var vNode = (currentView.nodes[idx] = createVNode(0 /* Text */, currentView, parentVNode, domEl));
        parentVNode.children.push(vNode);
        appendNativeNode(parentVNode, vNode);
    }
    function bindText(vNodeIdx, newValue) {
        var vNode = currentView.nodes[vNodeIdx];
        if (checkAndUpdateBinding(vNode.data, 0, newValue)) {
            vNode.native.textContent = newValue;
        }
    }
    function bindProperty(vNodeIdx, bindIdx, propName, newValue) {
        var vNode = currentView.nodes[vNodeIdx];
        if (checkAndUpdateBinding(vNode.data, bindIdx, newValue)) {
            vNode.native[propName] = newValue;
        }
    }
    /**
     * Sets a native attribue for a give {@link VNode}. Useful for static host bindings and one-time bindings.
     */
    function setAttribute(vNodeIdx, attrName, value) {
        var vNode = currentView.nodes[vNodeIdx];
        vNode.native.setAttribute(attrName, value);
    }
    function setCSSClass(vNodeIdx, className) {
        var vNode = currentView.nodes[vNodeIdx];
        vNode.native.classList.add(className);
    }
    function bindAttribute(vNodeIdx, bindIdx, attrName, newValue) {
        var vNode = currentView.nodes[vNodeIdx];
        if (checkAndUpdateBinding(vNode.data, bindIdx, newValue)) {
            vNode.native.setAttribute(attrName, newValue);
        }
    }
    function bindClass(vNodeIdx, bindIdx, className, toogleState) {
        var vNode = currentView.nodes[vNodeIdx];
        if (checkAndUpdateBinding(vNode.data, bindIdx, toogleState)) {
            vNode.native.classList.toggle(className, toogleState);
        }
    }
    function replaceClass(vNodeIdx, bindIdx, className) {
        var vNode = currentView.nodes[vNodeIdx];
        var oldValue = vNode.data[bindIdx];
        if (checkAndUpdateBinding(vNode.data, bindIdx, className)) {
            if (oldValue && className) {
                vNode.native.classList.replace(oldValue, className);
            }
            else if (!oldValue && className) {
                vNode.native.classList.add(className);
            }
            else if (oldValue) {
                vNode.native.classList.remove(oldValue);
            }
        }
    }
    function include(containerIdx, tplFn, ctx) {
        var containerVNode = currentView.nodes[containerIdx];
        if (checkAndUpdateBinding(containerVNode.data, 1, tplFn)) {
            var views = containerVNode.children;
            var existingViewVNode = views[0];
            // remove if already exists
            if (existingViewVNode) {
                views.splice(0, 1);
                removeGroupOfNodesFromDOM(existingViewVNode);
            }
            // re-create (unless it is null)
            if (tplFn) {
                createAndRefreshView(containerVNode, 0, -1, tplFn, ctx);
            }
        }
        else {
            refreshView(containerVNode.children[0], tplFn, ctx);
        }
    }
    function containerRefreshStart(containerIdx) {
        var containerVNode = currentView.nodes[containerIdx];
        // reset nextViewIdx;
        containerVNode.data[0] = 0;
    }
    function destroyView(viewVNode) {
        for (var _i = 0, _a = viewVNode.view.subViews; _i < _a.length; _i++) {
            var viewOrContainer = _a[_i];
            if (viewOrContainer.type === 2 /* Container */) {
                for (var _b = 0, _c = viewOrContainer.children; _b < _c.length; _b++) {
                    var subViewVnode = _c[_b];
                    destroyView(subViewVnode);
                }
            }
            else {
                destroyView(viewOrContainer);
            }
        }
        for (var _d = 0, _e = viewVNode.view.destroyFns; _d < _e.length; _d++) {
            var destroyFn = _e[_d];
            destroyFn();
        }
    }
    function containerRefreshEnd(containerIdx) {
        var containerVNode = currentView.nodes[containerIdx];
        var nextViewIdx = containerVNode.data[0];
        var views = containerVNode.children;
        var remainingViewsCount = views.length - nextViewIdx;
        if (remainingViewsCount > 0) {
            var removedViews = views.splice(nextViewIdx, remainingViewsCount);
            for (var _i = 0, removedViews_1 = removedViews; _i < removedViews_1.length; _i++) {
                var removedView = removedViews_1[_i];
                destroyView(removedView);
                removeGroupOfNodesFromDOM(removedView);
            }
        }
    }
    function findView(views, startIdx, viewIdx) {
        var i = startIdx;
        while (i < views.length) {
            var viewVNode = views[i];
            if (viewVNode.view.viewId === viewIdx) {
                return viewVNode;
            }
            else if (viewVNode.view.viewId < viewIdx) {
                views.splice(i, 1);
                destroyView(viewVNode);
                removeGroupOfNodesFromDOM(viewVNode);
            }
            i++;
        }
    }
    function createViewVNode(viewId, parent, host, renderParent) {
        if (renderParent === void 0) { renderParent = null; }
        var viewData = {
            viewId: viewId,
            nodes: [],
            subViews: [],
            host: host,
            destroyFns: [],
            refresh: parent ? parent.view.refresh : null
        };
        return createVNode(3 /* View */, viewData, parent, renderParent);
    }
    function createHostBindingView(nativeEl) {
        var lView = createViewVNode(-1, null, nativeEl);
        lView.view.nodes[0] = createVNode(1 /* Element */, lView.view, lView, nativeEl);
        return lView;
    }
    function refreshView(viewVNode, viewFn, ctx) {
        executeViewFn(viewVNode, viewFn, 2 /* Update */, ctx);
    }
    function enterView(viewVNode) {
        var oldView = currentView;
        parentVNode = viewVNode;
        currentView = viewVNode.view;
        return oldView;
    }
    function executeViewFn(viewVNode, viewFn, flags, ctx) {
        var oldView = enterView(viewVNode);
        viewFn(flags, ctx, viewVNode.view.refresh);
        currentView = oldView;
        parentVNode = viewVNode.parent;
    }
    function executeDirectiveHostFn(hostElVNode, directiveHostViewVnode, directiveInstance, rf) {
        var oldView = enterView(directiveHostViewVnode);
        directiveInstance.host(rf);
        currentView = oldView;
        parentVNode = hostElVNode;
    }
    function executeComponentRenderFn(hostElVNode, cmptViewVNode, cmptInstance, flags) {
        var oldView = enterView(cmptViewVNode);
        cmptInstance.render(flags);
        currentView = oldView;
        parentVNode = hostElVNode.parent;
    }
    function createAndRefreshView(containerVNode, viewIdx, viewId, viewFn, ctx) {
        var renderParent = findRenderParent(containerVNode);
        var viewVNode = (parentVNode = createViewVNode(viewId, containerVNode, containerVNode.view.host, renderParent));
        containerVNode.children.splice(viewIdx, 0, viewVNode);
        executeViewFn(viewVNode, viewFn, 3 /* CreateAndUpdate */, ctx);
        if (renderParent) {
            insertGroupOfNodesIntoDOM(renderParent, containerVNode, viewVNode);
        }
    }
    // PERF(pk): this instruction will re-create a closure in each and every change detection cycle
    function view(containerIdx, viewId, viewFn, ctx) {
        var containerVNode = currentView.nodes[containerIdx];
        var nextViewIdx = containerVNode.data[0];
        var existingVNode = findView(containerVNode.children, nextViewIdx, viewId);
        if (existingVNode) {
            refreshView(existingVNode, viewFn, ctx);
        }
        else {
            createAndRefreshView(containerVNode, nextViewIdx, viewId, viewFn, ctx);
        }
        containerVNode.data[0]++;
    }
    function componentStart(idx, tagName, constructorFn, attrs) {
        var domEl = document.createElement(tagName);
        var hostElVNode = (currentView.nodes[idx] = createVNode(1 /* Element */, currentView, parentVNode, domEl));
        parentVNode.children.push(hostElVNode);
        setNativeAttributes(domEl, attrs);
        appendNativeNode(parentVNode, hostElVNode);
        // TODO(pk): think of moving constructorFn argument to componentEnd so I don't have to store it
        hostElVNode.data[0] = constructorFn;
        hostElVNode.children[0] = parentVNode = createVNode(5 /* Slotable */, currentView, hostElVNode, null);
    }
    var SlotablesApiImpl = /** @class */ (function () {
        function SlotablesApiImpl(_defaultSlotable) {
            this._defaultSlotable = _defaultSlotable;
        }
        SlotablesApiImpl.prototype.getDefaultSlotable = function () {
            return this._defaultSlotable;
        };
        SlotablesApiImpl.prototype.getSlotables = function (name) {
            return findSlotables(this._defaultSlotable, name, []);
        };
        return SlotablesApiImpl;
    }());
    function componentEnd(hostElIdx) {
        var hostElVNode = currentView.nodes[hostElIdx];
        var constructorFn = hostElVNode.data[0];
        var componentViewNode = (hostElVNode.componentView = createViewVNode(-1, hostElVNode, hostElVNode, hostElVNode.native));
        var defaultSlotable = hostElVNode.children[0];
        // TALK(bl): should we support change of component's constructor function?
        // what would be the impact of this on the host and its name / type?
        // also type of supported children could be different...
        var cmptInstance = (hostElVNode.data[0] = new constructorFn(hostElVNode.native, componentViewNode.view.refresh, new SlotablesApiImpl(defaultSlotable)));
        // register new component view so we can descend into it while calling destroy lifecycle hooks
        currentView.subViews.push(componentViewNode);
        // register destroy lifecycle hook of the component itself
        if (cmptInstance.destroy) {
            currentView.destroyFns.push(cmptInstance.destroy.bind(cmptInstance));
        }
        if (cmptInstance.host) {
            hostElVNode.data[1] = createHostBindingView(hostElVNode.native);
            executeDirectiveHostFn(hostElVNode, hostElVNode.data[1], cmptInstance, 1 /* Create */);
        }
        executeComponentRenderFn(hostElVNode, componentViewNode, cmptInstance, 1 /* Create */);
    }
    function component(idx, tagName, constructorFn, attrs) {
        componentStart(idx, tagName, constructorFn, attrs);
        componentEnd(idx);
    }
    function componentRefresh(hostElIdx) {
        var hostElVNode = currentView.nodes[hostElIdx];
        var cmptInstance = hostElVNode.data[0];
        if (cmptInstance.host) {
            executeDirectiveHostFn(hostElVNode, hostElVNode.data[0 + 1], cmptInstance, 2 /* Update */);
        }
        executeComponentRenderFn(hostElVNode, hostElVNode.componentView, cmptInstance, 2 /* Update */);
    }
    function load(nodeIdx, dataIdx) {
        var vNode = currentView.nodes[nodeIdx];
        return vNode.data[dataIdx];
    }
    function loadElementRef(nodeIdx) {
        var vNode = currentView.nodes[nodeIdx];
        return vNode.native;
    }
    function input(hostElIdx, bindIdx, newValue) {
        var vNode = currentView.nodes[hostElIdx];
        return checkAndUpdateBinding(vNode.data, bindIdx, newValue);
    }
    function slotableStart(idx, name, ConstructorFn) {
        var groupVNode = (currentView.nodes[idx] = createVNode(5 /* Slotable */, currentView, parentVNode, null));
        parentVNode.children.push(groupVNode);
        // PERF(pk): this is static data, no need to store in bindings...
        groupVNode.data[0] = name;
        if (ConstructorFn) {
            groupVNode.data[1] = new ConstructorFn();
        }
        parentVNode = groupVNode;
    }
    function slotableEnd(idx) {
        var slotGroupVNode = currentView.nodes[idx];
        parentVNode = slotGroupVNode.parent;
    }
    function slot(idx) {
        var domEl = document.createComment("slot " + idx);
        var vNode = (currentView.nodes[idx] = createVNode(4 /* Slot */, currentView, parentVNode, domEl));
        parentVNode.children.push(vNode);
        appendNativeNode(parentVNode, vNode);
    }
    function findSlotables(slotableOrView, slotName, result) {
        if (result === void 0) { result = []; }
        for (var _i = 0, _a = slotableOrView.children; _i < _a.length; _i++) {
            var vNode = _a[_i];
            if (vNode.type === 5 /* Slotable */ && vNode.data[0] === slotName) {
                result.push(vNode);
            }
            else if (vNode.type === 2 /* Container */) {
                for (var _b = 0, _c = vNode.children; _b < _c.length; _b++) {
                    var view_1 = _c[_b];
                    findSlotables(view_1, slotName, result);
                }
            }
        }
        return result;
    }
    function attachSlotable(renderParent, slot, slotable) {
        slot.children.push(slotable);
        slotable.projectionParent = slot;
        // slotables can be only inserted into the DOM only if the slot was already inserted
        if (renderParent) {
            insertGroupOfNodesIntoDOM(renderParent, slot, slotable);
        }
    }
    function detachSlotable(previousSlot, slotable) {
        var prevChildIdx = previousSlot.children.indexOf(slotable);
        if (prevChildIdx > -1) {
            previousSlot.children.splice(prevChildIdx, 1);
        }
        else {
            // TODO: only in dev mode
            throw "parent points to a slot but slotable not found in the collection";
        }
        slotable.projectionParent = null;
        if (slotable.native) {
            removeGroupOfNodesFromDOM(slotable);
        }
    }
    function appendSlotable(renderParent, slot, slotable) {
        if (slotable.projectionParent !== slot) {
            // detach from previous slot
            if (slotable.projectionParent) {
                detachSlotable(slotable.projectionParent, slotable);
            }
            // attach to the new slot
            attachSlotable(renderParent, slot, slotable);
        }
    }
    function slotRefreshImperative(idx, slotable) {
        var slotVNode = currentView.nodes[idx];
        var renderParent = findRenderParent(slotVNode);
        if (slotable) {
            appendSlotable(renderParent, slotVNode, slotable);
        }
        else {
            if (slotVNode.children.length) {
                detachSlotable(slotVNode, slotVNode.children[0]);
            }
        }
    }
    // PERF(pk): split into 2 functions (default, named) for better tree-shaking
    function slotRefresh(idx, slotName) {
        var slotVNode = currentView.nodes[idx];
        var defaultSlotable = currentView.host.children[0];
        var renderParent = findRenderParent(slotVNode);
        if (slotName) {
            var slotablesFound = findSlotables(defaultSlotable, slotName);
            if (slotablesFound.length > 0) {
                for (var _i = 0, slotablesFound_1 = slotablesFound; _i < slotablesFound_1.length; _i++) {
                    var slotable = slotablesFound_1[_i];
                    appendSlotable(renderParent, slotVNode, slotable);
                }
            }
        }
        else {
            appendSlotable(renderParent, slotVNode, defaultSlotable);
        }
    }
    function directive(hostIdx, directiveIdx, constructorFn) {
        var hostVNode = currentView.nodes[hostIdx];
        var directiveInstance = (hostVNode.data[directiveIdx] = new constructorFn(hostVNode.native, currentView.refresh));
        if (directiveInstance.destroy) {
            currentView.destroyFns.push(directiveInstance.destroy.bind(directiveInstance));
        }
        // PERF(pk): split into 2 instructions so I don't have to do this checking at runtime and have smaller generated code?
        if (directiveInstance.host) {
            var hostView = (hostVNode.data[directiveIdx + 1] = createHostBindingView(hostVNode.native));
            executeDirectiveHostFn(hostVNode, hostView, directiveInstance, 1 /* Create */);
        }
    }
    function directiveRefresh(hostIdx, directiveIdx) {
        var hostElVNode = currentView.nodes[hostIdx];
        var directiveInstance = hostElVNode.data[directiveIdx];
        if (directiveInstance.host) {
            executeDirectiveHostFn(hostElVNode, hostElVNode.data[directiveIdx + 1], directiveInstance, 2 /* Update */);
        }
        if (directiveInstance.refresh) {
            directiveInstance.refresh();
        }
    }
    function render(nativeHost, tplFn, ctx) {
        var viewVNode = createViewVNode(-1, null, null, nativeHost);
        viewVNode.view.refresh = function refreshFromRoot(refreshCtx) {
            refreshView(viewVNode, tplFn, refreshCtx !== undefined ? refreshCtx : ctx);
        };
        executeViewFn(viewVNode, tplFn, 3 /* CreateAndUpdate */, ctx);
        return viewVNode.view.refresh;
    }

    describe('integration', function () {
        var hostDiv;
        beforeEach(function () {
            hostDiv = document.getElementById('host');
        });
        afterEach(function () {
            hostDiv.innerHTML = '';
        });
        describe('static html', function () {
            it('should render static HTML', function () {
                render(hostDiv, function (rf, ctx) {
                    if (rf & 1 /* Create */) {
                        element(0, 'div', ['id', 'test_id']);
                        text(2, 'some text');
                        elementStart(3, 'span');
                        {
                            elementStart(4, 'i');
                            {
                                text(5, 'double-nested');
                            }
                            elementEnd(4);
                        }
                        text(6, 'nested');
                        elementEnd(3);
                    }
                });
                expect(hostDiv.innerHTML).toBe('<div id="test_id"></div>some text<span><i>double-nested</i>nested</span>');
            });
            it('should support multiple applications in parallel', function () {
                var app1Host = document.createElement('div');
                var app2Host = document.createElement('div');
                hostDiv.appendChild(app1Host);
                hostDiv.appendChild(document.createElement('hr'));
                hostDiv.appendChild(app2Host);
                function app(rf, name) {
                    if (rf & 1 /* Create */) {
                        text(0);
                    }
                    if (rf & 2 /* Update */) {
                        bindText(0, name);
                    }
                }
                var app1Refresh = render(app1Host, app, '1');
                var app2Refresh = render(app2Host, app, '2');
                expect(hostDiv.innerHTML).toBe('<div>1</div><hr><div>2</div>');
                app1Refresh('1 updated');
                expect(hostDiv.innerHTML).toBe('<div>1 updated</div><hr><div>2</div>');
                app2Refresh('2 updated');
                expect(hostDiv.innerHTML).toBe('<div>1 updated</div><hr><div>2 updated</div>');
            });
        });
        describe('bindings', function () {
            it('should evaluate and update bindings on text nodes', function () {
                var refreshFn = render(hostDiv, function (rf, ctx) {
                    if (rf & 1 /* Create */) {
                        text(0);
                    }
                    if (rf & 2 /* Update */) {
                        bindText(0, "Hello, " + ctx);
                    }
                }, 'World');
                expect(hostDiv.innerHTML).toBe('Hello, World');
                refreshFn('New World');
                expect(hostDiv.innerHTML).toBe('Hello, New World');
            });
            it('should evaluate and update binding to properties', function () {
                var refreshFn = render(hostDiv, function (rf, ctx) {
                    if (rf & 1 /* Create */) {
                        element(0, 'div');
                    }
                    if (rf & 2 /* Update */) {
                        bindProperty(0, 0, 'id', ctx);
                    }
                }, 'initial');
                expect(hostDiv.innerHTML).toBe('<div id="initial"></div>');
                refreshFn('changed');
                expect(hostDiv.innerHTML).toBe('<div id="changed"></div>');
            });
            it('should evaluate and update binding to attributes', function () {
                var refreshFn = render(hostDiv, function (rf, ctx) {
                    if (rf & 1 /* Create */) {
                        element(0, 'div');
                    }
                    if (rf & 2 /* Update */) {
                        bindAttribute(0, 0, 'aria-label', ctx);
                    }
                }, 'initial');
                expect(hostDiv.innerHTML).toBe('<div aria-label="initial"></div>');
                refreshFn('changed');
                expect(hostDiv.innerHTML).toBe('<div aria-label="changed"></div>');
            });
            it('should toggle CSS class', function () {
                "<div [class.show]=\"shouldShow\">";
                var refreshFn = render(hostDiv, function (rf, shouldShow) {
                    if (rf & 1 /* Create */) {
                        element(0, 'div');
                    }
                    if (rf & 2 /* Update */) {
                        bindClass(0, 0, 'show', shouldShow);
                    }
                }, false);
                expect(hostDiv.innerHTML).toBe('<div></div>');
                refreshFn(true);
                expect(hostDiv.innerHTML).toBe('<div class="show"></div>');
                refreshFn(false);
                expect(hostDiv.innerHTML).toBe('<div class=""></div>');
            });
            it('should replace CSS class', function () {
                "<div [class.{}]=\"cssReplace\">";
                var refreshFn = render(hostDiv, function (rf, className) {
                    if (rf & 1 /* Create */) {
                        element(0, 'div');
                    }
                    if (rf & 2 /* Update */) {
                        replaceClass(0, 0, className);
                    }
                });
                expect(hostDiv.innerHTML).toBe('<div></div>');
                refreshFn('foo');
                expect(hostDiv.innerHTML).toBe('<div class="foo"></div>');
                refreshFn('bar');
                expect(hostDiv.innerHTML).toBe('<div class="bar"></div>');
                refreshFn(null);
                expect(hostDiv.innerHTML).toBe('<div class=""></div>');
            });
            it('should properly support binding on nested elements', function () {
                var refreshFn = render(hostDiv, function (rf, ctx) {
                    if (rf & 1 /* Create */) {
                        elementStart(0, 'div');
                        element(1, 'span');
                        elementEnd(0);
                    }
                    if (rf & 2 /* Update */) {
                        bindProperty(0, 0, 'id', ctx + '_for_div');
                        bindProperty(1, 0, 'id', ctx + '_for_span');
                    }
                }, 'initial');
                expect(hostDiv.innerHTML).toBe('<div id="initial_for_div"><span id="initial_for_span"></span></div>');
                refreshFn('changed');
                expect(hostDiv.innerHTML).toBe('<div id="changed_for_div"><span id="changed_for_span"></span></div>');
            });
        });
        describe('listeners', function () {
            it('should add DOM event listeners', function () {
                /**
                 * <button (click)="counter++">
                 *   Increment
                 * </button>
                 * Counter: {{counter}}
                 */
                function tpl(rf, ctx) {
                    if (rf & 1 /* Create */) {
                        elementStart(0, 'button');
                        {
                            listener(0, 0, 'click');
                            text(1, 'Increment');
                        }
                        elementEnd(0);
                        text(2);
                    }
                    if (rf & 2 /* Update */) {
                        listenerRefresh(0, 0, function () {
                            ctx.counter++;
                        });
                        bindText(2, "Counter: " + ctx.counter);
                    }
                }
                var ctx = { counter: 0 };
                var refreshFn = render(hostDiv, tpl, ctx);
                expect(hostDiv.innerHTML).toBe('<button>Increment</button>Counter: 0');
                hostDiv.querySelector('button').click();
                expect(ctx.counter).toBe(1);
                refreshFn(ctx);
                expect(hostDiv.innerHTML).toBe('<button>Increment</button>Counter: 1');
            });
            it('should be able to access closure data and event in the event handler', function () {
                var moduleCtx;
                function tpl(rf) {
                    if (rf & 1 /* Create */) {
                        element(0, 'button');
                        listener(0, 0, 'click');
                    }
                    if (rf & 2 /* Update */) {
                        var foo_1 = 'bar';
                        listenerRefresh(0, 0, function ($event) {
                            moduleCtx = foo_1;
                            expect($event.target).toBeDefined();
                        });
                    }
                }
                var refreshFn = render(hostDiv, tpl);
                hostDiv.querySelector('button').click();
                expect(moduleCtx).toBe('bar');
            });
        });
        describe('containers', function () {
            describe('function calls', function () {
                it('should include result of other functions', function () {
                    function externalTpl(rf, ctx) {
                        if (rf & 1 /* Create */) {
                            text(0);
                        }
                        if (rf & 2 /* Update */) {
                            bindText(0, "Hello, " + ctx.name + "!");
                        }
                    }
                    var refreshFn = render(hostDiv, function (rf, ctx) {
                        if (rf & 1 /* Create */) {
                            container(0);
                        }
                        if (rf & 2 /* Update */) {
                            include(0, externalTpl, { name: "New " + ctx.name });
                        }
                    }, { name: 'World' });
                    expect(hostDiv.innerHTML).toBe('Hello, New World!<!--container 0-->');
                    refreshFn({ name: 'Context' });
                    expect(hostDiv.innerHTML).toBe('Hello, New Context!<!--container 0-->');
                });
                it('should allow nodes around function calls', function () {
                    function externalTpl(rf, ctx) {
                        if (rf & 1 /* Create */) {
                            text(0);
                        }
                        if (rf & 2 /* Update */) {
                            bindText(0, "Hello, " + ctx.name + "!");
                        }
                    }
                    var refreshFn = render(hostDiv, function (rf, ctx) {
                        if (rf & 1 /* Create */) {
                            element(0, 'div', ['id', 'before']);
                            elementStart(1, 'span');
                            {
                                container(2);
                            }
                            elementEnd(1);
                            element(3, 'div', ['id', 'after']);
                        }
                        if (rf & 2 /* Update */) {
                            include(2, externalTpl, { name: "World" });
                        }
                    });
                    expect(hostDiv.innerHTML).toBe("<div id=\"before\"></div><span>Hello, World!<!--container 2--></span><div id=\"after\"></div>");
                });
                it('should remove nodes when function reference flips to falsy', function () {
                    function externalTpl(rf) {
                        if (rf & 1 /* Create */) {
                            text(0, 'from fn');
                        }
                    }
                    var refreshFn = render(hostDiv, function (rf, show) {
                        if (rf & 1 /* Create */) {
                            container(0);
                        }
                        if (rf & 2 /* Update */) {
                            include(0, show ? externalTpl : null);
                        }
                    }, false);
                    expect(hostDiv.innerHTML).toBe('<!--container 0-->');
                    refreshFn(true);
                    expect(hostDiv.innerHTML).toBe('from fn<!--container 0-->');
                    refreshFn(false);
                    expect(hostDiv.innerHTML).toBe('<!--container 0-->');
                });
            });
            describe('conditionals', function () {
                it('should support if', function () {
                    var refreshFn = render(hostDiv, function (rf, show) {
                        if (rf & 1 /* Create */) {
                            container(0);
                        }
                        if (rf & 2 /* Update */) {
                            containerRefreshStart(0);
                            if (show) {
                                view(0, 0, function f(rf) {
                                    if (rf & 1 /* Create */) {
                                        text(0, 'Shown conditionally');
                                    }
                                });
                            }
                            containerRefreshEnd(0);
                        }
                    }, false);
                    expect(hostDiv.innerHTML).toBe('<!--container 0-->');
                    refreshFn(true);
                    expect(hostDiv.innerHTML).toBe('Shown conditionally<!--container 0-->');
                    refreshFn(false);
                    expect(hostDiv.innerHTML).toBe('<!--container 0-->');
                });
                it('should support if / else', function () {
                    /**
                     * % if (show) {
                     *  shown
                     * % } else {
                     *  hidden
                     * % }
                     */
                    var refreshFn = render(hostDiv, function (rf, show) {
                        if (rf & 1 /* Create */) {
                            container(0);
                        }
                        if (rf & 2 /* Update */) {
                            containerRefreshStart(0);
                            if (show) {
                                view(0, 0, function f(rf) {
                                    if (rf & 1 /* Create */) {
                                        text(0, 'shown');
                                    }
                                });
                            }
                            else {
                                view(0, 1, function f(rf) {
                                    if (rf & 1 /* Create */) {
                                        text(0, 'hidden');
                                    }
                                });
                            }
                            containerRefreshEnd(0);
                        }
                    }, false);
                    expect(hostDiv.innerHTML).toBe('hidden<!--container 0-->');
                    refreshFn(true);
                    expect(hostDiv.innerHTML).toBe('shown<!--container 0-->');
                    refreshFn(false);
                    expect(hostDiv.innerHTML).toBe('hidden<!--container 0-->');
                });
                it('should support nested ifs', function () {
                    var ctx = {
                        outer: false,
                        inner: false
                    };
                    /**
                     * % if (outer) {
                     *  outer shown
                     *  % if (inner) {
                     *    inner shown
                     *  % }
                     * % }
                     */
                    var refreshFn = render(hostDiv, function (rf, ctx) {
                        if (rf & 1 /* Create */) {
                            container(0);
                        }
                        if (rf & 2 /* Update */) {
                            containerRefreshStart(0);
                            if (ctx.outer) {
                                view(0, 0, function f(rf) {
                                    if (rf & 1 /* Create */) {
                                        text(0, 'outer shown|');
                                        container(1);
                                        text(2, '|');
                                    }
                                    if (rf & 2 /* Update */) {
                                        containerRefreshStart(1);
                                        if (ctx.inner) {
                                            view(1, 0, function f(rf) {
                                                if (rf & 1 /* Create */) {
                                                    text(0, 'inner shown');
                                                }
                                            });
                                        }
                                        containerRefreshEnd(1);
                                    }
                                });
                            }
                            containerRefreshEnd(0);
                        }
                    }, ctx);
                    expect(hostDiv.innerHTML).toBe('<!--container 0-->');
                    ctx.inner = true;
                    refreshFn();
                    expect(hostDiv.innerHTML).toBe('<!--container 0-->');
                    ctx.outer = true;
                    refreshFn();
                    expect(hostDiv.innerHTML).toBe('outer shown|inner shown<!--container 1-->|<!--container 0-->');
                    ctx.inner = false;
                    refreshFn();
                    expect(hostDiv.innerHTML).toBe('outer shown|<!--container 1-->|<!--container 0-->');
                    ctx.inner = true;
                    refreshFn();
                    expect(hostDiv.innerHTML).toBe('outer shown|inner shown<!--container 1-->|<!--container 0-->');
                    ctx.outer = false;
                    refreshFn();
                    expect(hostDiv.innerHTML).toBe('<!--container 0-->');
                });
                it('should support sibling ifs', function () {
                    var ctx = {
                        first: false,
                        second: false
                    };
                    /**
                     * % if (first) {
                     *  first
                     * % }
                     * |
                     * % if (second) {
                     *  second
                     * % }
                     */
                    var refreshFn = render(hostDiv, function (rf, ctx) {
                        if (rf & 1 /* Create */) {
                            container(0);
                            text(1, '|');
                            container(2);
                        }
                        if (rf & 2 /* Update */) {
                            containerRefreshStart(0);
                            if (ctx.first) {
                                view(0, 0, function f(rf) {
                                    if (rf & 1 /* Create */) {
                                        text(0, 'first');
                                    }
                                });
                            }
                            containerRefreshEnd(0);
                            containerRefreshStart(2);
                            if (ctx.second) {
                                view(2, 0, function f(rf) {
                                    if (rf & 1 /* Create */) {
                                        text(0, 'second');
                                    }
                                });
                            }
                            containerRefreshEnd(2);
                        }
                    }, ctx);
                    expect(hostDiv.innerHTML).toBe('<!--container 0-->|<!--container 2-->');
                    ctx.second = true;
                    refreshFn();
                    expect(hostDiv.innerHTML).toBe('<!--container 0-->|second<!--container 2-->');
                    ctx.first = true;
                    refreshFn();
                    expect(hostDiv.innerHTML).toBe('first<!--container 0-->|second<!--container 2-->');
                    ctx.second = false;
                    refreshFn();
                    expect(hostDiv.innerHTML).toBe('first<!--container 0-->|<!--container 2-->');
                });
                it('should support refreshing conditionally inserted views', function () {
                    var refreshFn = render(hostDiv, function (rf, name) {
                        if (rf & 1 /* Create */) {
                            container(0);
                        }
                        if (rf & 2 /* Update */) {
                            containerRefreshStart(0);
                            {
                                // THINK(pk): this assumes that a given container _always_ have the same content...
                                // PERF(pk): what is the cost of re-defining functions like this?
                                view(0, 0, function f(rf) {
                                    if (rf & 1 /* Create */) {
                                        text(0);
                                    }
                                    if (rf & 2 /* Update */) {
                                        bindText(0, "Hello, " + name + "!");
                                    }
                                });
                            }
                            containerRefreshEnd(0);
                        }
                    }, 'World');
                    expect(hostDiv.innerHTML).toBe('Hello, World!<!--container 0-->');
                    refreshFn('New World');
                    expect(hostDiv.innerHTML).toBe('Hello, New World!<!--container 0-->');
                });
            });
            describe('loops', function () {
                it('should support for loops with index', function () {
                    var ctx = ['one', 'two', 'three'];
                    /**
                     *  for (let i = 0; i < items.length; i++) {
                     *    {{i}}-{{items[i]}}-
                     *  }
                     */
                    var refreshFn = render(hostDiv, function (rf, items) {
                        if (rf & 1 /* Create */) {
                            container(0);
                        }
                        if (rf & 2 /* Update */) {
                            containerRefreshStart(0);
                            var _loop_1 = function (i) {
                                view(0, 0, function f(rf) {
                                    if (rf & 1 /* Create */) {
                                        text(0);
                                        text(1, '-');
                                        text(2);
                                        text(3, '-');
                                    }
                                    if (rf & 2 /* Update */) {
                                        bindText(0, "" + i);
                                        bindText(2, items[i]);
                                    }
                                });
                            };
                            for (var i = 0; i < items.length; i++) {
                                _loop_1(i);
                            }
                            containerRefreshEnd(0);
                        }
                    }, ctx);
                    expect(hostDiv.innerHTML).toBe('0-one-1-two-2-three-<!--container 0-->');
                    ctx.splice(1, 1);
                    refreshFn();
                    expect(hostDiv.innerHTML).toBe('0-one-1-three-<!--container 0-->');
                });
                it('should support for-of loops', function () {
                    var ctx = ['one', 'two', 'three'];
                    /**
                     *  for (let item of items) {
                     *    {{item}}-
                     *  }
                     */
                    var refreshFn = render(hostDiv, function (rf, items) {
                        if (rf & 1 /* Create */) {
                            container(0);
                        }
                        if (rf & 2 /* Update */) {
                            containerRefreshStart(0);
                            var _loop_2 = function (item) {
                                view(0, 0, function f(rf) {
                                    if (rf & 1 /* Create */) {
                                        text(0);
                                        text(1, '-');
                                    }
                                    if (rf & 2 /* Update */) {
                                        bindText(0, item);
                                    }
                                });
                            };
                            for (var _i = 0, items_1 = items; _i < items_1.length; _i++) {
                                var item = items_1[_i];
                                _loop_2(item);
                            }
                            containerRefreshEnd(0);
                        }
                    }, ctx);
                    expect(hostDiv.innerHTML).toBe('one-two-three-<!--container 0-->');
                    ctx.splice(1, 1);
                    refreshFn();
                    expect(hostDiv.innerHTML).toBe('one-three-<!--container 0-->');
                });
                it('should support while loops', function () {
                    var fruits = ['apple', 'banana', 'orange'];
                    var refreshFn = render(hostDiv, function (rf, fruits) {
                        if (rf & 1 /* Create */) {
                            container(0);
                        }
                        if (rf & 2 /* Update */) {
                            containerRefreshStart(0);
                            var i_1 = 0;
                            while (i_1 < fruits.length) {
                                view(0, 0, function f(rf) {
                                    if (rf & 1 /* Create */) {
                                        text(0);
                                        text(1, '-');
                                    }
                                    if (rf & 2 /* Update */) {
                                        bindText(0, fruits[i_1]);
                                    }
                                });
                                i_1++;
                            }
                            containerRefreshEnd(0);
                        }
                    }, fruits);
                    expect(hostDiv.innerHTML).toBe('apple-banana-orange-<!--container 0-->');
                    fruits.splice(1, 1);
                    refreshFn();
                    expect(hostDiv.innerHTML).toBe('apple-orange-<!--container 0-->');
                });
                it('should support nested loops', function () {
                    var ctx = {
                        outter: ['1', '2'],
                        inner: ['a', 'b', 'c']
                    };
                    var refreshFn = render(hostDiv, function (rf, items) {
                        if (rf & 1 /* Create */) {
                            container(0);
                        }
                        if (rf & 2 /* Update */) {
                            containerRefreshStart(0);
                            var _loop_3 = function (out) {
                                view(0, 0, function f(rf) {
                                    if (rf & 1 /* Create */) {
                                        container(0);
                                    }
                                    if (rf & 2 /* Update */) {
                                        containerRefreshStart(0);
                                        var _loop_4 = function (inner) {
                                            view(0, 0, function f(rf) {
                                                if (rf & 1 /* Create */) {
                                                    text(0);
                                                }
                                                if (rf & 2 /* Update */) {
                                                    bindText(0, out + ":" + inner + "-");
                                                }
                                            });
                                        };
                                        for (var _i = 0, _a = ctx.inner; _i < _a.length; _i++) {
                                            var inner = _a[_i];
                                            _loop_4(inner);
                                        }
                                        containerRefreshEnd(0);
                                    }
                                });
                            };
                            for (var _i = 0, _a = ctx.outter; _i < _a.length; _i++) {
                                var out = _a[_i];
                                _loop_3(out);
                            }
                            containerRefreshEnd(0);
                        }
                    }, ctx);
                    expect(hostDiv.innerHTML).toBe('1:a-1:b-1:c-<!--container 0-->2:a-2:b-2:c-<!--container 0--><!--container 0-->');
                    refreshFn();
                    expect(hostDiv.innerHTML).toBe('1:a-1:b-1:c-<!--container 0-->2:a-2:b-2:c-<!--container 0--><!--container 0-->');
                });
            });
            describe('switch', function () {
                it('should support switch', function () {
                    "\n        {% switch(fruit) {\n          case 'apple': { %}\n            Ripe apple!\n          {%\n            break;\n          }\n          case 'banana': { %}\n            Yellow banana\n          {%\n            break;\n          }\n        } %}\n        ";
                    var refreshFn = render(hostDiv, function (rf, fruit) {
                        if (rf & 1 /* Create */) {
                            container(0);
                        }
                        if (rf & 2 /* Update */) {
                            containerRefreshStart(0);
                            switch (fruit) {
                                case 'apple': {
                                    view(0, 0, function (rf) {
                                        if (rf & 1 /* Create */) {
                                            text(0, 'Ripe apple');
                                        }
                                    });
                                    break;
                                }
                                case 'banana': {
                                    view(0, 1, function (rf) {
                                        if (rf & 1 /* Create */) {
                                            text(0, 'Yellow banana');
                                        }
                                    });
                                    break;
                                }
                            }
                            containerRefreshEnd(0);
                        }
                    }, 'apple');
                    expect(hostDiv.innerHTML).toBe('Ripe apple<!--container 0-->');
                    refreshFn('banana');
                    expect(hostDiv.innerHTML).toBe('Yellow banana<!--container 0-->');
                    refreshFn('exotic');
                    expect(hostDiv.innerHTML).toBe('<!--container 0-->');
                    refreshFn('banana');
                    expect(hostDiv.innerHTML).toBe('Yellow banana<!--container 0-->');
                });
            });
        });
        describe('components', function () {
            it('should support components', function () {
                var TestComponent = /** @class */ (function () {
                    function TestComponent() {
                    }
                    /**
                     * Hello, Component!
                     */
                    TestComponent.prototype.render = function (rf) {
                        if (rf & 1 /* Create */) {
                            text(0, 'Hello, Component!');
                        }
                    };
                    return TestComponent;
                }());
                /**
                 * <TestComponent></TestComponent>
                 * <hr>
                 * <TestComponent></TestComponent>
                 */
                render(hostDiv, function (rf) {
                    if (rf & 1 /* Create */) {
                        component(0, 'test-component', TestComponent);
                        element(1, 'hr');
                        component(2, 'test-component', TestComponent);
                    }
                    if (rf & 2 /* Update */) {
                        componentRefresh(0);
                        componentRefresh(2);
                    }
                });
                expect(hostDiv.innerHTML).toBe('<test-component>Hello, Component!</test-component><hr><test-component>Hello, Component!</test-component>');
            });
            it('should inject native node in components constructor', function () {
                var TestComponent = /** @class */ (function () {
                    function TestComponent(nativeEl) {
                        nativeEl.classList.add('from_cmpt');
                    }
                    TestComponent.prototype.render = function (rf) {
                        // intentionally left empty
                    };
                    return TestComponent;
                }());
                render(hostDiv, function (rf) {
                    if (rf & 1 /* Create */) {
                        component(0, 'test-cmpt', TestComponent);
                    }
                    if (rf & 2 /* Update */) {
                        componentRefresh(0);
                    }
                });
                expect(hostDiv.innerHTML).toBe('<test-cmpt class="from_cmpt"></test-cmpt>');
            });
            it('should support components with containers at the root', function () {
                "\n      {% if (this.show) { %}\n        Showing\n      {% } %}\n      ";
                var TestComponent = /** @class */ (function () {
                    function TestComponent() {
                    }
                    TestComponent.prototype.render = function (rf) {
                        if (rf & 1 /* Create */) {
                            container(0);
                        }
                        if (rf & 2 /* Update */) {
                            containerRefreshStart(0);
                            if (this.show) {
                                view(0, 0, function (rf) {
                                    if (rf & 1 /* Create */) {
                                        text(0, 'Showing');
                                    }
                                });
                            }
                            containerRefreshEnd(0);
                        }
                    };
                    return TestComponent;
                }());
                var refreshFn = render(hostDiv, function (rf, show) {
                    if (rf & 1 /* Create */) {
                        component(0, 'test-component', TestComponent);
                    }
                    if (rf & 2 /* Update */) {
                        var cmptInstance = load(0, 0);
                        input(0, 1, show) && (cmptInstance.show = show);
                        componentRefresh(0);
                    }
                });
                expect(hostDiv.innerHTML).toBe('<test-component><!--container 0--></test-component>');
                refreshFn(true);
                expect(hostDiv.innerHTML).toBe('<test-component>Showing<!--container 0--></test-component>');
                refreshFn(true);
                expect(hostDiv.innerHTML).toBe('<test-component>Showing<!--container 0--></test-component>');
                refreshFn(false);
                expect(hostDiv.innerHTML).toBe('<test-component><!--container 0--></test-component>');
                refreshFn(true);
                expect(hostDiv.innerHTML).toBe('<test-component>Showing<!--container 0--></test-component>');
            });
            it('should support components at the root of a view', function () {
                var Test = /** @class */ (function () {
                    function Test() {
                    }
                    Test.prototype.render = function (rf) {
                        if (rf & 1 /* Create */) {
                            text(0, 'test');
                        }
                    };
                    return Test;
                }());
                /**
                 * % if (show) {
                 *  <Test></Test>
                 * }
                 */
                var refreshFn = render(hostDiv, function (rf, show) {
                    if (rf & 1 /* Create */) {
                        container(0);
                    }
                    if (rf & 2 /* Update */) {
                        containerRefreshStart(0);
                        {
                            if (show) {
                                view(0, 0, function (rf) {
                                    if (rf & 1 /* Create */) {
                                        component(0, 'test', Test);
                                    }
                                    if (rf & 2 /* Update */) {
                                        componentRefresh(0);
                                    }
                                });
                            }
                        }
                        containerRefreshEnd(0);
                    }
                }, false);
                expect(hostDiv.innerHTML).toBe('<!--container 0-->');
                refreshFn(true);
                expect(hostDiv.innerHTML).toBe('<test>test</test><!--container 0-->');
                refreshFn(false);
                expect(hostDiv.innerHTML).toBe('<!--container 0-->');
                refreshFn(true);
                expect(hostDiv.innerHTML).toBe('<test>test</test><!--container 0-->');
            });
            it('should support components with inputs', function () {
                var ctx = { name: 'World' };
                var TestComponent = /** @class */ (function () {
                    function TestComponent() {
                        this.name = 'Anonymous';
                    }
                    /**
                     * Hello, {{name}}!
                     */
                    TestComponent.prototype.render = function (rf) {
                        if (rf & 1 /* Create */) {
                            text(0);
                        }
                        if (rf & 2 /* Update */) {
                            bindText(0, "Hello, " + this.name + "!");
                        }
                    };
                    return TestComponent;
                }());
                /**
                 * <TestComponent [name]="name"></TestComponent>
                 */
                var refreshFn = render(hostDiv, function (rf, ctx) {
                    if (rf & 1 /* Create */) {
                        component(0, 'test-component', TestComponent);
                    }
                    if (rf & 2 /* Update */) {
                        var componentInstance = load(0, 0);
                        input(0, 1, ctx.name) && (componentInstance.name = ctx.name);
                        componentRefresh(0);
                    }
                }, ctx);
                expect(hostDiv.innerHTML).toBe('<test-component>Hello, World!</test-component>');
                ctx.name = 'New World';
                refreshFn();
                expect(hostDiv.innerHTML).toBe('<test-component>Hello, New World!</test-component>');
            });
            describe('host', function () {
                it('should support hostless components', function () {
                    var TdComponent = /** @class */ (function () {
                        function TdComponent() {
                        }
                        /**
                         * <td>I'm a cell!</td>
                         */
                        TdComponent.prototype.render = function (rf) {
                            if (rf & 1 /* Create */) {
                                elementStart(0, 'td');
                                text(1, "I'm a cell!");
                                elementEnd(0);
                            }
                        };
                        return TdComponent;
                    }());
                    /**
                     * <table><tr @component="TdComponent"></tr></table>
                     */
                    render(hostDiv, function (rf) {
                        if (rf & 1 /* Create */) {
                            elementStart(0, 'table');
                            {
                                component(1, 'tr', TdComponent);
                            }
                            elementEnd(0);
                        }
                        if (rf & 2 /* Update */) {
                            componentRefresh(1);
                        }
                    });
                    expect(hostDiv.innerHTML).toBe("<table><tr><td>I'm a cell!</td></tr></table>");
                });
                it('should support components with host bindings', function () {
                    var CSSSettingComponent = /** @class */ (function () {
                        function CSSSettingComponent() {
                        }
                        /**
                         * I'm setting CSS class on my host
                         */
                        CSSSettingComponent.prototype.render = function (rf) {
                            if (rf & 1 /* Create */) {
                                text(1, "I'm setting CSS class on my host");
                            }
                        };
                        CSSSettingComponent.prototype.host = function () {
                            "[class.foo]=\"setOnHost\"";
                            bindClass(0, 0, 'foo', this.setOnHost);
                        };
                        return CSSSettingComponent;
                    }());
                    var refreshFn = render(hostDiv, function (rf, setOrNot) {
                        if (rf & 1 /* Create */) {
                            component(0, 'CSSSettingComponent', CSSSettingComponent);
                        }
                        if (rf & 2 /* Update */) {
                            var cmptInstance = load(0, 0);
                            input(0, 2, setOrNot) && (cmptInstance.setOnHost = setOrNot);
                            componentRefresh(0);
                        }
                    });
                    expect(hostDiv.innerHTML).toBe("<csssettingcomponent>I'm setting CSS class on my host</csssettingcomponent>");
                    refreshFn(true);
                    expect(hostDiv.innerHTML).toBe("<csssettingcomponent class=\"foo\">I'm setting CSS class on my host</csssettingcomponent>");
                });
                it('should support components with static host attributes and bindings', function () {
                    var CSSSettingComponent = /** @class */ (function () {
                        function CSSSettingComponent() {
                        }
                        CSSSettingComponent.prototype.render = function (rf) { };
                        CSSSettingComponent.prototype.host = function (rf) {
                            "id=\"static\" [class.foo]=\"setOnHost\"";
                            if (rf & 1 /* Create */) {
                                setAttribute(0, 'id', 'static');
                            }
                            if (rf & 2 /* Update */) {
                                bindClass(0, 0, 'foo', this.setOnHost);
                            }
                        };
                        return CSSSettingComponent;
                    }());
                    var refreshFn = render(hostDiv, function (rf, setOrNot) {
                        if (rf & 1 /* Create */) {
                            component(0, 'cmpt', CSSSettingComponent);
                        }
                        if (rf & 2 /* Update */) {
                            var cmptInstance = load(0, 0);
                            input(0, 2, setOrNot) && (cmptInstance.setOnHost = setOrNot);
                            componentRefresh(0);
                        }
                    });
                    expect(hostDiv.innerHTML).toBe("<cmpt id=\"static\"></cmpt>");
                    refreshFn(true);
                    expect(hostDiv.innerHTML).toBe("<cmpt id=\"static\" class=\"foo\"></cmpt>");
                    refreshFn(false);
                    expect(hostDiv.innerHTML).toBe("<cmpt id=\"static\" class=\"\"></cmpt>");
                });
            });
            describe('content projection', function () {
                describe('declarative API', function () {
                    it('should support default slot', function () {
                        var TestComponent = /** @class */ (function () {
                            function TestComponent() {
                            }
                            /**
                             * Hello, <x-slot></x-slot>!
                             */
                            TestComponent.prototype.render = function (rf) {
                                if (rf & 1 /* Create */) {
                                    text(0, 'Hello, ');
                                    elementStart(1, 'span');
                                    {
                                        slot(2);
                                    }
                                    elementEnd(1);
                                    text(3, '!');
                                }
                                if (rf & 2 /* Update */) {
                                    slotRefresh(2);
                                }
                            };
                            return TestComponent;
                        }());
                        /**
                         * <TestComponent>{{name}}</TestComponent>
                         */
                        var refreshFn = render(hostDiv, function (rf, name) {
                            if (rf & 1 /* Create */) {
                                // TODO(pk): element creation could be probably in-lined into component() instruction
                                componentStart(0, 'test-component', TestComponent);
                                text(1);
                                componentEnd(0);
                            }
                            if (rf & 2 /* Update */) {
                                bindText(1, name);
                                componentRefresh(0);
                            }
                        }, 'World');
                        expect(hostDiv.innerHTML).toBe('<test-component>Hello, <span>World<!--slot 2--></span>!</test-component>');
                        refreshFn('New World');
                        expect(hostDiv.innerHTML).toBe('<test-component>Hello, <span>New World<!--slot 2--></span>!</test-component>');
                    });
                    it('should support named slots', function () {
                        var Card = /** @class */ (function () {
                            function Card() {
                            }
                            /**
                             * <h1>
                             *   <x-slot name="header"></x-slot>
                             * </h1>
                             * <div>
                             *   <x-slot name="content"></x-slot>
                             * </div>
                             */
                            Card.prototype.render = function (rf) {
                                if (rf & 1 /* Create */) {
                                    elementStart(0, 'h1');
                                    {
                                        slot(1);
                                    }
                                    elementEnd(0);
                                    elementStart(2, 'div');
                                    {
                                        slot(3);
                                    }
                                    elementEnd(2);
                                }
                                if (rf & 2 /* Update */) {
                                    slotRefresh(1, 'header');
                                    slotRefresh(3, 'content');
                                }
                            };
                            return Card;
                        }());
                        /**
                         * <Card>
                         *   <:header>Title</:header>
                         *   <:content>Content</:content>
                         * </Card>
                         */
                        render(hostDiv, function (rf) {
                            if (rf & 1 /* Create */) {
                                componentStart(0, 'card', Card);
                                {
                                    slotableStart(1, 'header');
                                    {
                                        text(2, 'Title');
                                    }
                                    slotableEnd(1);
                                    slotableStart(3, 'content');
                                    {
                                        text(4, 'Content');
                                    }
                                    slotableEnd(3);
                                }
                                componentEnd(0);
                            }
                            if (rf & 2 /* Update */) {
                                componentRefresh(0);
                            }
                        });
                        expect(hostDiv.innerHTML).toBe('<card><h1>Title<!--slot 1--></h1><div>Content<!--slot 3--></div></card>');
                    });
                    it('should support named slots at the component view root', function () {
                        "<Test><:foo>foo<:/foo></Test>";
                        var Test = /** @class */ (function () {
                            function Test() {
                            }
                            Test.prototype.render = function (rf) {
                                if (rf & 1 /* Create */) {
                                    slot(0);
                                }
                                if (rf & 2 /* Update */) {
                                    slotRefresh(0, 'foo');
                                }
                            };
                            return Test;
                        }());
                        var refreshFn = render(hostDiv, function (rf, name) {
                            if (rf & 1 /* Create */) {
                                componentStart(0, 'test', Test);
                                {
                                    slotableStart(1, 'foo');
                                    {
                                        text(2, 'foo');
                                    }
                                    slotableEnd(1);
                                }
                                componentEnd(0);
                            }
                            if (rf & 2 /* Update */) {
                                componentRefresh(0);
                            }
                        });
                        expect(hostDiv.innerHTML).toBe('<test>foo<!--slot 0--></test>');
                    });
                    it('should support mix of named and default slots', function () {
                        var Card = /** @class */ (function () {
                            function Card() {
                            }
                            /**
                             * <h1>
                             *   <x-slot name="header"></x-slot>
                             * </h1>
                             * <div>
                             *   <x-slot></x-slot>
                             * </div>
                             * <footer>
                             *   <x-slot name="footer"></x-slot>
                             * </footer>
                             */
                            Card.prototype.render = function (rf) {
                                if (rf & 1 /* Create */) {
                                    elementStart(0, 'h1');
                                    {
                                        slot(1);
                                    }
                                    elementEnd(0);
                                    elementStart(2, 'div');
                                    {
                                        slot(3);
                                    }
                                    elementEnd(2);
                                    elementStart(4, 'footer');
                                    {
                                        slot(5);
                                    }
                                    elementEnd(4);
                                }
                                if (rf & 2 /* Update */) {
                                    slotRefresh(1, 'header');
                                    slotRefresh(3);
                                    slotRefresh(5, 'footer');
                                }
                            };
                            return Card;
                        }());
                        /**
                         * <Card>
                         *   <:header>Title</:header>
                         *   Content
                         *   <:footer>Bottom</:footer>
                         * </Card>
                         */
                        render(hostDiv, function (rf) {
                            if (rf & 1 /* Create */) {
                                componentStart(0, 'card', Card);
                                {
                                    slotableStart(1, 'header');
                                    {
                                        text(2, 'Title');
                                    }
                                    slotableEnd(1);
                                    text(3, 'Content');
                                    slotableStart(4, 'footer');
                                    {
                                        text(5, 'Bottom');
                                    }
                                    slotableEnd(4);
                                }
                                componentEnd(0);
                            }
                            if (rf & 2 /* Update */) {
                                componentRefresh(0);
                            }
                            expect(hostDiv.innerHTML).toBe('<card><h1>Title<!--slot 1--></h1><div>Content<!--slot 3--></div><footer>Bottom<!--slot 5--></footer></card>');
                        });
                    });
                    it('should support multiple slottables with the same name (static)', function () {
                        "\n          <x-slot name=\"item\"></x-slot>\n          ";
                        var Menu = /** @class */ (function () {
                            function Menu() {
                            }
                            Menu.prototype.render = function (rf) {
                                if (rf & 1 /* Create */) {
                                    elementStart(0, 'span');
                                    {
                                        slot(1);
                                    }
                                    elementEnd(0);
                                }
                                if (rf & 2 /* Update */) {
                                    slotRefresh(1, 'item');
                                }
                            };
                            return Menu;
                        }());
                        render(hostDiv, function (rf) {
                            if (rf & 1 /* Create */) {
                                componentStart(0, 'menu', Menu);
                                {
                                    slotableStart(1, 'item');
                                    {
                                        text(2, 'one');
                                    }
                                    slotableEnd(1);
                                    slotableStart(3, 'item');
                                    {
                                        text(4, 'two');
                                    }
                                    slotableEnd(3);
                                }
                                componentEnd(0);
                            }
                            if (rf & 2 /* Update */) {
                                componentRefresh(0);
                            }
                        });
                        expect(hostDiv.innerHTML).toBe('<menu><span>onetwo<!--slot 1--></span></menu>');
                    });
                    it('should support conditional named slots', function () {
                        "\n          {% if (show) { %}\n            <x-slot name=\"foo\"></x-slot>\n          {% } %} ";
                        var Test = /** @class */ (function () {
                            function Test() {
                                this.show = false;
                            }
                            Test.prototype.render = function (rf) {
                                if (rf & 1 /* Create */) {
                                    container(0);
                                }
                                if (rf & 2 /* Update */) {
                                    containerRefreshStart(0);
                                    {
                                        if (this.show) {
                                            view(0, 0, function (rf) {
                                                if (rf & 1 /* Create */) {
                                                    slot(0);
                                                }
                                                if (rf & 2 /* Update */) {
                                                    slotRefresh(0, 'foo');
                                                }
                                            });
                                        }
                                    }
                                    containerRefreshEnd(0);
                                }
                            };
                            return Test;
                        }());
                        var refreshFn = render(hostDiv, function (rf, show) {
                            if (rf & 1 /* Create */) {
                                componentStart(0, 'test', Test);
                                {
                                    slotableStart(1, 'foo');
                                    {
                                        text(2, 'foo');
                                    }
                                    slotableEnd(1);
                                }
                                componentEnd(0);
                            }
                            if (rf & 2 /* Update */) {
                                var componentInstance = load(0, 0);
                                input(0, 1, show) && (componentInstance.show = show);
                                componentRefresh(0);
                            }
                        }, false);
                        expect(hostDiv.innerHTML).toBe('<test><!--container 0--></test>');
                        refreshFn(true);
                        expect(hostDiv.innerHTML).toBe('<test>foo<!--slot 0--><!--container 0--></test>');
                        refreshFn(false);
                        expect(hostDiv.innerHTML).toBe('<test><!--container 0--></test>');
                    });
                    it('should support conditional named slottables', function () {
                        "<x-slot name=\"foo\"></x-slot>";
                        var Test = /** @class */ (function () {
                            function Test() {
                            }
                            Test.prototype.render = function (rf) {
                                if (rf & 1 /* Create */) {
                                    slot(0);
                                }
                                if (rf & 2 /* Update */) {
                                    slotRefresh(0, 'foo');
                                }
                            };
                            return Test;
                        }());
                        var refreshFn = render(hostDiv, function (rf, includeContent) {
                            if (rf & 1 /* Create */) {
                                componentStart(0, 'test', Test);
                                {
                                    container(1);
                                }
                                componentEnd(0);
                            }
                            if (rf & 2 /* Update */) {
                                containerRefreshStart(1);
                                {
                                    if (includeContent) {
                                        view(1, 0, function (rf) {
                                            if (rf & 1 /* Create */) {
                                                slotableStart(0, 'foo');
                                                {
                                                    text(1, 'foo');
                                                }
                                                slotableEnd(0);
                                            }
                                        });
                                    }
                                }
                                containerRefreshEnd(1);
                                componentRefresh(0);
                            }
                        }, false);
                        expect(hostDiv.innerHTML).toBe('<test><!--slot 0--></test>');
                        refreshFn(true);
                        expect(hostDiv.innerHTML).toBe('<test>foo<!--slot 0--></test>');
                        refreshFn(true);
                        expect(hostDiv.innerHTML).toBe('<test>foo<!--slot 0--></test>');
                        refreshFn(false);
                        expect(hostDiv.innerHTML).toBe('<test><!--slot 0--></test>');
                    });
                    it('should support multiple conditional named slottables', function () {
                        "<x-slot name=\"item\"></x-slot>";
                        var Test = /** @class */ (function () {
                            function Test() {
                            }
                            Test.prototype.render = function (rf) {
                                if (rf & 1 /* Create */) {
                                    slot(0);
                                }
                                if (rf & 2 /* Update */) {
                                    slotRefresh(0, 'item');
                                }
                            };
                            return Test;
                        }());
                        var refreshFn = render(hostDiv, function (rf, includeContent) {
                            if (rf & 1 /* Create */) {
                                componentStart(0, 'test', Test);
                                {
                                    container(1);
                                }
                                componentEnd(0);
                            }
                            if (rf & 2 /* Update */) {
                                containerRefreshStart(1);
                                {
                                    if (includeContent) {
                                        view(1, 0, function (rf) {
                                            if (rf & 1 /* Create */) {
                                                slotableStart(0, 'item');
                                                {
                                                    text(1, 'foo');
                                                }
                                                slotableEnd(0);
                                                slotableStart(2, 'item');
                                                {
                                                    text(3, 'bar');
                                                }
                                                slotableEnd(2);
                                            }
                                        });
                                    }
                                }
                                containerRefreshEnd(1);
                                componentRefresh(0);
                            }
                        }, false);
                        expect(hostDiv.innerHTML).toBe('<test><!--slot 0--></test>');
                        refreshFn(true);
                        expect(hostDiv.innerHTML).toBe('<test>foobar<!--slot 0--></test>');
                        refreshFn(true);
                        expect(hostDiv.innerHTML).toBe('<test>foobar<!--slot 0--></test>');
                        refreshFn(false);
                        expect(hostDiv.innerHTML).toBe('<test><!--slot 0--></test>');
                    });
                    it('should support multiple conditional named slottables in different containers', function () {
                        "<x-slot name=\"item\"></x-slot>";
                        var Test = /** @class */ (function () {
                            function Test() {
                            }
                            Test.prototype.render = function (rf) {
                                if (rf & 1 /* Create */) {
                                    slot(0);
                                }
                                if (rf & 2 /* Update */) {
                                    slotRefresh(0, 'item');
                                }
                            };
                            return Test;
                        }());
                        var refreshFn = render(hostDiv, function (rf, includeContent) {
                            if (rf & 1 /* Create */) {
                                componentStart(0, 'test', Test);
                                {
                                    container(1);
                                    container(2);
                                }
                                componentEnd(0);
                            }
                            if (rf & 2 /* Update */) {
                                containerRefreshStart(1);
                                {
                                    if (includeContent) {
                                        view(1, 0, function (rf) {
                                            if (rf & 1 /* Create */) {
                                                slotableStart(0, 'item');
                                                {
                                                    text(1, 'foo');
                                                }
                                                slotableEnd(0);
                                            }
                                        });
                                    }
                                }
                                containerRefreshEnd(1);
                                containerRefreshStart(2);
                                {
                                    if (includeContent) {
                                        view(2, 0, function (rf) {
                                            if (rf & 1 /* Create */) {
                                                slotableStart(0, 'item');
                                                {
                                                    text(1, 'bar');
                                                }
                                                slotableEnd(0);
                                            }
                                        });
                                    }
                                }
                                containerRefreshEnd(2);
                                componentRefresh(0);
                            }
                        }, false);
                        expect(hostDiv.innerHTML).toBe('<test><!--slot 0--></test>');
                        refreshFn(true);
                        expect(hostDiv.innerHTML).toBe('<test>foobar<!--slot 0--></test>');
                        refreshFn(true);
                        expect(hostDiv.innerHTML).toBe('<test>foobar<!--slot 0--></test>');
                        refreshFn(false);
                        expect(hostDiv.innerHTML).toBe('<test><!--slot 0--></test>');
                    });
                    it('should support multiple conditional named slottables in nested containers', function () {
                        "<x-slot name=\"item\"></x-slot>";
                        var Test = /** @class */ (function () {
                            function Test() {
                            }
                            Test.prototype.render = function (rf) {
                                if (rf & 1 /* Create */) {
                                    slot(0);
                                }
                                if (rf & 2 /* Update */) {
                                    slotRefresh(0, 'item');
                                }
                            };
                            return Test;
                        }());
                        var refreshFn = render(hostDiv, function (rf, includeContent) {
                            if (rf & 1 /* Create */) {
                                componentStart(0, 'test', Test);
                                {
                                    container(1);
                                }
                                componentEnd(0);
                            }
                            if (rf & 2 /* Update */) {
                                containerRefreshStart(1);
                                {
                                    if (includeContent) {
                                        view(1, 0, function (rf) {
                                            if (rf & 1 /* Create */) {
                                                container(0);
                                            }
                                            if (rf & 2 /* Update */) {
                                                containerRefreshStart(0);
                                                if (includeContent) {
                                                    view(0, 0, function (rf) {
                                                        if (rf & 1 /* Create */) {
                                                            slotableStart(0, 'item');
                                                            {
                                                                text(1, 'foo');
                                                            }
                                                            slotableEnd(0);
                                                        }
                                                    });
                                                }
                                                containerRefreshEnd(0);
                                            }
                                        });
                                    }
                                }
                                containerRefreshEnd(1);
                                componentRefresh(0);
                            }
                        }, false);
                        expect(hostDiv.innerHTML).toBe('<test><!--slot 0--></test>');
                        refreshFn(true);
                        expect(hostDiv.innerHTML).toBe('<test>foo<!--slot 0--></test>');
                        refreshFn(true);
                        expect(hostDiv.innerHTML).toBe('<test>foo<!--slot 0--></test>');
                        refreshFn(false);
                        expect(hostDiv.innerHTML).toBe('<test><!--slot 0--></test>');
                    });
                    it('should support containers inside conditional slotables', function () {
                        "<x-slot name=\"foobar\"></x-slot>";
                        var Test = /** @class */ (function () {
                            function Test() {
                            }
                            Test.prototype.render = function (rf) {
                                if (rf & 1 /* Create */) {
                                    slot(0);
                                }
                                if (rf & 2 /* Update */) {
                                    slotRefresh(0, 'foobar');
                                }
                            };
                            return Test;
                        }());
                        var ctx = { includeSlotable: false, includeContent: false };
                        var refreshFn = render(hostDiv, function (rf, ctx) {
                            if (rf & 1 /* Create */) {
                                componentStart(0, 'test', Test);
                                {
                                    container(1);
                                }
                                componentEnd(0);
                            }
                            if (rf & 2 /* Update */) {
                                containerRefreshStart(1);
                                {
                                    if (ctx.includeSlotable) {
                                        view(1, 0, function (rf) {
                                            if (rf & 1 /* Create */) {
                                                slotableStart(0, 'foobar');
                                                {
                                                    container(1);
                                                }
                                                slotableEnd(0);
                                                slotableStart(2, 'foobar');
                                                {
                                                    text(3, 'bar');
                                                }
                                                slotableEnd(2);
                                            }
                                            if (rf & 2 /* Update */) {
                                                containerRefreshStart(1);
                                                if (ctx.includeContent) {
                                                    view(1, 0, function (rf) {
                                                        text(1, 'foo');
                                                    });
                                                }
                                                containerRefreshEnd(1);
                                            }
                                        });
                                    }
                                }
                                containerRefreshEnd(1);
                                componentRefresh(0);
                            }
                        }, ctx);
                        expect(hostDiv.innerHTML).toBe('<test><!--slot 0--></test>');
                        ctx.includeSlotable = true;
                        refreshFn();
                        expect(hostDiv.innerHTML).toBe('<test><!--container 1-->bar<!--slot 0--></test>');
                        ctx.includeContent = true;
                        refreshFn();
                        expect(hostDiv.innerHTML).toBe('<test>foo<!--container 1-->bar<!--slot 0--></test>');
                        ctx.includeSlotable = false;
                        refreshFn();
                        expect(hostDiv.innerHTML).toBe('<test><!--slot 0--></test>');
                        ctx.includeSlotable = true;
                        refreshFn();
                        expect(hostDiv.innerHTML).toBe('<test>foo<!--container 1-->bar<!--slot 0--></test>');
                    });
                    it('should conditionally move slotables between slots', function () {
                        "\n          <div>\n            {% if (this.inFirst) { %}\n              <x-slot></x-slot>\n            {% } %}\n          </div>\n          <div>\n            {% if (!this.inFirst) { %}\n              <x-slot></x-slot>\n            {% } %}\n          </div>\n          ";
                        var TestCmpt = /** @class */ (function () {
                            function TestCmpt() {
                            }
                            TestCmpt.prototype.render = function (rf) {
                                if (rf & 1 /* Create */) {
                                    elementStart(0, 'div');
                                    {
                                        container(1);
                                    }
                                    elementEnd(0);
                                    elementStart(2, 'div');
                                    {
                                        container(3);
                                    }
                                    elementEnd(2);
                                }
                                if (rf & 2 /* Update */) {
                                    containerRefreshStart(1);
                                    if (this.inFirst) {
                                        view(1, 0, function (rf) {
                                            if (rf & 1 /* Create */) {
                                                slot(0);
                                            }
                                            if (rf & 2 /* Update */) {
                                                slotRefresh(0);
                                            }
                                        });
                                    }
                                    containerRefreshEnd(1);
                                    containerRefreshStart(3);
                                    if (!this.inFirst) {
                                        view(3, 0, function (rf) {
                                            if (rf & 1 /* Create */) {
                                                slot(0);
                                            }
                                            if (rf & 2 /* Update */) {
                                                slotRefresh(0);
                                            }
                                        });
                                    }
                                    containerRefreshEnd(3);
                                }
                            };
                            return TestCmpt;
                        }());
                        var refreshFn = render(hostDiv, function (rf, inFirst) {
                            if (rf & 1 /* Create */) {
                                componentStart(0, 'TestCmpt', TestCmpt);
                                {
                                    text(1, 'content');
                                }
                                componentEnd(0);
                            }
                            if (rf & 2 /* Update */) {
                                var cmptInstance = load(0, 0);
                                input(0, 1, inFirst) && (cmptInstance.inFirst = inFirst);
                                componentRefresh(0);
                            }
                        }, true);
                        var inFirstHtml = '<testcmpt><div>content<!--slot 0--><!--container 1--></div><div><!--container 3--></div></testcmpt>';
                        var inSecondHtml = '<testcmpt><div><!--container 1--></div><div>content<!--slot 0--><!--container 3--></div></testcmpt>';
                        expect(hostDiv.innerHTML).toBe(inFirstHtml);
                        refreshFn(false);
                        expect(hostDiv.innerHTML).toBe(inSecondHtml);
                        refreshFn(true);
                        expect(hostDiv.innerHTML).toBe(inFirstHtml);
                        refreshFn(false);
                        expect(hostDiv.innerHTML).toBe(inSecondHtml);
                    });
                    it('should support re-projection of default content', function () {
                        "\n          <div class=\"header\">\n            <x-slot name=\"header\"></x-slot>\n          </div>\n          <div class=\"body\">\n            <x-slot name=\"body\"></x-slot>\n          </div>\n          ";
                        var Card = /** @class */ (function () {
                            function Card() {
                            }
                            Card.prototype.render = function (rf) {
                                if (rf & 1 /* Create */) {
                                    elementStart(0, 'div', ['class', 'header']);
                                    slot(1);
                                    elementEnd(0);
                                    elementStart(2, 'div', ['class', 'body']);
                                    slot(3);
                                    elementEnd(2);
                                }
                                if (rf & 2 /* Update */) {
                                    slotRefresh(1, 'header');
                                    slotRefresh(3, 'body');
                                }
                            };
                            return Card;
                        }());
                        var SimpleCard = /** @class */ (function () {
                            function SimpleCard() {
                            }
                            SimpleCard.prototype.render = function (rf) {
                                if (rf & 1 /* Create */) {
                                    componentStart(0, 'card', Card);
                                    {
                                        slotableStart(1, 'header');
                                        {
                                            text(2);
                                        }
                                        slotableEnd(1);
                                        slotableStart(3, 'body');
                                        {
                                            elementStart(4, 'div');
                                            {
                                                slot(5);
                                            }
                                            elementEnd(4);
                                        }
                                        slotableEnd(3);
                                    }
                                    componentEnd(0);
                                }
                                if (rf & 2 /* Update */) {
                                    bindText(2, this.title);
                                    slotRefresh(5);
                                    componentRefresh(0);
                                }
                            };
                            return SimpleCard;
                        }());
                        function app(rf, titleExp) {
                            if (rf & 1 /* Create */) {
                                componentStart(0, 'simple-card', SimpleCard);
                                text(1, 'Content');
                                componentEnd(0);
                            }
                            if (rf & 2 /* Update */) {
                                var cmptInstance = load(0, 0);
                                input(0, 1, titleExp) && (cmptInstance.title = titleExp);
                                componentRefresh(0);
                            }
                        }
                        var refreshFn = render(hostDiv, app, 'Title');
                        expect(hostDiv.innerHTML).toBe("<simple-card><card><div class=\"header\">Title<!--slot 1--></div><div class=\"body\"><div>Content<!--slot 5--></div><!--slot 3--></div></card></simple-card>");
                        refreshFn('New Title');
                        expect(hostDiv.innerHTML).toBe("<simple-card><card><div class=\"header\">New Title<!--slot 1--></div><div class=\"body\"><div>Content<!--slot 5--></div><!--slot 3--></div></card></simple-card>");
                    });
                    it('should support re-projection of default content at the root of a slottable', function () {
                        "\n          <div class=\"header\">\n            <x-slot name=\"header\"></x-slot>\n          </div>\n          <div class=\"body\">\n            <x-slot name=\"body\"></x-slot>\n          </div>\n          ";
                        var Card = /** @class */ (function () {
                            function Card() {
                            }
                            Card.prototype.render = function (rf) {
                                if (rf & 1 /* Create */) {
                                    elementStart(0, 'div', ['class', 'header']);
                                    slot(1);
                                    elementEnd(0);
                                    elementStart(2, 'div', ['class', 'body']);
                                    slot(3);
                                    elementEnd(2);
                                }
                                if (rf & 2 /* Update */) {
                                    slotRefresh(1, 'header');
                                    slotRefresh(3, 'body');
                                }
                            };
                            return Card;
                        }());
                        var SimpleCard = /** @class */ (function () {
                            function SimpleCard() {
                            }
                            SimpleCard.prototype.render = function (rf) {
                                if (rf & 1 /* Create */) {
                                    componentStart(0, 'card', Card);
                                    {
                                        slotableStart(1, 'header');
                                        {
                                            text(2);
                                        }
                                        slotableEnd(1);
                                        slotableStart(3, 'body');
                                        {
                                            slot(4);
                                        }
                                        slotableEnd(3);
                                    }
                                    componentEnd(0);
                                }
                                if (rf & 2 /* Update */) {
                                    bindText(2, this.title);
                                    slotRefresh(4);
                                    componentRefresh(0);
                                }
                            };
                            return SimpleCard;
                        }());
                        function app(rf, titleExp) {
                            if (rf & 1 /* Create */) {
                                componentStart(0, 'simple-card', SimpleCard);
                                text(1, 'Content');
                                componentEnd(0);
                            }
                            if (rf & 2 /* Update */) {
                                var cmptInstance = load(0, 0);
                                input(0, 1, titleExp) && (cmptInstance.title = titleExp);
                                componentRefresh(0);
                            }
                        }
                        var refreshFn = render(hostDiv, app, 'Title');
                        expect(hostDiv.innerHTML).toBe("<simple-card><card><div class=\"header\">Title<!--slot 1--></div><div class=\"body\">Content<!--slot 4--><!--slot 3--></div></card></simple-card>");
                        refreshFn('New Title');
                        expect(hostDiv.innerHTML).toBe("<simple-card><card><div class=\"header\">New Title<!--slot 1--></div><div class=\"body\">Content<!--slot 4--><!--slot 3--></div></card></simple-card>");
                    });
                    it('should support re-projection of named content at the root of a slottable', function () {
                        "\n          <div class=\"header\">\n            <x-slot name=\"header\"></x-slot>\n          </div>\n          <div class=\"body\">\n            <x-slot name=\"body\"></x-slot>\n          </div>\n          ";
                        var Card = /** @class */ (function () {
                            function Card() {
                            }
                            Card.prototype.render = function (rf) {
                                if (rf & 1 /* Create */) {
                                    elementStart(0, 'div', ['class', 'header']);
                                    slot(1);
                                    elementEnd(0);
                                    elementStart(2, 'div', ['class', 'body']);
                                    slot(3);
                                    elementEnd(2);
                                }
                                if (rf & 2 /* Update */) {
                                    slotRefresh(1, 'header');
                                    slotRefresh(3, 'body');
                                }
                            };
                            return Card;
                        }());
                        var SimpleCard = /** @class */ (function () {
                            function SimpleCard() {
                            }
                            SimpleCard.prototype.render = function (rf) {
                                if (rf & 1 /* Create */) {
                                    componentStart(0, 'card', Card);
                                    {
                                        slotableStart(1, 'header');
                                        {
                                            text(2);
                                        }
                                        slotableEnd(1);
                                        slotableStart(3, 'body');
                                        {
                                            slot(4);
                                        }
                                        slotableEnd(3);
                                    }
                                    componentEnd(0);
                                }
                                if (rf & 2 /* Update */) {
                                    bindText(2, this.title);
                                    slotRefresh(4, 'body');
                                    componentRefresh(0);
                                }
                            };
                            return SimpleCard;
                        }());
                        function app(rf, titleExp) {
                            if (rf & 1 /* Create */) {
                                componentStart(0, 'simple-card', SimpleCard);
                                {
                                    slotableStart(1, 'body');
                                    {
                                        text(2, 'Content');
                                    }
                                    slotableEnd(1);
                                }
                                componentEnd(0);
                            }
                            if (rf & 2 /* Update */) {
                                var cmptInstance = load(0, 0);
                                input(0, 1, titleExp) && (cmptInstance.title = titleExp);
                                componentRefresh(0);
                            }
                        }
                        var refreshFn = render(hostDiv, app, 'Title');
                        expect(hostDiv.innerHTML).toBe("<simple-card><card><div class=\"header\">Title<!--slot 1--></div><div class=\"body\">Content<!--slot 4--><!--slot 3--></div></card></simple-card>");
                        refreshFn('New Title');
                        expect(hostDiv.innerHTML).toBe("<simple-card><card><div class=\"header\">New Title<!--slot 1--></div><div class=\"body\">Content<!--slot 4--><!--slot 3--></div></card></simple-card>");
                    });
                    it('should support re-projection of named content at the root of a container in slotable', function () {
                        "\n          <div class=\"header\">\n            <x-slot name=\"header\"></x-slot>\n          </div>\n          <div class=\"body\">\n            <x-slot name=\"body\"></x-slot>\n          </div>\n          ";
                        var Card = /** @class */ (function () {
                            function Card() {
                            }
                            Card.prototype.render = function (rf) {
                                if (rf & 1 /* Create */) {
                                    elementStart(0, 'div', ['class', 'header']);
                                    slot(1);
                                    elementEnd(0);
                                    elementStart(2, 'div', ['class', 'body']);
                                    slot(3);
                                    elementEnd(2);
                                }
                                if (rf & 2 /* Update */) {
                                    slotRefresh(1, 'header');
                                    slotRefresh(3, 'body');
                                }
                            };
                            return Card;
                        }());
                        var SimpleCard = /** @class */ (function () {
                            function SimpleCard() {
                                this.showBody = false;
                            }
                            SimpleCard.prototype.render = function (rf) {
                                if (rf & 1 /* Create */) {
                                    componentStart(0, 'card', Card);
                                    {
                                        slotableStart(1, 'header');
                                        {
                                            text(2);
                                        }
                                        slotableEnd(1);
                                        slotableStart(3, 'body');
                                        {
                                            container(4);
                                        }
                                        slotableEnd(3);
                                    }
                                    componentEnd(0);
                                }
                                if (rf & 2 /* Update */) {
                                    bindText(2, this.title);
                                    containerRefreshStart(4);
                                    {
                                        if (this.showBody) {
                                            view(4, 0, function (rf) {
                                                if (rf & 1 /* Create */) {
                                                    slot(0);
                                                }
                                                if (rf & 2 /* Update */) {
                                                    slotRefresh(0, 'body');
                                                }
                                            });
                                        }
                                    }
                                    containerRefreshEnd(4);
                                    componentRefresh(0);
                                }
                            };
                            return SimpleCard;
                        }());
                        function app(rf, ctx) {
                            if (rf & 1 /* Create */) {
                                componentStart(0, 'simple-card', SimpleCard);
                                {
                                    slotableStart(1, 'body');
                                    {
                                        text(2, 'Content');
                                    }
                                    slotableEnd(1);
                                }
                                componentEnd(0);
                            }
                            if (rf & 2 /* Update */) {
                                var cmptInstance = load(0, 0);
                                input(0, 1, ctx.titleExp) && (cmptInstance.title = ctx.titleExp);
                                input(0, 2, ctx.showBody) && (cmptInstance.showBody = ctx.showBody);
                                componentRefresh(0);
                            }
                        }
                        var refreshFn = render(hostDiv, app, { titleExp: 'Title', showBody: false });
                        expect(hostDiv.innerHTML).toBe("<simple-card><card><div class=\"header\">Title<!--slot 1--></div><div class=\"body\"><!--container 4--><!--slot 3--></div></card></simple-card>");
                        refreshFn({ titleExp: 'New Title', showBody: true });
                        expect(hostDiv.innerHTML).toBe("<simple-card><card><div class=\"header\">New Title<!--slot 1--></div><div class=\"body\">Content<!--slot 0--><!--container 4--><!--slot 3--></div></card></simple-card>");
                        refreshFn({ titleExp: 'Old Title', showBody: false });
                        expect(hostDiv.innerHTML).toBe("<simple-card><card><div class=\"header\">Old Title<!--slot 1--></div><div class=\"body\"><!--container 4--><!--slot 3--></div></card></simple-card>");
                    });
                });
                describe('imperative API', function () {
                    it('should insert programmatically determined slotable', function () {
                        "<% const items = findSlotables($content, \"item\"); %>\n           <x-slot [slotable]=\"items[0]\"></x-slot>\n           <x-slot [slotable]=\"items[2]\"></x-slot>\n          ";
                        var FirstAndThird = /** @class */ (function () {
                            // THINK(pk): DI would be so much nicer here...
                            function FirstAndThird(nativeEl, refreshFn, _content) {
                                this._content = _content;
                            }
                            FirstAndThird.prototype.render = function (rf) {
                                if (rf & 1 /* Create */) {
                                    slot(0);
                                    slot(1);
                                }
                                if (rf & 2 /* Update */) {
                                    var items = this._content.getSlotables('item');
                                    slotRefreshImperative(0, items[0]);
                                    slotRefreshImperative(1, items[2]);
                                }
                            };
                            return FirstAndThird;
                        }());
                        function app(rf) {
                            if (rf & 1 /* Create */) {
                                componentStart(0, 'first-and-third', FirstAndThird);
                                {
                                    slotableStart(1, 'item');
                                    {
                                        text(2, 'first');
                                    }
                                    slotableEnd(1);
                                    slotableStart(2, 'item');
                                    {
                                        text(3, 'second');
                                    }
                                    slotableEnd(2);
                                    slotableStart(3, 'item');
                                    {
                                        text(4, 'third');
                                    }
                                    slotableEnd(3);
                                }
                                componentEnd(0);
                            }
                            if (rf & 2 /* Update */) {
                                componentRefresh(0);
                            }
                        }
                        var refreshFn = render(hostDiv, app);
                        expect(hostDiv.innerHTML).toBe('<first-and-third>first<!--slot 0-->third<!--slot 1--></first-and-third>');
                        refreshFn();
                        expect(hostDiv.innerHTML).toBe('<first-and-third>first<!--slot 0-->third<!--slot 1--></first-and-third>');
                        refreshFn();
                        expect(hostDiv.innerHTML).toBe('<first-and-third>first<!--slot 0-->third<!--slot 1--></first-and-third>');
                    });
                    it('should remove programmatically determined slotable if binding flips to falsy', function () {
                        "<% const items = findSlotables($content, \"item\"); %>\n           <x-slot [slotable]=\"this.show ? items[0] : null\"></x-slot>\n          ";
                        var FirstOrNothing = /** @class */ (function () {
                            function FirstOrNothing(nativeEl, refreshFn, _content) {
                                this._content = _content;
                            }
                            FirstOrNothing.prototype.render = function (rf) {
                                if (rf & 1 /* Create */) {
                                    slot(0);
                                }
                                if (rf & 2 /* Update */) {
                                    var items = this._content.getSlotables('item');
                                    slotRefreshImperative(0, this.show ? items[0] : null);
                                }
                            };
                            return FirstOrNothing;
                        }());
                        function app(rf, show) {
                            if (rf & 1 /* Create */) {
                                componentStart(0, 'first-or-nothing', FirstOrNothing);
                                {
                                    slotableStart(1, 'item');
                                    {
                                        text(2, 'first');
                                    }
                                    slotableEnd(1);
                                }
                                componentEnd(0);
                            }
                            if (rf & 2 /* Update */) {
                                var cmpt = load(0, 0);
                                input(0, 1, show) && (cmpt.show = show);
                                componentRefresh(0);
                            }
                        }
                        var refreshFn = render(hostDiv, app, false);
                        expect(hostDiv.innerHTML).toBe('<first-or-nothing><!--slot 0--></first-or-nothing>');
                        refreshFn(true);
                        expect(hostDiv.innerHTML).toBe('<first-or-nothing>first<!--slot 0--></first-or-nothing>');
                        refreshFn(false);
                        expect(hostDiv.innerHTML).toBe('<first-or-nothing><!--slot 0--></first-or-nothing>');
                    });
                    it('should support bindings on slotables', function () {
                        var MenuItem = /** @class */ (function () {
                            function MenuItem() {
                            }
                            return MenuItem;
                        }());
                        var MenuCmpt = /** @class */ (function () {
                            function MenuCmpt(nativeEl, refreshFn, _content) {
                                this._content = _content;
                            }
                            MenuCmpt.prototype.render = function (rf) {
                                if (rf & 1 /* Create */) {
                                    elementStart(0, 'ul');
                                    {
                                        container(1);
                                    }
                                    elementEnd(0);
                                }
                                if (rf & 2 /* Update */) {
                                    var items = this._content.getSlotables('item');
                                    containerRefreshStart(1);
                                    var _loop_5 = function (item) {
                                        view(1, 0, function (rf) {
                                            if (rf & 1 /* Create */) {
                                                elementStart(0, 'li');
                                                {
                                                    slot(1);
                                                }
                                                elementEnd(0);
                                            }
                                            if (rf & 2 /* Update */) {
                                                bindProperty(0, 0, 'id', item.data[1].id);
                                                slotRefreshImperative(1, item);
                                            }
                                        });
                                    };
                                    for (var _i = 0, items_2 = items; _i < items_2.length; _i++) {
                                        var item = items_2[_i];
                                        _loop_5(item);
                                    }
                                    containerRefreshEnd(1);
                                }
                            };
                            return MenuCmpt;
                        }());
                        function app(rf) {
                            if (rf & 1 /* Create */) {
                                componentStart(0, 'menu', MenuCmpt);
                                {
                                    slotableStart(1, 'item', MenuItem);
                                    {
                                        text(2, 'one');
                                    }
                                    slotableEnd(1);
                                    slotableStart(3, 'item', MenuItem);
                                    {
                                        text(4, 'two');
                                    }
                                    slotableEnd(3);
                                }
                                componentEnd(0);
                            }
                            if (rf & 2 /* Update */) {
                                var slotable_1 = load(1, 1);
                                var slotable_2 = load(3, 1);
                                input(1, 2, 'id1') && (slotable_1.id = 'id1');
                                input(3, 2, 'id2') && (slotable_2.id = 'id2');
                                componentRefresh(0);
                            }
                        }
                        var refreshFn = render(hostDiv, app);
                        expect(hostDiv.innerHTML).toBe('<menu><ul><li id="id1">one<!--slot 1--></li><li id="id2">two<!--slot 1--></li><!--container 1--></ul></menu>');
                    });
                });
            });
            describe('lifecycle hooks', function () {
                it('should support destroy hook on components', function () {
                    var destroyed = false;
                    var TestCmpt = /** @class */ (function () {
                        function TestCmpt() {
                        }
                        TestCmpt.prototype.render = function () { };
                        //THINK(pk): how should I distinguish lh from regular methods?
                        //TALK(bl): lifecycle hooks support in ivy?
                        TestCmpt.prototype.destroy = function () {
                            destroyed = true;
                        };
                        return TestCmpt;
                    }());
                    function app(rf, show) {
                        if (rf & 1 /* Create */) {
                            container(0);
                        }
                        if (rf & 2 /* Update */) {
                            containerRefreshStart(0);
                            if (show) {
                                view(0, 0, function () {
                                    if (rf & 1 /* Create */) {
                                        component(0, 'test-cmpt', TestCmpt);
                                    }
                                    if (rf & 2 /* Update */) {
                                        componentRefresh(0);
                                    }
                                });
                            }
                            containerRefreshEnd(0);
                        }
                    }
                    var refreshFn = render(hostDiv, app, true);
                    expect(hostDiv.innerHTML).toBe('<test-cmpt></test-cmpt><!--container 0-->');
                    expect(destroyed).toBeFalsy();
                    refreshFn(false);
                    expect(hostDiv.innerHTML).toBe('<!--container 0-->');
                    expect(destroyed).toBeTruthy();
                });
                it('should support destroy hook on components in nested views', function () {
                    var destroyed = false;
                    var TestCmpt = /** @class */ (function () {
                        function TestCmpt() {
                        }
                        TestCmpt.prototype.render = function () { };
                        //THINK(pk): how should I distinguish lh from regular methods?
                        //TALK(bl): lifecycle hooks support in ivy?
                        TestCmpt.prototype.destroy = function () {
                            destroyed = true;
                        };
                        return TestCmpt;
                    }());
                    function app(rf, show) {
                        if (rf & 1 /* Create */) {
                            container(0);
                        }
                        if (rf & 2 /* Update */) {
                            containerRefreshStart(0);
                            if (show) {
                                view(0, 0, function () {
                                    if (rf & 1 /* Create */) {
                                        container(0);
                                    }
                                    if (rf & 2 /* Update */) {
                                        containerRefreshStart(0);
                                        if (show) {
                                            view(0, 0, function () {
                                                if (rf & 1 /* Create */) {
                                                    component(0, 'test-cmpt', TestCmpt);
                                                }
                                                if (rf & 2 /* Update */) {
                                                    componentRefresh(0);
                                                }
                                            });
                                        }
                                        containerRefreshEnd(0);
                                    }
                                });
                            }
                            containerRefreshEnd(0);
                        }
                    }
                    var refreshFn = render(hostDiv, app, true);
                    expect(hostDiv.innerHTML).toBe('<test-cmpt></test-cmpt><!--container 0--><!--container 0-->');
                    expect(destroyed).toBeFalsy();
                    refreshFn(false);
                    expect(hostDiv.innerHTML).toBe('<!--container 0-->');
                    expect(destroyed).toBeTruthy();
                });
            });
        });
        describe('directives', function () {
            it('should support directives', function () {
                var IdDirective = /** @class */ (function () {
                    function IdDirective(_nativeHost) {
                        this._nativeHost = _nativeHost;
                    }
                    IdDirective.prototype.refresh = function () {
                        this._nativeHost.id = 'id from directive';
                    };
                    return IdDirective;
                }());
                render(hostDiv, function (rf, ctx) {
                    if (rf & 1 /* Create */) {
                        element(0, 'div');
                        directive(0, 0, IdDirective);
                    }
                    if (rf & 2 /* Update */) {
                        directiveRefresh(0, 0);
                    }
                });
                expect(hostDiv.innerHTML).toBe('<div id="id from directive"></div>');
            });
            it('should support directives with inputs', function () {
                var IdDirective = /** @class */ (function () {
                    function IdDirective(_nativeHost) {
                        this._nativeHost = _nativeHost;
                    }
                    IdDirective.prototype.refresh = function () {
                        this._nativeHost.id = "id from " + this.name;
                    };
                    return IdDirective;
                }());
                render(hostDiv, function (rf, name) {
                    if (rf & 1 /* Create */) {
                        element(0, 'div');
                        directive(0, 0, IdDirective);
                    }
                    if (rf & 2 /* Update */) {
                        var directiveInstance = load(0, 0);
                        input(0, 1, name) && (directiveInstance.name = name);
                        directiveRefresh(0, 0);
                    }
                }, 'test directive');
                expect(hostDiv.innerHTML).toBe('<div id="id from test directive"></div>');
            });
            it('should support directives with outputs', function () {
                var Ticker = /** @class */ (function () {
                    function Ticker() {
                        this.counter = 0;
                    }
                    Ticker.prototype.tick = function () {
                        // TALK(bl): was it part of iv?
                        if (this.out) {
                            this.out(++this.counter);
                        }
                    };
                    return Ticker;
                }());
                var ticker;
                var model = {
                    count: 0
                };
                var refreshFn = render(hostDiv, function (rf, ctx) {
                    if (rf & 1 /* Create */) {
                        element(0, 'div');
                        directive(0, 0, Ticker);
                        text(1);
                    }
                    if (rf & 2 /* Update */) {
                        var directiveInstance = (ticker = load(0, 0));
                        // PERF(pk): once again, a closure on each and every change detection :-/
                        directiveInstance.out = function ($event) {
                            ctx.count = $event;
                        };
                        directiveRefresh(0, 0);
                        bindText(1, "" + ctx.count);
                    }
                }, model);
                expect(hostDiv.innerHTML).toBe('<div></div>0');
                ticker.tick();
                refreshFn();
                expect(hostDiv.innerHTML).toBe('<div></div>1');
                ticker.tick();
                ticker.tick();
                refreshFn();
                expect(hostDiv.innerHTML).toBe('<div></div>3');
            });
            describe('host', function () {
                it('should support directives with static host attributes', function () {
                    var IdDirective = /** @class */ (function () {
                        function IdDirective() {
                        }
                        IdDirective.prototype.host = function (rf) {
                            "id=\"static\"";
                            if (rf & 1 /* Create */) {
                                setAttribute(0, 'id', 'static');
                            }
                        };
                        return IdDirective;
                    }());
                    var refreshFn = render(hostDiv, function (rf, ctx) {
                        if (rf & 1 /* Create */) {
                            element(0, 'div');
                            directive(0, 0, IdDirective);
                        }
                        if (rf & 2 /* Update */) {
                            directiveRefresh(0, 0);
                        }
                    });
                    expect(hostDiv.innerHTML).toBe('<div id="static"></div>');
                });
                it('should support directives with host bindings', function () {
                    var IdDirective = /** @class */ (function () {
                        function IdDirective() {
                        }
                        IdDirective.prototype.host = function (rf) {
                            "[id]=\"this.id\"";
                            if (rf & 2 /* Update */) {
                                bindProperty(0, 0, 'id', this.id);
                            }
                        };
                        return IdDirective;
                    }());
                    var refreshFn = render(hostDiv, function (rf, ctx) {
                        if (rf & 1 /* Create */) {
                            element(0, 'div');
                            directive(0, 0, IdDirective);
                        }
                        if (rf & 2 /* Update */) {
                            var dirInstance = load(0, 0);
                            input(0, 2, ctx) && (dirInstance.id = ctx);
                            directiveRefresh(0, 0);
                        }
                    }, 'id from ctx');
                    expect(hostDiv.innerHTML).toBe('<div id="id from ctx"></div>');
                    refreshFn('changed id');
                    expect(hostDiv.innerHTML).toBe('<div id="changed id"></div>');
                });
                it('should support listeners in host', function () {
                    var OnClickDirective = /** @class */ (function () {
                        function OnClickDirective() {
                        }
                        OnClickDirective.prototype.host = function (rf) {
                            "(click)=\"$event.target.id = 'clicked'\"";
                            if (rf & 1 /* Create */) {
                                listener(0, 0, 'click');
                            }
                            if (rf & 2 /* Update */) {
                                listenerRefresh(0, 0, function ($event) {
                                    $event.target.id = 'clicked';
                                });
                            }
                        };
                        return OnClickDirective;
                    }());
                    var refreshFn = render(hostDiv, function (rf, ctx) {
                        if (rf & 1 /* Create */) {
                            element(0, 'div');
                            directive(0, 0, OnClickDirective);
                        }
                        if (rf & 2 /* Update */) {
                            directiveRefresh(0, 0);
                        }
                    });
                    expect(hostDiv.innerHTML).toBe('<div></div>');
                    var divWithDirective = hostDiv.firstChild;
                    divWithDirective.click();
                    expect(hostDiv.innerHTML).toBe('<div id="clicked"></div>');
                });
                it('should set CSS classes in non-destructive way', function () {
                    var Directive = /** @class */ (function () {
                        function Directive() {
                            this.flip = true;
                        }
                        Directive.prototype.host = function (rf) {
                            "class=\"foo\" [class.{}]=\"" + (this.flip ? 'bar' : 'bar2') + "\"";
                            if (rf & 1 /* Create */) {
                                setCSSClass(0, 'bar');
                            }
                            if (rf & 2 /* Update */) {
                                replaceClass(0, 0, this.flip ? 'baz' : 'baz2');
                            }
                        };
                        Directive.prototype.refresh = function (rf) {
                            this.flip = !this.flip;
                        };
                        return Directive;
                    }());
                    var refreshFn = render(hostDiv, function (rf, ctx) {
                        if (rf & 1 /* Create */) {
                            element(0, 'div', ['class', 'foo']);
                            directive(0, 0, Directive);
                        }
                        if (rf & 2 /* Update */) {
                            directiveRefresh(0, 0);
                        }
                    });
                    expect(hostDiv.innerHTML).toBe("<div class=\"foo bar baz\"></div>");
                    refreshFn();
                    expect(hostDiv.innerHTML).toBe("<div class=\"foo bar baz2\"></div>");
                });
            });
            describe('lifecycle hooks', function () {
                it('should support destroy hook on directives', function () {
                    var destroyed = false;
                    var TestDir = /** @class */ (function () {
                        function TestDir() {
                        }
                        TestDir.prototype.destroy = function () {
                            destroyed = true;
                        };
                        return TestDir;
                    }());
                    function app(rf, show) {
                        if (rf & 1 /* Create */) {
                            container(0);
                        }
                        if (rf & 2 /* Update */) {
                            containerRefreshStart(0);
                            if (show) {
                                view(0, 0, function () {
                                    if (rf & 1 /* Create */) {
                                        element(0, 'div');
                                        directive(0, 0, TestDir);
                                    }
                                    if (rf & 2 /* Update */) {
                                        directiveRefresh(0, 0);
                                    }
                                });
                            }
                            containerRefreshEnd(0);
                        }
                    }
                    var refreshFn = render(hostDiv, app, true);
                    expect(hostDiv.innerHTML).toBe('<div></div><!--container 0-->');
                    expect(destroyed).toBeFalsy();
                    refreshFn(false);
                    expect(hostDiv.innerHTML).toBe('<!--container 0-->');
                    expect(destroyed).toBeTruthy();
                });
                it('should support destroy hook on directives in nested views', function () {
                    var destroyed = false;
                    var TestDir = /** @class */ (function () {
                        function TestDir() {
                        }
                        TestDir.prototype.destroy = function () {
                            destroyed = true;
                        };
                        return TestDir;
                    }());
                    function app(rf, show) {
                        if (rf & 1 /* Create */) {
                            container(0);
                        }
                        if (rf & 2 /* Update */) {
                            containerRefreshStart(0);
                            if (show) {
                                view(0, 0, function () {
                                    if (rf & 1 /* Create */) {
                                        container(0);
                                    }
                                    if (rf & 2 /* Update */) {
                                        containerRefreshStart(0);
                                        if (show) {
                                            view(0, 0, function () {
                                                if (rf & 1 /* Create */) {
                                                    element(0, 'div');
                                                    directive(0, 0, TestDir);
                                                }
                                                if (rf & 2 /* Update */) {
                                                    directiveRefresh(0, 0);
                                                }
                                            });
                                        }
                                        containerRefreshEnd(0);
                                    }
                                });
                            }
                            containerRefreshEnd(0);
                        }
                    }
                    var refreshFn = render(hostDiv, app, true);
                    expect(hostDiv.innerHTML).toBe('<div></div><!--container 0--><!--container 0-->');
                    expect(destroyed).toBeFalsy();
                    refreshFn(false);
                    expect(hostDiv.innerHTML).toBe('<!--container 0-->');
                    expect(destroyed).toBeTruthy();
                });
                it('should support destroy hook on directives in component views', function () {
                    var destroyed = false;
                    var TestDir = /** @class */ (function () {
                        function TestDir() {
                        }
                        TestDir.prototype.destroy = function () {
                            destroyed = true;
                        };
                        return TestDir;
                    }());
                    var TestCmpt = /** @class */ (function () {
                        function TestCmpt() {
                        }
                        TestCmpt.prototype.render = function (rf) {
                            if (rf & 1 /* Create */) {
                                element(0, 'div');
                                directive(0, 0, TestDir);
                            }
                            if (rf & 2 /* Update */) {
                                directiveRefresh(0, 0);
                            }
                        };
                        return TestCmpt;
                    }());
                    function app(rf, show) {
                        if (rf & 1 /* Create */) {
                            container(0);
                        }
                        if (rf & 2 /* Update */) {
                            containerRefreshStart(0);
                            if (show) {
                                view(0, 0, function () {
                                    if (rf & 1 /* Create */) {
                                        component(0, 'test-cmpt', TestCmpt);
                                    }
                                    if (rf & 2 /* Update */) {
                                        componentRefresh(0);
                                    }
                                });
                            }
                            containerRefreshEnd(0);
                        }
                    }
                    var refreshFn = render(hostDiv, app, true);
                    expect(hostDiv.innerHTML).toBe('<test-cmpt><div></div></test-cmpt><!--container 0-->');
                    expect(destroyed).toBeFalsy();
                    refreshFn(false);
                    expect(hostDiv.innerHTML).toBe('<!--container 0-->');
                    expect(destroyed).toBeTruthy();
                });
            });
        });
        describe('refs', function () {
            it('should support single reference to an element', function () {
                "\n      <input #i value=\"World\">\n      Hello, {=i.value}!\n      ";
                function tpl(rf) {
                    if (rf & 1 /* Create */) {
                        element(0, 'input', ['value', 'World']);
                        text(1);
                    }
                    if (rf & 2 /* Update */) {
                        var i = loadElementRef(0);
                        bindText(1, "Hello, " + i.value + "!");
                    }
                }
                var refreshFn = render(hostDiv, tpl);
                expect(hostDiv.innerHTML).toBe('<input value="World">Hello, World!');
                refreshFn();
                expect(hostDiv.innerHTML).toBe('<input value="World">Hello, World!');
            });
            it('should support single reference to a directive', function () {
                var Lorem = /** @class */ (function () {
                    function Lorem(_element) {
                        this._element = _element;
                    }
                    Lorem.prototype.generate = function () {
                        this._element.textContent = 'Lorem ipsum';
                    };
                    return Lorem;
                }());
                function tpl(rf) {
                    if (rf & 1 /* Create */) {
                        element(0, 'div');
                        directive(0, 0, Lorem);
                        element(1, 'button');
                        listener(1, 0, 'click');
                    }
                    if (rf & 2 /* Update */) {
                        var l_1 = load(0, 0);
                        directiveRefresh(0, 0);
                        listenerRefresh(1, 0, function ($event) {
                            l_1.generate();
                        });
                    }
                }
                var refreshFn = render(hostDiv, tpl);
                expect(hostDiv.innerHTML).toBe('<div></div><button></button>');
                hostDiv.querySelector('button').click();
                refreshFn();
                expect(hostDiv.innerHTML).toBe('<div>Lorem ipsum</div><button></button>');
            });
        });
        describe('change detection', function () {
            it('should expose refresh all functionality to the root view', function () {
                "<button (click)=\"model.counter++; refreshMe()\">Increment</button>\n      {{model.counter}}";
                function counter(rf, model, refreshMe) {
                    if (rf & 1 /* Create */) {
                        elementStart(0, 'button');
                        {
                            listener(0, 0, 'click');
                            text(1, 'Increment');
                        }
                        elementEnd(0);
                        text(2);
                    }
                    if (rf & 2 /* Update */) {
                        listenerRefresh(0, 0, function () {
                            model.counter++;
                            refreshMe();
                        });
                        bindText(2, "" + model.counter);
                    }
                }
                var extenrnalRefresh = render(hostDiv, counter, { counter: 0 });
                expect(hostDiv.innerHTML).toBe("<button>Increment</button>0");
                hostDiv.querySelector('button').click();
                expect(hostDiv.innerHTML).toBe("<button>Increment</button>1");
                extenrnalRefresh();
                expect(hostDiv.innerHTML).toBe("<button>Increment</button>1");
                hostDiv.querySelector('button').click();
                expect(hostDiv.innerHTML).toBe("<button>Increment</button>2");
            });
            it('should expose refresh all functionality to all child views', function () {
                "<{ if(true) { }>\n        <button (click)=\"model.counter++; refreshMe()\">Increment</button>\n      <{ } }>\n      {{model.counter}}";
                function counter(rf, model) {
                    if (rf & 1 /* Create */) {
                        container(0);
                        text(1);
                    }
                    if (rf & 2 /* Update */) {
                        containerRefreshStart(0);
                        {
                            view(0, 0, function (rf, ctx, refreshSub) {
                                if (rf & 1 /* Create */) {
                                    elementStart(0, 'button');
                                    {
                                        listener(0, 0, 'click');
                                        text(1, 'Increment');
                                    }
                                    elementEnd(0);
                                }
                                if (rf & 2 /* Update */) {
                                    listenerRefresh(0, 0, function () {
                                        model.counter++;
                                        refreshSub();
                                    });
                                }
                            });
                        }
                        containerRefreshEnd(0);
                        bindText(1, "" + model.counter);
                    }
                }
                var extenrnalRefresh = render(hostDiv, counter, { counter: 0 });
                expect(hostDiv.innerHTML).toBe("<button>Increment</button><!--container 0-->0");
                hostDiv.querySelector('button').click();
                expect(hostDiv.innerHTML).toBe("<button>Increment</button><!--container 0-->1");
                extenrnalRefresh();
                expect(hostDiv.innerHTML).toBe("<button>Increment</button><!--container 0-->1");
                hostDiv.querySelector('button').click();
                expect(hostDiv.innerHTML).toBe("<button>Increment</button><!--container 0-->2");
            });
            it('should expose refresh all functionality to components', function () {
                var Counter = /** @class */ (function () {
                    function Counter(nativeEl, _refresh) {
                        this._refresh = _refresh;
                        this.counter = 0;
                    }
                    Counter.prototype.render = function (rf, content, refreshMe) {
                        var _this = this;
                        if (rf & 1 /* Create */) {
                            elementStart(0, 'button');
                            {
                                listener(0, 0, 'click');
                                text(1, 'Increment');
                            }
                            elementEnd(0);
                            text(2);
                        }
                        if (rf & 2 /* Update */) {
                            listenerRefresh(0, 0, function () {
                                _this.counter++;
                                _this._refresh();
                            });
                            bindText(2, "" + this.counter);
                        }
                    };
                    return Counter;
                }());
                function app(rf) {
                    if (rf & 1 /* Create */) {
                        component(0, 'counter', Counter);
                    }
                    if (rf & 2 /* Update */) {
                        componentRefresh(0);
                    }
                }
                var extenrnalRefresh = render(hostDiv, app);
                expect(hostDiv.innerHTML).toBe("<counter><button>Increment</button>0</counter>");
                hostDiv.querySelector('button').click();
                expect(hostDiv.innerHTML).toBe("<counter><button>Increment</button>1</counter>");
            });
            it('should expose refresh all functionality to host listeners', function () {
                var Counter = /** @class */ (function () {
                    function Counter(_nativeEl, _refresh) {
                        this._refresh = _refresh;
                        this.current = 0;
                    }
                    Counter.prototype.host = function (rf) {
                        var _this = this;
                        if (rf & 1 /* Create */) {
                            listener(0, 0, 'click');
                        }
                        if (rf & 2 /* Update */) {
                            listenerRefresh(0, 0, function ($event) {
                                _this.current++;
                                _this._refresh();
                            });
                        }
                    };
                    return Counter;
                }());
                function app(rf) {
                    if (rf & 1 /* Create */) {
                        elementStart(0, 'button');
                        {
                            directive(0, 0, Counter);
                            text(1, 'Increment');
                        }
                        elementEnd(0);
                        text(2);
                    }
                    if (rf & 2 /* Update */) {
                        directiveRefresh(0, 0);
                        var c = load(0, 0);
                        bindText(2, "" + c.current);
                    }
                }
                var extenrnalRefresh = render(hostDiv, app);
                expect(hostDiv.innerHTML).toBe("<button>Increment</button>0");
                hostDiv.querySelector('button').click();
                expect(hostDiv.innerHTML).toBe("<button>Increment</button>1");
            });
        });
    });

}());
