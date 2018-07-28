describe("integration", () => {
  let hostDiv: HTMLDivElement;
  beforeEach(() => {
    hostDiv = document.getElementById("host") as HTMLDivElement;
  });

  afterEach(() => {
    hostDiv.innerHTML = "";
  });

  describe("static html", () => {
    it("should render static HTML", () => {
      render(hostDiv, (rf: RenderFlags, ctx) => {
        if (rf & RenderFlags.Create) {
          element(0, "div", ["id", "test_id"]);
          text(2, "some text");
          elementStart(3, "span");
          {
            elementStart(4, "i");
            {
              text(5, "double-nested");
            }
            elementEnd(4);
          }
          text(6, "nested");
          elementEnd(3);
        }
      });
      expect(hostDiv.innerHTML).toBe('<div id="test_id"></div>some text<span><i>double-nested</i>nested</span>');
    });

    it("should support multiple applications in parallel", () => {
      const app1Host = document.createElement("div");
      const app2Host = document.createElement("div");

      hostDiv.appendChild(app1Host);
      hostDiv.appendChild(document.createElement("hr"));
      hostDiv.appendChild(app2Host);

      function app(rf: RenderFlags, name: string) {
        if (rf & RenderFlags.Create) {
          text(0);
        }
        if (rf & RenderFlags.Update) {
          textContent(0, name);
        }
      }

      let app1Refresh = render(app1Host, app, "1");
      let app2Refresh = render(app2Host, app, "2");

      expect(hostDiv.innerHTML).toBe("<div>1</div><hr><div>2</div>");

      app1Refresh("1 updated");
      expect(hostDiv.innerHTML).toBe("<div>1 updated</div><hr><div>2</div>");

      app2Refresh("2 updated");
      expect(hostDiv.innerHTML).toBe("<div>1 updated</div><hr><div>2 updated</div>");
    });
  });

  describe("bindings", () => {
    it("should evaluate and update bindings on text nodes", () => {
      const refreshFn = render(
        hostDiv,
        (rf: RenderFlags, ctx) => {
          if (rf & RenderFlags.Create) {
            text(0);
          }
          if (rf & RenderFlags.Update) {
            textContent(0, `Hello, ${ctx}`);
          }
        },
        "World"
      );

      expect(hostDiv.innerHTML).toBe("Hello, World");

      refreshFn("New World");
      expect(hostDiv.innerHTML).toBe("Hello, New World");
    });

    it("should evaluate and update binding to properties", () => {
      const refreshFn = render(
        hostDiv,
        (rf: RenderFlags, ctx) => {
          if (rf & RenderFlags.Create) {
            element(0, "div");
          }
          if (rf & RenderFlags.Update) {
            elementProperty(0, 0, "id", ctx);
          }
        },
        "initial"
      );

      expect(hostDiv.innerHTML).toBe('<div id="initial"></div>');

      refreshFn("changed");
      expect(hostDiv.innerHTML).toBe('<div id="changed"></div>');
    });

    it("should evaluate and update binding to attributes", () => {
      const refreshFn = render(
        hostDiv,
        (rf: RenderFlags, ctx) => {
          if (rf & RenderFlags.Create) {
            element(0, "div");
          }
          if (rf & RenderFlags.Update) {
            elementAttribute(0, 0, "aria-label", ctx);
          }
        },
        "initial"
      );

      expect(hostDiv.innerHTML).toBe('<div aria-label="initial"></div>');

      refreshFn("changed");
      expect(hostDiv.innerHTML).toBe('<div aria-label="changed"></div>');
    });

    it("should toggle CSS class", () => {
      `<div [class.show]="shouldShow">`;
      const refreshFn = render(
        hostDiv,
        (rf: RenderFlags, shouldShow: boolean) => {
          if (rf & RenderFlags.Create) {
            element(0, "div");
          }
          if (rf & RenderFlags.Update) {
            elementClass(0, 0, "show", shouldShow);
          }
        },
        false
      );

      expect(hostDiv.innerHTML).toBe("<div></div>");

      refreshFn(true);
      expect(hostDiv.innerHTML).toBe('<div class="show"></div>');

      refreshFn(false);
      expect(hostDiv.innerHTML).toBe('<div class=""></div>');
    });

    it("should properly support binding on nested elements", () => {
      const refreshFn = render(
        hostDiv,
        (rf: RenderFlags, ctx) => {
          if (rf & RenderFlags.Create) {
            elementStart(0, "div");
            element(1, "span");
            elementEnd(0);
          }
          if (rf & RenderFlags.Update) {
            elementProperty(0, 0, "id", ctx + "_for_div");
            elementProperty(1, 0, "id", ctx + "_for_span");
          }
        },
        "initial"
      );

      expect(hostDiv.innerHTML).toBe('<div id="initial_for_div"><span id="initial_for_span"></span></div>');

      refreshFn("changed");
      expect(hostDiv.innerHTML).toBe('<div id="changed_for_div"><span id="changed_for_span"></span></div>');
    });
  });

  describe("listeners", () => {
    it("should add DOM event listeners", () => {
      /**
       * <button (click)="counter++">
       *   Increment
       * </button>
       * Counter: {{counter}}
       */
      function tpl(rf: RenderFlags, ctx: { counter: number }) {
        if (rf & RenderFlags.Create) {
          elementStart(0, "button");
          {
            listener(0, 0, "click");
            text(1, "Increment");
          }
          elementEnd(0);
          text(2);
        }
        if (rf & RenderFlags.Update) {
          listenerRefresh(0, 0, function() {
            ctx.counter++;
          });
          textContent(2, `Counter: ${ctx.counter}`);
        }
      }

      const ctx = { counter: 0 };
      const refreshFn = render(hostDiv, tpl, ctx);
      expect(hostDiv.innerHTML).toBe("<button>Increment</button>Counter: 0");

      hostDiv.querySelector("button").click();
      expect(ctx.counter).toBe(1);
      refreshFn(ctx);
      expect(hostDiv.innerHTML).toBe("<button>Increment</button>Counter: 1");
    });

    it("should be able to access closure data and event in the event handler", () => {
      let moduleCtx: string;

      `
        {% let foo = 'bar'; %}
        <button (click)="moduleCtx = foo"></button>
      `;
      function tpl(rf: RenderFlags) {
        if (rf & RenderFlags.Create) {
          element(0, "button");
          listener(0, 0, "click");
        }
        if (rf & RenderFlags.Update) {
          let foo = "bar";
          listenerRefresh(0, 0, function($event) {
            moduleCtx = foo;
            expect($event.target).toBeDefined();
          });
        }
      }

      const refreshFn = render(hostDiv, tpl);

      hostDiv.querySelector("button").click();
      expect(moduleCtx).toBe("bar");
    });
  });

  describe("containers", () => {
    describe("function calls", () => {
      it("should include result of other functions", () => {
        function externalTpl(rf: RenderFlags, ctx: { name: string }) {
          if (rf & RenderFlags.Create) {
            text(0);
          }
          if (rf & RenderFlags.Update) {
            textContent(0, `Hello, ${ctx.name}!`);
          }
        }

        const refreshFn = render(
          hostDiv,
          (rf: RenderFlags, ctx: { name: string }) => {
            if (rf & RenderFlags.Create) {
              container(0);
            }
            if (rf & RenderFlags.Update) {
              include(0, externalTpl, { name: `New ${ctx.name}` });
            }
          },
          { name: "World" }
        );

        expect(hostDiv.innerHTML).toBe("Hello, New World!<!--container 0-->");

        refreshFn({ name: "Context" });
        expect(hostDiv.innerHTML).toBe("Hello, New Context!<!--container 0-->");
      });

      it("should allow nodes around function calls", () => {
        function externalTpl(rf: RenderFlags, ctx: { name: string }) {
          if (rf & RenderFlags.Create) {
            text(0);
          }
          if (rf & RenderFlags.Update) {
            textContent(0, `Hello, ${ctx.name}!`);
          }
        }

        const refreshFn = render(hostDiv, (rf: RenderFlags, ctx: { name: string }) => {
          if (rf & RenderFlags.Create) {
            element(0, "div", ["id", "before"]);
            elementStart(1, "span");
            {
              container(2);
            }
            elementEnd(1);
            element(3, "div", ["id", "after"]);
          }
          if (rf & RenderFlags.Update) {
            include(2, externalTpl, { name: `World` });
          }
        });

        expect(hostDiv.innerHTML).toBe(
          `<div id="before"></div><span>Hello, World!<!--container 2--></span><div id="after"></div>`
        );
      });

      it("should remove nodes when function reference flips to falsy", () => {
        function externalTpl(rf: RenderFlags) {
          if (rf & RenderFlags.Create) {
            text(0, "from fn");
          }
        }

        const refreshFn = render(
          hostDiv,
          (rf: RenderFlags, show: boolean) => {
            if (rf & RenderFlags.Create) {
              container(0);
            }
            if (rf & RenderFlags.Update) {
              include(0, show ? externalTpl : null);
            }
          },
          false
        );

        expect(hostDiv.innerHTML).toBe("<!--container 0-->");

        refreshFn(true);
        expect(hostDiv.innerHTML).toBe("from fn<!--container 0-->");

        refreshFn(false);
        expect(hostDiv.innerHTML).toBe("<!--container 0-->");
      });
    });

    describe("conditionals", () => {
      it("should support if", () => {
        const refreshFn = render(
          hostDiv,
          (rf: RenderFlags, show: boolean) => {
            if (rf & RenderFlags.Create) {
              container(0);
            }
            if (rf & RenderFlags.Update) {
              containerRefreshStart(0);
              if (show) {
                view(0, 0, function f(rf: RenderFlags) {
                  if (rf & RenderFlags.Create) {
                    text(0, "Shown conditionally");
                  }
                });
              }
              containerRefreshEnd(0);
            }
          },
          false
        );

        expect(hostDiv.innerHTML).toBe("<!--container 0-->");

        refreshFn(true);
        expect(hostDiv.innerHTML).toBe("Shown conditionally<!--container 0-->");

        refreshFn(false);
        expect(hostDiv.innerHTML).toBe("<!--container 0-->");
      });

      it("should support if / else", () => {
        /**
         * % if (show) {
         *  shown
         * % } else {
         *  hidden
         * % }
         */
        const refreshFn = render(
          hostDiv,
          (rf: RenderFlags, show: boolean) => {
            if (rf & RenderFlags.Create) {
              container(0);
            }
            if (rf & RenderFlags.Update) {
              containerRefreshStart(0);
              if (show) {
                view(0, 0, function f(rf: RenderFlags) {
                  if (rf & RenderFlags.Create) {
                    text(0, "shown");
                  }
                });
              } else {
                view(0, 1, function f(rf: RenderFlags) {
                  if (rf & RenderFlags.Create) {
                    text(0, "hidden");
                  }
                });
              }
              containerRefreshEnd(0);
            }
          },
          false
        );

        expect(hostDiv.innerHTML).toBe("hidden<!--container 0-->");

        refreshFn(true);
        expect(hostDiv.innerHTML).toBe("shown<!--container 0-->");

        refreshFn(false);
        expect(hostDiv.innerHTML).toBe("hidden<!--container 0-->");
      });

      it("should support nested ifs", () => {
        const ctx = {
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
        const refreshFn = render(
          hostDiv,
          (rf: RenderFlags, ctx: { outer: boolean; inner: boolean }) => {
            if (rf & RenderFlags.Create) {
              container(0);
            }
            if (rf & RenderFlags.Update) {
              containerRefreshStart(0);
              if (ctx.outer) {
                view(0, 0, function f(rf: RenderFlags) {
                  if (rf & RenderFlags.Create) {
                    text(0, "outer shown|");
                    container(1);
                    text(2, "|");
                  }
                  if (rf & RenderFlags.Update) {
                    containerRefreshStart(1);
                    if (ctx.inner) {
                      view(1, 0, function f(rf: RenderFlags) {
                        if (rf & RenderFlags.Create) {
                          text(0, "inner shown");
                        }
                      });
                    }
                    containerRefreshEnd(1);
                  }
                });
              }
              containerRefreshEnd(0);
            }
          },
          ctx
        );

        expect(hostDiv.innerHTML).toBe("<!--container 0-->");

        ctx.inner = true;
        refreshFn(ctx);
        expect(hostDiv.innerHTML).toBe("<!--container 0-->");

        ctx.outer = true;
        refreshFn(ctx);
        expect(hostDiv.innerHTML).toBe("outer shown|inner shown<!--container 1-->|<!--container 0-->");

        ctx.inner = false;
        refreshFn(ctx);
        expect(hostDiv.innerHTML).toBe("outer shown|<!--container 1-->|<!--container 0-->");

        ctx.inner = true;
        refreshFn(ctx);
        expect(hostDiv.innerHTML).toBe("outer shown|inner shown<!--container 1-->|<!--container 0-->");

        ctx.outer = false;
        refreshFn(ctx);
        expect(hostDiv.innerHTML).toBe("<!--container 0-->");
      });

      it("should support sibling ifs", () => {
        const ctx = {
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
        const refreshFn = render(
          hostDiv,
          (rf: RenderFlags, ctx: { first: boolean; second: boolean }) => {
            if (rf & RenderFlags.Create) {
              container(0);
              text(1, "|");
              container(2);
            }
            if (rf & RenderFlags.Update) {
              containerRefreshStart(0);
              if (ctx.first) {
                view(0, 0, function f(rf: RenderFlags) {
                  if (rf & RenderFlags.Create) {
                    text(0, "first");
                  }
                });
              }
              containerRefreshEnd(0);
              containerRefreshStart(2);
              if (ctx.second) {
                view(2, 0, function f(rf: RenderFlags) {
                  if (rf & RenderFlags.Create) {
                    text(0, "second");
                  }
                });
              }
              containerRefreshEnd(2);
            }
          },
          ctx
        );

        expect(hostDiv.innerHTML).toBe("<!--container 0-->|<!--container 2-->");

        ctx.second = true;
        refreshFn(ctx);
        expect(hostDiv.innerHTML).toBe("<!--container 0-->|second<!--container 2-->");

        ctx.first = true;
        refreshFn(ctx);
        expect(hostDiv.innerHTML).toBe("first<!--container 0-->|second<!--container 2-->");

        ctx.second = false;
        refreshFn(ctx);
        expect(hostDiv.innerHTML).toBe("first<!--container 0-->|<!--container 2-->");
      });

      it("should support refreshing conditionally inserted views", () => {
        const refreshFn = render(
          hostDiv,
          (rf: RenderFlags, name: string) => {
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
                    textContent(0, `Hello, ${name}!`);
                  }
                });
              }
              containerRefreshEnd(0);
            }
          },
          "World"
        );

        expect(hostDiv.innerHTML).toBe("Hello, World!<!--container 0-->");

        refreshFn("New World");
        expect(hostDiv.innerHTML).toBe("Hello, New World!<!--container 0-->");
      });
    });

    describe("loops", () => {
      it("should support for loops with index", () => {
        const ctx = ["one", "two", "three"];

        /**
         *  for (let i = 0; i < items.length; i++) {
         *    {{i}}-{{items[i]}}-
         *  }
         */
        const refreshFn = render(
          hostDiv,
          (rf: RenderFlags, items: string[]) => {
            if (rf & RenderFlags.Create) {
              container(0);
            }
            if (rf & RenderFlags.Update) {
              containerRefreshStart(0);
              for (let i = 0; i < items.length; i++) {
                view(0, 0, function f(rf: RenderFlags) {
                  if (rf & RenderFlags.Create) {
                    text(0);
                    text(1, "-");
                    text(2);
                    text(3, "-");
                  }
                  if (rf & RenderFlags.Update) {
                    textContent(0, `${i}`);
                    textContent(2, items[i]);
                  }
                });
              }
              containerRefreshEnd(0);
            }
          },
          ctx
        );

        expect(hostDiv.innerHTML).toBe("0-one-1-two-2-three-<!--container 0-->");

        ctx.splice(1, 1);
        refreshFn(ctx);
        expect(hostDiv.innerHTML).toBe("0-one-1-three-<!--container 0-->");
      });

      it("should support for-of loops", () => {
        const ctx = ["one", "two", "three"];

        /**
         *  for (let item of items) {
         *    {{item}}-
         *  }
         */
        const refreshFn = render(
          hostDiv,
          (rf: RenderFlags, items: string[]) => {
            if (rf & RenderFlags.Create) {
              container(0);
            }
            if (rf & RenderFlags.Update) {
              containerRefreshStart(0);
              for (let item of items) {
                view(0, 0, function f(rf: RenderFlags) {
                  if (rf & RenderFlags.Create) {
                    text(0);
                    text(1, "-");
                  }
                  if (rf & RenderFlags.Update) {
                    textContent(0, item);
                  }
                });
              }
              containerRefreshEnd(0);
            }
          },
          ctx
        );

        expect(hostDiv.innerHTML).toBe("one-two-three-<!--container 0-->");

        ctx.splice(1, 1);
        refreshFn(ctx);
        expect(hostDiv.innerHTML).toBe("one-three-<!--container 0-->");
      });

      it("should support while loops", () => {
        const fruits = ["apple", "banana", "orange"];

        `
        {%
          let i = 0;
          while (i < fruits.length) {
          %} {=fruits[i]}- {%  
            i++;
          }
        %}
        `;
        const refreshFn = render(
          hostDiv,
          (rf: RenderFlags, fruits: string[]) => {
            if (rf & RenderFlags.Create) {
              container(0);
            }
            if (rf & RenderFlags.Update) {
              containerRefreshStart(0);
              let i = 0;
              while (i < fruits.length) {
                view(0, 0, function f(rf: RenderFlags) {
                  if (rf & RenderFlags.Create) {
                    text(0);
                    text(1, "-");
                  }
                  if (rf & RenderFlags.Update) {
                    textContent(0, fruits[i]);
                  }
                });
                i++;
              }
              containerRefreshEnd(0);
            }
          },
          fruits
        );

        expect(hostDiv.innerHTML).toBe("apple-banana-orange-<!--container 0-->");

        fruits.splice(1, 1);
        refreshFn(fruits);
        expect(hostDiv.innerHTML).toBe("apple-orange-<!--container 0-->");
      });
    });

    describe("switch", () => {
      it("should support switch", () => {
        `
        {% switch(fruit) {
          case 'apple': { %}
            Ripe apple!
          {%
            break;
          }
          case 'banana': { %}
            Yellow banana
          {%
            break;
          }
        } %}
        `;
        const refreshFn = render(
          hostDiv,
          (rf: RenderFlags, fruit: string) => {
            if (rf & RenderFlags.Create) {
              container(0);
            }
            if (rf & RenderFlags.Update) {
              containerRefreshStart(0);
              switch (fruit) {
                case "apple": {
                  view(0, 0, function(rf: RenderFlags) {
                    if (rf & RenderFlags.Create) {
                      text(0, "Ripe apple");
                    }
                  });
                  break;
                }
                case "banana": {
                  view(0, 1, function(rf: RenderFlags) {
                    if (rf & RenderFlags.Create) {
                      text(0, "Yellow banana");
                    }
                  });
                  break;
                }
              }
              containerRefreshEnd(0);
            }
          },
          "apple"
        );

        expect(hostDiv.innerHTML).toBe("Ripe apple<!--container 0-->");

        refreshFn("banana");
        expect(hostDiv.innerHTML).toBe("Yellow banana<!--container 0-->");

        refreshFn("exotic");
        expect(hostDiv.innerHTML).toBe("<!--container 0-->");

        refreshFn("banana");
        expect(hostDiv.innerHTML).toBe("Yellow banana<!--container 0-->");
      });
    });
  });

  describe("components", () => {
    it("should support components", () => {
      class TestComponent {
        /**
         * Hello, Component!
         */
        render(rf: RenderFlags, ctx: TestComponent) {
          if (rf & RenderFlags.Create) {
            text(0, "Hello, Component!");
          }
        }
      }

      /**
       * <TestComponent></TestComponent>
       * <hr>
       * <TestComponent></TestComponent>
       */
      const refreshFn = render(hostDiv, (rf: RenderFlags, ctx) => {
        if (rf & RenderFlags.Create) {
          component(0, "test-component", TestComponent);
          element(1, "hr");
          component(2, "test-component", TestComponent);
        }
        if (rf & RenderFlags.Update) {
          componentRefresh(0);
          componentRefresh(2);
        }
      });

      expect(hostDiv.innerHTML).toBe(
        "<test-component>Hello, Component!</test-component><hr><test-component>Hello, Component!</test-component>"
      );
    });

    it("should support components at the root of a view", () => {
      class Test {
        render(rf: RenderFlags) {
          if (rf & RenderFlags.Create) {
            text(0, "test");
          }
        }
      }

      /**
       * % if (show) {
       *  <Test></Test>
       * }
       */
      const refreshFn = render(
        hostDiv,
        function(rf: RenderFlags, show: boolean) {
          if (rf & RenderFlags.Create) {
            container(0);
          }
          if (rf & RenderFlags.Update) {
            containerRefreshStart(0);
            {
              if (show) {
                view(0, 0, function(rf: RenderFlags) {
                  if (rf & RenderFlags.Create) {
                    component(0, "test", Test);
                  }
                  if (rf & RenderFlags.Update) {
                    componentRefresh(0);
                  }
                });
              }
            }
            containerRefreshEnd(0);
          }
        },
        false
      );

      expect(hostDiv.innerHTML).toBe("<!--container 0-->");

      refreshFn(true);
      expect(hostDiv.innerHTML).toBe("<test>test</test><!--container 0-->");

      refreshFn(false);
      expect(hostDiv.innerHTML).toBe("<!--container 0-->");

      refreshFn(true);
      expect(hostDiv.innerHTML).toBe("<test>test</test><!--container 0-->");
    });

    it("should support components with inputs", () => {
      const ctx = { name: "World" };

      class TestComponent {
        name = "Anonymous";

        /**
         * Hello, {{name}}!
         */
        render(rf: RenderFlags, ctx: TestComponent) {
          if (rf & RenderFlags.Create) {
            text(0);
          }
          if (rf & RenderFlags.Update) {
            textContent(0, `Hello, ${ctx.name}!`);
          }
        }
      }

      /**
       * <TestComponent [name]="name"></TestComponent>
       */
      const refreshFn = render(
        hostDiv,
        (rf: RenderFlags, ctx) => {
          if (rf & RenderFlags.Create) {
            // TODO(pk): element creation could be probably in-lined into component() instruction
            component(0, "test-component", TestComponent);
          }
          if (rf & RenderFlags.Update) {
            const componentInstance = load<TestComponent>(0, 0);
            input(0, 1, ctx.name) && (componentInstance.name = ctx.name);
            componentRefresh(0);
          }
        },
        ctx
      );

      expect(hostDiv.innerHTML).toBe("<test-component>Hello, World!</test-component>");

      ctx.name = "New World";
      refreshFn(ctx);
      expect(hostDiv.innerHTML).toBe("<test-component>Hello, New World!</test-component>");
    });

    it("should support default slot", () => {
      class TestComponent {
        /**
         * Hello, <x-slot></x-slot>!
         */
        render(rf: RenderFlags, ctx: TestComponent, $contentGroup: VNode) {
          if (rf & RenderFlags.Create) {
            text(0, "Hello, ");
            elementStart(1, "span");
            {
              slot(2);
            }
            elementEnd(1);
            text(3, "!");
          }
          if (rf & RenderFlags.Update) {
            slotRefresh(2, $contentGroup);
          }
        }
      }

      /**
       * <TestComponent>{{name}}</TestComponent>
       */
      const refreshFn = render(
        hostDiv,
        (rf: RenderFlags, name: string) => {
          if (rf & RenderFlags.Create) {
            // TODO(pk): element creation could be probably in-lined into component() instruction
            componentStart(0, "test-component", TestComponent);
            text(1);
            componentEnd(0);
          }
          if (rf & RenderFlags.Update) {
            textContent(1, name);
            componentRefresh(0);
          }
        },
        "World"
      );

      expect(hostDiv.innerHTML).toBe("<test-component>Hello, <span>World<!--slot 2--></span>!</test-component>");

      refreshFn("New World");
      expect(hostDiv.innerHTML).toBe("<test-component>Hello, <span>New World<!--slot 2--></span>!</test-component>");
    });

    it("should support named slots", () => {
      class Card {
        /**
         * <h1>
         *   <x-slot name="header"></x-slot>
         * </h1>
         * <div>
         *   <x-slot name="content"></x-slot>
         * </div>
         */
        render(rf: RenderFlags, ctx: Card, $contentGroup: VNode) {
          if (rf & RenderFlags.Create) {
            elementStart(0, "h1");
            {
              slot(1);
            }
            elementEnd(0);
            elementStart(2, "div");
            {
              slot(3);
            }
            elementEnd(2);
          }
          if (rf & RenderFlags.Update) {
            slotRefresh(1, $contentGroup, "header");
            slotRefresh(3, $contentGroup, "content");
          }
        }
      }

      /**
       * <Card>
       *   <:header>Title</:header>
       *   <:content>Content</:content>
       * </Card>
       */
      const refreshFn = render(hostDiv, (rf: RenderFlags, name: string) => {
        if (rf & RenderFlags.Create) {
          componentStart(0, "card", Card);
          {
            slotableStart(1, "header");
            {
              text(2, "Title");
            }
            slotableEnd(1);
            slotableStart(3, "content");
            {
              text(4, "Content");
            }
            slotableEnd(3);
          }
          componentEnd(0);
        }
        if (rf & RenderFlags.Update) {
          componentRefresh(0);
        }
      });

      expect(hostDiv.innerHTML).toBe("<card><h1>Title<!--slot 1--></h1><div>Content<!--slot 3--></div></card>");
    });

    it("should support named slots at the component view root", () => {
      `<Test><:foo>foo<:/foo></Test>`;
      class Test {
        render(rf: RenderFlags, ctx: Test, $contentGroup: VNode) {
          if (rf & RenderFlags.Create) {
            slot(0);
          }
          if (rf & RenderFlags.Update) {
            slotRefresh(0, $contentGroup, "foo");
          }
        }
      }

      `<x-slot name="foo"></x-slot>`;
      const refreshFn = render(hostDiv, (rf: RenderFlags, name: string) => {
        if (rf & RenderFlags.Create) {
          componentStart(0, "test", Test);
          {
            slotableStart(1, "foo");
            {
              text(2, "foo");
            }
            slotableEnd(1);
          }
          componentEnd(0);
        }
        if (rf & RenderFlags.Update) {
          componentRefresh(0);
        }
      });

      expect(hostDiv.innerHTML).toBe("<test>foo<!--slot 0--></test>");
    });

    it("should support mix of named and default slots", () => {
      class Card {
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
        render(rf: RenderFlags, ctx: Card, $contentGroup: VNode) {
          if (rf & RenderFlags.Create) {
            elementStart(0, "h1");
            {
              slot(1);
            }
            elementEnd(0);
            elementStart(2, "div");
            {
              slot(3);
            }
            elementEnd(2);
            elementStart(4, "footer");
            {
              slot(5);
            }
            elementEnd(4);
          }
          if (rf & RenderFlags.Update) {
            slotRefresh(1, $contentGroup, "header");
            slotRefresh(3, $contentGroup);
            slotRefresh(5, $contentGroup, "footer");
          }
        }
      }

      /**
       * <Card>
       *   <:header>Title</:header>
       *   Content
       *   <:footer>Bottom</:footer>
       * </Card>
       */
      const refreshFn = render(hostDiv, (rf: RenderFlags, name: string) => {
        if (rf & RenderFlags.Create) {
          componentStart(0, "card", Card);
          {
            slotableStart(1, "header");
            {
              text(2, "Title");
            }
            slotableEnd(1);
            text(3, "Content");
            slotableStart(4, "footer");
            {
              text(5, "Bottom");
            }
            slotableEnd(4);
          }
          componentEnd(0);
        }
        if (rf & RenderFlags.Update) {
          componentRefresh(0);
        }

        expect(hostDiv.innerHTML).toBe(
          "<card><h1>Title<!--slot 1--></h1><div>Content<!--slot 3--></div><footer>Bottom<!--slot 5--></footer></card>"
        );
      });
    });

    it("should support multiple slottables with the same name (static)", () => {
      `
      <x-slot name="item"></x-slot>
      `;
      class Menu {
        render(rf: RenderFlags, ctx: Menu, $contentGroup: VNode) {
          if (rf & RenderFlags.Create) {
            elementStart(0, "span");
            {
              slot(1);
            }
            elementEnd(0);
          }
          if (rf & RenderFlags.Update) {
            slotRefresh(1, $contentGroup, "item");
          }
        }
      }

      `
      <Menu>
        <:item>one</:item>
        <:item>two</:item>
      </Menu>
      `;
      const refreshFn = render(hostDiv, (rf: RenderFlags, name: string) => {
        if (rf & RenderFlags.Create) {
          componentStart(0, "menu", Menu);
          {
            slotableStart(1, "item");
            {
              text(2, "one");
            }
            slotableEnd(1);
            slotableStart(3, "item");
            {
              text(4, "two");
            }
            slotableEnd(3);
          }
          componentEnd(0);
        }
        if (rf & RenderFlags.Update) {
          componentRefresh(0);
        }
      });

      expect(hostDiv.innerHTML).toBe("<menu><span>onetwo<!--slot 1--></span></menu>");
    });

    it("should support conditional named slots", () => {
      `
      {% if (show) { %}
        <x-slot name="foo"></x-slot>
      {% } %} `;
      class Test {
        show = false;
        render(rf: RenderFlags, ctx: Test, $contentGroup: VNode) {
          if (rf & RenderFlags.Create) {
            container(0);
          }
          if (rf & RenderFlags.Update) {
            containerRefreshStart(0);
            {
              if (ctx.show) {
                view(0, 0, (rf: RenderFlags) => {
                  if (rf & RenderFlags.Create) {
                    slot(0);
                  }
                  if (rf & RenderFlags.Update) {
                    slotRefresh(0, $contentGroup, "foo");
                  }
                });
              }
            }
            containerRefreshEnd(0);
          }
        }
      }

      `<Test><:foo>foo<:/foo></Test>`;
      const refreshFn = render(
        hostDiv,
        (rf: RenderFlags, show: boolean) => {
          if (rf & RenderFlags.Create) {
            componentStart(0, "test", Test);
            {
              slotableStart(1, "foo");
              {
                text(2, "foo");
              }
              slotableEnd(1);
            }
            componentEnd(0);
          }
          if (rf & RenderFlags.Update) {
            const componentInstance = load<Test>(0, 0);
            input(0, 1, show) && (componentInstance.show = show);
            componentRefresh(0);
          }
        },
        false
      );

      expect(hostDiv.innerHTML).toBe("<test><!--container 0--></test>");

      refreshFn(true);
      expect(hostDiv.innerHTML).toBe("<test>foo<!--slot 0--><!--container 0--></test>");

      //refreshFn(false);
      //expect(hostDiv.innerHTML).toBe("<test><!--container 0--></test>");
    });

    it("should support conditional named slottables", () => {
      `<x-slot name="foo"></x-slot>`;
      class Test {
        render(rf: RenderFlags, ctx: Test, $contentGroup: VNode) {
          if (rf & RenderFlags.Create) {
            slot(0);
          }
          if (rf & RenderFlags.Update) {
            slotRefresh(0, $contentGroup, "foo");
          }
        }
      }

      `
      <Test>
        {% if(includeContent) { %}
          <:foo>foo</:foo>
        {% } %}
      </Test>
      `;
      const refreshFn = render(
        hostDiv,
        (rf: RenderFlags, includeContent: boolean) => {
          if (rf & RenderFlags.Create) {
            componentStart(0, "test", Test);
            {
              container(1);
            }
            componentEnd(0);
          }
          if (rf & RenderFlags.Update) {
            containerRefreshStart(1);
            {
              if (includeContent) {
                view(1, 0, (rf: RenderFlags) => {
                  if (rf & RenderFlags.Create) {
                    slotableStart(0, "foo");
                    {
                      text(1, "foo");
                    }
                    slotableEnd(0);
                  }
                });
              }
            }
            containerRefreshEnd(1);
            componentRefresh(0);
          }
        },
        false
      );

      expect(hostDiv.innerHTML).toBe("<test><!--slot 0--></test>");

      refreshFn(true);
      expect(hostDiv.innerHTML).toBe("<test>foo<!--slot 0--></test>");

      refreshFn(true);
      expect(hostDiv.innerHTML).toBe("<test>foo<!--slot 0--></test>");

      refreshFn(false);
      expect(hostDiv.innerHTML).toBe("<test><!--slot 0--></test>");
    });

    it("should support multiple conditional named slottables", () => {
      `<x-slot name="item"></x-slot>`;
      class Test {
        render(rf: RenderFlags, ctx: Test, $contentGroup: VNode) {
          if (rf & RenderFlags.Create) {
            slot(0);
          }
          if (rf & RenderFlags.Update) {
            slotRefresh(0, $contentGroup, "item");
          }
        }
      }

      `
      <Test>
        {% if(includeContent) { %}
          <:item>foo</:item>
          <:item>bar</:item>
        {% } %}
      </Test>
      `;
      const refreshFn = render(
        hostDiv,
        (rf: RenderFlags, includeContent: boolean) => {
          if (rf & RenderFlags.Create) {
            componentStart(0, "test", Test);
            {
              container(1);
            }
            componentEnd(0);
          }
          if (rf & RenderFlags.Update) {
            containerRefreshStart(1);
            {
              if (includeContent) {
                view(1, 0, (rf: RenderFlags) => {
                  if (rf & RenderFlags.Create) {
                    slotableStart(0, "item");
                    {
                      text(1, "foo");
                    }
                    slotableEnd(0);
                    slotableStart(2, "item");
                    {
                      text(3, "bar");
                    }
                    slotableEnd(2);
                  }
                });
              }
            }
            containerRefreshEnd(1);
            componentRefresh(0);
          }
        },
        false
      );

      expect(hostDiv.innerHTML).toBe("<test><!--slot 0--></test>");

      refreshFn(true);
      expect(hostDiv.innerHTML).toBe("<test>foobar<!--slot 0--></test>");

      refreshFn(true);
      expect(hostDiv.innerHTML).toBe("<test>foobar<!--slot 0--></test>");

      refreshFn(false);
      expect(hostDiv.innerHTML).toBe("<test><!--slot 0--></test>");
    });

    it("should support multiple conditional named slottables in different containers", () => {
      `<x-slot name="item"></x-slot>`;
      class Test {
        render(rf: RenderFlags, ctx: Test, $contentGroup: VNode) {
          if (rf & RenderFlags.Create) {
            slot(0);
          }
          if (rf & RenderFlags.Update) {
            slotRefresh(0, $contentGroup, "item");
          }
        }
      }

      `
      <Test>
        {% if(includeContent) { %}
          <:item>bar</:item>
        {% } %}
        {% if(includeContent) { %}
          <:item>bar</:item>
        {% } %}
      </Test>
      `;
      const refreshFn = render(
        hostDiv,
        (rf: RenderFlags, includeContent: boolean) => {
          if (rf & RenderFlags.Create) {
            componentStart(0, "test", Test);
            {
              container(1);
              container(2);
            }
            componentEnd(0);
          }
          if (rf & RenderFlags.Update) {
            containerRefreshStart(1);
            {
              if (includeContent) {
                view(1, 0, (rf: RenderFlags) => {
                  if (rf & RenderFlags.Create) {
                    slotableStart(0, "item");
                    {
                      text(1, "foo");
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
                view(2, 0, (rf: RenderFlags) => {
                  if (rf & RenderFlags.Create) {
                    slotableStart(0, "item");
                    {
                      text(1, "bar");
                    }
                    slotableEnd(0);
                  }
                });
              }
            }
            containerRefreshEnd(2);
            componentRefresh(0);
          }
        },
        false
      );

      expect(hostDiv.innerHTML).toBe("<test><!--slot 0--></test>");

      refreshFn(true);
      expect(hostDiv.innerHTML).toBe("<test>foobar<!--slot 0--></test>");

      refreshFn(true);
      expect(hostDiv.innerHTML).toBe("<test>foobar<!--slot 0--></test>");

      refreshFn(false);
      expect(hostDiv.innerHTML).toBe("<test><!--slot 0--></test>");
    });

    it("should support multiple conditional named slottables in nested containers", () => {
      `<x-slot name="item"></x-slot>`;
      class Test {
        render(rf: RenderFlags, ctx: Test, $contentGroup: VNode) {
          if (rf & RenderFlags.Create) {
            slot(0);
          }
          if (rf & RenderFlags.Update) {
            slotRefresh(0, $contentGroup, "item");
          }
        }
      }

      `
      <Test>
        {% 
        if(includeContent) {
          if(includeContent) { %}
            <:item>foo</:item>
        {%} 
        } %}
      </Test>
      `;
      const refreshFn = render(
        hostDiv,
        (rf: RenderFlags, includeContent: boolean) => {
          if (rf & RenderFlags.Create) {
            componentStart(0, "test", Test);
            {
              container(1);
            }
            componentEnd(0);
          }
          if (rf & RenderFlags.Update) {
            containerRefreshStart(1);
            {
              if (includeContent) {
                view(1, 0, (rf: RenderFlags) => {
                  if (rf & RenderFlags.Create) {
                    container(0);
                  }
                  if (rf & RenderFlags.Update) {
                    containerRefreshStart(0);
                    if (includeContent) {
                      view(0, 0, (rf: RenderFlags) => {
                        if (rf & RenderFlags.Create) {
                          slotableStart(0, "item");
                          {
                            text(1, "foo");
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
        },
        false
      );

      expect(hostDiv.innerHTML).toBe("<test><!--slot 0--></test>");

      refreshFn(true);
      expect(hostDiv.innerHTML).toBe("<test>foo<!--slot 0--></test>");

      refreshFn(true);
      expect(hostDiv.innerHTML).toBe("<test>foo<!--slot 0--></test>");

      refreshFn(false);
      expect(hostDiv.innerHTML).toBe("<test><!--slot 0--></test>");
    });

    it("should support re-projection of default content", () => {
      `
      <div class="header">
        <x-slot name="header"></x-slot>
      </div>
      <div class="body">
        <x-slot name="body"></x-slot>
      </div>
      `;
      class Card {
        render(rf: RenderFlags, ctx: Card, contentGroup: VNode) {
          if (rf & RenderFlags.Create) {
            elementStart(0, "div", ["class", "header"]);
            slot(1);
            elementEnd(0);
            elementStart(2, "div", ["class", "body"]);
            slot(3);
            elementEnd(2);
          }
          if (rf & RenderFlags.Update) {
            slotRefresh(1, contentGroup, "header");
            slotRefresh(3, contentGroup, "body");
          }
        }
      }

      `<Card>
        <:header>{=ctx.title}</:header>
        <:body>
          <div>
            <x-slot></x-slot>
          </div>
        </:body>
      </Card>`;
      class SimpleCard {
        title: string;
        render(rf: RenderFlags, ctx: SimpleCard, contentGroup: VNode) {
          if (rf & RenderFlags.Create) {
            componentStart(0, "card", Card);
            {
              slotableStart(1, "header");
              {
                text(2);
              }
              slotableEnd(1);
              slotableStart(3, "body");
              {
                elementStart(4, "div");
                {
                  slot(5);
                }
                elementEnd(4);
              }
              slotableEnd(3);
            }
            componentEnd(0);
          }
          if (rf & RenderFlags.Update) {
            textContent(2, ctx.title);
            slotRefresh(5, contentGroup);
            componentRefresh(0);
          }
        }
      }

      `<SimpleCard [title]="{=titleExp}">Content</SimpleCard>`;
      function app(rf: RenderFlags, titleExp: string) {
        if (rf & RenderFlags.Create) {
          componentStart(0, "simple-card", SimpleCard);
          text(1, "Content");
          componentEnd(0);
        }
        if (rf & RenderFlags.Update) {
          const cmptInstance = load<SimpleCard>(0, 0);
          input(0, 1, titleExp) && (cmptInstance.title = titleExp);
          componentRefresh(0);
        }
      }

      const refreshFn = render(hostDiv, app, "Title");
      expect(hostDiv.innerHTML).toBe(
        `<simple-card><card><div class="header">Title<!--slot 1--></div><div class="body"><div>Content<!--slot 5--></div><!--slot 3--></div></card></simple-card>`
      );

      refreshFn("New Title");
      expect(hostDiv.innerHTML).toBe(
        `<simple-card><card><div class="header">New Title<!--slot 1--></div><div class="body"><div>Content<!--slot 5--></div><!--slot 3--></div></card></simple-card>`
      );
    });

    it("should support re-projection of default content at the root of a slottable", () => {
      `
      <div class="header">
        <x-slot name="header"></x-slot>
      </div>
      <div class="body">
        <x-slot name="body"></x-slot>
      </div>
      `;
      class Card {
        render(rf: RenderFlags, ctx: Card, contentGroup: VNode) {
          if (rf & RenderFlags.Create) {
            elementStart(0, "div", ["class", "header"]);
            slot(1);
            elementEnd(0);
            elementStart(2, "div", ["class", "body"]);
            slot(3);
            elementEnd(2);
          }
          if (rf & RenderFlags.Update) {
            slotRefresh(1, contentGroup, "header");
            slotRefresh(3, contentGroup, "body");
          }
        }
      }

      `<Card>
        <:header>{=ctx.title}</:header>
        <:body>
          <x-slot></x-slot>
        </:body>
      </Card>`;
      class SimpleCard {
        title: string;
        render(rf: RenderFlags, ctx: SimpleCard, contentGroup: VNode) {
          if (rf & RenderFlags.Create) {
            componentStart(0, "card", Card);
            {
              slotableStart(1, "header");
              {
                text(2);
              }
              slotableEnd(1);
              slotableStart(3, "body");
              {
                slot(4);
              }
              slotableEnd(3);
            }
            componentEnd(0);
          }
          if (rf & RenderFlags.Update) {
            textContent(2, ctx.title);
            slotRefresh(4, contentGroup);
            componentRefresh(0);
          }
        }
      }

      `<SimpleCard [title]="{=titleExp}">Content</SimpleCard>`;
      function app(rf: RenderFlags, titleExp: string) {
        if (rf & RenderFlags.Create) {
          componentStart(0, "simple-card", SimpleCard);
          text(1, "Content");
          componentEnd(0);
        }
        if (rf & RenderFlags.Update) {
          const cmptInstance = load<SimpleCard>(0, 0);
          input(0, 1, titleExp) && (cmptInstance.title = titleExp);
          componentRefresh(0);
        }
      }

      const refreshFn = render(hostDiv, app, "Title");
      expect(hostDiv.innerHTML).toBe(
        `<simple-card><card><div class="header">Title<!--slot 1--></div><div class="body">Content<!--slot 4--><!--slot 3--></div></card></simple-card>`
      );

      refreshFn("New Title");
      expect(hostDiv.innerHTML).toBe(
        `<simple-card><card><div class="header">New Title<!--slot 1--></div><div class="body">Content<!--slot 4--><!--slot 3--></div></card></simple-card>`
      );
    });

    it("should support re-projection of named content at the root of a slottable", () => {
      `
      <div class="header">
        <x-slot name="header"></x-slot>
      </div>
      <div class="body">
        <x-slot name="body"></x-slot>
      </div>
      `;
      class Card {
        render(rf: RenderFlags, ctx: Card, contentGroup: VNode) {
          if (rf & RenderFlags.Create) {
            elementStart(0, "div", ["class", "header"]);
            slot(1);
            elementEnd(0);
            elementStart(2, "div", ["class", "body"]);
            slot(3);
            elementEnd(2);
          }
          if (rf & RenderFlags.Update) {
            slotRefresh(1, contentGroup, "header");
            slotRefresh(3, contentGroup, "body");
          }
        }
      }

      `<Card>
        <:header>{=ctx.title}</:header>
        <:body>
          <x-slot name="body"></x-slot>
        </:body>
      </Card>`;
      class SimpleCard {
        title: string;
        render(rf: RenderFlags, ctx: SimpleCard, contentGroup: VNode) {
          if (rf & RenderFlags.Create) {
            componentStart(0, "card", Card);
            {
              slotableStart(1, "header");
              {
                text(2);
              }
              slotableEnd(1);
              slotableStart(3, "body");
              {
                slot(4);
              }
              slotableEnd(3);
            }
            componentEnd(0);
          }
          if (rf & RenderFlags.Update) {
            textContent(2, ctx.title);
            slotRefresh(4, contentGroup, "body");
            componentRefresh(0);
          }
        }
      }

      `<SimpleCard [title]="{=titleExp}">
        <:body>
          Content
        </:body>
      </SimpleCard>`;
      function app(rf: RenderFlags, titleExp: string) {
        if (rf & RenderFlags.Create) {
          componentStart(0, "simple-card", SimpleCard);
          {
            slotableStart(1, "body");
            {
              text(2, "Content");
            }
            slotableEnd(1);
          }
          componentEnd(0);
        }
        if (rf & RenderFlags.Update) {
          const cmptInstance = load<SimpleCard>(0, 0);
          input(0, 1, titleExp) && (cmptInstance.title = titleExp);
          componentRefresh(0);
        }
      }

      const refreshFn = render(hostDiv, app, "Title");
      expect(hostDiv.innerHTML).toBe(
        `<simple-card><card><div class="header">Title<!--slot 1--></div><div class="body">Content<!--slot 4--><!--slot 3--></div></card></simple-card>`
      );

      refreshFn("New Title");
      expect(hostDiv.innerHTML).toBe(
        `<simple-card><card><div class="header">New Title<!--slot 1--></div><div class="body">Content<!--slot 4--><!--slot 3--></div></card></simple-card>`
      );
    });

    it("should support re-projection of named content at the root of a container in slotable", () => {
      `
      <div class="header">
        <x-slot name="header"></x-slot>
      </div>
      <div class="body">
        <x-slot name="body"></x-slot>
      </div>
      `;
      class Card {
        render(rf: RenderFlags, ctx: Card, contentGroup: VNode) {
          if (rf & RenderFlags.Create) {
            elementStart(0, "div", ["class", "header"]);
            slot(1);
            elementEnd(0);
            elementStart(2, "div", ["class", "body"]);
            slot(3);
            elementEnd(2);
          }
          if (rf & RenderFlags.Update) {
            slotRefresh(1, contentGroup, "header");
            slotRefresh(3, contentGroup, "body");
          }
        }
      }

      `<Card>
        <:header>{=ctx.title}</:header>
        <:body>
          {% if (showBody) { %}
            <x-slot name="body"></x-slot>
          {% } %} 
        </:body>
      </Card>`;
      class SimpleCard {
        showBody = false;
        title: string;
        render(rf: RenderFlags, ctx: SimpleCard, contentGroup: VNode) {
          if (rf & RenderFlags.Create) {
            componentStart(0, "card", Card);
            {
              slotableStart(1, "header");
              {
                text(2);
              }
              slotableEnd(1);
              slotableStart(3, "body");
              {
                container(4);
              }
              slotableEnd(3);
            }
            componentEnd(0);
          }
          if (rf & RenderFlags.Update) {
            textContent(2, ctx.title);
            containerRefreshStart(4);
            {
              if (this.showBody) {
                view(4, 0, function(rf: RenderFlags, ctx: SimpleCard) {
                  if (rf & RenderFlags.Create) {
                    slot(0);
                  }
                  if (rf & RenderFlags.Update) {
                    slotRefresh(0, contentGroup, "body");
                  }
                });
              }
            }
            containerRefreshEnd(4);
            componentRefresh(0);
          }
        }
      }

      `<SimpleCard [title]="{=titleExp}">
        <:body>
          Content
        </:body>
      </SimpleCard>`;
      function app(rf: RenderFlags, ctx: { titleExp: string; showBody: boolean }) {
        if (rf & RenderFlags.Create) {
          componentStart(0, "simple-card", SimpleCard);
          {
            slotableStart(1, "body");
            {
              text(2, "Content");
            }
            slotableEnd(1);
          }
          componentEnd(0);
        }
        if (rf & RenderFlags.Update) {
          const cmptInstance = load<SimpleCard>(0, 0);
          input(0, 1, ctx.titleExp) && (cmptInstance.title = ctx.titleExp);
          input(0, 2, ctx.showBody) && (cmptInstance.showBody = ctx.showBody);
          componentRefresh(0);
        }
      }

      const refreshFn = render(hostDiv, app, { titleExp: "Title", showBody: false });
      expect(hostDiv.innerHTML).toBe(
        `<simple-card><card><div class="header">Title<!--slot 1--></div><div class="body"><!--container 4--><!--slot 3--></div></card></simple-card>`
      );

      refreshFn({ titleExp: "New Title", showBody: true });
      expect(hostDiv.innerHTML).toBe(
        `<simple-card><card><div class="header">New Title<!--slot 1--></div><div class="body">Content<!--slot 0--><!--container 4--><!--slot 3--></div></card></simple-card>`
      );

      refreshFn({ titleExp: "Old Title", showBody: false });
      expect(hostDiv.innerHTML).toBe(
        `<simple-card><card><div class="header">Old Title<!--slot 1--></div><div class="body"><!--container 4--><!--slot 3--></div></card></simple-card>`
      );
    });
  });

  describe("directives", () => {
    it("should support directives", () => {
      class IdDirective {
        constructor(private _nativeHost) {}

        refresh() {
          this._nativeHost.id = "id from directive";
        }
      }

      render(hostDiv, (rf: RenderFlags, ctx) => {
        if (rf & RenderFlags.Create) {
          element(0, "div");
          directive(0, 0, IdDirective);
        }
        if (rf & RenderFlags.Update) {
          directiveRefresh(0, 0);
        }
      });

      expect(hostDiv.innerHTML).toBe('<div id="id from directive"></div>');
    });

    it("should support directives with inputs", () => {
      class IdDirective {
        name: string;

        constructor(private _nativeHost) {}

        refresh() {
          this._nativeHost.id = `id from ${this.name}`;
        }
      }

      render(
        hostDiv,
        (rf: RenderFlags, name: string) => {
          if (rf & RenderFlags.Create) {
            element(0, "div");
            directive(0, 0, IdDirective);
          }
          if (rf & RenderFlags.Update) {
            const directiveInstance = load<IdDirective>(0, 0);
            input(0, 1, name) && (directiveInstance.name = name);
            directiveRefresh(0, 0);
          }
        },
        "test directive"
      );

      expect(hostDiv.innerHTML).toBe('<div id="id from test directive"></div>');
    });

    it("should support directives with outputs", () => {
      class Ticker {
        counter = 0;
        out: ($event: any) => void;

        tick() {
          if (this.out) {
            this.out(++this.counter);
          }
        }
      }

      let ticker: Ticker;
      let model = {
        count: 0
      };

      `
      <div @ticker (@ticker.out)="ctx.count = $event"></div>
      {{ctx.count}}
      `;
      const refreshFn = render(
        hostDiv,
        (rf: RenderFlags, ctx: { count: number }) => {
          if (rf & RenderFlags.Create) {
            element(0, "div");
            directive(0, 0, Ticker);
            text(1);
          }
          if (rf & RenderFlags.Update) {
            const directiveInstance = (ticker = load<Ticker>(0, 0));
            // PERF(pk): once again, a closure on each and every change detection :-/
            directiveInstance.out = function($event) {
              ctx.count = $event;
            };
            directiveRefresh(0, 0);
            textContent(1, `${ctx.count}`);
          }
        },
        model
      );

      expect(hostDiv.innerHTML).toBe("<div></div>0");

      ticker.tick();
      refreshFn(model);
      expect(hostDiv.innerHTML).toBe("<div></div>1");

      ticker.tick();
      ticker.tick();
      refreshFn(model);
      expect(hostDiv.innerHTML).toBe("<div></div>3");
    });
  });

  describe("refs", () => {
    it("should support single reference to an element", () => {
      `
      <input #i value="World">
      Hello, {=i.value}!
      `;
      function tpl(rf: RenderFlags) {
        if (rf & RenderFlags.Create) {
          element(0, "input", ["value", "World"]);
          text(1);
        }
        if (rf & RenderFlags.Update) {
          const i = loadElementRef(0);
          textContent(1, `Hello, ${i.value}!`);
        }
      }

      const refreshFn = render(hostDiv, tpl);
      expect(hostDiv.innerHTML).toBe('<input value="World">Hello, World!');

      refreshFn();
      expect(hostDiv.innerHTML).toBe('<input value="World">Hello, World!');
    });

    it("should support single reference to a directive", () => {
      class Lorem {
        constructor(private _element) {}

        generate() {
          this._element.textContent = "Lorem ipsum";
        }
      }

      `
      <div @Lorem #l="@Lorem"></div>
      <button (click)="l.generate()"></button>
      `;
      function tpl(rf: RenderFlags) {
        if (rf & RenderFlags.Create) {
          element(0, "div");
          directive(0, 0, Lorem);

          element(1, "button");
          listener(1, 0, "click");
        }
        if (rf & RenderFlags.Update) {
          const l = load<Lorem>(0, 0);
          directiveRefresh(0, 0);
          listenerRefresh(1, 0, function($event) {
            l.generate();
          });
        }
      }

      const refreshFn = render(hostDiv, tpl);
      expect(hostDiv.innerHTML).toBe("<div></div><button></button>");

      hostDiv.querySelector("button").click();
      refreshFn();
      expect(hostDiv.innerHTML).toBe("<div>Lorem ipsum</div><button></button>");
    });
  });
});
