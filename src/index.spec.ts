describe('integration', () => {
  var hostDiv;
  beforeEach(() => {
    hostDiv = document.getElementById('host');
  });

  afterEach(() => {
    hostDiv.innerHTML = '';
  });

  describe('static html', () => {

    it('should render satic HTML', () => {
      render(hostDiv, (rf: RenderFlags, ctx) => {
        if (rf & RenderFlags.Create) {
          element(0, 'div', ['id', 'test_id']);
          text(2, 'some text');
          elementStart(3, 'span');
          elementStart(4, 'i');
          text(5, 'double-nested');
          elementEnd(4);
          text(6, 'nested');
          elementEnd(3);
        }
      });
      expect(hostDiv.innerHTML).toBe('<div id="test_id"></div>some text<span><i>double-nested</i>nested</span>');
    });

  });

  describe('bindings', () => {

    it('should evaluate and update bindings on text nodes', () => {
      const refreshFn = render(hostDiv, (rf: RenderFlags, ctx) => {
        if (rf & RenderFlags.Create) {
          text(0);
        }
        if (rf & RenderFlags.Update) {
          textUpdate(0, 0, `Hello, ${ctx}`);
        }
      }, 'World');

      expect(hostDiv.innerHTML).toBe('Hello, World');

      refreshFn('New World');
      expect(hostDiv.innerHTML).toBe('Hello, New World');
    });
    
    it('should evaluate and update binding to properties', () => {
      const refreshFn = render(hostDiv, (rf: RenderFlags, ctx) => {
        if (rf & RenderFlags.Create) {
          element(0, 'div');
        }
        if (rf & RenderFlags.Update) {
          elementProperty(0, 0, 'id', ctx);
        }
      }, 'initial');

      expect(hostDiv.innerHTML).toBe('<div id="initial"></div>');

      refreshFn('changed');
      expect(hostDiv.innerHTML).toBe('<div id="changed"></div>');
    });

    it('should evaluate and update binding to attributes', () => {
      const refreshFn = render(hostDiv, (rf: RenderFlags, ctx) => {
        if (rf & RenderFlags.Create) {
          element(0, 'div');
        }
        if (rf & RenderFlags.Update) {
          elementAttribute(0, 0, 'aria-label', ctx);
        }
      }, 'initial');

      expect(hostDiv.innerHTML).toBe('<div aria-label="initial"></div>');

      refreshFn('changed');
      expect(hostDiv.innerHTML).toBe('<div aria-label="changed"></div>');
    });

  });

  describe('listeners', () => {

    it('should add DOM event listeners', () => {

      /**
       * <button (click)="counter++">
       *   Increment
       * </button>
       * Counter: {{counter}}
       */
      function tpl(rf: RenderFlags, ctx: {counter: number}) {
        if (rf & RenderFlags.Create) {
          elementStart(0, 'button');
            listener(0, 'click', function() {
              ctx.counter++;
            });
            text(1, 'Increment');
          elementEnd(0);
          text(2);
        }
        if (rf & RenderFlags.Update) {
          textUpdate(2, 0, `Counter: ${ctx.counter}`);
        }
      }

      const ctx = {counter: 0};
      const refreshFn = render(hostDiv, tpl, ctx);
      expect(hostDiv.innerHTML).toBe('<button>Increment</button>Counter: 0');

      hostDiv.querySelector('button').click();
      expect(ctx.counter).toBe(1);
      refreshFn(ctx);
      expect(hostDiv.innerHTML).toBe('<button>Increment</button>Counter: 1');
    });

  });

  describe('containers', () => {

    // TODO(tests to write):
    // - something after the container (so we can check that the state is properly restored)
    // - for / while etc.
    // - switch
    // - inserting / deleting views in the "middle" of a container
    // - sibiling / nested containers

    describe('function calls', () => {

      it('should include result of other functions', () => {
        function externalTpl(rf: RenderFlags, ctx: { name: string }) {
          if (rf & RenderFlags.Create) {
            text(0);
          }
          if (rf & RenderFlags.Update) {
            textUpdate(0, 0, `Hello, ${ctx.name}!`);
          }
        }

        const refreshFn = render(hostDiv, (rf: RenderFlags, ctx: { name: string }) => {
          if (rf & RenderFlags.Create) {
            include(0);
          }
          if (rf & RenderFlags.Update) {
            includeTpl(0, externalTpl, {name: `New ${ctx.name}`});
          }
        }, {name: 'World'});

        expect(hostDiv.innerHTML).toBe('Hello, New World!<!--include 0-->');

        refreshFn({name: 'Context'});
        expect(hostDiv.innerHTML).toBe('Hello, New Context!<!--include 0-->');
      });

    });

    describe('conditionals', () => {

      it('should support if', () => {
        const refreshFn = render(hostDiv, (rf: RenderFlags, show: boolean) => {
          if (rf & RenderFlags.Create) {
            container(0);
          }
          if (rf & RenderFlags.Update) {
            containerRefreshStart(0);
            if (show) {
              // THINK(pk): this assumes that a given container _always_ have the same content...
              // PERF(pk): what is the cost of re-defining functions like this?
              view(0, 0, function f(rf: RenderFlags) {
                if (rf & RenderFlags.Create) {
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

    });

  });

});