import {
  Node,
  NodeType,
  AttributeNode,
  ElementStartNode,
  ElementEndNode,
  TextNode,
  MarkupNode,
  QuotedStringParser,
  AttributeParser,
  BindingParser,
  ElementStartParser,
  ElementEndParser,
  InterpolatedTextParser,
  MarkupParser
} from './markup_parser';

describe('markup parser', () => {
  describe('strings', () => {
    function parseString(markup: string): string {
      const node = new QuotedStringParser(markup).parse();
      expect(node.type).toBe(NodeType.STRING);
      return node.value;
    }

    it('should parse double-quoted string', () => {
      expect(parseString(`"hi!"    `)).toBe('hi!');
    });

    it('should parse escaped double-quoted string', () => {
      expect(parseString(`"Hello, \\"World\\""`)).toBe('Hello, "World"');
    });

    it('should parse single-quoted string', () => {
      expect(parseString(`'hi!'  `)).toBe('hi!');
    });

    it('should parse escaped single-quoted string', () => {
      expect(parseString(`'Hello, \\'World\\''  `)).toBe(`Hello, 'World'`);
    });
  });

  describe('bindings', () => {
    function parseBinding(markup: string): string {
      const node = new BindingParser(markup).parse();
      expect(node.type).toBe(NodeType.BINDING);
      return node.value;
    }

    it('should parse literals', () => {
      expect(parseBinding('{{"hi!"}}')).toBe('"hi!"');
      expect(parseBinding('{{false}}')).toBe('false');
      expect(parseBinding('{{0}}')).toBe('0');
    });

    it('should parse expressions with no curly', () => {
      expect(parseBinding('{{myVar.fn(arg1, arg2: type)}}')).toBe('myVar.fn(arg1, arg2: type)');
    });

    it('should parse expressions with <', () => {
      expect(parseBinding('{{this.a < 5}}')).toBe('this.a < 5');
    });

    it('should parse expressions with object literals', () => {
      expect(parseBinding('{{{a: 5}}}')).toBe('{a: 5}');
      expect(parseBinding('{{ fn({a: {b: 5}}) }}')).toBe(' fn({a: {b: 5}}) ');
    });

    it('should parse expressions with comments', () => {
      expect(parseBinding('{{ a /* comment */ + b }}')).toBe(' a /* comment */ + b ');
    });
  });

  describe('attributes', () => {
    function parseAttribute(markup: string): AttributeNode {
      const map = new AttributeParser(markup);
      return map.parse();
    }

    describe('static attributes', () => {
      // TODO: attr='val'
      // TODO: attr="\"""

      it('should parse single boolean attribute', () => {
        const token = parseAttribute('readonly');

        expect(token.type).toBe(NodeType.ATTRIBUTE_STATIC);
        expect(token.name).toBe('readonly');
        expect(token.value).toBeNull();
      });

      it('should parse single boolean attribute with mixed casing', () => {
        const token = parseAttribute('ReadonlY');

        expect(token.type).toBe(NodeType.ATTRIBUTE_STATIC);
        expect(token.name).toBe('ReadonlY');
        expect(token.value).toBeNull();
      });

      it('should parse an attribute with a quoted string value', () => {
        const token = parseAttribute('id="foo"');

        expect(token.type).toBe(NodeType.ATTRIBUTE_STATIC);
        expect(token.name).toBe('id');
        expect(token.value).toBe('foo');
      });

      it('should parse an attribute with a quoted value', () => {
        const token = parseAttribute('id="something 6"');

        expect(token.type).toBe(NodeType.ATTRIBUTE_STATIC);
        expect(token.name).toBe('id');
        expect(token.value).toBe('something 6');
      });

      it('should parse an attribute with a quoted value and spaces arround equal sign', () => {
        const token = parseAttribute('id =  "something 6"');

        expect(token.type).toBe(NodeType.ATTRIBUTE_STATIC);
        expect(token.name).toBe('id');
        expect(token.value).toBe('something 6');
      });
    });

    describe('bindings', () => {
      it('should parse an attribute with binding', () => {
        const token = parseAttribute('value={{expression}}');

        expect(token.type).toBe(NodeType.ATTRIBUTE_BOUND);
        expect(token.name).toBe('value');
        expect(token.value).toBe('expression');
      });
    });

    describe('event handlers', () => {
      it('should parse an attribute that is an event handler', () => {
        const token = parseAttribute('(click)="doSth()"');

        expect(token.type).toBe(NodeType.ATTRIBUTE_STATIC);
        expect(token.name).toBe('(click)');
        expect(token.value).toBe('doSth()');
      });
    });

    describe('properties', () => {
      it('should parse static properties', () => {
        const token = parseAttribute('[value]="initial"');

        expect(token.type).toBe(NodeType.ATTRIBUTE_STATIC);
        expect(token.name).toBe('[value]');
        expect(token.value).toBe('initial');
      });

      it('should parse bound properties', () => {
        const token = parseAttribute('[value]={{expr}}');

        expect(token.type).toBe(NodeType.ATTRIBUTE_BOUND);
        expect(token.name).toBe('[value]');
        expect(token.value).toBe('expr');
      });
    });
  });

  describe('element start', () => {
    function parseElementStart(markup: string): ElementStartNode {
      const map = new ElementStartParser(markup);
      return map.parse();
    }

    it('should parse element without attributes', () => {
      const token = parseElementStart('<div>');

      expect(token.type).toBe(NodeType.ELEMENT_START);
      expect(token.value).toBe('div');
    });

    it('should parse element without attributes and whitespaces before closing bracket', () => {
      const token = parseElementStart('<div  >');

      expect(token.type).toBe(NodeType.ELEMENT_START);
      expect(token.value).toBe('div');
    });

    it('should parse element boolean attributes', () => {
      const token = parseElementStart('<input readonly checked>');

      expect(token.type).toBe(NodeType.ELEMENT_START);
      expect(token.value).toBe('input');
      expect(token.attributes.length).toBe(2);
    });

    it('should parse element with string-quoted attributes', () => {
      const token = parseElementStart('<input type="checkbox">');

      expect(token.type).toBe(NodeType.ELEMENT_START);
      expect(token.value).toBe('input');
      expect(token.attributes.length).toBe(1);
    });

    it('should parse element with string-quoted attributes where name has mixed case', () => {
      const token = parseElementStart('<input TYpe="checkbox">');

      expect(token.attributes.length).toBe(1);
    });

    it('should parse element with string-quoted and boolean attributes', () => {
      const token = parseElementStart('<input type="checkbox" checked id="myInput" >');

      expect(token.type).toBe(NodeType.ELEMENT_START);
      expect(token.value).toBe('input');
      expect(token.attributes.length).toBe(3);
    });
  });

  describe('element end', () => {
    function parseElementEnd(markup: string): ElementEndNode {
      const map = new ElementEndParser(markup);
      return map.parse();
    }

    it('should parse element end', () => {
      const token = parseElementEnd('</div>');

      expect(token.type).toBe(NodeType.ELEMENT_END);
      expect(token.value).toBe('div');
    });

    it('should parse element end with whitespaces', () => {
      const token = parseElementEnd('</div  >');

      expect(token.type).toBe(NodeType.ELEMENT_END);
      expect(token.value).toBe('div');
    });
  });

  describe('interpolated text', () => {
    function parseInterpolation(markup: string): TextNode {
      return new InterpolatedTextParser(markup).parse();
    }

    it('should parse static text', () => {
      const token = parseInterpolation('static');

      expect(token.type).toBe(NodeType.TEXT);
      expect(token.parts.length).toBe(1);
    });

    it('should parse interpolatd text', () => {
      const token = parseInterpolation('{{expr}}');

      expect(token.type).toBe(NodeType.TEXT);
      expect(token.parts.length).toBe(1);
    });

    it('should parse mixture and interpolatd text', () => {
      const token = parseInterpolation('before {{expr}} after');

      expect(token.type).toBe(NodeType.TEXT);
      expect(token.parts.length).toBe(3);
    });
  });

  describe('markup fragment', () => {
    function parseMarkup(markup: string): MarkupNode {
      const map = new MarkupParser(markup);
      return map.parse();
    }

    it('should parse element start followed by element end', () => {
      const token = parseMarkup('<div></div>');

      expect(token.type).toBe(NodeType.MARKUP);
      expect(token.children.length).toBe(2);
    });

    it('should parse sibiling element start / end', () => {
      const token = parseMarkup('<div></div><span id="foo"></span>');

      expect(token.type).toBe(NodeType.MARKUP);
      expect(token.children.length).toBe(4);
    });

    it('should parse text nodes', () => {
      const token = parseMarkup('Hi');

      expect(token.type).toBe(NodeType.MARKUP);
      expect(token.children.length).toBe(1);
    });

    it('should parse element and text nodes', () => {
      const token = parseMarkup('<h1>Hello, World!</h1>');

      expect(token.type).toBe(NodeType.MARKUP);
      expect(token.children.length).toBe(3);

      expect(token.children[0].type).toBe(NodeType.ELEMENT_START);
      expect(token.children[1].type).toBe(NodeType.TEXT);
      expect(token.children[2].type).toBe(NodeType.ELEMENT_END);
    });

    it('should support new lines in text nodes', () => {
      const token = parseMarkup(`
            <h1>Hello, 
            World!</h1>
        `);

      expect(token.children.length).toBe(5);

      expect(token.children[0].type).toBe(NodeType.TEXT);
      expect(token.children[1].type).toBe(NodeType.ELEMENT_START);
      expect(token.children[2].type).toBe(NodeType.TEXT);
      expect(token.children[3].type).toBe(NodeType.ELEMENT_END);
      expect(token.children[4].type).toBe(NodeType.TEXT);
    });

    it('should parse a hello world example', () => {
      const token = parseMarkup(`
        Hello, {{ctx.name}}!
        <input value={{ctx.name}} (input)="ctx.name = $event.target.value">
        <button (click)="ctx.name = 'World'">Reset name</button>
      `);

      const elStartNode = token.children.filter((node: Node) => {
        return node.type === NodeType.ELEMENT_START;
      });

      expect(elStartNode.length).toBe(2);
    });
  });
});
