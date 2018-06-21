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

});