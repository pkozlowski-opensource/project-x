import {
  NodeType,
  AttributeNode,
  ElementStartNode,
  ElementEndNode,
  AttributeParser,
  ElementStartParser,
  ElementEndParser,
  MarkupNode,
  MarkupParser
} from './lexer';

describe('markup parser', () => {
  describe('attribute', () => {
    function parseAttribute(markup: string): AttributeNode {
      const map = new AttributeParser(markup);
      return map.parse();
    }

    it('should parse single boolean attribute', () => {
      const token = parseAttribute('readonly');

      expect(token.type).toBe(NodeType.ATTRIBUTE);
      expect(token.name).toBe('readonly');
      expect(token.value).toBeNull();
    });

    it('should parse an attribute with a quoted string value', () => {
      const token = parseAttribute('id="foo"');

      expect(token.type).toBe(NodeType.ATTRIBUTE);
      expect(token.name).toBe('id');
      expect(token.value.value).toBe('foo');
    });

    it('should parse an attribute with a quoted value', () => {
      const token = parseAttribute('id="something 6"');

      expect(token.type).toBe(NodeType.ATTRIBUTE);
      expect(token.name).toBe('id');
      expect(token.value.value).toBe('something 6');
    });

    it('should parse an attribute with a quoted value and spaces arround equal sign', () => {
      const token = parseAttribute('id =  "something 6"');

      expect(token.type).toBe(NodeType.ATTRIBUTE);
      expect(token.name).toBe('id');
      expect(token.value.value).toBe('something 6');
    });

    // TODO: attr={{expr}}
    // TODO: attr='val'
    // TODO: attr="\"""
    // TODO: attr=true / attr=false
    // TODO: attr=5
    // TODO: attr=
    // TODO: attr="
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
            <h1>Hello, World!</h1>
        `);

      expect(token.children.length).toBe(5);

      expect(token.children[0].type).toBe(NodeType.TEXT);
      expect(token.children[1].type).toBe(NodeType.ELEMENT_START);
      expect(token.children[2].type).toBe(NodeType.TEXT);
      expect(token.children[3].type).toBe(NodeType.ELEMENT_END);
      expect(token.children[4].type).toBe(NodeType.TEXT);
    });
  });
});
