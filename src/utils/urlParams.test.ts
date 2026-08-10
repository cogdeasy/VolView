import { describe, it, expect, vi, afterEach } from 'vitest';
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

  it('ignores a valueless urls, keeping the rest of the launch', () => {
    const result = normalizeUrlParams({
      urls: true,
      save: 'https://example.com/save',
    } as unknown as Parameters<typeof normalizeUrlParams>[0]);
    expect(result.urls).toBeUndefined();
    expect(result.save).toBe('https://example.com/save');
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

  const parse = (raw: Parameters<typeof normalizeUrlParams>[0]) =>
    [raw, normalizeUrlParams(raw)] as const;

  it('opens the deployment default when the tab names no urls', () => {
    const result = withDefaultUrls(...parse({}), defaults);
    expect(result.urls).toEqual(['https://example.com/demo.zip']);
    expect(result.names).toEqual(['Demo Study']);
  });

  it('leaves an explicit urls= untouched', () => {
    const result = withDefaultUrls(
      ...parse({ urls: 'https://example.com/patient.zip' }),
      defaults
    );
    expect(result.urls).toEqual(['https://example.com/patient.zip']);
    expect(result.names).toBeUndefined();
  });

  it('shows nothing rather than the default when every urls= was rejected', () => {
    const result = withDefaultUrls(...parse({ urls: 'http://[' }), defaults);
    expect(result.urls).toBeUndefined();
  });

  it('shows nothing for an empty urls=, which still names an intent', () => {
    const result = withDefaultUrls(...parse({ urls: '' }), defaults);
    expect(result.urls).toBeUndefined();
  });

  it('drops a lone names=, which labels the urls= it arrived with', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = withDefaultUrls(...parse({ names: 'Patient Study' }), {
      urls: defaults.urls,
    });
    expect(result.urls).toEqual(['https://example.com/demo.zip']);
    expect(result.names).toBeUndefined();
    // Silence here would leave an integrator staring at a link whose label
    // vanished.
    expect(error.mock.calls[0][0].message).toContain('Patient Study');

    error.mockRestore();
  });

  it('keeps other launch params when the default applies', () => {
    const result = withDefaultUrls(
      ...parse({ save: 'https://example.com/save' }),
      { urls: defaults.urls }
    );
    expect(result.urls).toEqual(['https://example.com/demo.zip']);
    expect(result.save).toBe('https://example.com/save');
  });

  it('is a no-op for an unconfigured or unparseable default', () => {
    expect(withDefaultUrls(...parse({}), {})).toEqual({});
    expect(withDefaultUrls(...parse({}), { urls: '' })).toEqual({});
  });
});

// The rules above are only as good as what vtkURLExtract actually hands over
// for each query string, so drive the real boot path rather than the parser.
describe('readLaunchParams', () => {
  const DEMO = 'https://example.com/demo.zip';

  const launch = async (search: string, defaultUrls = DEMO) => {
    vi.stubEnv('VITE_DEFAULT_URLS', defaultUrls);
    vi.stubEnv('VITE_DEFAULT_NAMES', 'Demo Study');
    window.history.replaceState(null, '', `/${search}`);
    vi.resetModules();
    const { readLaunchParams } = await import('./urlParams');
    return readLaunchParams();
  };

  afterEach(() => {
    vi.unstubAllEnvs();
    window.history.replaceState(null, '', '/');
  });

  it('opens the deployment default on a bare visit', async () => {
    expect((await launch('')).urls).toEqual([DEMO]);
  });

  it('leaves the default alone when unconfigured', async () => {
    expect(await launch('', '')).toEqual({});
  });

  it.each(['?urls=', '?urls', '?urls=http://['])(
    'shows nothing for %s, which names an intent the default must not answer',
    async (search) => {
      expect((await launch(search)).urls).toBeUndefined();
    }
  );

  it('keeps save= when urls= carries no value', async () => {
    const params = await launch('?urls&save=https://example.com/save');
    expect(params.urls).toBeUndefined();
    expect(params.save).toBe('https://example.com/save');
  });

  it('lets an explicit urls= win', async () => {
    const params = await launch('?urls=https://example.com/patient.zip');
    expect(params.urls).toEqual(['https://example.com/patient.zip']);
    expect(params.names).toBeUndefined();
  });
});
