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
          textContent(0, 0, `Hello, ${ctx}`);
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
      function tpl(rf: RenderFlags, ctx: { counter: number }) {
        if (rf & RenderFlags.Create) {
          elementStart(0, 'button');
          listener(0, 'click', function () {
            ctx.counter++;
          });
          text(1, 'Increment');
          elementEnd(0);
          text(2);
        }
        if (rf & RenderFlags.Update) {
          textContent(2, 0, `Counter: ${ctx.counter}`);
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
            textContent(0, 0, `Hello, ${ctx.name}!`);
          }
        }

        const refreshFn = render(hostDiv, (rf: RenderFlags, ctx: { name: string }) => {
          if (rf & RenderFlags.Create) {
            container(0);
          }
          if (rf & RenderFlags.Update) {
            include(0, externalTpl, {name: `New ${ctx.name}`});
          }
        }, {name: 'World'});

        expect(hostDiv.innerHTML).toBe('Hello, New World!<!--container 0-->');

        refreshFn({name: 'Context'});
        expect(hostDiv.innerHTML).toBe('Hello, New Context!<!--container 0-->');
      });

      it('should allow nodes around function calls', () => {
        function externalTpl(rf: RenderFlags, ctx: { name: string }) {
          if (rf & RenderFlags.Create) {
            text(0);
          }
          if (rf & RenderFlags.Update) {
            textContent(0, 0, `Hello, ${ctx.name}!`);
          }
        }

        const refreshFn = render(hostDiv, (rf: RenderFlags, ctx: { name: string }) => {
          if (rf & RenderFlags.Create) {
            element(0, 'div', ['id', 'before']);
            elementStart(1, 'span');
            {
              container(2);
            }
            elementEnd(1);
            element(3, 'div', ['id', 'after']);
          }
          if (rf & RenderFlags.Update) {
            include(2, externalTpl, {name: `World`});
          }
        });

        expect(hostDiv.innerHTML).toBe(`<div id="before"></div><span>Hello, World!<!--container 2--></span><div id="after"></div>`);
      });

      it('should remove nodes when function reference flips to falsy', () => {

        function externalTpl(rf: RenderFlags) {
          if (rf & RenderFlags.Create) {
            text(0, 'from fn');
          }
        }

        const refreshFn = render(hostDiv, (rf: RenderFlags, show: boolean) => {
          if (rf & RenderFlags.Create) {
            container(0);
          }
          if (rf & RenderFlags.Update) {
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

      it('should support refreshing conditionally inserted views', () => {

        const refreshFn = render(hostDiv, (rf: RenderFlags, name: string) => {
          if (rf & RenderFlags.Create) {
            container(0);
          }
          if (rf & RenderFlags.Update) {
            containerRefreshStart(0);
            if (true) {
              // THINK(pk): this assumes that a given container _always_ have the same content...
              // PERF(pk): what is the cost of re-defining functions like this?
              view(0, 0, function f(rf: RenderFlags) {
                if (rf & RenderFlags.Create) {
                  text(0);
                }
                if (rf & RenderFlags.Update) {
                  textContent(0, 0, `Hello, ${name}!`)
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

    describe('loops', () => {

      it('should support for loops with index', () => {

        const ctx = ['one', 'two', 'three'];

        /**
         *  for (let i = 0; i < items.length; i++) {
         *    {{i}}-{{items[i]}}-
         *  }
         */
        const refreshFn = render(hostDiv, (rf: RenderFlags, items: string[]) => {
          if (rf & RenderFlags.Create) {
            container(0);
          }
          if (rf & RenderFlags.Update) {
            containerRefreshStart(0);
            for (let i = 0; i < items.length; i++) {
              view(0, 0, function f(rf: RenderFlags) {
                if (rf & RenderFlags.Create) {
                  text(0);
                  text(1, '-');
                  text(2);
                  text(3, '-');
                }
                if (rf & RenderFlags.Update) {
                  textContent(0, 0, `${i}`);
                  textContent(2, 0, items[i]);
                }
              });
            }
            containerRefreshEnd(0);
          }
        }, ctx);


        expect(hostDiv.innerHTML).toBe('0-one-1-two-2-three-<!--container 0-->');

        ctx.splice(1, 1);
        refreshFn(ctx);
        expect(hostDiv.innerHTML).toBe('0-one-1-three-<!--container 0-->');
      });

      it('should support for-of loops', () => {

        const ctx = ['one', 'two', 'three'];

        /**
         *  for (let item of items) {
         *    {{item}}-
         *  }
         */
        const refreshFn = render(hostDiv, (rf: RenderFlags, items: string[]) => {
          if (rf & RenderFlags.Create) {
            container(0);
          }
          if (rf & RenderFlags.Update) {
            containerRefreshStart(0);
            for (let item of items) {
              view(0, 0, function f(rf: RenderFlags) {
                if (rf & RenderFlags.Create) {
                  text(0);
                  text(1, '-');
                }
                if (rf & RenderFlags.Update) {
                  textContent(0, 0, item);
                }
              });
            }
            containerRefreshEnd(0);
          }
        }, ctx);

        expect(hostDiv.innerHTML).toBe('one-two-three-<!--container 0-->');

        ctx.splice(1, 1);
        refreshFn(ctx);
        expect(hostDiv.innerHTML).toBe('one-three-<!--container 0-->');
      });

    });

  });

});