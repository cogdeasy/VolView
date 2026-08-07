import { describe, it, expect } from 'vitest';
import { normalizeUrlParams, withDefaultUrls } from './urlParams';

describe('normalizeUrlParams', () => {
  it('handles single URL as string', () => {
    const result = normalizeUrlParams({
      urls: 'https://example.com/file.dcm',
    });
    expect(result.urls).toEqual(['https://example.com/file.dcm']);
  });

  it('handles array of URLs', () => {
    const result = normalizeUrlParams({
      urls: ['https://example.com/file1.dcm', 'https://example.com/file2.dcm'],
    });
    expect(result.urls).toEqual([
      'https://example.com/file1.dcm',
      'https://example.com/file2.dcm',
    ]);
  });

  it('handles bracket notation string', () => {
    const result = normalizeUrlParams({
      urls: '[https://example.com/file1.dcm,https://example.com/file2.dcm]',
    });
    expect(result.urls).toEqual([
      'https://example.com/file1.dcm',
      'https://example.com/file2.dcm',
    ]);
  });

  it('allows relative URLs (they resolve against base URL)', () => {
    const result = normalizeUrlParams({
      urls: ['https://example.com/valid.dcm', 'relative-path', 'another/path'],
    });
    expect(result.urls).toEqual([
      'https://example.com/valid.dcm',
      'relative-path',
      'another/path',
    ]);
  });

  it('handles URLs with query parameters', () => {
    const result = normalizeUrlParams({
      urls: 'https://api.example.com/getImage?id=123&format=dcm',
    });
    expect(result.urls).toEqual([
      'https://api.example.com/getImage?id=123&format=dcm',
    ]);
  });

  it('preserves commas in query strings', () => {
    const result = normalizeUrlParams({
      urls: '/api/v1/folder/123/volview?items=id1,id2,id3',
    });
    expect(result.urls).toEqual([
      '/api/v1/folder/123/volview?items=id1,id2,id3',
    ]);
  });

  it('handles config and names parameters', () => {
    const result = normalizeUrlParams({
      config: 'https://example.com/config.json',
      names: ['Image 1', 'Image 2'],
    });
    expect(result.config).toEqual(['https://example.com/config.json']);
    expect(result.names).toEqual(['Image 1', 'Image 2']);
  });

  it('treats relative paths as valid URLs', () => {
    const result = normalizeUrlParams({
      urls: 'relative-path',
    });
    expect(result.urls).toEqual(['relative-path']);
  });

  it('handles save parameter', () => {
    const result = normalizeUrlParams({
      save: 'https://example.com/save',
    });
    expect(result.save).toBe('https://example.com/save');
  });

  it('preserves save parameter as array', () => {
    const result = normalizeUrlParams({
      save: ['https://example.com/save1', 'https://example.com/save2'],
    });
    expect(result.save).toEqual([
      'https://example.com/save1',
      'https://example.com/save2',
    ]);
  });
});

describe('withDefaultUrls', () => {
  const defaults = {
    urls: 'https://example.com/demo.zip',
    names: 'Demo Study',
  };

  it('opens the deployment default when the tab names no urls', () => {
    const result = withDefaultUrls({}, defaults);
    expect(result.urls).toEqual(['https://example.com/demo.zip']);
    expect(result.names).toEqual(['Demo Study']);
  });

  it('leaves an explicit urls= untouched', () => {
    const result = withDefaultUrls(
      { urls: ['https://example.com/patient.zip'] },
      defaults
    );
    expect(result.urls).toEqual(['https://example.com/patient.zip']);
    expect(result.names).toBeUndefined();
  });

  it('keeps other launch params when the default applies', () => {
    const result = withDefaultUrls(
      { save: 'https://example.com/save' },
      {
        urls: defaults.urls,
      }
    );
    expect(result.urls).toEqual(['https://example.com/demo.zip']);
    expect(result.save).toBe('https://example.com/save');
  });

  it('is a no-op for an unconfigured or unparseable default', () => {
    expect(withDefaultUrls({}, {})).toEqual({});
    expect(withDefaultUrls({}, { urls: '' })).toEqual({});
  });
});
