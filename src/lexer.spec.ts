import {lexMarkup} from './lexer';

describe('lexer', () => {

    it('should tokenize null or empty string', () => {       
        expect(lexMarkup(undefined).length).toBe(0);
        expect(lexMarkup(null).length).toBe(0);
        expect(lexMarkup('').length).toBe(0);        
    });

    it('should tokenize text', () => {       
        const tokens = lexMarkup('hi');

        expect(tokens.length).toBe(1);
        expect(tokens[0].value).toBe('hi');
    });
    
    it('should tokenize element start', () => {        
        const tokens = lexMarkup('<div');

        expect(tokens.length).toBe(1);
        expect(tokens[0].value).toBe('div');
    });
});