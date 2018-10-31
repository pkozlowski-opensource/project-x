import {parseMarkup} from './compiler';

describe('markup parser', () => {
    
    it('should parse text node', () => {
        const nodes = parseMarkup('Hello, World');

        expect(nodes.length).toBe(1);
        expect(nodes[0].value).toBe('Hello, World');
    });

    xit('should parse a single element node', () => {
        const nodes = parseMarkup('<div></div>');

        expect(nodes.length).toBe(1);
        expect(nodes[0].tagName).toBe('div');
    });

});